import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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

const closeoutPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-artifact-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-verification-2026-06-15.json"
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

function validateCycleExit(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionCycleExitArtifactReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionCycleExitArtifactReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionCycleExitArtifactReadCount}`);
  }
  if (s.sourceContinuationCompletionCloseoutVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCloseoutVerificationRowCount=5, got ${s.sourceContinuationCompletionCloseoutVerificationRowCount}`);
  if (s.sourceContinuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCloseoutRowCount=5, got ${s.sourceContinuationCompletionCloseoutRowCount}`);
  if (s.sourceContinuationCompletionExecutionVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionVerificationRowCount=5, got ${s.sourceContinuationCompletionExecutionVerificationRowCount}`);
  if (s.continuationCompletionCycleExitRowCount !== 5) throw new Error(`Expected continuationCompletionCycleExitRowCount=5, got ${s.continuationCompletionCycleExitRowCount}`);
  if (s.exitedContinuationCompletionCycleRowCount !== 5) throw new Error(`Expected exitedContinuationCompletionCycleRowCount=5, got ${s.exitedContinuationCompletionCycleRowCount}`);
  if (s.blockedContinuationCompletionCycleExitCount !== 0) throw new Error(`Expected blockedContinuationCompletionCycleExitCount=0, got ${s.blockedContinuationCompletionCycleExitCount}`);
  if (s.exitedMainLaneContinuationCompletionCycleCount !== 4) throw new Error(`Expected exitedMainLaneContinuationCompletionCycleCount=4, got ${s.exitedMainLaneContinuationCompletionCycleCount}`);
  if (s.exitedRepairBacklogContinuationCompletionCycleCount !== 1) throw new Error(`Expected exitedRepairBacklogContinuationCompletionCycleCount=1, got ${s.exitedRepairBacklogContinuationCompletionCycleCount}`);
  if (s.exitedSportomediaRepairContinuationCompletionCycleCount !== 1) throw new Error(`Expected exitedSportomediaRepairContinuationCompletionCycleCount=1, got ${s.exitedSportomediaRepairContinuationCompletionCycleCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount}`);
  if (s.postSixLeagueNextCycleContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleClosedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCycleExitVerificationGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCycleExitVerificationGateCount=1");
  }

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
  if (s.postSixLeagueNextCycleContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleClosedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCycleExitArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCycleExitArtifactCount=1");
  }

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

function validateCloseout(input) {
  const s = input.summary || {};

  if (s.continuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected continuationCompletionCloseoutRowCount=5, got ${s.continuationCompletionCloseoutRowCount}`);
  if (s.closedContinuationCompletionRowCount !== 5) throw new Error(`Expected closedContinuationCompletionRowCount=5, got ${s.closedContinuationCompletionRowCount}`);
  if (s.blockedContinuationCompletionCloseoutCount !== 0) throw new Error(`Expected blockedContinuationCompletionCloseoutCount=0, got ${s.blockedContinuationCompletionCloseoutCount}`);
  if (s.postSixLeagueNextCycleContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleClosedCount=1");

  [
    "closeoutIsExecutionPermissionNowCount",
    "closeoutIsFetchPermissionNowCount",
    "closeoutIsSearchPermissionNowCount",
    "closeoutIsBroadSearchPermissionNowCount",
    "closeoutIsClassifierPermissionNowCount",
    "closeoutIsCanonicalWritePermissionNowCount",
    "closeoutIsProductionWritePermissionNowCount",
    "closeoutIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `closeout.summary.${key}`));

  assertFalse(input.productionWrite, "closeout.productionWrite");
  assertFalse(input.sourceFetch?.executed, "closeout.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "closeout.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "closeout.broadSearchUsed");
  assertFalse(input.classifierExecuted, "closeout.classifierExecuted");
}

function validateCycleExitRow(row) {
  const failures = [];

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

  if (row.cycleExitStatus !== "exited_post_six_league_next_cycle_continuation_completion_cycle") {
    failures.push(`unexpected_cycle_exit_status:${row.cycleExitStatus}`);
  }

  if (row.cycleExitReason !== "verified_closeout_completed_no_fetch_no_search_no_write_no_truth_assertion") {
    failures.push(`unexpected_cycle_exit_reason:${row.cycleExitReason}`);
  }

  if (row.eligibleForPostContinuationCompletionNextPlanning !== true) {
    failures.push("eligible_for_post_continuation_completion_next_planning_not_true");
  }

  if (row.eligibleForNewPlanningLayer !== true) {
    failures.push("eligible_for_new_planning_layer_not_true");
  }

  [
    "cycleExitIsExecutionPermissionNow",
    "cycleExitIsFetchPermissionNow",
    "cycleExitIsSearchPermissionNow",
    "cycleExitIsBroadSearchPermissionNow",
    "cycleExitIsClassifierPermissionNow",
    "cycleExitIsCanonicalWritePermissionNow",
    "cycleExitIsProductionWritePermissionNow",
    "cycleExitIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`cycle_exit_guardrail_not_false:${key}`);
  });

  return failures;
}

const cycleExit = readJson(cycleExitPath);
const closeoutVerification = readJson(closeoutVerificationPath);
const closeout = readJson(closeoutPath);

validateCycleExit(cycleExit);
validateCloseoutVerification(closeoutVerification);
validateCloseout(closeout);

const cycleExitRows = Array.isArray(cycleExit.cycleExitRows) ? cycleExit.cycleExitRows : [];
const closeoutVerificationRows = Array.isArray(closeoutVerification.closeoutVerificationRows)
  ? closeoutVerification.closeoutVerificationRows
  : [];
const closeoutRows = Array.isArray(closeout.closeoutRows) ? closeout.closeoutRows : [];

if (cycleExitRows.length !== 5) throw new Error(`Expected 5 cycle-exit rows, got ${cycleExitRows.length}`);
if (closeoutVerificationRows.length !== 5) throw new Error(`Expected 5 closeout verification rows, got ${closeoutVerificationRows.length}`);
if (closeoutRows.length !== 5) throw new Error(`Expected 5 closeout rows, got ${closeoutRows.length}`);

const cycleExitVerificationRows = cycleExitRows.map((row, index) => {
  const failures = validateCycleExitRow(row);

  return {
    postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId: `post_six_league_next_cycle_continuation_completion_cycle_exit_verification_${String(index + 1).padStart(2, "0")}`,
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

    cycleExitVerificationStatus:
      failures.length === 0
        ? "verified_exited_post_six_league_next_cycle_continuation_completion_cycle"
        : "blocked_post_six_league_next_cycle_continuation_completion_cycle_exit_verification",
    failures,
    verifiedCycleExitReason: row.cycleExitReason,
    verifiedEligibleForPostContinuationCompletionNextPlanning: row.eligibleForPostContinuationCompletionNextPlanning === true,
    verifiedEligibleForNewPlanningLayer: row.eligibleForNewPlanningLayer === true,

    cycleExitVerificationIsExecutionPermissionNow: false,
    cycleExitVerificationIsFetchPermissionNow: false,
    cycleExitVerificationIsSearchPermissionNow: false,
    cycleExitVerificationIsBroadSearchPermissionNow: false,
    cycleExitVerificationIsClassifierPermissionNow: false,
    cycleExitVerificationIsCanonicalWritePermissionNow: false,
    cycleExitVerificationIsProductionWritePermissionNow: false,
    cycleExitVerificationIsTruthAssertionPermissionNow: false
  };
});

const verifiedRows = cycleExitVerificationRows.filter(
  (row) => row.cycleExitVerificationStatus === "verified_exited_post_six_league_next_cycle_continuation_completion_cycle"
);

const blockedRows = cycleExitVerificationRows.filter(
  (row) => row.cycleExitVerificationStatus !== "verified_exited_post_six_league_next_cycle_continuation_completion_cycle"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionCycleExitVerificationReadCount: 3,
  sourceContinuationCompletionCycleExitRowCount: cycleExitRows.length,
  sourceContinuationCompletionCloseoutVerificationRowCount: closeoutVerificationRows.length,
  sourceContinuationCompletionCloseoutRowCount: closeoutRows.length,

  cycleExitVerificationRowCount: cycleExitVerificationRows.length,
  verifiedContinuationCompletionCycleExitRowCount: verifiedRows.length,
  blockedContinuationCompletionCycleExitVerificationCount: blockedRows.length,

  verifiedMainLaneContinuationCompletionCycleExitCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  verifiedRepairBacklogContinuationCompletionCycleExitCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  verifiedSportomediaRepairContinuationCompletionCycleExitCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    cycleExit.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    cycleExit.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    cycleExit.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    cycleExit.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    cycleExit.summary.postSixLeagueNextCycleContinuationCompletionCycleClosedCount,

  postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount:
    cycleExit.summary.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitedCount:
    cycleExit.summary.postSixLeagueNextCycleContinuationCompletionCycleExitedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount:
    blockedRows.length === 0 ? 1 : 0,

  mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactCount:
    blockedRows.length === 0 ? 1 : 0,

  cycleExitVerificationIsExecutionPermissionNowCount: 0,
  cycleExitVerificationIsFetchPermissionNowCount: 0,
  cycleExitVerificationIsSearchPermissionNowCount: 0,
  cycleExitVerificationIsBroadSearchPermissionNowCount: 0,
  cycleExitVerificationIsClassifierPermissionNowCount: 0,
  cycleExitVerificationIsCanonicalWritePermissionNowCount: 0,
  cycleExitVerificationIsProductionWritePermissionNowCount: 0,
  cycleExitVerificationIsTruthAssertionPermissionNowCount: 0,

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
  job: "verify-football-truth-post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_cycle_exit_verification_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionCycleExitArtifact: cycleExitPath,
    postSixLeagueNextCycleContinuationCompletionCloseoutVerification: closeoutVerificationPath,
    postSixLeagueNextCycleContinuationCompletionCloseoutArtifact: closeoutPath
  },
  policy: {
    cycleExitVerificationOnly: true,
    verifyContinuationCompletionCycleExit: true,
    nextPlanningArtifactRequiredBeforeAnyNewExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  cycleExitVerificationRows,
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
  throw new Error(`Next-cycle continuation-completion cycle-exit verification blocked ${blockedRows.length} rows`);
}
