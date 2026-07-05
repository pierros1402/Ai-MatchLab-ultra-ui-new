/**
 * apply-results-truth-to-canonical-day.js
 *
 * Cross-source finalization sweep for a PAST day's canonical fixtures.
 *
 * The ESPN live-status refresh can only terminalize leagues ESPN carries;
 * Flashscore-only / odds-only leagues (gab.1, blr.2, fro.2, ...) stayed
 * STATUS_SCHEDULED in canonical forever, which kept
 * auditFinalizationReadinessDay permanently unsafe and starved the
 * season-history append (the store froze at 2026-07-02 while every final
 * score sat in league-memory/results all along).
 *
 * Reuses overlayResultsTruth, so the same safety rules apply: a row is
 * upgraded ONLY when a unique final result for the same team pair exists in
 * the truth store (league+day first, then a globally-unique fallback), it
 * never downgrades, and postponed/canceled rows stay authoritative. No
 * time-based FT — the score comes from the accumulated multi-source truth
 * store or the row stays open.
 *
 * Usage: node engine-v1/jobs/apply-results-truth-to-canonical-day.js 2026-07-04
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { overlayResultsTruth } from "../core/results-truth-overlay.js";

export function applyResultsTruthToCanonicalDay(dayKey) {
  const safeDayKey = String(dayKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDayKey)) {
    return { ok: false, reason: "invalid_day_key", dayKey };
  }

  const dir = resolveDataPath("canonical-fixtures", safeDayKey);
  const stats = {
    ok: true,
    dayKey: safeDayKey,
    leaguesScanned: 0,
    leaguesWritten: 0,
    rowsUpgraded: 0,
    byLeague: {}
  };

  if (!fs.existsSync(dir)) {
    return { ...stats, ok: false, reason: "no_canonical_dir" };
  }

  for (const name of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
    const file = path.join(dir, name);

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }

    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : null;
    if (!fixtures || !fixtures.length) continue;
    stats.leaguesScanned++;

    // overlayResultsTruth returns the SAME row reference when nothing was
    // applied and a fresh object only on upgrade — ref inequality is the
    // exact upgrade count.
    const overlaid = overlayResultsTruth(fixtures, safeDayKey);
    let upgraded = 0;
    for (let i = 0; i < fixtures.length; i++) {
      if (overlaid[i] !== fixtures[i]) upgraded++;
    }
    if (!upgraded) continue;

    payload.fixtures = overlaid;
    payload.updatedAt = new Date().toISOString();
    payload.sourceMeta = {
      ...(payload.sourceMeta || {}),
      resultsTruthSweepAt: new Date().toISOString(),
      resultsTruthSweepUpgraded: upgraded,
      mode: "results_truth_finalize_sweep"
    };

    fs.writeFileSync(file, JSON.stringify(payload, null, 2) + "\n", "utf8");

    stats.leaguesWritten++;
    stats.rowsUpgraded += upgraded;
    stats.byLeague[name.replace(/\.json$/i, "")] = upgraded;
  }

  return stats;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const r = applyResultsTruthToCanonicalDay(process.argv[2]);
  console.log(JSON.stringify(r, null, 2));
  if (!r.ok) process.exit(1);
}
