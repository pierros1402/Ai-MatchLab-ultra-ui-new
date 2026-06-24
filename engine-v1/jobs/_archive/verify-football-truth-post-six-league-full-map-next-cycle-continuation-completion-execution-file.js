import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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

const runnerManifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-runner-manifest-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-runner-manifest-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-execution-verification-2026-06-15.json"
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

function validateRunnerManifest(input) {
  const s = input.summary || {};

  if (s.nextCycleContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected nextCycleContinuationCompletionRunnerTargetCount=5, got ${s.nextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.readyNextCycleContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected readyNextCycleContinuationCompletionRunnerTargetCount=5, got ${s.readyNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.blockedNextCycleContinuationCompletionRunnerTargetCount !== 0) throw new Error(`Expected blockedNextCycleContinuationCompletionRunnerTargetCount=0, got ${s.blockedNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.mainLaneNextCycleContinuationCompletionRunnerTargetCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationCompletionRunnerTargetCount=4, got ${s.mainLaneNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.repairBacklogNextCycleContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationCompletionRunnerTargetCount=1, got ${s.repairBacklogNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.sportomediaRepairNextCycleContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationCompletionRunnerTargetCount=1, got ${s.sportomediaRepairNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);

  [
    "continuationCompletionRunnerManifestIsExecutionPermissionNowCount",
    "continuationCompletionRunnerManifestIsFetchPermissionNowCount",
    "continuationCompletionRunnerManifestIsSearchPermissionNowCount",
    "continuationCompletionRunnerManifestIsBroadSearchPermissionNowCount",
    "continuationCompletionRunnerManifestIsClassifierPermissionNowCount",
    "continuationCompletionRunnerManifestIsCanonicalWritePermissionNowCount",
    "continuationCompletionRunnerManifestIsProductionWritePermissionNowCount",
    "continuationCompletionRunnerManifestIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `runnerManifest.summary.${key}`));

  assertFalse(input.productionWrite, "runnerManifest.productionWrite");
  assertFalse(input.sourceFetch?.executed, "runnerManifest.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "runnerManifest.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "runnerManifest.broadSearchUsed");
  assertFalse(input.classifierExecuted, "runnerManifest.classifierExecuted");
}

function validateExecutionRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionRowId) failures.push("missing_completion_execution_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId) failures.push("missing_completion_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionRunnerTargetId) failures.push("missing_completion_runner_target_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId) failures.push("missing_completion_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionApprovalRowId) failures.push("missing_continuation_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleContinuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");
  if (!row.nextCycleContinuationCompletionRunnerGroup) failures.push("missing_next_cycle_continuation_completion_runner_group");

  if (row.executionStatus !== "continuation_completion_target_executed_as_diagnostics_only_no_fetch_no_write") {
    failures.push(`unexpected_execution_status:${row.executionStatus}`);
  }

  if (row.materializedArtifactKind !== "diagnostics_only_next_cycle_continuation_completion_execution_trace") {
    failures.push(`unexpected_artifact_kind:${row.materializedArtifactKind}`);
  }

  if (row.executionAllowedByExplicitFlag !== true) {
    failures.push("missing_explicit_allow_execute_flag_marker");
  }

  [
    "fetchExecutedNow",
    "searchExecutedNow",
    "broadSearchExecutedNow",
    "classifierExecutedNow",
    "canonicalWriteExecutedNow",
    "productionWriteExecutedNow",
    "truthAssertionExecutedNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`side_effect_not_false:${key}`);
  });

  return failures;
}

const executionRunner = readJson(executionRunnerPath);
const executionApproval = readJson(executionApprovalPath);
const runnerManifest = readJson(runnerManifestPath);

validateExecutionRunner(executionRunner);
validateExecutionApproval(executionApproval);
validateRunnerManifest(runnerManifest);

const executionRows = Array.isArray(executionRunner.executionRows) ? executionRunner.executionRows : [];
const approvalRows = Array.isArray(executionApproval.approvalRows) ? executionApproval.approvalRows : [];
const runnerTargets = Array.isArray(runnerManifest.runnerTargets) ? runnerManifest.runnerTargets : [];

if (executionRows.length !== 5) throw new Error(`Expected 5 continuation-completion execution rows, got ${executionRows.length}`);
if (approvalRows.length !== 5) throw new Error(`Expected 5 continuation-completion approval rows, got ${approvalRows.length}`);
if (runnerTargets.length !== 5) throw new Error(`Expected 5 continuation-completion runner targets, got ${runnerTargets.length}`);

const verificationRows = executionRows.map((row, index) => {
  const failures = validateExecutionRow(row);

  return {
    postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId: `post_six_league_next_cycle_continuation_completion_execution_verification_${String(index + 1).padStart(2, "0")}`,
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

    verificationStatus:
      failures.length === 0
        ? "verified_diagnostics_only_next_cycle_continuation_completion_execution"
        : "blocked_next_cycle_continuation_completion_execution_verification",
    failures,
    noFetchVerified: row.fetchExecutedNow === false,
    noSearchVerified: row.searchExecutedNow === false,
    noWriteVerified: row.canonicalWriteExecutedNow === false && row.productionWriteExecutedNow === false,
    noTruthAssertionVerified: row.truthAssertionExecutedNow === false
  };
});

const verifiedRows = verificationRows.filter(
  (row) => row.verificationStatus === "verified_diagnostics_only_next_cycle_continuation_completion_execution"
);

const blockedRows = verificationRows.filter(
  (row) => row.verificationStatus !== "verified_diagnostics_only_next_cycle_continuation_completion_execution"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionExecutionVerificationReadCount: 3,
  sourceContinuationCompletionExecutionRowCount: executionRows.length,
  sourceContinuationCompletionExecutionApprovalRowCount: approvalRows.length,
  sourceContinuationCompletionRunnerTargetCount: runnerTargets.length,

  verificationRowCount: verificationRows.length,
  verifiedContinuationCompletionExecutionRowCount: verifiedRows.length,
  blockedContinuationCompletionExecutionVerificationCount: blockedRows.length,

  verifiedMainLaneContinuationCompletionExecutionCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  verifiedRepairBacklogContinuationCompletionExecutionCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  verifiedSportomediaRepairContinuationCompletionExecutionCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    executionRunner.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    executionRunner.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    executionRunner.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount: verifiedRows.length,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionCloseoutArtifactCount:
    blockedRows.length === 0 ? 1 : 0,

  verificationIsExecutionPermissionNowCount: 0,
  verificationIsFetchPermissionNowCount: 0,
  verificationIsSearchPermissionNowCount: 0,
  verificationIsBroadSearchPermissionNowCount: 0,
  verificationIsClassifierPermissionNowCount: 0,
  verificationIsCanonicalWritePermissionNowCount: 0,
  verificationIsProductionWritePermissionNowCount: 0,
  verificationIsTruthAssertionPermissionNowCount: 0,

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
  job: "verify-football-truth-post-six-league-full-map-next-cycle-continuation-completion-execution-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_execution_verification_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionExecutionRunner: executionRunnerPath,
    postSixLeagueNextCycleContinuationCompletionExecutionApprovalGate: executionApprovalPath,
    postSixLeagueNextCycleContinuationCompletionRunnerManifest: runnerManifestPath
  },
  policy: {
    verificationOnly: true,
    verifyDiagnosticsOnlyContinuationCompletionExecution: true,
    continuationCompletionCloseoutArtifactRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  verificationRows,
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
  throw new Error(`Next-cycle continuation-completion execution verification blocked ${blockedRows.length} rows`);
}
