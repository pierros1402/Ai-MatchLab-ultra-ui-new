import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SEASON = "2025-2026";

const HISTORY_FILE = path.resolve(__dirname, "../../data/history/2025-2026.json");
const OUT_DIR = path.resolve(__dirname, "../../data/history-index");

const TEAM_OUT = path.join(OUT_DIR, "team-form", SEASON + ".json");
const LEAGUE_OUT = path.join(OUT_DIR, "league-form", SEASON + ".json");
const MATCHUP_OUT = path.join(OUT_DIR, "matchups", SEASON + ".json");

function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(file, data) {
  await ensureDir(path.dirname(file));
  await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
}

function sortByKickoff(a, b) {
  return safeNum(a.kickoff_ms) - safeNum(b.kickoff_ms);
}

function lastN(arr, n) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(Math.max(0, arr.length - n));
}

function computeStats(matches) {
  let gf = 0;
  let ga = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;

  for (const m of matches) {
    const isHome = !!m.isHome;
    const gs = isHome ? safeNum(m.scoreHome) : safeNum(m.scoreAway);
    const gc = isHome ? safeNum(m.scoreAway) : safeNum(m.scoreHome);

    gf += gs;
    ga += gc;

    if (gs > gc) wins += 1;
    else if (gs < gc) losses += 1;
    else draws += 1;
  }

  const played = matches.length;
  const points = wins * 3 + draws;

  return {
    played,
    gf,
    ga,
    wins,
    draws,
    losses,
    points,
    ppg: played ? points / played : 0
  };
}

function buildTeamIndex(allMatches) {
  const teams = {};

  for (const m of allMatches) {
    const base = {
      id: m.id,
      dayKey: m.dayKey,
      kickoff: m.kickoff,
      kickoff_ms: m.kickoff_ms,
      leagueSlug: m.leagueSlug,
      leagueName: m.leagueName,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      scoreHome: safeNum(m.scoreHome),
      scoreAway: safeNum(m.scoreAway),
      status: m.status,
      outcome: m.outcome
    };

    if (!teams[m.homeTeam]) teams[m.homeTeam] = [];
    teams[m.homeTeam].push({
      ...base,
      team: m.homeTeam,
      opponent: m.awayTeam,
      isHome: true
    });

    if (!teams[m.awayTeam]) teams[m.awayTeam] = [];
    teams[m.awayTeam].push({
      ...base,
      team: m.awayTeam,
      opponent: m.homeTeam,
      isHome: false
    });
  }

  const result = {};

  for (const [team, matches] of Object.entries(teams)) {
    matches.sort(sortByKickoff);

    const homeMatches = matches.filter(function (m) {
      return m.isHome;
    });

    const awayMatches = matches.filter(function (m) {
      return !m.isHome;
    });

    const last5 = lastN(matches, 5);
    const last10 = lastN(matches, 10);
    const homeLast5 = lastN(homeMatches, 5);
    const awayLast5 = lastN(awayMatches, 5);

    result[team] = {
      team,
      total: computeStats(matches),
      last5: computeStats(last5),
      last10: computeStats(last10),
      homeLast5: computeStats(homeLast5),
      awayLast5: computeStats(awayLast5),
      matches
    };
  }

  return result;
}

function buildLeagueIndex(allMatches) {
  const leagues = {};

  for (const m of allMatches) {
    if (!leagues[m.leagueSlug]) {
      leagues[m.leagueSlug] = {
        leagueSlug: m.leagueSlug,
        leagueName: m.leagueName || m.leagueSlug,
        matches: []
      };
    }

    leagues[m.leagueSlug].matches.push(m);
  }

  const result = {};

  for (const [slug, data] of Object.entries(leagues)) {
    const matches = data.matches;

    let totalGoals = 0;
    let draws = 0;
    let btts = 0;
    let over25 = 0;

    for (const m of matches) {
      const scoreHome = safeNum(m.scoreHome);
      const scoreAway = safeNum(m.scoreAway);
      const goals = scoreHome + scoreAway;

      totalGoals += goals;

      if (scoreHome === scoreAway) draws += 1;
      if (scoreHome > 0 && scoreAway > 0) btts += 1;
      if (goals > 2.5) over25 += 1;
    }

    const count = matches.length;

    result[slug] = {
      leagueSlug: slug,
      leagueName: data.leagueName,
      matches: count,
      avgGoals: count ? totalGoals / count : 0,
      drawRate: count ? draws / count : 0,
      bttsRate: count ? btts / count : 0,
      over25Rate: count ? over25 / count : 0
    };
  }

  return result;
}

function buildMatchupIndex(allMatches) {
  const map = {};

  function matchupKey(a, b) {
    return [String(a || ""), String(b || "")].sort().join("::");
  }

  for (const m of allMatches) {
    const k = matchupKey(m.homeTeam, m.awayTeam);

    if (!map[k]) {
      map[k] = {
        teams: [m.homeTeam, m.awayTeam].sort(),
        matches: []
      };
    }

    map[k].matches.push(m);
  }

  const result = {};

  for (const [k, data] of Object.entries(map)) {
    const matches = data.matches.slice().sort(sortByKickoff);
    const last = matches.length ? matches[matches.length - 1] : null;

    result[k] = {
      teams: data.teams,
      totalMatches: matches.length,
      lastMatch: last,
      matches
    };
  }

  return result;
}

async function run() {
  console.log("[index] loading history...");

  const raw = await fs.readFile(HISTORY_FILE, "utf8");
  const history = JSON.parse(raw);

  const allMatches = [];

  for (const bucket of Object.values(history.days || {})) {
    for (const m of (bucket.matches || [])) {
      allMatches.push(m);
    }
  }

  console.log("[index] total matches:", allMatches.length);

  console.log("[index] building team index...");
  const teamIndex = buildTeamIndex(allMatches);

  console.log("[index] building league index...");
  const leagueIndex = buildLeagueIndex(allMatches);

  console.log("[index] building matchup index...");
  const matchupIndex = buildMatchupIndex(allMatches);

  await writeJson(TEAM_OUT, teamIndex);
  await writeJson(LEAGUE_OUT, leagueIndex);
  await writeJson(MATCHUP_OUT, matchupIndex);

  console.log("[index] done");
  console.log("[index] wrote:", TEAM_OUT);
  console.log("[index] wrote:", LEAGUE_OUT);
  console.log("[index] wrote:", MATCHUP_OUT);
}

run().catch(function (err) {
  console.error("[index] failed");
  console.error(err);
  process.exit(1);
});