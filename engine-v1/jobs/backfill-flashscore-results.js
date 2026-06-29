/**
 * backfill-flashscore-results.js
 *
 * Historical results backfill straight from Flashscore's own archive feed — the
 * definitive source. It rides on the SAME ninja infrastructure (/x/feed/, same
 * x-fsign) the daily play-forward accumulator already depends on, so it adds no
 * new fragility, and crucially it returns the SAME native match ids (AA) as the
 * live feed — so recordMatchResult dedups perfectly against play-forward with
 * zero duplicate matches.
 *
 * It exists to give the long-tail leagues that neither football-data.co.uk nor
 * ESPN carries (most of the smaller UEFA nations, Korea/Qatar/UAE/Egypt, many
 * second divisions) real 5-year depth instead of play-forward only.
 *
 * Feed format (reverse-engineered from tournamentPage.client.js):
 *   results "show more":  tr_{sportId}_{countryId}_{templateId}_{t}_{e}_{hour}_{lang}_{projectTypeId}
 *   sportId=1 (football), lang=en, projectTypeId=2, hour=0.
 *   {t} is an internal per-season ordinal (NOT sequential by year — e.g. Sweden
 *   t=1→2008, t=18→2003), {e} is the page within a season. We therefore scan
 *   t = 1..MAX_SEASON_ORDINAL and page e = 1.. until empty, dump everything into
 *   recordMatchResult, and let the DB's 5-year cap (MAX_AGE_DAYS) keep only the
 *   recent window — so we never need to know which ordinal maps to which year.
 *
 * Per-league ids (countryId, templateId) come from the league's /results/ page
 * (LeaguePageHeaderData.tournamentTemplateId + the "{countryId}_{templateId}"
 * marker), located via the deterministic DOMESTIC_PATH_SLUG path map. Both are
 * present even when the league is off-season.
 *
 * Idempotent (native match ids), resumable (progress key "fs:{slug}", written
 * once a league's full scan completes), throttle-resilient (retry + backoff).
 * Guardrails: canonicalWrites 0 (writes only to league-memory/results).
 *
 * Usage:
 *   node engine-v1/jobs/backfill-flashscore-results.js            (all gap leagues)
 *   node engine-v1/jobs/backfill-flashscore-results.js --slug=cze.1
 *   node engine-v1/jobs/backfill-flashscore-results.js --force    (ignore progress)
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { recordMatchResult, getResultsSummary } from "../storage/results-memory-db.js";
import { parseFlashscoreFeed } from "../odds/flashscore-fixtures-source.js";
import { DOMESTIC_PATH_SLUG } from "../odds/flashscore-league-map.js";

const PROGRESS_FILE = resolveDataPath("backfill-progress.json");
const FSIGN = "SW9D1eZo";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const FEED_BASE = "https://2.flashscore.ninja/2/x/feed";
const PAGE_BASE = "https://www.flashscore.com";
const DELAY_MS = 250;
const MAX_RETRIES = 4;
const MAX_SEASON_ORDINAL = 30;  // covers ~25 seasons back; DB cap trims to 5y
const MAX_PAGES = 6;            // pages within one season ordinal

// Leagues already backfilled from a FOREIGN-id source (football-data fd_*, ESPN
// espn_*). Flashscore uses native ids, so re-backfilling these would duplicate
// the same matches under a different id. Skip them — they're already covered.
const ALREADY_BACKFILLED = new Set([
  // football-data.co.uk (mmz4281 + /new/)
  "eng.1", "eng.2", "eng.3", "eng.4", "ger.1", "ger.2", "esp.1", "esp.2",
  "ita.1", "ita.2", "fra.1", "fra.2", "ned.1", "bel.1", "por.1", "tur.1",
  "gre.1", "sco.1", "sco.2", "arg.1", "bra.1", "usa.1", "mex.1", "chn.1",
  "jpn.1", "rus.1", "aut.1", "den.1", "nor.1", "swe.1", "fin.1", "pol.1",
  "rou.1", "irl.1", "sui.1", "sui.2",
  // ESPN
  "col.1", "chi.1", "per.1", "uru.1", "ven.1", "ecu.1", "arg.2", "bra.2",
  "mex.2", "usa.2", "col.2", "eng.5", "ned.2", "isr.1", "mlt.1", "nir.1",
  "wal.1", "ksa.1", "idn.1", "mys.1", "ind.1", "uga.1", "rsa.1", "rsa.2",
]);

// slug -> Flashscore path (reverse of the domestic path map)
const PATH_FOR_SLUG = Object.fromEntries(
  Object.entries(DOMESTIC_PATH_SLUG).map(([path, slug]) => [slug, path])
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(...a) { console.log("[fs-backfill]", ...a); }

async function fetchText(url, headers) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.text();
      if (r.status !== 429 && r.status < 500) return null; // permanent
    } catch { /* retry */ }
    if (attempt < MAX_RETRIES) await sleep(DELAY_MS * Math.pow(2, attempt + 1));
  }
  return null;
}

const FEED_HEADERS = { "x-fsign": FSIGN, "user-agent": UA, "referer": "https://www.flashscore.com/" };
const PAGE_HEADERS = { "user-agent": UA, "accept": "text/html" };

/** Extract { countryId, templateId } for a league from its /results/ page. */
async function fetchLeagueIds(leaguePath) {
  const html = await fetchText(`${PAGE_BASE}${leaguePath}results/`, PAGE_HEADERS);
  if (!html) return null;
  const templateId = (html.match(/tournamentTemplateId: "([^"]+)"/) || [])[1];
  if (!templateId) return null;
  // countryId appears as the "{countryId}_{templateId}" marker (ZH) on the page.
  const cid = (html.match(new RegExp(`(\\d+)_${templateId}`)) || [])[1];
  if (!cid) return null;
  return { countryId: cid, templateId };
}

function feedKey(countryId, templateId, t, e) {
  return `tr_1_${countryId}_${templateId}_${t}_${e}_0_en_2`;
}

export async function backfillFlashscoreResults(options = {}) {
  ensureDir(resolveDataPath("league-memory", "results"));

  const progress = JSON.parse(fs.existsSync(PROGRESS_FILE) ? fs.readFileSync(PROGRESS_FILE, "utf8") : '{"completed":[]}');
  const completedSet = new Set(progress.completed || []);

  // Target = leagues we have a path for, that are NOT already foreign-id backfilled.
  const targets = options.slug
    ? [options.slug]
    : Object.values(DOMESTIC_PATH_SLUG).filter(s => !ALREADY_BACKFILLED.has(s));

  const stats = { leagues: 0, scanned: 0, stored: 0, skipped: 0, noIds: 0, byLeague: {} };

  for (const slug of targets) {
    const key = `fs:${slug}`;
    if (!options.force && completedSet.has(key)) { stats.skipped++; continue; }

    const leaguePath = PATH_FOR_SLUG[slug];
    if (!leaguePath) { log(`no path for ${slug}, skip`); continue; }

    const ids = await fetchLeagueIds(leaguePath);
    await sleep(DELAY_MS);
    if (!ids) { log(`${slug}: could not read ids, skip (will retry next run)`); stats.noIds++; continue; }

    stats.leagues++;
    let leagueStored = 0;
    for (let t = 1; t <= MAX_SEASON_ORDINAL; t++) {
      for (let e = 1; e <= MAX_PAGES; e++) {
        const txt = await fetchText(`${FEED_BASE}/${feedKey(ids.countryId, ids.templateId, t, e)}`, FEED_HEADERS);
        await sleep(DELAY_MS);
        if (!txt || txt.length <= 5) break; // empty page → this season ordinal done
        const rows = parseFlashscoreFeed(txt);
        stats.scanned += rows.length;
        let stored = 0;
        for (const m of rows) {
          if (m.scoreHome == null || m.scoreAway == null) continue;
          if (recordMatchResult(slug, {
            matchId: String(m.matchId), home: m.home, away: m.away,
            scoreHome: m.scoreHome, scoreAway: m.scoreAway, kickoffUtc: m.kickoffUtc,
          })) stored++;
        }
        leagueStored += stored;
        if (rows.length < 50) break; // short page → no more pages this season
      }
    }
    stats.stored += leagueStored;
    if (leagueStored) stats.byLeague[slug] = leagueStored;
    log(`${slug} (cid=${ids.countryId} tid=${ids.templateId}) → ${leagueStored} new`);

    completedSet.add(key);
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ ...progress, completed: [...completedSet], updatedAt: new Date().toISOString() }, null, 2), "utf8");
  }

  return { ok: true, ...stats, results: getResultsSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args = process.argv.slice(2);
  const slug = args.find(a => a.startsWith("--slug="))?.split("=")[1] || null;
  const force = args.includes("--force");

  backfillFlashscoreResults({ slug, force }).then(r => {
    console.log(JSON.stringify({
      leagues: r.leagues, scanned: r.scanned, stored: r.stored, skipped: r.skipped,
      noIds: r.noIds, byLeague: r.byLeague, results: r.results,
      guarantees: { canonicalWrites: 0 },
    }, null, 2));
  }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
