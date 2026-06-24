import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const closeoutPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-artifact-2026-06-15.json"
);

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-verification-2026-06-15.json"
);

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-runner-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-runner-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-verification-2026-06-15.json"
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

function validateCloseout(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactReadCount}`);
  }
  if (s.sourceContinuationCompletionExecutionVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionVerificationRowCount=5, got ${s.sourceContinuationCompletionExecutionVerificationRowCount}`);
  if (s.sourceContinuationCompletionExecutionRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionRowCount=5, got ${s.sourceContinuationCompletionExecutionRowCount}`);
  if (s.sourceContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionApprovalRowCount=5, got ${s.sourceContinuationCompletionExecutionApprovalRowCount}`);
  if (s.continuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected continuationCompletionCloseoutRowCount=5, got ${s.continuationCompletionCloseoutRowCount}`);
  if (s.closedContinuationCompletionRowCount !== 5) throw new Error(`Expected closedContinuationCompletionRowCount=5, got ${s.closedContinuationCompletionRowCount}`);
  if (s.blockedContinuationCompletionCloseoutCount !== 0) throw new Error(`Expected blockedContinuationCompletionCloseoutCount=0, got ${s.blockedContinuationCompletionCloseoutCount}`);
  if (s.closedMainLaneContinuationCompletionCount !== 4) throw new Error(`Expected closedMainLaneContinuationCompletionCount=4, got ${s.closedMainLaneContinuationCompletionCount}`);
  if (s.closedRepairBacklogContinuationCompletionCount !== 1) throw new Error(`Expected closedRepairBacklogContinuationCompletionCount=1, got ${s.closedRepairBacklogContinuationCompletionCount}`);
  if (s.closedSportomediaRepairContinuationCompletionCount !== 1) throw new Error(`Expected closedSportomediaRepairContinuationCompletionCount=1, got ${s.closedSportomediaRepairContinuationCompletionCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount}`);
  if (s.postSixLeagueNextCycleContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCloseoutVerificationGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCloseoutVerificationGateCount=1");
  }

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

function validateVerification(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionExecutionVerificationReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionExecutionVerificationReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionExecutionVerificationReadCount}`);
  }
  if (s.sourceContinuationCompletionExecutionRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionRowCount=5, got ${s.sourceContinuationCompletionExecutionRowCount}`);
  if (s.sourceContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionApprovalRowCount=5, got ${s.sourceContinuationCompletionExecutionApprovalRowCount}`);
  if (s.sourceContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected sourceContinuationCompletionRunnerTargetCount=5, got ${s.sourceContinuationCompletionRunnerTargetCount}`);
  if (s.verificationRowCount !== 5) throw new Error(`Expected verificationRowCount=5, got ${s.verificationRowCount}`);
  if (s.verifiedContinuationCompletionExecutionRowCount !== 5) throw new Error(`Expected verifiedContinuationCompletionExecutionRowCount=5, got ${s.verifiedContinuationCompletionExecutionRowCount}`);
  if (s.blockedContinuationCompletionExecutionVerificationCount !== 0) throw new Error(`Expected blockedContinuationCompletionExecutionVerificationCount=0, got ${s.blockedContinuationCompletionExecutionVerificationCount}`);
  if (s.verifiedMainLaneContinuationCompletionExecutionCount !== 4) throw new Error(`Expected verifiedMainLaneContinuationCompletionExecutionCount=4, got ${s.verifiedMainLaneContinuationCompletionExecutionCount}`);
  if (s.verifiedRepairBacklogContinuationCompletionExecutionCount !== 1) throw new Error(`Expected verifiedRepairBacklogContinuationCompletionExecutionCount=1, got ${s.verifiedRepairBacklogContinuationCompletionExecutionCount}`);
  if (s.verifiedSportomediaRepairContinuationCompletionExecutionCount !== 1) throw new Error(`Expected verifiedSportomediaRepairContinuationCompletionExecutionCount=1, got ${s.verifiedSportomediaRepairContinuationCompletionExecutionCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount !== 5) {
    throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount}`);
  }
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactCount=1");
  }

  [
    "verificationIsExecutionPermissionNowCount",
    "verificationIsFetchPermissionNowCount",
    "verificationIsSearchPermissionNowCount",
    "verificationIsBroadSearchPermissionNowCount",
    "verificationIsClassifierPermissionNowCount",
    "verificationIsCanonicalWritePermissionNowCount",
    "verificationIsProductionWritePermissionNowCount",
    "verificationIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `verification.summary.${key}`));

  assertFalse(input.productionWrite, "verification.productionWrite");
  assertFalse(input.sourceFetch?.executed, "verification.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "verification.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "verification.broadSearchUsed");
  assertFalse(input.classifierExecuted, "verification.classifierExecuted");
}

function validateExecutionRunner(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionExecutionRunnerReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionExecutionRunnerReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionExecutionRunnerReadCount}`);
  }
  if (s.allowExecuteFlagPresent !== true) throw new Error("Expected allowExecuteFlagPresent=true");
  if (s.sourceNextCycleContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionExecutionApprovalRowCount=5, got ${s.sourceNextCycleContinuationCompletionExecutionApprovalRowCount}`);
  if (s.sourceNextCycleContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionRunnerTargetCount=5, got ${s.sourceNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.continuationCompletionExecutionRowCount !== 5) throw new Error(`Expected continuationCompletionExecutionRowCount=5, got ${s.continuationCompletionExecutionRowCount}`);
  if (s.executedContinuationCompletionTargetCount !== 5) throw new Error(`Expected executedContinuationCompletionTargetCount=5, got ${s.executedContinuationCompletionTargetCount}`);
  if (s.mainLaneContinuationCompletionExecutedCount !== 4) throw new Error(`Expected mainLaneContinuationCompletionExecutedCount=4, got ${s.mainLaneContinuationCompletionExecutedCount}`);
  if (s.repairBacklogContinuationCompletionExecutedCount !== 1) throw new Error(`Expected repairBacklogContinuationCompletionExecutedCount=1, got ${s.repairBacklogContinuationCompletionExecutedCount}`);
  if (s.sportomediaRepairContinuationCompletionExecutedCount !== 1) throw new Error(`Expected sportomediaRepairContinuationCompletionExecutedCount=1, got ${s.sportomediaRepairContinuationCompletionExecutedCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionTraceCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionTraceCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionTraceCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionVerificationGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionVerificationGateCount=1");
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
  ].forEach((key) => assertZero(s[key], `executionRunner.summary.${key}`));

  assertFalse(input.productionWrite, "executionRunner.productionWrite");
  assertFalse(input.sourceFetch?.executed, "executionRunner.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "executionRunner.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "executionRunner.broadSearchUsed");
  assertFalse(input.classifierExecuted, "executionRunner.classifierExecuted");
}

function validateCloseoutRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutRowId) failures.push("missing_completion_closeout_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId) failures.push("missing_completion_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionRowId) failures.push("missing_completion_execution_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId) failures.push("missing_completion_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionRunnerTargetId) failures.push("missing_completion_runner_target_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId) failures.push("missing_completion_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");

  if (row.closeoutStatus !== "closed_post_six_league_next_cycle_continuation_completion") {
    failures.push(`unexpected_closeout_status:${row.closeoutStatus}`);
  }

  if (row.closedDiagnosticsOnlyContinuationCompletionExecution !== true) {
    failures.push("closed_diagnostics_only_marker_not_true");
  }

  if (row.noFetchVerified !== true) failures.push("no_fetch_not_verified");
  if (row.noSearchVerified !== true) failures.push("no_search_not_verified");
  if (row.noWriteVerified !== true) failures.push("no_write_not_verified");
  if (row.noTruthAssertionVerified !== true) failures.push("no_truth_assertion_not_verified");

  [
    "closeoutIsExecutionPermissionNow",
    "closeoutIsFetchPermissionNow",
    "closeoutIsSearchPermissionNow",
    "closeoutIsBroadSearchPermissionNow",
    "closeoutIsClassifierPermissionNow",
    "closeoutIsCanonicalWritePermissionNow",
    "closeoutIsProductionWritePermissionNow",
    "closeoutIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`closeout_guardrail_not_false:${key}`);
  });

  return failures;
}

const closeout = readJson(closeoutPath);
const verification = readJson(verificationPath);
const executionRunner = readJson(executionRunnerPath);

validateCloseout(closeout);
validateVerification(verification);
validateExecutionRunner(executionRunner);

const closeoutRows = Array.isArray(closeout.closeoutRows) ? closeout.closeoutRows : [];
const verificationRows = Array.isArray(verification.verificationRows) ? verification.verificationRows : [];
const executionRows = Array.isArray(executionRunner.executionRows) ? executionRunner.executionRows : [];

if (closeoutRows.length !== 5) throw new Error(`Expected 5 closeout rows, got ${closeoutRows.length}`);
if (verificationRows.length !== 5) throw new Error(`Expected 5 continuation-completion verification rows, got ${verificationRows.length}`);
if (executionRows.length !== 5) throw new Error(`Expected 5 continuation-completion execution rows, got ${executionRows.length}`);

const closeoutVerificationRows = closeoutRows.map((row, index) => {
  const failures = validateCloseoutRow(row);

  return {
    postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId: `post_six_league_next_cycle_continuation_completion_closeout_verification_${String(index + 1).padStart(2, "0")}`,
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

    closeoutVerificationStatus:
      failures.length === 0
        ? "verified_closed_post_six_league_next_cycle_continuation_completion"
        : "blocked_post_six_league_next_cycle_continuation_completion_closeout_verification",
    failures,
    verifiedClosedDiagnosticsOnlyContinuationCompletionExecution: failures.length === 0,
    noFetchVerified: row.noFetchVerified === true,
    noSearchVerified: row.noSearchVerified === true,
    noWriteVerified: row.noWriteVerified === true,
    noTruthAssertionVerified: row.noTruthAssertionVerified === true,

    closeoutVerificationIsExecutionPermissionNow: false,
    closeoutVerificationIsFetchPermissionNow: false,
    closeoutVerificationIsSearchPermissionNow: false,
    closeoutVerificationIsBroadSearchPermissionNow: false,
    closeoutVerificationIsClassifierPermissionNow: false,
    closeoutVerificationIsCanonicalWritePermissionNow: false,
    closeoutVerificationIsProductionWritePermissionNow: false,
    closeoutVerificationIsTruthAssertionPermissionNow: false
  };
});

const verifiedRows = closeoutVerificationRows.filter(
  (row) => row.closeoutVerificationStatus === "verified_closed_post_six_league_next_cycle_continuation_completion"
);

const blockedRows = closeoutVerificationRows.filter(
  (row) => row.closeoutVerificationStatus !== "verified_closed_post_six_league_next_cycle_continuation_completion"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionCloseoutVerificationReadCount: 3,
  sourceContinuationCompletionCloseoutRowCount: closeoutRows.length,
  sourceContinuationCompletionExecutionVerificationRowCount: verificationRows.length,
  sourceContinuationCompletionExecutionRowCount: executionRows.length,

  closeoutVerificationRowCount: closeoutVerificationRows.length,
  verifiedContinuationCompletionCloseoutRowCount: verifiedRows.length,
  blockedContinuationCompletionCloseoutVerificationCount: blockedRows.length,

  verifiedMainLaneContinuationCompletionCloseoutCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  verifiedRepairBacklogContinuationCompletionCloseoutCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  verifiedSportomediaRepairContinuationCompletionCloseoutCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    closeout.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    closeout.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    closeout.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    closeout.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    closeout.summary.postSixLeagueNextCycleContinuationCompletionCycleClosedCount,

  postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount:
    blockedRows.length === 0 ? 1 : 0,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCycleExitArtifactCount:
    blockedRows.length === 0 ? 1 : 0,

  closeoutVerificationIsExecutionPermissionNowCount: 0,
  closeoutVerificationIsFetchPermissionNowCount: 0,
  closeoutVerificationIsSearchPermissionNowCount: 0,
  closeoutVerificationIsBroadSearchPermissionNowCount: 0,
  closeoutVerificationIsClassifierPermissionNowCount: 0,
  closeoutVerificationIsCanonicalWritePermissionNowCount: 0,
  closeoutVerificationIsProductionWritePermissionNowCount: 0,
  closeoutVerificationIsTruthAssertionPermissionNowCount: 0,

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
  job: "verify-football-truth-post-six-league-full-map-next-cycle-continuation-completion-closeout-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_closeout_verification_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionCloseoutArtifact: closeoutPath,
    postSixLeagueNextCycleContinuationCompletionExecutionVerification: verificationPath,
    postSixLeagueNextCycleContinuationCompletionExecutionRunner: executionRunnerPath
  },
  policy: {
    closeoutVerificationOnly: true,
    verifyContinuationCompletionCycleClosed: true,
    cycleExitArtifactRequiredBeforeLeavingContinuationCompletionCycle: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  closeoutVerificationRows,
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
  throw new Error(`Next-cycle continuation-completion closeout verification blocked ${blockedRows.length} rows`);
}
