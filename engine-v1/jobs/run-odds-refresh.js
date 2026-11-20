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
    error.requiredAssessmentRows = requiredSet.size;
    error.missingRequiredAssessmentRows = requiredSet.size;
    error.missingRequiredAssessmentFixtureIds = [...requiredSet];

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

  // Fixture export is a prerequisite for canonical/model parity. A failed
  // export must never be reduced to a warning and followed by an odds write.
  // This is a derived-output gate only: no canonical truth is modified here.
  let fixturesChanged = false;
  try {
    const fx = await exportFixtures(dayKey);
    if (!fx || fx.ok === false) {
      throw new Error(`fixtures_snapshot_export_not_ready:${dayKey}`);
    }
    fixturesChanged = fx.changed === true;
  } catch (cause) {
    const error = new Error(`fixtures_snapshot_export_failed:${dayKey}`, { cause });
    error.code = "fixtures_snapshot_export_failed";
    error.dayKey = dayKey;
    console.error("[run-odds-refresh] fixtures export failure", JSON.stringify({
      dayKey, code: error.code
    }));
    throw error;
  }

  if (decision.due) await opening();

  // Model-only canonical supplement. No bookmaker odds are fabricated and no
  // already-started fixture receives a new assessment.
  // Acquisition and model coverage have separate clocks. Newly acquired canonical
  // fixtures must receive eligible pre-kickoff evidence even between odds scrapes.
  const canonicalSupplement = supplement(dayKey);

  const snap = exportOdds(dayKey);
  // Export can return a publication hold without throwing. Do not mistake a
  // non-written, rejected artifact for a successful model-input refresh.
  if (snap?.ok === false) {
    const error = new Error(
      `odds_snapshot_publication_hold:${dayKey}:${snap.reason || "unknown"}`
    );
    error.code = "odds_snapshot_publication_hold";
    error.dayKey = dayKey;
    error.exportReason = snap.reason || null;
    error.ownershipIssues = snap.ownershipIssues || null;
    console.error("[run-odds-refresh] odds publication hold", JSON.stringify({
      dayKey,
      reason: error.exportReason,
      ownershipIssues: error.ownershipIssues
    }));
    throw error;
  }
  const persisted = readSnapshot(dayKey);

  const canonicalFixtureIds =
    readCanonical(dayKey)
      .map(
        row =>
          row?.canonicalId ||
          row?.matchId ||
          null
      )
      .filter(Boolean);

  let persistence;
  try {
    persistence = assertPersistedAssessmentPostcondition(
      persisted,
      dayKey,
      {
        canonicalFixtureCount: canonicalSupplement.canonicalFixtures,
        canonicalFixtureIds,
        requiredAssessmentFixtureIds:
          canonicalSupplement.modelEvidenceEligibleFixtureIds,
        fixtureIdResolver: opts.fixtureIdResolver || (value =>
          resolveProductionEvidenceFixtureIdReadView(
            value, { allowUnmanaged: true }
          ))
      }
    );
  } catch (error) {
    // Log exact missing canonical identities. A count-only failure hides the
    // source rows that require recovery and encourages unsafe guesswork.
    console.error("[run-odds-refresh] assessment persistence failure", JSON.stringify({
      dayKey,
      code: error?.code || null,
      requiredAssessmentRows: error?.requiredAssessmentRows ?? null,
      missingRequiredAssessmentFixtureIds: error?.missingRequiredAssessmentFixtureIds || [],
      exportReason: snap?.reason || null,
      exportPreservedExisting: snap?.preservedExisting === true,
      unassessedEligibleIds: canonicalSupplement.unassessedModelEvidenceEligibleFixtureIds || []
    }));
    throw error;
  }

  return {
    ok: true,
    dayKey,
    due: decision.due,
    reason: decision.reason,
    changed: snap.changed || fixturesChanged,
    fixturesChanged,
    count: snap.count,
    assessmentRows: persistence.assessmentRows,
    canonicalSupplement
  };
}

// CLI diagnostics are an allowlist: never serialize an arbitrary Error object.
export function fatalAssessmentDiagnostic(error) {
  const ids = error?.missingRequiredAssessmentFixtureIds;
  const hasCoverageEvidence = error?.code ===
    "persisted_model_assessment_coverage_incomplete" ||
    error?.code === "persisted_model_assessments_missing";
  if (!hasCoverageEvidence) return null;
  return {
    code: error.code,
    dayKey: error.dayKey || null,
    requiredAssessmentRows: Number.isInteger(error.requiredAssessmentRows)
      ? error.requiredAssessmentRows : null,
    missingRequiredAssessmentRows: Number.isInteger(error.missingRequiredAssessmentRows)
      ? error.missingRequiredAssessmentRows : null,
    missingRequiredAssessmentFixtureIds: Array.isArray(ids)
      ? ids.filter(id => typeof id === "string") : []
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
    const diagnostic = fatalAssessmentDiagnostic(err);
    if (diagnostic) console.error("[run-odds-refresh] fatal assessment diagnostic", JSON.stringify(diagnostic));
    process.exitCode = 1;
  });
}
