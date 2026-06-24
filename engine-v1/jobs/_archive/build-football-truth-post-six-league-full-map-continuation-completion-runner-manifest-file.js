import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-continuation-completion-action-pack-quality-gate-2026-06-15.json"
);

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-action-pack-2026-06-15",
  "post-six-league-full-map-continuation-completion-action-pack-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-runner-manifest-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-completion-runner-manifest-2026-06-15.json"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required input file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertZero(value, name) {
  if (value !== undefined && value !== null && value !== 0) {
    throw new Error(`Expected ${name}=0, got ${value}`);
  }
}

function assertFalse(value, name) {
  if (value !== undefined && value !== null && value !== false) {
    throw new Error(`Expected ${name}=false, got ${value}`);
  }
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.continuationCompletionActionPackQualityGateRowCount !== 5) {
    throw new Error(`Expected continuationCompletionActionPackQualityGateRowCount=5, got ${s.continuationCompletionActionPackQualityGateRowCount}`);
  }

  if (s.continuationCompletionActionPackQualityGatePassedCount !== 5) {
    throw new Error(`Expected continuationCompletionActionPackQualityGatePassedCount=5, got ${s.continuationCompletionActionPackQualityGatePassedCount}`);
  }

  if (s.continuationCompletionActionPackQualityGateBlockedCount !== 0) {
    throw new Error(`Expected continuationCompletionActionPackQualityGateBlockedCount=0, got ${s.continuationCompletionActionPackQualityGateBlockedCount}`);
  }

  if (s.mainLaneContinuationCompletionActionPackQualityGatedCount !== 4) {
    throw new Error(`Expected mainLaneContinuationCompletionActionPackQualityGatedCount=4, got ${s.mainLaneContinuationCompletionActionPackQualityGatedCount}`);
  }

  if (s.repairBacklogContinuationCompletionActionPackQualityGatedCount !== 1) {
    throw new Error(`Expected repairBacklogContinuationCompletionActionPackQualityGatedCount=1, got ${s.repairBacklogContinuationCompletionActionPackQualityGatedCount}`);
  }

  if (s.sportomediaRepairContinuationCompletionActionPackQualityGatedCount !== 1) {
    throw new Error(`Expected sportomediaRepairContinuationCompletionActionPackQualityGatedCount=1, got ${s.sportomediaRepairContinuationCompletionActionPackQualityGatedCount}`);
  }

  if (s.continuationExecutionVerifiedCount !== 5) {
    throw new Error(`Expected continuationExecutionVerifiedCount=5, got ${s.continuationExecutionVerifiedCount}`);
  }

  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) {
    throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionRunnerManifestCount=1");
  }

  [
    "qualityGateIsExecutionPermissionNowCount",
    "qualityGateIsFetchPermissionNowCount",
    "qualityGateIsSearchPermissionNowCount",
    "qualityGateIsBroadSearchPermissionNowCount",
    "qualityGateIsClassifierPermissionNowCount",
    "qualityGateIsCanonicalWritePermissionNowCount",
    "qualityGateIsProductionWritePermissionNowCount",
    "qualityGateIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `qualityGate.summary.${key}`));

  assertFalse(input.productionWrite, "qualityGate.productionWrite");
  assertFalse(input.sourceFetch?.executed, "qualityGate.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "qualityGate.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "qualityGate.broadSearchUsed");
  assertFalse(input.classifierExecuted, "qualityGate.classifierExecuted");
}

function validateActionPack(input) {
  const s = input.summary || {};

  if (s.continuationCompletionActionPackRowCount !== 5) {
    throw new Error(`Expected continuationCompletionActionPackRowCount=5, got ${s.continuationCompletionActionPackRowCount}`);
  }

  if (s.readyContinuationCompletionActionPackRowCount !== 5) {
    throw new Error(`Expected readyContinuationCompletionActionPackRowCount=5, got ${s.readyContinuationCompletionActionPackRowCount}`);
  }

  if (s.blockedContinuationCompletionActionPackRowCount !== 0) {
    throw new Error(`Expected blockedContinuationCompletionActionPackRowCount=0, got ${s.blockedContinuationCompletionActionPackRowCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionActionPackQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionActionPackQualityGateCount=1");
  }

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `actionPack.summary.${key}`));

  assertFalse(input.productionWrite, "actionPack.productionWrite");
  assertFalse(input.sourceFetch?.executed, "actionPack.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "actionPack.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "actionPack.broadSearchUsed");
  assertFalse(input.classifierExecuted, "actionPack.classifierExecuted");
}

function validateQualityGateRow(row) {
  const failures = [];

  if (!row.continuationCompletionActionPackQualityGateRowId) failures.push("missing_completion_quality_gate_row_id");
  if (!row.continuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!row.continuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!row.continuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!row.continuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.completionRouteFamily) failures.push("missing_completion_route_family");
  if (!row.completionActionPackLane) failures.push("missing_completion_action_pack_lane");

  if (row.qualityGateStatus !== "passed_ready_for_post_six_league_completion_runner_manifest") {
    failures.push(`unexpected_quality_gate_status:${row.qualityGateStatus}`);
  }

  if (row.mayBuildCompletionRunnerManifestForRow !== true) {
    failures.push("may_build_completion_runner_manifest_not_true");
  }

  [
    "qualityGateIsExecutionPermissionNow",
    "qualityGateIsFetchPermissionNow",
    "qualityGateIsSearchPermissionNow",
    "qualityGateIsBroadSearchPermissionNow",
    "qualityGateIsClassifierPermissionNow",
    "qualityGateIsCanonicalWritePermissionNow",
    "qualityGateIsProductionWritePermissionNow",
    "qualityGateIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`quality_gate_row_guardrail_not_false:${key}`);
  });

  return failures;
}

const qualityGate = readJson(qualityGatePath);
const actionPack = readJson(actionPackPath);

validateQualityGate(qualityGate);
validateActionPack(actionPack);

const qualityGateRows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];
const actionPackRows = Array.isArray(actionPack.completionActionPackRows) ? actionPack.completionActionPackRows : [];

if (qualityGateRows.length !== 5) {
  throw new Error(`Expected 5 quality gate rows, got ${qualityGateRows.length}`);
}

const actionPackById = new Map(
  actionPackRows.map((row) => [row.continuationCompletionActionPackRowId, row])
);

const runnerTargets = qualityGateRows.map((row, index) => {
  const failures = validateQualityGateRow(row);
  const actionPackRow = actionPackById.get(row.continuationCompletionActionPackRowId);

  if (!actionPackRow) failures.push("missing_matching_completion_action_pack_row");

  const isMainLane = row.completionRouteFamily === "whole_map_main_lane_completion";

  return {
    continuationCompletionRunnerTargetId: `post_six_league_completion_runner_target_${String(index + 1).padStart(2, "0")}`,
    continuationCompletionActionPackQualityGateRowId: row.continuationCompletionActionPackQualityGateRowId,
    continuationCompletionActionPackRowId: row.continuationCompletionActionPackRowId,
    continuationCompletionRoutingRowId: row.continuationCompletionRoutingRowId,
    continuationExecutionVerificationRowId: row.continuationExecutionVerificationRowId,
    continuationExecutionRowId: row.continuationExecutionRowId,
    continuationExecutionApprovalRowId: row.continuationExecutionApprovalRowId,
    continuationRunnerTargetId: row.continuationRunnerTargetId,
    sourceContinuationRoutingRowId: row.sourceContinuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    completionRouteFamily: row.completionRouteFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    continuationRunnerGroup: row.continuationRunnerGroup,
    completionActionPackLane: row.completionActionPackLane,
    completionRunnerGroup: isMainLane
      ? "whole_map_main_lane_completion_runner_group"
      : "repair_backlog_completion_runner_group",
    runnerTargetStatus:
      failures.length === 0
        ? "ready_for_completion_execution_approval_gate"
        : "blocked_from_completion_execution_approval_gate",
    failures,
    requiresExecutionApprovalGate: true,
    requiresExplicitAllowExecuteFlag: true,

    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const readyTargets = runnerTargets.filter(
  (row) => row.runnerTargetStatus === "ready_for_completion_execution_approval_gate"
);

const blockedTargets = runnerTargets.filter(
  (row) => row.runnerTargetStatus !== "ready_for_completion_execution_approval_gate"
);

const summary = {
  postSixLeagueFullMapContinuationCompletionRunnerManifestReadCount: 2,
  sourceContinuationCompletionActionPackQualityGateRowCount: qualityGateRows.length,
  sourceContinuationCompletionActionPackRowCount: actionPackRows.length,

  continuationCompletionRunnerTargetCount: runnerTargets.length,
  readyContinuationCompletionRunnerTargetCount: readyTargets.length,
  blockedContinuationCompletionRunnerTargetCount: blockedTargets.length,

  mainLaneContinuationCompletionRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.completionRouteFamily === "whole_map_main_lane_completion"
  ),
  repairBacklogContinuationCompletionRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.completionRouteFamily === "repair_backlog_completion"
  ),
  sportomediaRepairContinuationCompletionRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.providerFamily === "sportomedia" && row.completionRouteFamily === "repair_backlog_completion"
  ),

  mayBuildPostSixLeagueFullMapContinuationCompletionExecutionApprovalGateCount:
    blockedTargets.length === 0 ? 1 : 0,

  runnerManifestIsExecutionPermissionNowCount: 0,
  runnerManifestIsFetchPermissionNowCount: 0,
  runnerManifestIsSearchPermissionNowCount: 0,
  runnerManifestIsBroadSearchPermissionNowCount: 0,
  runnerManifestIsClassifierPermissionNowCount: 0,
  runnerManifestIsCanonicalWritePermissionNowCount: 0,
  runnerManifestIsProductionWritePermissionNowCount: 0,
  runnerManifestIsTruthAssertionPermissionNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "build-football-truth-post-six-league-full-map-continuation-completion-runner-manifest-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_completion_runner_manifest",
  dryRun: true,
  inputs: {
    postSixLeagueCompletionActionPackQualityGate: qualityGatePath,
    postSixLeagueCompletionActionPack: actionPackPath
  },
  policy: {
    completionRunnerManifestOnly: true,
    executionApprovalGateRequiredBeforeAnyFurtherExecution: true,
    explicitAllowExecuteFlagRequiredForFutureRunner: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  runnerTargets,
  blockedTargets,
  sourceFetch: { allowed: false, executed: false },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));

if (blockedTargets.length > 0) {
  throw new Error(`Completion runner manifest blocked ${blockedTargets.length} targets`);
}
