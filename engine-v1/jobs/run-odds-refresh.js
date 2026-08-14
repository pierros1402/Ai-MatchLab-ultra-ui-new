/**
 * run-odds-refresh.js
 *
 * CI-friendly, self-gating odds refresh.
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { runOddsOpening } from "./run-odds-opening.js";
import { supplementCanonicalAssessments } from "./canonical-assessment-supplement.js";
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
  return { matchRows: matches.length, assessmentRows };
}

export function assertPersistedAssessmentPostcondition(
  snapshot,
  dayKey,
  { canonicalFixtureCount = 0 } = {}
) {
  const summary = persistedAssessmentSummary(snapshot);
  const canonicalCount = Number(canonicalFixtureCount) || 0;
  const requiresAssessment = canonicalCount > 0 || summary.matchRows > 0;

  if (requiresAssessment && summary.assessmentRows === 0) {
    const error = new Error(
      `persisted_model_assessments_missing:${dayKey}:matches=${summary.matchRows}:canonical=${canonicalCount}`
    );
    error.code = "persisted_model_assessments_missing";
    error.dayKey = dayKey;
    error.matchRows = summary.matchRows;
    error.assessmentRows = summary.assessmentRows;
    error.canonicalFixtureCount = canonicalCount;
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
    match => match?.aiAssessment?.markets &&
      typeof match.aiAssessment.markets === "object" &&
      Object.keys(match.aiAssessment.markets).length > 0
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

  // Model-only canonical supplement. No bookmaker odds are fabricated and no
  // already-started fixture receives a new assessment.
  const canonicalSupplement = supplementCanonicalAssessments(dayKey);

  const snap = exportOddsSnapshotDay(dayKey);
  const persisted = readExistingSnapshot(dayKey);
  const persistence = assertPersistedAssessmentPostcondition(
    persisted,
    dayKey,
    { canonicalFixtureCount: canonicalSupplement.canonicalFixtures }
  );

  return {
    ok: true,
    dayKey,
    due: true,
    reason: decision.reason,
    changed: snap.changed || fixturesChanged,
    fixturesChanged,
    count: snap.count,
    assessmentRows: persistence.assessmentRows,
    canonicalSupplement
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
