/**
 * run-odds-refresh.js
 *
 * CI-friendly, self-gating odds refresh. Designed to be invoked hourly but only
 * actually re-scrape per policy (every 8h, or hourly within 4h before a kickoff),
 * so deploys stay few. State is derived from the committed odds.json itself
 * (generatedAt = last scrape, kickoffs = tracked matches) — no extra storage.
 *
 * Exits with `changed=true` in its JSON only when odds.json materially changed,
 * which the workflow uses to decide whether to commit/push.
 *
 * Usage: node engine-v1/jobs/run-odds-refresh.js [YYYY-MM-DD] [--force]
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { runOddsOpening } from "./run-odds-opening.js";
import { exportOddsSnapshotDay } from "./export-odds-snapshot-day.js";
import { oddsUpdateDecision, kickoffToUtcMs } from "../odds/odds-schedule.js";

function readExistingSnapshot(dayKey) {
  try {
    return JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", dayKey, "odds.json"), "utf8"));
  } catch {
    return null;
  }
}

export async function runOddsRefresh(dayKey = athensDayKey(), opts = {}) {
  const existing = readExistingSnapshot(dayKey);
  const lastScrapeAt = existing?.generatedAt ? Date.parse(existing.generatedAt) : null;
  const kickoffsUtc = (existing?.matches || [])
    .map(m => kickoffToUtcMs(m.kickoffLocal))
    .filter(Boolean);

  const decision = opts.force
    ? { due: true, reason: "forced", hoursSinceLast: null }
    : oddsUpdateDecision({ lastScrapeAt, kickoffsUtc });

  if (!decision.due) {
    return { ok: true, dayKey, due: false, reason: decision.reason, changed: false };
  }

  await runOddsOpening();
  const snap = exportOddsSnapshotDay(dayKey);

  return { ok: true, dayKey, due: true, reason: decision.reason, changed: snap.changed, count: snap.count };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args = process.argv.slice(2);
  const dayKey = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();
  const force = args.includes("--force");
  runOddsRefresh(dayKey, { force }).then(r => {
    console.log(JSON.stringify(r, null, 2));
  }).catch(err => {
    console.error("[run-odds-refresh] fatal", String(err?.message || err));
    process.exitCode = 1;
  });
}
