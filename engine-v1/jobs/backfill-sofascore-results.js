/**
 * backfill-sofascore-results.js
 *
 * One-shot historical results backfill from Sofascore — the only free source
 * with comprehensive WORLDWIDE coverage and full season history (everything the
 * long-tail leagues that football-data.co.uk and ESPN don't carry need:
 * Czech/Serbia/Croatia/Korea/Saudi/Qatar/UAE/Egypt and dozens of small UEFA
 * nations + their second divisions).
 *
 * Sofascore sits behind Cloudflare's "Just a moment…" JS challenge, which a
 * plain fetch cannot pass. So this job drives a REAL headless Chromium (via
 * Playwright) to clear the challenge once, then calls Sofascore's JSON API from
 * inside the page context (carrying the clearance cookie). Because Cloudflare is
 * far more aggressive against datacenter IPs, this is a LOCAL one-shot backfill —
 * it is NOT wired into the production daily cycle (ESPN + the Flashscore live
 * feed handle ongoing play-forward from the server). It seeds history once; the
 * autonomous pipeline keeps it current after that.
 *
 * League → Sofascore unique-tournament id map lives in
 * data/league-memory/_sofa-id-map.json (built by the discovery pass: per-country
 * tournament list, men's football only, cups/youth/women excluded, ranked by
 * userCount so tier-1/tier-2 land correctly).
 *
 * Idempotent (matchId "sofa_{eventId}"), resumable (progress key "sofa:{slug}"),
 * DB auto-caps to 5 years. Guardrails: canonicalWrites 0.
 *
 * Usage:
 *   node engine-v1/jobs/backfill-sofascore-results.js
 *   node engine-v1/jobs/backfill-sofascore-results.js --slug=cze.1
 *   node engine-v1/jobs/backfill-sofascore-results.js --seasons=6 --force
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { recordMatchResult, getResultsSummary } from "../storage/results-memory-db.js";

const PROGRESS_FILE = resolveDataPath("backfill-progress.json");
const ID_MAP_FILE = resolveDataPath("league-memory", "_sofa-id-map.json");
const API = "https://api.sofascore.com/api/v1";
const DELAY_MS = 350;

// Playwright's headless_shell can be version-mismatched; locate the full
// chromium build it downloaded and drive that instead.
function findChromium() {
  const root = path.join(process.env.LOCALAPPDATA || process.env.HOME || "", "ms-playwright");
  try {
    const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    if (dir) {
      const exe = path.join(root, dir, "chrome-win64", "chrome.exe");
      if (fs.existsSync(exe)) return exe;
    }
  } catch { /* fall through to Playwright default */ }
  return undefined;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(...a) { console.log("[sofa-backfill]", ...a); }

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8")); }
  catch { return { completed: [] }; }
}

// Windows can throw transient EBUSY/EPERM/UNKNOWN on writeFileSync (AV scans,
// file locks). Retry a few times before giving up.
function writeProgress(progress, completedSet) {
  const body = JSON.stringify({ ...progress, completed: [...completedSet], updatedAt: new Date().toISOString() }, null, 2);
  for (let i = 0; i < 5; i++) {
    try { fs.writeFileSync(PROGRESS_FILE, body, "utf8"); return; }
    catch (e) { if (i === 4) throw e; }
  }
}

export async function backfillSofascoreResults(options = {}) {
  ensureDir(resolveDataPath("league-memory", "results"));
  const idMap = JSON.parse(fs.readFileSync(ID_MAP_FILE, "utf8"));
  const seasonsWanted = options.seasons || 6;

  const progress = loadProgress();
  const completedSet = new Set(progress.completed || []);

  const slugs = options.slug ? [options.slug] : Object.keys(idMap);

  const browser = await chromium.launch({
    executablePath: findChromium(),
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const page = await (await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "en-US",
  })).newPage();
  // Clear the Cloudflare challenge once; the cookie then covers API calls.
  await page.goto("https://www.sofascore.com/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  const api = (url) => page.evaluate(async (u) => {
    try { const r = await fetch(u, { headers: { accept: "application/json" } }); return { s: r.status, j: await r.json().catch(() => null) }; }
    catch { return { s: 0, j: null }; }
  }, url);

  const stats = { leagues: 0, stored: 0, skipped: 0, byLeague: {} };

  try {
    for (const slug of slugs) {
      const key = `sofa:${slug}`;
      if (!options.force && completedSet.has(key)) { stats.skipped++; continue; }
      const tid = idMap[slug]?.id;
      if (!tid) { log(`no id for ${slug}, skip`); continue; }

      try {
      const seasonsRes = await api(`${API}/unique-tournament/${tid}/seasons`);
      await sleep(DELAY_MS);
      const seasons = (seasonsRes.j?.seasons || []).slice(0, seasonsWanted);
      if (!seasons.length) { log(`${slug}: no seasons (id ${tid})`); continue; }

      stats.leagues++;
      let leagueStored = 0;
      for (const season of seasons) {
        for (let pg = 0; pg < 20; pg++) {
          const evRes = await api(`${API}/unique-tournament/${tid}/season/${season.id}/events/last/${pg}`);
          await sleep(DELAY_MS);
          const events = evRes.j?.events || [];
          if (!events.length) break;
          for (const ev of events) {
            const finished = ev.status?.code === 100 || ev.status?.type === "finished";
            const hs = ev.homeScore?.current, as = ev.awayScore?.current;
            if (!finished || hs == null || as == null) continue;
            if (recordMatchResult(slug, {
              matchId: `sofa_${ev.id}`,
              home: ev.homeTeam?.name, away: ev.awayTeam?.name,
              scoreHome: Number(hs), scoreAway: Number(as),
              kickoffUtc: ev.startTimestamp ? new Date(ev.startTimestamp * 1000).toISOString() : null,
            })) leagueStored++;
          }
          if (!evRes.j?.hasNextPage && events.length < 30) break;
        }
      }
      stats.stored += leagueStored;
      if (leagueStored) stats.byLeague[slug] = leagueStored;
      log(`${slug} (sofa ${tid}) → ${leagueStored} new`);

      completedSet.add(key);
      writeProgress(progress, completedSet);
      } catch (err) {
        // Transient API/Cloudflare/file-write error — leave UNmarked so the next
        // run retries this league instead of crashing the whole batch.
        log(`${slug}: error (${String(err?.message || err).slice(0, 60)}) — will retry next run`);
      }
    }
  } finally {
    await browser.close();
  }

  return { ok: true, ...stats, results: getResultsSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args = process.argv.slice(2);
  const slug = args.find(a => a.startsWith("--slug="))?.split("=")[1] || null;
  const seasons = parseInt(args.find(a => a.startsWith("--seasons="))?.split("=")[1] || "6", 10);
  const force = args.includes("--force");

  backfillSofascoreResults({ slug, seasons, force }).then(r => {
    console.log(JSON.stringify({
      leagues: r.leagues, stored: r.stored, skipped: r.skipped,
      byLeague: r.byLeague, results: r.results, guarantees: { canonicalWrites: 0 },
    }, null, 2));
  }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
