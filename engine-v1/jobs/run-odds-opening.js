/**
 * run-odds-opening.js
 *
 * Fully autonomous fixtures + odds capture. NO ESPN, NO odds API — everything is
 * read from the open web (BetExplorer static HTML), exactly the way an analyst
 * would read a screen.
 *
 * How a scraped match is attributed to one of our leagues WITHOUT any fixtures
 * feed: the validated standings tables (Part 1) double as a team→league index.
 * If both teams of a scraped match appear in the SAME active league's standings,
 * that match belongs to that league — and we already hold its stats.
 *
 *   PRIMARY (displayed):  real 1X2 odds; OPENING frozen on first capture, drift
 *                         shown on every later run.
 *   SECONDARY (details):  our AI assessment (Poisson fair odds over the standings)
 *                         attached per match as `aiAssessment`.
 *
 * Usage:
 *   node engine-v1/jobs/run-odds-opening.js [--summary]
 *
 * Guardrails: canonicalWrites 0, productionWrite false (reads public web only).
 */

import fs from "fs";
import { pathToFileURL } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { fetchMarketOdds } from "../odds/betexplorer-odds-source.js";
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

function matchId(eventId, slug, home, away) {
  if (eventId) return `be_${eventId}`;
  const h = normalizeTeam(home).replace(/\s+/g, "-");
  const a = normalizeTeam(away).replace(/\s+/g, "-");
  return `be_${slug}_${h}__${a}`;
}

async function main() {
  const summary = process.argv.slice(2).includes("--summary");
  if (summary) {
    console.log(JSON.stringify({ ok: true, odds: getOddsSummary() }, null, 2));
    return;
  }

  // Athens-anchored capture window: today + next N days ("fixtures της ημέρας
  // και των επόμενων ημερών").
  const today = athensDayKey();
  const windowDays = [today, shiftDay(today, 1), shiftDay(today, 2)];
  const windowSet = new Set(windowDays);

  const leagues = buildLeagueIndex();
  log("league-index", { activeLeaguesWithStandings: leagues.length, window: windowDays });

  log("fetching market odds (BetExplorer, no API)…");
  const market = await fetchMarketOdds();
  log("market-odds:fetched", {
    rows: market.rows.length,
    attempts: market.attempts.map(a => `${a.status}:${a.rows}`)
  });

  const stats = {
    today,
    marketRows: market.rows.length,
    inWindow: 0, attributed: 0, international: 0, openedMarkets: 0, movedMarkets: 0,
    withAiAssessment: 0, byLeague: {}, byDay: {}
  };

  for (const m of market.rows) {
    // Keep only fixtures within the Athens window (skip rows with no/old date).
    if (m.dayKey && !windowSet.has(m.dayKey)) continue;
    stats.inWindow++;

    // 1) International competitions (World Cup, qualifiers, UEFA cup qualifying):
    //    attributed by the competition label, not by club standings.
    const intl = resolveInternational(m.competition, m.country);
    let slug, home, away, league = null, isIntl = false;

    if (intl) {
      slug = intl.slug;
      isIntl = true;
    } else {
      // 2) Domestic: attribute via the league whose standings hold both teams.
      const hit = attributeMatch(m.home, m.away, leagues);
      if (!hit) continue;
      slug = hit.league.slug;
      home = hit.home; away = hit.away; league = hit.league;
    }

    const id = matchId(m.eventId, slug, m.home, m.away);

    // AI assessment only for domestic matches with standings (national teams have
    // no club table; their assessment is a later refinement).
    let aiAssessment = null;
    if (!isIntl && home && away) {
      const p = priceMatchFromStandings(home, away, { leagueAvgGoalsPerTeam: league.leagueAvg });
      aiAssessment = { market: "1X2", model: p.model, odds: p.markets["1X2"].odds, probs: p.markets["1X2"].probs };
      stats.withAiAssessment++;
    }

    const result = recordOddsSnapshot(id, {
      leagueSlug: slug,
      competition: isIntl ? intl.label : null,
      home: m.home,
      away: m.away,
      dayKey: m.dayKey,
      kickoffLocal: m.kickoffLocal,
      source: "betexplorer",
      aiAssessment
    }, { markets: { "1X2": { odds: m.odds, oddsMax: m.oddsMax } } });

    stats.attributed++;
    if (isIntl) stats.international++;
    stats.openedMarkets += result.opened.length;
    stats.movedMarkets += result.moved.length;
    stats.byLeague[slug] = (stats.byLeague[slug] || 0) + 1;
    if (m.dayKey) stats.byDay[m.dayKey] = (stats.byDay[m.dayKey] || 0) + 1;
  }

  log("done", {
    marketRows: stats.marketRows,
    attributed: stats.attributed,
    openedMarkets: stats.openedMarkets,
    movedMarkets: stats.movedMarkets,
    leagues: Object.keys(stats.byLeague).length
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
