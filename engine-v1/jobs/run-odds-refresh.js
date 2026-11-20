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
import {
  readCanonicalFixtureDay,
  supplementCanonicalAssessments
} from "./canonical-assessment-supplement.js";
import { exportOddsSnapshotDay } from "./export-odds-snapshot-day.js";
import { recordOddsSnapshot } from "../storage/odds-memory-db.js";
import { reconcileOddsSnapshotCoverageDay } from "./reconcile-odds-snapshot-coverage-day.js";
import { exportFixturesSnapshotDay } from "./export-fixtures-snapshot-day.js";
import { oddsUpdateDecision, kickoffToUtcMs } from "../odds/odds-schedule.js";
import {
  resolveProductionEvidenceFixtureIdReadView
} from "../core/production-evidence-identity-overlay.js";

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
  {
    canonicalFixtureCount = 0,
    canonicalFixtureIds = [],
    requiredAssessmentFixtureIds = [],
    fixtureIdResolver = value => value
  } = {}
) {
  const summary =
    persistedAssessmentSummary(snapshot);

  const canonicalCount =
    Number(canonicalFixtureCount) || 0;

  const assessedRows =
    (Array.isArray(snapshot?.matches)
      ? snapshot.matches
      : []
    ).filter(
      match =>
        match?.aiAssessment?.markets &&
        typeof match.aiAssessment.markets === "object" &&
        Object.keys(
          match.aiAssessment.markets
        ).length > 0
    );

  const normalizeFixtureId = value => {
    const sourceId = String(value || "").trim();
    if (!sourceId) return "";

    const result = fixtureIdResolver(sourceId);
    const resolvedId = String(
      (typeof result === "string"
        ? result
        : result?.resolvedFixtureId) || ""
    ).trim();

    if (!resolvedId) {
      const error = new Error(
        `persisted_assessment_fixture_identity_resolution_failed:${dayKey}:${sourceId}`
      );
      error.code =
        "persisted_assessment_fixture_identity_resolution_failed";
      error.dayKey = dayKey;
      error.sourceFixtureId = sourceId;
      throw error;
    }

    return resolvedId;
  };

  const idOf = row =>
    normalizeFixtureId(
      row?.productionIdentityBinding?.resolvedFixtureId ||
      row?.canonicalId ||
      row?.matchId ||
      ""
    );

  const canonicalSet =
    new Set(
      (Array.isArray(canonicalFixtureIds)
        ? canonicalFixtureIds
        : []
      )
        .map(normalizeFixtureId)
        .filter(Boolean)
    );

  const requiredSet =
    new Set(
      (Array.isArray(requiredAssessmentFixtureIds)
        ? requiredAssessmentFixtureIds
        : []
      )
        .map(normalizeFixtureId)
        .filter(Boolean)
    );

  const assessedIdSet =
    new Set(
      assessedRows
        .map(idOf)
        .filter(Boolean)
    );

  const joinedRows =
    canonicalSet.size > 0
      ? assessedRows.filter(
          row =>
            canonicalSet.has(
              idOf(row)
            )
        )
      : [];

  const orphanRows =
    canonicalSet.size > 0
      ? assessedRows.filter(
          row =>
            !canonicalSet.has(
              idOf(row)
            )
        )
      : [];

  const requiresAssessment =
    requiredSet.size > 0;

  if (
    requiresAssessment &&
    summary.assessmentRows === 0
  ) {
    const error = new Error(
      `persisted_model_assessments_missing:${dayKey}:matches=${summary.matchRows}:canonical=${canonicalCount}`
    );

    error.code =
      "persisted_model_assessments_missing";

    error.dayKey = dayKey;
    error.matchRows = summary.matchRows;
    error.assessmentRows =
      summary.assessmentRows;
    error.canonicalFixtureCount =
      canonicalCount;

    throw error;
  }

  if (
    requiredSet.size > 0 &&
    canonicalSet.size === 0
  ) {
    const error = new Error(
      `required_assessment_canonical_universe_missing:${dayKey}`
    );

    error.code =
      "required_assessment_canonical_universe_missing";

    error.dayKey = dayKey;
    error.canonicalFixtureCount =
      canonicalCount;
    error.requiredAssessmentRows =
      requiredSet.size;

    throw error;
  }

  const requiredOutsideCanonical =
    [...requiredSet].filter(
      id => !canonicalSet.has(id)
    );

  if (requiredOutsideCanonical.length) {
    const error = new Error(
      `required_assessment_outside_canonical_universe:${dayKey}`
    );

    error.code =
      "required_assessment_outside_canonical_universe";

    error.dayKey = dayKey;
    error.requiredOutsideCanonical =
      requiredOutsideCanonical;

    throw error;
  }

  if (
    canonicalSet.size > 0 &&
    summary.assessmentRows > 0 &&
    joinedRows.length === 0
  ) {
    const error = new Error(
      `persisted_model_assessments_not_in_canonical_universe:${dayKey}`
    );

    error.code =
      "persisted_model_assessments_not_in_canonical_universe";

    error.dayKey = dayKey;
    error.assessmentRows =
      summary.assessmentRows;
    error.canonicalFixtureCount =
      canonicalCount;

    throw error;
  }

  const missingRequired =
    [...requiredSet].filter(
      id => !assessedIdSet.has(id)
    );

  if (missingRequired.length) {
    const error = new Error(
      `persisted_model_assessment_coverage_incomplete:${dayKey}:missing=${missingRequired.length}:required=${requiredSet.size}`
    );

    error.code =
      "persisted_model_assessment_coverage_incomplete";

    error.dayKey = dayKey;
    error.requiredAssessmentRows =
      requiredSet.size;
    error.missingRequiredAssessmentRows =
      missingRequired.length;
    error.missingRequiredAssessmentFixtureIds =
      missingRequired;

    throw error;
  }

  if (
    canonicalSet.size === 0 &&
    requiredSet.size === 0
  ) {
    return summary;
  }

  return {
    ...summary,

    canonicalJoinedAssessmentRows:
      joinedRows.length,

    canonicalOrphanAssessmentRows:
      orphanRows.length,

    requiredAssessmentRows:
      requiredSet.size,

    requiredAssessmentRowsPresent:
      requiredSet.size,

    missingRequiredAssessmentRows: 0,

    assessmentCoverageOfRequiredPct:
      requiredSet.size > 0
        ? 100
        : null
  };
}

export async function runOddsRefresh(dayKey = athensDayKey(), opts = {}) {
  const readSnapshot = opts.readSnapshot || readExistingSnapshot;
  const readCanonical = opts.readCanonical || readCanonicalFixtureDay;
  const supplement = opts.supplement || supplementCanonicalAssessments;
  const exportOdds = opts.exportOdds || exportOddsSnapshotDay;
  const exportFixtures = opts.exportFixtures || exportFixturesSnapshotDay;
  const opening = opts.opening || runOddsOpening;
  const updateDecision = opts.updateDecision || oddsUpdateDecision;
  const existing = readSnapshot(dayKey);
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
      : updateDecision({ lastScrapeAt, kickoffsUtc });

  let fixturesChanged = false;
  try {
    const fx = await exportFixtures(dayKey);
    fixturesChanged = fx.changed;
  } catch (err) {
    console.warn("[run-odds-refresh] fixtures export failed", String(err?.message || err));
  }

  if (decision.due) await opening();

  // Model-only canonical supplement. No bookmaker odds are fabricated and no
  // already-started fixture receives a new assessment.
  // Acquisition and model coverage have separate clocks. Newly acquired canonical
  // fixtures must receive eligible pre-kickoff evidence even between odds scrapes.
  const currentRunAssessments = [];
  const canonicalSupplement = supplement(dayKey, {
    // Capture only assessments genuinely emitted by this run before kickoff.
    // The normal odds-memory write remains the same, but ephemeral runners can
    // no longer silently lose valid evidence at the snapshot export boundary.
    recordFn: (fixtureId, meta, pricing) => {
      const result = recordOddsSnapshot(fixtureId, meta, pricing);
      if (meta?.aiAssessment?.markets &&
          Object.keys(meta.aiAssessment.markets).length > 0) {
        currentRunAssessments.push({ ...meta, matchId: String(fixtureId) });
      }
      return result;
    }
  });

  const snap = exportOdds(dayKey);
  if (snap?.ok === false) {
    const error = new Error(
      `odds_snapshot_export_failed:${dayKey}:${snap.reason || "unknown"}`
    );
    error.code = "odds_snapshot_export_failed";
    error.dayKey = dayKey;
    error.exportFailure = {
      reason: snap.reason || "unknown",
      ownershipIssues: snap.ownershipIssues || null
    };
    throw error;
  }
  let persisted = readSnapshot(dayKey);

  const canonicalFixtureIds =
    readCanonical(dayKey)
      .map(
        row =>
          row?.canonicalId ||
          row?.matchId ||
          null
      )
      .filter(Boolean);

  const checkPersistence = () =>
    assertPersistedAssessmentPostcondition(
      persisted,
      dayKey,
      {
        canonicalFixtureCount: canonicalSupplement.canonicalFixtures,
        canonicalFixtureIds,
        requiredAssessmentFixtureIds:
          canonicalSupplement.modelEvidenceEligibleFixtureIds,
        fixtureIdResolver: opts.fixtureIdResolver || (value =>
          resolveProductionEvidenceFixtureIdReadView(
            value,
            { allowUnmanaged: true }
          ))
      }
    );

  const reconcile = opts.reconcile || reconcileOddsSnapshotCoverageDay;
  let reconciliation = null;
  let persistence;
  try {
    persistence = checkPersistence();
  } catch (error) {
    // Attempt a single bounded recovery using only freshly emitted verified
    // pre-kickoff evidence and prior independently certified models.
    // No evidence => retain original failure; never invent a model.
    if (error?.code !== "persisted_model_assessment_coverage_incomplete" ||
        currentRunAssessments.length === 0) throw error;
    reconciliation = reconcile(dayKey, {
      currentRunAssessments,
      requiredIds: canonicalSupplement.modelEvidenceEligibleFixtureIds
    });
    if (!reconciliation?.ok || !reconciliation.changed) throw error;
    persisted = readSnapshot(dayKey);
    persistence = checkPersistence();
  }

  if (snap?.preservedExisting && !reconciliation &&
      currentRunAssessments.length > 0) {
    // A stale complete snapshot must not indefinitely mask fresh certified
    // odds/model coverage. A rejected reconciliation is a safe no-op.
    reconciliation = reconcile(dayKey, {
      currentRunAssessments,
      requiredIds: canonicalSupplement.modelEvidenceEligibleFixtureIds
    });
    if (reconciliation?.changed) {
      persisted = readSnapshot(dayKey);
      persistence = checkPersistence();
    }
  }

  return {
    ok: true,
    dayKey,
    due: decision.due,
    reason: decision.reason,
    changed: snap.changed || reconciliation?.changed === true || fixturesChanged,
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
    if (err?.code) {
      console.error("[run-odds-refresh] failure-evidence", JSON.stringify({
        code: err.code,
        dayKey: err.dayKey || dayKey,
        requiredAssessmentRows: err.requiredAssessmentRows ?? null,
        missingRequiredAssessmentRows: err.missingRequiredAssessmentRows ?? null,
        missingRequiredAssessmentFixtureIds: err.missingRequiredAssessmentFixtureIds ?? [],
        exportFailure: err.exportFailure ?? null
      }));
    }
    process.exitCode = 1;
  });
}
