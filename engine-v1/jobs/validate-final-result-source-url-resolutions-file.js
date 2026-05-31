#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../..");

const ALLOWED_SOURCE_TYPES = new Set(["official", "provider", "trusted", "other"]);
const ALLOWED_RESOLVED_BY = new Set(["manual", "external_search", "operator", "diagnostic"]);

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
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
    "  node engine-v1/jobs/validate-final-result-source-url-resolutions-file.js --input <url-resolutions.json> [--output <validated.json>]",
    "",
    "Input shape:",
    "  { cases: [{ resolutionTasks: [] }], urlResolutions: [] }",
    "",
    "Purpose:",
    "  Validate manually/externally supplied resolved URLs against source resolution tasks.",
    "",
    "Guarantees:",
    "  - read-only diagnostic",
    "  - no fetch",
    "  - no URL fetch",
    "  - no final truth decision",
    "  - canonicalWrites: 0",
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

function normalizeUrl(value) {
  const raw = cleanString(value);
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function hostnameOf(value) {
  const normalized = normalizeUrl(value);
  if (!normalized) return "";
  try {
    return new URL(normalized).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function normalizeCases(input) {
  if (Array.isArray(input?.cases)) return input.cases;
  if (Array.isArray(input?.results)) return input.results;
  if (Array.isArray(input?.rows)) return input.rows;
  return [];
}

function normalizeUrlResolutions(input) {
  if (Array.isArray(input?.urlResolutions)) return input.urlResolutions;
  if (Array.isArray(input?.resolvedUrls)) return input.resolvedUrls;
  if (Array.isArray(input?.resolutions)) return input.resolutions;
  return [];
}

function flattenResolutionTasks(cases) {
  const tasks = [];

  for (const caseRow of cases) {
    for (const task of asArray(caseRow?.resolutionTasks)) {
      tasks.push({
        ...task,
        caseMatchId: cleanString(caseRow?.matchId),
        caseDay: cleanString(caseRow?.day),
        caseLeagueSlug: cleanString(caseRow?.leagueSlug)
      });
    }
  }

  return tasks;
}

function taskMapById(tasks) {
  const map = new Map();

  for (const task of tasks) {
    const taskId = cleanString(task?.taskId);
    if (taskId) map.set(taskId, task);
  }

  return map;
}

function validateResolution(row, index, taskById) {
  const warnings = [];
  const errors = [];

  const taskId = cleanString(row?.taskId);
  const task = taskById.get(taskId) || null;

  const normalizedUrl = normalizeUrl(row?.resolvedUrl || row?.url || row?.sourceUrl);
  const host = hostnameOf(normalizedUrl);

  const sourceName = cleanString(row?.sourceName || row?.name);
  const sourceTypeRaw = cleanString(row?.sourceType || row?.type || "other").toLowerCase();
  const sourceType = ALLOWED_SOURCE_TYPES.has(sourceTypeRaw) ? sourceTypeRaw : "other";

  const resolvedByRaw = cleanString(row?.resolvedBy || "manual").toLowerCase();
  const resolvedBy = ALLOWED_RESOLVED_BY.has(resolvedByRaw) ? resolvedByRaw : "manual";

  if (!taskId) errors.push("missing_task_id");
  if (taskId && !task) errors.push("unknown_task_id");
  if (!normalizedUrl) errors.push("invalid_or_missing_http_url");
  if (!sourceName) warnings.push("missing_source_name");
  if (sourceTypeRaw && !ALLOWED_SOURCE_TYPES.has(sourceTypeRaw)) warnings.push("unknown_source_type_normalized_to_other");
  if (resolvedByRaw && !ALLOWED_RESOLVED_BY.has(resolvedByRaw)) warnings.push("unknown_resolved_by_normalized_to_manual");

  const accepted = errors.length === 0;

  const common = {
    index,
    taskId,
    matchId: cleanString(row?.matchId || task?.matchId || task?.caseMatchId),
    day: cleanString(row?.day || task?.day || task?.caseDay),
    leagueSlug: cleanString(row?.leagueSlug || task?.leagueSlug || task?.caseLeagueSlug),
    sourceName,
    sourceType,
    resolvedBy,
    resolvedUrl: normalizedUrl || null,
    host: host || null,
    notes: cleanString(row?.notes),
    original: row,
    matchedTask: task ? {
      taskId: cleanString(task.taskId),
      targetId: cleanString(task.targetId),
      query: cleanString(task?.resolution?.query),
      intent: cleanString(task?.resolution?.intent),
      resolutionState: cleanString(task?.resolution?.resolutionState),
      homeTeam: cleanString(task?.homeTeam || task?.teams?.home || task?.watchRow?.homeTeam || task?.caseTeams?.home),
      awayTeam: cleanString(task?.awayTeam || task?.teams?.away || task?.watchRow?.awayTeam || task?.caseTeams?.away),
      teams: {
        home: cleanString(task?.teams?.home || task?.homeTeam || task?.watchRow?.homeTeam || task?.caseTeams?.home),
        away: cleanString(task?.teams?.away || task?.awayTeam || task?.watchRow?.awayTeam || task?.caseTeams?.away)
      }
    } : null,
    warnings,
    errors,
    canonicalWrites: 0
  };

  if (accepted) {
    return {
      accepted: true,
      row: {
        ...common,
        validationState: "validated_resolved_source_url",
        fetchState: "not_fetched",
        preparedEvidenceState: "not_prepared",
        finalTruthDecisionState: "not_decided",
        canonicalPromotionState: "blocked"
      }
    };
  }

  return {
    accepted: false,
    row: {
      ...common,
      validationState: "rejected_resolved_source_url"
    }
  };
}

function summarize(validated, rejected) {
  const bySourceType = {};
  const byResolvedBy = {};
  const byHost = {};
  const byRejectReason = {};

  for (const row of validated) {
    bySourceType[row.sourceType || "unknown"] = (bySourceType[row.sourceType || "unknown"] || 0) + 1;
    byResolvedBy[row.resolvedBy || "unknown"] = (byResolvedBy[row.resolvedBy || "unknown"] || 0) + 1;
    byHost[row.host || "unknown"] = (byHost[row.host || "unknown"] || 0) + 1;
  }

  for (const row of rejected) {
    for (const err of row.errors || []) {
      byRejectReason[err] = (byRejectReason[err] || 0) + 1;
    }
  }

  return {
    inputUrlResolutions: validated.length + rejected.length,
    validatedCount: validated.length,
    rejectedCount: rejected.length,
    bySourceType,
    byResolvedBy,
    byHost,
    byRejectReason
  };
}

function buildReport(input, options = {}) {
  const cases = normalizeCases(input);
  const tasks = flattenResolutionTasks(cases);
  const taskById = taskMapById(tasks);
  const urlResolutions = normalizeUrlResolutions(input);

  const validatedResolvedSourceUrls = [];
  const rejectedUrlResolutions = [];

  urlResolutions.forEach((row, index) => {
    const result = validateResolution(row, index, taskById);
    if (result.accepted) {
      validatedResolvedSourceUrls.push(result.row);
    } else {
      rejectedUrlResolutions.push(result.row);
    }
  });

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    job: "validate-final-result-source-url-resolutions-file",
    mode: "read_only_url_resolution_validation",
    canonicalWrites: 0,
    input: {
      path: options.inputPath || null,
      caseCount: cases.length,
      resolutionTaskCount: tasks.length,
      urlResolutionCount: urlResolutions.length
    },
    summary: summarize(validatedResolvedSourceUrls, rejectedUrlResolutions),
    guarantees: {
      noFetch: true,
      noUrlFetch: true,
      noFinalTruthDecision: true,
      noCanonicalPromotion: true,
      noProductionRepair: true,
      noFixtureWrite: true,
      noHistoryWrite: true,
      noValueWrite: true,
      noDetailsWrite: true,
      canonicalWrites: 0
    },
    validatedResolvedSourceUrls,
    rejectedUrlResolutions
  };
}

function runSelfTest() {
  const input = {
    cases: [
      {
        matchId: "self-test-1",
        day: "2026-05-18",
        leagueSlug: "test.1",
        resolutionTasks: [
          {
            taskId: "task-1",
            targetId: "target-1",
            matchId: "self-test-1",
            day: "2026-05-18",
            leagueSlug: "test.1",
            resolution: {
              query: "\"Alpha FC\" \"Beta FC\" final score",
              intent: "exact_match_final_result",
              resolutionState: "manual_or_external_search_needed"
            }
          }
        ]
      }
    ],
    urlResolutions: [
      {
        taskId: "task-1",
        resolvedUrl: "https://example.com/match-report",
        sourceName: "Example Match Report",
        sourceType: "trusted",
        resolvedBy: "manual",
        notes: "self-test valid resolution"
      },
      {
        taskId: "missing-task",
        resolvedUrl: "not-a-url",
        sourceName: "Bad Resolution",
        sourceType: "trusted",
        resolvedBy: "manual"
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test" });

  if (report.canonicalWrites !== 0 || report.guarantees.canonicalWrites !== 0) {
    throw new Error("self-test failed: canonicalWrites must be 0");
  }

  if (!report.guarantees.noFetch || !report.guarantees.noUrlFetch || !report.guarantees.noFinalTruthDecision || !report.guarantees.noCanonicalPromotion) {
    throw new Error("self-test failed: read-only guarantees missing");
  }

  if (report.summary.validatedCount !== 1 || report.summary.rejectedCount !== 1) {
    throw new Error("self-test failed: expected one validated and one rejected URL resolution");
  }

  const valid = report.validatedResolvedSourceUrls[0];
  if (valid.fetchState !== "not_fetched" || valid.finalTruthDecisionState !== "not_decided" || valid.canonicalPromotionState !== "blocked") {
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
    : buildReport(readJson(args.input), { inputPath: args.input });

  const outputPath = args.output || "data/football-truth/_diagnostics/final-result-source-url-resolutions.json";
  writeJson(outputPath, report, args.pretty);

  console.log(JSON.stringify({
    ok: report.ok,
    job: report.job,
    output: outputPath,
    validatedCount: report.summary.validatedCount,
    rejectedCount: report.summary.rejectedCount,
    canonicalWrites: report.canonicalWrites,
    noFetch: report.guarantees.noFetch,
    noUrlFetch: report.guarantees.noUrlFetch,
    noFinalTruthDecision: report.guarantees.noFinalTruthDecision,
    noCanonicalPromotion: report.guarantees.noCanonicalPromotion
  }, null, 2));
}

try {
  main();
} catch (err) {
  console.error(JSON.stringify({
    ok: false,
    job: "validate-final-result-source-url-resolutions-file",
    error: err && err.message ? err.message : String(err),
    canonicalWrites: 0,
    noFetch: true,
    noUrlFetch: true,
    noFinalTruthDecision: true,
    noCanonicalPromotion: true
  }, null, 2));
  process.exitCode = 1;
}
