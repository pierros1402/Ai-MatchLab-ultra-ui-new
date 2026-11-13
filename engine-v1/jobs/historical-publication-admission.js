/**
 * Historical publication admission V1.
 *
 * Pure, read-only assessment of local stage evidence.
 *
 * IMPORTANT:
 * - No filesystem access or writes.
 * - No production authorization.
 * - No ability to publish or promote a release.
 * - Caller-provided observations are not trusted authority.
 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;
const HASH_RE = /^[a-f0-9]{64}$/u;

const requiredReleaseControls = Object.freeze([
  "independent_publication_authorization",
  "production_atomicity_and_durability_qualification",
  "production_lock_ownership_and_recovery_qualification",
  "production_writer_integration_validation",
  "workflow_and_remote_sync_release_validation"
]);

export function assessHistoricalPublicationAdmission({
  day,
  latestDay,
  observation,
  apply = false
} = {}) {
  const blockers = [];

  if (!DAY_RE.test(String(day || "")) ||
      !DAY_RE.test(String(latestDay || "")) ||
      day >= latestDay) {
    blockers.push("closed_historical_day_not_established");
  }

  if (apply !== false) {
    blockers.push("apply_not_permitted_by_admission_v1");
  }

  if (observation?.ok !== true ||
      observation?.observationOnly !== true ||
      observation?.publicationAuthorized !== false ||
      observation?.originalUnchanged !== true ||
      observation?.latestUnchanged !== true ||
      observation?.changed !== false ||
      observation?.day !== day) {
    blockers.push("observation_evidence_invalid");
  }

  const count = observation?.fixtureCount;
  const details = observation?.detailCount;
  const carried = observation?.carriedCount;
  const upgraded = observation?.upgradeCount;
  const modified = observation?.modifiedDetailCount;

  if (!Number.isSafeInteger(count) || count < 1 ||
      !Number.isSafeInteger(details) || details !== count ||
      !Number.isSafeInteger(carried) || carried < 0 ||
      !Number.isSafeInteger(upgraded) || upgraded < 0 ||
      !Number.isSafeInteger(modified) || modified < 0 ||
      carried > count || upgraded > count ||
      modified > upgraded || carried + upgraded > count) {
    blockers.push("observation_counts_invalid");
  }

  if (!HASH_RE.test(String(observation?.manifestHash || ""))) {
    blockers.push("validated_manifest_hash_missing");
  }

  return Object.freeze({
    schema: "ai-matchlab.historical-publication-admission.v1",
    day: String(day || ""),
    latestDay: String(latestDay || ""),
    observationEvidenceAcceptable: blockers.length === 0,
    localReadinessOnly: true,
    publicationAuthorized: false,
    productionPromotionAllowed: false,
    workflowMutationAllowed: false,
    blockers: Object.freeze([...blockers]),
    pendingReleaseControls: requiredReleaseControls
  });
}