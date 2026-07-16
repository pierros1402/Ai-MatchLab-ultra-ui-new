/**
 * sync-deploy-snapshot-from-github.js
 *
 * Pull a day's deploy-snapshot artifacts (fixtures/odds/value/manifest/reports
 * + details/) and latest.json from the GitHub repo into the LOCAL data dir at
 * runtime — no Render build/deploy needed.
 *
 * Why: the Render engine serves data from its own disk, which is frozen at the
 * last deploy. Auto-redeploys per data refresh burned the Render pipeline-
 * minutes budget (505/500 by 2026-07-12, deploy-budget firewall added the same
 * day). GitHub Actions keep committing fresh snapshots to the repo all day;
 * this job lets the running instance MIRROR them instead of being rebuilt.
 *
 * Sources: GitHub contents API for the file listing (2 calls/sync — the
 * unauthenticated 60/hr per-IP limit is plenty), raw file downloads via each
 * entry's download_url. Files whose git blob sha already matches the local
 * copy are skipped, so intraday re-syncs only transfer what changed.
 *
 * Writes are atomic (tmp + rename) and purely additive/overwriting — nothing
 * is ever deleted, so a failed sync can't take the served snapshot down.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { athensDayKey, shiftDay } from "../core/daykey.js";

// Opening odds (data/multi-odds/<day>.json) are forward-looking — the Opening
// Tracker offers today + the next 7 days. They live OUTSIDE the per-day
// deploy-snapshot dir, so without this the live engine never mirrors them and
// the tracker shows empty. Pull the same forward window on every sync.
const MULTI_ODDS_DAYS_FORWARD = Number(process.env.SNAPSHOT_SYNC_MULTI_ODDS_DAYS || 7);

const REPO   = process.env.SNAPSHOT_SYNC_REPO || "pierros1402/Ai-MatchLab-ultra-ui-new";
const BRANCH = process.env.SNAPSHOT_SYNC_BRANCH || "main";
const API    = `https://api.github.com/repos/${REPO}/contents`;
const RAW    = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;
const UA     = "aimatchlab-snapshot-sync";
const CONCURRENCY = 8;
const FETCH_TIMEOUT_MS = 30000;

let inFlight = null; // serialize overlapping sync requests

function log(...a) { console.log("[snapshot-sync]", ...a); }

async function fetchWithTimeout(url, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, headers: { "user-agent": UA, ...(init.headers || {}) } });
  } finally {
    clearTimeout(t);
  }
}

/** git blob sha of a local file (matches the contents API's `sha`). */
function localBlobSha(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha1")
      .update(`blob ${buf.length}\0`)
      .update(buf)
      .digest("hex");
  } catch {
    return null;
  }
}

function writeAtomic(filePath, buf) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.sync-tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, filePath);
}

async function listDir(repoPath) {
  const res = await fetchWithTimeout(`${API}/${repoPath}?ref=${BRANCH}`, {
    headers: { accept: "application/vnd.github+json" }
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`list ${repoPath} → HTTP ${res.status}`);
  const arr = await res.json();
  return Array.isArray(arr) ? arr : [];
}

async function syncOne(entry, localPath, stats) {
  if (entry.type !== "file" || !entry.download_url) return;
  if (localBlobSha(localPath) === entry.sha) { stats.skippedUnchanged++; return; }
  const res = await fetchWithTimeout(entry.download_url);
  if (!res.ok) throw new Error(`fetch ${entry.path} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeAtomic(localPath, buf);
  stats.filesWritten++;
  stats.bytesWritten += buf.length;
}

async function syncRawOptional(repoPath, localPath, stats) {
  const res = await fetchWithTimeout(`${RAW}/${repoPath}`);
  if (res.status === 404) return { present: false, written: false };
  if (!res.ok) throw new Error(`fetch ${repoPath} → HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  try {
    if (fs.existsSync(localPath) && fs.readFileSync(localPath).equals(buf)) {
      stats.skippedUnchanged++;
      return { present: true, written: false };
    }
  } catch {
    // Fall through to the atomic write.
  }

  writeAtomic(localPath, buf);
  stats.filesWritten++;
  stats.bytesWritten += buf.length;
  return { present: true, written: true };
}

async function runBatches(jobs) {
  const errors = [];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    const slice = jobs.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(slice.map(fn => fn()));
    for (const r of results) if (r.status === "rejected") errors.push(String(r.reason?.message || r.reason));
  }
  return errors;
}
async function syncValueComparisonArtifact(day, stats) {
  const comparisonSync = await syncRawOptional(
    `data/value-comparison/${day}.json`,
    resolveDataPath("value-comparison", `${day}.json`),
    stats
  );
  stats.valueComparisonPresent = comparisonSync.present;
  stats.valueComparisonWritten = comparisonSync.written;
  return comparisonSync;
}

export async function syncValueComparisonFromGithub(dayKey = athensDayKey()) {
  const day = String(dayKey);
  const stats = {
    filesWritten: 0,
    skippedUnchanged: 0,
    bytesWritten: 0,
    valueComparisonPresent: false,
    valueComparisonWritten: false
  };
  try {
    await syncValueComparisonArtifact(day, stats);
    return {
      ok: true,
      dayKey: day,
      repo: REPO,
      branch: BRANCH,
      ...stats,
      errors: []
    };
  } catch (error) {
    return {
      ok: false,
      dayKey: day,
      repo: REPO,
      branch: BRANCH,
      ...stats,
      errors: [String(error?.message || error)]
    };
  }
}


// Mirror data/multi-odds/<day>.json for baseDay .. baseDay+daysForward. One
// directory listing (sha-gated like everything else) then transfer only the
// windowed files that changed. Returns its own error list so a multi-odds hiccup
// never gates latest.json — opening odds are a supplement, not the served slate.
async function syncMultiOddsWindow(baseDay, daysForward, stats) {
  const wanted = new Set();
  for (let i = 0; i <= daysForward; i++) wanted.add(shiftDay(baseDay, i));

  let entries;
  try {
    entries = await listDir("data/multi-odds");
  } catch (e) {
    return [`multi-odds list: ${String(e?.message || e)}`];
  }

  const jobs = [];
  for (const e of entries) {
    if (e.type !== "file" || !e.name.endsWith(".json")) continue;
    if (!wanted.has(e.name.replace(/\.json$/, ""))) continue;
    jobs.push(() => syncOne(e, resolveDataPath("multi-odds", e.name), stats));
  }
  stats.multiOddsListed = jobs.length;
  return runBatches(jobs);
}

export async function syncDeploySnapshotFromGithub(dayKey = athensDayKey()) {
  if (inFlight) return inFlight; // coalesce concurrent callers onto the running sync
  inFlight = (async () => {
    const startedAt = Date.now();
    const day = String(dayKey);
    const stats = {
      filesWritten: 0,
      skippedUnchanged: 0,
      bytesWritten: 0,
      multiOddsListed: 0,
      valueComparisonPresent: false,
      valueComparisonWritten: false
    };
    const repoDir = `data/deploy-snapshots/${day}`;

    const [top, details] = await Promise.all([
      listDir(repoDir),
      listDir(`${repoDir}/details`)
    ]);
    if (!top.length) {
      return { ok: false, dayKey: day, reason: "snapshot_day_not_in_repo", ...stats };
    }

    const jobs = [];
    for (const e of top) {
      if (e.type !== "file") continue;
      jobs.push(() => syncOne(e, resolveDataPath("deploy-snapshots", day, e.name), stats));
    }
    for (const e of details) {
      jobs.push(() => syncOne(e, resolveDataPath("deploy-snapshots", day, "details", e.name), stats));
    }
    const errors = await runBatches(jobs);

    // Opening odds window — supplement, kept off the `errors` gate below.
    const multiOddsErrors = await syncMultiOddsWindow(day, MULTI_ODDS_DAYS_FORWARD, stats);

    // Plan A/B comparison is a day-level runtime artifact outside the deploy
    // snapshot directory. Pull it by raw path (no extra Contents API listing)
    // so the UI can receive both plans without a daily Render/UI deploy.
    const valueComparisonErrors = [];
    try {
      await syncValueComparisonArtifact(day, stats);
    } catch (e) {
      valueComparisonErrors.push(String(e?.message || e));
    }

    // latest.json LAST and only on a healthy sync: consumers that follow the
    // pointer must never land on a half-written day.
    if (!errors.length) {
      try {
        const res = await fetchWithTimeout(`${RAW}/data/deploy-snapshots/latest.json`);
        if (res.ok) {
          writeAtomic(resolveDataPath("deploy-snapshots", "latest.json"), Buffer.from(await res.arrayBuffer()));
          stats.filesWritten++;
        }
      } catch (e) {
        errors.push(`latest.json: ${String(e?.message || e)}`);
      }
    }

    const summary = {
      ok: errors.length === 0,
      dayKey: day,
      repo: REPO,
      branch: BRANCH,
      listedTop: top.length,
      listedDetails: details.length,
      ...stats,
      errors: errors.slice(0, 10),
      multiOddsErrors: (multiOddsErrors || []).slice(0, 10),
      valueComparisonErrors: valueComparisonErrors.slice(0, 10),
      tookMs: Date.now() - startedAt
    };
    log("done", summary);
    return summary;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const day = process.argv[2] || athensDayKey();
  syncDeploySnapshotFromGithub(day)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error("[snapshot-sync] fatal", String(err?.message || err)); process.exitCode = 1; });
}
