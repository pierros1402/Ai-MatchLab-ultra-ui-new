import fs from "fs";
import path from "path";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import {
  normalizePlayerUsageTeamKey,
  readPlayerUsageRecord
} from "../storage/player-usage-db.js";

// ---------- helpers ----------

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function getDetailsDir(dayKey) {
  return resolveDataPath("details", dayKey);
}

function readDetailsForDay(dayKey) {
  const dir = getDetailsDir(dayKey);

  if (!fs.existsSync(dir)) {
    throw new Error(`details dir not found: ${dir}`);
  }

  const files = fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .map(name => path.join(dir, name));

  const details = [];

  for (const file of files) {
    const row = readJsonSafe(file, null);
    if (row && typeof row === "object") {
      details.push(row);
    }
  }

  return details;
}

function getMatchId(match) {
  return (
    match?.basic?.matchId ||
    match?.basic?.id ||
    match?.matchId ||
    match?.id ||
    null
  );
}

function getKickoff(match) {
  return (
    match?.basic?.kickoff ||
    match?.basic?.date ||
    match?.basic?.startTime ||
    match?.kickoff ||
    match?.date ||
    null
  );
}

function collectTeamsFromDetails(details = [], dayKey = null) {
  const teams = new Map();

  function addTeamContext({ team, opponent, side, leagueSlug, match }) {
    if (!team) return;

    const key = normalizePlayerUsageTeamKey(team);

    if (!teams.has(key)) {
      teams.set(key, {
        key,
        team,
        leagueSlug: leagueSlug || null,
        matchContexts: []
      });
    }

    const row = teams.get(key);

    if (!row.leagueSlug && leagueSlug) {
      row.leagueSlug = leagueSlug;
    }

    row.matchContexts.push({
      matchId: getMatchId(match),
      dayKey: match?.basic?.dayKey || dayKey || null,
      opponent: opponent || null,
      side,
      leagueSlug: leagueSlug || null,
      kickoff: getKickoff(match)
    });
  }

  for (const match of details) {
    const home = match?.basic?.homeTeam;
    const away = match?.basic?.awayTeam;
    const leagueSlug = match?.basic?.leagueSlug;

    addTeamContext({
      team: home,
      opponent: away,
      side: "home",
      leagueSlug,
      match
    });

    addTeamContext({
      team: away,
      opponent: home,
      side: "away",
      leagueSlug,
      match
    });
  }

  return Array.from(teams.values()).map(row => ({
    ...row,
    matchContexts: row.matchContexts.slice(0, 5)
  }));
}

function evaluateTeamUsageState(teamRow) {
  const existing = readPlayerUsageRecord(teamRow.key);

  if (!existing) {
    return {
      status: "missing",
      reason: "no_canonical_player_usage_record"
    };
  }

  const matchCount = Array.isArray(existing.matches) ? existing.matches.length : 0;

  if (matchCount < 3) {
    return {
      status: "insufficient",
      reason: "not_enough_matches",
      matchCount
    };
  }

  return {
    status: "ok",
    matchCount
  };
}

// ---------- main ----------

export async function buildPlayerUsageWorksetDay(dayKey) {
  const details = readDetailsForDay(dayKey);

  const teams = collectTeamsFromDetails(details, dayKey);

  const results = [];
  let missingCount = 0;
  let insufficientCount = 0;
  let okCount = 0;

  for (const teamRow of teams) {
    const state = evaluateTeamUsageState(teamRow);

    if (state.status === "missing") missingCount++;
    if (state.status === "insufficient") insufficientCount++;
    if (state.status === "ok") okCount++;

    results.push({
      ...teamRow,
      usageStatus: state.status,
      reason: state.reason || null,
      matchCount: state.matchCount || 0
    });
  }

  const outPath = resolveDataPath(
    "player-usage",
    "_workset",
    `${dayKey}.json`
  );

  ensureDir(path.dirname(outPath));

  const output = {
    ok: true,
    dayKey,
    teamCount: results.length,
    missingCount,
    insufficientCount,
    okCount,
    generatedAt: new Date().toISOString(),
    teams: results
  };

  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");

  return {
    ok: true,
    dayKey,
    teamCount: results.length,
    missingCount,
    insufficientCount,
    okCount,
    file: outPath
  };
}

// ---------- CLI ----------

const isCli = process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href;

if (isCli) {
  const dayKey = process.argv[2];

  if (!dayKey) {
    console.error("Usage: node build-player-usage-workset-day.js <YYYY-MM-DD>");
    process.exit(1);
  }

  buildPlayerUsageWorksetDay(dayKey)
    .then((res) => {
      console.log("[build-player-usage-workset-day] result:", res);
    })
    .catch((err) => {
      console.error("[build-player-usage-workset-day] fatal:", err);
      process.exit(1);
    });
}