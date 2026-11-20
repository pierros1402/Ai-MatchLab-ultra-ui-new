/**
 * CI-ONLY ephemeral sandbox for the historical 2026-11-20 odds export.
 * It can write derived odds-memory and snapshot artifacts to the disposable
 * checkout of a GitHub Actions runner, NEVER to production or canonical truth.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { resolveDataPath } from "../storage/data-root.js";
import { readCanonicalFixtureDay, supplementCanonicalAssessments } from "./canonical-assessment-supplement.js";
import { exportOddsSnapshotDay } from "./export-odds-snapshot-day.js";
import { assertPersistedAssessmentPostcondition } from "./run-odds-refresh.js";
import { resolveProductionEvidenceFixtureIdReadView } from "../core/production-evidence-identity-overlay.js";

if (process.env.GITHUB_ACTIONS !== "true" || process.env.AIML_P0_EPHEMERAL_REPLAY !== "yes") {
  throw new Error("CI_ephemeral_runner_explicit_opt_in_required");
}
const dayKey = "2026-11-20";
const fixtureRows = readCanonicalFixtureDay(dayKey);
const originalBytes = fs.readFileSync(resolveDataPath("deploy-snapshots", dayKey, "odds.json"));
const originalSha256 = crypto.createHash("sha256").update(originalBytes).digest("hex");
const supplement = supplementCanonicalAssessments(dayKey, {
  canonicalFixtures: fixtureRows,
  nowMs: Date.parse("2026-11-20T10:22:00Z")
});
const exportResult = exportOddsSnapshotDay(dayKey);
const persisted = JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", dayKey, "odds.json"), "utf8"));
let outcome;
try {
  const coverage = assertPersistedAssessmentPostcondition(persisted, dayKey, {
    canonicalFixtureCount: fixtureRows.length,
    canonicalFixtureIds: fixtureRows.map(row => row?.canonicalId || row?.matchId).filter(Boolean),
    requiredAssessmentFixtureIds: supplement.modelEvidenceEligibleFixtureIds,
    fixtureIdResolver: id => resolveProductionEvidenceFixtureIdReadView(id, { allowUnmanaged: true })
  });
  outcome = { code: "COVERAGE_PASS", missing: coverage.missingRequiredAssessmentRows };
} catch (error) {
  outcome = {
    code: error?.code || "UNKNOWN",
    missing: error?.missingRequiredAssessmentRows ?? null,
    missingIds: error?.missingRequiredAssessmentFixtureIds || []
  };
}
const exportedBytes = fs.readFileSync(resolveDataPath("deploy-snapshots", dayKey, "odds.json"));
console.log("[p0-ephemeral-export-replay]", JSON.stringify({
  mode: "CI_DISPOSABLE_CHECKOUT_DERIVED_WRITE_NO_PUBLICATION",
  dayKey,
  originalSha256,
  resultingSha256: crypto.createHash("sha256").update(exportedBytes).digest("hex"),
  canonicalCount: fixtureRows.length,
  generatedAssessmentCount: supplement.assessmentRowsWritten,
  eligibleCount: supplement.modelEvidenceEligibleFixtureIds.length,
  exportResult,
  persistedCount: persisted.matches?.length || 0,
  outcome
}));
