import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: null,
    input: null,
    evidence: null,
    output: null,
    maxQueriesPerLeague: 8,
    pretty: true,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date" && argv[i + 1]) {
      out.date = cleanString(argv[++i]);
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.date = cleanString(arg.slice("--date=".length));
      continue;
    }

    if (arg === "--input" && argv[i + 1]) {
      out.input = cleanString(argv[++i]);
      continue;
    }

    if (arg.startsWith("--input=")) {
      out.input = cleanString(arg.slice("--input=".length));
      continue;
    }

    if (arg === "--evidence" && argv[i + 1]) {
      out.evidence = cleanString(argv[++i]);
      continue;
    }

    if (arg.startsWith("--evidence=")) {
      out.evidence = cleanString(arg.slice("--evidence=".length));
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = cleanString(argv[++i]);
      continue;
    }

    if (arg.startsWith("--output=")) {
      out.output = cleanString(arg.slice("--output=".length));
      continue;
    }

    if (arg === "--max-queries-per-league" && argv[i + 1]) {
      out.maxQueriesPerLeague = readPositiveInteger(argv[++i], "--max-queries-per-league");
      continue;
    }

    if (arg.startsWith("--max-queries-per-league=")) {
      out.maxQueriesPerLeague = readPositiveInteger(arg.slice("--max-queries-per-league=".length), "--max-queries-per-league");
      continue;
    }

    if (arg === "--compact") {
      out.pretty = false;
      continue;
    }

    if (arg === "--self-test") {
      out.selfTest = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      usage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!out.selfTest && !out.input) {
    throw new Error("missing required --input");
  }

  if (!out.output) {
    out.output = out.input
      ? defaultOutputPath(out.input)
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-identity-second-source-confirmation-tasks.json";
  }

  return out;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/build-fixture-identity-second-source-confirmation-tasks-file.js --date YYYY-MM-DD --input <checked-source-no-target-date-pack.json> --evidence <source-evidence.json> --output <confirmation-tasks.json>",
    "",
    "Purpose:",
    "  Materialize read-only second-source/calendar confirmation tasks for fixture identity rows where the checked source had no target-date fixture rows.",
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

function readPositiveInteger(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return number;
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

function defaultOutputPath(inputPath) {
  const parsed = path.parse(inputPath);
  return path.join(parsed.dir, `${parsed.name}.second-source-confirmation-tasks.json`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(resolvePath(filePath), "utf8"));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

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

function normalizeDate(value) {
  const text = cleanString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`Invalid date: ${text || "<empty>"}`);
  }
  return text;
}

function compactDateVariants(dayKey) {
  const [yyyy, mm, dd] = dayKey.split("-");
  return {
    iso: dayKey,
    dmyDots: `${dd}.${mm}.${yyyy}`,
    dmySlashes: `${dd}/${mm}/${yyyy}`,
    ymdCompact: `${yyyy}${mm}${dd}`,
    spoken: `${Number(dd)} ${monthName(Number(mm))} ${yyyy}`
  };
}

function monthName(month) {
  return [
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
  ][month] || "";
}

function getEvidenceByLeague(evidenceInput) {
  const map = new Map();

  for (const row of asArray(evidenceInput?.evidenceRows)) {
    const leagueSlug = cleanString(row?.leagueSlug);
    if (!leagueSlug) continue;
    map.set(leagueSlug, row);
  }

  for (const row of asArray(evidenceInput?.readyForReviewDecisionRows)) {
    const leagueSlug = cleanString(row?.leagueSlug);
    if (!leagueSlug || map.has(leagueSlug)) continue;
    map.set(leagueSlug, row);
  }

  return map;
}

function normalizeInputRows(input) {
  const rows = asArray(input?.rows);

  if (rows.length === 0) {
    throw new Error("input must contain rows[]");
  }

  return rows.map((row, index) => {
    const leagueSlug = cleanString(row?.leagueSlug);
    const name = cleanString(row?.name) || leagueSlug;
    const targetDate = cleanString(row?.targetDate);

    if (!leagueSlug) {
      throw new Error(`rows[${index}]: leagueSlug is required`);
    }

    if (!targetDate) {
      throw new Error(`rows[${index}]: targetDate is required`);
    }

    if (cleanString(row?.confirmationState) !== "pending_second_source_or_calendar_confirmation") {
      throw new Error(`rows[${index}]: expected confirmationState pending_second_source_or_calendar_confirmation`);
    }

    if (Number(row?.targetDateCandidateCount ?? 0) !== 0) {
      throw new Error(`rows[${index}]: expected targetDateCandidateCount to be 0`);
    }

    return {
      sourceIndex: index,
      leagueSlug,
      name,
      targetDate: normalizeDate(targetDate),
      evidenceState: cleanString(row?.evidenceState),
      confirmationState: cleanString(row?.confirmationState),
      checkedSourceProvider: cleanString(row?.checkedSourceProvider),
      checkedSourceUrl: cleanString(row?.checkedSourceUrl),
      candidateCount: Number(row?.candidateCount ?? 0),
      targetDateCandidateCount: Number(row?.targetDateCandidateCount ?? 0),
      hasTargetDateTextSignal: Boolean(row?.hasTargetDateTextSignal),
      sourceEvidenceState: cleanString(row?.sourceEvidenceState),
      recommendedNextAction: cleanString(row?.recommendedNextAction)
    };
  });
}

function sourceEvidenceSummary(evidence) {
  if (!evidence) {
    return {
      evidenceFound: false,
      sourceTitle: "",
      resolvedUrl: "",
      finalUrl: "",
      hostname: "",
      httpStatus: null,
      textTruncated: null,
      evidenceState: "",
      readyForReviewDecision: false,
      reviewerNotes: ""
    };
  }

  return {
    evidenceFound: true,
    sourceTitle: cleanString(evidence?.sourceTitle),
    resolvedUrl: cleanString(evidence?.resolvedUrl),
    finalUrl: cleanString(evidence?.finalUrl),
    hostname: cleanString(evidence?.hostname),
    httpStatus: evidence?.httpStatus ?? null,
    textTruncated: evidence?.textTruncated ?? null,
    evidenceState: cleanString(evidence?.evidenceState),
    readyForReviewDecision: Boolean(evidence?.readyForReviewDecision),
    reviewerNotes: cleanString(evidence?.reviewerNotes)
  };
}

function buildSuggestedQueries(row, evidenceSummary, options) {
  const variants = compactDateVariants(row.targetDate);
  const leagueName = row.name;
  const checkedHost = evidenceSummary.hostname || hostFromUrl(row.checkedSourceUrl);

  return uniqueStrings([
    `"${leagueName}" "${variants.iso}" fixtures`,
    `"${leagueName}" "${variants.dmyDots}" fixtures`,
    `"${leagueName}" "${variants.dmySlashes}" fixtures`,
    `"${leagueName}" "${variants.spoken}" fixtures`,
    `"${leagueName}" official fixtures ${variants.iso}`,
    `"${leagueName}" schedule ${variants.iso}`,
    `${row.leagueSlug} football fixtures ${variants.iso}`,
    checkedHost ? `"${leagueName}" fixtures ${variants.iso} -site:${checkedHost}` : "",
    checkedHost ? `"${leagueName}" ${variants.dmyDots} -site:${checkedHost}` : ""
  ]).slice(0, options.maxQueriesPerLeague);
}

function hostFromUrl(urlText) {
  try {
    return new URL(urlText).hostname;
  } catch {
    return "";
  }
}

function buildTask(row, evidenceSummary, options) {
  const taskId = [
    "fixture_identity_second_source_confirmation",
    row.targetDate,
    row.leagueSlug
  ].join(":");

  return {
    taskId,
    taskType: "fixture_identity_second_source_or_calendar_confirmation",
    leagueSlug: row.leagueSlug,
    name: row.name,
    targetDate: row.targetDate,
    sourceIndex: row.sourceIndex,
    reason: "checked_source_no_target_date_fixture_identity_rows",
    confirmationGoal: "Confirm whether the league had any fixture on the targetDate using a second independent source or official calendar.",
    checkedSource: {
      provider: row.checkedSourceProvider,
      url: row.checkedSourceUrl,
      candidateCount: row.candidateCount,
      targetDateCandidateCount: row.targetDateCandidateCount,
      hasTargetDateTextSignal: row.hasTargetDateTextSignal,
      sourceEvidenceState: row.sourceEvidenceState,
      evidenceState: row.evidenceState,
      recommendedNextAction: row.recommendedNextAction
    },
    sourceEvidence: evidenceSummary,
    suggestedQueries: buildSuggestedQueries(row, evidenceSummary, options),
    preferredSourceHints: [
      "official league fixtures page",
      "official federation fixtures page",
      "official competition calendar page",
      "official club fixture page for cross-check",
      "high-trust structured fixture provider only as secondary confirmation"
    ],
    blockedSourceHints: [
      "do not use the same checked source as the only confirmation",
      "do not use generic league activity without date-specific fixture rows",
      "do not infer no-fixture from absence of search results",
      "do not create canonical fixtures from league-level activity alone"
    ],
    manualDecisionOptions: [
      {
        decision: "confirmed_no_fixture_on_target_date",
        requirement: "At least one independent official or high-trust calendar/source confirms no fixture for this league on targetDate."
      },
      {
        decision: "found_target_date_fixture",
        requirement: "A second source or official calendar shows one or more targetDate fixtures; next step must extract match-level identity rows."
      },
      {
        decision: "insufficient_evidence",
        requirement: "Second source/calendar evidence is missing, ambiguous, blocked, or not date-specific."
      }
    ],
    manualDecisionTemplate: {
      decision: null,
      confirmationSourceUrls: [],
      confirmationSourceTypes: [],
      confirmationSourceTitles: [],
      targetDateFixtureCount: null,
      targetDateFixtureRows: [],
      reviewerNotes: ""
    },
    states: {
      confirmationState: "pending_second_source_or_calendar_confirmation",
      sourceFetchState: "not_fetched",
      reviewDecisionState: "not_decided",
      fixtureIdentityState: "not_promoted",
      canonicalPromotionState: "blocked"
    },
    guarantees: readOnlyGuarantees()
  };
}

function buildDecisionTemplate(tasks) {
  return tasks.map((task) => ({
    taskId: task.taskId,
    leagueSlug: task.leagueSlug,
    name: task.name,
    targetDate: task.targetDate,
    decision: null,
    confirmationSourceUrls: [],
    confirmationSourceTypes: [],
    confirmationSourceTitles: [],
    targetDateFixtureCount: null,
    targetDateFixtureRows: [],
    reviewerNotes: "",
    allowedDecisions: task.manualDecisionOptions.map((option) => option.decision)
  }));
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

function summarize(tasks, input, evidenceInput) {
  const byLeague = {};
  let evidenceFoundCount = 0;
  let readyEvidenceCount = 0;
  let checkedSourceWithCandidateRowsCount = 0;

  for (const task of tasks) {
    if (task.sourceEvidence.evidenceFound) evidenceFoundCount += 1;
    if (task.sourceEvidence.readyForReviewDecision) readyEvidenceCount += 1;
    if (task.checkedSource.candidateCount > 0) checkedSourceWithCandidateRowsCount += 1;

    byLeague[task.leagueSlug] = {
      name: task.name,
      targetDate: task.targetDate,
      candidateCount: task.checkedSource.candidateCount,
      targetDateCandidateCount: task.checkedSource.targetDateCandidateCount,
      evidenceFound: task.sourceEvidence.evidenceFound,
      readyForReviewDecision: task.sourceEvidence.readyForReviewDecision
    };
  }

  return {
    inputRowCount: asArray(input?.rows).length,
    taskCount: tasks.length,
    evidenceRowCount: asArray(evidenceInput?.evidenceRows).length,
    readyForReviewDecisionInputCount: asArray(evidenceInput?.readyForReviewDecisionRows).length,
    evidenceFoundCount,
    readyEvidenceCount,
    checkedSourceWithCandidateRowsCount,
    targetDateCandidateCount: tasks.reduce((sum, task) => sum + Number(task.checkedSource.targetDateCandidateCount || 0), 0),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    byLeague
  };
}

function buildReport(input, evidenceInput = {}, options = {}) {
  const rows = normalizeInputRows(input);
  const evidenceByLeague = getEvidenceByLeague(evidenceInput);
  const filteredRows = options.date
    ? rows.filter((row) => row.targetDate === options.date)
    : rows;

  if (filteredRows.length === 0) {
    throw new Error("No rows remained after date filtering.");
  }

  const tasks = filteredRows.map((row) => {
    const evidence = evidenceByLeague.get(row.leagueSlug) || null;
    return buildTask(row, sourceEvidenceSummary(evidence), options);
  });

  const report = {
    ok: true,
    job: "build-fixture-identity-second-source-confirmation-tasks-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_confirmation_tasks",
    sourceInput: options.inputPath || null,
    evidenceInput: options.evidencePath || null,
    targetDate: options.date || null,
    canonicalWrites: 0,
    options: {
      maxQueriesPerLeague: options.maxQueriesPerLeague
    },
    summary: summarize(tasks, input, evidenceInput),
    guarantees: readOnlyGuarantees(),
    confirmationTasks: tasks,
    reviewDecisionTemplate: buildDecisionTemplate(tasks),
    notes: [
      "This report only materializes second-source/calendar confirmation tasks.",
      "It does not fetch URLs, apply review decisions, create canonical fixtures, export snapshots, or write value/details data.",
      "A confirmed_no_fixture_on_target_date decision must be backed by independent date-specific confirmation.",
      "A found_target_date_fixture decision must flow into match-level fixture identity extraction and validation before any guarded writer."
    ]
  };

  if (report.summary.targetDateCandidateCount !== 0) {
    throw new Error("Unsafe input: targetDateCandidateCount must remain 0 for second-source confirmation tasks.");
  }

  return report;
}

function runSelfTest() {
  const input = {
    rows: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        evidenceState: "checked_source_no_target_date_fixture_identity_rows",
        confirmationState: "pending_second_source_or_calendar_confirmation",
        checkedSourceProvider: "",
        checkedSourceUrl: "https://www.betexplorer.com/football/belgium/jupiler-pro-league/fixtures/",
        candidateCount: 3,
        targetDateCandidateCount: 0,
        hasTargetDateTextSignal: false,
        sourceEvidenceState: "checked_source_has_match_rows_but_none_on_target_date",
        recommendedNextAction: "do_not_create_canonical_fixture_rows_from_this_source; use second source or calendar confirmation before marking confirmed_no_fixture"
      }
    ]
  };

  const evidence = {
    evidenceRows: [
      {
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        sourceTitle: "BetExplorer Belgium Jupiler Pro League fixtures",
        resolvedUrl: "https://www.betexplorer.com/football/belgium/jupiler-pro-league/fixtures/",
        finalUrl: "https://www.betexplorer.com/",
        hostname: "www.betexplorer.com",
        httpStatus: 200,
        textTruncated: true,
        evidenceState: "source_snapshot_evidence_prepared",
        readyForReviewDecision: true,
        reviewerNotes: "self-test source evidence"
      }
    ],
    readyForReviewDecisionRows: []
  };

  const report = buildReport(input, evidence, {
    inputPath: "self-test",
    evidencePath: "self-test",
    date: "2026-05-22",
    maxQueriesPerLeague: 8
  });

  if (report.canonicalWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (!report.guarantees.noFetch || !report.guarantees.noUrlFetch || !report.guarantees.noReviewDecisionApplied) {
    throw new Error("self-test failed: read-only guarantees missing");
  }

  if (report.summary.taskCount !== 1 || report.confirmationTasks.length !== 1) {
    throw new Error("self-test failed: expected one confirmation task");
  }

  const task = report.confirmationTasks[0];

  if (task.states.confirmationState !== "pending_second_source_or_calendar_confirmation") {
    throw new Error("self-test failed: wrong confirmation state");
  }

  if (task.suggestedQueries.length < 4) {
    throw new Error("self-test failed: expected suggested queries");
  }

  if (report.reviewDecisionTemplate.length !== 1) {
    throw new Error("self-test failed: expected one decision template row");
  }

  return report;
}

function main() {
  const options = parseArgs();

  const report = options.selfTest
    ? runSelfTest()
    : buildReport(readJson(options.input), options.evidence ? readJson(options.evidence) : {}, {
        inputPath: options.input,
        evidencePath: options.evidence,
        date: options.date ? normalizeDate(options.date) : null,
        maxQueriesPerLeague: options.maxQueriesPerLeague
      });

  writeJson(options.output, report, options.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: options.output,
    mode: report.mode,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();