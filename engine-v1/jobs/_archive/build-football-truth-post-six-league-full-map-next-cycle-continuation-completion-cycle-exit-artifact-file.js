import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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

const executionVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-verification-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-artifact-2026-06-15.json"
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

function validateCloseoutVerification(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionCloseoutVerificationReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionCloseoutVerificationReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionCloseoutVerificationReadCount}`);
  }
  if (s.sourceContinuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCloseoutRowCount=5, got ${s.sourceContinuationCompletionCloseoutRowCount}`);
  if (s.sourceContinuationCompletionExecutionVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionVerificationRowCount=5, got ${s.sourceContinuationCompletionExecutionVerificationRowCount}`);
  if (s.sourceContinuationCompletionExecutionRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionRowCount=5, got ${s.sourceContinuationCompletionExecutionRowCount}`);
  if (s.closeoutVerificationRowCount !== 5) throw new Error(`Expected closeoutVerificationRowCount=5, got ${s.closeoutVerificationRowCount}`);
  if (s.verifiedContinuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected verifiedContinuationCompletionCloseoutRowCount=5, got ${s.verifiedContinuationCompletionCloseoutRowCount}`);
  if (s.blockedContinuationCompletionCloseoutVerificationCount !== 0) throw new Error(`Expected blockedContinuationCompletionCloseoutVerificationCount=0, got ${s.blockedContinuationCompletionCloseoutVerificationCount}`);
  if (s.verifiedMainLaneContinuationCompletionCloseoutCount !== 4) throw new Error(`Expected verifiedMainLaneContinuationCompletionCloseoutCount=4, got ${s.verifiedMainLaneContinuationCompletionCloseoutCount}`);
  if (s.verifiedRepairBacklogContinuationCompletionCloseoutCount !== 1) throw new Error(`Expected verifiedRepairBacklogContinuationCompletionCloseoutCount=1, got ${s.verifiedRepairBacklogContinuationCompletionCloseoutCount}`);
  if (s.verifiedSportomediaRepairContinuationCompletionCloseoutCount !== 1) throw new Error(`Expected verifiedSportomediaRepairContinuationCompletionCloseoutCount=1, got ${s.verifiedSportomediaRepairContinuationCompletionCloseoutCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount}`);
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

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactReadCount}`);
  }
  if (s.continuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected continuationCompletionCloseoutRowCount=5, got ${s.continuationCompletionCloseoutRowCount}`);
  if (s.closedContinuationCompletionRowCount !== 5) throw new Error(`Expected closedContinuationCompletionRowCount=5, got ${s.closedContinuationCompletionRowCount}`);
  if (s.blockedContinuationCompletionCloseoutCount !== 0) throw new Error(`Expected blockedContinuationCompletionCloseoutCount=0, got ${s.blockedContinuationCompletionCloseoutCount}`);
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

function validateExecutionVerification(input) {
  const s = input.summary || {};

  if (s.verifiedContinuationCompletionExecutionRowCount !== 5) throw new Error(`Expected verifiedContinuationCompletionExecutionRowCount=5, got ${s.verifiedContinuationCompletionExecutionRowCount}`);
  if (s.blockedContinuationCompletionExecutionVerificationCount !== 0) throw new Error(`Expected blockedContinuationCompletionExecutionVerificationCount=0, got ${s.blockedContinuationCompletionExecutionVerificationCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount !== 5) {
    throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount}`);
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
  ].forEach((key) => assertZero(s[key], `executionVerification.summary.${key}`));

  assertFalse(input.productionWrite, "executionVerification.productionWrite");
  assertFalse(input.sourceFetch?.executed, "executionVerification.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "executionVerification.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "executionVerification.broadSearchUsed");
  assertFalse(input.classifierExecuted, "executionVerification.classifierExecuted");
}

function validateCloseoutVerificationRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId) failures.push("missing_closeout_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutRowId) failures.push("missing_closeout_row_id");
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

  if (row.closeoutVerificationStatus !== "verified_closed_post_six_league_next_cycle_continuation_completion") {
    failures.push(`unexpected_closeout_verification_status:${row.closeoutVerificationStatus}`);
  }

  if (row.verifiedClosedDiagnosticsOnlyContinuationCompletionExecution !== true) {
    failures.push("verified_closed_diagnostics_only_marker_not_true");
  }

  if (row.noFetchVerified !== true) failures.push("no_fetch_not_verified");
  if (row.noSearchVerified !== true) failures.push("no_search_not_verified");
  if (row.noWriteVerified !== true) failures.push("no_write_not_verified");
  if (row.noTruthAssertionVerified !== true) failures.push("no_truth_assertion_not_verified");

  [
    "closeoutVerificationIsExecutionPermissionNow",
    "closeoutVerificationIsFetchPermissionNow",
    "closeoutVerificationIsSearchPermissionNow",
    "closeoutVerificationIsBroadSearchPermissionNow",
    "closeoutVerificationIsClassifierPermissionNow",
    "closeoutVerificationIsCanonicalWritePermissionNow",
    "closeoutVerificationIsProductionWritePermissionNow",
    "closeoutVerificationIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`closeout_verification_guardrail_not_false:${key}`);
  });

  return failures;
}

const closeoutVerification = readJson(closeoutVerificationPath);
const closeout = readJson(closeoutPath);
const executionVerification = readJson(executionVerificationPath);

validateCloseoutVerification(closeoutVerification);
validateCloseout(closeout);
validateExecutionVerification(executionVerification);

const closeoutVerificationRows = Array.isArray(closeoutVerification.closeoutVerificationRows)
  ? closeoutVerification.closeoutVerificationRows
  : [];

const closeoutRows = Array.isArray(closeout.closeoutRows) ? closeout.closeoutRows : [];
const executionVerificationRows = Array.isArray(executionVerification.verificationRows)
  ? executionVerification.verificationRows
  : [];

if (closeoutVerificationRows.length !== 5) throw new Error(`Expected 5 closeout verification rows, got ${closeoutVerificationRows.length}`);
if (closeoutRows.length !== 5) throw new Error(`Expected 5 closeout rows, got ${closeoutRows.length}`);
if (executionVerificationRows.length !== 5) throw new Error(`Expected 5 execution verification rows, got ${executionVerificationRows.length}`);

const cycleExitRows = closeoutVerificationRows.map((row, index) => {
  const failures = validateCloseoutVerificationRow(row);

  return {
    postSixLeagueNextCycleContinuationCompletionCycleExitRowId: `post_six_league_next_cycle_continuation_completion_cycle_exit_${String(index + 1).padStart(2, "0")}`,
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

    cycleExitStatus:
      failures.length === 0
        ? "exited_post_six_league_next_cycle_continuation_completion_cycle"
        : "blocked_post_six_league_next_cycle_continuation_completion_cycle_exit",
    failures,
    cycleExitReason: "verified_closeout_completed_no_fetch_no_search_no_write_no_truth_assertion",
    eligibleForPostContinuationCompletionNextPlanning: failures.length === 0,
    eligibleForNewPlanningLayer: failures.length === 0,

    cycleExitIsExecutionPermissionNow: false,
    cycleExitIsFetchPermissionNow: false,
    cycleExitIsSearchPermissionNow: false,
    cycleExitIsBroadSearchPermissionNow: false,
    cycleExitIsClassifierPermissionNow: false,
    cycleExitIsCanonicalWritePermissionNow: false,
    cycleExitIsProductionWritePermissionNow: false,
    cycleExitIsTruthAssertionPermissionNow: false
  };
});

const exitedRows = cycleExitRows.filter(
  (row) => row.cycleExitStatus === "exited_post_six_league_next_cycle_continuation_completion_cycle"
);

const blockedRows = cycleExitRows.filter(
  (row) => row.cycleExitStatus !== "exited_post_six_league_next_cycle_continuation_completion_cycle"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionCycleExitArtifactReadCount: 3,
  sourceContinuationCompletionCloseoutVerificationRowCount: closeoutVerificationRows.length,
  sourceContinuationCompletionCloseoutRowCount: closeoutRows.length,
  sourceContinuationCompletionExecutionVerificationRowCount: executionVerificationRows.length,

  continuationCompletionCycleExitRowCount: cycleExitRows.length,
  exitedContinuationCompletionCycleRowCount: exitedRows.length,
  blockedContinuationCompletionCycleExitCount: blockedRows.length,

  exitedMainLaneContinuationCompletionCycleCount: countWhere(
    exitedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  exitedRepairBacklogContinuationCompletionCycleCount: countWhere(
    exitedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  exitedSportomediaRepairContinuationCompletionCycleCount: countWhere(
    exitedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    closeoutVerification.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    closeoutVerification.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    closeoutVerification.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    closeoutVerification.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    closeoutVerification.summary.postSixLeagueNextCycleContinuationCompletionCycleClosedCount,

  postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount:
    closeoutVerification.summary.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitedCount:
    blockedRows.length === 0 ? 1 : 0,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCycleExitVerificationGateCount:
    blockedRows.length === 0 ? 1 : 0,

  cycleExitIsExecutionPermissionNowCount: 0,
  cycleExitIsFetchPermissionNowCount: 0,
  cycleExitIsSearchPermissionNowCount: 0,
  cycleExitIsBroadSearchPermissionNowCount: 0,
  cycleExitIsClassifierPermissionNowCount: 0,
  cycleExitIsCanonicalWritePermissionNowCount: 0,
  cycleExitIsProductionWritePermissionNowCount: 0,
  cycleExitIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_cycle_exit_artifact",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionCloseoutVerification: closeoutVerificationPath,
    postSixLeagueNextCycleContinuationCompletionCloseoutArtifact: closeoutPath,
    postSixLeagueNextCycleContinuationCompletionExecutionVerification: executionVerificationPath
  },
  policy: {
    cycleExitArtifactOnly: true,
    cycleExitVerificationGateRequiredBeforeNewPlanningLayer: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  cycleExitRows,
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
  throw new Error(`Next-cycle continuation-completion cycle exit blocked ${blockedRows.length} rows`);
}
