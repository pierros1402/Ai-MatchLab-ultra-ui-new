import fs from "fs";
import path from "path";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getWorksetPath(dayKey) {
  return resolveDataPath("player-usage", "_workset", `${dayKey}.json`);
}

function buildTask(teamRow, dayKey) {
  return {
    taskId: `player_usage:${dayKey}:${teamRow.key}`,
    taskType: "player_usage",
    dayKey,
    key: teamRow.key,
    team: teamRow.team,
    leagueSlug: teamRow.leagueSlug || null,
    status: "pending",
    reason: teamRow.reason || "needs_player_usage_population",
    targetOutputFile: resolveDataPath(
      "player-usage",
      "_research-results",
      dayKey,
      `${teamRow.key}.json`
    ),
    researchGoal: {
      description: "Collect recent player usage for this team without relying on ESPN as the canonical source.",
      requiredMatches: 5,
      requiredFields: [
        "date",
        "opponent",
        "side",
        "players[].name",
        "players[].starter",
        "players[].minutes",
        "players[].position"
      ]
    },
    suggestedQueries: [
      `"${teamRow.team}" lineup last match`,
      `"${teamRow.team}" starting eleven`,
      `"${teamRow.team}" recent lineups`,
      `"${teamRow.team}" squad minutes`,
      `"${teamRow.team}" ${teamRow.leagueSlug || ""} lineups`
    ],
    outputSchema: {
      team: teamRow.team,
      leagueSlug: teamRow.leagueSlug || null,
      source: "player_usage_research",
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
    }
  };
}

export async function buildPlayerUsageResearchTasksDay(dayKey) {
  const worksetPath = getWorksetPath(dayKey);

  if (!fs.existsSync(worksetPath)) {
    throw new Error(`workset not found: ${worksetPath}`);
  }

  const workset = readJsonSafe(worksetPath, null);

  if (!workset || !Array.isArray(workset.teams)) {
    throw new Error("invalid workset format");
  }

  const teams = workset.teams.filter(team =>
    ["missing", "insufficient"].includes(team.usageStatus)
  );

  const tasks = teams.map(team => buildTask(team, dayKey));

  const outPath = resolveDataPath(
    "player-usage",
    "_research-tasks",
    `${dayKey}.json`
  );

  ensureDir(path.dirname(outPath));

  const output = {
    ok: true,
    dayKey,
    taskCount: tasks.length,
    generatedAt: new Date().toISOString(),
    tasks
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  return {
    ok: true,
    dayKey,
    taskCount: tasks.length,
    file: outPath
  };
}

const isCli =
  process.argv[1] &&
  import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href;

if (isCli) {
  const dayKey = process.argv[2];

  if (!dayKey) {
    console.error("Usage: node build-player-usage-research-tasks-day.js <YYYY-MM-DD>");
    process.exit(1);
  }

  buildPlayerUsageResearchTasksDay(dayKey)
    .then(res => {
      console.log("[build-player-usage-research-tasks-day] result:", res);
    })
    .catch(err => {
      console.error("[build-player-usage-research-tasks-day] fatal:", err);
      process.exit(1);
    });
}