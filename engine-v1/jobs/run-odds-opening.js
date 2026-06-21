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

function log(...a) { console.log("[run-odds-opening]", ...a); }

// ─── Team-name normalisation ────────────────────────────────────────────────────

function normalizeTeam(name) {
  return String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")  // strip diacritics
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(afc|fc|cf|sc|ac|cd|ca|ec|se|ad|club|atletico|deportivo|sporting|real)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenJaccard(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}

// ─── Global team → league index from accepted standings ─────────────────────────
// Only ACTIVE leagues that have validated standings are indexed.

function buildLeagueIndex() {
  const dir = resolveDataPath("league-memory", "standings");
  const leagues = [];

  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }

  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    if (readLeagueState(slug)?.state !== "active") continue;

    const rows = readStandings(slug)?.accepted?.rows;
    if (!Array.isArray(rows) || rows.length < 4) continue;

    const teams = rows.map(r => ({ norm: normalizeTeam(r.teamName), row: r })).filter(t => t.norm);
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
  log("league-index", { activeLeaguesWithStandings: leagues.length, window: [...windowSet] });

  // Fixtures: the whole day's football (wide coverage).
  const fixtures = await fetchFlashscoreFixtures({ offsets: [0, 1, 2] });
  log("fixtures:fetched", { rows: fixtures.rows.length, attempts: fixtures.attempts.map(a => `${a.offset}:${a.rows}`) });

  // Odds: resilient multi-provider gather (no single-source dependency),
  // matched to fixtures by team names; each price carries its source/book.
  const market = await fetchOddsResilient();
  const oddsPool = buildOddsPool(market.rows);
  log("market-odds:fetched", { rows: market.rows.length, providers: market.providers });

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

    if (intl) {
      slug = intl.slug;
      isIntl = true;
    } else {
      const hit = attributeMatch(fx.home, fx.away, leagues);
      if (!hit) continue;            // not in a league we hold stats for → skip
      slug = hit.league.slug;
      home = hit.home; away = hit.away; league = hit.league;
    }

    const id = `fs_${fx.matchId}`;

    // Real market odds (if BetExplorer lists this match).
    const odds = lookupOdds(fx.home, fx.away, oddsPool);
    const markets = odds ? { "1X2": { odds: odds.odds, oddsMax: odds.oddsMax } } : {};
    if (odds) stats.withOdds++;

    // Our AI assessment for domestic matches with standings.
    let aiAssessment = null;
    if (!isIntl && home && away) {
      const p = priceMatchFromStandings(home, away, { leagueAvgGoalsPerTeam: league.leagueAvg });
      // All markets the UI offers: 1X2, DC, OU15, OU25, OU35, BTTS.
      aiAssessment = { model: p.model, markets: p.markets };
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
