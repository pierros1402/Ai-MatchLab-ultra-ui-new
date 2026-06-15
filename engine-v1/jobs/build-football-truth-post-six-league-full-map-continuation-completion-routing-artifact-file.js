import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-verification-2026-06-15",
  "post-six-league-full-map-continuation-execution-verification-2026-06-15.json"
);

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-runner-2026-06-15",
  "post-six-league-full-map-continuation-execution-runner-2026-06-15.json"
);

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-continuation-execution-approval-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-routing-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-completion-routing-artifact-2026-06-15.json"
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

  if (s.sourceContinuationExecutionRowCount !== 5) {
    throw new Error(`Expected sourceContinuationExecutionRowCount=5, got ${s.sourceContinuationExecutionRowCount}`);
  }

  if (s.verificationRowCount !== 5) {
    throw new Error(`Expected verificationRowCount=5, got ${s.verificationRowCount}`);
  }

  if (s.verifiedContinuationExecutionRowCount !== 5) {
    throw new Error(`Expected verifiedContinuationExecutionRowCount=5, got ${s.verifiedContinuationExecutionRowCount}`);
  }

  if (s.blockedContinuationExecutionVerificationCount !== 0) {
    throw new Error(`Expected blockedContinuationExecutionVerificationCount=0, got ${s.blockedContinuationExecutionVerificationCount}`);
  }

  if (s.verifiedMainLaneContinuationExecutionCount !== 4) {
    throw new Error(`Expected verifiedMainLaneContinuationExecutionCount=4, got ${s.verifiedMainLaneContinuationExecutionCount}`);
  }

  if (s.verifiedRepairBacklogContinuationExecutionCount !== 1) {
    throw new Error(`Expected verifiedRepairBacklogContinuationExecutionCount=1, got ${s.verifiedRepairBacklogContinuationExecutionCount}`);
  }

  if (s.verifiedSportomediaRepairContinuationExecutionCount !== 1) {
    throw new Error(`Expected verifiedSportomediaRepairContinuationExecutionCount=1, got ${s.verifiedSportomediaRepairContinuationExecutionCount}`);
  }

  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) {
    throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionRoutingArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionRoutingArtifactCount=1");
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
  if (s.continuationExecutionRowCount !== 5) throw new Error(`Expected continuationExecutionRowCount=5, got ${s.continuationExecutionRowCount}`);
  if (s.executedContinuationTargetCount !== 5) throw new Error(`Expected executedContinuationTargetCount=5, got ${s.executedContinuationTargetCount}`);
  if (s.mainLaneContinuationExecutedCount !== 4) throw new Error(`Expected mainLaneContinuationExecutedCount=4, got ${s.mainLaneContinuationExecutedCount}`);
  if (s.repairBacklogContinuationExecutedCount !== 1) throw new Error(`Expected repairBacklogContinuationExecutedCount=1, got ${s.repairBacklogContinuationExecutedCount}`);
  if (s.sportomediaRepairContinuationExecutedCount !== 1) throw new Error(`Expected sportomediaRepairContinuationExecutedCount=1, got ${s.sportomediaRepairContinuationExecutedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionTraceCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionTraceCount=5, got ${s.diagnosticsOnlyContinuationExecutionTraceCount}`);

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

  if (s.continuationExecutionApprovalRowCount !== 5) throw new Error(`Expected continuationExecutionApprovalRowCount=5, got ${s.continuationExecutionApprovalRowCount}`);
  if (s.approvedContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedContinuationExecutionApprovalRowCount=5, got ${s.approvedContinuationExecutionApprovalRowCount}`);
  if (s.blockedContinuationExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedContinuationExecutionApprovalRowCount=0, got ${s.blockedContinuationExecutionApprovalRowCount}`);
  if (s.nextRunnerMayExecuteContinuationCount !== 5) throw new Error(`Expected nextRunnerMayExecuteContinuationCount=5, got ${s.nextRunnerMayExecuteContinuationCount}`);

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

  if (!row.continuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!row.continuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.continuationExecutionApprovalRowId) failures.push("missing_continuation_execution_approval_row_id");
  if (!row.continuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.routeFamily) failures.push("missing_route_family");
  if (!row.continuationRunnerGroup) failures.push("missing_continuation_runner_group");

  if (row.verificationStatus !== "verified_diagnostics_only_continuation_execution") {
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

const completionRoutingRows = verificationRows.map((row, index) => {
  const failures = validateVerificationRow(row);

  const isMainLane = row.routeFamily === "whole_map_main_lane_continuation";
  const isRepairBacklog = row.routeFamily === "repair_backlog_continuation";

  return {
    continuationCompletionRoutingRowId: `post_six_league_continuation_completion_route_${String(index + 1).padStart(2, "0")}`,
    continuationExecutionVerificationRowId: row.continuationExecutionVerificationRowId,
    continuationExecutionRowId: row.continuationExecutionRowId,
    continuationExecutionApprovalRowId: row.continuationExecutionApprovalRowId,
    continuationRunnerTargetId: row.continuationRunnerTargetId,
    sourceContinuationRoutingRowId: row.sourceContinuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    continuationRunnerGroup: row.continuationRunnerGroup,
    completionRouteFamily: isMainLane
      ? "whole_map_main_lane_completion"
      : "repair_backlog_completion",
    completionRouteIntent: isMainLane
      ? "route_verified_main_lane_continuation_execution_to_next_full_map_cycle"
      : "route_verified_repair_backlog_continuation_execution_to_next_repair_or_completion_cycle",
    completionRoutingStatus:
      failures.length === 0
        ? "ready_for_post_six_league_full_map_completion_action_pack"
        : "blocked_from_post_six_league_full_map_completion_action_pack",
    failures,
    mayBuildCompletionActionPackForRoute: failures.length === 0,

    completionRoutingIsExecutionPermissionNow: false,
    completionRoutingIsFetchPermissionNow: false,
    completionRoutingIsSearchPermissionNow: false,
    completionRoutingIsBroadSearchPermissionNow: false,
    completionRoutingIsClassifierPermissionNow: false,
    completionRoutingIsCanonicalWritePermissionNow: false,
    completionRoutingIsProductionWritePermissionNow: false,
    completionRoutingIsTruthAssertionPermissionNow: false
  };
});

const readyRows = completionRoutingRows.filter(
  (row) => row.completionRoutingStatus === "ready_for_post_six_league_full_map_completion_action_pack"
);

const blockedRows = completionRoutingRows.filter(
  (row) => row.completionRoutingStatus !== "ready_for_post_six_league_full_map_completion_action_pack"
);

const summary = {
  postSixLeagueFullMapContinuationCompletionRoutingArtifactReadCount: 3,
  sourceContinuationExecutionVerificationRowCount: verificationRows.length,
  sourceContinuationExecutionRowCount: executionRows.length,
  sourceContinuationExecutionApprovalRowCount: approvalRows.length,

  continuationCompletionRoutingRowCount: completionRoutingRows.length,
  readyContinuationCompletionRoutingRowCount: readyRows.length,
  blockedContinuationCompletionRoutingRowCount: blockedRows.length,

  mainLaneContinuationCompletionRoutingRowCount: countWhere(
    readyRows,
    (row) => row.completionRouteFamily === "whole_map_main_lane_completion"
  ),
  repairBacklogContinuationCompletionRoutingRowCount: countWhere(
    readyRows,
    (row) => row.completionRouteFamily === "repair_backlog_completion"
  ),
  sportomediaRepairContinuationCompletionRoutingRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.completionRouteFamily === "repair_backlog_completion"
  ),

  continuationExecutionVerifiedCount: verification.summary.verifiedContinuationExecutionRowCount,
  diagnosticsOnlyContinuationExecutionVerifiedCount:
    verification.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapContinuationCompletionActionPackCount:
    blockedRows.length === 0 ? 1 : 0,

  completionRoutingIsExecutionPermissionNowCount: 0,
  completionRoutingIsFetchPermissionNowCount: 0,
  completionRoutingIsSearchPermissionNowCount: 0,
  completionRoutingIsBroadSearchPermissionNowCount: 0,
  completionRoutingIsClassifierPermissionNowCount: 0,
  completionRoutingIsCanonicalWritePermissionNowCount: 0,
  completionRoutingIsProductionWritePermissionNowCount: 0,
  completionRoutingIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-continuation-completion-routing-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_continuation_completion_routing",
  dryRun: true,
  inputs: {
    postSixLeagueContinuationExecutionVerification: verificationPath,
    postSixLeagueContinuationExecutionRunner: executionRunnerPath,
    postSixLeagueContinuationExecutionApprovalGate: approvalPath
  },
  policy: {
    continuationCompletionRoutingOnly: true,
    completionActionPackRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  completionRoutingRows,
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
  throw new Error(`Continuation completion routing blocked ${blockedRows.length} rows`);
}
