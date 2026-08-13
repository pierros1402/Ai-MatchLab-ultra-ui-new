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
import { exportFixturesSnapshotDay } from "./export-fixtures-snapshot-day.js";
import { oddsUpdateDecision, kickoffToUtcMs } from "../odds/odds-schedule.js";

function readExistingSnapshot(dayKey) {
  try {
    return JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", dayKey, "odds.json"), "utf8"));
  } catch {
    return null;
  }
}

export function persistedAssessmentSummary(snapshot) {
  const matches = Array.isArray(snapshot?.matches) ? snapshot.matches : [];
  const assessmentRows = matches.filter(
    match => match?.aiAssessment?.markets &&
      typeof match.aiAssessment.markets === "object" &&
      Object.keys(match.aiAssessment.markets).length > 0
  ).length;

  return {
    matchRows: matches.length,
    assessmentRows
  };
}

export function assertPersistedAssessmentPostcondition(snapshot, dayKey) {
  const summary = persistedAssessmentSummary(snapshot);

  if (summary.matchRows > 0 && summary.assessmentRows === 0) {
    const error = new Error(
      `persisted_model_assessments_missing:${dayKey}:matches=${summary.matchRows}`
    );
    error.code = "persisted_model_assessments_missing";
    error.dayKey = dayKey;
    error.matchRows = summary.matchRows;
    error.assessmentRows = summary.assessmentRows;
    throw error;
  }

  return summary;
}

export async function runOddsRefresh(dayKey = athensDayKey(), opts = {}) {
  const existing = readExistingSnapshot(dayKey);
  const lastScrapeAt = existing?.generatedAt ? Date.parse(existing.generatedAt) : null;
  const kickoffsUtc = (existing?.matches || [])
    .map(m => m.kickoffUtc ? Date.parse(m.kickoffUtc) : kickoffToUtcMs(m.kickoffLocal))
    .filter(Boolean);
  const existingAssessmentRows = (existing?.matches || []).filter(
    match => match?.aiAssessment?.markets && Object.keys(match.aiAssessment.markets).length > 0
  ).length;
  const missingAssessmentInput =
    Array.isArray(existing?.matches) &&
    existing.matches.length > 0 &&
    existingAssessmentRows === 0;

  const decision = opts.force
    ? { due: true, reason: "forced", hoursSinceLast: null }
    : missingAssessmentInput
      ? { due: true, reason: "missing_model_assessments", hoursSinceLast: null }
      : oddsUpdateDecision({ lastScrapeAt, kickoffsUtc });

  // Fixtures snapshot refreshes on every gated run (cheap; new fixtures appear).
  let fixturesChanged = false;
  try {
    const fx = await exportFixturesSnapshotDay(dayKey);
    fixturesChanged = fx.changed;
  } catch (err) {
    console.warn("[run-odds-refresh] fixtures export failed", String(err?.message || err));
  }

  if (!decision.due) {
    return { ok: true, dayKey, due: false, reason: decision.reason, changed: fixturesChanged, fixturesChanged };
  }

  await runOddsOpening();
  const snap = exportOddsSnapshotDay(dayKey);
  const persisted = readExistingSnapshot(dayKey);
  const persistence = assertPersistedAssessmentPostcondition(persisted, dayKey);

  return {
    ok: true,
    dayKey,
    due: true,
    reason: decision.reason,
    changed: snap.changed || fixturesChanged,
    fixturesChanged,
    count: snap.count,
    assessmentRows: persistence.assessmentRows
  };
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
