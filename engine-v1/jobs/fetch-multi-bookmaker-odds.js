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

// ─── OddsPapi odds parsing ─────────────────────────────────────────────────────

// Market 101 = 1X2: outcome 101=Home, 102=Draw, 103=Away
function parse1X2(bookmakerOdds) {
  const result = { greek: {}, european: {}, asian: {}, betfair: {} };

  for (const [bk, bdata] of Object.entries(bookmakerOdds || {})) {
    if (!bdata?.bookmakerIsActive) continue;
    const m = bdata?.markets?.["101"];
    if (!m?.marketActive) continue;

    const outs = m.outcomes || {};
    const home  = outs["101"]?.players?.["0"]?.price;
    const draw  = outs["102"]?.players?.["0"]?.price;
    const away  = outs["103"]?.players?.["0"]?.price;

    if (!home || !draw || !away) continue;
    if (!Number.isFinite(home) || !Number.isFinite(draw) || !Number.isFinite(away)) continue;

    const panel = classifyBook(bk);
    result[panel][bk] = { home: +home.toFixed(3), draw: +draw.toFixed(3), away: +away.toFixed(3) };
  }

  return result;
}

// ─── Deploy snapshot reader ────────────────────────────────────────────────────

function loadTodayMatches(date) {
  try {
    const p = resolveDataPath("deploy-snapshots", date, "odds.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return (j.matches || [])
      .map(m => ({
        matchId:  m.matchId,
        homeTeam: m.homeTeam || m.home || "",
        awayTeam: m.awayTeam || m.away || "",
      }))
      .filter(m => m.homeTeam && m.awayTeam && m.matchId);
  } catch { return []; }
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

  // 1) Load our matches for today
  const ourMatches = loadTodayMatches(date);
  log(`our matches: ${ourMatches.length}`);
  if (!ourMatches.length) return { ok: false, reason: "no_fixtures" };

  // 2) Fetch OddsPapi fixtures for today (not-started = pre-match).
  //    Using from=today&to=tomorrow because same-day queries return fewer results.
  const nextDay = new Date(new Date(date + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
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

  // 4) Match our fixtures to OddsPapi fixtures
  const toFetch = [];
  for (const m of ourMatches) {
    if (cache[m.matchId]) continue; // already fetched today

    const fwd = pairKey(m.homeTeam, m.awayTeam);
    let opFix = exactIndex.get(fwd) || reverseIndex.get(fwd);

    if (!opFix) {
      // Fuzzy: scan all opWithOdds
      opFix = opWithOdds.find(f =>
        namesMatch(m.homeTeam, f.participant1Name) &&
        namesMatch(m.awayTeam, f.participant2Name)
      ) || opWithOdds.find(f =>
        namesMatch(m.homeTeam, f.participant2Name) &&
        namesMatch(m.awayTeam, f.participant1Name)
      );
    }

    if (opFix) {
      toFetch.push({ matchId: m.matchId, fixtureId: opFix.fixtureId, home: m.homeTeam, away: m.awayTeam });
    }
  }

  log(`matched ${toFetch.length}/${ourMatches.length} fixtures`);

  // 5) Fetch odds for each matched fixture
  let fetched = 0;
  for (const { matchId, fixtureId, home, away } of toFetch) {
    await sleep(DELAY_MS);

    const oddsJ = await apiGet(`/odds?fixtureId=${encodeURIComponent(fixtureId)}&marketId=101`);
    if (!oddsJ?.bookmakerOdds) {
      log(`  skip ${home} vs ${away}: no bookmakerOdds`);
      continue;
    }

    const parsed1X2 = parse1X2(oddsJ.bookmakerOdds);
    const totalBooks = Object.values(parsed1X2).reduce((s, g) => s + Object.keys(g).length, 0);
    log(`  ${home} vs ${away}: ${totalBooks} bookmakers`);

    cache[matchId] = {
      oddspapiFixtureId: fixtureId,
      fetchedAt: Date.now(),
      markets: { "1X2": parsed1X2 },
    };
    fetched++;
  }

  // 6) Persist
  const out = { date, updatedAt: Date.now(), matches: cache };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), "utf8");
  log("done", { fetched, cached: Object.keys(cache).length, file: outFile });

  return { ok: true, date, fetched, total: Object.keys(cache).length };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  fetchMultiBookmakerOdds(arg).then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e.message); process.exitCode = 1; });
}
