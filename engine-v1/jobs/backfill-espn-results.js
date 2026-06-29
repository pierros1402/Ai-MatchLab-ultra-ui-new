/**
 * backfill-espn-results.js
 *
 * Historical results backfill from ESPN's unofficial scoreboard API — the same
 * secondary source the gap-filling cascade already uses (espn-match-source.js).
 * It exists to cover leagues football-data.co.uk does NOT carry, above all the
 * Americas: Colombia, Chile, Peru, Uruguay, Venezuela, Ecuador and the various
 * second divisions, all of which otherwise only had ~7 days of play-forward.
 *
 * ESPN goes ~5 years back and our slugs are already ESPN-style, so no mapping is
 * needed except where ESPN names a league differently (see ESPN_SLUG).
 *
 * Endpoint: /apis/site/v2/sports/soccer/{slug}/scoreboard?dates=YYYYMM
 *   ESPN caps a scoreboard response at 100 events, so we walk month-by-month
 *   (a single league-month is always well under 100); if a month ever returns
 *   the cap we split it into two half-month windows.
 *
 * Design (mirrors backfill-historical-results.js):
 *   - Idempotent: recordMatchResult dedups by matchId (here "espn_{eventId}").
 *   - Resumable: progress in data/backfill-progress.json, keyed
 *     "espn:{slug}:{YYYY-MM}". Only PAST months are marked complete; the current
 *     month stays re-runnable so a later run picks up its still-arriving games.
 *   - Guardrails: canonicalWrites 0 (writes only to league-memory/results).
 *
 * Usage:
 *   node engine-v1/jobs/backfill-espn-results.js
 *   node engine-v1/jobs/backfill-espn-results.js --months=60
 *   node engine-v1/jobs/backfill-espn-results.js --slug=col.1
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { recordMatchResult, getResultsSummary } from "../storage/results-memory-db.js";

const PROGRESS_FILE = resolveDataPath("backfill-progress.json");
const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const HEADERS = { "user-agent": "Mozilla/5.0 Chrome/120", "accept": "application/json" };
const DELAY_MS = 400;     // polite delay between requests
const MAX_RETRIES = 4;    // ESPN throttles bulk runs — back off and retry

// Americas leagues that football-data.co.uk's CSV set does not cover, so they
// would otherwise have no retroactive depth. Top flights + second divisions.
const AMERICAS_BACKFILL = [
  "col.1", "chi.1", "per.1", "uru.1", "ven.1", "ecu.1",
  "arg.2", "bra.2", "mex.2", "usa.2",
  "col.2", "chi.2", "uru.2", "per.2", "ven.2", "ecu.2",
];

// Remaining leagues outside the Americas that football-data.co.uk does NOT carry
// but ESPN DOES have 5y of (verified by scoreboard probe). Everything else that
// lacks history returned HTTP 400 on ESPN (no free retro source exists — those
// stay play-forward by necessity). jpn.1 is handled separately as a gap-fill
// (football-data already covers it through 2025) to avoid duplicate matches.
const ESPN_EXTRA = [
  "eng.5", "ned.2", "isr.1", "mlt.1", "nir.1", "wal.1",
  "ksa.1", "idn.1", "mys.1", "ind.1", "uga.1", "rsa.1", "rsa.2",
];

const DEFAULT_BACKFILL = [...new Set([...AMERICAS_BACKFILL, ...ESPN_EXTRA])];

// Our slug → ESPN slug, only where ESPN diverges from the ESPN-style default.
const ESPN_SLUG = {
  "usa.2": "usa.usl.1", // USL Championship
};

function espnSlug(slug) { return ESPN_SLUG[slug] || slug; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(...a) { console.log("[espn-backfill]", ...a); }

// Returns parsed JSON, or null only after exhausting retries. Transient ESPN
// throttling (429/5xx) and network errors are retried with exponential backoff
// so a temporary failure never gets mistaken for an empty month.
async function getJson(url) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (r.ok) return await r.json();
      // 4xx other than 429 are permanent (e.g. unknown league) — don't retry.
      if (r.status !== 429 && r.status < 500) return null;
    } catch { /* network/timeout — retry */ }
    if (attempt < MAX_RETRIES) await sleep(DELAY_MS * Math.pow(2, attempt + 1));
  }
  return null;
}

// Most recent `count` months, oldest-first, each { y, m, key:"YYYY-MM" }.
function buildMonths(count = 60) {
  const now = new Date();
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(), m = d.getMonth() + 1;
    out.push({ y, m, key: `${y}-${String(m).padStart(2, "0")}` });
  }
  return out;
}

// Pull finished matches from one ESPN scoreboard response window (dates=YYYYMMDD
// or a YYYYMMDD-YYYYMMDD range). Returns { rows, count } where count is the raw
// event count (used to detect the 100-event cap).
async function fetchWindow(eslug, datesParam) {
  const sb = await getJson(`${BASE}/${eslug}/scoreboard?dates=${datesParam}`);
  if (sb == null) return { ok: false, rows: [], count: 0 }; // fetch failed — caller must not mark complete
  const events = sb.events || [];
  const rows = [];
  for (const ev of events) {
    const c = ev.competitions?.[0];
    if (!c?.status?.type?.completed) continue; // finished only
    const comps = c.competitors || [];
    const H = comps.find(x => x.homeAway === "home");
    const A = comps.find(x => x.homeAway === "away");
    const home = H?.team?.displayName, away = A?.team?.displayName;
    const sh = H?.score != null && H.score !== "" ? Number(H.score) : null;
    const sa = A?.score != null && A.score !== "" ? Number(A.score) : null;
    if (!home || !away || sh == null || sa == null || Number.isNaN(sh) || Number.isNaN(sa)) continue;
    rows.push({
      matchId: `espn_${ev.id}`,
      home, away,
      scoreHome: sh, scoreAway: sa,
      kickoffUtc: ev.date || null,
    });
  }
  return { ok: true, rows, count: events.length };
}

// One month, with a half-month split fallback if ESPN's 100-event cap is hit.
// Returns { ok, rows }: ok=false means the fetch failed (don't mark complete).
async function fetchMonth(eslug, y, m) {
  const ym = `${y}${String(m).padStart(2, "0")}`;
  const first = await fetchWindow(eslug, ym);
  if (!first.ok) return { ok: false, rows: [] };
  if (first.count < 100) return { ok: true, rows: first.rows };

  // Cap hit — split into 01–15 and 16–end and merge (dedup by matchId).
  const lastDay = new Date(y, m, 0).getDate();
  const a = await fetchWindow(eslug, `${ym}01-${ym}15`);
  await sleep(DELAY_MS);
  const b = await fetchWindow(eslug, `${ym}16-${ym}${String(lastDay).padStart(2, "0")}`);
  if (!a.ok || !b.ok) return { ok: false, rows: [] };
  const seen = new Set();
  const out = [];
  for (const r of [...a.rows, ...b.rows]) {
    if (seen.has(r.matchId)) continue;
    seen.add(r.matchId);
    out.push(r);
  }
  return { ok: true, rows: out };
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); }
  catch { return { completed: [] }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2), "utf8"); }

export async function backfillEspnResults(options = {}) {
  const months = buildMonths(options.months || 60);
  const slugs = options.slug
    ? [options.slug]                       // run any single slug (need not be in a list)
    : (options.slugs || DEFAULT_BACKFILL);

  ensureDir(resolveDataPath("league-memory", "results"));

  const progress = loadProgress();
  const completedSet = new Set(progress.completed || []);
  const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

  const stats = { fetched: 0, skipped: 0, stored: 0, failed: 0, byLeague: {} };

  for (const slug of slugs) {
    const eslug = espnSlug(slug);
    let leagueStored = 0, leagueFailed = 0;
    for (const mo of months) {
      const key = `espn:${slug}:${mo.key}`;
      if (completedSet.has(key)) { stats.skipped++; continue; }

      const res = await fetchMonth(eslug, mo.y, mo.m);
      stats.fetched++;
      if (!res.ok) {
        // Transient failure after retries — leave the month UNmarked so the next
        // run retries it, rather than locking in an empty month.
        stats.failed++; leagueFailed++;
        await sleep(DELAY_MS);
        continue;
      }

      let stored = 0;
      for (const row of res.rows) if (recordMatchResult(slug, row)) stored++;
      stats.stored += stored;
      leagueStored += stored;

      // Past months are immutable; current month keeps filling, so leave it open.
      if (mo.key !== nowKey) {
        completedSet.add(key);
        saveProgress({ completed: [...completedSet], updatedAt: new Date().toISOString() });
      }
      await sleep(DELAY_MS);
    }
    if (leagueStored) stats.byLeague[slug] = leagueStored;
    log(`${slug} (espn:${eslug}) → ${leagueStored} new${leagueFailed ? `, ${leagueFailed} months failed` : ""}`);
  }

  return { ok: true, ...stats, results: getResultsSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args = process.argv.slice(2);
  const months = parseInt(args.find(a => a.startsWith("--months="))?.split("=")[1] || "60", 10);
  const slug = args.find(a => a.startsWith("--slug="))?.split("=")[1] || null;

  backfillEspnResults({ months, slug }).then(r => {
    console.log(JSON.stringify({
      fetched: r.fetched, skipped: r.skipped, stored: r.stored, failed: r.failed,
      leagues: Object.keys(r.byLeague).length, byLeague: r.byLeague,
      results: r.results, guarantees: { canonicalWrites: 0 },
    }, null, 2));
  }).catch(err => {
    console.error("fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}
