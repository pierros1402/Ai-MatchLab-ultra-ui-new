/**
 * Bounded P0 evidence replay — no writes to odds, canonical, history or deploy.
 * The replay uses the timestamp from the failed 2026-11-20 daily job.
 * This is NOT live publication certification.
 */
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { readCanonicalFixtureDay, supplementCanonicalAssessments } from "./canonical-assessment-supplement.js";
import { assertPersistedAssessmentPostcondition } from "./run-odds-refresh.js";
import { resolveProductionEvidenceFixtureIdReadView } from "../core/production-evidence-identity-overlay.js";

export function replayAssessmentEvidence(dayKey, { nowMs, canonical, snapshot, supplement } = {}) {
  if (!Number.isFinite(nowMs)) throw new Error("fixed_replay_timestamp_required");
  const canonicalRows = canonical || readCanonicalFixtureDay(dayKey);
  const snap = snapshot || JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", dayKey, "odds.json"), "utf8"));
  const supplemental = supplement || supplementCanonicalAssessments(dayKey, {
    canonicalFixtures: canonicalRows,
    nowMs,
    // Explicitly suppress the only assessment persistence callback.
    recordFn: () => { }
  });
  const canonicalFixtureIds = canonicalRows.map(row => row?.canonicalId || row?.matchId).filter(Boolean);
  const required = supplemental.modelEvidenceEligibleFixtureIds || [];
  const fixtureIdResolver = id => resolveProductionEvidenceFixtureIdReadView(id, { allowUnmanaged: true });
  let outcome;
  try {
    const coverage = assertPersistedAssessmentPostcondition(snap, dayKey, {
      canonicalFixtureCount: canonicalRows.length,
      canonicalFixtureIds,
      requiredAssessmentFixtureIds: required,
      fixtureIdResolver
    });
    outcome = { code: "COVERAGE_PASS", coverage };
  } catch (error) {
    outcome = {
      code: error?.code || "UNKNOWN_REPLAY_FAILURE",
      requiredAssessmentRows: error?.requiredAssessmentRows ?? null,
      missingRequiredAssessmentRows: error?.missingRequiredAssessmentRows ?? null,
      missingRequiredAssessmentFixtureIds: error?.missingRequiredAssessmentFixtureIds || [],
      requiredOutsideCanonical: error?.requiredOutsideCanonical || [],
      sourceFixtureId: error?.sourceFixtureId || null
    };
  }
  return {
    mode: "READ_ONLY_OFFLINE_REPLAY_NOT_PRODUCTION_CERTIFICATION",
    dayKey,
    replayTimeUtc: new Date(nowMs).toISOString(),
    canonicalFixtureCount: canonicalRows.length,
    persistedSnapshotCount: snap?.matches?.length || 0,
    requiredFixtureCount: required.length,
    assessedInMemoryCount: supplemental.assessmentRowsWritten || 0,
    unassessedEligibleFixtureIds: supplemental.unassessedModelEvidenceEligibleFixtureIds || [],
    // Offline parity with 41/4 is a conditional observation, not a guarantee.
    historicRunRequiredCount: 41,
    historicRunMissingCount: 4,
    matchesHistoricRequiredCount: required.length === 41,
    matchesHistoricMissingCount: outcome.missingRequiredAssessmentRows === 4,
    outcome
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const result = replayAssessmentEvidence("2026-11-20", {
    nowMs: Date.parse("2026-11-20T10:22:00Z")
  });
  console.log("[p0-readonly-assessment-replay]", JSON.stringify(result));
}
