import fs from "node:fs/promises";
import path from "node:path";
import { resolveDataPath } from "../storage/data-root.js";

const DATA_DIR = resolveDataPath();
const ARCHIVE_ROOT = path.join(DATA_DIR, "history-archive");
const OUT_DIR = path.join(DATA_DIR, "model-priors");

const DEFAULT_TARGET_SEASON = process.argv[2] || "2025-2026";
const DEFAULT_SOURCE_SEASONS = (process.argv[3] || "2021-2022,2022-2023,2023-2024,2024-2025")
  .split(",")
  .map(s => String(s).trim())
  .filter(Boolean);

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function listLeagueDirs() {
  try {
    const entries = await fs.readdir(ARCHIVE_ROOT, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

function sortByKickoffAsc(a, b) {
  return safeNum(a?.kickoff_ms) - safeNum(b?.kickoff_ms);
}

function sortByKickoffDesc(a, b) {
  return safeNum(b?.kickoff_ms) - safeNum(a?.kickoff_ms);
}

function computeStats(matches, orientation = "all") {
  let played = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let gf = 0;
  let ga = 0;
  let over25 = 0;
  let btts = 0;

  for (const m of matches) {
    const isHome = !!m.__isHome;
    if (orientation === "home" && !isHome) continue;
    if (orientation === "away" && isHome) continue;

    const gs = isHome ? safeNum(m.scoreHome) : safeNum(m.scoreAway);
    const gc = isHome ? safeNum(m.scoreAway) : safeNum(m.scoreHome);

    played += 1;
    gf += gs;
    ga += gc;

    if (gs > gc) wins += 1;
    else if (gs < gc) losses += 1;
    else draws += 1;

    if ((safeNum(m.scoreHome) + safeNum(m.scoreAway)) > 2.5) over25 += 1;
    if (safeNum(m.scoreHome) > 0 && safeNum(m.scoreAway) > 0) btts += 1;
  }

  const points = wins * 3 + draws;

  return {
    sample: played,
    ppg: played ? points / played : 0,
    winRate: played ? wins / played : 0,
    drawRate: played ? draws / played : 0,
    lossRate: played ? losses / played : 0,
    gfAvg: played ? gf / played : 0,
    gaAvg: played ? ga / played : 0,
    over25Rate: played ? over25 / played : 0,
    bttsRate: played ? btts / played : 0
  };
}

function canonicalTeamKey(leagueSlug, teamName) {
  return `${leagueSlug}::${teamName}`;
}

function canonicalMatchupKey(leagueSlug, teamA, teamB) {
  const ordered = [teamA, teamB].sort((a, b) => String(a).localeCompare(String(b)));
  return `${leagueSlug}|${ordered[0]}|${ordered[1]}`;
}

function buildLeaguePriors(matches) {
  const map = {};

  for (const m of matches) {
    const slug = String(m.leagueSlug || "").trim();
    if (!slug) continue;

    if (!map[slug]) {
      map[slug] = {
        leagueSlug: slug,
        leagueName: m.leagueName || slug,
        matches: []
      };
    }
    map[slug].matches.push(m);
  }

  const out = {};

  for (const [slug, bucket] of Object.entries(map)) {
    const matches = bucket.matches;
    let totalGoals = 0;
    let draws = 0;
    let btts = 0;
    let over25 = 0;
    let homeWins = 0;
    let awayWins = 0;

    for (const m of matches) {
      const h = safeNum(m.scoreHome);
      const a = safeNum(m.scoreAway);
      totalGoals += (h + a);
      if (h === a) draws += 1;
      if (h > 0 && a > 0) btts += 1;
      if ((h + a) > 2.5) over25 += 1;
      if (h > a) homeWins += 1;
      if (a > h) awayWins += 1;
    }

    const sample = matches.length;

    out[slug] = {
      leagueSlug: slug,
      leagueName: bucket.leagueName,
      sample,
      goalsAvg: sample ? totalGoals / sample : 0,
      drawRate: sample ? draws / sample : 0,
      bttsRate: sample ? btts / sample : 0,
      over25Rate: sample ? over25 / sample : 0,
      homeWinRate: sample ? homeWins / sample : 0,
      awayWinRate: sample ? awayWins / sample : 0
    };
  }

  return out;
}

function buildTeamPriors(matches) {
  const buckets = {};

  for (const m of matches) {
    const leagueSlug = String(m.leagueSlug || "").trim();
    const homeTeam = String(m.homeTeam || "").trim();
    const awayTeam = String(m.awayTeam || "").trim();
    if (!leagueSlug || !homeTeam || !awayTeam) continue;

    const homeKey = canonicalTeamKey(leagueSlug, homeTeam);
    const awayKey = canonicalTeamKey(leagueSlug, awayTeam);

    if (!buckets[homeKey]) {
      buckets[homeKey] = {
        leagueSlug,
        team: homeTeam,
        matches: []
      };
    }
    if (!buckets[awayKey]) {
      buckets[awayKey] = {
        leagueSlug,
        team: awayTeam,
        matches: []
      };
    }

    buckets[homeKey].matches.push({ ...m, __isHome: true });
    buckets[awayKey].matches.push({ ...m, __isHome: false });
  }

  const out = {};

  for (const [key, bucket] of Object.entries(buckets)) {
    const allMatches = [...bucket.matches].sort(sortByKickoffAsc);

    // Only the computed stats are read downstream (value-engine blends all/home/
    // away + sample). The raw per-match rows were the dominant weight in the
    // priors file (~80% of teamPriors, ~90% of matchupPriors) and are never read,
    // so they are intentionally NOT emitted.
    out[key] = {
      team: bucket.team,
      leagueSlug: bucket.leagueSlug,
      sample: allMatches.length,
      all: computeStats(allMatches, "all"),
      home: computeStats(allMatches, "home"),
      away: computeStats(allMatches, "away")
    };
  }

  return out;
}

function buildMatchupPriors(matches) {
  const buckets = {};

  for (const m of matches) {
    const leagueSlug = String(m.leagueSlug || "").trim();
    const homeTeam = String(m.homeTeam || "").trim();
    const awayTeam = String(m.awayTeam || "").trim();
    if (!leagueSlug || !homeTeam || !awayTeam) continue;

    const key = canonicalMatchupKey(leagueSlug, homeTeam, awayTeam);
    if (!buckets[key]) {
      const ordered = [homeTeam, awayTeam].sort((a, b) => String(a).localeCompare(String(b)));
      buckets[key] = {
        leagueSlug,
        teamA: ordered[0],
        teamB: ordered[1],
        matches: []
      };
    }

    buckets[key].matches.push(m);
  }

  const out = {};

  for (const [key, bucket] of Object.entries(buckets)) {
    const matches = [...bucket.matches].sort(sortByKickoffDesc).slice(0, 10);
    const sample = matches.length;

    let draws = 0;
    let over25 = 0;
    let btts = 0;
    let teamAWins = 0;
    let teamBWins = 0;

    for (const m of matches) {
      const h = safeNum(m.scoreHome);
      const a = safeNum(m.scoreAway);

      if (h === a) draws += 1;
      if ((h + a) > 2.5) over25 += 1;
      if (h > 0 && a > 0) btts += 1;

      if (String(m.homeTeam) === bucket.teamA && String(m.awayTeam) === bucket.teamB) {
        if (h > a) teamAWins += 1;
        else if (a > h) teamBWins += 1;
      } else if (String(m.homeTeam) === bucket.teamB && String(m.awayTeam) === bucket.teamA) {
        if (h > a) teamBWins += 1;
        else if (a > h) teamAWins += 1;
      }
    }

    out[key] = {
      leagueSlug: bucket.leagueSlug,
      teamA: bucket.teamA,
      teamB: bucket.teamB,
      sample,
      teamABias: sample ? teamAWins / sample : 0,
      drawBias: sample ? draws / sample : 0,
      teamBBias: sample ? teamBWins / sample : 0,
      over25Bias: sample ? over25 / sample : 0,
      bttsBias: sample ? btts / sample : 0
      // raw `matches` intentionally omitted — never read downstream, and it was
      // the bulk of the priors file size (see buildTeamPriors note).
    };
  }

  return out;
}

async function collectArchiveMatches(sourceSeasons) {
  const leagueDirs = await listLeagueDirs();
  const allMatches = [];
  const meta = {
    leaguesScanned: 0,
    filesRead: 0,
    matchesLoaded: 0,
    seasons: sourceSeasons
  };

  for (const slug of leagueDirs) {
    meta.leaguesScanned += 1;

    for (const season of sourceSeasons) {
      const filePath = path.join(ARCHIVE_ROOT, slug, `${season}.json`);
      const payload = await readJsonSafe(filePath, null);
      if (!payload?.matches || !Array.isArray(payload.matches)) continue;

      meta.filesRead += 1;

      for (const row of payload.matches) {
        if (!row?.leagueSlug || !row?.homeTeam || !row?.awayTeam) continue;
        allMatches.push(row);
      }
    }
  }

  meta.matchesLoaded = allMatches.length;
  return { allMatches, meta };
}

async function main() {
  const { allMatches, meta } = await collectArchiveMatches(DEFAULT_SOURCE_SEASONS);

  const teamPriors = buildTeamPriors(allMatches);
  const leaguePriors = buildLeaguePriors(allMatches);
  const matchupPriors = buildMatchupPriors(allMatches);

  const out = {
    targetSeason: DEFAULT_TARGET_SEASON,
    sourceSeasons: DEFAULT_SOURCE_SEASONS,
    createdAt: new Date().toISOString(),
    meta: {
      ...meta,
      teamPriors: Object.keys(teamPriors).length,
      leaguePriors: Object.keys(leaguePriors).length,
      matchupPriors: Object.keys(matchupPriors).length
    },
    teamPriors,
    leaguePriors,
    matchupPriors
  };

  const outFile = path.join(OUT_DIR, `${DEFAULT_TARGET_SEASON}.json`);
  await writeJson(outFile, out);

  console.log("[priors] targetSeason:", DEFAULT_TARGET_SEASON);
  console.log("[priors] sourceSeasons:", DEFAULT_SOURCE_SEASONS.join(", "));
  console.log("[priors] archive matches:", meta.matchesLoaded);
  console.log("[priors] wrote:", outFile);
  console.log("[priors] teamPriors:", Object.keys(teamPriors).length);
  console.log("[priors] leaguePriors:", Object.keys(leaguePriors).length);
  console.log("[priors] matchupPriors:", Object.keys(matchupPriors).length);
}

await main();