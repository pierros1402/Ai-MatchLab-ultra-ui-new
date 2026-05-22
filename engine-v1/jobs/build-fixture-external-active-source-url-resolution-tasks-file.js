import fs from "node:fs";
import path from "node:path";

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: null,
    output: null,
    maxLeagues: null,
    maxQueriesPerLeague: 8,
    pretty: true,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input" && argv[i + 1]) {
      out.input = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--input=")) {
      out.input = arg.slice("--input=".length).trim();
      continue;
    }

    if (arg === "--output" && argv[i + 1]) {
      out.output = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--output=")) {
      out.output = arg.slice("--output=".length).trim();
      continue;
    }

    if (arg === "--max-leagues" && argv[i + 1]) {
      out.maxLeagues = readPositiveInteger(argv[++i], "--max-leagues");
      continue;
    }

    if (arg.startsWith("--max-leagues=")) {
      out.maxLeagues = readPositiveInteger(arg.slice("--max-leagues=".length), "--max-leagues");
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
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-external-active-source-url-resolution-tasks.json";
  }

  return out;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/build-fixture-external-active-source-url-resolution-tasks-file.js --input <review-pack-or-wave-decisions.json> --output <tasks.json>",
    "",
    "Inputs:",
    "  - fixture external-active review pack with reviewItems:[]",
    "  - UEFA review wave decisions file with decisions:[] and meta.itemSearchQueries",
    "",
    "Guarantees:",
    "  - sourceFetch: false",
    "  - no URL fetch",
    "  - canonicalWrites: 0",
    "  - productionWrite: false",
    "  - deploySnapshotWrites: false",
    "  - valueWrites: false",
    "  - detailsWrites: false"
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
  return path.join(parsed.dir, `${parsed.name}.source-url-resolution-tasks.json`);
}

function readJson(filePath) {
  const abs = resolvePath(filePath);
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

function writeJson(filePath, value, pretty = true) {
  const abs = resolvePath(filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value ?? "").trim();
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];

  for (const value of asArray(values)) {
    const text = cleanString(value);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function normalizeInputItems(input) {
  if (Array.isArray(input?.reviewItems)) {
    return input.reviewItems.map((item, index) => normalizeReviewPackItem(item, index));
  }

  if (Array.isArray(input?.decisions)) {
    return input.decisions.map((item, index) => normalizeWaveDecisionItem(item, index));
  }

  if (Array.isArray(input)) {
    return input.map((item, index) => normalizeWaveDecisionItem(item, index));
  }

  throw new Error("Input must contain reviewItems:[] or decisions:[] or be an array of decision rows.");
}

function normalizeReviewPackItem(item, index) {
  const leagueSlug = cleanString(item?.leagueSlug);
  if (!leagueSlug) throw new Error(`reviewItems[${index}]: leagueSlug is required`);

  return {
    sourceShape: "review_pack_item",
    sourceIndex: index,
    reviewId: cleanString(item?.reviewId) || `review-item:${index}`,
    targetId: cleanString(item?.targetId),
    leagueSlug,
    name: cleanString(item?.name) || leagueSlug,
    country: cleanString(item?.country),
    dayKey: cleanString(item?.dayKey),
    tier: item?.tier ?? null,
    priority: cleanString(item?.priority),
    targetType: cleanString(item?.targetType),
    reason: cleanString(item?.reason),
    resolutionGoal: cleanString(item?.resolutionGoal) || "prove external fixture activity for this league/day",
    searchQueries: uniqueStrings(item?.searchQueries),
    preferredSourceHints: uniqueStrings(item?.preferredSourceHints),
    blockedSourceHints: uniqueStrings(item?.blockedSourceHints),
    reviewFields: item?.reviewFields || {}
  };
}

function normalizeWaveDecisionItem(item, index) {
  const meta = item?.meta || {};
  const leagueSlug = cleanString(item?.leagueSlug);
  if (!leagueSlug) throw new Error(`decisions[${index}]: leagueSlug is required`);

  const itemQueries = uniqueStrings(meta?.itemSearchQueries);
  const combinedQueries = uniqueStrings(meta?.combinedSearchQueries);
  const preferredHints = uniqueStrings(meta?.preferredSourceHints);
  const preferredBatchTargets = uniqueStrings(meta?.preferredBatchSourceTargets);

  return {
    sourceShape: "wave_decision_item",
    sourceIndex: index,
    reviewId: cleanString(meta?.reviewId) || `decision:${index}`,
    targetId: "",
    leagueSlug,
    name: cleanString(meta?.name) || leagueSlug,
    country: cleanString(meta?.country),
    dayKey: cleanString(meta?.dayKey),
    tier: null,
    priority: "",
    targetType: "fixture_external_active_review_wave",
    reason: "wave decision row requires source URL resolution before reviewFields can be filled",
    resolutionGoal: "find official or high-trust URL evidence for fixture activity on the requested day",
    searchQueries: itemQueries.length > 0 ? itemQueries : combinedQueries,
    preferredSourceHints: preferredHints.length > 0 ? preferredHints : preferredBatchTargets,
    blockedSourceHints: [
      "scoreboard-only evidence is not sufficient for verified_active",
      "generic search result pages without date-specific fixture evidence are not sufficient"
    ],
    reviewFields: {
      sourceVerdict: cleanString(item?.sourceVerdict || "unreviewed"),
      externallyActive: item?.externallyActive ?? null,
      fixtureCountFound: item?.fixtureCountFound ?? null,
      sourceUrls: asArray(item?.sourceUrls),
      sourceTypes: asArray(item?.sourceTypes),
      missingFromSnapshot: item?.missingFromSnapshot ?? null,
      reviewerNotes: cleanString(item?.reviewerNotes)
    }
  };
}

function buildTaskId(item, queryIndex) {
  const day = item.dayKey || "unknown-day";
  return [
    "fixture_external_active_source_url_resolution",
    day,
    item.leagueSlug,
    String(queryIndex + 1).padStart(2, "0")
  ].join(":");
}

function sourceResolutionModeForHint(hint) {
  const text = cleanString(hint).toLowerCase();

  if (text.includes("federation")) return "official_federation_fixture_list";
  if (text.includes("league")) return "official_league_fixture_list";
  if (text.includes("competition")) return "official_competition_fixture_list";
  if (text.includes("club")) return "official_club_fixture_cross_check";
  if (text.includes("provider")) return "trusted_structured_provider_cross_check";

  return "official_or_high_trust_fixture_source";
}

function buildResolutionTasksForItem(item, options) {
  const queries = uniqueStrings(item.searchQueries).slice(0, options.maxQueriesPerLeague);
  const hints = uniqueStrings(item.preferredSourceHints);
  const primaryHint = hints[0] || "official competition fixture page";
  const sourceResolutionMode = sourceResolutionModeForHint(primaryHint);

  return queries.map((query, queryIndex) => ({
    taskId: buildTaskId(item, queryIndex),
    taskType: "fixture_external_active_source_url_resolution",
    sourceShape: item.sourceShape,
    sourceIndex: item.sourceIndex,
    reviewId: item.reviewId,
    targetId: item.targetId,
    leagueSlug: item.leagueSlug,
    name: item.name,
    country: item.country,
    dayKey: item.dayKey,
    tier: item.tier,
    priority: item.priority,
    targetType: item.targetType,
    reason: item.reason,
    resolutionGoal: item.resolutionGoal,
    searchQuery: query,
    queryIndex,
    preferredSourceHints: hints,
    blockedSourceHints: item.blockedSourceHints,
    sourceResolutionMode,
    acceptanceRules: [
      "Prefer official federation, official league, official competition, or official club fixture pages.",
      "Evidence must be date-specific for the requested dayKey.",
      "verified_active requires at least one fixture row or official date listing for the league/day.",
      "scoreboard-only sources are cross-check only and must not be used as the sole verified_active source.",
      "Do not infer canonical fixture rows from league-level activity alone."
    ],
    manualResolutionFields: {
      resolvedUrl: null,
      sourceType: null,
      sourceTitle: null,
      externallyActive: null,
      fixtureCountFound: null,
      missingFromSnapshot: null,
      reviewerNotes: ""
    },
    states: {
      urlResolutionState: "pending_manual_or_controlled_resolution",
      fetchState: "not_fetched",
      evidenceState: "not_prepared",
      reviewDecisionState: "not_decided",
      canonicalPromotionState: "blocked"
    },
    guarantees: {
      sourceFetch: false,
      urlFetch: false,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    }
  }));
}

function buildCase(item, options) {
  const resolutionTasks = buildResolutionTasksForItem(item, options);

  return {
    caseId: `fixture_external_active:${item.dayKey || "unknown-day"}:${item.leagueSlug}`,
    leagueSlug: item.leagueSlug,
    name: item.name,
    country: item.country,
    dayKey: item.dayKey,
    reviewId: item.reviewId,
    targetId: item.targetId,
    sourceShape: item.sourceShape,
    reviewFields: item.reviewFields,
    counts: {
      searchQueryCount: uniqueStrings(item.searchQueries).length,
      preferredSourceHintCount: uniqueStrings(item.preferredSourceHints).length,
      materializedResolutionTasks: resolutionTasks.length
    },
    resolutionTasks
  };
}

function buildUrlResolutionTemplate(cases) {
  return cases.flatMap((oneCase) => oneCase.resolutionTasks.map((task) => ({
    taskId: task.taskId,
    leagueSlug: task.leagueSlug,
    name: task.name,
    country: task.country,
    dayKey: task.dayKey,
    searchQuery: task.searchQuery,
    resolvedUrl: null,
    sourceType: null,
    sourceTitle: null,
    externallyActive: null,
    fixtureCountFound: null,
    missingFromSnapshot: null,
    reviewerNotes: "",
    resolutionState: "pending"
  })));
}

function summarize(cases) {
  const leagueSlugs = new Set();
  const dayKeys = new Set();
  let totalResolutionTasks = 0;

  for (const oneCase of cases) {
    leagueSlugs.add(oneCase.leagueSlug);
    if (oneCase.dayKey) dayKeys.add(oneCase.dayKey);
    totalResolutionTasks += oneCase.counts.materializedResolutionTasks;
  }

  return {
    caseCount: cases.length,
    leagueCount: leagueSlugs.size,
    dayCount: dayKeys.size,
    totalResolutionTasks,
    urlResolutionTemplateRowCount: totalResolutionTasks
  };
}

function buildReport(input, options = {}) {
  let items = normalizeInputItems(input);

  if (options.maxLeagues != null) {
    items = items.slice(0, options.maxLeagues);
  }

  const cases = items.map((item) => buildCase(item, options));
  const urlResolutionsTemplate = buildUrlResolutionTemplate(cases);

  return {
    ok: true,
    job: "build-fixture-external-active-source-url-resolution-tasks-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_external_active_source_url_resolution_task_materializer",
    canonicalWrites: 0,
    sourceInput: options.inputPath || null,
    options: {
      maxLeagues: options.maxLeagues ?? null,
      maxQueriesPerLeague: options.maxQueriesPerLeague
    },
    summary: summarize(cases),
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noReviewDecision: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      deploySnapshotWrites: false,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    },
    cases,
    urlResolutionsTemplate,
    notes: [
      "This job only materializes source URL resolution tasks.",
      "It does not fetch URLs, fill sourceUrls, decide externallyActive, or write canonical fixtures.",
      "The urlResolutionsTemplate is intended for a later validator/fetch layer or controlled review artifact.",
      "League-level activity evidence is not enough to write canonical fixture rows."
    ]
  };
}

function runSelfTest() {
  const input = {
    decisions: [
      {
        leagueSlug: "est.1",
        sourceVerdict: "unreviewed",
        meta: {
          name: "Estonian Meistriliiga",
          country: "estonia",
          dayKey: "2026-05-22",
          reviewId: "review:est.1",
          itemSearchQueries: [
            "\"Estonian Meistriliiga\" fixtures 2026-05-22",
            "estonia football \"Estonian Meistriliiga\" fixtures 2026-05-22"
          ],
          preferredSourceHints: [
            "official federation competition page",
            "official league schedule page"
          ]
        }
      }
    ]
  };

  const report = buildReport(input, {
    inputPath: "self-test",
    maxLeagues: null,
    maxQueriesPerLeague: 8
  });

  if (report.canonicalWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (!report.guarantees.noFetch || !report.guarantees.noUrlFetch || !report.guarantees.noReviewDecision) {
    throw new Error("self-test failed: read-only guarantees missing");
  }

  if (report.summary.caseCount !== 1 || report.summary.totalResolutionTasks !== 2) {
    throw new Error("self-test failed: unexpected task counts");
  }

  const task = report.cases[0].resolutionTasks[0];
  if (task.states.fetchState !== "not_fetched" || task.states.reviewDecisionState !== "not_decided") {
    throw new Error("self-test failed: task states are unsafe");
  }

  return report;
}

function main() {
  const options = parseArgs();

  const report = options.selfTest
    ? runSelfTest()
    : buildReport(readJson(options.input), {
        inputPath: options.input,
        maxLeagues: options.maxLeagues,
        maxQueriesPerLeague: options.maxQueriesPerLeague
      });

  writeJson(options.output, report, options.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    output: options.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();