/**
 * fetch-oddsapiio-odds.js
 *
 * Per-bookmaker 1X2 / OU2.5 / BTTS odds from odds-api.io for any date's
 * matches, classified into Greek / European / Asian / Betfair panels and
 * merged into data/multi-odds/{date}.json with frozen openings + drift
 * (same store OddsPapi writes on match day; mergeWithDelta keeps both).
 *
 * Replaces the dead OddsPortal scraper (site moved its odds behind
 * AJAX + Cloudflare, so the __NEXT_DATA__ parser fetched 0 forever).
 *
 * ⛔ FIREWALL: these odds are DISPLAY ONLY (opening→current drift panels).
 *    They never feed value/assessment.
 *
 * Budget: the free tier allows ~100 requests/hour. One prefetch run costs
 * 1 × /events per day + the odds requests: batched /odds/multi (10 events
 * per request) when the plan allows it, per-event /odds otherwise — the free
 * tier 403s the multi endpoint. A run-level budget object caps the total
 * (default 80) and is shared across D0 + the D+1..D+6 prefetch; priority
 * leagues are fetched first when the cap bites. An 8h per-match refresh
 * gate keeps the later nightly cycle runs nearly free.
 *
 * Env: ODDS_API_IO_KEY (required), ODDS_API_IO_MAX_REQ (optional cap).
 *
 * Usage: node engine-v1/jobs/fetch-oddsapiio-odds.js [YYYY-MM-DD]
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { mergeWithDelta, normTeam, pairKey, namesMatch } from "../odds/multi-odds-merge.js";

const BASE = process.env.ODDS_API_IO_BASE || "https://api.odds-api.io/v3";
const KEY  = process.env.ODDS_API_IO_KEY || "";

const DELAY_MS   = 1200;
const REFRESH_MS = 8 * 60 * 60 * 1000; // 8h gate, same cadence the OddsPortal path used
const MAX_REQUESTS_PER_RUN = Math.max(1, Number(process.env.ODDS_API_IO_MAX_REQ) || 80);

// ─── Bookmaker selection (max 30 allowed per odds request) ─────────────────────
// Names must match GET /v3/bookmakers exactly (checked 2026-07-09).

const GREEK_BOOKS    = ["Stoiximan", "Pamestoixima", "Novibet", "Betano"];
const ASIAN_BOOKS    = ["Sbobet", "DafaBet", "12bet", "18bet"];
const BETFAIR_BOOKS  = ["Betfair Exchange", "Betfair Sportsbook"];
const EUROPEAN_BOOKS = [
  "Bet365", "Unibet", "William Hill", "Betsson", "Betway", "1xbet",
  "22Bet", "888Sport", "Interwetten", "NetBet", "Vbet", "Betsafe", "10BET",
];

const BOOKMAKERS = [...GREEK_BOOKS, ...ASIAN_BOOKS, ...BETFAIR_BOOKS, ...EUROPEAN_BOOKS];
const BOOKMAKERS_PARAM = encodeURIComponent(BOOKMAKERS.join(","));

const GREEK_SET = new Set(GREEK_BOOKS.map(b => b.toLowerCase()));
const ASIAN_SET = new Set(ASIAN_BOOKS.map(b => b.toLowerCase()));

export function classifyBook(name) {
  const b = String(name || "").toLowerCase();
  if (GREEK_SET.has(b)) return "greek";
  if (ASIAN_SET.has(b)) return "asian";
  if (b.startsWith("betfair")) return "betfair";
  return "european";
}

// ─── Priority leagues (fetched first when the request cap bites) ───────────────
// Same universe the OddsPortal mapping used to cover.

const PRIORITY_LEAGUES = new Set([
  "swe.1", "swe.2", "nor.1", "nor.2", "fin.1", "fro.1", "fro.2", "isl.1",
  "irl.1", "irl.2", "dan.1", "dan.2",
  "eng.1", "eng.2", "eng.3", "ger.1", "ger.2", "spa.1", "spa.2", "ita.1",
  "ita.2", "fra.1", "fra.2", "por.1", "nld.1", "bel.1", "tur.1", "gre.1",
  "gre.2", "rus.1", "pol.1", "cze.1", "hrv.1", "srb.1", "rou.1", "bul.1",
  "hun.1", "cyp.1", "svk.1", "svn.1",
  "bra.1", "bra.2", "arg.1", "col.1", "chi.1", "uru.1", "ecu.1", "per.1",
  "ven.1", "par.1",
  "usa.1", "usa.2", "can.1", "mex.1",
  "jpn.1", "kor.1", "chn.1", "aus.1",
  "eng.league_cup", "ger.dfb_pokal", "ita.coppa_italia", "fra.coupe_de_france",
  "fifa.world_cup", "uefa.cl", "uefa.el", "uefa.conference.league",
  "conmebol.libertadores", "conmebol.sudamericana",
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(...a) { console.log("[odds-api.io]", ...a); }

function addDays(dateStr, n) {
  return new Date(new Date(dateStr + "T12:00:00Z").getTime() + n * 86400000)
    .toISOString().slice(0, 10);
}

// Shared run budget so D0 + the D+1..D+6 prefetch stay under the hourly cap.
export function createOddsApiIoBudget(max = MAX_REQUESTS_PER_RUN) {
  return { remaining: max, used: 0, limitHit: false };
}

async function apiGet(pathAndQuery, budget, meta = {}) {
  if (budget.remaining <= 0) return null;
  budget.remaining--;
  budget.used++;
  await sleep(DELAY_MS);

  const sep = pathAndQuery.includes("?") ? "&" : "?";
  const url = `${BASE}${pathAndQuery}${sep}apiKey=${KEY}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    meta.status = r.status;
    if (r.status === 429) {
      budget.remaining = 0;
      budget.limitHit = true;
      log("HTTP 429 rate limited — aborting run, next cycle continues");
      return null;
    }
    if (!r.ok) { log(`HTTP ${r.status} → ${pathAndQuery.split("?")[0]}`); return null; }
    return await r.json();
  } catch (e) {
    log(`fetch error: ${e?.message || e} → ${pathAndQuery.split("?")[0]}`);
    return null;
  }
}

// The batch endpoint is not available on every plan (the free tier 403s it —
// observed on the first keyed run, 2026-07-12). Once detected, the whole
// process falls back to per-event /odds requests: 1 request per match instead
// of per 10, so the run budget covers fewer matches — priority leagues are
// already fetched first, and the 8h refresh gate tops the rest up across
// later cycles.
let oddsMultiBlocked = false;

// ─── Market parsing ───────────────────────────────────────────────────────────
// odds-api.io /odds event shape:
//   { id, home, away, bookmakers: { "Bet365": [ { name: "ML", odds: [{home,draw,away}] },
//                                               { name: "Totals", odds: [{hdp,over,under},…] },
//                                               { name: "Both Teams to Score", odds: [{yes,no}] } ] } }
// Odds values arrive as strings.

function num(v) {
  const n = Number(v);
  return (Number.isFinite(n) && n > 1) ? +n.toFixed(3) : null;
}

function legValues(row, legs) {
  const out = {};
  for (const leg of legs) {
    const v = num(row?.[leg]);
    if (v == null) return null;
    out[leg] = v;
  }
  return out;
}

function marketFromRows(name, rows) {
  const n = String(name || "").toLowerCase();
  if (n === "ml" || n === "1x2" || n === "match result") {
    const vals = legValues(rows[0], ["home", "draw", "away"]);
    return vals ? { key: "1X2", vals } : null;
  }
  if (n === "totals" || n === "over/under") {
    const line = rows.find(r => Number(r?.hdp) === 2.5);
    if (!line) return null;
    const vals = legValues(line, ["over", "under"]);
    return vals ? { key: "OU25", vals } : null;
  }
  if (n.includes("both teams") || n === "btts") {
    const vals = legValues(rows[0], ["yes", "no"]);
    return vals ? { key: "BTTS", vals } : null;
  }
  return null;
}

// Returns { "1X2": {greek:{},european:{},asian:{},betfair:{}}, "OU25": …, "BTTS": … }
export function parseEventMarkets(ev) {
  const result = {};
  for (const [bkName, marketList] of Object.entries(ev?.bookmakers || {})) {
    if (!Array.isArray(marketList)) continue;
    for (const mkt of marketList) {
      const rows = Array.isArray(mkt?.odds) ? mkt.odds : [];
      if (!rows.length) continue;
      const parsed = marketFromRows(mkt?.name, rows);
      if (!parsed) continue;
      if (!result[parsed.key]) result[parsed.key] = { greek: {}, european: {}, asian: {}, betfair: {} };
      result[parsed.key][classifyBook(bkName)][bkName.toLowerCase()] = parsed.vals;
    }
  }
  return result;
}

// Merge one provider event into the multi-odds cache entry for our matchId.
// Exported so verification can drive it without the network.
export function ingestOddsEvent(cache, matchId, home, away, ev) {
  const freshMarkets = parseEventMarkets(ev);
  if (!Object.keys(freshMarkets).length) return null;

  const existing = cache[matchId] || {};
  const existingMarkets = existing.markets || {};
  const mergedMarkets = { ...existingMarkets };
  for (const [mk, fresh] of Object.entries(freshMarkets)) {
    mergedMarkets[mk] = mergeWithDelta(existingMarkets[mk] || null, fresh);
  }

  cache[matchId] = {
    ...existing,
    home,
    away,
    oddsApiIoEventId:   ev?.id ?? existing.oddsApiIoEventId ?? null,
    oddsApiIoFetchedAt: Date.now(),
    openedAt:           existing.openedAt || Date.now(),
    markets:            mergedMarkets,
  };
  return mergedMarkets;
}

// ─── Match list loader (with leagueSlug for prioritisation) ────────────────────

function loadMatchesForDate(date) {
  // 1. Deploy snapshot (today/past)
  try {
    const p = resolveDataPath("deploy-snapshots", date, "odds.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const ms = (j.matches || []).map(m => ({
      matchId:    String(m.matchId || m.id || ""),
      homeTeam:   m.homeTeam || m.home || "",
      awayTeam:   m.awayTeam || m.away || "",
      leagueSlug: m.leagueSlug || "",
    })).filter(m => m.homeTeam && m.awayTeam && m.matchId);
    if (ms.length) return ms;
  } catch { /**/ }

  // 2. Canonical-fixtures (future dates where daily cycle ran ahead)
  try {
    const dir = resolveDataPath("canonical-fixtures", date);
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    const ms = [];
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const m of (j.fixtures || [])) {
        if (m.homeTeam && m.awayTeam && m.matchId) {
          ms.push({
            matchId:    String(m.matchId),
            homeTeam:   m.homeTeam,
            awayTeam:   m.awayTeam,
            leagueSlug: m.leagueSlug || "",
          });
        }
      }
    }
    if (ms.length) return ms;
  } catch { /**/ }

  return [];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function fetchOddsApiIoDay(date, budget = null) {
  if (!KEY) { log("no ODDS_API_IO_KEY — skip"); return { ok: false, reason: "no_key", fetched: 0 }; }

  date = date || athensDayKey();
  budget = budget || createOddsApiIoBudget();

  const outDir  = ensureDir(resolveDataPath("multi-odds"));
  const outFile = path.join(outDir, `${date}.json`);

  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch { /**/ }
  const cache = existing.matches || {};

  const ourMatches = loadMatchesForDate(date);
  if (!ourMatches.length) {
    log(`${date}: no fixtures`);
    return { ok: true, date, fetched: 0, reason: "no_fixtures" };
  }

  // 8h refresh gate per match
  const now = Date.now();
  const stale = ourMatches.filter(m => {
    const last = cache[m.matchId]?.oddsApiIoFetchedAt || 0;
    return (now - last) > REFRESH_MS;
  });
  const skipped = ourMatches.length - stale.length;
  if (!stale.length) {
    log(`${date}: all ${ourMatches.length} matches fresh (<8h) — skip`);
    return { ok: true, date, fetched: 0, skipped };
  }
  if (budget.remaining <= 0) {
    log(`${date}: request budget exhausted — skip`);
    return { ok: true, date, fetched: 0, skipped, budgetExhausted: true };
  }

  log(`${date}: ${stale.length}/${ourMatches.length} matches need odds (budget ${budget.remaining} req)`);

  // 1) Provider events for this Athens day. Window [D-1 21:00Z, D 22:00Z]
  //    covers Athens midnight-to-midnight in both DST offsets.
  const from = `${addDays(date, -1)}T21:00:00Z`;
  const to   = `${date}T22:00:00Z`;
  const evJ  = await apiGet(`/events?sport=football&status=pending&from=${from}&to=${to}&limit=5000`, budget);
  const events = Array.isArray(evJ) ? evJ : (Array.isArray(evJ?.data) ? evJ.data : []);
  if (!events.length) {
    log(`${date}: provider returned no pending events`);
    return { ok: true, date, fetched: 0, skipped, matched: 0 };
  }
  log(`${date}: provider events ${events.length}`);

  // 2) Match our fixtures ↔ provider events (exact pair key, then fuzzy)
  const exactIndex = new Map();
  const reverseIndex = new Map();
  for (const ev of events) {
    if (!ev?.id || !ev?.home || !ev?.away) continue;
    exactIndex.set(pairKey(ev.home, ev.away), ev);
    reverseIndex.set(pairKey(ev.away, ev.home), ev);
  }

  const toFetch = [];
  const byEventId = new Map();
  for (const m of stale) {
    const fwd = pairKey(m.homeTeam, m.awayTeam);
    let ev = exactIndex.get(fwd) || reverseIndex.get(fwd);
    if (!ev) {
      ev = events.find(e =>
        namesMatch(m.homeTeam, e.home) && namesMatch(m.awayTeam, e.away)
      ) || events.find(e =>
        namesMatch(m.homeTeam, e.away) && namesMatch(m.awayTeam, e.home)
      );
    }
    if (!ev?.id || byEventId.has(String(ev.id))) continue;
    const entry = { matchId: m.matchId, eventId: String(ev.id), home: m.homeTeam, away: m.awayTeam, priority: PRIORITY_LEAGUES.has(m.leagueSlug) ? 0 : 1 };
    toFetch.push(entry);
    byEventId.set(entry.eventId, entry);
  }
  toFetch.sort((a, b) => a.priority - b.priority);
  log(`${date}: matched ${toFetch.length}/${stale.length} fixtures`);
  if (!toFetch.length) return { ok: true, date, fetched: 0, skipped, matched: 0 };

  // 3) Odds: /odds/multi batches (10 events/request) when the plan allows it,
  //    per-event /odds otherwise (see oddsMultiBlocked above).
  let fetched = 0;

  const ingest = (ev) => {
    const target = byEventId.get(String(ev?.id));
    if (!target) return;
    const merged = ingestOddsEvent(cache, target.matchId, target.home, target.away, ev);
    if (!merged) return;
    const books1x2 = Object.values(merged["1X2"] || {}).reduce((s, g) => s + Object.keys(g).length, 0);
    log(`  ${target.home} vs ${target.away}: ${books1x2} books [${Object.keys(merged).join(",")}]`);
    fetched++;
  };

  for (let i = 0; i < toFetch.length; ) {
    if (budget.remaining <= 0) {
      log(`${date}: budget exhausted after ${fetched} matches — rest next cycle`);
      break;
    }

    if (!oddsMultiBlocked) {
      const chunk = toFetch.slice(i, i + 10);
      const ids = chunk.map(c => c.eventId).join(",");
      const meta = {};
      const oddsJ = await apiGet(`/odds/multi?eventIds=${encodeURIComponent(ids)}&bookmakers=${BOOKMAKERS_PARAM}`, budget, meta);
      if (oddsJ) {
        const oddsEvents = Array.isArray(oddsJ) ? oddsJ : Object.values(oddsJ || {});
        for (const ev of oddsEvents) ingest(ev);
        i += chunk.length;
        continue;
      }
      if (meta.status === 403) {
        oddsMultiBlocked = true;
        log("plan does not allow /odds/multi (403) — falling back to per-event /odds");
        continue; // retry the same events per-event
      }
      i += chunk.length; // transient failure: skip this chunk (as before)
      continue;
    }

    const c = toFetch[i++];
    const oddsJ = await apiGet(`/odds?eventId=${encodeURIComponent(c.eventId)}&bookmakers=${BOOKMAKERS_PARAM}`, budget);
    if (!oddsJ) continue;
    // Single-event responses may be one object (with .bookmakers) or an array.
    const evs = Array.isArray(oddsJ) ? oddsJ : (oddsJ?.bookmakers ? [oddsJ] : Object.values(oddsJ || {}));
    for (const ev of evs) {
      if (ev && typeof ev === "object" && !ev.id) ev.id = c.eventId;
      ingest(ev);
    }
  }

  // 4) Persist (even partial — truth is truth)
  fs.writeFileSync(outFile, JSON.stringify({ date, updatedAt: Date.now(), matches: cache }, null, 2), "utf8");
  log(`${date}: done`, { fetched, skipped, requestsUsed: budget.used, limitHit: budget.limitHit });

  return { ok: true, date, fetched, skipped, matched: toFetch.length, requestsUsed: budget.used, limitHit: budget.limitHit };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  fetchOddsApiIoDay(arg)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e.message); process.exitCode = 1; });
}
