/**
 * run-odds-opening.js
 *
 * Fully autonomous fixtures + odds capture. NO ESPN, NO odds API.
 *
 *   FIXTURES (driver):   the whole day's matches across every league from the
 *                        Flashscore public feed (hundreds of matches) — wide
 *                        coverage + accurate kickoff times.
 *   ODDS (displayed):    real 1X2 bookmaker odds from BetExplorer, matched to each
 *                        fixture by team names; OPENING frozen on first capture,
 *                        drift on later runs.
 *   ASSESSMENT (details):our Poisson fair odds over the standings, as aiAssessment.
 *
 * Attribution to one of our leagues uses the validated standings as a team→league
 * index (both teams in the same active league's table), plus the international
 * competition resolver for World Cup / qualifiers.
 *
 * Usage: node engine-v1/jobs/run-odds-opening.js [--summary]
 * Guardrails: canonicalWrites 0, productionWrite false (reads public web only).
 */

import fs from "fs";
import { pathToFileURL } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { fetchOddsResilient } from "../odds/odds-providers.js";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { priceMatchFromStandings } from "../odds/ai-odds-model.js";
import { resolveInternational } from "../odds/international-competitions.js";
import { recordOddsSnapshot, getOddsSummary } from "../storage/odds-memory-db.js";
import { readStandings } from "../storage/standings-memory-db.js";
import { readLeagueState } from "../storage/league-memory-db.js";
import { teamFormRates } from "../storage/results-memory-db.js";
import { teamXgRates } from "../storage/discipline-memory-db.js";
import { resolveAliasCandidates } from "../storage/team-aliases-db.js";
import { buildRefereeLookup, lookupReferee } from "../odds/referee-enrichment.js";
import { TM_COMPETITIONS } from "../odds/transfermarkt-referee-source.js";
import { normalizeTeamKey as normalizeTeam } from "../core/normalize.js";

function log(...a) { console.log("[run-odds-opening]", ...a); }

function tokenJaccard(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}

// ─── Global team → league index from accepted standings ─────────────────────────
// Domestic attribution indexes ACTIVE leagues; the cross-league index (for UEFA
// qualifiers / cups, where the two clubs come from DIFFERENT — and often off-season
// — leagues) includes every league that has an accepted table (last-season included).

function buildLeagueIndex({ activeOnly = true } = {}) {
  const dir = resolveDataPath("league-memory", "standings");
  const leagues = [];

  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }

  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    if (activeOnly && readLeagueState(slug)?.state !== "active") continue;

    const rows = readStandings(slug)?.accepted?.rows;
    if (!Array.isArray(rows) || rows.length < 4) continue;

    // Index each team under its name AND its aliases (Wikidata/manual), so feeds
    // that name the club differently still match.
    const teams = [];
    for (const r of rows) {
      for (const cand of resolveAliasCandidates(slug, r.teamName)) {
        const n = normalizeTeam(cand);
        if (n) teams.push({ norm: n, row: r });
      }
    }
    let gf = 0, pld = 0;
    for (const r of rows) { gf += Number(r.goalsFor) || 0; pld += Number(r.played) || 0; }
    leagues.push({ slug, teams, leagueAvg: pld > 0 ? gf / pld : 1.35 });
  }
  return leagues;
}

function findTeam(name, teams) {
  const norm = normalizeTeam(name);
  if (!norm) return null;
  let best = null, bestScore = 0;
  for (const t of teams) {
    const s = t.norm === norm ? 1 : tokenJaccard(norm, t.norm);
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return bestScore >= 0.6 ? best : null;
}

// Find one team in ANY league (for cross-league cup / UEFA-qualifier matches).
function findTeamAnyLeague(name, allLeagues) {
  let best = null, bestScore = 0;
  for (const lg of allLeagues) {
    const t = findTeam(name, lg.teams);
    if (!t) continue;
    const s = tokenJaccard(normalizeTeam(name), t.norm);
    if (s > bestScore) { bestScore = s; best = { slug: lg.slug, row: t.row, leagueAvg: lg.leagueAvg }; }
  }
  return best;
}

// Attribute a scraped match to the league whose standings contain BOTH teams.
function attributeMatch(home, away, leagues) {
  let best = null, bestScore = 0;
  for (const lg of leagues) {
    const h = findTeam(home, lg.teams);
    const a = findTeam(away, lg.teams);
    if (!h || !a) continue;
    const score = (tokenJaccard(normalizeTeam(home), h.norm) + tokenJaccard(normalizeTeam(away), a.norm)) / 2;
    if (score > bestScore) { bestScore = score; best = { league: lg, home: h.row, away: a.row }; }
  }
  return best;
}

// Athens (Europe/Athens) day key for an absolute UTC instant.
const ATHENS_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit"
});
function athensDayKeyFromUtc(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : ATHENS_FMT.format(d);
}

// BetExplorer odds pool indexed by normalized "home|away" for fast lookup.
function buildOddsPool(rows) {
  const map = new Map();
  for (const r of rows) {
    map.set(`${normalizeTeam(r.home)}|${normalizeTeam(r.away)}`, r);
  }
  return { rows, map };
}

function lookupOdds(home, away, pool) {
  const key = `${normalizeTeam(home)}|${normalizeTeam(away)}`;
  if (pool.map.has(key)) return pool.map.get(key);
  // fuzzy fallback
  let best = null, bestScore = 0;
  for (const r of pool.rows) {
    const s = (tokenJaccard(normalizeTeam(home), normalizeTeam(r.home)) +
               tokenJaccard(normalizeTeam(away), normalizeTeam(r.away))) / 2;
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return bestScore >= 0.6 ? best : null;
}

async function main() {
  const summary = process.argv.slice(2).includes("--summary");
  if (summary) {
    console.log(JSON.stringify({ ok: true, odds: getOddsSummary() }, null, 2));
    return;
  }

  const today = athensDayKey();
  const windowSet = new Set([today, shiftDay(today, 1), shiftDay(today, 2)]);

  const leagues = buildLeagueIndex();
  const allLeagues = buildLeagueIndex({ activeOnly: false });   // for cross-league cups/qualifiers
  log("league-index", { activeLeaguesWithStandings: leagues.length, allLeaguesWithStandings: allLeagues.length, window: [...windowSet] });

  // Fixtures: the whole day's football (wide coverage).
  const fixtures = await fetchFlashscoreFixtures({ offsets: [0, 1, 2] });
  log("fixtures:fetched", { rows: fixtures.rows.length, attempts: fixtures.attempts.map(a => `${a.offset}:${a.rows}`) });

  // Odds: resilient multi-provider gather (no single-source dependency),
  // matched to fixtures by team names; each price carries its source/book.
  const market = await fetchOddsResilient();
  const oddsPool = buildOddsPool(market.rows);
  log("market-odds:fetched", { rows: market.rows.length, providers: market.providers });

  // Appointed referees (+ their card/penalty tendencies) for upcoming fixtures,
  // for the leagues we map to Transfermarkt. Built once; joined per match below.
  const refereeLookup = await buildRefereeLookup(Object.keys(TM_COMPETITIONS));
  log("referees:fetched", { leagues: refereeLookup.size });

  const stats = {
    today,
    fixtures: fixtures.rows.length,
    inWindow: 0, attributed: 0, international: 0, withOdds: 0,
    openedMarkets: 0, movedMarkets: 0, withAiAssessment: 0, byLeague: {}, byDay: {}
  };

  for (const fx of fixtures.rows) {
    const dayKey = athensDayKeyFromUtc(fx.kickoffUtc);
    if (dayKey && !windowSet.has(dayKey)) continue;
    stats.inWindow++;

    // Attribution: international by competition, else domestic via standings.
    const intl = resolveInternational(fx.leagueName, fx.country);
    let slug, home, away, league = null, isIntl = false;
    let homeSlug = null, awaySlug = null, leagueAvg = 1.35, crossLeague = false;

    if (intl) {
      slug = intl.slug;
      isIntl = true;
      // CLUB qualifiers / cups are cross-league: resolve EACH team in its own
      // (possibly off-season) domestic table so we can still price them.
      if (intl.type === "club") {
        const h = findTeamAnyLeague(fx.home, allLeagues);
        const a = findTeamAnyLeague(fx.away, allLeagues);
        if (h && a) {
          home = h.row; away = a.row;
          homeSlug = h.slug; awaySlug = a.slug;
          leagueAvg = (h.leagueAvg + a.leagueAvg) / 2;
          crossLeague = true;
        }
      }
    } else {
      const hit = attributeMatch(fx.home, fx.away, leagues);
      if (!hit) continue;            // not in a league we hold stats for → skip
      slug = hit.league.slug;
      home = hit.home; away = hit.away; league = hit.league;
      homeSlug = awaySlug = slug; leagueAvg = league.leagueAvg;
    }

    const id = `fs_${fx.matchId}`;

    // Real market odds (if BetExplorer lists this match).
    const odds = lookupOdds(fx.home, fx.away, oddsPool);
    const markets = odds ? { "1X2": { odds: odds.odds, oddsMax: odds.oddsMax } } : {};
    if (odds) stats.withOdds++;

    // AI assessment whenever both teams resolved to a standings row — domestic OR
    // cross-league (UEFA qualifiers / cups). Form & xG use each team's own league.
    let aiAssessment = null;
    if (home && away) {
      const homeForm = teamFormRates(homeSlug, fx.home);
      const awayForm = teamFormRates(awaySlug, fx.away);
      const homeXg = teamXgRates(homeSlug, fx.home);
      const awayXg = teamXgRates(awaySlug, fx.away);
      const p = priceMatchFromStandings(home, away, {
        leagueAvgGoalsPerTeam: leagueAvg, homeForm, awayForm, homeXg, awayXg
      });
      aiAssessment = { model: p.model, markets: p.markets };
      if (crossLeague) aiAssessment.crossLeague = { home: homeSlug, away: awaySlug };
      const referee = lookupReferee(refereeLookup, homeSlug, fx.home);
      if (referee) { aiAssessment.referee = referee; stats.withReferee = (stats.withReferee || 0) + 1; }
      stats.withAiAssessment++;
    }

    const result = recordOddsSnapshot(id, {
      leagueSlug: slug,
      competition: isIntl ? intl.label : (fx.leagueName || null),
      home: fx.home,
      away: fx.away,
      dayKey,
      kickoffUtc: fx.kickoffUtc,
      source: odds ? `flashscore+${odds.provider}` : "flashscore",
      oddsBook: odds ? odds.book : null,
      aiAssessment
    }, { markets });

    stats.attributed++;
    if (isIntl) stats.international++;
    stats.openedMarkets += result.opened.length;
    stats.movedMarkets += result.moved.length;
    stats.byLeague[slug] = (stats.byLeague[slug] || 0) + 1;
    if (dayKey) stats.byDay[dayKey] = (stats.byDay[dayKey] || 0) + 1;
  }

  log("done", {
    fixtures: stats.fixtures, attributed: stats.attributed,
    withOdds: stats.withOdds, leagues: Object.keys(stats.byLeague).length
  });

  console.log(JSON.stringify({
    ok: true,
    ...stats,
    odds: getOddsSummary(),
    guarantees: { canonicalWrites: 0, productionWrite: false, espnUsed: false, oddsApiUsed: false }
  }, null, 2));
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  main().catch(err => {
    console.error("[run-odds-opening] fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}

export { main as runOddsOpening };
