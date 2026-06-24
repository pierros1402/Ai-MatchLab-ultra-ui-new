import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-execution-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-execution-verification-2026-06-15.json"
);

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-execution-runner-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-execution-runner-2026-06-15.json"
);

const executionApprovalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-execution-approval-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-routing-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-routing-artifact-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationExecutionVerificationReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationExecutionVerificationReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationExecutionVerificationReadCount}`);
  }
  if (s.sourceContinuationExecutionRowCount !== 5) throw new Error(`Expected sourceContinuationExecutionRowCount=5, got ${s.sourceContinuationExecutionRowCount}`);
  if (s.sourceContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceContinuationExecutionApprovalRowCount=5, got ${s.sourceContinuationExecutionApprovalRowCount}`);
  if (s.sourceContinuationRunnerTargetCount !== 5) throw new Error(`Expected sourceContinuationRunnerTargetCount=5, got ${s.sourceContinuationRunnerTargetCount}`);
  if (s.verificationRowCount !== 5) throw new Error(`Expected verificationRowCount=5, got ${s.verificationRowCount}`);
  if (s.verifiedContinuationExecutionRowCount !== 5) throw new Error(`Expected verifiedContinuationExecutionRowCount=5, got ${s.verifiedContinuationExecutionRowCount}`);
  if (s.blockedContinuationExecutionVerificationCount !== 0) throw new Error(`Expected blockedContinuationExecutionVerificationCount=0, got ${s.blockedContinuationExecutionVerificationCount}`);
  if (s.verifiedMainLaneContinuationExecutionCount !== 4) throw new Error(`Expected verifiedMainLaneContinuationExecutionCount=4, got ${s.verifiedMainLaneContinuationExecutionCount}`);
  if (s.verifiedRepairBacklogContinuationExecutionCount !== 1) throw new Error(`Expected verifiedRepairBacklogContinuationExecutionCount=1, got ${s.verifiedRepairBacklogContinuationExecutionCount}`);
  if (s.verifiedSportomediaRepairContinuationExecutionCount !== 1) throw new Error(`Expected verifiedSportomediaRepairContinuationExecutionCount=1, got ${s.verifiedSportomediaRepairContinuationExecutionCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactCount=1");
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
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionTraceCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionTraceCount=5, got ${s.diagnosticsOnlyContinuationExecutionTraceCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionVerificationGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionVerificationGateCount=1");
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

  if (s.nextCycleContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected nextCycleContinuationExecutionApprovalRowCount=5, got ${s.nextCycleContinuationExecutionApprovalRowCount}`);
  if (s.approvedNextCycleContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedNextCycleContinuationExecutionApprovalRowCount=5, got ${s.approvedNextCycleContinuationExecutionApprovalRowCount}`);
  if (s.blockedNextCycleContinuationExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedNextCycleContinuationExecutionApprovalRowCount=0, got ${s.blockedNextCycleContinuationExecutionApprovalRowCount}`);
  if (s.approvedMainLaneNextCycleContinuationExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneNextCycleContinuationExecutionTargetCount=4, got ${s.approvedMainLaneNextCycleContinuationExecutionTargetCount}`);
  if (s.approvedRepairBacklogNextCycleContinuationExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogNextCycleContinuationExecutionTargetCount=1, got ${s.approvedRepairBacklogNextCycleContinuationExecutionTargetCount}`);
  if (s.approvedSportomediaRepairNextCycleContinuationExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairNextCycleContinuationExecutionTargetCount=1, got ${s.approvedSportomediaRepairNextCycleContinuationExecutionTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
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
  ].forEach((key) => assertZero(s[key], `executionApproval.summary.${key}`));

  assertFalse(input.productionWrite, "executionApproval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "executionApproval.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "executionApproval.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "executionApproval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "executionApproval.classifierExecuted");
}

function validateVerificationRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleContinuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionApprovalRowId) failures.push("missing_continuation_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleContinuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!row.postSixLeagueNextCycleContinuationActionPackQualityGateRowId) failures.push("missing_continuation_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleContinuationActionPackRowId) failures.push("missing_continuation_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationRoutingRowId) failures.push("missing_continuation_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationRunnerGroup) failures.push("missing_next_cycle_continuation_runner_group");

  if (row.verificationStatus !== "verified_diagnostics_only_next_cycle_continuation_execution") {
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

if (verificationRows.length !== 5) throw new Error(`Expected 5 continuation verification rows, got ${verificationRows.length}`);
if (executionRows.length !== 5) throw new Error(`Expected 5 continuation execution rows, got ${executionRows.length}`);
if (approvalRows.length !== 5) throw new Error(`Expected 5 continuation approval rows, got ${approvalRows.length}`);

const completionRoutingRows = verificationRows.map((row, index) => {
  const failures = validateVerificationRow(row);

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";
  const isRepairBacklog = row.nextCycleRouteFamily === "repair_backlog_next_cycle";

  if (!isMainLane && !isRepairBacklog) {
    failures.push(`unexpected_next_cycle_route_family:${row.nextCycleRouteFamily}`);
  }

  return {
    postSixLeagueNextCycleContinuationCompletionRoutingRowId: `post_six_league_next_cycle_continuation_completion_route_${String(index + 1).padStart(2, "0")}`,
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
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    nextCycleActionPackLane: row.nextCycleActionPackLane,
    nextCycleRunnerGroup: row.nextCycleRunnerGroup,
    nextCycleContinuationActionPackLane: row.nextCycleContinuationActionPackLane,
    nextCycleContinuationRunnerGroup: row.nextCycleContinuationRunnerGroup,

    nextCycleContinuationCompletionRouteFamily: isMainLane
      ? "whole_map_main_lane_next_cycle_continuation_completion"
      : "repair_backlog_next_cycle_continuation_completion",
    nextCycleContinuationCompletionRouteIntent: isMainLane
      ? "complete_whole_map_main_lane_next_cycle_continuation_after_verified_execution"
      : "complete_repair_backlog_next_cycle_continuation_after_verified_execution",
    nextCycleContinuationCompletionRoutingStatus:
      failures.length === 0
        ? "ready_for_post_six_league_next_cycle_continuation_completion_action_pack"
        : "blocked_from_post_six_league_next_cycle_continuation_completion_action_pack",
    failures,
    mayBuildNextCycleContinuationCompletionActionPackForRoute: failures.length === 0,

    continuationCompletionRoutingIsExecutionPermissionNow: false,
    continuationCompletionRoutingIsFetchPermissionNow: false,
    continuationCompletionRoutingIsSearchPermissionNow: false,
    continuationCompletionRoutingIsBroadSearchPermissionNow: false,
    continuationCompletionRoutingIsClassifierPermissionNow: false,
    continuationCompletionRoutingIsCanonicalWritePermissionNow: false,
    continuationCompletionRoutingIsProductionWritePermissionNow: false,
    continuationCompletionRoutingIsTruthAssertionPermissionNow: false
  };
});

const readyRows = completionRoutingRows.filter(
  (row) => row.nextCycleContinuationCompletionRoutingStatus === "ready_for_post_six_league_next_cycle_continuation_completion_action_pack"
);

const blockedRows = completionRoutingRows.filter(
  (row) => row.nextCycleContinuationCompletionRoutingStatus !== "ready_for_post_six_league_next_cycle_continuation_completion_action_pack"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactReadCount: 3,
  sourceContinuationExecutionVerificationRowCount: verificationRows.length,
  sourceContinuationExecutionRowCount: executionRows.length,
  sourceContinuationExecutionApprovalRowCount: approvalRows.length,

  nextCycleContinuationCompletionRoutingRowCount: completionRoutingRows.length,
  readyNextCycleContinuationCompletionRoutingRowCount: readyRows.length,
  blockedNextCycleContinuationCompletionRoutingRowCount: blockedRows.length,

  mainLaneNextCycleContinuationCompletionRoutingRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleContinuationCompletionRoutingRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleContinuationCompletionRoutingRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    verification.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    verification.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    verification.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionActionPackCount:
    blockedRows.length === 0 ? 1 : 0,

  continuationCompletionRoutingIsExecutionPermissionNowCount: 0,
  continuationCompletionRoutingIsFetchPermissionNowCount: 0,
  continuationCompletionRoutingIsSearchPermissionNowCount: 0,
  continuationCompletionRoutingIsBroadSearchPermissionNowCount: 0,
  continuationCompletionRoutingIsClassifierPermissionNowCount: 0,
  continuationCompletionRoutingIsCanonicalWritePermissionNowCount: 0,
  continuationCompletionRoutingIsProductionWritePermissionNowCount: 0,
  continuationCompletionRoutingIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-continuation-completion-routing-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_routing_artifact",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationExecutionVerification: verificationPath,
    postSixLeagueNextCycleContinuationExecutionRunner: executionRunnerPath,
    postSixLeagueNextCycleContinuationExecutionApprovalGate: executionApprovalPath
  },
  policy: {
    continuationCompletionRoutingArtifactOnly: true,
    continuationCompletionActionPackRequiredBeforeAnyFurtherExecution: true,
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
  throw new Error(`Next-cycle continuation-completion routing blocked ${blockedRows.length} rows`);
}
