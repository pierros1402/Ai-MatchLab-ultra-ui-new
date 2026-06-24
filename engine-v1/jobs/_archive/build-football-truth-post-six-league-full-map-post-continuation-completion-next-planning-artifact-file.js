import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const cycleExitVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-verification-2026-06-15.json"
);

const cycleExitPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-artifact-2026-06-15.json"
);

const closeoutVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-verification-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-post-continuation-completion-next-planning-artifact-2026-06-15.json"
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

function validateCycleExitVerification(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionCycleExitVerificationReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionCycleExitVerificationReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionCycleExitVerificationReadCount}`);
  }
  if (s.sourceContinuationCompletionCycleExitRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCycleExitRowCount=5, got ${s.sourceContinuationCompletionCycleExitRowCount}`);
  if (s.sourceContinuationCompletionCloseoutVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCloseoutVerificationRowCount=5, got ${s.sourceContinuationCompletionCloseoutVerificationRowCount}`);
  if (s.sourceContinuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCloseoutRowCount=5, got ${s.sourceContinuationCompletionCloseoutRowCount}`);
  if (s.cycleExitVerificationRowCount !== 5) throw new Error(`Expected cycleExitVerificationRowCount=5, got ${s.cycleExitVerificationRowCount}`);
  if (s.verifiedContinuationCompletionCycleExitRowCount !== 5) throw new Error(`Expected verifiedContinuationCompletionCycleExitRowCount=5, got ${s.verifiedContinuationCompletionCycleExitRowCount}`);
  if (s.blockedContinuationCompletionCycleExitVerificationCount !== 0) throw new Error(`Expected blockedContinuationCompletionCycleExitVerificationCount=0, got ${s.blockedContinuationCompletionCycleExitVerificationCount}`);
  if (s.verifiedMainLaneContinuationCompletionCycleExitCount !== 4) throw new Error(`Expected verifiedMainLaneContinuationCompletionCycleExitCount=4, got ${s.verifiedMainLaneContinuationCompletionCycleExitCount}`);
  if (s.verifiedRepairBacklogContinuationCompletionCycleExitCount !== 1) throw new Error(`Expected verifiedRepairBacklogContinuationCompletionCycleExitCount=1, got ${s.verifiedRepairBacklogContinuationCompletionCycleExitCount}`);
  if (s.verifiedSportomediaRepairContinuationCompletionCycleExitCount !== 1) throw new Error(`Expected verifiedSportomediaRepairContinuationCompletionCycleExitCount=1, got ${s.verifiedSportomediaRepairContinuationCompletionCycleExitCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount}`);
  if (s.postSixLeagueNextCycleContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleClosedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount=1");
  if (s.mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactCount=1");
  }

  [
    "cycleExitVerificationIsExecutionPermissionNowCount",
    "cycleExitVerificationIsFetchPermissionNowCount",
    "cycleExitVerificationIsSearchPermissionNowCount",
    "cycleExitVerificationIsBroadSearchPermissionNowCount",
    "cycleExitVerificationIsClassifierPermissionNowCount",
    "cycleExitVerificationIsCanonicalWritePermissionNowCount",
    "cycleExitVerificationIsProductionWritePermissionNowCount",
    "cycleExitVerificationIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `cycleExitVerification.summary.${key}`));

  assertFalse(input.productionWrite, "cycleExitVerification.productionWrite");
  assertFalse(input.sourceFetch?.executed, "cycleExitVerification.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "cycleExitVerification.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "cycleExitVerification.broadSearchUsed");
  assertFalse(input.classifierExecuted, "cycleExitVerification.classifierExecuted");
}

function validateCycleExit(input) {
  const s = input.summary || {};

  if (s.continuationCompletionCycleExitRowCount !== 5) throw new Error(`Expected continuationCompletionCycleExitRowCount=5, got ${s.continuationCompletionCycleExitRowCount}`);
  if (s.exitedContinuationCompletionCycleRowCount !== 5) throw new Error(`Expected exitedContinuationCompletionCycleRowCount=5, got ${s.exitedContinuationCompletionCycleRowCount}`);
  if (s.blockedContinuationCompletionCycleExitCount !== 0) throw new Error(`Expected blockedContinuationCompletionCycleExitCount=0, got ${s.blockedContinuationCompletionCycleExitCount}`);
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitedCount=1");

  [
    "cycleExitIsExecutionPermissionNowCount",
    "cycleExitIsFetchPermissionNowCount",
    "cycleExitIsSearchPermissionNowCount",
    "cycleExitIsBroadSearchPermissionNowCount",
    "cycleExitIsClassifierPermissionNowCount",
    "cycleExitIsCanonicalWritePermissionNowCount",
    "cycleExitIsProductionWritePermissionNowCount",
    "cycleExitIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `cycleExit.summary.${key}`));

  assertFalse(input.productionWrite, "cycleExit.productionWrite");
  assertFalse(input.sourceFetch?.executed, "cycleExit.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "cycleExit.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "cycleExit.broadSearchUsed");
  assertFalse(input.classifierExecuted, "cycleExit.classifierExecuted");
}

function validateCloseoutVerification(input) {
  const s = input.summary || {};

  if (s.closeoutVerificationRowCount !== 5) throw new Error(`Expected closeoutVerificationRowCount=5, got ${s.closeoutVerificationRowCount}`);
  if (s.verifiedContinuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected verifiedContinuationCompletionCloseoutRowCount=5, got ${s.verifiedContinuationCompletionCloseoutRowCount}`);
  if (s.blockedContinuationCompletionCloseoutVerificationCount !== 0) throw new Error(`Expected blockedContinuationCompletionCloseoutVerificationCount=0, got ${s.blockedContinuationCompletionCloseoutVerificationCount}`);
  if (s.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount=1");

  [
    "closeoutVerificationIsExecutionPermissionNowCount",
    "closeoutVerificationIsFetchPermissionNowCount",
    "closeoutVerificationIsSearchPermissionNowCount",
    "closeoutVerificationIsBroadSearchPermissionNowCount",
    "closeoutVerificationIsClassifierPermissionNowCount",
    "closeoutVerificationIsCanonicalWritePermissionNowCount",
    "closeoutVerificationIsProductionWritePermissionNowCount",
    "closeoutVerificationIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `closeoutVerification.summary.${key}`));

  assertFalse(input.productionWrite, "closeoutVerification.productionWrite");
  assertFalse(input.sourceFetch?.executed, "closeoutVerification.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "closeoutVerification.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "closeoutVerification.broadSearchUsed");
  assertFalse(input.classifierExecuted, "closeoutVerification.classifierExecuted");
}

function validateCycleExitVerificationRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId) failures.push("missing_cycle_exit_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCycleExitRowId) failures.push("missing_cycle_exit_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId) failures.push("missing_closeout_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutRowId) failures.push("missing_closeout_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId) failures.push("missing_completion_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionRowId) failures.push("missing_completion_execution_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId) failures.push("missing_completion_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionRunnerTargetId) failures.push("missing_completion_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");

  if (row.cycleExitVerificationStatus !== "verified_exited_post_six_league_next_cycle_continuation_completion_cycle") {
    failures.push(`unexpected_cycle_exit_verification_status:${row.cycleExitVerificationStatus}`);
  }

  if (row.verifiedEligibleForPostContinuationCompletionNextPlanning !== true) {
    failures.push("verified_eligible_for_post_continuation_completion_next_planning_not_true");
  }

  if (row.verifiedEligibleForNewPlanningLayer !== true) {
    failures.push("verified_eligible_for_new_planning_layer_not_true");
  }

  [
    "cycleExitVerificationIsExecutionPermissionNow",
    "cycleExitVerificationIsFetchPermissionNow",
    "cycleExitVerificationIsSearchPermissionNow",
    "cycleExitVerificationIsBroadSearchPermissionNow",
    "cycleExitVerificationIsClassifierPermissionNow",
    "cycleExitVerificationIsCanonicalWritePermissionNow",
    "cycleExitVerificationIsProductionWritePermissionNow",
    "cycleExitVerificationIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`cycle_exit_verification_guardrail_not_false:${key}`);
  });

  return failures;
}

const cycleExitVerification = readJson(cycleExitVerificationPath);
const cycleExit = readJson(cycleExitPath);
const closeoutVerification = readJson(closeoutVerificationPath);

validateCycleExitVerification(cycleExitVerification);
validateCycleExit(cycleExit);
validateCloseoutVerification(closeoutVerification);

const cycleExitVerificationRows = Array.isArray(cycleExitVerification.cycleExitVerificationRows)
  ? cycleExitVerification.cycleExitVerificationRows
  : [];

const cycleExitRows = Array.isArray(cycleExit.cycleExitRows) ? cycleExit.cycleExitRows : [];
const closeoutVerificationRows = Array.isArray(closeoutVerification.closeoutVerificationRows)
  ? closeoutVerification.closeoutVerificationRows
  : [];

if (cycleExitVerificationRows.length !== 5) throw new Error(`Expected 5 cycle-exit verification rows, got ${cycleExitVerificationRows.length}`);
if (cycleExitRows.length !== 5) throw new Error(`Expected 5 cycle-exit rows, got ${cycleExitRows.length}`);
if (closeoutVerificationRows.length !== 5) throw new Error(`Expected 5 closeout verification rows, got ${closeoutVerificationRows.length}`);

const planningRows = cycleExitVerificationRows.map((row, index) => {
  const failures = validateCycleExitVerificationRow(row);
  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";
  const isRepairBacklog = row.nextCycleRouteFamily === "repair_backlog_next_cycle";

  if (!isMainLane && !isRepairBacklog) {
    failures.push(`unexpected_next_cycle_route_family:${row.nextCycleRouteFamily}`);
  }

  return {
    postSixLeaguePostContinuationCompletionNextPlanningRowId: `post_six_league_post_continuation_completion_next_planning_${String(index + 1).padStart(2, "0")}`,
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

    postContinuationCompletionNextPlanningLayer: isMainLane
      ? "whole_map_main_lane_post_continuation_completion_next_planning"
      : "repair_backlog_post_continuation_completion_next_planning",
    postContinuationCompletionNextPlanningIntent: isMainLane
      ? "plan_next_whole_map_main_lane_layer_after_verified_continuation_completion_cycle_exit"
      : "plan_next_repair_backlog_layer_after_verified_continuation_completion_cycle_exit",
    postContinuationCompletionNextPlanningStatus:
      failures.length === 0
        ? "ready_for_post_six_league_post_continuation_completion_next_planning_quality_gate"
        : "blocked_from_post_six_league_post_continuation_completion_next_planning_quality_gate",
    failures,
    mayBuildPostContinuationCompletionNextPlanningQualityGateForRow: failures.length === 0,

    postContinuationCompletionNextPlanningIsExecutionPermissionNow: false,
    postContinuationCompletionNextPlanningIsFetchPermissionNow: false,
    postContinuationCompletionNextPlanningIsSearchPermissionNow: false,
    postContinuationCompletionNextPlanningIsBroadSearchPermissionNow: false,
    postContinuationCompletionNextPlanningIsClassifierPermissionNow: false,
    postContinuationCompletionNextPlanningIsCanonicalWritePermissionNow: false,
    postContinuationCompletionNextPlanningIsProductionWritePermissionNow: false,
    postContinuationCompletionNextPlanningIsTruthAssertionPermissionNow: false
  };
});

const readyRows = planningRows.filter(
  (row) => row.postContinuationCompletionNextPlanningStatus === "ready_for_post_six_league_post_continuation_completion_next_planning_quality_gate"
);

const blockedRows = planningRows.filter(
  (row) => row.postContinuationCompletionNextPlanningStatus !== "ready_for_post_six_league_post_continuation_completion_next_planning_quality_gate"
);

const summary = {
  postSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactReadCount: 3,
  sourceContinuationCompletionCycleExitVerificationRowCount: cycleExitVerificationRows.length,
  sourceContinuationCompletionCycleExitRowCount: cycleExitRows.length,
  sourceContinuationCompletionCloseoutVerificationRowCount: closeoutVerificationRows.length,

  postContinuationCompletionNextPlanningRowCount: planningRows.length,
  readyPostContinuationCompletionNextPlanningRowCount: readyRows.length,
  blockedPostContinuationCompletionNextPlanningRowCount: blockedRows.length,

  mainLanePostContinuationCompletionNextPlanningRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogPostContinuationCompletionNextPlanningRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairPostContinuationCompletionNextPlanningRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    cycleExitVerification.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    cycleExitVerification.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    cycleExitVerification.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    cycleExitVerification.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    cycleExitVerification.summary.postSixLeagueNextCycleContinuationCompletionCycleClosedCount,

  postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount:
    cycleExitVerification.summary.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitedCount:
    cycleExitVerification.summary.postSixLeagueNextCycleContinuationCompletionCycleExitedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount:
    cycleExitVerification.summary.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount,

  mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateCount:
    blockedRows.length === 0 ? 1 : 0,

  postContinuationCompletionNextPlanningIsExecutionPermissionNowCount: 0,
  postContinuationCompletionNextPlanningIsFetchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningIsSearchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningIsBroadSearchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningIsClassifierPermissionNowCount: 0,
  postContinuationCompletionNextPlanningIsCanonicalWritePermissionNowCount: 0,
  postContinuationCompletionNextPlanningIsProductionWritePermissionNowCount: 0,
  postContinuationCompletionNextPlanningIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-post-continuation-completion-next-planning-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_post_continuation_completion_next_planning_artifact",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionCycleExitVerification: cycleExitVerificationPath,
    postSixLeagueNextCycleContinuationCompletionCycleExitArtifact: cycleExitPath,
    postSixLeagueNextCycleContinuationCompletionCloseoutVerification: closeoutVerificationPath
  },
  policy: {
    postContinuationCompletionNextPlanningOnly: true,
    nextPlanningQualityGateRequiredBeforeAnyNewRunnerManifest: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  planningRows,
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
  throw new Error(`Post-continuation-completion next planning blocked ${blockedRows.length} rows`);
}
