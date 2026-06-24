import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-execution-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-execution-verification-2026-06-15.json"
);

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-execution-runner-2026-06-15",
  "post-six-league-full-map-next-cycle-execution-runner-2026-06-15.json"
);

const executionApprovalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-execution-approval-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-routing-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-routing-artifact-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleExecutionVerificationReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleExecutionVerificationReadCount=3, got ${s.postSixLeagueFullMapNextCycleExecutionVerificationReadCount}`);
  }
  if (s.sourceNextCycleExecutionRowCount !== 5) throw new Error(`Expected sourceNextCycleExecutionRowCount=5, got ${s.sourceNextCycleExecutionRowCount}`);
  if (s.verificationRowCount !== 5) throw new Error(`Expected verificationRowCount=5, got ${s.verificationRowCount}`);
  if (s.verifiedNextCycleExecutionRowCount !== 5) throw new Error(`Expected verifiedNextCycleExecutionRowCount=5, got ${s.verifiedNextCycleExecutionRowCount}`);
  if (s.blockedNextCycleExecutionVerificationCount !== 0) throw new Error(`Expected blockedNextCycleExecutionVerificationCount=0, got ${s.blockedNextCycleExecutionVerificationCount}`);
  if (s.verifiedMainLaneNextCycleExecutionCount !== 4) throw new Error(`Expected verifiedMainLaneNextCycleExecutionCount=4, got ${s.verifiedMainLaneNextCycleExecutionCount}`);
  if (s.verifiedRepairBacklogNextCycleExecutionCount !== 1) throw new Error(`Expected verifiedRepairBacklogNextCycleExecutionCount=1, got ${s.verifiedRepairBacklogNextCycleExecutionCount}`);
  if (s.verifiedSportomediaRepairNextCycleExecutionCount !== 1) throw new Error(`Expected verifiedSportomediaRepairNextCycleExecutionCount=1, got ${s.verifiedSportomediaRepairNextCycleExecutionCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationRoutingArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationRoutingArtifactCount=1");
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
  if (s.nextCycleExecutionRowCount !== 5) throw new Error(`Expected nextCycleExecutionRowCount=5, got ${s.nextCycleExecutionRowCount}`);
  if (s.executedNextCycleTargetCount !== 5) throw new Error(`Expected executedNextCycleTargetCount=5, got ${s.executedNextCycleTargetCount}`);
  if (s.mainLaneNextCycleExecutedCount !== 4) throw new Error(`Expected mainLaneNextCycleExecutedCount=4, got ${s.mainLaneNextCycleExecutedCount}`);
  if (s.repairBacklogNextCycleExecutedCount !== 1) throw new Error(`Expected repairBacklogNextCycleExecutedCount=1, got ${s.repairBacklogNextCycleExecutedCount}`);
  if (s.sportomediaRepairNextCycleExecutedCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleExecutedCount=1, got ${s.sportomediaRepairNextCycleExecutedCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionTraceCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionTraceCount=5, got ${s.diagnosticsOnlyNextCycleExecutionTraceCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleExecutionVerificationGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleExecutionVerificationGateCount=1");
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

  if (s.nextCycleExecutionApprovalRowCount !== 5) throw new Error(`Expected nextCycleExecutionApprovalRowCount=5, got ${s.nextCycleExecutionApprovalRowCount}`);
  if (s.approvedNextCycleExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedNextCycleExecutionApprovalRowCount=5, got ${s.approvedNextCycleExecutionApprovalRowCount}`);
  if (s.blockedNextCycleExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedNextCycleExecutionApprovalRowCount=0, got ${s.blockedNextCycleExecutionApprovalRowCount}`);
  if (s.approvedMainLaneNextCycleExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneNextCycleExecutionTargetCount=4, got ${s.approvedMainLaneNextCycleExecutionTargetCount}`);
  if (s.approvedRepairBacklogNextCycleExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogNextCycleExecutionTargetCount=1, got ${s.approvedRepairBacklogNextCycleExecutionTargetCount}`);
  if (s.approvedSportomediaRepairNextCycleExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairNextCycleExecutionTargetCount=1, got ${s.approvedSportomediaRepairNextCycleExecutionTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.nextRunnerMayExecuteNextCycleCount !== 5) throw new Error(`Expected nextRunnerMayExecuteNextCycleCount=5, got ${s.nextRunnerMayExecuteNextCycleCount}`);

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
  ].forEach((key) => assertZero(s[key], `executionApproval.summary.${key}`));

  assertFalse(input.productionWrite, "executionApproval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "executionApproval.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "executionApproval.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "executionApproval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "executionApproval.classifierExecuted");
}

function validateVerificationRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleExecutionVerificationRowId) failures.push("missing_next_cycle_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleExecutionRowId) failures.push("missing_next_cycle_execution_row_id");
  if (!row.postSixLeagueNextCycleExecutionApprovalRowId) failures.push("missing_next_cycle_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleRunnerTargetId) failures.push("missing_next_cycle_runner_target_id");
  if (!row.postSixLeagueNextCycleActionPackQualityGateRowId) failures.push("missing_next_cycle_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleActionPackRowId) failures.push("missing_next_cycle_action_pack_row_id");
  if (!row.postSixLeagueNextCycleRoutingRowId) failures.push("missing_next_cycle_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleRunnerGroup) failures.push("missing_next_cycle_runner_group");

  if (row.verificationStatus !== "verified_diagnostics_only_next_cycle_execution") {
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

if (verificationRows.length !== 5) throw new Error(`Expected 5 verification rows, got ${verificationRows.length}`);
if (executionRows.length !== 5) throw new Error(`Expected 5 execution rows, got ${executionRows.length}`);
if (approvalRows.length !== 5) throw new Error(`Expected 5 approval rows, got ${approvalRows.length}`);

const continuationRoutingRows = verificationRows.map((row, index) => {
  const failures = validateVerificationRow(row);

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";
  const isRepairBacklog = row.nextCycleRouteFamily === "repair_backlog_next_cycle";

  if (!isMainLane && !isRepairBacklog) {
    failures.push(`unexpected_next_cycle_route_family:${row.nextCycleRouteFamily}`);
  }

  return {
    postSixLeagueNextCycleContinuationRoutingRowId: `post_six_league_next_cycle_continuation_route_${String(index + 1).padStart(2, "0")}`,
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
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    nextCycleActionPackLane: row.nextCycleActionPackLane,
    nextCycleRunnerGroup: row.nextCycleRunnerGroup,

    nextCycleContinuationRouteFamily: isMainLane
      ? "whole_map_main_lane_next_cycle_continuation"
      : "repair_backlog_next_cycle_continuation",
    nextCycleContinuationRouteIntent: isMainLane
      ? "continue_whole_map_main_lane_after_verified_next_cycle_execution"
      : "continue_repair_backlog_after_verified_next_cycle_execution",
    nextCycleContinuationRoutingStatus:
      failures.length === 0
        ? "ready_for_post_six_league_next_cycle_continuation_action_pack"
        : "blocked_from_post_six_league_next_cycle_continuation_action_pack",
    failures,
    mayBuildNextCycleContinuationActionPackForRoute: failures.length === 0,

    continuationRoutingIsExecutionPermissionNow: false,
    continuationRoutingIsFetchPermissionNow: false,
    continuationRoutingIsSearchPermissionNow: false,
    continuationRoutingIsBroadSearchPermissionNow: false,
    continuationRoutingIsClassifierPermissionNow: false,
    continuationRoutingIsCanonicalWritePermissionNow: false,
    continuationRoutingIsProductionWritePermissionNow: false,
    continuationRoutingIsTruthAssertionPermissionNow: false
  };
});

const readyRows = continuationRoutingRows.filter(
  (row) => row.nextCycleContinuationRoutingStatus === "ready_for_post_six_league_next_cycle_continuation_action_pack"
);

const blockedRows = continuationRoutingRows.filter(
  (row) => row.nextCycleContinuationRoutingStatus !== "ready_for_post_six_league_next_cycle_continuation_action_pack"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationRoutingArtifactReadCount: 3,
  sourceNextCycleExecutionVerificationRowCount: verificationRows.length,
  sourceNextCycleExecutionRowCount: executionRows.length,
  sourceNextCycleExecutionApprovalRowCount: approvalRows.length,

  nextCycleContinuationRoutingRowCount: continuationRoutingRows.length,
  readyNextCycleContinuationRoutingRowCount: readyRows.length,
  blockedNextCycleContinuationRoutingRowCount: blockedRows.length,

  mainLaneNextCycleContinuationRoutingRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleContinuationRoutingRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleContinuationRoutingRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    verification.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    verification.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationActionPackCount:
    blockedRows.length === 0 ? 1 : 0,

  continuationRoutingIsExecutionPermissionNowCount: 0,
  continuationRoutingIsFetchPermissionNowCount: 0,
  continuationRoutingIsSearchPermissionNowCount: 0,
  continuationRoutingIsBroadSearchPermissionNowCount: 0,
  continuationRoutingIsClassifierPermissionNowCount: 0,
  continuationRoutingIsCanonicalWritePermissionNowCount: 0,
  continuationRoutingIsProductionWritePermissionNowCount: 0,
  continuationRoutingIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-continuation-routing-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_routing_artifact",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleExecutionVerification: verificationPath,
    postSixLeagueNextCycleExecutionRunner: executionRunnerPath,
    postSixLeagueNextCycleExecutionApprovalGate: executionApprovalPath
  },
  policy: {
    continuationRoutingArtifactOnly: true,
    continuationActionPackRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  continuationRoutingRows,
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
  throw new Error(`Next-cycle continuation routing blocked ${blockedRows.length} rows`);
}
