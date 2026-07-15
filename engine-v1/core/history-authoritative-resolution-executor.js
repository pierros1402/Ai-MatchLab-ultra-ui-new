import crypto from "node:crypto";
import { auditHistoryRows, semanticTeamKey } from "../jobs/audit-history-semantic-integrity.js";

export const HISTORY_AUTHORITATIVE_RESOLUTION_EXECUTION_SCHEMA =
  "ai-matchlab.history-authoritative-resolution-execution.v1";

export const HISTORY_AUTHORITATIVE_RESOLUTION_APPLICATION_SCHEMA =
  "ai-matchlab.history-authoritative-resolution-application.v1";

export const HISTORY_AUTHORITATIVE_RESOLUTION_APPLICATION_POLICY =
  "history-authoritative-resolution-application-policy-v1";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stableObject(value[key])])
  );
}

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function stableDigest(value) {
  return sha256Buffer(Buffer.from(JSON.stringify(stableObject(value)), "utf8"));
}

export function canonicalJsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function text(value) {
  return value == null ? "" : String(value).trim();
}

function kickoffMs(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function sameScore(row, candidate) {
  return Number(row?.scoreHome) === Number(candidate?.homeGoals)
    && Number(row?.scoreAway) === Number(candidate?.awayGoals);
}

function sameOrientation(row, candidate, leagueSlug) {
  return semanticTeamKey(leagueSlug, row?.homeTeam)
      === semanticTeamKey(leagueSlug, candidate?.homeTeam)
    && semanticTeamKey(leagueSlug, row?.awayTeam)
      === semanticTeamKey(leagueSlug, candidate?.awayTeam);
}

function selectorMatchesRow(selector, row, bucketDay) {
  if (!selector || !row) return false;
  if (text(selector.id) !== text(row.id)) return false;
  if (text(selector.homeTeam) !== text(row.homeTeam)) return false;
  if (text(selector.awayTeam) !== text(row.awayTeam)) return false;
  if (Number(selector.scoreHome) !== Number(row.scoreHome)) return false;
  if (Number(selector.scoreAway) !== Number(row.scoreAway)) return false;
  if (kickoffMs(selector.kickoff) !== kickoffMs(row.kickoff)) return false;
  if (selector.declaredDay) {
    if (text(selector.declaredDay) !== text(row.dayKey)) return false;
    if (text(selector.declaredDay) !== text(bucketDay)) return false;
  }
  return true;
}

function flattenHistory(document) {
  const rows = [];
  const days = Array.isArray(document?.days) ? document.days : [];
  days.forEach((day, dayIndex) => {
    const dayRows = Array.isArray(day?.rows) ? day.rows : [];
    dayRows.forEach((row, rowIndex) => {
      rows.push({
        key: `${dayIndex}|${rowIndex}`,
        dayIndex,
        rowIndex,
        bucketDay: day?.dayKey || null,
        row
      });
    });
  });
  return rows;
}

function locateSelector(document, selector, label) {
  const matches = flattenHistory(document).filter(item =>
    selectorMatchesRow(selector, item.row, item.bucketDay)
  );
  if (matches.length !== 1) {
    throw new Error(
      `${label}:expected_exactly_one_history_row:found=${matches.length}:id=${selector?.id || "missing"}`
    );
  }
  return matches[0];
}

function planBlockMaps(plan) {
  const score = new Map((plan?.blocked?.scoreConflicts || []).map(row => [row.blockId, row]));
  const orientation = new Map(
    (plan?.blocked?.orientationConflicts || []).map(row => [row.blockId, row])
  );
  return { score, orientation };
}

function validateResolution(resolution) {
  if (!resolution?.resolutionId) throw new Error("resolution_missing_id");
  if (!['score', 'orientation'].includes(resolution.resolutionType)) {
    throw new Error(`unsupported_resolution_type:${resolution.resolutionType}`);
  }
  if (resolution.proposalStatus !== "authoritatively_supported") {
    throw new Error(`resolution_not_authoritatively_supported:${resolution.resolutionId}`);
  }
  if (resolution.automaticApplyAllowed !== false) {
    throw new Error(`resolution_automatic_apply_contract_invalid:${resolution.resolutionId}`);
  }
  if (resolution.explicitResolutionManifestRequiredForWrite !== true) {
    throw new Error(`resolution_manifest_write_contract_missing:${resolution.resolutionId}`);
  }
  if (Number(resolution.contradictoryEvidenceCount || 0) !== 0) {
    throw new Error(`resolution_has_contradictory_evidence:${resolution.resolutionId}`);
  }
  if (!resolution.candidate || !Array.isArray(resolution.blockIds) || !resolution.blockIds.length) {
    throw new Error(`resolution_incomplete:${resolution.resolutionId}`);
  }
}

function validateResolutionParity(bundleResolution, regeneratedResolution) {
  const left = {
    resolutionId: bundleResolution?.resolutionId,
    resolutionType: bundleResolution?.resolutionType,
    blockIds: bundleResolution?.blockIds,
    targetFactIds: bundleResolution?.targetFactIds,
    proposalStatus: bundleResolution?.proposalStatus,
    candidate: bundleResolution?.candidate,
    confidenceClass: bundleResolution?.confidenceClass,
    automaticApplyAllowed: bundleResolution?.automaticApplyAllowed,
    explicitResolutionManifestRequiredForWrite:
      bundleResolution?.explicitResolutionManifestRequiredForWrite,
    contradictoryEvidenceCount: bundleResolution?.contradictoryEvidenceCount,
    evidenceDigest: bundleResolution?.evidenceDigest
  };
  const right = {
    resolutionId: regeneratedResolution?.resolutionId,
    resolutionType: regeneratedResolution?.resolutionType,
    blockIds: regeneratedResolution?.blockIds,
    targetFactIds: regeneratedResolution?.targetFactIds,
    proposalStatus: regeneratedResolution?.proposalStatus,
    candidate: regeneratedResolution?.candidate,
    confidenceClass: regeneratedResolution?.confidenceClass,
    automaticApplyAllowed: regeneratedResolution?.automaticApplyAllowed,
    explicitResolutionManifestRequiredForWrite:
      regeneratedResolution?.explicitResolutionManifestRequiredForWrite,
    contradictoryEvidenceCount: regeneratedResolution?.contradictoryEvidenceCount,
    evidenceDigest: regeneratedResolution?.evidenceDigest
  };
  if (stableDigest(left) !== stableDigest(right)) {
    throw new Error(`resolution_bundle_regeneration_mismatch:${bundleResolution?.resolutionId}`);
  }
}

function scoreBlockSelectors(block) {
  return (block?.alternatives || []).flatMap(alt => alt?.rows || []);
}

function findRetainedSelector(resolution, block, selectors) {
  const candidate = resolution.candidate;
  const leagueSlug = text(block?.pair).split("|")[0] || "unknown";
  const matches = selectors.filter(selector =>
    sameScore(
      { scoreHome: selector.scoreHome, scoreAway: selector.scoreAway },
      candidate
    ) && sameOrientation(selector, candidate, leagueSlug)
  );
  if (matches.length !== 1) {
    throw new Error(
      `${resolution.resolutionId}:expected_one_retained_selector:found=${matches.length}`
    );
  }
  return matches[0];
}

function applicationMetadata({
  resolution,
  manifestSha256,
  resolutionBundleSha256,
  suppressedClaims
}) {
  return {
    schema: HISTORY_AUTHORITATIVE_RESOLUTION_APPLICATION_SCHEMA,
    policyVersion: HISTORY_AUTHORITATIVE_RESOLUTION_APPLICATION_POLICY,
    resolutionId: resolution.resolutionId,
    resolutionType: resolution.resolutionType,
    blockIds: [...resolution.blockIds],
    targetFactIds: [...(resolution.targetFactIds || [])],
    confidenceClass: resolution.confidenceClass,
    evidenceDigest: resolution.evidenceDigest,
    authoritativeManifestSha256: manifestSha256,
    resolutionBundleSha256,
    candidateDigest: stableDigest(resolution.candidate),
    independentSupportingFamilies: [
      ...(resolution.independentSupportingFamilies || [])
    ],
    evidenceItemCount: Number(resolution.evidenceItemCount || 0),
    authoritativeEvidenceCount: Number(resolution.authoritativeEvidenceCount || 0),
    suppressedClaims: suppressedClaims.map(item => ({
      sourceContainer: "history/2025-2026.json",
      sourceDayKey: item.bucketDay,
      row: clone(item.row)
    })),
    automaticApplyAllowed: false
  };
}

function ensureNoExistingApplication(row, resolutionId) {
  if (row?.authoritativeResolution) {
    throw new Error(`history_row_already_has_authoritative_resolution:${resolutionId}`);
  }
}

function prepareAction({
  resolution,
  planMaps,
  historyDocument,
  manifestSha256,
  resolutionBundleSha256
}) {
  validateResolution(resolution);
  if (resolution.blockIds.length !== 1) {
    throw new Error(`resolution_requires_exactly_one_block:${resolution.resolutionId}`);
  }
  const blockId = resolution.blockIds[0];
  const block = resolution.resolutionType === "score"
    ? planMaps.score.get(blockId)
    : planMaps.orientation.get(blockId);
  if (!block) throw new Error(`resolution_block_not_found_in_plan:${blockId}`);

  const selectors = resolution.resolutionType === "score"
    ? scoreBlockSelectors(block)
    : [...(block.rows || [])];
  if (selectors.length < 2) {
    throw new Error(`resolution_block_has_insufficient_rows:${blockId}`);
  }

  const retainedSelector = findRetainedSelector(resolution, block, selectors);
  const retained = locateSelector(
    historyDocument,
    retainedSelector,
    `${resolution.resolutionId}/retain`
  );
  ensureNoExistingApplication(retained.row, resolution.resolutionId);

  const removed = selectors
    .filter(selector => selector !== retainedSelector)
    .map(selector => locateSelector(
      historyDocument,
      selector,
      `${resolution.resolutionId}/suppress`
    ));

  if (removed.length !== selectors.length - 1) {
    throw new Error(`resolution_suppression_count_mismatch:${resolution.resolutionId}`);
  }

  const kickoffCandidate = resolution.candidate?.kickoffUtc;
  if (kickoffCandidate && kickoffMs(kickoffCandidate) !== kickoffMs(retained.row.kickoff)) {
    throw new Error(`resolution_kickoff_mismatch:${resolution.resolutionId}`);
  }
  if (text(resolution.candidate?.operationalDay) !== text(retained.bucketDay)) {
    throw new Error(`resolution_operational_day_mismatch:${resolution.resolutionId}`);
  }

  return {
    resolution,
    retained,
    removed,
    annotation: applicationMetadata({
      resolution,
      manifestSha256,
      resolutionBundleSha256,
      suppressedClaims: removed
    })
  };
}

function applyActions(historyDocument, actions) {
  const output = clone(historyDocument);
  const removeKeys = new Set(actions.flatMap(action => action.removed.map(item => item.key)));
  const annotationByKey = new Map(actions.map(action => [action.retained.key, action.annotation]));
  const changedDays = new Set();
  let rowsBefore = 0;
  let rowsAfter = 0;
  let rowsRemoved = 0;
  let rowsAnnotated = 0;

  const sourceDays = Array.isArray(historyDocument?.days) ? historyDocument.days : [];
  output.days = sourceDays.map((sourceDay, dayIndex) => {
    const rows = [];
    const sourceRows = Array.isArray(sourceDay?.rows) ? sourceDay.rows : [];
    rowsBefore += sourceRows.length;
    sourceRows.forEach((sourceRow, rowIndex) => {
      const key = `${dayIndex}|${rowIndex}`;
      if (removeKeys.has(key)) {
        rowsRemoved += 1;
        changedDays.add(sourceDay.dayKey);
        return;
      }
      const row = clone(sourceRow);
      if (annotationByKey.has(key)) {
        row.authoritativeResolution = clone(annotationByKey.get(key));
        rowsAnnotated += 1;
        changedDays.add(sourceDay.dayKey);
      }
      rows.push(row);
      rowsAfter += 1;
    });
    return {
      ...clone(sourceDay),
      matchCount: rows.length,
      rows
    };
  });

  return {
    output,
    stats: {
      rowsBefore,
      rowsAfter,
      rowsRemoved,
      rowsAnnotated,
      changedDays: [...changedDays].sort()
    }
  };
}

function projectedAudit(document) {
  const rows = (document?.days || []).flatMap(day =>
    (day?.rows || []).map(row => ({
      ...row,
      __bucketDay: day?.dayKey || null,
      __container: "history/2025-2026.json"
    }))
  );
  return auditHistoryRows(rows, { maxExamples: 100 });
}

function assertProjectedAudit(audit, expectedRows) {
  const failures = [];
  if (audit.rowCount !== expectedRows) failures.push(`rows=${audit.rowCount}`);
  if (audit.invalidRowCount !== 0) failures.push(`invalidRows=${audit.invalidRowCount}`);
  if (audit.duplicateIdCount !== 0) failures.push(`duplicateIds=${audit.duplicateIdCount}`);
  if (audit.operationalDayMismatchCount !== 0) {
    failures.push(`operationalDayMismatches=${audit.operationalDayMismatchCount}`);
  }
  if (audit.semantic.duplicateGroups !== 0) {
    failures.push(`semanticDuplicateGroups=${audit.semantic.duplicateGroups}`);
  }
  if (audit.semantic.scoreConflictGroups !== 0) {
    failures.push(`scoreConflictGroups=${audit.semantic.scoreConflictGroups}`);
  }
  if (audit.semantic.flippedOrientationGroups !== 0) {
    failures.push(`flippedOrientationGroups=${audit.semantic.flippedOrientationGroups}`);
  }
  if (failures.length) {
    throw new Error(`projected_authoritative_resolution_audit_failed:${failures.join(";")}`);
  }
}

export function buildAuthoritativeHistoryResolutionExecution({
  historyPayload,
  repairPlan,
  resolutionBundle,
  regeneratedResolutionReport,
  manifestSha256,
  resolutionBundleSha256
} = {}) {
  if (!historyPayload || !Array.isArray(historyPayload.days)) {
    throw new Error("current_history_document_required");
  }
  if (repairPlan?.schema !== "ai-matchlab.history-semantic-repair-plan.v1") {
    throw new Error(`unexpected_repair_plan_schema:${repairPlan?.schema}`);
  }
  if (resolutionBundle?.schema !== "ai-matchlab.history-authoritative-resolution-bundle.v1") {
    throw new Error(`unexpected_resolution_bundle_schema:${resolutionBundle?.schema}`);
  }
  if (resolutionBundle?.ok !== true) throw new Error("resolution_bundle_not_ok");
  if (!manifestSha256 || !resolutionBundleSha256) {
    throw new Error("manifest_and_resolution_bundle_hashes_required");
  }

  const bundleRows = resolutionBundle?.resolution?.resolutions || [];
  const regeneratedRows = regeneratedResolutionReport?.resolutions || [];
  if (bundleRows.length !== regeneratedRows.length || bundleRows.length !== 2) {
    throw new Error(
      `expected_exactly_two_authoritative_resolutions:bundle=${bundleRows.length}:regenerated=${regeneratedRows.length}`
    );
  }
  const regeneratedById = new Map(regeneratedRows.map(row => [row.resolutionId, row]));
  for (const row of bundleRows) {
    const regenerated = regeneratedById.get(row.resolutionId);
    if (!regenerated) throw new Error(`resolution_not_regenerated:${row.resolutionId}`);
    validateResolutionParity(row, regenerated);
  }

  const planMaps = planBlockMaps(repairPlan);
  const actions = bundleRows.map(resolution => prepareAction({
    resolution,
    planMaps,
    historyDocument: historyPayload,
    manifestSha256,
    resolutionBundleSha256
  }));

  const touched = new Set();
  for (const action of actions) {
    for (const item of [action.retained, ...action.removed]) {
      if (touched.has(item.key)) {
        throw new Error(`overlapping_authoritative_resolution_actions:${item.key}`);
      }
      touched.add(item.key);
    }
  }

  const transformed = applyActions(historyPayload, actions);
  const audit = projectedAudit(transformed.output);
  assertProjectedAudit(audit, transformed.stats.rowsAfter);
  const outputBuffer = canonicalJsonBuffer(transformed.output);

  return {
    outputHistory: transformed.output,
    outputBuffer,
    outputSha256: sha256Buffer(outputBuffer),
    summary: {
      resolutionActionsValidated: actions.length,
      scoreResolutionsApplied: actions.filter(
        action => action.resolution.resolutionType === "score"
      ).length,
      orientationResolutionsApplied: actions.filter(
        action => action.resolution.resolutionType === "orientation"
      ).length,
      rowsBefore: transformed.stats.rowsBefore,
      rowsAfter: transformed.stats.rowsAfter,
      rowsRemoved: transformed.stats.rowsRemoved,
      rowsAnnotated: transformed.stats.rowsAnnotated,
      suppressedClaimsPreserved: actions.reduce(
        (sum, action) => sum + action.removed.length,
        0
      ),
      changedDays: transformed.stats.changedDays,
      h2hDeferredBlocks: Number(
        resolutionBundle?.summary?.h2hDeferredBlocks
          ?? resolutionBundle?.resolution?.summary?.h2hDeferredBlocks
          ?? 0
      )
    },
    actions: actions.map(action => ({
      resolutionId: action.resolution.resolutionId,
      resolutionType: action.resolution.resolutionType,
      blockIds: [...action.resolution.blockIds],
      retained: {
        id: action.retained.row.id,
        dayKey: action.retained.bucketDay,
        homeTeam: action.retained.row.homeTeam,
        awayTeam: action.retained.row.awayTeam,
        scoreHome: action.retained.row.scoreHome,
        scoreAway: action.retained.row.scoreAway,
        source: action.retained.row.source || null
      },
      suppressed: action.removed.map(item => ({
        id: item.row.id,
        dayKey: item.bucketDay,
        homeTeam: item.row.homeTeam,
        awayTeam: item.row.awayTeam,
        scoreHome: item.row.scoreHome,
        scoreAway: item.row.scoreAway,
        source: item.row.source || null
      })),
      evidenceDigest: action.resolution.evidenceDigest,
      confidenceClass: action.resolution.confidenceClass,
      status: "validated_for_hash_verified_application"
    })),
    projectedAudit: {
      rows: audit.rowCount,
      invalidRows: audit.invalidRowCount,
      duplicateIds: audit.duplicateIdCount,
      operationalDayMismatches: audit.operationalDayMismatchCount,
      semanticDuplicateGroups: audit.semantic.duplicateGroups,
      scoreConflictGroups: audit.semantic.scoreConflictGroups,
      flippedOrientationGroups: audit.semantic.flippedOrientationGroups
    }
  };
}
