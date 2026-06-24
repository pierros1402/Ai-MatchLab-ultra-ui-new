import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-2026-06-15.json"
);

const planningPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-artifact-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-artifact-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-2026-06-15.json"
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

function validatePlanning(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactReadCount=3, got ${s.postSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactReadCount}`);
  }
  if (s.sourceContinuationCompletionCycleExitVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCycleExitVerificationRowCount=5, got ${s.sourceContinuationCompletionCycleExitVerificationRowCount}`);
  if (s.sourceContinuationCompletionCycleExitRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCycleExitRowCount=5, got ${s.sourceContinuationCompletionCycleExitRowCount}`);
  if (s.sourceContinuationCompletionCloseoutVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCloseoutVerificationRowCount=5, got ${s.sourceContinuationCompletionCloseoutVerificationRowCount}`);
  if (s.postContinuationCompletionNextPlanningRowCount !== 5) throw new Error(`Expected postContinuationCompletionNextPlanningRowCount=5, got ${s.postContinuationCompletionNextPlanningRowCount}`);
  if (s.readyPostContinuationCompletionNextPlanningRowCount !== 5) throw new Error(`Expected readyPostContinuationCompletionNextPlanningRowCount=5, got ${s.readyPostContinuationCompletionNextPlanningRowCount}`);
  if (s.blockedPostContinuationCompletionNextPlanningRowCount !== 0) throw new Error(`Expected blockedPostContinuationCompletionNextPlanningRowCount=0, got ${s.blockedPostContinuationCompletionNextPlanningRowCount}`);
  if (s.mainLanePostContinuationCompletionNextPlanningRowCount !== 4) throw new Error(`Expected mainLanePostContinuationCompletionNextPlanningRowCount=4, got ${s.mainLanePostContinuationCompletionNextPlanningRowCount}`);
  if (s.repairBacklogPostContinuationCompletionNextPlanningRowCount !== 1) throw new Error(`Expected repairBacklogPostContinuationCompletionNextPlanningRowCount=1, got ${s.repairBacklogPostContinuationCompletionNextPlanningRowCount}`);
  if (s.sportomediaRepairPostContinuationCompletionNextPlanningRowCount !== 1) throw new Error(`Expected sportomediaRepairPostContinuationCompletionNextPlanningRowCount=1, got ${s.sportomediaRepairPostContinuationCompletionNextPlanningRowCount}`);
  if (s.mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateCount=1");
  }

  [
    "postContinuationCompletionNextPlanningIsExecutionPermissionNowCount",
    "postContinuationCompletionNextPlanningIsFetchPermissionNowCount",
    "postContinuationCompletionNextPlanningIsSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningIsBroadSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningIsClassifierPermissionNowCount",
    "postContinuationCompletionNextPlanningIsCanonicalWritePermissionNowCount",
    "postContinuationCompletionNextPlanningIsProductionWritePermissionNowCount",
    "postContinuationCompletionNextPlanningIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `planning.summary.${key}`));

  assertFalse(input.productionWrite, "planning.productionWrite");
  assertFalse(input.sourceFetch?.executed, "planning.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "planning.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "planning.broadSearchUsed");
  assertFalse(input.classifierExecuted, "planning.classifierExecuted");
}

function validateQualityGateRow(row) {
  const failures = [];

  if (!row.postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId) failures.push("missing_next_planning_quality_gate_row_id");
  if (!row.postSixLeaguePostContinuationCompletionNextPlanningRowId) failures.push("missing_next_planning_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId) failures.push("missing_cycle_exit_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCycleExitRowId) failures.push("missing_cycle_exit_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId) failures.push("missing_closeout_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutRowId) failures.push("missing_closeout_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId) failures.push("missing_completion_execution_verification_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");
  if (!row.postContinuationCompletionNextPlanningLayer) failures.push("missing_post_continuation_completion_next_planning_layer");
  if (!row.postContinuationCompletionNextPlanningIntent) failures.push("missing_post_continuation_completion_next_planning_intent");

  if (row.postContinuationCompletionNextPlanningQualityGateStatus !== "passed_ready_for_post_continuation_completion_next_planning_runner_manifest") {
    failures.push(`unexpected_next_planning_quality_gate_status:${row.postContinuationCompletionNextPlanningQualityGateStatus}`);
  }

  if (row.mayBuildPostContinuationCompletionNextPlanningRunnerManifestForRow !== true) {
    failures.push("may_build_post_continuation_completion_next_planning_runner_manifest_not_true");
  }

  [
    "postContinuationCompletionNextPlanningQualityGateIsExecutionPermissionNow",
    "postContinuationCompletionNextPlanningQualityGateIsFetchPermissionNow",
    "postContinuationCompletionNextPlanningQualityGateIsSearchPermissionNow",
    "postContinuationCompletionNextPlanningQualityGateIsBroadSearchPermissionNow",
    "postContinuationCompletionNextPlanningQualityGateIsClassifierPermissionNow",
    "postContinuationCompletionNextPlanningQualityGateIsCanonicalWritePermissionNow",
    "postContinuationCompletionNextPlanningQualityGateIsProductionWritePermissionNow",
    "postContinuationCompletionNextPlanningQualityGateIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`quality_gate_guardrail_not_false:${key}`);
  });

  return failures;
}

const qualityGate = readJson(qualityGatePath);
const planning = readJson(planningPath);

validateQualityGate(qualityGate);
validatePlanning(planning);

const qualityGateRows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];
const planningRows = Array.isArray(planning.planningRows) ? planning.planningRows : [];

if (qualityGateRows.length !== 5) throw new Error(`Expected 5 next-planning quality-gate rows, got ${qualityGateRows.length}`);
if (planningRows.length !== 5) throw new Error(`Expected 5 next-planning rows, got ${planningRows.length}`);

const planningById = new Map(
  planningRows.map((row) => [row.postSixLeaguePostContinuationCompletionNextPlanningRowId, row])
);

const runnerTargets = qualityGateRows.map((row, index) => {
  const failures = validateQualityGateRow(row);
  const sourcePlanningRow = planningById.get(row.postSixLeaguePostContinuationCompletionNextPlanningRowId);

  if (!sourcePlanningRow) failures.push("missing_matching_post_continuation_completion_next_planning_row");

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";
  const isRepairBacklog = row.nextCycleRouteFamily === "repair_backlog_next_cycle";

  if (!isMainLane && !isRepairBacklog) {
    failures.push(`unexpected_next_cycle_route_family:${row.nextCycleRouteFamily}`);
  }

  return {
    postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId: `post_six_league_post_continuation_completion_next_planning_runner_target_${String(index + 1).padStart(2, "0")}`,
    postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId: row.postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId,
    postSixLeaguePostContinuationCompletionNextPlanningRowId: row.postSixLeaguePostContinuationCompletionNextPlanningRowId,
    postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionCycleExitRowId: row.postSixLeagueNextCycleContinuationCompletionCycleExitRowId,
    postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionCloseoutRowId: row.postSixLeagueNextCycleContinuationCompletionCloseoutRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId,
    postSixLeagueNextCycleContinuationCompletionRunnerTargetId: row.postSixLeagueNextCycleContinuationCompletionRunnerTargetId,
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId: row.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId,
    postSixLeagueNextCycleContinuationCompletionActionPackRowId: row.postSixLeagueNextCycleContinuationCompletionActionPackRowId,
    postSixLeagueNextCycleContinuationCompletionRoutingRowId: row.postSixLeagueNextCycleContinuationCompletionRoutingRowId,
    postSixLeagueNextCycleContinuationExecutionVerificationRowId: row.postSixLeagueNextCycleContinuationExecutionVerificationRowId,
    postSixLeagueNextCycleContinuationExecutionRowId: row.postSixLeagueNextCycleContinuationExecutionRowId,
    postSixLeagueNextCycleContinuationExecutionApprovalRowId: row.postSixLeagueNextCycleContinuationExecutionApprovalRowId,
    postSixLeagueNextCycleContinuationRunnerTargetId: row.postSixLeagueNextCycleContinuationRunnerTargetId,
    postSixLeagueNextCycleContinuationActionPackQualityGateRowId: row.postSixLeagueNextCycleContinuationActionPackQualityGateRowId,
    postSixLeagueNextCycleContinuationActionPackRowId: row.postSixLeagueNextCycleContinuationActionPackRowId,
    postSixLeagueNextCycleContinuationRoutingRowId: row.postSixLeagueNextCycleContinuationRoutingRowId,
    postSixLeagueNextCycleExecutionVerificationRowId: row.postSixLeagueNextCycleExecutionVerificationRowId,
    postSixLeagueNextCycleExecutionRowId: row.postSixLeagueNextCycleExecutionRowId,
    postSixLeagueNextCycleExecutionApprovalRowId: row.postSixLeagueNextCycleExecutionApprovalRowId,
    postSixLeagueNextCycleRunnerTargetId: row.postSixLeagueNextCycleRunnerTargetId,
    postSixLeagueNextCycleActionPackQualityGateRowId: row.postSixLeagueNextCycleActionPackQualityGateRowId,
    postSixLeagueNextCycleActionPackRowId: row.postSixLeagueNextCycleActionPackRowId,
    postSixLeagueNextCycleRoutingRowId: row.postSixLeagueNextCycleRoutingRowId,
    continuationCompletionCloseoutRowId: row.continuationCompletionCloseoutRowId,
    continuationCompletionExecutionVerificationRowId: row.continuationCompletionExecutionVerificationRowId,
    continuationCompletionExecutionRowId: row.continuationCompletionExecutionRowId,
    continuationCompletionExecutionApprovalRowId: row.continuationCompletionExecutionApprovalRowId,
    continuationCompletionRunnerTargetId: row.continuationCompletionRunnerTargetId,
    sourceContinuationRoutingRowId: row.sourceContinuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    completionRouteFamily: row.completionRouteFamily,
    nextCycleRouteFamily: row.nextCycleRouteFamily,
    nextCycleContinuationRouteFamily: row.nextCycleContinuationRouteFamily,
    nextCycleContinuationCompletionRouteFamily: row.nextCycleContinuationCompletionRouteFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    nextCycleActionPackLane: row.nextCycleActionPackLane,
    nextCycleRunnerGroup: row.nextCycleRunnerGroup,
    nextCycleContinuationActionPackLane: row.nextCycleContinuationActionPackLane,
    nextCycleContinuationRunnerGroup: row.nextCycleContinuationRunnerGroup,
    nextCycleContinuationCompletionActionPackLane: row.nextCycleContinuationCompletionActionPackLane,
    nextCycleContinuationCompletionRunnerGroup: row.nextCycleContinuationCompletionRunnerGroup,
    postContinuationCompletionNextPlanningLayer: row.postContinuationCompletionNextPlanningLayer,
    postContinuationCompletionNextPlanningIntent: row.postContinuationCompletionNextPlanningIntent,

    postContinuationCompletionNextPlanningRunnerGroup: isMainLane
      ? "whole_map_main_lane_post_continuation_completion_next_planning_runner_group"
      : "repair_backlog_post_continuation_completion_next_planning_runner_group",
    postContinuationCompletionNextPlanningRunnerTargetStatus:
      failures.length === 0
        ? "ready_for_post_six_league_post_continuation_completion_next_planning_execution_approval_gate"
        : "blocked_from_post_six_league_post_continuation_completion_next_planning_execution_approval_gate",
    failures,
    requiresExecutionApprovalGate: true,
    requiresExplicitAllowExecuteFlag: true,

    postContinuationCompletionNextPlanningRunnerIsExecutionPermissionNow: false,
    postContinuationCompletionNextPlanningRunnerIsFetchPermissionNow: false,
    postContinuationCompletionNextPlanningRunnerIsSearchPermissionNow: false,
    postContinuationCompletionNextPlanningRunnerIsBroadSearchPermissionNow: false,
    postContinuationCompletionNextPlanningRunnerIsClassifierPermissionNow: false,
    postContinuationCompletionNextPlanningRunnerIsCanonicalWritePermissionNow: false,
    postContinuationCompletionNextPlanningRunnerIsProductionWritePermissionNow: false,
    postContinuationCompletionNextPlanningRunnerIsTruthAssertionPermissionNow: false
  };
});

const readyTargets = runnerTargets.filter(
  (row) => row.postContinuationCompletionNextPlanningRunnerTargetStatus === "ready_for_post_six_league_post_continuation_completion_next_planning_execution_approval_gate"
);

const blockedTargets = runnerTargets.filter(
  (row) => row.postContinuationCompletionNextPlanningRunnerTargetStatus !== "ready_for_post_six_league_post_continuation_completion_next_planning_execution_approval_gate"
);

const summary = {
  postSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestReadCount: 2,
  sourcePostContinuationCompletionNextPlanningQualityGateRowCount: qualityGateRows.length,
  sourcePostContinuationCompletionNextPlanningRowCount: planningRows.length,

  postContinuationCompletionNextPlanningRunnerTargetCount: runnerTargets.length,
  readyPostContinuationCompletionNextPlanningRunnerTargetCount: readyTargets.length,
  blockedPostContinuationCompletionNextPlanningRunnerTargetCount: blockedTargets.length,

  mainLanePostContinuationCompletionNextPlanningRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogPostContinuationCompletionNextPlanningRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairPostContinuationCompletionNextPlanningRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    qualityGate.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    qualityGate.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    qualityGate.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    qualityGate.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    qualityGate.summary.postSixLeagueNextCycleContinuationCompletionCycleClosedCount,

  postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount:
    qualityGate.summary.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitedCount:
    qualityGate.summary.postSixLeagueNextCycleContinuationCompletionCycleExitedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount:
    qualityGate.summary.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount,

  mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionApprovalGateCount:
    blockedTargets.length === 0 ? 1 : 0,

  postContinuationCompletionNextPlanningRunnerManifestIsExecutionPermissionNowCount: 0,
  postContinuationCompletionNextPlanningRunnerManifestIsFetchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningRunnerManifestIsSearchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningRunnerManifestIsBroadSearchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningRunnerManifestIsClassifierPermissionNowCount: 0,
  postContinuationCompletionNextPlanningRunnerManifestIsCanonicalWritePermissionNowCount: 0,
  postContinuationCompletionNextPlanningRunnerManifestIsProductionWritePermissionNowCount: 0,
  postContinuationCompletionNextPlanningRunnerManifestIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_post_continuation_completion_next_planning_runner_manifest",
  dryRun: true,
  inputs: {
    postSixLeaguePostContinuationCompletionNextPlanningQualityGate: qualityGatePath,
    postSixLeaguePostContinuationCompletionNextPlanningArtifact: planningPath
  },
  policy: {
    postContinuationCompletionNextPlanningRunnerManifestOnly: true,
    nextPlanningExecutionApprovalGateRequiredBeforeAnyFurtherExecution: true,
    explicitAllowExecuteFlagRequiredForFuturePostContinuationCompletionNextPlanningRunner: true,
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
  throw new Error(`Post-continuation-completion next-planning runner manifest blocked ${blockedTargets.length} targets`);
}
