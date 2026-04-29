import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { runPlayerUsageProvider } from "../ai-match-intelligence/remote-providers/player-usage-provider.js";
import { writePlayerUsageRecord } from "../storage/player-usage-db.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function resolveResearchTasksPath(dayKey) {
  return resolveDataPath("player-usage", "_research-tasks", `${dayKey}.json`);
}

function resolveResearchAuditPath(dayKey) {
  return resolveDataPath("player-usage", "_research-audit", `${dayKey}.json`);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function getTaskKey(task) {
  return normalizeText(task?.key);
}

function getTaskTeam(task) {
  return normalizeText(task?.team);
}

function hasUsableUsageData(providerResult) {
  return (
    providerResult?.status === "ok" &&
    providerResult?.data &&
    Array.isArray(providerResult.data.matches) &&
    providerResult.data.matches.length > 0
  );
}

export async function runPlayerUsageResearchTasksDay(dayKey, { maxTasks = Infinity } = {}) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const tasksPath = resolveResearchTasksPath(safeDayKey);
  const tasksDoc = readJsonSafe(tasksPath, null);

  if (!tasksDoc || !Array.isArray(tasksDoc.tasks)) {
    throw new Error(`player-usage research tasks not found or invalid: ${tasksPath}`);
  }

  const limitedTasks = tasksDoc.tasks.slice(
    0,
    Number.isFinite(Number(maxTasks)) ? Number(maxTasks) : tasksDoc.tasks.length
  );

  const results = [];
  const canonicalWrites = [];

  for (const task of limitedTasks) {
    const key = getTaskKey(task);
    const team = getTaskTeam(task);

    const providerResult = await runPlayerUsageProvider({
      key,
      team,
      leagueSlug: task?.leagueSlug || null,
      dayKey: safeDayKey
    });

    let canonicalWrite = null;

    if (hasUsableUsageData(providerResult)) {
      const record = {
        ...providerResult.data,
        key,
        team,
        leagueSlug: task?.leagueSlug || providerResult.data.leagueSlug || null,
        updatedAt: new Date().toISOString()
      };

      canonicalWrite = writePlayerUsageRecord(record);
      canonicalWrites.push(canonicalWrite);
    }

    results.push({
      taskId: task?.taskId || null,
      taskType: task?.taskType || "player_usage",
      status: hasUsableUsageData(providerResult)
        ? "accepted_player_usage"
        : "unresolved_player_usage",
      dayKey: safeDayKey,
      key,
      team,
      leagueSlug: task?.leagueSlug || null,
      providerAudit: {
        status: providerResult?.status || "unavailable",
        reason: providerResult?.reason || null,
        confidence: providerResult?.confidence ?? 0,
        source: providerResult?.data?.source || null,
        matchCount: Array.isArray(providerResult?.data?.matches)
          ? providerResult.data.matches.length
          : 0,
        meta: providerResult?.data?.meta || null
      },
      canonicalWrite,
      audit: {
        executedAt: new Date().toISOString(),
        executor: "run-player-usage-research-tasks-day"
      }
    });
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    taskCount: limitedTasks.length,
    acceptedPlayerUsageCount: results.filter(x => x.status === "accepted_player_usage").length,
    unresolvedPlayerUsageCount: results.filter(x => x.status === "unresolved_player_usage").length,
    canonicalWriteCount: canonicalWrites.filter(x => x?.ok).length,
    canonicalWrites,
    results,
    updatedAt: new Date().toISOString()
  };

  const outPath = resolveResearchAuditPath(safeDayKey);
  writeJson(outPath, out);

  return {
    ...out,
    file: outPath
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];
  const maxTasksArg = process.argv[3];

  const maxTasks =
    Number.isFinite(Number(maxTasksArg)) && Number(maxTasksArg) > 0
      ? Number(maxTasksArg)
      : Infinity;

  console.log("[run-player-usage-research-tasks-day] cli:start", {
    dayKey,
    maxTasks: Number.isFinite(maxTasks) ? maxTasks : "all"
  });

  runPlayerUsageResearchTasksDay(dayKey, { maxTasks })
    .then(result => {
      console.log("[run-player-usage-research-tasks-day] cli:done", {
        ok: result?.ok,
        dayKey: result?.dayKey,
        taskCount: result?.taskCount ?? 0,
        acceptedPlayerUsageCount: result?.acceptedPlayerUsageCount ?? 0,
        unresolvedPlayerUsageCount: result?.unresolvedPlayerUsageCount ?? 0,
        canonicalWriteCount: result?.canonicalWriteCount ?? 0,
        file: result?.file || null
      });
    })
    .catch(err => {
      console.error("[run-player-usage-research-tasks-day] cli:fatal", err);
      process.exit(1);
    });
}