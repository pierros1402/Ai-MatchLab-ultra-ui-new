import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

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

function normalizeText(value) {
  return String(value || "").trim();
}

function getTasksPath(dayKey) {
  return resolveDataPath("player-usage", "_research-tasks", `${dayKey}.json`);
}

function getRequestDir(dayKey) {
  return resolveDataPath("player-usage", "_ai-requests", dayKey);
}

function getRequestPath(dayKey, teamKey) {
  return resolveDataPath("player-usage", "_ai-requests", dayKey, `${teamKey}.json`);
}

function getTargetResultPath(dayKey, teamKey) {
  return resolveDataPath("player-usage", "_research-results", dayKey, `${teamKey}.json`);
}

function buildPrompt(task) {
  return [
    `You are AIMatchLab player-usage research.`,
    ``,
    `Goal: collect recent player usage for ${task.team}.`,
    `League/context: ${task.leagueSlug || "unknown"}.`,
    ``,
    `Return only valid JSON. No markdown.`,
    ``,
    `Required output schema:`,
    JSON.stringify({
      team: task.team,
      leagueSlug: task.leagueSlug || null,
      source: "ai_player_usage_research",
      confidence: 0,
      matches: [
        {
          date: "YYYY-MM-DD",
          opponent: "Opponent name",
          side: "home|away",
          players: [
            {
              name: "Player name",
              starter: true,
              minutes: 90,
              position: "optional"
            }
          ]
        }
      ]
    }, null, 2),
    ``,
    `Rules:`,
    `- Use recent matches only, ideally last 5.`,
    `- Prefer official club lineups, competition match centres, reliable lineup reports, or match reports.`,
    `- Do not use ESPN as the canonical source.`,
    `- Do not invent player names.`,
    `- If player minutes are unavailable but starters are known, set minutes to null.`,
    `- If no reliable player-level evidence exists, return matches: [] and confidence: 0.`,
    `- Output must be directly writable to the target file.`,
    ``,
    `Suggested searches:`,
    ...(Array.isArray(task.suggestedQueries) ? task.suggestedQueries.map(q => `- ${q}`) : [])
  ].join("\n");
}

function buildAiRequest(task, dayKey) {
  const teamKey = normalizeText(task.key);

  return {
    ok: true,
    requestType: "player_usage_ai_research",
    dayKey,
    taskId: task.taskId || null,
    key: teamKey,
    team: task.team,
    leagueSlug: task.leagueSlug || null,
    status: "pending_ai_research",
    targetOutputFile: getTargetResultPath(dayKey, teamKey),
    prompt: buildPrompt(task),
    outputSchema: task.outputSchema || null,
    researchGoal: task.researchGoal || null,
    generatedAt: new Date().toISOString()
  };
}

export async function buildPlayerUsageAiRequestsDay(dayKey) {
  const safeDayKey = normalizeText(dayKey);

  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const tasksPath = getTasksPath(safeDayKey);
  const tasksDoc = readJsonSafe(tasksPath, null);

  if (!tasksDoc || !Array.isArray(tasksDoc.tasks)) {
    throw new Error(`player-usage research tasks not found or invalid: ${tasksPath}`);
  }

  const outDir = getRequestDir(safeDayKey);
  ensureDir(outDir);

  const requests = [];

  for (const task of tasksDoc.tasks) {
    const teamKey = normalizeText(task.key);
    if (!teamKey) continue;

    const request = buildAiRequest(task, safeDayKey);
    const file = getRequestPath(safeDayKey, teamKey);

    writeJson(file, request);

    requests.push({
      key: teamKey,
      team: task.team,
      leagueSlug: task.leagueSlug || null,
      file,
      targetOutputFile: request.targetOutputFile
    });
  }

  const indexPath = resolveDataPath(
    "player-usage",
    "_ai-requests",
    `${safeDayKey}.json`
  );

  const index = {
    ok: true,
    dayKey: safeDayKey,
    requestCount: requests.length,
    generatedAt: new Date().toISOString(),
    requests
  };

  writeJson(indexPath, index);

  return {
    ok: true,
    dayKey: safeDayKey,
    requestCount: requests.length,
    dir: outDir,
    indexFile: indexPath
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];

  console.log("[build-player-usage-ai-requests-day] cli:start", { dayKey });

  buildPlayerUsageAiRequestsDay(dayKey)
    .then(result => {
      console.log("[build-player-usage-ai-requests-day] cli:done", result);
    })
    .catch(err => {
      console.error("[build-player-usage-ai-requests-day] cli:fatal", err);
      process.exit(1);
    });
}