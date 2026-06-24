import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-runner-2026-06-15",
  "post-six-league-full-map-continuation-completion-execution-runner-2026-06-15.json"
);

const executionApprovalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-continuation-completion-execution-approval-gate-2026-06-15.json"
);

const runnerManifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-runner-manifest-2026-06-15",
  "post-six-league-full-map-continuation-completion-runner-manifest-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-completion-execution-verification-2026-06-15.json"
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
  if (s.sourceContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionExecutionApprovalRowCount=5, got ${s.sourceContinuationCompletionExecutionApprovalRowCount}`);
  if (s.sourceContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected sourceContinuationCompletionRunnerTargetCount=5, got ${s.sourceContinuationCompletionRunnerTargetCount}`);
  if (s.completionExecutionRowCount !== 5) throw new Error(`Expected completionExecutionRowCount=5, got ${s.completionExecutionRowCount}`);
  if (s.executedCompletionTargetCount !== 5) throw new Error(`Expected executedCompletionTargetCount=5, got ${s.executedCompletionTargetCount}`);
  if (s.mainLaneCompletionExecutedCount !== 4) throw new Error(`Expected mainLaneCompletionExecutedCount=4, got ${s.mainLaneCompletionExecutedCount}`);
  if (s.repairBacklogCompletionExecutedCount !== 1) throw new Error(`Expected repairBacklogCompletionExecutedCount=1, got ${s.repairBacklogCompletionExecutedCount}`);
  if (s.sportomediaRepairCompletionExecutedCount !== 1) throw new Error(`Expected sportomediaRepairCompletionExecutedCount=1, got ${s.sportomediaRepairCompletionExecutedCount}`);
  if (s.diagnosticsOnlyCompletionExecutionTraceCount !== 5) throw new Error(`Expected diagnosticsOnlyCompletionExecutionTraceCount=5, got ${s.diagnosticsOnlyCompletionExecutionTraceCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionExecutionVerificationGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionExecutionVerificationGateCount=1");
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

  if (s.continuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected continuationCompletionExecutionApprovalRowCount=5, got ${s.continuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedContinuationCompletionExecutionApprovalRowCount=5, got ${s.approvedContinuationCompletionExecutionApprovalRowCount}`);
  if (s.blockedContinuationCompletionExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedContinuationCompletionExecutionApprovalRowCount=0, got ${s.blockedContinuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedMainLaneContinuationCompletionExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneContinuationCompletionExecutionTargetCount=4, got ${s.approvedMainLaneContinuationCompletionExecutionTargetCount}`);
  if (s.approvedRepairBacklogContinuationCompletionExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogContinuationCompletionExecutionTargetCount=1, got ${s.approvedRepairBacklogContinuationCompletionExecutionTargetCount}`);
  if (s.approvedSportomediaRepairContinuationCompletionExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairContinuationCompletionExecutionTargetCount=1, got ${s.approvedSportomediaRepairContinuationCompletionExecutionTargetCount}`);
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
  ].forEach((key) => assertZero(s[key], `executionApproval.summary.${key}`));

  assertFalse(input.productionWrite, "executionApproval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "executionApproval.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "executionApproval.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "executionApproval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "executionApproval.classifierExecuted");
}

function validateRunnerManifest(input) {
  const s = input.summary || {};

  if (s.continuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected continuationCompletionRunnerTargetCount=5, got ${s.continuationCompletionRunnerTargetCount}`);
  if (s.readyContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected readyContinuationCompletionRunnerTargetCount=5, got ${s.readyContinuationCompletionRunnerTargetCount}`);
  if (s.blockedContinuationCompletionRunnerTargetCount !== 0) throw new Error(`Expected blockedContinuationCompletionRunnerTargetCount=0, got ${s.blockedContinuationCompletionRunnerTargetCount}`);
  if (s.mainLaneContinuationCompletionRunnerTargetCount !== 4) throw new Error(`Expected mainLaneContinuationCompletionRunnerTargetCount=4, got ${s.mainLaneContinuationCompletionRunnerTargetCount}`);
  if (s.repairBacklogContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogContinuationCompletionRunnerTargetCount=1, got ${s.repairBacklogContinuationCompletionRunnerTargetCount}`);
  if (s.sportomediaRepairContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairContinuationCompletionRunnerTargetCount=1, got ${s.sportomediaRepairContinuationCompletionRunnerTargetCount}`);

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

  if (!row.continuationCompletionExecutionRowId) failures.push("missing_completion_execution_row_id");
  if (!row.continuationCompletionExecutionApprovalRowId) failures.push("missing_completion_execution_approval_row_id");
  if (!row.continuationCompletionRunnerTargetId) failures.push("missing_completion_runner_target_id");
  if (!row.continuationCompletionActionPackQualityGateRowId) failures.push("missing_completion_action_pack_quality_gate_row_id");
  if (!row.continuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!row.continuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.completionRouteFamily) failures.push("missing_completion_route_family");
  if (!row.completionRunnerGroup) failures.push("missing_completion_runner_group");

  if (row.executionStatus !== "completion_target_executed_as_diagnostics_only_no_fetch_no_write") {
    failures.push(`unexpected_execution_status:${row.executionStatus}`);
  }

  if (row.materializedArtifactKind !== "diagnostics_only_completion_execution_trace") {
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
  throw new Error(`Expected 5 completion execution rows, got ${executionRows.length}`);
}

const verificationRows = executionRows.map((row, index) => {
  const failures = validateExecutionRow(row);

  return {
    continuationCompletionExecutionVerificationRowId: `post_six_league_completion_execution_verification_${String(index + 1).padStart(2, "0")}`,
    continuationCompletionExecutionRowId: row.continuationCompletionExecutionRowId,
    continuationCompletionExecutionApprovalRowId: row.continuationCompletionExecutionApprovalRowId,
    continuationCompletionRunnerTargetId: row.continuationCompletionRunnerTargetId,
    continuationCompletionActionPackQualityGateRowId: row.continuationCompletionActionPackQualityGateRowId,
    continuationCompletionActionPackRowId: row.continuationCompletionActionPackRowId,
    continuationCompletionRoutingRowId: row.continuationCompletionRoutingRowId,
    continuationExecutionVerificationRowId: row.continuationExecutionVerificationRowId,
    continuationExecutionRowId: row.continuationExecutionRowId,
    continuationExecutionApprovalRowId: row.continuationExecutionApprovalRowId,
    continuationRunnerTargetId: row.continuationRunnerTargetId,
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
    verificationStatus:
      failures.length === 0
        ? "verified_diagnostics_only_completion_execution"
        : "blocked_completion_execution_verification",
    failures,
    noFetchVerified: row.fetchExecutedNow === false,
    noSearchVerified: row.searchExecutedNow === false,
    noWriteVerified: row.canonicalWriteExecutedNow === false && row.productionWriteExecutedNow === false,
    noTruthAssertionVerified: row.truthAssertionExecutedNow === false
  };
});

const verifiedRows = verificationRows.filter(
  (row) => row.verificationStatus === "verified_diagnostics_only_completion_execution"
);

const blockedRows = verificationRows.filter(
  (row) => row.verificationStatus !== "verified_diagnostics_only_completion_execution"
);

const summary = {
  postSixLeagueFullMapContinuationCompletionExecutionVerificationReadCount: 3,
  sourceCompletionExecutionRowCount: executionRows.length,
  verificationRowCount: verificationRows.length,
  verifiedCompletionExecutionRowCount: verifiedRows.length,
  blockedCompletionExecutionVerificationCount: blockedRows.length,

  verifiedMainLaneCompletionExecutionCount: countWhere(
    verifiedRows,
    (row) => row.completionRouteFamily === "whole_map_main_lane_completion"
  ),
  verifiedRepairBacklogCompletionExecutionCount: countWhere(
    verifiedRows,
    (row) => row.completionRouteFamily === "repair_backlog_completion"
  ),
  verifiedSportomediaRepairCompletionExecutionCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.completionRouteFamily === "repair_backlog_completion"
  ),

  diagnosticsOnlyCompletionExecutionVerifiedCount: verifiedRows.length,
  mayBuildPostSixLeagueFullMapContinuationCompletionCloseoutArtifactCount:
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
  job: "verify-football-truth-post-six-league-full-map-continuation-completion-execution-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_completion_execution_verification_gate",
  dryRun: true,
  inputs: {
    postSixLeagueCompletionExecutionRunner: executionRunnerPath,
    postSixLeagueCompletionExecutionApprovalGate: executionApprovalPath,
    postSixLeagueCompletionRunnerManifest: runnerManifestPath
  },
  policy: {
    verificationOnly: true,
    verifyDiagnosticsOnlyCompletionExecution: true,
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
  throw new Error(`Completion execution verification blocked ${blockedRows.length} rows`);
}
