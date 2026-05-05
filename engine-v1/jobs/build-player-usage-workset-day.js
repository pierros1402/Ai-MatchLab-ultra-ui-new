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

function getDeploySnapshotDetailsDir(dayKey) {
  return resolveDataPath("deploy-snapshots", dayKey, "details");
}

function resolveDetailsDirForDay(dayKey) {
  const canonicalDir = getDetailsDir(dayKey);

  if (fs.existsSync(canonicalDir)) {
    return {
      dir: canonicalDir,
      source: "canonical_details"
    };
  }

  const snapshotDir = getDeploySnapshotDetailsDir(dayKey);

  if (fs.existsSync(snapshotDir)) {
    return {
      dir: snapshotDir,
      source: "deploy_snapshot_details"
    };
  }

  throw new Error(`details dir not found: ${canonicalDir} or ${snapshotDir}`);
}

function readDetailsForDay(dayKey) {
  const resolved = resolveDetailsDirForDay(dayKey);
  const dir = resolved.dir;

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

  return {
    details,
    detailsSource: resolved.source,
    detailsDir: dir,
    detailsFileCount: files.length
  };
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function countPlayersInMatches(matches = []) {
  const names = new Set();

  for (const match of asArray(matches)) {
    for (const player of asArray(match?.players)) {
      const name = String(player?.name || player?.player || "").trim().toLowerCase();
      if (name) names.add(name);
    }
  }

  return names.size;
}

function countStarterLikePlayers(matches = []) {
  const names = new Set();

  for (const match of asArray(matches)) {
    for (const player of asArray(match?.players)) {
      const name = String(player?.name || player?.player || "").trim().toLowerCase();
      if (!name) continue;

      const starter =
        player?.starter === true ||
        String(player?.role || "").toLowerCase() === "starter" ||
        numberOrZero(player?.minutes) >= 60;

      if (starter) names.add(name);
    }
  }

  return names.size;
}

function getExpectedStartersCount(record = {}) {
  return Math.max(
    asArray(record?.expectedStarters).length,
    asArray(record?.coreStarters).length,
    asArray(record?.starters).length
  );
}

function evaluateTeamUsageState(teamRow) {
  const existing = readPlayerUsageRecord(teamRow.key);

  if (!existing) {
    return {
      status: "missing",
      reason: "no_canonical_player_usage_record",
      matchCount: 0,
      playerCount: 0,
      starterLikeCount: 0,
      expectedStartersCount: 0,
      confidence: 0,
      sampleCount: 0,
      usageQuality: "missing",
      priority: 100
    };
  }

  const matches = asArray(existing.matches);
  const matchCount = matches.length;
  const playerCount = countPlayersInMatches(matches);
  const starterLikeCount = countStarterLikePlayers(matches);
  const expectedStartersCount = getExpectedStartersCount(existing);
  const confidence = numberOrZero(existing.confidence ?? existing?.meta?.confidence);
  const sampleCount = numberOrZero(existing.sampleCount ?? existing?.meta?.sampleCount ?? matchCount);

  const hasReadyStarters = expectedStartersCount >= 8 && confidence >= 0.65;
  const hasReadyMatchSamples =
    matchCount >= 3 &&
    playerCount >= 11 &&
    starterLikeCount >= 8 &&
    confidence >= 0.55;

  if (hasReadyStarters || hasReadyMatchSamples) {
    return {
      status: "ok",
      reason: "usable_player_usage_record",
      matchCount,
      playerCount,
      starterLikeCount,
      expectedStartersCount,
      confidence,
      sampleCount,
      usageQuality: "ready",
      priority: 0
    };
  }

  const hasSomeSignal =
    matchCount > 0 ||
    playerCount > 0 ||
    starterLikeCount > 0 ||
    expectedStartersCount > 0 ||
    confidence > 0 ||
    sampleCount > 0;

  if (hasSomeSignal) {
    return {
      status: "insufficient",
      reason: "partial_or_low_confidence_player_usage_record",
      matchCount,
      playerCount,
      starterLikeCount,
      expectedStartersCount,
      confidence,
      sampleCount,
      usageQuality: "partial",
      priority: 70
    };
  }

  return {
    status: "insufficient",
    reason: "stub_player_usage_record",
    matchCount,
    playerCount,
    starterLikeCount,
    expectedStartersCount,
    confidence,
    sampleCount,
    usageQuality: "stub",
    priority: 90
  };
}

// ---------- main ----------

export async function buildPlayerUsageWorksetDay(dayKey) {
  const detailsPayload = readDetailsForDay(dayKey);
  const details = detailsPayload.details;

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
      usageQuality: state.usageQuality || state.status,
      priority: state.priority || 0,
      matchCount: state.matchCount || 0,
      playerCount: state.playerCount || 0,
      starterLikeCount: state.starterLikeCount || 0,
      expectedStartersCount: state.expectedStartersCount || 0,
      confidence: state.confidence || 0,
      sampleCount: state.sampleCount || 0
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
    detailsSource: detailsPayload.detailsSource,
    detailsDir: detailsPayload.detailsDir,
    detailsFileCount: detailsPayload.detailsFileCount,
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
    detailsSource: detailsPayload.detailsSource,
    detailsDir: detailsPayload.detailsDir,
    detailsFileCount: detailsPayload.detailsFileCount,
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