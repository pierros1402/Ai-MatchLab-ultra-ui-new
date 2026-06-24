#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    maxTasksPerMatch: 8,
    pretty: true,
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--input") {
      args.input = argv[++i];
      continue;
    }

    if (arg.startsWith("--input=")) {
      args.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++i];
      continue;
    }

    if (arg.startsWith("--output=")) {
      args.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--max-tasks-per-match") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-tasks-per-match must be an integer >= 1");
      }
      args.maxTasksPerMatch = value;
      continue;
    }

    if (arg.startsWith("--max-tasks-per-match=")) {
      const value = Number(arg.slice("--max-tasks-per-match=".length));
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-tasks-per-match must be an integer >= 1");
      }
      args.maxTasksPerMatch = value;
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
      args.help = true;
      continue;
    }

    throw new Error(`unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/materialize-final-result-source-resolution-tasks-file.js --input <search-targets.json> [--output <tasks.json>]",
    "",
    "Input shape:",
    "  output from materialize-final-result-source-search-targets-file.js",
    "",
    "Purpose:",
    "  Convert diagnostic searchTargets into source resolution tasks for a later explicit URL/search step.",
    "",
    "Guarantees:",
    "  - read-only diagnostic",
    "  - no fetch",
    "  - no URL resolution side effects",
    "  - canonicalWrites: 0",
    "  - no final truth decision",
    "  - no canonical promotion",
    "  - no production repair",
    "  - no fixture/history/value/details writes",
    ""
  ].join("\n");
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

function writeJson(filePath, value, pretty) {
  const abs = resolvePath(filePath);
  if (!abs) return;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value || "").trim();
}

function normalizeCases(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.cases)) return input.cases;
  if (Array.isArray(input?.results)) return input.results;
  if (Array.isArray(input?.rows)) return input.rows;
  throw new Error("Input JSON missing cases/results/rows array");
}

function inferResolutionMode(target) {
  const intent = cleanString(target?.sourceSearch?.intent).toLowerCase();
  const query = cleanString(target?.sourceSearch?.query);

  if (!query) return "missing_query";

  if (intent === "official_or_match_report") {
    return "manual_or_external_search_official_report";
  }

  if (intent === "exact_match_final_result") {
    return "manual_or_external_search_exact_result";
  }

  return "manual_or_external_search_generic";
}

function priorityRank(target) {
  const p = Number(target?.sourceSearch?.priority);
  return Number.isFinite(p) ? p : 999;
}

function buildTaskId(target, index) {
  const base = cleanString(target?.targetId || target?.matchId || "unknown-target");
  return [base, "resolve", index].join(":");
}

function materializeTask(target, index) {
  const query = cleanString(target?.sourceSearch?.query);
  const mode = inferResolutionMode(target);

  return {
    taskId: buildTaskId(target, index),
    targetId: cleanString(target?.targetId),
    matchId: cleanString(target?.matchId),
    day: cleanString(target?.day),
    kickoffUtc: cleanString(target?.kickoffUtc),
    leagueSlug: cleanString(target?.leagueSlug),
    teams: {
      home: cleanString(target?.teams?.home),
      away: cleanString(target?.teams?.away)
    },
    resolution: {
      mode,
      query,
      intent: cleanString(target?.sourceSearch?.intent || "unknown"),
      priority: Number.isFinite(Number(target?.sourceSearch?.priority)) ? Number(target.sourceSearch.priority) : null,
      sourceType: cleanString(target?.sourceSearch?.type || "search_query"),
      urlResolved: false,
      resolvedUrl: null,
      resolutionState: query ? "manual_or_external_search_needed" : "blocked_missing_query"
    },
    states: {
      fetchState: "not_fetched",
      preparedEvidenceState: "not_prepared",
      finalTruthDecisionState: "not_decided",
      canonicalPromotionState: "blocked"
    }
  };
}

function materializeCase(row, caseIndex, options = {}) {
  const searchTargets = asArray(row?.searchTargets);
  const maxTasks = Number.isInteger(options.maxTasksPerMatch)
    ? Math.max(1, options.maxTasksPerMatch)
    : 8;

  const tasks = searchTargets
    .slice()
    .sort((a, b) => {
      const ap = priorityRank(a);
      const bp = priorityRank(b);
      if (ap !== bp) return ap - bp;
      return cleanString(a?.sourceSearch?.query).localeCompare(cleanString(b?.sourceSearch?.query));
    })
    .slice(0, maxTasks)
    .map(materializeTask);

  return {
    index: caseIndex,
    matchId: cleanString(row?.matchId),
    day: cleanString(row?.day),
    leagueSlug: cleanString(row?.leagueSlug),
    teams: {
      home: cleanString(row?.teams?.home),
      away: cleanString(row?.teams?.away)
    },
    counts: {
      inputSearchTargets: searchTargets.length,
      materializedResolutionTasks: tasks.length
    },
    resolutionTasks: tasks
  };
}

function summarize(cases) {
  const byMode = {};
  const byState = {};
  const byIntent = {};
  const byLeague = {};
  let totalInputSearchTargets = 0;
  let totalResolutionTasks = 0;

  for (const row of cases) {
    totalInputSearchTargets += row.counts.inputSearchTargets;
    totalResolutionTasks += row.counts.materializedResolutionTasks;

    if (row.leagueSlug) {
      byLeague[row.leagueSlug] = (byLeague[row.leagueSlug] || 0) + 1;
    }

    for (const task of row.resolutionTasks) {
      const mode = task.resolution.mode || "unknown";
      const state = task.resolution.resolutionState || "unknown";
      const intent = task.resolution.intent || "unknown";

      byMode[mode] = (byMode[mode] || 0) + 1;
      byState[state] = (byState[state] || 0) + 1;
      byIntent[intent] = (byIntent[intent] || 0) + 1;
    }
  }

  return {
    caseCount: cases.length,
    totalInputSearchTargets,
    totalResolutionTasks,
    byMode,
    byState,
    byIntent,
    byLeague
  };
}

function buildReport(input, options = {}) {
  const rows = normalizeCases(input);
  const cases = rows.map((row, index) => materializeCase(row, index, options));
  const summary = summarize(cases);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "materialize-final-result-source-resolution-tasks-file",
    mode: "read_only_source_resolution_task_materialization",
    canonicalWrites: 0,
    input: {
      path: options.inputPath || null,
      rowCount: rows.length,
      maxTasksPerMatch: options.maxTasksPerMatch
    },
    summary,
    guarantees: {
      noFetch: true,
      noUrlResolutionSideEffects: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true,
      canonicalWrites: 0
    },
    cases
  };
}

function runSelfTest() {
  const input = {
    cases: [
      {
        matchId: "self-test-1",
        day: "2026-05-18",
        leagueSlug: "test.1",
        teams: {
          home: "Alpha FC",
          away: "Beta FC"
        },
        searchTargets: [
          {
            targetId: "self-test-1:exact_match_final_result:1:0",
            matchId: "self-test-1",
            day: "2026-05-18",
            kickoffUtc: "2026-05-18T20:00:00Z",
            leagueSlug: "test.1",
            teams: {
              home: "Alpha FC",
              away: "Beta FC"
            },
            sourceSearch: {
              type: "search_query",
              priority: 1,
              intent: "exact_match_final_result",
              query: "\"Alpha FC\" \"Beta FC\" final score"
            },
            fetchState: "not_fetched",
            preparedEvidenceState: "not_prepared",
            finalTruthDecisionState: "not_decided"
          }
        ]
      }
    ]
  };

  const report = buildReport(input, {
    inputPath: "self-test",
    maxTasksPerMatch: 8
  });

  if (report.canonicalWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (!report.guarantees.noFetch || !report.guarantees.noUrlResolutionSideEffects || !report.guarantees.noFinalTruthDecision || !report.guarantees.noCanonicalPromotion) {
    throw new Error("self-test failed: read-only guarantees missing");
  }

  if (report.summary.totalResolutionTasks !== 1) {
    throw new Error("self-test failed: expected one resolution task");
  }

  const task = report.cases[0].resolutionTasks[0];

  if (task.resolution.urlResolved !== false || task.resolution.resolvedUrl !== null) {
    throw new Error("self-test failed: URL must not be resolved");
  }

  if (task.states.fetchState !== "not_fetched" || task.states.canonicalPromotionState !== "blocked") {
    throw new Error("self-test failed: forbidden downstream state");
  }

  return report;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    console.log(usage());
    return;
  }

  const report = args.selfTest
    ? runSelfTest()
    : buildReport(readJson(args.input), {
        inputPath: args.input,
        maxTasksPerMatch: args.maxTasksPerMatch
      });

  const outputPath = args.output || "data/football-truth/_diagnostics/final-result-source-resolution-tasks.json";
  writeJson(outputPath, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    output: outputPath,
    caseCount: report.summary.caseCount,
    totalResolutionTasks: report.summary.totalResolutionTasks,
    canonicalWrites: report.canonicalWrites,
    noFetch: report.guarantees.noFetch,
    noUrlResolutionSideEffects: report.guarantees.noUrlResolutionSideEffects,
    noFinalTruthDecision: report.guarantees.noFinalTruthDecision,
    noCanonicalPromotion: report.guarantees.noCanonicalPromotion
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    job: "materialize-final-result-source-resolution-tasks-file",
    error: err && err.message ? err.message : String(err),
    canonicalWrites: 0,
    noFetch: true,
    noUrlResolutionSideEffects: true,
    noFinalTruthDecision: true,
    noCanonicalPromotion: true
  }, null, 2));
  process.exitCode = 1;
}
