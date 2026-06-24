import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-2026-06-15.json"
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

function validateManifest(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestReadCount=2, got ${s.postSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestReadCount}`);
  }
  if (s.sourcePostContinuationCompletionNextPlanningQualityGateRowCount !== 5) throw new Error(`Expected sourcePostContinuationCompletionNextPlanningQualityGateRowCount=5, got ${s.sourcePostContinuationCompletionNextPlanningQualityGateRowCount}`);
  if (s.sourcePostContinuationCompletionNextPlanningRowCount !== 5) throw new Error(`Expected sourcePostContinuationCompletionNextPlanningRowCount=5, got ${s.sourcePostContinuationCompletionNextPlanningRowCount}`);
  if (s.postContinuationCompletionNextPlanningRunnerTargetCount !== 5) throw new Error(`Expected postContinuationCompletionNextPlanningRunnerTargetCount=5, got ${s.postContinuationCompletionNextPlanningRunnerTargetCount}`);
  if (s.readyPostContinuationCompletionNextPlanningRunnerTargetCount !== 5) throw new Error(`Expected readyPostContinuationCompletionNextPlanningRunnerTargetCount=5, got ${s.readyPostContinuationCompletionNextPlanningRunnerTargetCount}`);
  if (s.blockedPostContinuationCompletionNextPlanningRunnerTargetCount !== 0) throw new Error(`Expected blockedPostContinuationCompletionNextPlanningRunnerTargetCount=0, got ${s.blockedPostContinuationCompletionNextPlanningRunnerTargetCount}`);
  if (s.mainLanePostContinuationCompletionNextPlanningRunnerTargetCount !== 4) throw new Error(`Expected mainLanePostContinuationCompletionNextPlanningRunnerTargetCount=4, got ${s.mainLanePostContinuationCompletionNextPlanningRunnerTargetCount}`);
  if (s.repairBacklogPostContinuationCompletionNextPlanningRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogPostContinuationCompletionNextPlanningRunnerTargetCount=1, got ${s.repairBacklogPostContinuationCompletionNextPlanningRunnerTargetCount}`);
  if (s.sportomediaRepairPostContinuationCompletionNextPlanningRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairPostContinuationCompletionNextPlanningRunnerTargetCount=1, got ${s.sportomediaRepairPostContinuationCompletionNextPlanningRunnerTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount !== 5) {
    throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount}`);
  }
  if (s.postSixLeagueNextCycleContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleClosedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount=1");
  if (s.mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionApprovalGateCount=1");
  }

  [
    "postContinuationCompletionNextPlanningRunnerManifestIsExecutionPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsFetchPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsBroadSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsClassifierPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsCanonicalWritePermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsProductionWritePermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `manifest.summary.${key}`));

  assertFalse(input.productionWrite, "manifest.productionWrite");
  assertFalse(input.sourceFetch?.executed, "manifest.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "manifest.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "manifest.broadSearchUsed");
  assertFalse(input.classifierExecuted, "manifest.classifierExecuted");
}

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateReadCount=2, got ${s.postSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateReadCount}`);
  }
  if (s.sourcePostContinuationCompletionNextPlanningRowCount !== 5) throw new Error(`Expected sourcePostContinuationCompletionNextPlanningRowCount=5, got ${s.sourcePostContinuationCompletionNextPlanningRowCount}`);
  if (s.sourceContinuationCompletionCycleExitVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCycleExitVerificationRowCount=5, got ${s.sourceContinuationCompletionCycleExitVerificationRowCount}`);
  if (s.postContinuationCompletionNextPlanningQualityGateRowCount !== 5) throw new Error(`Expected postContinuationCompletionNextPlanningQualityGateRowCount=5, got ${s.postContinuationCompletionNextPlanningQualityGateRowCount}`);
  if (s.passedPostContinuationCompletionNextPlanningQualityGateRowCount !== 5) throw new Error(`Expected passedPostContinuationCompletionNextPlanningQualityGateRowCount=5, got ${s.passedPostContinuationCompletionNextPlanningQualityGateRowCount}`);
  if (s.blockedPostContinuationCompletionNextPlanningQualityGateRowCount !== 0) throw new Error(`Expected blockedPostContinuationCompletionNextPlanningQualityGateRowCount=0, got ${s.blockedPostContinuationCompletionNextPlanningQualityGateRowCount}`);
  if (s.mainLanePostContinuationCompletionNextPlanningQualityGatedCount !== 4) throw new Error(`Expected mainLanePostContinuationCompletionNextPlanningQualityGatedCount=4, got ${s.mainLanePostContinuationCompletionNextPlanningQualityGatedCount}`);
  if (s.repairBacklogPostContinuationCompletionNextPlanningQualityGatedCount !== 1) throw new Error(`Expected repairBacklogPostContinuationCompletionNextPlanningQualityGatedCount=1, got ${s.repairBacklogPostContinuationCompletionNextPlanningQualityGatedCount}`);
  if (s.sportomediaRepairPostContinuationCompletionNextPlanningQualityGatedCount !== 1) throw new Error(`Expected sportomediaRepairPostContinuationCompletionNextPlanningQualityGatedCount=1, got ${s.sportomediaRepairPostContinuationCompletionNextPlanningQualityGatedCount}`);
  if (s.mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestCount=1");
  }

  [
    "postContinuationCompletionNextPlanningQualityGateIsExecutionPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsFetchPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsBroadSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsClassifierPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsCanonicalWritePermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsProductionWritePermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsTruthAssertionPermissionNowCount",
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

function validateRunnerTarget(target) {
  const failures = [];

  if (!target.postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId) failures.push("missing_next_planning_runner_target_id");
  if (!target.postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId) failures.push("missing_next_planning_quality_gate_row_id");
  if (!target.postSixLeaguePostContinuationCompletionNextPlanningRowId) failures.push("missing_next_planning_row_id");
  if (!target.postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId) failures.push("missing_cycle_exit_verification_row_id");
  if (!target.postSixLeagueNextCycleContinuationCompletionCycleExitRowId) failures.push("missing_cycle_exit_row_id");
  if (!target.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId) failures.push("missing_closeout_verification_row_id");
  if (!target.postSixLeagueNextCycleContinuationCompletionCloseoutRowId) failures.push("missing_closeout_row_id");
  if (!target.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId) failures.push("missing_completion_execution_verification_row_id");
  if (!target.sourceLane) failures.push("missing_source_lane");
  if (!target.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!target.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!target.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");
  if (!target.postContinuationCompletionNextPlanningLayer) failures.push("missing_post_continuation_completion_next_planning_layer");
  if (!target.postContinuationCompletionNextPlanningIntent) failures.push("missing_post_continuation_completion_next_planning_intent");
  if (!target.postContinuationCompletionNextPlanningRunnerGroup) failures.push("missing_post_continuation_completion_next_planning_runner_group");

  if (target.postContinuationCompletionNextPlanningRunnerTargetStatus !== "ready_for_post_six_league_post_continuation_completion_next_planning_execution_approval_gate") {
    failures.push(`unexpected_next_planning_runner_target_status:${target.postContinuationCompletionNextPlanningRunnerTargetStatus}`);
  }

  if (target.requiresExecutionApprovalGate !== true) failures.push("execution_approval_gate_not_required");
  if (target.requiresExplicitAllowExecuteFlag !== true) failures.push("explicit_allow_execute_flag_not_required");

  [
    "postContinuationCompletionNextPlanningRunnerIsExecutionPermissionNow",
    "postContinuationCompletionNextPlanningRunnerIsFetchPermissionNow",
    "postContinuationCompletionNextPlanningRunnerIsSearchPermissionNow",
    "postContinuationCompletionNextPlanningRunnerIsBroadSearchPermissionNow",
    "postContinuationCompletionNextPlanningRunnerIsClassifierPermissionNow",
    "postContinuationCompletionNextPlanningRunnerIsCanonicalWritePermissionNow",
    "postContinuationCompletionNextPlanningRunnerIsProductionWritePermissionNow",
    "postContinuationCompletionNextPlanningRunnerIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (target[key] !== false) failures.push(`runner_target_guardrail_not_false:${key}`);
  });

  return failures;
}

const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateManifest(manifest);
validateQualityGate(qualityGate);

const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];
const qualityGateRows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];

if (runnerTargets.length !== 5) throw new Error(`Expected 5 post-continuation-completion next-planning runner targets, got ${runnerTargets.length}`);
if (qualityGateRows.length !== 5) throw new Error(`Expected 5 post-continuation-completion next-planning quality-gate rows, got ${qualityGateRows.length}`);

const executionApprovalRows = runnerTargets.map((target, index) => {
  const failures = validateRunnerTarget(target);

  return {
    postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId: `post_six_league_post_continuation_completion_next_planning_execution_approval_${String(index + 1).padStart(2, "0")}`,
    postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId: target.postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId,
    postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId: target.postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId,
    postSixLeaguePostContinuationCompletionNextPlanningRowId: target.postSixLeaguePostContinuationCompletionNextPlanningRowId,
    postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId: target.postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionCycleExitRowId: target.postSixLeagueNextCycleContinuationCompletionCycleExitRowId,
    postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId: target.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionCloseoutRowId: target.postSixLeagueNextCycleContinuationCompletionCloseoutRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId: target.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionRowId: target.postSixLeagueNextCycleContinuationCompletionExecutionRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId: target.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId,
    postSixLeagueNextCycleContinuationCompletionRunnerTargetId: target.postSixLeagueNextCycleContinuationCompletionRunnerTargetId,
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId: target.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId,
    postSixLeagueNextCycleContinuationCompletionActionPackRowId: target.postSixLeagueNextCycleContinuationCompletionActionPackRowId,
    postSixLeagueNextCycleContinuationCompletionRoutingRowId: target.postSixLeagueNextCycleContinuationCompletionRoutingRowId,
    postSixLeagueNextCycleContinuationExecutionVerificationRowId: target.postSixLeagueNextCycleContinuationExecutionVerificationRowId,
    postSixLeagueNextCycleContinuationExecutionRowId: target.postSixLeagueNextCycleContinuationExecutionRowId,
    postSixLeagueNextCycleContinuationExecutionApprovalRowId: target.postSixLeagueNextCycleContinuationExecutionApprovalRowId,
    postSixLeagueNextCycleContinuationRunnerTargetId: target.postSixLeagueNextCycleContinuationRunnerTargetId,
    postSixLeagueNextCycleContinuationActionPackQualityGateRowId: target.postSixLeagueNextCycleContinuationActionPackQualityGateRowId,
    postSixLeagueNextCycleContinuationActionPackRowId: target.postSixLeagueNextCycleContinuationActionPackRowId,
    postSixLeagueNextCycleContinuationRoutingRowId: target.postSixLeagueNextCycleContinuationRoutingRowId,
    postSixLeagueNextCycleExecutionVerificationRowId: target.postSixLeagueNextCycleExecutionVerificationRowId,
    postSixLeagueNextCycleExecutionRowId: target.postSixLeagueNextCycleExecutionRowId,
    postSixLeagueNextCycleExecutionApprovalRowId: target.postSixLeagueNextCycleExecutionApprovalRowId,
    postSixLeagueNextCycleRunnerTargetId: target.postSixLeagueNextCycleRunnerTargetId,
    postSixLeagueNextCycleActionPackQualityGateRowId: target.postSixLeagueNextCycleActionPackQualityGateRowId,
    postSixLeagueNextCycleActionPackRowId: target.postSixLeagueNextCycleActionPackRowId,
    postSixLeagueNextCycleRoutingRowId: target.postSixLeagueNextCycleRoutingRowId,
    continuationCompletionCloseoutRowId: target.continuationCompletionCloseoutRowId,
    continuationCompletionExecutionVerificationRowId: target.continuationCompletionExecutionVerificationRowId,
    continuationCompletionExecutionRowId: target.continuationCompletionExecutionRowId,
    continuationCompletionExecutionApprovalRowId: target.continuationCompletionExecutionApprovalRowId,
    continuationCompletionRunnerTargetId: target.continuationCompletionRunnerTargetId,
    sourceContinuationRoutingRowId: target.sourceContinuationRoutingRowId,
    sourceVerificationRowId: target.sourceVerificationRowId,
    sourceLane: target.sourceLane,
    actionPackLane: target.actionPackLane,
    routeFamily: target.routeFamily,
    completionRouteFamily: target.completionRouteFamily,
    nextCycleRouteFamily: target.nextCycleRouteFamily,
    nextCycleContinuationRouteFamily: target.nextCycleContinuationRouteFamily,
    nextCycleContinuationCompletionRouteFamily: target.nextCycleContinuationCompletionRouteFamily,
    providerFamily: target.providerFamily || null,
    executionGroup: target.executionGroup || null,
    nextCycleActionPackLane: target.nextCycleActionPackLane,
    nextCycleRunnerGroup: target.nextCycleRunnerGroup,
    nextCycleContinuationActionPackLane: target.nextCycleContinuationActionPackLane,
    nextCycleContinuationRunnerGroup: target.nextCycleContinuationRunnerGroup,
    nextCycleContinuationCompletionActionPackLane: target.nextCycleContinuationCompletionActionPackLane,
    nextCycleContinuationCompletionRunnerGroup: target.nextCycleContinuationCompletionRunnerGroup,
    postContinuationCompletionNextPlanningLayer: target.postContinuationCompletionNextPlanningLayer,
    postContinuationCompletionNextPlanningIntent: target.postContinuationCompletionNextPlanningIntent,
    postContinuationCompletionNextPlanningRunnerGroup: target.postContinuationCompletionNextPlanningRunnerGroup,

    postContinuationCompletionNextPlanningExecutionApprovalStatus:
      failures.length === 0
        ? "approved_for_explicit_diagnostics_only_post_continuation_completion_next_planning_execution_runner"
        : "blocked_from_post_continuation_completion_next_planning_execution_runner",
    failures,
    mayRunPostContinuationCompletionNextPlanningExecutionRunnerForTarget: failures.length === 0,
    nextRunnerRequiresExplicitAllowExecuteFlag: true,

    postContinuationCompletionNextPlanningExecutionApprovalIsExecutionPermissionNow: false,
    postContinuationCompletionNextPlanningExecutionApprovalIsFetchPermissionNow: false,
    postContinuationCompletionNextPlanningExecutionApprovalIsSearchPermissionNow: false,
    postContinuationCompletionNextPlanningExecutionApprovalIsBroadSearchPermissionNow: false,
    postContinuationCompletionNextPlanningExecutionApprovalIsClassifierPermissionNow: false,
    postContinuationCompletionNextPlanningExecutionApprovalIsCanonicalWritePermissionNow: false,
    postContinuationCompletionNextPlanningExecutionApprovalIsProductionWritePermissionNow: false,
    postContinuationCompletionNextPlanningExecutionApprovalIsTruthAssertionPermissionNow: false,

    nextRunnerMayExecutePostContinuationCompletionNextPlanning: failures.length === 0,
    nextRunnerMayFetch: false,
    nextRunnerMaySearch: false,
    nextRunnerMayBroadSearch: false,
    nextRunnerMayClassify: false,
    nextRunnerMayWriteCanonical: false,
    nextRunnerMayWriteProduction: false,
    nextRunnerMayAssertTruth: false
  };
});

const approvedRows = executionApprovalRows.filter(
  (row) => row.postContinuationCompletionNextPlanningExecutionApprovalStatus === "approved_for_explicit_diagnostics_only_post_continuation_completion_next_planning_execution_runner"
);

const blockedRows = executionApprovalRows.filter(
  (row) => row.postContinuationCompletionNextPlanningExecutionApprovalStatus !== "approved_for_explicit_diagnostics_only_post_continuation_completion_next_planning_execution_runner"
);

const summary = {
  postSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionApprovalGateReadCount: 2,
  sourcePostContinuationCompletionNextPlanningRunnerTargetCount: runnerTargets.length,
  sourcePostContinuationCompletionNextPlanningQualityGateRowCount: qualityGateRows.length,

  postContinuationCompletionNextPlanningExecutionApprovalRowCount: executionApprovalRows.length,
  approvedPostContinuationCompletionNextPlanningExecutionApprovalRowCount: approvedRows.length,
  blockedPostContinuationCompletionNextPlanningExecutionApprovalRowCount: blockedRows.length,

  approvedMainLanePostContinuationCompletionNextPlanningExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  approvedRepairBacklogPostContinuationCompletionNextPlanningExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  approvedSportomediaRepairPostContinuationCompletionNextPlanningExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    manifest.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    manifest.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    manifest.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    manifest.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    manifest.summary.postSixLeagueNextCycleContinuationCompletionCycleClosedCount,

  postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount:
    manifest.summary.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitedCount:
    manifest.summary.postSixLeagueNextCycleContinuationCompletionCycleExitedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount:
    manifest.summary.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount,

  mayRunPostSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionRunnerCount:
    blockedRows.length === 0 ? 1 : 0,

  postContinuationCompletionNextPlanningExecutionApprovalIsExecutionPermissionNowCount: 0,
  postContinuationCompletionNextPlanningExecutionApprovalIsFetchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningExecutionApprovalIsSearchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningExecutionApprovalIsBroadSearchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningExecutionApprovalIsClassifierPermissionNowCount: 0,
  postContinuationCompletionNextPlanningExecutionApprovalIsCanonicalWritePermissionNowCount: 0,
  postContinuationCompletionNextPlanningExecutionApprovalIsProductionWritePermissionNowCount: 0,
  postContinuationCompletionNextPlanningExecutionApprovalIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayExecutePostContinuationCompletionNextPlanningCount: approvedRows.length,
  nextRunnerMayFetchCount: 0,
  nextRunnerMaySearchCount: 0,
  nextRunnerMayBroadSearchCount: 0,
  nextRunnerMayClassifyCount: 0,
  nextRunnerMayWriteCanonicalCount: 0,
  nextRunnerMayWriteProductionCount: 0,
  nextRunnerMayAssertTruthCount: 0,

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
  job: "run-football-truth-post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_post_continuation_completion_next_planning_execution_approval_gate",
  dryRun: true,
  inputs: {
    postSixLeaguePostContinuationCompletionNextPlanningRunnerManifest: manifestPath,
    postSixLeaguePostContinuationCompletionNextPlanningQualityGate: qualityGatePath
  },
  policy: {
    postContinuationCompletionNextPlanningExecutionApprovalGateOnly: true,
    approvalDoesNotExecutePostContinuationCompletionNextPlanning: true,
    futureRunnerRequiresExplicitAllowExecuteFlag: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  executionApprovalRows,
  blockedRows,
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

if (blockedRows.length > 0) {
  throw new Error(`Post-continuation-completion next-planning execution approval gate blocked ${blockedRows.length} rows`);
}
