/**
 * fetch-oddsportal-greek-odds.js
 *
 * ⛔ RETIRED 2026-07-09 — DO NOT WIRE BACK IN. OddsPortal moved its odds
 *    behind AJAX + Cloudflare, so the __NEXT_DATA__ parser below finds
 *    nothing and every run fetched 0 matches. Replaced by
 *    jobs/fetch-oddsapiio-odds.js (odds-api.io adapter). Kept for the
 *    league-slug → OddsPortal path mapping and as historical reference.
 *
 * Fetches per-bookmaker 1X2 odds from OddsPortal for any date's matches.
 * Captures ALL bookmakers and classifies them into Greek / European / Asian /
 * Betfair panels — no OddsPapi API needed, no request limits.
 *
 * ⚠️  GEO-BLOCK: OddsPortal blocks Greek IPs. This job ONLY works from
 *     Render (US/EU server) — it will return empty results when run locally
 *     from Greece. This is expected behaviour, not a bug.
 *
 * Flow:
 *   1. Load matches: deploy snapshot (today/past) or canonical-fixtures (future)
 *   2. For each match: find URL on OddsPortal league page
 *   3. Fetch match page → extract __NEXT_DATA__ JSON
 *   4. Classify all bookmakers into panels → write to multi-odds/{date}.json
 *
 * Usage: node engine-v1/jobs/fetch-oddsportal-greek-odds.js [YYYY-MM-DD]
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

const OP_BASE  = "https://www.oddsportal.com";
const DELAY_MS = 3000;

// ─── Bookmaker panel classification ───────────────────────────────────────────
const GREEK_BOOKS = new Set([
  "stoiximan", "vistabet", "pamestoixima.gr", "betano", "novibet",
  "netbet.gr", "sportingbet.gr",
]);
const ASIAN_BOOKS = new Set([
  "pinnacle", "singbet", "18bet", "isport",
  "betisn", "ibc", "sbotop", "1xbet", "marathonbet",
]);
const BETFAIR_BOOKS = new Set([
  "betfair", "betfair exchange", "smarkets", "matchbook",
]);
// All others → european

const REFRESH_MS = 8 * 60 * 60 * 1000; // 8h gate — same as prefetch budget

// ─── League slug → OddsPortal path mapping ────────────────────────────────────
// Format: our slug → path string OR array of paths to try in order
// (some slugs map to both a league AND a cup on OddsPortal)
const LEAGUE_MAP = {
  // Summer leagues we actively track
  "swe.1":  "/soccer/sweden/allsvenskan/",
  "swe.2":  "/soccer/sweden/superettan/",
  "nor.1":  "/soccer/norway/eliteserien/",
  "nor.2":  "/soccer/norway/obos-ligaen/",
  "fin.1":  "/soccer/finland/veikkausliiga/",
  "fro.1":  "/soccer/faroe-islands/1-deild/",
  "fro.2":  "/soccer/faroe-islands/2-deild/",
  "isl.1":  "/soccer/iceland/urvalsdeild/",
  "irl.1":  "/soccer/ireland/premier-division/",
  "irl.2":  "/soccer/ireland/first-division/",
  "dan.1":  "/soccer/denmark/superliga/",
  "dan.2":  "/soccer/denmark/1st-division/",
  // Winter leagues (active now for pre-season/cups)
  "eng.1":  "/soccer/england/premier-league/",
  "eng.2":  "/soccer/england/championship/",
  "eng.3":  "/soccer/england/league-one/",
  "ger.1":  "/soccer/germany/bundesliga/",
  "ger.2":  "/soccer/germany/2-bundesliga/",
  "spa.1":  "/soccer/spain/laliga/",
  "spa.2":  "/soccer/spain/laliga2/",
  "ita.1":  "/soccer/italy/serie-a/",
  "ita.2":  "/soccer/italy/serie-b/",
  "fra.1":  "/soccer/france/ligue-1/",
  "fra.2":  "/soccer/france/ligue-2/",
  "por.1":  "/soccer/portugal/primeira-liga/",
  "nld.1":  "/soccer/netherlands/eredivisie/",
  "bel.1":  "/soccer/belgium/first-division-a/",
  "tur.1":  "/soccer/turkey/super-lig/",
  "gre.1":  "/soccer/greece/super-league/",
  "gre.2":  "/soccer/greece/super-league-2/",
  "rus.1":  "/soccer/russia/premier-league/",
  "pol.1":  "/soccer/poland/ekstraklasa/",
  "cze.1":  "/soccer/czech-republic/1-liga/",
  "hrv.1":  "/soccer/croatia/hnl/",
  "srb.1":  "/soccer/serbia/super-liga/",
  "rou.1":  "/soccer/romania/liga-i/",
  "bul.1":  "/soccer/bulgaria/first-league/",
  "hun.1":  "/soccer/hungary/nb-i/",
  "cyp.1":  "/soccer/cyprus/1st-division/",
  "svk.1":  "/soccer/slovakia/super-liga/",
  "svn.1":  "/soccer/slovenia/prva-liga/",
  // South America
  "bra.1":  "/soccer/brazil/serie-a/",
  "bra.2":  "/soccer/brazil/serie-b/",
  "arg.1":  "/soccer/argentina/primera-division/",
  "col.1":  "/soccer/colombia/primera-a/",
  "chi.1":  ["/soccer/chile/primera-division/", "/soccer/chile/copa-chile/"],
  "uru.1":  "/soccer/uruguay/primera-division/",
  "ecu.1":  "/soccer/ecuador/liga-pro/",
  "per.1":  "/soccer/peru/primera-division/",
  "ven.1":  ["/soccer/venezuela/primera-division/", "/soccer/venezuela/copa-venezuela/"],
  "par.1":  "/soccer/paraguay/primera-division/",
  // CONCACAF
  "usa.1":  "/soccer/usa/mls/",
  "usa.2":  "/soccer/usa/usl-championship/",
  "can.1":  "/soccer/canada/canadian-premier-league/",
  "mex.1":  "/soccer/mexico/liga-mx/",
  // Asia
  "jpn.1":  "/soccer/japan/j-league/",
  "kor.1":  "/soccer/south-korea/k-league-1/",
  "chn.1":  "/soccer/china/super-league/",
  "aus.1":  "/soccer/australia/a-league/",
  // Cups
  "eng.league_cup":        "/soccer/england/efl-cup/",
  "ger.dfb_pokal":         "/soccer/germany/dfb-pokal/",
  "ita.coppa_italia":      "/soccer/italy/coppa-italia/",
  "fra.coupe_de_france":   "/soccer/france/coupe-de-france/",
  // International
  "fifa.world_cup":        "/soccer/world/fifa-world-cup-2026/",
  "uefa.cl":               "/soccer/europe/champions-league/",
  "uefa.el":               "/soccer/europe/europa-league/",
  "uefa.conference.league":"/soccer/europe/conference-league/",
  "conmebol.libertadores": "/soccer/south-america/copa-libertadores/",
  "conmebol.sudamericana": "/soccer/south-america/copa-sudamericana/",
  // Copa Chile / Copa Venezuela (separate from league)
  "chi.1.cup":  "/soccer/chile/copa-chile/",
  "ven.1.cup":  "/soccer/venezuela/copa-venezuela/",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(...a) { console.log("[op-greek]", ...a); }

function normTeam(name) {
  if (!name) return "";
  return String(name).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(fc|sc|fk|cf|afc|bk|sk|if|iff|ik|ss|ac|as|rc|cd|ud|ca)\b/g, " ")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function namesMatch(a, b) {
  const na = normTeam(a), nb = normTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Levenshtein ≤ 3
  if (na.length < 4 || nb.length < 4) return false;
  let prev = [...Array(nb.length+1).keys()];
  for (let i=1; i<=na.length; i++) {
    const cur = [i];
    for (let j=1; j<=nb.length; j++)
      cur[j] = na[i-1]===nb[j-1] ? prev[j-1] : 1+Math.min(prev[j],cur[j-1],prev[j-1]);
    prev = cur;
  }
  return prev[nb.length] <= 3;
}

const H = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,*/*;q=0.9",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control":   "no-cache",
};

async function fetchPage(url) {
  try {
    const r = await fetch(url, { headers: H, signal: AbortSignal.timeout(12000) });
    if (!r.ok) { log(`HTTP ${r.status} → ${url}`); return null; }
    const t = await r.text();
    if (t.includes("not available in your country")) {
      log("GEO BLOCKED — this job must run on Render (US IP), not locally from Greece");
      return null;
    }
    return t;
  } catch(e) {
    log(`fetch error: ${e.message} → ${url}`);
    return null;
  }
}

// Extract __NEXT_DATA__ JSON from a Next.js page
function extractNextData(html) {
  if (!html) return null;
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

// ─── Parse match page for bookmaker odds ──────────────────────────────────────
// OddsPortal stores odds in __NEXT_DATA__.props.pageProps.eventData or similar

function parseMatchOdds(html) {
  const nd = extractNextData(html);
  if (!nd) {
    // Fallback: look for JSON embedded in script tags
    log("  no __NEXT_DATA__, trying embedded JSON");
    return null;
  }

  const pageProps = nd?.props?.pageProps || {};

  // Try different locations where odds might live
  const oddsData =
    pageProps?.oddsData ||
    pageProps?.eventData?.odds ||
    pageProps?.event?.odds ||
    pageProps?.initialState?.odds ||
    null;

  if (!oddsData) {
    // Log what keys we got for debugging
    log("  __NEXT_DATA__ keys:", Object.keys(pageProps).slice(0,8).join(", "));
    return null;
  }

  return oddsData;
}

// ─── Get match URL from league page ───────────────────────────────────────────

async function findMatchUrl(leaguePathOrPaths, homeTeam, awayTeam) {
  const paths = Array.isArray(leaguePathOrPaths) ? leaguePathOrPaths : [leaguePathOrPaths];
  for (const leaguePath of paths) {
    const result = await _findMatchUrlInPage(leaguePath, homeTeam, awayTeam);
    if (result) return result;
    if (paths.length > 1) await sleep(DELAY_MS);
  }
  return null;
}

async function _findMatchUrlInPage(leaguePath, homeTeam, awayTeam) {
  const html = await fetchPage(`${OP_BASE}${leaguePath}`);
  if (!html) return null;

  // OddsPortal embeds match data in __NEXT_DATA__
  const nd = extractNextData(html);
  if (!nd) {
    log(`  no __NEXT_DATA__ on league page ${leaguePath}`);
    return null;
  }

  // Find matches list in pageProps
  const pageProps = nd?.props?.pageProps || {};
  const eventList =
    pageProps?.eventList ||
    pageProps?.events ||
    pageProps?.data?.events ||
    pageProps?.initialState?.eventList ||
    null;

  if (!eventList) {
    log(`  no event list in league page. Keys: ${Object.keys(pageProps).slice(0,8).join(", ")}`);
    return null;
  }

  const events = Array.isArray(eventList) ? eventList : Object.values(eventList);
  for (const ev of events) {
    const home = ev?.homeTeam || ev?.home_name || ev?.participant1 || "";
    const away = ev?.awayTeam || ev?.away_name || ev?.participant2 || "";
    const url  = ev?.url || ev?.slug || ev?.eventUrl || "";

    if (namesMatch(homeTeam, home) && namesMatch(awayTeam, away)) {
      return url.startsWith("/") ? `${OP_BASE}${url}` : url;
    }
  }

  // Also try regex on raw HTML to find match links
  const pattern = new RegExp(
    `href="(/soccer/[^"]+/${normTeam(homeTeam).replace(/\s/g,"-")}-${normTeam(awayTeam).replace(/\s/g,"-")}-[a-zA-Z0-9]+/)"`,
    "i"
  );
  const m = html.match(pattern);
  if (m) return `${OP_BASE}${m[1]}`;

  return null;
}

// ─── Load matches: snapshot (today/past) or canonical-fixtures (future) ───────

function loadMatchesForDate(date) {
  // 1. Try deploy snapshot for this specific date
  try {
    const p = resolveDataPath("deploy-snapshots", date, "odds.json");
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    const ms = (j.matches || []).map(m => ({
      matchId:    String(m.matchId || m.id || ""),
      homeTeam:   m.home || m.homeTeam || "",
      awayTeam:   m.away || m.awayTeam || "",
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
          ms.push({ matchId: String(m.matchId), homeTeam: m.homeTeam, awayTeam: m.awayTeam, leagueSlug: m.leagueSlug || "" });
        }
      }
    }
    if (ms.length) return ms;
  } catch { /**/ }

  // 3. fixtures-all.json — try today's snapshot, then yesterday's (covers D+0 when snapshot not yet created)
  for (let offset = 0; offset <= 1; offset++) {
    try {
      const d = new Date(); d.setDate(d.getDate() - offset);
      const key = d.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
      const p = resolveDataPath("deploy-snapshots", key, "fixtures-all.json");
      const j = JSON.parse(fs.readFileSync(p, "utf8"));
      const ms = (j.matches || [])
        .filter(m => m.dayKey === date && (m.home || m.homeTeam) && (m.away || m.awayTeam) && (m.id || m.matchId))
        .map(m => ({
          matchId:    String(m.matchId || m.id || ""),
          homeTeam:   m.homeTeam || m.home || "",
          awayTeam:   m.awayTeam || m.away || "",
          leagueSlug: m.leagueSlug || "",
        })).filter(m => m.matchId);
      if (ms.length) return ms;
    } catch { /**/ }
  }

  return [];
}

// ─── Classify a bookmaker name into a panel ───────────────────────────────────

function classifyBook(name) {
  const n = name.toLowerCase();
  if (GREEK_BOOKS.has(n))   return "greek";
  if (BETFAIR_BOOKS.has(n)) return "betfair";
  if (ASIAN_BOOKS.has(n))   return "asian";
  return "european";
}

// ─── Core: fetch all bookmaker odds for one match ─────────────────────────────

async function fetchMatchAllOdds(m, existingEntry) {
  const opPath = LEAGUE_MAP[m.leagueSlug];
  if (!opPath) { log(`  skip ${m.leagueSlug}: no OddsPortal mapping`); return null; }

  // 8h refresh gate — skip if recently fetched
  const lastFetch = existingEntry?.oddsPortalFetchedAt || 0;
  if (Date.now() - lastFetch < REFRESH_MS) {
    log(`  skip ${m.homeTeam} vs ${m.awayTeam}: fresh (<8h)`);
    return "skip";
  }

  log(`  fetching ${m.homeTeam} vs ${m.awayTeam} [${m.leagueSlug}]`);
  await sleep(DELAY_MS);

  const matchUrl = await findMatchUrl(opPath, m.homeTeam, m.awayTeam);
  if (!matchUrl) { log(`  not found on league page`); return null; }
  log(`  url: ${matchUrl.slice(OP_BASE.length)}`);

  await sleep(DELAY_MS);
  const html = await fetchPage(matchUrl);
  if (!html) return null;

  const oddsData = parseMatchOdds(html);
  if (!oddsData) { log(`  could not parse __NEXT_DATA__`); return null; }

  // Classify all bookmakers into panels
  const panels = { greek: {}, european: {}, asian: {}, betfair: {} };
  const bookList = Array.isArray(oddsData) ? oddsData : Object.values(oddsData);
  for (const bk of bookList) {
    const name = (bk?.bookmaker || bk?.name || bk?.id || "").toLowerCase();
    if (!name) continue;
    const odds = bk?.odds || bk?.prices || {};
    const home = Number(odds?.["1"] || odds?.home || odds?.[0]);
    const draw = Number(odds?.["X"] || odds?.draw || odds?.[1]);
    const away = Number(odds?.["2"] || odds?.away || odds?.[2]);
    if (!isFinite(home) || !isFinite(draw) || !isFinite(away)) continue;
    const panel = classifyBook(name);
    panels[panel][name] = { home: +home.toFixed(3), draw: +draw.toFixed(3), away: +away.toFixed(3) };
  }

  const total = Object.values(panels).reduce((s, p) => s + Object.keys(p).length, 0);
  log(`  ✓ ${total} books (gr:${Object.keys(panels.greek).length} eu:${Object.keys(panels.european).length} as:${Object.keys(panels.asian).length} bf:${Object.keys(panels.betfair).length})`);
  return panels;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function fetchOddsPortalAllOdds(date) {
  date = date || athensDayKey();
  log("start", { date });

  const outFile = path.join(ensureDir(resolveDataPath("multi-odds")), `${date}.json`);
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch { /**/ }
  const cache = existing.matches || {};

  const ourMatches = loadMatchesForDate(date);
  log(`matches: ${ourMatches.length}`);
  if (!ourMatches.length) return { ok: true, date, fetched: 0, reason: "no_fixtures" };

  let fetched = 0, skipped = 0;

  for (const m of ourMatches) {
    const existing_entry = cache[m.matchId] || null;
    const panels = await fetchMatchAllOdds(m, existing_entry);
    if (panels === "skip") { skipped++; continue; }
    if (!panels) continue;

    if (!cache[m.matchId]) cache[m.matchId] = {};
    cache[m.matchId].home = m.homeTeam;
    cache[m.matchId].away = m.awayTeam;
    cache[m.matchId].oddsPortalFetchedAt = Date.now();
    // Freeze openedAt on first fetch
    if (!cache[m.matchId].openedAt) cache[m.matchId].openedAt = Date.now();

    if (!cache[m.matchId].markets)        cache[m.matchId].markets = {};
    if (!cache[m.matchId].markets["1X2"]) cache[m.matchId].markets["1X2"] = { greek: {}, european: {}, asian: {}, betfair: {} };
    Object.assign(cache[m.matchId].markets["1X2"].greek,    panels.greek);
    Object.assign(cache[m.matchId].markets["1X2"].european, panels.european);
    Object.assign(cache[m.matchId].markets["1X2"].asian,    panels.asian);
    Object.assign(cache[m.matchId].markets["1X2"].betfair,  panels.betfair);
    fetched++;
  }

  fs.writeFileSync(outFile, JSON.stringify({ date, updatedAt: Date.now(), matches: cache }, null, 2), "utf8");
  log("done", { fetched, skipped });
  return { ok: true, date, fetched, skipped };
}

// Backward-compatible alias (called from index.js + run-daily-cycle.js)
export const fetchOddsPortalGreekOdds = fetchOddsPortalAllOdds;

// ─── CLI ──────────────────────────────────────────────────────────────────────

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
  fetchOddsPortalAllOdds(arg)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e.message); process.exitCode = 1; });
}
