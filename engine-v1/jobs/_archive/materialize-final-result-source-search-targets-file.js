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
    maxTargetsPerMatch: 8,
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

    if (arg === "--max-targets-per-match") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-targets-per-match must be an integer >= 1");
      }
      args.maxTargetsPerMatch = value;
      continue;
    }

    if (arg.startsWith("--max-targets-per-match=")) {
      const value = Number(arg.slice("--max-targets-per-match=".length));
      if (!Number.isInteger(value) || value < 1) {
        throw new Error("--max-targets-per-match must be an integer >= 1");
      }
      args.maxTargetsPerMatch = value;
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
    "  node engine-v1/jobs/materialize-final-result-source-search-targets-file.js --input <discover-classify-report.json> [--output <targets.json>]",
    "",
    "Input shape:",
    "  output from discover-and-classify-final-result-sources-watchset-day.js",
    "",
    "Purpose:",
    "  Flatten results[].discovery.searchDescriptors into diagnostic searchTargets.",
    "",
    "Guarantees:",
    "  - read-only diagnostic",
    "  - no fetch",
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

function normalizeResults(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.results)) return input.results;
  if (Array.isArray(input?.rows)) return input.rows;
  if (Array.isArray(input?.cases)) return input.cases;
  throw new Error("Input JSON missing results/rows/cases array");
}

function buildTargetId(watchRow, descriptor, index) {
  const matchId = cleanString(watchRow?.matchId || watchRow?.id || "unknown-match");
  const intent = cleanString(descriptor?.intent || "search");
  const priority = cleanString(descriptor?.priority || "p");
  return [matchId, intent, priority, index].join(":");
}

function normalizeSearchDescriptor(descriptor) {
  if (!descriptor || typeof descriptor !== "object") return null;

  const query = cleanString(descriptor.query);
  if (!query) return null;

  return {
    type: cleanString(descriptor.type || "search_query"),
    priority: Number.isFinite(Number(descriptor.priority)) ? Number(descriptor.priority) : null,
    intent: cleanString(descriptor.intent || "unknown"),
    query
  };
}

function materializeCase(row, caseIndex, options = {}) {
  const watchRow = row?.watchRow || row?.discovery?.watchRow || row?.match || row?.fixture || {};
  const descriptors = asArray(row?.discovery?.searchDescriptors || row?.searchDescriptors);

  const maxTargets = Number.isInteger(options.maxTargetsPerMatch)
    ? Math.max(1, options.maxTargetsPerMatch)
    : 8;

  const searchTargets = descriptors
    .map(normalizeSearchDescriptor)
    .filter(Boolean)
    .sort((a, b) => {
      const ap = Number.isFinite(a.priority) ? a.priority : 999;
      const bp = Number.isFinite(b.priority) ? b.priority : 999;
      if (ap !== bp) return ap - bp;
      return a.query.localeCompare(b.query);
    })
    .slice(0, maxTargets)
    .map((descriptor, index) => ({
      targetId: buildTargetId(watchRow, descriptor, index),
      matchId: cleanString(watchRow.matchId || watchRow.id),
      day: cleanString(watchRow.day || watchRow.date),
      kickoffUtc: cleanString(watchRow.kickoffUtc),
      leagueSlug: cleanString(watchRow.leagueSlug),
      teams: {
        home: cleanString(watchRow.homeTeam || watchRow.home || watchRow.homeName),
        away: cleanString(watchRow.awayTeam || watchRow.away || watchRow.awayName)
      },
      sourceSearch: {
        type: descriptor.type,
        priority: descriptor.priority,
        intent: descriptor.intent,
        query: descriptor.query
      },
      fetchState: "not_fetched",
      preparedEvidenceState: "not_prepared",
      finalTruthDecisionState: "not_decided"
    }));

  return {
    index: caseIndex,
    matchId: cleanString(watchRow.matchId || watchRow.id),
    day: cleanString(watchRow.day || watchRow.date),
    leagueSlug: cleanString(watchRow.leagueSlug),
    teams: {
      home: cleanString(watchRow.homeTeam || watchRow.home || watchRow.homeName),
      away: cleanString(watchRow.awayTeam || watchRow.away || watchRow.awayName)
    },
    counts: {
      inputSearchDescriptors: descriptors.length,
      materializedSearchTargets: searchTargets.length
    },
    searchTargets
  };
}

function summarize(cases) {
  const byIntent = {};
  const byPriority = {};
  const byLeague = {};
  let totalInputSearchDescriptors = 0;
  let totalSearchTargets = 0;

  for (const row of cases) {
    totalInputSearchDescriptors += row.counts.inputSearchDescriptors;
    totalSearchTargets += row.counts.materializedSearchTargets;

    if (row.leagueSlug) {
      byLeague[row.leagueSlug] = (byLeague[row.leagueSlug] || 0) + 1;
    }

    for (const target of row.searchTargets) {
      const intent = target.sourceSearch.intent || "unknown";
      const priority = String(target.sourceSearch.priority ?? "unknown");
      byIntent[intent] = (byIntent[intent] || 0) + 1;
      byPriority[priority] = (byPriority[priority] || 0) + 1;
    }
  }

  return {
    caseCount: cases.length,
    totalInputSearchDescriptors,
    totalSearchTargets,
    byIntent,
    byPriority,
    byLeague
  };
}

function buildReport(input, options = {}) {
  const rows = normalizeResults(input);
  const cases = rows.map((row, index) => materializeCase(row, index, options));
  const summary = summarize(cases);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "materialize-final-result-source-search-targets-file",
    mode: "read_only_search_target_materialization",
    canonicalWrites: 0,
    input: {
      path: options.inputPath || null,
      rowCount: rows.length,
      maxTargetsPerMatch: options.maxTargetsPerMatch
    },
    summary,
    guarantees: {
      noFetch: true,
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
    results: [
      {
        watchRow: {
          matchId: "self-test-1",
          day: "2026-05-18",
          kickoffUtc: "2026-05-18T20:00:00Z",
          leagueSlug: "test.1",
          homeTeam: "Alpha FC",
          awayTeam: "Beta FC"
        },
        discovery: {
          searchDescriptors: [
            {
              type: "search_query",
              priority: 1,
              intent: "exact_match_final_result",
              query: "\"Alpha FC\" \"Beta FC\" final score"
            },
            {
              type: "search_query",
              priority: 2,
              intent: "official_or_match_report",
              query: "\"Alpha FC\" match report \"Beta FC\""
            }
          ]
        }
      }
    ]
  };

  const report = buildReport(input, {
    inputPath: "self-test",
    maxTargetsPerMatch: 8
  });

  if (report.canonicalWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (!report.guarantees.noFetch || !report.guarantees.noFinalTruthDecision || !report.guarantees.noCanonicalPromotion) {
    throw new Error("self-test failed: read-only guarantees missing");
  }

  if (report.summary.totalSearchTargets !== 2) {
    throw new Error("self-test failed: expected 2 search targets");
  }

  if (report.cases[0].searchTargets[0].fetchState !== "not_fetched") {
    throw new Error("self-test failed: targets must not be fetched");
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
        maxTargetsPerMatch: args.maxTargetsPerMatch
      });

  const outputPath = args.output || "data/football-truth/_diagnostics/final-result-source-search-targets.json";
  writeJson(outputPath, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    output: outputPath,
    caseCount: report.summary.caseCount,
    totalSearchTargets: report.summary.totalSearchTargets,
    canonicalWrites: report.canonicalWrites,
    noFetch: report.guarantees.noFetch,
    noFinalTruthDecision: report.guarantees.noFinalTruthDecision,
    noCanonicalPromotion: report.guarantees.noCanonicalPromotion
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    job: "materialize-final-result-source-search-targets-file",
    error: err && err.message ? err.message : String(err),
    canonicalWrites: 0,
    noFetch: true,
    noFinalTruthDecision: true,
    noCanonicalPromotion: true
  }, null, 2));
  process.exitCode = 1;
}
