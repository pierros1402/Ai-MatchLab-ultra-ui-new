import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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

const runnerManifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-runner-manifest-2026-06-15",
  "post-six-league-full-map-next-cycle-runner-manifest-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-execution-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-execution-verification-2026-06-15.json"
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

  if (s.allowExecuteFlagPresent !== true) throw new Error("Expected allowExecuteFlagPresent=true");
  if (s.sourceNextCycleExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceNextCycleExecutionApprovalRowCount=5, got ${s.sourceNextCycleExecutionApprovalRowCount}`);
  if (s.sourceNextCycleRunnerTargetCount !== 5) throw new Error(`Expected sourceNextCycleRunnerTargetCount=5, got ${s.sourceNextCycleRunnerTargetCount}`);
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

function validateRunnerManifest(input) {
  const s = input.summary || {};

  if (s.nextCycleRunnerTargetCount !== 5) throw new Error(`Expected nextCycleRunnerTargetCount=5, got ${s.nextCycleRunnerTargetCount}`);
  if (s.readyNextCycleRunnerTargetCount !== 5) throw new Error(`Expected readyNextCycleRunnerTargetCount=5, got ${s.readyNextCycleRunnerTargetCount}`);
  if (s.blockedNextCycleRunnerTargetCount !== 0) throw new Error(`Expected blockedNextCycleRunnerTargetCount=0, got ${s.blockedNextCycleRunnerTargetCount}`);
  if (s.mainLaneNextCycleRunnerTargetCount !== 4) throw new Error(`Expected mainLaneNextCycleRunnerTargetCount=4, got ${s.mainLaneNextCycleRunnerTargetCount}`);
  if (s.repairBacklogNextCycleRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogNextCycleRunnerTargetCount=1, got ${s.repairBacklogNextCycleRunnerTargetCount}`);
  if (s.sportomediaRepairNextCycleRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleRunnerTargetCount=1, got ${s.sportomediaRepairNextCycleRunnerTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");

  [
    "runnerManifestIsExecutionPermissionNowCount",
    "runnerManifestIsFetchPermissionNowCount",
    "runnerManifestIsSearchPermissionNowCount",
    "runnerManifestIsBroadSearchPermissionNowCount",
    "runnerManifestIsClassifierPermissionNowCount",
    "runnerManifestIsCanonicalWritePermissionNowCount",
    "runnerManifestIsProductionWritePermissionNowCount",
    "runnerManifestIsTruthAssertionPermissionNowCount",
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

  if (!row.postSixLeagueNextCycleExecutionRowId) failures.push("missing_next_cycle_execution_row_id");
  if (!row.postSixLeagueNextCycleExecutionApprovalRowId) failures.push("missing_next_cycle_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleRunnerTargetId) failures.push("missing_next_cycle_runner_target_id");
  if (!row.postSixLeagueNextCycleActionPackQualityGateRowId) failures.push("missing_next_cycle_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleActionPackRowId) failures.push("missing_next_cycle_action_pack_row_id");
  if (!row.postSixLeagueNextCycleRoutingRowId) failures.push("missing_next_cycle_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleRunnerGroup) failures.push("missing_next_cycle_runner_group");

  if (row.executionStatus !== "next_cycle_target_executed_as_diagnostics_only_no_fetch_no_write") {
    failures.push(`unexpected_execution_status:${row.executionStatus}`);
  }

  if (row.materializedArtifactKind !== "diagnostics_only_next_cycle_execution_trace") {
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

if (executionRows.length !== 5) {
  throw new Error(`Expected 5 next-cycle execution rows, got ${executionRows.length}`);
}

const verificationRows = executionRows.map((row, index) => {
  const failures = validateExecutionRow(row);

  return {
    postSixLeagueNextCycleExecutionVerificationRowId: `post_six_league_next_cycle_execution_verification_${String(index + 1).padStart(2, "0")}`,
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
    verificationStatus:
      failures.length === 0
        ? "verified_diagnostics_only_next_cycle_execution"
        : "blocked_next_cycle_execution_verification",
    failures,
    noFetchVerified: row.fetchExecutedNow === false,
    noSearchVerified: row.searchExecutedNow === false,
    noWriteVerified: row.canonicalWriteExecutedNow === false && row.productionWriteExecutedNow === false,
    noTruthAssertionVerified: row.truthAssertionExecutedNow === false
  };
});

const verifiedRows = verificationRows.filter(
  (row) => row.verificationStatus === "verified_diagnostics_only_next_cycle_execution"
);

const blockedRows = verificationRows.filter(
  (row) => row.verificationStatus !== "verified_diagnostics_only_next_cycle_execution"
);

const summary = {
  postSixLeagueFullMapNextCycleExecutionVerificationReadCount: 3,
  sourceNextCycleExecutionRowCount: executionRows.length,
  verificationRowCount: verificationRows.length,
  verifiedNextCycleExecutionRowCount: verifiedRows.length,
  blockedNextCycleExecutionVerificationCount: blockedRows.length,

  verifiedMainLaneNextCycleExecutionCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  verifiedRepairBacklogNextCycleExecutionCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  verifiedSportomediaRepairNextCycleExecutionCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    executionRunner.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount: verifiedRows.length,

  mayBuildPostSixLeagueFullMapNextCycleContinuationRoutingArtifactCount:
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
  job: "verify-football-truth-post-six-league-full-map-next-cycle-execution-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_execution_verification_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleExecutionRunner: executionRunnerPath,
    postSixLeagueNextCycleExecutionApprovalGate: executionApprovalPath,
    postSixLeagueNextCycleRunnerManifest: runnerManifestPath
  },
  policy: {
    verificationOnly: true,
    verifyDiagnosticsOnlyNextCycleExecution: true,
    continuationRoutingArtifactRequiredBeforeAnyFurtherExecution: true,
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
  throw new Error(`Next-cycle execution verification blocked ${blockedRows.length} rows`);
}
