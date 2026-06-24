import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-verification-2026-06-15",
  "post-six-league-full-map-continuation-completion-execution-verification-2026-06-15.json"
);

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-runner-2026-06-15",
  "post-six-league-full-map-continuation-completion-execution-runner-2026-06-15.json"
);

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-continuation-completion-execution-approval-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-closeout-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-completion-closeout-artifact-2026-06-15.json"
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

  if (s.sourceCompletionExecutionRowCount !== 5) throw new Error(`Expected sourceCompletionExecutionRowCount=5, got ${s.sourceCompletionExecutionRowCount}`);
  if (s.verificationRowCount !== 5) throw new Error(`Expected verificationRowCount=5, got ${s.verificationRowCount}`);
  if (s.verifiedCompletionExecutionRowCount !== 5) throw new Error(`Expected verifiedCompletionExecutionRowCount=5, got ${s.verifiedCompletionExecutionRowCount}`);
  if (s.blockedCompletionExecutionVerificationCount !== 0) throw new Error(`Expected blockedCompletionExecutionVerificationCount=0, got ${s.blockedCompletionExecutionVerificationCount}`);
  if (s.verifiedMainLaneCompletionExecutionCount !== 4) throw new Error(`Expected verifiedMainLaneCompletionExecutionCount=4, got ${s.verifiedMainLaneCompletionExecutionCount}`);
  if (s.verifiedRepairBacklogCompletionExecutionCount !== 1) throw new Error(`Expected verifiedRepairBacklogCompletionExecutionCount=1, got ${s.verifiedRepairBacklogCompletionExecutionCount}`);
  if (s.verifiedSportomediaRepairCompletionExecutionCount !== 1) throw new Error(`Expected verifiedSportomediaRepairCompletionExecutionCount=1, got ${s.verifiedSportomediaRepairCompletionExecutionCount}`);
  if (s.diagnosticsOnlyCompletionExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyCompletionExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionCloseoutArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionCloseoutArtifactCount=1");
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

  if (s.allowExecuteFlagPresent !== true) throw new Error("Expected allowExecuteFlagPresent=true");
  if (s.completionExecutionRowCount !== 5) throw new Error(`Expected completionExecutionRowCount=5, got ${s.completionExecutionRowCount}`);
  if (s.executedCompletionTargetCount !== 5) throw new Error(`Expected executedCompletionTargetCount=5, got ${s.executedCompletionTargetCount}`);
  if (s.mainLaneCompletionExecutedCount !== 4) throw new Error(`Expected mainLaneCompletionExecutedCount=4, got ${s.mainLaneCompletionExecutedCount}`);
  if (s.repairBacklogCompletionExecutedCount !== 1) throw new Error(`Expected repairBacklogCompletionExecutedCount=1, got ${s.repairBacklogCompletionExecutedCount}`);
  if (s.sportomediaRepairCompletionExecutedCount !== 1) throw new Error(`Expected sportomediaRepairCompletionExecutedCount=1, got ${s.sportomediaRepairCompletionExecutedCount}`);
  if (s.diagnosticsOnlyCompletionExecutionTraceCount !== 5) throw new Error(`Expected diagnosticsOnlyCompletionExecutionTraceCount=5, got ${s.diagnosticsOnlyCompletionExecutionTraceCount}`);

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

function validateApproval(input) {
  const s = input.summary || {};

  if (s.continuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected continuationCompletionExecutionApprovalRowCount=5, got ${s.continuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedContinuationCompletionExecutionApprovalRowCount=5, got ${s.approvedContinuationCompletionExecutionApprovalRowCount}`);
  if (s.blockedContinuationCompletionExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedContinuationCompletionExecutionApprovalRowCount=0, got ${s.blockedContinuationCompletionExecutionApprovalRowCount}`);
  if (s.nextRunnerMayExecuteCompletionCount !== 5) throw new Error(`Expected nextRunnerMayExecuteCompletionCount=5, got ${s.nextRunnerMayExecuteCompletionCount}`);

  [
    "nextRunnerMayFetchCount",
    "nextRunnerMaySearchCount",
    "nextRunnerMayBroadSearchCount",
    "nextRunnerMayClassifyCount",
    "nextRunnerMayWriteCanonicalCount",
    "nextRunnerMayWriteProductionCount",
    "nextRunnerMayAssertTruthCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `approval.summary.${key}`));

  assertFalse(input.productionWrite, "approval.productionWrite");
}

function validateVerificationRow(row) {
  const failures = [];

  if (!row.continuationCompletionExecutionVerificationRowId) failures.push("missing_completion_execution_verification_row_id");
  if (!row.continuationCompletionExecutionRowId) failures.push("missing_completion_execution_row_id");
  if (!row.continuationCompletionExecutionApprovalRowId) failures.push("missing_completion_execution_approval_row_id");
  if (!row.continuationCompletionRunnerTargetId) failures.push("missing_completion_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.completionRouteFamily) failures.push("missing_completion_route_family");
  if (!row.completionRunnerGroup) failures.push("missing_completion_runner_group");

  if (row.verificationStatus !== "verified_diagnostics_only_completion_execution") {
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
const approval = readJson(approvalPath);

validateVerification(verification);
validateExecutionRunner(executionRunner);
validateApproval(approval);

const verificationRows = Array.isArray(verification.verificationRows) ? verification.verificationRows : [];
const executionRows = Array.isArray(executionRunner.executionRows) ? executionRunner.executionRows : [];
const approvalRows = Array.isArray(approval.approvalRows) ? approval.approvalRows : [];

if (verificationRows.length !== 5) throw new Error(`Expected 5 verification rows, got ${verificationRows.length}`);
if (executionRows.length !== 5) throw new Error(`Expected 5 execution rows, got ${executionRows.length}`);
if (approvalRows.length !== 5) throw new Error(`Expected 5 approval rows, got ${approvalRows.length}`);

const closeoutRows = verificationRows.map((row, index) => {
  const failures = validateVerificationRow(row);

  return {
    continuationCompletionCloseoutRowId: `post_six_league_completion_closeout_${String(index + 1).padStart(2, "0")}`,
    continuationCompletionExecutionVerificationRowId: row.continuationCompletionExecutionVerificationRowId,
    continuationCompletionExecutionRowId: row.continuationCompletionExecutionRowId,
    continuationCompletionExecutionApprovalRowId: row.continuationCompletionExecutionApprovalRowId,
    continuationCompletionRunnerTargetId: row.continuationCompletionRunnerTargetId,
    continuationCompletionActionPackQualityGateRowId: row.continuationCompletionActionPackQualityGateRowId,
    continuationCompletionActionPackRowId: row.continuationCompletionActionPackRowId,
    continuationCompletionRoutingRowId: row.continuationCompletionRoutingRowId,
    continuationExecutionVerificationRowId: row.continuationExecutionVerificationRowId,
    continuationExecutionRowId: row.continuationExecutionRowId,
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
    completionRunnerGroup: row.completionRunnerGroup,
    closeoutStatus:
      failures.length === 0
        ? "closed_verified_diagnostics_only_post_six_league_completion_lane"
        : "blocked_post_six_league_completion_closeout",
    failures,
    laneClosedForCurrentPostSixLeagueContinuationCycle: failures.length === 0,

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
  (row) => row.closeoutStatus === "closed_verified_diagnostics_only_post_six_league_completion_lane"
);

const blockedRows = closeoutRows.filter(
  (row) => row.closeoutStatus !== "closed_verified_diagnostics_only_post_six_league_completion_lane"
);

const summary = {
  postSixLeagueFullMapContinuationCompletionCloseoutArtifactReadCount: 3,
  sourceCompletionExecutionVerificationRowCount: verificationRows.length,
  sourceCompletionExecutionRowCount: executionRows.length,
  sourceCompletionExecutionApprovalRowCount: approvalRows.length,

  continuationCompletionCloseoutRowCount: closeoutRows.length,
  closedContinuationCompletionCloseoutRowCount: closedRows.length,
  blockedContinuationCompletionCloseoutRowCount: blockedRows.length,

  closedMainLaneCompletionCount: countWhere(
    closedRows,
    (row) => row.completionRouteFamily === "whole_map_main_lane_completion"
  ),
  closedRepairBacklogCompletionCount: countWhere(
    closedRows,
    (row) => row.completionRouteFamily === "repair_backlog_completion"
  ),
  closedSportomediaRepairCompletionCount: countWhere(
    closedRows,
    (row) => row.providerFamily === "sportomedia" && row.completionRouteFamily === "repair_backlog_completion"
  ),

  diagnosticsOnlyCompletionExecutionVerifiedCount:
    verification.summary.diagnosticsOnlyCompletionExecutionVerifiedCount,

  postSixLeagueContinuationCompletionCycleClosedCount:
    blockedRows.length === 0 ? 1 : 0,

  mayBuildPostSixLeagueFullMapNextCycleRoutingArtifactCount:
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
  job: "build-football-truth-post-six-league-full-map-continuation-completion-closeout-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_completion_closeout_artifact",
  dryRun: true,
  inputs: {
    postSixLeagueCompletionExecutionVerification: verificationPath,
    postSixLeagueCompletionExecutionRunner: executionRunnerPath,
    postSixLeagueCompletionExecutionApprovalGate: approvalPath
  },
  policy: {
    closeoutOnly: true,
    nextCycleRoutingArtifactRequiredBeforeAnyFurtherExecution: true,
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
  throw new Error(`Completion closeout blocked ${blockedRows.length} rows`);
}
