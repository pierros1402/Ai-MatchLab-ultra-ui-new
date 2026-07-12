/**
 * fetch-multi-bookmaker-odds.js
 *
 * Fetches per-bookmaker 1X2 odds from OddsPapi for today's matches,
 * classifies each bookmaker into Greek / European / Asian / Betfair panels,
 * and writes data/multi-odds/{date}.json.
 *
 * Matching strategy: normalize team names from our deploy snapshot against
 * OddsPapi's fixture list (team names sourced from Betradar).
 *
 * Usage: node engine-v1/jobs/fetch-multi-bookmaker-odds.js [YYYY-MM-DD]
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { buildAssessmentDay } from "./build-assessment-day.js";
import { fetchOddsApiIoDay, createOddsApiIoBudget } from "./fetch-oddsapiio-odds.js";
import { mergeWithDelta, normTeam, pairKey, namesMatch } from "../odds/multi-odds-merge.js";

const BASE   = "https://api.oddspapi.io/v4";
const KEY    = process.env.ODDSPAPI_KEY || "";
const DELAY_MS = 2200;

// ─── Bookmaker classification ──────────────────────────────────────────────────

// Greek: OPAP/Stoiximan group + Greek-licensed operators
const GREEK_BOOKS = new Set([
  "stoiximan", "vistabet", "pamestoixima.gr", "betano",
  "tzoker", "novibet",
]);

// Asian sharp books
const ASIAN_BOOKS = new Set([
  "pinnacle", "sbobet", "singbet", "ps3838", "3et", "dafabet",
  "kaiyun", "sharpbet", "bet188", "maxbet", "188bet", "ibcbet",
]);

// Betfair exchange variants
const BETFAIR_BOOKS = new Set([
  "betfair-ex", "betfair-spb", "betfair.es", "betfair.it",
  "betfair.de", "betfair.au",
]);

function classifyBook(bk) {
  const b = bk.toLowerCase();
  if (GREEK_BOOKS.has(b)) return "greek";
  if (ASIAN_BOOKS.has(b)) return "asian";
  if (BETFAIR_BOOKS.has(b) || b.startsWith("betfair")) return "betfair";
  return "european";
}

// Team-name fuzzy matching + opening-freeze delta merge now live in
// ../odds/multi-odds-merge.js (shared with the odds-api.io adapter).

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(...a) { console.log("[multi-odds]", ...a); }

async function apiGet(path) {
  const url = `${BASE}${path}&apiKey=${KEY}`;
  const r = await fetch(url);
  if (r.status === 429) {
    log("rate limited, waiting 10s");
    await sleep(10000);
    const r2 = await fetch(url);
    if (!r2.ok) return null;
    return r2.json();
  }
  if (!r.ok) return null;
  return r.json();
}

// ─── OddsPapi market parsing ───────────────────────────────────────────────────
//
// OddsPapi market IDs (discovered empirically from logs):
//   101 = 1X2  (outcomes 101=Home, 102=Draw, 103=Away)
//   102 = Double Chance (outcomes: see MARKET_DEFS below when confirmed)
//   Various = Over/Under lines
//
// We fetch ALL markets per fixture (no &marketId filter) so we get everything
// in one call, then extract per-market below.

// Known market definitions: marketId → { key, legs: [{outcomeId, label}] }
// Verified empirically from OddsPapi response (Swiss vs Canada, 2026-06-24):
//   101 = 1X2:  outcomes 101=Home, 102=Draw, 103=Away
//   104 = OU2.5: outcomes 104=Over(1.80), 105=Under(1.95)  [balanced WC match]
//   108 = BTTS: outcomes 108=NG/No(1.33), 109=GG/Yes(3.40)
//   10208 = HT 1X2: 3-way half-time result (3.00/2.10/3.60)
// DC is NOT available as standalone market in OddsPapi — skipped.
const MARKET_DEFS = {
  "101":   { key: "1X2",   legs: [{ id: "101", label: "home" }, { id: "102", label: "draw" }, { id: "103", label: "away" }] },
  "104":   { key: "OU25",  legs: [{ id: "104", label: "over" }, { id: "105", label: "under" }] },
  "108":   { key: "BTTS",  legs: [{ id: "108", label: "no" },   { id: "109", label: "yes" }] },
  "10208": { key: "HTFT",  legs: [{ id: "101", label: "home" }, { id: "102", label: "draw" }, { id: "103", label: "away" }] },
};

function price(outs, outcomeId) {
  const p = outs?.[outcomeId]?.players?.["0"]?.price;
  return (p != null && Number.isFinite(+p)) ? +Number(p).toFixed(3) : null;
}

// Returns { "1X2": {greek:{},european:{},asian:{},betfair:{}}, "DC": {...}, ... }
function parseAllMarkets(bookmakerOdds) {
  const result = {};
  // Collect unique market IDs seen across bookmakers (for discovery logging)
  const seen = new Set();

  for (const [bk, bdata] of Object.entries(bookmakerOdds || {})) {
    if (!bdata?.bookmakerIsActive) continue;
    const bmarkets = bdata?.markets || {};

    for (const [mid, mdata] of Object.entries(bmarkets)) {
      seen.add(mid);
      if (!mdata?.marketActive) continue;

      const def = MARKET_DEFS[mid];
      if (!def) continue; // unknown market — still tracked in `seen` for logging

      const outs = mdata.outcomes || {};
      const vals = {};
      let valid = true;

      for (const leg of def.legs) {
        const p = price(outs, leg.id);
        if (p == null) { valid = false; break; }
        vals[leg.label] = p;
      }
      if (!valid) continue;

      if (!result[def.key]) result[def.key] = { greek: {}, european: {}, asian: {}, betfair: {} };
      result[def.key][classifyBook(bk)][bk] = vals;
    }
  }

  return { markets: result, seenMarketIds: [...seen].sort() };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function addDays(dateStr, n) {
  return new Date(new Date(dateStr + "T12:00:00Z").getTime() + n * 86400000)
    .toISOString().slice(0, 10);
}

// ─── Match list loaders ────────────────────────────────────────────────────────

// Read matches from canonical-fixtures dir (works for past and future dates)
function loadMatchesFromCanonical(date) {
  try {
    const dir = resolveDataPath("canonical-fixtures", date);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .flatMap(f => {
        try {
          const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
          return (j.fixtures || [])
            .map(m => ({
              matchId:  String(m.matchId || ""),
              homeTeam: m.homeTeam || "",
              awayTeam: m.awayTeam || "",
            }))
            .filter(m => m.matchId && m.homeTeam && m.awayTeam);
        } catch { return []; }
      });
  } catch { return []; }
}

// Load matches for any date: deploy snapshot first, canonical fallback
function loadMatchesForDate(date) {
  try {
    const p = resolveDataPath("deploy-snapshots", date, "odds.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const fromSnapshot = (j.matches || [])
      .map(m => ({
        matchId:  m.matchId,
        homeTeam: m.homeTeam || m.home || "",
        awayTeam: m.awayTeam || m.away || "",
      }))
      .filter(m => m.homeTeam && m.awayTeam && m.matchId);
    if (fromSnapshot.length) return fromSnapshot;
  } catch { /**/ }
  return loadMatchesFromCanonical(date);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function fetchMultiBookmakerOdds(date) {
  if (!KEY) { log("no ODDSPAPI_KEY — skip"); return { ok: false, reason: "no_key" }; }

  date = date || athensDayKey();
  log("start", { date });

  const outDir  = ensureDir(resolveDataPath("multi-odds"));
  const outFile = path.join(outDir, `${date}.json`);

  // Load existing to avoid re-fetching
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch { /**/ }
  const cache = existing.matches || {};

  // 1) Load our matches for the given date (deploy snapshot → canonical fallback)
  const ourMatches = loadMatchesForDate(date);
  log(`our matches: ${ourMatches.length}`);
  if (!ourMatches.length) return { ok: false, reason: "no_fixtures" };

  // 2) Fetch OddsPapi fixtures for today (not-started = pre-match).
  //    Using from=today&to=tomorrow because same-day queries return fewer results.
  const nextDay = addDays(date, 1);
  await sleep(DELAY_MS);
  const fixJ = await apiGet(`/fixtures?sportId=10&statusId=0&from=${date}&to=${nextDay}`);
  const opFixtures = Array.isArray(fixJ?.data || fixJ) ? (fixJ?.data || fixJ) : [];
  const opWithOdds = opFixtures.filter(x => x.hasOdds);
  log(`oddspapi fixtures: ${opWithOdds.length} with odds`);

  // 3) Build lookup index: pair key → fixtureId
  const exactIndex = new Map();
  const reverseIndex = new Map();
  for (const f of opWithOdds) {
    const fwd = pairKey(f.participant1Name, f.participant2Name);
    const rev = pairKey(f.participant2Name, f.participant1Name);
    exactIndex.set(fwd, f);
    reverseIndex.set(rev, f);
  }

  // 4) Match our fixtures to OddsPapi fixtures.
  //    Re-fetch if last fetch was >3h ago (to capture line movement / delta).
  const REFRESH_MS = 3 * 60 * 60 * 1000;
  const now = Date.now();
  const toFetch = [];
  for (const m of ourMatches) {
    const cached = cache[m.matchId];
    const needsRefresh = !cached || (now - (cached.fetchedAt || 0)) > REFRESH_MS;
    if (!needsRefresh) continue;

    const fwd = pairKey(m.homeTeam, m.awayTeam);
    let opFix = exactIndex.get(fwd) || reverseIndex.get(fwd);

    if (!opFix) {
      opFix = opWithOdds.find(f =>
        namesMatch(m.homeTeam, f.participant1Name) &&
        namesMatch(m.awayTeam, f.participant2Name)
      ) || opWithOdds.find(f =>
        namesMatch(m.homeTeam, f.participant2Name) &&
        namesMatch(m.awayTeam, f.participant1Name)
      );
    }

    if (opFix) {
      toFetch.push({ matchId: m.matchId, fixtureId: opFix.fixtureId, home: m.homeTeam, away: m.awayTeam, isRefresh: !!cached });
    }
  }

  log(`matched ${toFetch.length}/${ourMatches.length} fixtures`);

  // 5) Fetch ALL markets per fixture (no marketId filter = full response)
  let fetched = 0;
  const allSeenMarketIds = new Set();

  for (const { matchId, fixtureId, home, away, isRefresh } of toFetch) {
    await sleep(DELAY_MS);

    const oddsJ = await apiGet(`/odds?fixtureId=${encodeURIComponent(fixtureId)}`);
    if (!oddsJ?.bookmakerOdds) {
      log(`  skip ${home} vs ${away}: no bookmakerOdds`);
      continue;
    }

    const { markets: freshMarkets, seenMarketIds } = parseAllMarkets(oddsJ.bookmakerOdds);
    seenMarketIds.forEach(id => allSeenMarketIds.add(id));

    // Merge each market with delta tracking. Start from the existing markets so
    // odds prefetched by another source (odds-api.io) survive an OddsPapi
    // refresh that doesn't carry that market; mergeWithDelta likewise keeps
    // per-book entries the fresh payload lacks.
    const existingMarkets = cache[matchId]?.markets || {};
    const mergedMarkets = { ...existingMarkets };
    for (const [mk, fresh] of Object.entries(freshMarkets)) {
      mergedMarkets[mk] = mergeWithDelta(existingMarkets[mk] || null, fresh);
    }

    const totalBooks = Object.values(mergedMarkets["1X2"] || {}).reduce((s, g) => s + Object.keys(g).length, 0);
    const moved = Object.values(mergedMarkets["1X2"] || {}).flatMap(g => Object.values(g)).filter(b => b.delta).length;
    const mkKeys = Object.keys(mergedMarkets).join(",");
    log(`  ${home} vs ${away}: ${totalBooks} books [${mkKeys}]${isRefresh ? ` (refresh, ${moved} moved)` : ""}`);

    cache[matchId] = {
      oddspapiFixtureId: fixtureId,
      home:      home,
      away:      away,
      fetchedAt: Date.now(),
      openedAt:  cache[matchId]?.openedAt || Date.now(),
      markets:   mergedMarkets,
    };
    fetched++;
  }

  if (allSeenMarketIds.size) {
    log("market IDs seen across all fixtures:", [...allSeenMarketIds].join(", "));
  }

  // 6) Persist
  const out = { date, updatedAt: Date.now(), matches: cache };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf8");
  log("done", { fetched, cached: Object.keys(cache).length, file: outFile });

  return { ok: true, date, fetched, total: Object.keys(cache).length };
}

// ─── Prefetch upcoming odds (D+1 to D+daysAhead) ─────────────────────────────
//
// Runs during daily cycle to capture opening lines days before match day.
// Writes to the same multi-odds/{matchDate}.json files (same matchId keys),
// so fetchMultiBookmakerOdds on match day inherits the frozen open{} via
// mergeWithDelta — delta = match-day current minus pre-fetched opening.

export async function prefetchUpcomingOdds(startDate, daysAhead = 6, budget = null) {
  startDate = startDate || athensDayKey();
  budget = budget || createOddsApiIoBudget();
  log(`prefetch: ${startDate} → ${addDays(startDate, daysAhead)} via odds-api.io (budget ${budget.remaining} req)`);

  let totalFetched = 0;

  for (let d = 1; d <= daysAhead; d++) {
    const date = addDays(startDate, d);
    try {
      // Adapter handles the 8h gate, canonical-fixtures fallback, all panels;
      // the shared budget keeps the whole run under the free-tier hourly cap.
      const r = await fetchOddsApiIoDay(date, budget);
      log(`  ${date}: fetched=${r.fetched} skipped=${r.skipped || 0}${r.limitHit ? " (rate limited)" : ""}`);
      totalFetched += r.fetched || 0;
    } catch (e) {
      log(`  ${date}: odds-api.io error — ${e?.message || e}`);
    }

    // AI assessment independent of odds source
    try {
      const ar = await buildAssessmentDay(date);
      log(`  ${date}: assessment ${ar.assessed} matches, ${ar.revised || 0} revised`);
    } catch (e) {
      log(`  ${date}: assessment failed — ${e?.message || e}`);
    }
  }

  log(`prefetch done: ${totalFetched} new fetches, ${budget.used} requests used${budget.limitHit ? " (rate limited)" : ""}`);
  return { ok: true, startDate, daysAhead, fetched: totalFetched, requestsUsed: budget.used, limitHit: budget.limitHit };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const isPrefetch = process.argv.includes("--prefetch");
  if (isPrefetch) {
    prefetchUpcomingOdds(arg).then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => { console.error(e.message); process.exitCode = 1; });
  } else {
    fetchMultiBookmakerOdds(arg).then(r => console.log(JSON.stringify(r, null, 2)))
      .catch(e => { console.error(e.message); process.exitCode = 1; });
  }
}
