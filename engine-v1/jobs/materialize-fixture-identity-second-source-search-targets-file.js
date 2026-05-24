import fs from "node:fs";
import path from "node:path";

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of values) {
    const text = cleanString(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: null,
    output: null,
    date: null,
    maxQueriesPerLeague: 8,
    selfTest: false,
    pretty: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input" && argv[i + 1]) {
      args.input = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--input=")) {
      args.input = cleanString(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      args.output = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--output=")) {
      args.output = cleanString(arg.slice("--output=".length));
      continue;
    }

    if (arg === "--date" && argv[i + 1]) {
      args.date = cleanString(argv[++i]);
      continue;
    }
    if (arg.startsWith("--date=")) {
      args.date = cleanString(arg.slice("--date=".length));
      continue;
    }

    if (arg === "--max-queries-per-league" && argv[i + 1]) {
      args.maxQueriesPerLeague = readPositiveInteger(argv[++i], "--max-queries-per-league");
      continue;
    }
    if (arg.startsWith("--max-queries-per-league=")) {
      args.maxQueriesPerLeague = readPositiveInteger(arg.slice("--max-queries-per-league=".length), "--max-queries-per-league");
      continue;
    }

    if (arg === "--compact") {
      args.pretty = false;
      continue;
    }

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) {
    throw new Error("missing required --input");
  }

  if (!args.output) {
    args.output = args.input
      ? defaultOutputPath(args.input)
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-identity-second-source-search-targets.json";
  }

  return args;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/materialize-fixture-identity-second-source-search-targets-file.js --date YYYY-MM-DD --input <second-source-confirmation-tasks.json> --output <search-targets.json>",
    "",
    "Purpose:",
    "  Convert fixture identity second-source/calendar confirmation tasks into read-only search target rows.",
    "",
    "Guarantees:",
    "  - sourceFetch: false",
    "  - noFetch: true",
    "  - noUrlFetch: true",
    "  - noReviewDecisionApplied: true",
    "  - noCanonicalPromotion: true",
    "  - canonicalWrites: 0",
    "  - deploySnapshotWrites: false",
    "  - valueWrites: false",
    "  - detailsWrites: false",
    "  - productionWrite: false",
    "  - dryRun: true"
  ].join("\n"));
}

function readPositiveInteger(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return n;
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.search-targets.json`);
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolvePath(filePath), "utf8"));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

function normalizeDate(value) {
  const text = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Invalid date: ${text || "<empty>"}`);
  }
  return text;
}

function hostFromUrl(urlText) {
  try {
    return new URL(urlText).hostname;
  } catch {
    return "";
  }
}

function readOnlyGuarantees() {
  return {
    sourceFetch: false,
    noFetch: true,
    noUrlFetch: true,
    noReviewDecisionApplied: true,
    noCanonicalPromotion: true,
    canonicalWrites: 0,
    deploySnapshotWrites: false,
    valueWrites: false,
    detailsWrites: false,
    productionWrite: false,
    dryRun: true
  };
}

function dateVariants(dayKey) {
  const [yyyy, mm, dd] = dayKey.split("-");
  const monthNames = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  return {
    iso: dayKey,
    dmyDots: `${dd}.${mm}.${yyyy}`,
    dmySlashes: `${dd}/${mm}/${yyyy}`,
    spoken: `${Number(dd)} ${monthNames[Number(mm)]} ${yyyy}`
  };
}

function buildFallbackQueries(task, excludedHost) {
  const variants = dateVariants(task.targetDate);
  const name = cleanString(task.name);
  const slug = cleanString(task.leagueSlug);

  return uniqueStrings([
    `"${name}" "${variants.iso}" fixtures`,
    `"${name}" "${variants.dmyDots}" fixtures`,
    `"${name}" "${variants.dmySlashes}" fixtures`,
    `"${name}" "${variants.spoken}" fixtures`,
    `"${name}" official fixtures ${variants.iso}`,
    `"${name}" schedule ${variants.iso}`,
    `${slug} football fixtures ${variants.iso}`,
    excludedHost ? `"${name}" fixtures ${variants.iso} -site:${excludedHost}` : ""
  ]);
}

function validateTask(task, index) {
  const taskId = cleanString(task?.taskId);
  const leagueSlug = cleanString(task?.leagueSlug);
  const targetDate = cleanString(task?.targetDate);
  const confirmationState = cleanString(task?.states?.confirmationState);
  const canonicalPromotionState = cleanString(task?.states?.canonicalPromotionState);
  const checkedTargetCount = Number(task?.checkedSource?.targetDateCandidateCount ?? 0);

  if (!taskId) {
    throw new Error(`confirmationTasks[${index}]: missing taskId`);
  }
  if (!leagueSlug) {
    throw new Error(`confirmationTasks[${index}]: missing leagueSlug`);
  }
  if (!targetDate) {
    throw new Error(`confirmationTasks[${index}]: missing targetDate`);
  }
  normalizeDate(targetDate);

  if (confirmationState && confirmationState !== "pending_second_source_or_calendar_confirmation") {
    throw new Error(`confirmationTasks[${index}]: expected pending confirmationState`);
  }

  if (canonicalPromotionState && canonicalPromotionState !== "blocked") {
    throw new Error(`confirmationTasks[${index}]: expected canonical promotion blocked`);
  }

  if (checkedTargetCount !== 0) {
    throw new Error(`confirmationTasks[${index}]: expected checkedSource.targetDateCandidateCount = 0`);
  }
}

function normalizeTask(task, index) {
  validateTask(task, index);

  const checkedSourceUrl = cleanString(task?.checkedSource?.url);
  const excludedHost = cleanString(task?.sourceEvidence?.hostname) || hostFromUrl(checkedSourceUrl);
  const suggestedQueries = asArray(task?.suggestedQueries);
  const fallbackQueries = buildFallbackQueries(task, excludedHost);
  const queries = uniqueStrings([
    ...suggestedQueries,
    ...fallbackQueries
  ]);

  return {
    taskId: cleanString(task.taskId),
    taskType: "fixture_identity_second_source_search_target",
    parentTaskType: cleanString(task.taskType),
    leagueSlug: cleanString(task.leagueSlug),
    name: cleanString(task.name),
    targetDate: normalizeDate(task.targetDate),
    reason: cleanString(task.reason) || "checked_source_no_target_date_fixture_identity_rows",
    confirmationGoal: cleanString(task.confirmationGoal),
    checkedSource: {
      url: checkedSourceUrl,
      provider: cleanString(task?.checkedSource?.provider),
      excludedHost,
      candidateCount: Number(task?.checkedSource?.candidateCount ?? 0),
      targetDateCandidateCount: Number(task?.checkedSource?.targetDateCandidateCount ?? 0),
      hasTargetDateTextSignal: Boolean(task?.checkedSource?.hasTargetDateTextSignal),
      sourceEvidenceState: cleanString(task?.checkedSource?.sourceEvidenceState),
      evidenceState: cleanString(task?.checkedSource?.evidenceState),
      recommendedNextAction: cleanString(task?.checkedSource?.recommendedNextAction)
    },
    sourceEvidence: {
      evidenceFound: Boolean(task?.sourceEvidence?.evidenceFound),
      sourceTitle: cleanString(task?.sourceEvidence?.sourceTitle),
      finalUrl: cleanString(task?.sourceEvidence?.finalUrl),
      hostname: cleanString(task?.sourceEvidence?.hostname),
      httpStatus: task?.sourceEvidence?.httpStatus ?? null,
      readyForReviewDecision: Boolean(task?.sourceEvidence?.readyForReviewDecision)
    },
    searchPolicy: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      sameHostAsOnlyConfirmationBlocked: Boolean(excludedHost),
      excludedHosts: excludedHost ? [excludedHost] : [],
      preferredSourceHints: asArray(task?.preferredSourceHints).map(cleanString).filter(Boolean),
      blockedSourceHints: asArray(task?.blockedSourceHints).map(cleanString).filter(Boolean),
      maxQueriesPerLeague: null
    },
    searchQueries: queries,
    searchTargets: queries.map((query, queryIndex) => ({
      searchTargetId: [
        "fixture_identity_second_source_search",
        cleanString(task.targetDate),
        cleanString(task.leagueSlug),
        String(queryIndex + 1).padStart(2, "0")
      ].join(":"),
      query,
      leagueSlug: cleanString(task.leagueSlug),
      name: cleanString(task.name),
      targetDate: cleanString(task.targetDate),
      excludedHosts: excludedHost ? [excludedHost] : [],
      goal: "find_independent_date_specific_second_source_or_calendar_confirmation",
      acceptedEvidenceTypes: [
        "official_league_fixtures_page",
        "official_federation_calendar",
        "official_competition_calendar",
        "official_club_fixture_page_cross_check",
        "high_trust_structured_fixture_provider"
      ],
      rejectedEvidenceTypes: [
        "same_checked_source_only",
        "search_result_absence_only",
        "generic_league_activity_without_target_date_rows",
        "non_date_specific_fixture_landing_page"
      ]
    })),
    allowedNextDecisions: asArray(task?.manualDecisionOptions).map((option) => cleanString(option?.decision)).filter(Boolean),
    states: {
      searchTargetState: "materialized",
      sourceResolutionState: "not_resolved",
      sourceFetchState: "not_fetched",
      reviewDecisionState: "not_decided",
      canonicalPromotionState: "blocked"
    },
    guarantees: readOnlyGuarantees()
  };
}

function buildReport(input, options = {}) {
  const tasks = asArray(input?.confirmationTasks);

  if (tasks.length === 0) {
    throw new Error("input must contain confirmationTasks[]");
  }

  const normalized = tasks
    .map(normalizeTask)
    .filter((task) => !options.date || task.targetDate === options.date)
    .map((task) => {
      const searchQueries = task.searchQueries.slice(0, options.maxQueriesPerLeague);
      return {
        ...task,
        searchPolicy: {
          ...task.searchPolicy,
          maxQueriesPerLeague: options.maxQueriesPerLeague
        },
        searchQueries,
        searchTargets: task.searchTargets.slice(0, options.maxQueriesPerLeague)
      };
    });

  if (normalized.length === 0) {
    throw new Error("No confirmation tasks remained after date filtering.");
  }

  const totalSearchTargets = normalized.reduce((sum, task) => sum + task.searchTargets.length, 0);
  const totalSearchQueries = normalized.reduce((sum, task) => sum + task.searchQueries.length, 0);
  const uniqueExcludedHosts = uniqueStrings(normalized.flatMap((task) => task.searchPolicy.excludedHosts));

  const summary = {
    inputTaskCount: tasks.length,
    searchTargetTaskCount: normalized.length,
    totalSearchQueries,
    totalSearchTargets,
    uniqueExcludedHosts,
    targetDateCandidateCount: normalized.reduce((sum, task) => sum + Number(task.checkedSource.targetDateCandidateCount || 0), 0),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    byLeague: Object.fromEntries(normalized.map((task) => [
      task.leagueSlug,
      {
        name: task.name,
        targetDate: task.targetDate,
        queryCount: task.searchQueries.length,
        searchTargetCount: task.searchTargets.length,
        excludedHosts: task.searchPolicy.excludedHosts,
        checkedSourceCandidateCount: task.checkedSource.candidateCount,
        checkedSourceTargetDateCandidateCount: task.checkedSource.targetDateCandidateCount
      }
    ]))
  };

  if (summary.targetDateCandidateCount !== 0) {
    throw new Error("Unsafe input: targetDateCandidateCount must remain 0 for second-source search targets.");
  }

  return {
    ok: true,
    job: "materialize-fixture-identity-second-source-search-targets-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_search_targets",
    sourceInput: options.inputPath || null,
    targetDate: options.date || null,
    canonicalWrites: 0,
    summary,
    guarantees: readOnlyGuarantees(),
    searchTargetTasks: normalized,
    flatSearchTargets: normalized.flatMap((task) => task.searchTargets),
    notes: [
      "This report only materializes search targets from second-source confirmation tasks.",
      "It does not search the web, resolve URLs, fetch pages, apply review decisions, create canonical fixtures, export snapshots, or write value/details data.",
      "Same checked-source host is excluded as the only confirmation source.",
      "Absence of search results must not be used as confirmed_no_fixture_on_target_date."
    ]
  };
}

function selfTestInput() {
  return {
    confirmationTasks: [
      {
        taskId: "fixture_identity_second_source_confirmation:2026-05-22:bel.1",
        taskType: "fixture_identity_second_source_or_calendar_confirmation",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        reason: "checked_source_no_target_date_fixture_identity_rows",
        confirmationGoal: "Confirm whether the league had any fixture on the targetDate using a second independent source or official calendar.",
        checkedSource: {
          provider: "",
          url: "https://www.betexplorer.com/football/belgium/jupiler-pro-league/fixtures/",
          candidateCount: 3,
          targetDateCandidateCount: 0,
          hasTargetDateTextSignal: false,
          sourceEvidenceState: "checked_source_has_match_rows_but_none_on_target_date",
          evidenceState: "checked_source_no_target_date_fixture_identity_rows",
          recommendedNextAction: "use second source"
        },
        sourceEvidence: {
          evidenceFound: true,
          sourceTitle: "BetExplorer Belgium Jupiler Pro League fixtures",
          finalUrl: "https://www.betexplorer.com/football/belgium/jupiler-pro-league/fixtures/",
          hostname: "www.betexplorer.com",
          httpStatus: 200,
          readyForReviewDecision: true
        },
        suggestedQueries: [
          "\"Belgian Pro League\" \"2026-05-22\" fixtures",
          "\"Belgian Pro League\" official fixtures 2026-05-22",
          "\"Belgian Pro League\" fixtures 2026-05-22 -site:www.betexplorer.com"
        ],
        preferredSourceHints: ["official league fixtures page"],
        blockedSourceHints: ["do not use the same checked source as the only confirmation"],
        manualDecisionOptions: [
          { decision: "confirmed_no_fixture_on_target_date" },
          { decision: "found_target_date_fixture" },
          { decision: "insufficient_evidence" }
        ],
        states: {
          confirmationState: "pending_second_source_or_calendar_confirmation",
          canonicalPromotionState: "blocked"
        }
      }
    ]
  };
}

function main() {
  const args = parseArgs();

  const input = args.selfTest ? selfTestInput() : readJson(args.input);
  const report = buildReport(input, {
    inputPath: args.selfTest ? "self-test" : args.input,
    date: args.date ? normalizeDate(args.date) : null,
    maxQueriesPerLeague: args.maxQueriesPerLeague
  });

  writeJson(args.output, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: args.output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();