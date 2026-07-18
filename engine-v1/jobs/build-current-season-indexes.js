import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { currentSeason } from "../core/season.js";
import { currentArchiveSeason } from "../core/season-model.js";
import { canonicalTeamName } from "../storage/team-aliases-db.js";
import { LEAGUE_NAME_MAP } from "../../workers/_shared/leagues-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_ROOT = path.resolve(__dirname, "..", "..", "data");

export function resolveTargetDateFromDay(dayKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(dayKey || "")
  );

  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

const TARGET_DAY =
  process.argv[3] ||
  null;

const TARGET_DATE =
  resolveTargetDateFromDay(TARGET_DAY) ||
  new Date();

const SEASON =
  process.argv[2] ||
  currentSeason(TARGET_DATE);

// Primary source: the per-league, per-season, Flashscore-canonical archive that
// build-history-archive-from-results.js rebuilds every run-day from results-memory.
// It is complete and season-aware per league (calendar-year leagues get "YYYY",
// cross-year leagues "YYYY-YYYY"), unlike the consolidated ESPN history which is
// universal Aug→Jul and coverage-thin. The consolidated file survives only as a
// fallback for leagues that have no archive yet, so coverage never regresses.
const ARCHIVE_DIR = path.join(DATA_ROOT, "history-archive");
const HISTORY_FILE = path.join(DATA_ROOT, "history", `${SEASON}.json`);
const OUT_DIR = path.join(DATA_ROOT, "history-index");

const TEAM_OUT = path.join(OUT_DIR, "team-form", `${SEASON}.json`);
const LEAGUE_OUT = path.join(OUT_DIR, "league-form", `${SEASON}.json`);
const MATCHUP_OUT = path.join(OUT_DIR, "matchups", `${SEASON}.json`);

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

    const homeMatches = matches.filter(m => m.isHome);
    const awayMatches = matches.filter(m => !m.isHome);

    result[team] = {
      team,
      total: computeStats(matches),
      last5: computeStats(lastN(matches, 5)),
      last10: computeStats(lastN(matches, 10)),
      homeLast5: computeStats(lastN(homeMatches, 5)),
      awayLast5: computeStats(lastN(awayMatches, 5)),
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
    let totalGoals = 0;
    let draws = 0;
    let btts = 0;
    let over25 = 0;

    for (const m of data.matches) {
      const h = safeNum(m.scoreHome);
      const a = safeNum(m.scoreAway);
      const goals = h + a;

      totalGoals += goals;
      if (h === a) draws += 1;
      if (h > 0 && a > 0) btts += 1;
      if (goals > 2.5) over25 += 1;
    }

    const count = data.matches.length;

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

  function key(a, b) {
    return [String(a), String(b)].sort().join("::");
  }

  for (const m of allMatches) {
    const k = key(m.homeTeam, m.awayTeam);

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
    const matches = data.matches.sort(sortByKickoff);
    const last = matches[matches.length - 1] || null;

    result[k] = {
      teams: data.teams,
      totalMatches: matches.length,
      lastMatch: last,
      matches
    };
  }

  return result;
}

/**
 * Reconcile a match's team names to their canonical identity via the alias
 * tables. Archive rows are already Flashscore-canonical so this is a no-op for
 * them, but the ESPN fallback rows ("Dinamo Minsk", "Gomel") must be bridged to
 * the canonical spelling the details form/H2H blocks look up with ("Din. Minsk",
 * "FC Gomel") — otherwise a club's games split across two spellings and a lookup
 * by the fixture name resolves only a fraction (blr.1 "Din. Minsk" last5 was 1
 * of ~10). The alias tables already list the ESPN spelling as a variant.
 */
function canonicalizeTeams(m) {
  const slug = m?.leagueSlug;
  const home = (slug && canonicalTeamName(slug, m.homeTeam)) || m.homeTeam;
  const away = (slug && canonicalTeamName(slug, m.awayTeam)) || m.awayTeam;
  if (home === m.homeTeam && away === m.awayTeam) return m;
  return { ...m, homeTeam: home, awayTeam: away };
}

async function listArchiveLeagues() {
  try {
    const entries = await fs.readdir(ARCHIVE_DIR, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

// Read one league's current-season matches from its per-league archive, using
// the league's own season model (calendar vs cross-year) to pick the file.
async function readArchiveMatchesForLeague(slug) {
  const label = currentArchiveSeason(
    slug,
    TARGET_DATE
  );
  const file = path.join(ARCHIVE_DIR, slug, `${label}.json`);

  let payload;
  try {
    payload = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return [];
  }

  const matches = Array.isArray(payload?.matches) ? payload.matches : [];
  const leagueName = LEAGUE_NAME_MAP[slug] || slug;

  return matches.map(m =>
    canonicalizeTeams({ ...m, leagueName: m.leagueName || leagueName })
  );
}

// Fallback only: pull rows for leagues NOT covered by an archive from the
// consolidated ESPN history, so coverage never regresses for leagues we hold
// only in that file. Archive-covered leagues are skipped (the archive wins).
async function readGlobalHistoryFallback(coveredSlugs) {
  let history;
  try {
    history = JSON.parse(await fs.readFile(HISTORY_FILE, "utf8"));
  } catch {
    return [];
  }

  if (!Array.isArray(history?.days)) return [];

  const out = [];
  for (const day of history.days) {
    if (!Array.isArray(day?.rows)) continue;
    for (const m of day.rows) {
      if (coveredSlugs.has(m?.leagueSlug)) continue;
      out.push(canonicalizeTeams(m));
    }
  }

  return out;
}

export async function buildCurrentSeasonIndexes() {
  console.log("[index] season:", SEASON);
  console.log("[index] target day:", TARGET_DAY);
  console.log(
    "[index] target date:",
    TARGET_DATE.toISOString()
  );
  console.log("[index] archive dir:", ARCHIVE_DIR);

  const archiveLeagues = await listArchiveLeagues();

  // A league counts as archive-covered only once it actually contributes rows for
  // its current season — a slug with a stale/empty dir (e.g. a cup with no
  // current-season file yet) must still fall through to the ESPN fallback so its
  // matches don't vanish from the form index.
  const contributedSlugs = new Set();

  const allMatches = [];
  for (const slug of archiveLeagues) {
    const rows = await readArchiveMatchesForLeague(slug);
    if (rows.length) {
      contributedSlugs.add(slug);
      allMatches.push(...rows);
    }
  }

  const archiveCount = allMatches.length;

  const fallback = await readGlobalHistoryFallback(contributedSlugs);
  allMatches.push(...fallback);

  console.log(
    `[index] matches: ${allMatches.length} (archive ${archiveCount} from ${contributedSlugs.size} leagues, fallback ${fallback.length})`
  );

  const teamIndex = buildTeamIndex(allMatches);
  const leagueIndex = buildLeagueIndex(allMatches);
  const matchupIndex = buildMatchupIndex(allMatches);

  await writeJson(TEAM_OUT, teamIndex);
  await writeJson(LEAGUE_OUT, leagueIndex);
  await writeJson(MATCHUP_OUT, matchupIndex);

  console.log("[index] done");
  console.log("[index] wrote:", TEAM_OUT);
  console.log("[index] wrote:", LEAGUE_OUT);
  console.log("[index] wrote:", MATCHUP_OUT);
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  buildCurrentSeasonIndexes().catch(err => {
    console.error("[index] failed", err);
    process.exit(1);
  });
}