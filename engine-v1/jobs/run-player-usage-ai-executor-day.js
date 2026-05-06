import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { normalizePlayerUsageTeamKey } from "../storage/player-usage-db.js";
import { runPlayerUsageLocalAiDay } from "./run-player-usage-local-ai-day.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function requestsDir(dayKey) {
  return resolveDataPath("player-usage", "_ai-requests", dayKey);
}

function bundlesDir(dayKey) {
  return resolveDataPath("player-usage", "_executor-bundles", dayKey);
}

function bundleIndexPath(dayKey) {
  return resolveDataPath("player-usage", "_executor-bundles", `${dayKey}.json`);
}

function auditPath(dayKey) {
  return resolveDataPath("player-usage", "_executor-audit", `${dayKey}.json`);
}

function listRequestFiles(dayKey) {
  const dir = requestsDir(dayKey);

  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(ent => ent.isFile() && ent.name.endsWith(".json"))
    .map(ent => path.join(dir, ent.name))
    .sort((a, b) => a.localeCompare(b));
}

function compactRequest(filePath) {
  const raw = readJsonSafe(filePath, null);

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const team = normalizeText(raw.team || raw.targetTeam || raw.key);
  const key = normalizePlayerUsageTeamKey(raw.key || team || path.basename(filePath, ".json"));

  if (!key || !team) {
    return null;
  }

  const targetOutputFile =
    normalizeText(raw.targetOutputFile) ||
    resolveDataPath("player-usage", "_research-results", raw.dayKey || "", `${key}.json`);

  return {
    key,
    team,
    leagueSlug: normalizeText(raw.leagueSlug) || null,
    dayKey: normalizeText(raw.dayKey) || null,
    requestFile: path.relative(resolveDataPath(), filePath),
    targetOutputFile,
    matchContexts: Array.isArray(raw.matchContexts) ? raw.matchContexts : [],
    prompt: normalizeText(raw.prompt),
    outputSchema: {
      team: "string",
      leagueSlug: "string|null",
      confidence: "number 0..1",
      source: "player-usage-ai-research",
      matches: [
        {
          matchId: "string|null",
          date: "YYYY-MM-DD|string|null",
          opponent: "string|null",
          side: "home|away",
          players: [
            {
              name: "string",
              starter: "boolean",
              minutes: "number|null",
              position: "string|null"
            }
          ]
        }
      ],
      notes: ["string"],
      meta: {
        executor: "manual-bundle|future-executor",
        evidenceLevel: "manual|researched|unknown"
      }
    }
  };
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function parseArgs(argv) {
  const args = {
    dayKey: null,
    mode: process.env.PLAYER_USAGE_AI_EXECUTOR_MODE || "disabled",
    limit: null,
    batchSize: 8,
    maxRequests: null
  };

  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      args.mode = normalizeText(arg.slice("--mode=".length)) || args.mode;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      args.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
      continue;
    }

    if (arg.startsWith("--batch-size=")) {
      const n = Number(arg.slice("--batch-size=".length));
      args.batchSize = Number.isFinite(n) && n > 0 ? Math.floor(n) : args.batchSize;
      continue;
    }

    if (arg.startsWith("--max-requests=")) {
      const n = Number(arg.slice("--max-requests=".length));
      args.maxRequests = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
      continue;
    }

    if (!args.dayKey) {
      args.dayKey = arg;
    }
  }

  return args;
}

export async function runPlayerUsageAiExecutorDay(dayKey, options = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("runPlayerUsageAiExecutorDay: missing dayKey");
  }

  const mode = normalizeText(options.mode || process.env.PLAYER_USAGE_AI_EXECUTOR_MODE || "disabled");
  const batchSize = Number.isFinite(Number(options.batchSize)) && Number(options.batchSize) > 0
    ? Math.floor(Number(options.batchSize))
    : 8;

  const limit = Number.isFinite(Number(options.limit)) && Number(options.limit) > 0
    ? Math.floor(Number(options.limit))
    : null;

  const maxRequests = Number.isFinite(Number(options.maxRequests)) && Number(options.maxRequests) > 0
    ? Math.floor(Number(options.maxRequests))
    : (limit || 2);

  const files = listRequestFiles(safeDayKey);
  const requests = files
    .map(compactRequest)
    .filter(Boolean)
    .slice(0, limit || undefined);

  const base = {
    ok: true,
    dayKey: safeDayKey,
    mode,
    requestCount: files.length,
    selectedCount: requests.length,
    canonicalWriteCount: 0,
    researchResultWriteCount: 0,
    note: "executor contract only; canonical writes are handled by validator/importer",
    updatedAt: new Date().toISOString()
  };

  if (mode === "disabled") {
    const audit = {
      ...base,
      bundleCount: 0,
      bundles: [],
      reason: "executor_disabled"
    };

    writeJson(auditPath(safeDayKey), audit);

    return {
      ...audit,
      file: auditPath(safeDayKey)
    };
  }

  if (mode === "local-ai-candidates") {
    let localAiResult = null;
    let audit = null;

    try {
      localAiResult = await runPlayerUsageLocalAiDay(safeDayKey, {
        maxRequests
      });

      audit = {
        ...base,
        ok: true,
        bundleCount: 0,
        bundles: [],
        maxRequests,
        candidateWrittenCount: localAiResult?.candidateWrittenCount ?? 0,
        acceptedCount: localAiResult?.acceptedCount ?? 0,
        rejectedCount: localAiResult?.rejectedCount ?? 0,
        failedCount: localAiResult?.failedCount ?? 0,
        localAiAuditFile: localAiResult?.file || null,
        reason: "local_ai_candidates_written_for_review",
        note: "local AI executor writes candidate-only records; promotion requires reviewed:true and productionGrade:true"
      };
    } catch (err) {
      audit = {
        ...base,
        ok: false,
        bundleCount: 0,
        bundles: [],
        maxRequests,
        candidateWrittenCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        failedCount: 1,
        localAiAuditFile: null,
        reason: `local_ai_executor_failed:${err?.message || err}`,
        note: "local AI executor failed before candidate review/promotion"
      };
    }

    writeJson(auditPath(safeDayKey), audit);

    return {
      ...audit,
      file: auditPath(safeDayKey)
    };
  }

  if (mode !== "manual-bundle") {
    const audit = {
      ...base,
      ok: false,
      bundleCount: 0,
      bundles: [],
      reason: `unsupported_executor_mode:${mode}`
    };

    writeJson(auditPath(safeDayKey), audit);

    return {
      ...audit,
      file: auditPath(safeDayKey)
    };
  }

  const groups = chunk(requests, batchSize);
  const writtenBundles = [];

  ensureDir(bundlesDir(safeDayKey));

  groups.forEach((group, index) => {
    const batchNo = String(index + 1).padStart(3, "0");
    const file = path.join(bundlesDir(safeDayKey), `batch-${batchNo}.json`);

    const payload = {
      dayKey: safeDayKey,
      mode,
      batchNo: index + 1,
      count: group.length,
      instructions: [
        "For each request, produce one strict JSON research result.",
        "Write each result to the exact targetOutputFile path shown in the request.",
        "Do not invent confirmed facts. If evidence is weak, use confidence below validator threshold or leave matches empty.",
        "Canonical data/player-usage files must not be edited directly."
      ],
      resultContract: {
        targetFolder: `data/player-usage/_research-results/${safeDayKey}/`,
        importer: "run-player-usage-research-tasks-day.js",
        validator: "player-usage-validator.js",
        canonicalWrite: "only after validator accepts result"
      },
      requests: group
    };

    writeJson(file, payload);

    writtenBundles.push({
      batchNo: index + 1,
      file,
      relativeFile: path.relative(resolveDataPath(), file),
      count: group.length,
      teams: group.map(x => x.team)
    });
  });

  const indexPayload = {
    ...base,
    bundleCount: writtenBundles.length,
    bundles: writtenBundles,
    bundleDir: bundlesDir(safeDayKey),
    updatedAt: new Date().toISOString()
  };

  writeJson(bundleIndexPath(safeDayKey), indexPayload);
  writeJson(auditPath(safeDayKey), indexPayload);

  return {
    ...indexPayload,
    file: bundleIndexPath(safeDayKey),
    auditFile: auditPath(safeDayKey)
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const args = parseArgs(process.argv.slice(2));

  console.log("[run-player-usage-ai-executor-day] cli:start", args);

  runPlayerUsageAiExecutorDay(args.dayKey, args)
    .then(result => {
      console.log("[run-player-usage-ai-executor-day] cli:done", {
        ok: result.ok,
        dayKey: result.dayKey,
        mode: result.mode,
        requestCount: result.requestCount,
        selectedCount: result.selectedCount,
        bundleCount: result.bundleCount,
        candidateWrittenCount: result.candidateWrittenCount ?? 0,
        acceptedCount: result.acceptedCount ?? 0,
        rejectedCount: result.rejectedCount ?? 0,
        failedCount: result.failedCount ?? 0,
        canonicalWriteCount: result.canonicalWriteCount,
        researchResultWriteCount: result.researchResultWriteCount,
        file: result.file,
        auditFile: result.auditFile || null,
        reason: result.reason || null
      });
    })
    .catch(err => {
      console.error("[run-player-usage-ai-executor-day] cli:fatal", err);
      process.exit(1);
    });
}