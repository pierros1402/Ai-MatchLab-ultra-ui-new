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

// ─── Team name normalisation for fuzzy matching ────────────────────────────────

const TEAM_STRIP = /\b(fc|sc|fk|cf|afc|bk|sk|if|iff|ik|rk|hk|pk|ff|ss|nk|gjk|vvv|rkc|btk|csk|iff|ac|as|ss|rc|cd|ud|ca|ssc|cf|sjk|rup|kc|fc|sc)\b/gi;

function normTeam(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(TEAM_STRIP, " ")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pairKey(a, b) {
  return `${normTeam(a)}~${normTeam(b)}`;
}

// Levenshtein distance for fallback fuzzy match
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] :
        1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function namesMatch(a, b) {
  const na = normTeam(a), nb = normTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Fuzzy: allow up to 3 chars edit distance on short names
  const maxDist = Math.floor(Math.min(na.length, nb.length) * 0.25);
  return lev(na, nb) <= Math.max(2, maxDist);
}

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

// Merge fresh odds with existing (preserves opening line, computes delta).
// Works for any market: legs are the keys of each bookmaker's odds object.
// existingPanel: the stored panel object (may have open/delta already), or null
// freshPanel:    newly parsed panel { greek:{}, european:{}, asian:{}, betfair:{} }
function mergeWithDelta(existingPanel, freshPanel) {
  const merged = { greek: {}, european: {}, asian: {}, betfair: {} };

  for (const panel of ["greek", "european", "asian", "betfair"]) {
    for (const [bk, fOdds] of Object.entries(freshPanel?.[panel] || {})) {
      const prev = existingPanel?.[panel]?.[bk];
      const legs = Object.keys(fOdds);

      if (!prev) {
        merged[panel][bk] = { ...fOdds, open: { ...fOdds } };
      } else {
        const open = prev.open || Object.fromEntries(legs.map(l => [l, prev[l]]));
        const delta = {};
        let anyMoved = false;
        for (const l of legs) {
          if (open[l] != null && fOdds[l] != null) {
            const d = +(fOdds[l] - open[l]).toFixed(3);
            delta[l] = d;
            if (d !== 0) anyMoved = true;
          }
        }
        merged[panel][bk] = {
          ...fOdds,
          open,
          ...(anyMoved ? { delta } : {}),
        };
      }
    }
  }

  return merged;
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

    // Merge each market with delta tracking
    const existingMarkets = cache[matchId]?.markets || {};
    const mergedMarkets = {};
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

export async function prefetchUpcomingOdds(startDate, daysAhead = 6) {
  if (!KEY) { log("prefetch: no ODDSPAPI_KEY — skip"); return { ok: false }; }

  startDate = startDate || athensDayKey();
  const endDate = addDays(startDate, daysAhead + 1); // exclusive end for OddsPapi

  log(`prefetch: ${startDate} → ${addDays(startDate, daysAhead)} (${daysAhead} days ahead)`);

  // Single OddsPapi fixtures call for the whole range
  await sleep(DELAY_MS);
  const fixJ = await apiGet(`/fixtures?sportId=10&statusId=0&from=${startDate}&to=${endDate}`);
  const allFix = (Array.isArray(fixJ?.data || fixJ) ? (fixJ?.data || fixJ) : []).filter(x => x.hasOdds);
  log(`prefetch: ${allFix.length} OddsPapi fixtures with odds in range`);

  // Build lookup index: normalized pair key → fixture (covers entire range)
  const fixIndex  = new Map();
  const fixIndexR = new Map();
  for (const f of allFix) {
    fixIndex.set(pairKey(f.participant1Name, f.participant2Name), f);
    fixIndexR.set(pairKey(f.participant2Name, f.participant1Name), f);
  }

  const outDir = ensureDir(resolveDataPath("multi-odds"));
  let totalFetched = 0;
  let totalSkipped = 0;

  // Process each future date independently
  for (let d = 1; d <= daysAhead; d++) {
    const date = addDays(startDate, d);

    // Load our matches from canonical-fixtures for this date
    const ourMatches = loadMatchesFromCanonical(date);
    if (!ourMatches.length) { log(`  ${date}: no canonical fixtures`); continue; }

    // Load existing odds file (may have prior prefetch data)
    const outFile = path.join(outDir, `${date}.json`);
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch { /**/ }
    const cache = existing.matches || {};

    // Filter OddsPapi fixtures to this specific date
    const dateFix = allFix.filter(f => (f.startTime || "").slice(0, 10) === date);

    let fetched = 0, skipped = 0;

    for (const m of ourMatches) {
      const cached = cache[m.matchId];

      // If already has openedAt from a prefetch AND fetched within 50min → skip
      // (hourly cron: re-fetch every ~1h to track intraday movement)
      const PREFETCH_REFRESH_MS = 50 * 60 * 1000;
      if (cached?.openedAt && (Date.now() - (cached.fetchedAt || 0)) < PREFETCH_REFRESH_MS) {
        skipped++;
        continue;
      }

      // Find matching OddsPapi fixture by team name
      const fwd = pairKey(m.homeTeam, m.awayTeam);
      let opFix = fixIndex.get(fwd) || fixIndexR.get(fwd);
      if (!opFix) {
        opFix = dateFix.find(f =>
          namesMatch(m.homeTeam, f.participant1Name) && namesMatch(m.awayTeam, f.participant2Name)
        ) || dateFix.find(f =>
          namesMatch(m.homeTeam, f.participant2Name) && namesMatch(m.awayTeam, f.participant1Name)
        );
      }
      if (!opFix) { skipped++; continue; }

      await sleep(DELAY_MS);
      const oddsJ = await apiGet(`/odds?fixtureId=${encodeURIComponent(opFix.fixtureId)}`);
      if (!oddsJ?.bookmakerOdds) { skipped++; continue; }

      const { markets: freshMarkets } = parseAllMarkets(oddsJ.bookmakerOdds);
      const existingMarkets = cached?.markets || {};
      const mergedMarkets = {};
      for (const [mk, fresh] of Object.entries(freshMarkets)) {
        mergedMarkets[mk] = mergeWithDelta(existingMarkets[mk] || null, fresh);
      }

      const books1X2 = Object.values(mergedMarkets["1X2"] || {}).reduce((s, g) => s + Object.keys(g).length, 0);
      const daysUntil = d;
      log(`  prefetch ${date}: ${m.homeTeam} vs ${m.awayTeam} — ${books1X2} books (D-${daysUntil})`);

      cache[m.matchId] = {
        oddspapiFixtureId: opFix.fixtureId,
        home:      m.homeTeam,
        away:      m.awayTeam,
        fetchedAt: Date.now(),
        openedAt:  cached?.openedAt || Date.now(),
        markets:   mergedMarkets,
      };
      fetched++;
    }

    log(`  ${date}: prefetched ${fetched}, skipped ${skipped} / ${ourMatches.length} canonical matches`);
    totalFetched += fetched;
    totalSkipped += skipped;

    const out = { date, updatedAt: Date.now(), matches: cache };
    fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf8");

    // AI assessment for this date (runs after odds write so assessment is independent)
    try {
      const ar = await buildAssessmentDay(date);
      log(`  ${date}: assessment ${ar.assessed} matches, ${ar.revised || 0} revised`);
    } catch (e) {
      log(`  ${date}: assessment failed — ${e?.message || e}`);
    }
  }

  log(`prefetch done: ${totalFetched} new fetches, ${totalSkipped} skipped`);
  return { ok: true, startDate, daysAhead, fetched: totalFetched };
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
