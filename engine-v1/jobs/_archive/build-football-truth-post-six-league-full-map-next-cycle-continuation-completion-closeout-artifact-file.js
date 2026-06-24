import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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

const executionApprovalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-approval-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-closeout-artifact-2026-06-15.json"
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

function validateExecutionApproval(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateReadCount}`);
  }
  if (s.nextCycleContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected nextCycleContinuationCompletionExecutionApprovalRowCount=5, got ${s.nextCycleContinuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedNextCycleContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedNextCycleContinuationCompletionExecutionApprovalRowCount=5, got ${s.approvedNextCycleContinuationCompletionExecutionApprovalRowCount}`);
  if (s.blockedNextCycleContinuationCompletionExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedNextCycleContinuationCompletionExecutionApprovalRowCount=0, got ${s.blockedNextCycleContinuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedMainLaneNextCycleContinuationCompletionExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneNextCycleContinuationCompletionExecutionTargetCount=4, got ${s.approvedMainLaneNextCycleContinuationCompletionExecutionTargetCount}`);
  if (s.approvedRepairBacklogNextCycleContinuationCompletionExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogNextCycleContinuationCompletionExecutionTargetCount=1, got ${s.approvedRepairBacklogNextCycleContinuationCompletionExecutionTargetCount}`);
  if (s.approvedSportomediaRepairNextCycleContinuationCompletionExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairNextCycleContinuationCompletionExecutionTargetCount=1, got ${s.approvedSportomediaRepairNextCycleContinuationCompletionExecutionTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.nextRunnerMayExecuteContinuationCompletionCount !== 5) throw new Error(`Expected nextRunnerMayExecuteContinuationCompletionCount=5, got ${s.nextRunnerMayExecuteContinuationCompletionCount}`);

  [
    "nextRunnerMayFetchCount",
    "nextRunnerMaySearchCount",
    "nextRunnerMayBroadSearchCount",
    "nextRunnerMayClassifyCount",
    "nextRunnerMayWriteCanonicalCount",
    "nextRunnerMayWriteProductionCount",
    "nextRunnerMayAssertTruthCount",
    "executionApprovalIsExecutionPermissionNowCount",
    "executionApprovalIsFetchPermissionNowCount",
    "executionApprovalIsSearchPermissionNowCount",
    "executionApprovalIsBroadSearchPermissionNowCount",
    "executionApprovalIsClassifierPermissionNowCount",
    "executionApprovalIsCanonicalWritePermissionNowCount",
    "executionApprovalIsProductionWritePermissionNowCount",
    "executionApprovalIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `executionApproval.summary.${key}`));

  assertFalse(input.productionWrite, "executionApproval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "executionApproval.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "executionApproval.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "executionApproval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "executionApproval.classifierExecuted");
}

function validateVerificationRow(row) {
  const failures = [];

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
  if (!row.nextCycleContinuationCompletionRunnerGroup) failures.push("missing_next_cycle_continuation_completion_runner_group");

  if (row.verificationStatus !== "verified_diagnostics_only_next_cycle_continuation_completion_execution") {
    failures.push(`unexpected_verification_status:${row.verificationStatus}`);
  }

  if (row.noFetchVerified !== true) failures.push("no_fetch_not_verified");
  if (row.noSearchVerified !== true) failures.push("no_search_not_verified");
  if (row.noWriteVerified !== true) failures.push("no_write_not_verified");
  if (row.noTruthAssertionVerified !== true) failures.push("no_truth_assertion_not_verified");

  return failures;
}

const verification = readJson(verificationPath);
const executionRunner = readJson(executionRunnerPath);
const executionApproval = readJson(executionApprovalPath);

validateVerification(verification);
validateExecutionRunner(executionRunner);
validateExecutionApproval(executionApproval);

const verificationRows = Array.isArray(verification.verificationRows) ? verification.verificationRows : [];
const executionRows = Array.isArray(executionRunner.executionRows) ? executionRunner.executionRows : [];
const approvalRows = Array.isArray(executionApproval.approvalRows) ? executionApproval.approvalRows : [];

if (verificationRows.length !== 5) throw new Error(`Expected 5 continuation-completion verification rows, got ${verificationRows.length}`);
if (executionRows.length !== 5) throw new Error(`Expected 5 continuation-completion execution rows, got ${executionRows.length}`);
if (approvalRows.length !== 5) throw new Error(`Expected 5 continuation-completion approval rows, got ${approvalRows.length}`);

const closeoutRows = verificationRows.map((row, index) => {
  const failures = validateVerificationRow(row);

  return {
    postSixLeagueNextCycleContinuationCompletionCloseoutRowId: `post_six_league_next_cycle_continuation_completion_closeout_${String(index + 1).padStart(2, "0")}`,
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

    closeoutStatus:
      failures.length === 0
        ? "closed_post_six_league_next_cycle_continuation_completion"
        : "blocked_post_six_league_next_cycle_continuation_completion_closeout",
    failures,
    closedDiagnosticsOnlyContinuationCompletionExecution: failures.length === 0,
    noFetchVerified: row.noFetchVerified === true,
    noSearchVerified: row.noSearchVerified === true,
    noWriteVerified: row.noWriteVerified === true,
    noTruthAssertionVerified: row.noTruthAssertionVerified === true,

    closeoutIsExecutionPermissionNow: false,
    closeoutIsFetchPermissionNow: false,
    closeoutIsSearchPermissionNow: false,
    closeoutIsBroadSearchPermissionNow: false,
    closeoutIsClassifierPermissionNow: false,
    closeoutIsCanonicalWritePermissionNow: false,
    closeoutIsProductionWritePermissionNow: false,
    closeoutIsTruthAssertionPermissionNow: false
  };
});

const closedRows = closeoutRows.filter(
  (row) => row.closeoutStatus === "closed_post_six_league_next_cycle_continuation_completion"
);

const blockedRows = closeoutRows.filter(
  (row) => row.closeoutStatus !== "closed_post_six_league_next_cycle_continuation_completion"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactReadCount: 3,
  sourceContinuationCompletionExecutionVerificationRowCount: verificationRows.length,
  sourceContinuationCompletionExecutionRowCount: executionRows.length,
  sourceContinuationCompletionExecutionApprovalRowCount: approvalRows.length,

  continuationCompletionCloseoutRowCount: closeoutRows.length,
  closedContinuationCompletionRowCount: closedRows.length,
  blockedContinuationCompletionCloseoutCount: blockedRows.length,

  closedMainLaneContinuationCompletionCount: countWhere(
    closedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  closedRepairBacklogContinuationCompletionCount: countWhere(
    closedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  closedSportomediaRepairContinuationCompletionCount: countWhere(
    closedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    verification.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    verification.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    verification.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    verification.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    blockedRows.length === 0 ? 1 : 0,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCloseoutVerificationGateCount:
    blockedRows.length === 0 ? 1 : 0,

  closeoutIsExecutionPermissionNowCount: 0,
  closeoutIsFetchPermissionNowCount: 0,
  closeoutIsSearchPermissionNowCount: 0,
  closeoutIsBroadSearchPermissionNowCount: 0,
  closeoutIsClassifierPermissionNowCount: 0,
  closeoutIsCanonicalWritePermissionNowCount: 0,
  closeoutIsProductionWritePermissionNowCount: 0,
  closeoutIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-continuation-completion-closeout-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_closeout_artifact",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionExecutionVerification: verificationPath,
    postSixLeagueNextCycleContinuationCompletionExecutionRunner: executionRunnerPath,
    postSixLeagueNextCycleContinuationCompletionExecutionApprovalGate: executionApprovalPath
  },
  policy: {
    closeoutArtifactOnly: true,
    closeoutVerificationGateRequiredBeforeLeavingContinuationCompletionCycle: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  closeoutRows,
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
  throw new Error(`Next-cycle continuation-completion closeout blocked ${blockedRows.length} rows`);
}
