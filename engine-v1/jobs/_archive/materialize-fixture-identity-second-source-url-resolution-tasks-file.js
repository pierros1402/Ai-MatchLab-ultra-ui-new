#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

function cleanString(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: null,
    output: null,
    date: null,
    maxTasks: null,
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

    if (arg === "--max-tasks" && argv[i + 1]) {
      args.maxTasks = readPositiveInteger(argv[++i], "--max-tasks");
      continue;
    }
    if (arg.startsWith("--max-tasks=")) {
      args.maxTasks = readPositiveInteger(arg.slice("--max-tasks=".length), "--max-tasks");
      continue;
    }

    if (arg === "--compact") {
      args.pretty = false;
      continue;
    }

    if (arg === "--pretty") {
      args.pretty = true;
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
      : "data/football-truth/_diagnostics/fixture-acquisition-stability/self-test.fixture-identity-second-source-url-resolution-tasks.json";
  }

  return args;
}

function usage() {
  console.log([
    "Usage:",
    "  node engine-v1/jobs/materialize-fixture-identity-second-source-url-resolution-tasks-file.js --date YYYY-MM-DD --input <second-source-search-targets.json> --output <url-resolution-tasks.json>",
    "",
    "Purpose:",
    "  Convert fixture identity second-source search targets into URL resolution tasks for a later explicit search/resolution step.",
    "",
    "Guarantees:",
    "  - sourceFetch: false",
    "  - noFetch: true",
    "  - noUrlFetch: true",
    "  - noUrlResolutionSideEffects: true",
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
  return path.join(parsed.dir, `${parsed.name}.url-resolution-tasks.json`);
}

function resolvePath(filePath) {
  if (!filePath) return null;
  return path.isAbsolute(filePath) ? filePath : path.resolve(REPO_ROOT, filePath);
}

function readJson(filePath) {
  const abs = resolvePath(filePath);
  if (!abs) throw new Error("missing required --input");
  return JSON.parse(fs.readFileSync(abs, "utf8").replace(/^\uFEFF/, ""));
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

function readOnlyGuarantees() {
  return {
    sourceFetch: false,
    noFetch: true,
    noUrlFetch: true,
    noUrlResolutionSideEffects: true,
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

function normalizeFlatSearchTargets(input) {
  if (Array.isArray(input?.flatSearchTargets)) return input.flatSearchTargets;

  if (Array.isArray(input?.searchTargetTasks)) {
    return input.searchTargetTasks.flatMap((task) => asArray(task?.searchTargets));
  }

  if (Array.isArray(input?.rows)) return input.rows;

  throw new Error("Input JSON missing flatSearchTargets[], searchTargetTasks[].searchTargets[], or rows[].");
}

function normalizeSearchTargetTasks(input) {
  if (Array.isArray(input?.searchTargetTasks)) return input.searchTargetTasks;
  return [];
}

function parentTaskMap(input) {
  const map = new Map();

  for (const task of normalizeSearchTargetTasks(input)) {
    for (const target of asArray(task?.searchTargets)) {
      const id = cleanString(target?.searchTargetId);
      if (id) map.set(id, task);
    }
  }

  return map;
}

function resolutionMode(target) {
  const goal = cleanString(target?.goal);

  if (goal === "find_independent_date_specific_second_source_or_calendar_confirmation") {
    return "manual_or_external_search_second_source_calendar";
  }

  return "manual_or_external_search_generic_fixture_identity";
}

function validateSearchTarget(target, index) {
  const searchTargetId = cleanString(target?.searchTargetId);
  const query = cleanString(target?.query);
  const leagueSlug = cleanString(target?.leagueSlug);
  const targetDate = cleanString(target?.targetDate);

  if (!searchTargetId) {
    throw new Error(`flatSearchTargets[${index}]: missing searchTargetId`);
  }
  if (!query) {
    throw new Error(`flatSearchTargets[${index}]: missing query`);
  }
  if (!leagueSlug) {
    throw new Error(`flatSearchTargets[${index}]: missing leagueSlug`);
  }
  if (!targetDate) {
    throw new Error(`flatSearchTargets[${index}]: missing targetDate`);
  }

  normalizeDate(targetDate);
}

function buildResolutionTask(target, index, parentTask = null) {
  validateSearchTarget(target, index);

  const excludedHosts = asArray(target?.excludedHosts).map(cleanString).filter(Boolean);
  const targetDate = normalizeDate(target.targetDate);
  const leagueSlug = cleanString(target.leagueSlug);

  return {
    taskId: `${cleanString(target.searchTargetId)}:resolve`,
    taskType: "fixture_identity_second_source_url_resolution",
    searchTargetId: cleanString(target.searchTargetId),
    parentConfirmationTaskId: cleanString(parentTask?.taskId),
    leagueSlug,
    name: cleanString(target.name || parentTask?.name),
    targetDate,
    query: cleanString(target.query),
    resolution: {
      mode: resolutionMode(target),
      query: cleanString(target.query),
      urlResolved: false,
      resolvedUrl: null,
      sourceName: null,
      sourceType: null,
      resolvedBy: null,
      resolutionState: "manual_or_external_search_needed"
    },
    policy: {
      acceptedEvidenceTypes: asArray(target?.acceptedEvidenceTypes).map(cleanString).filter(Boolean),
      rejectedEvidenceTypes: asArray(target?.rejectedEvidenceTypes).map(cleanString).filter(Boolean),
      excludedHosts,
      sameHostAsOnlyConfirmationBlocked: excludedHosts.length > 0,
      noSearchResultAbsenceConfirmation: true,
      requireDateSpecificEvidence: true
    },
    states: {
      sourceResolutionState: "not_resolved",
      sourceFetchState: "not_fetched",
      sourceEvidenceState: "not_prepared",
      reviewDecisionState: "not_decided",
      canonicalPromotionState: "blocked"
    },
    guarantees: readOnlyGuarantees()
  };
}

function summarize(tasks, input) {
  const byLeague = {};
  const excludedHosts = new Set();

  for (const task of tasks) {
    if (!byLeague[task.leagueSlug]) {
      byLeague[task.leagueSlug] = {
        name: task.name,
        targetDate: task.targetDate,
        resolutionTaskCount: 0,
        excludedHosts: []
      };
    }

    byLeague[task.leagueSlug].resolutionTaskCount += 1;

    for (const host of task.policy.excludedHosts) {
      excludedHosts.add(host);
      if (!byLeague[task.leagueSlug].excludedHosts.includes(host)) {
        byLeague[task.leagueSlug].excludedHosts.push(host);
      }
    }
  }

  return {
    inputFlatSearchTargetCount: normalizeFlatSearchTargets(input).length,
    resolutionTaskCount: tasks.length,
    leagueCount: Object.keys(byLeague).length,
    uniqueExcludedHosts: [...excludedHosts].sort(),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    byLeague
  };
}

function buildReport(input, options = {}) {
  const parentBySearchTargetId = parentTaskMap(input);

  let targets = normalizeFlatSearchTargets(input)
    .filter((target, index) => {
      validateSearchTarget(target, index);
      return !options.date || cleanString(target.targetDate) === options.date;
    });

  if (options.maxTasks) {
    targets = targets.slice(0, options.maxTasks);
  }

  if (targets.length === 0) {
    throw new Error("No flat search targets remained after filtering.");
  }

  const tasks = targets.map((target, index) => {
    const parentTask = parentBySearchTargetId.get(cleanString(target.searchTargetId)) || null;
    return buildResolutionTask(target, index, parentTask);
  });

  return {
    ok: true,
    job: "materialize-fixture-identity-second-source-url-resolution-tasks-file",
    generatedAt: new Date().toISOString(),
    mode: "read_only_fixture_identity_second_source_url_resolution_tasks",
    sourceInput: options.inputPath || null,
    targetDate: options.date || null,
    canonicalWrites: 0,
    summary: summarize(tasks, input),
    guarantees: readOnlyGuarantees(),
    resolutionTasks: tasks,
    urlResolutionTemplate: tasks.map((task) => ({
      taskId: task.taskId,
      searchTargetId: task.searchTargetId,
      leagueSlug: task.leagueSlug,
      name: task.name,
      targetDate: task.targetDate,
      query: task.query,
      resolvedUrl: null,
      sourceName: null,
      sourceType: null,
      resolvedBy: null,
      reviewerNotes: "",
      allowedSourceTypes: [
        "official_league",
        "official_federation",
        "official_competition",
        "official_club",
        "trusted_provider",
        "other"
      ],
      allowedResolvedBy: [
        "manual",
        "external_search",
        "operator",
        "diagnostic"
      ]
    })),
    notes: [
      "This report only materializes URL resolution tasks from second-source search targets.",
      "It does not search the web, resolve URLs, fetch URLs, apply review decisions, create canonical fixtures, export snapshots, or write value/details data.",
      "Resolved URLs must be supplied by a later explicit/manual/external-search resolution step.",
      "Absence of search results must not be used as confirmed_no_fixture_on_target_date."
    ]
  };
}

function selfTestInput() {
  return {
    searchTargetTasks: [
      {
        taskId: "fixture_identity_second_source_confirmation:2026-05-22:bel.1",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        searchTargets: [
          {
            searchTargetId: "fixture_identity_second_source_search:2026-05-22:bel.1:01",
            query: "\"Belgian Pro League\" \"2026-05-22\" fixtures",
            leagueSlug: "bel.1",
            name: "Belgian Pro League",
            targetDate: "2026-05-22",
            excludedHosts: ["www.betexplorer.com"],
            goal: "find_independent_date_specific_second_source_or_calendar_confirmation",
            acceptedEvidenceTypes: ["official_league_fixtures_page"],
            rejectedEvidenceTypes: ["same_checked_source_only"]
          }
        ]
      }
    ],
    flatSearchTargets: [
      {
        searchTargetId: "fixture_identity_second_source_search:2026-05-22:bel.1:01",
        query: "\"Belgian Pro League\" \"2026-05-22\" fixtures",
        leagueSlug: "bel.1",
        name: "Belgian Pro League",
        targetDate: "2026-05-22",
        excludedHosts: ["www.betexplorer.com"],
        goal: "find_independent_date_specific_second_source_or_calendar_confirmation",
        acceptedEvidenceTypes: ["official_league_fixtures_page"],
        rejectedEvidenceTypes: ["same_checked_source_only"]
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
    maxTasks: args.maxTasks
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