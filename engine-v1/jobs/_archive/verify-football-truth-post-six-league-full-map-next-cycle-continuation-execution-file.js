import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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

const runnerManifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-runner-manifest-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-runner-manifest-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-execution-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-execution-verification-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationExecutionRunnerReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationExecutionRunnerReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationExecutionRunnerReadCount}`);
  }
  if (s.allowExecuteFlagPresent !== true) throw new Error("Expected allowExecuteFlagPresent=true");
  if (s.sourceNextCycleContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationExecutionApprovalRowCount=5, got ${s.sourceNextCycleContinuationExecutionApprovalRowCount}`);
  if (s.sourceNextCycleContinuationRunnerTargetCount !== 5) throw new Error(`Expected sourceNextCycleContinuationRunnerTargetCount=5, got ${s.sourceNextCycleContinuationRunnerTargetCount}`);
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

  if (s.nextCycleContinuationRunnerTargetCount !== 5) throw new Error(`Expected nextCycleContinuationRunnerTargetCount=5, got ${s.nextCycleContinuationRunnerTargetCount}`);
  if (s.readyNextCycleContinuationRunnerTargetCount !== 5) throw new Error(`Expected readyNextCycleContinuationRunnerTargetCount=5, got ${s.readyNextCycleContinuationRunnerTargetCount}`);
  if (s.blockedNextCycleContinuationRunnerTargetCount !== 0) throw new Error(`Expected blockedNextCycleContinuationRunnerTargetCount=0, got ${s.blockedNextCycleContinuationRunnerTargetCount}`);
  if (s.mainLaneNextCycleContinuationRunnerTargetCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationRunnerTargetCount=4, got ${s.mainLaneNextCycleContinuationRunnerTargetCount}`);
  if (s.repairBacklogNextCycleContinuationRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationRunnerTargetCount=1, got ${s.repairBacklogNextCycleContinuationRunnerTargetCount}`);
  if (s.sportomediaRepairNextCycleContinuationRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationRunnerTargetCount=1, got ${s.sportomediaRepairNextCycleContinuationRunnerTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);

  [
    "continuationRunnerManifestIsExecutionPermissionNowCount",
    "continuationRunnerManifestIsFetchPermissionNowCount",
    "continuationRunnerManifestIsSearchPermissionNowCount",
    "continuationRunnerManifestIsBroadSearchPermissionNowCount",
    "continuationRunnerManifestIsClassifierPermissionNowCount",
    "continuationRunnerManifestIsCanonicalWritePermissionNowCount",
    "continuationRunnerManifestIsProductionWritePermissionNowCount",
    "continuationRunnerManifestIsTruthAssertionPermissionNowCount",
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

  if (!row.postSixLeagueNextCycleContinuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionApprovalRowId) failures.push("missing_continuation_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleContinuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!row.postSixLeagueNextCycleContinuationActionPackQualityGateRowId) failures.push("missing_continuation_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleContinuationActionPackRowId) failures.push("missing_continuation_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationRoutingRowId) failures.push("missing_continuation_routing_row_id");
  if (!row.postSixLeagueNextCycleExecutionVerificationRowId) failures.push("missing_next_cycle_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleExecutionRowId) failures.push("missing_next_cycle_execution_row_id");
  if (!row.postSixLeagueNextCycleExecutionApprovalRowId) failures.push("missing_next_cycle_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleRunnerTargetId) failures.push("missing_next_cycle_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationRunnerGroup) failures.push("missing_next_cycle_continuation_runner_group");

  if (row.executionStatus !== "continuation_target_executed_as_diagnostics_only_no_fetch_no_write") {
    failures.push(`unexpected_execution_status:${row.executionStatus}`);
  }

  if (row.materializedArtifactKind !== "diagnostics_only_next_cycle_continuation_execution_trace") {
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

if (executionRows.length !== 5) throw new Error(`Expected 5 continuation execution rows, got ${executionRows.length}`);
if (approvalRows.length !== 5) throw new Error(`Expected 5 continuation approval rows, got ${approvalRows.length}`);
if (runnerTargets.length !== 5) throw new Error(`Expected 5 continuation runner targets, got ${runnerTargets.length}`);

const verificationRows = executionRows.map((row, index) => {
  const failures = validateExecutionRow(row);

  return {
    postSixLeagueNextCycleContinuationExecutionVerificationRowId: `post_six_league_next_cycle_continuation_execution_verification_${String(index + 1).padStart(2, "0")}`,
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

    verificationStatus:
      failures.length === 0
        ? "verified_diagnostics_only_next_cycle_continuation_execution"
        : "blocked_next_cycle_continuation_execution_verification",
    failures,
    noFetchVerified: row.fetchExecutedNow === false,
    noSearchVerified: row.searchExecutedNow === false,
    noWriteVerified: row.canonicalWriteExecutedNow === false && row.productionWriteExecutedNow === false,
    noTruthAssertionVerified: row.truthAssertionExecutedNow === false
  };
});

const verifiedRows = verificationRows.filter(
  (row) => row.verificationStatus === "verified_diagnostics_only_next_cycle_continuation_execution"
);

const blockedRows = verificationRows.filter(
  (row) => row.verificationStatus !== "verified_diagnostics_only_next_cycle_continuation_execution"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationExecutionVerificationReadCount: 3,
  sourceContinuationExecutionRowCount: executionRows.length,
  sourceContinuationExecutionApprovalRowCount: approvalRows.length,
  sourceContinuationRunnerTargetCount: runnerTargets.length,

  verificationRowCount: verificationRows.length,
  verifiedContinuationExecutionRowCount: verifiedRows.length,
  blockedContinuationExecutionVerificationCount: blockedRows.length,

  verifiedMainLaneContinuationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  verifiedRepairBacklogContinuationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  verifiedSportomediaRepairContinuationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    executionRunner.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    executionRunner.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount: verifiedRows.length,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactCount:
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
  job: "verify-football-truth-post-six-league-full-map-next-cycle-continuation-execution-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_execution_verification_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationExecutionRunner: executionRunnerPath,
    postSixLeagueNextCycleContinuationExecutionApprovalGate: executionApprovalPath,
    postSixLeagueNextCycleContinuationRunnerManifest: runnerManifestPath
  },
  policy: {
    verificationOnly: true,
    verifyDiagnosticsOnlyContinuationExecution: true,
    continuationCompletionRoutingArtifactRequiredBeforeAnyFurtherExecution: true,
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
  throw new Error(`Next-cycle continuation execution verification blocked ${blockedRows.length} rows`);
}
