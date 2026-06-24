import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-runner-2026-06-15",
  "post-six-league-full-map-continuation-execution-runner-2026-06-15.json"
);

const executionApprovalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-continuation-execution-approval-gate-2026-06-15.json"
);

const runnerManifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-runner-manifest-2026-06-15",
  "post-six-league-full-map-continuation-runner-manifest-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-execution-verification-2026-06-15.json"
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
  if (s.sourceContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceContinuationExecutionApprovalRowCount=5, got ${s.sourceContinuationExecutionApprovalRowCount}`);
  if (s.sourceContinuationRunnerTargetCount !== 5) throw new Error(`Expected sourceContinuationRunnerTargetCount=5, got ${s.sourceContinuationRunnerTargetCount}`);
  if (s.continuationExecutionRowCount !== 5) throw new Error(`Expected continuationExecutionRowCount=5, got ${s.continuationExecutionRowCount}`);
  if (s.executedContinuationTargetCount !== 5) throw new Error(`Expected executedContinuationTargetCount=5, got ${s.executedContinuationTargetCount}`);
  if (s.mainLaneContinuationExecutedCount !== 4) throw new Error(`Expected mainLaneContinuationExecutedCount=4, got ${s.mainLaneContinuationExecutedCount}`);
  if (s.repairBacklogContinuationExecutedCount !== 1) throw new Error(`Expected repairBacklogContinuationExecutedCount=1, got ${s.repairBacklogContinuationExecutedCount}`);
  if (s.sportomediaRepairContinuationExecutedCount !== 1) throw new Error(`Expected sportomediaRepairContinuationExecutedCount=1, got ${s.sportomediaRepairContinuationExecutedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionTraceCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionTraceCount=5, got ${s.diagnosticsOnlyContinuationExecutionTraceCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationExecutionVerificationGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationExecutionVerificationGateCount=1");
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

  if (s.continuationExecutionApprovalRowCount !== 5) throw new Error(`Expected continuationExecutionApprovalRowCount=5, got ${s.continuationExecutionApprovalRowCount}`);
  if (s.approvedContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedContinuationExecutionApprovalRowCount=5, got ${s.approvedContinuationExecutionApprovalRowCount}`);
  if (s.blockedContinuationExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedContinuationExecutionApprovalRowCount=0, got ${s.blockedContinuationExecutionApprovalRowCount}`);
  if (s.approvedMainLaneContinuationExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneContinuationExecutionTargetCount=4, got ${s.approvedMainLaneContinuationExecutionTargetCount}`);
  if (s.approvedRepairBacklogContinuationExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogContinuationExecutionTargetCount=1, got ${s.approvedRepairBacklogContinuationExecutionTargetCount}`);
  if (s.approvedSportomediaRepairContinuationExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairContinuationExecutionTargetCount=1, got ${s.approvedSportomediaRepairContinuationExecutionTargetCount}`);
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

function validateRunnerManifest(input) {
  const s = input.summary || {};

  if (s.continuationRunnerTargetCount !== 5) throw new Error(`Expected continuationRunnerTargetCount=5, got ${s.continuationRunnerTargetCount}`);
  if (s.readyContinuationRunnerTargetCount !== 5) throw new Error(`Expected readyContinuationRunnerTargetCount=5, got ${s.readyContinuationRunnerTargetCount}`);
  if (s.blockedContinuationRunnerTargetCount !== 0) throw new Error(`Expected blockedContinuationRunnerTargetCount=0, got ${s.blockedContinuationRunnerTargetCount}`);
  if (s.mainLaneContinuationRunnerTargetCount !== 4) throw new Error(`Expected mainLaneContinuationRunnerTargetCount=4, got ${s.mainLaneContinuationRunnerTargetCount}`);
  if (s.repairBacklogContinuationRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogContinuationRunnerTargetCount=1, got ${s.repairBacklogContinuationRunnerTargetCount}`);
  if (s.sportomediaRepairContinuationRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairContinuationRunnerTargetCount=1, got ${s.sportomediaRepairContinuationRunnerTargetCount}`);

  [
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

  if (!row.continuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.continuationExecutionApprovalRowId) failures.push("missing_continuation_execution_approval_row_id");
  if (!row.continuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.routeFamily) failures.push("missing_route_family");
  if (!row.continuationRunnerGroup) failures.push("missing_continuation_runner_group");

  if (row.executionStatus !== "continuation_target_executed_as_diagnostics_only_no_fetch_no_write") {
    failures.push(`unexpected_execution_status:${row.executionStatus}`);
  }

  if (row.materializedArtifactKind !== "diagnostics_only_continuation_execution_trace") {
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
  throw new Error(`Expected 5 continuation execution rows, got ${executionRows.length}`);
}

const verificationRows = executionRows.map((row, index) => {
  const failures = validateExecutionRow(row);

  return {
    continuationExecutionVerificationRowId: `post_six_league_continuation_execution_verification_${String(index + 1).padStart(2, "0")}`,
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
    verificationStatus:
      failures.length === 0
        ? "verified_diagnostics_only_continuation_execution"
        : "blocked_continuation_execution_verification",
    failures,
    noFetchVerified: row.fetchExecutedNow === false,
    noSearchVerified: row.searchExecutedNow === false,
    noWriteVerified: row.canonicalWriteExecutedNow === false && row.productionWriteExecutedNow === false,
    noTruthAssertionVerified: row.truthAssertionExecutedNow === false
  };
});

const verifiedRows = verificationRows.filter(
  (row) => row.verificationStatus === "verified_diagnostics_only_continuation_execution"
);

const blockedRows = verificationRows.filter(
  (row) => row.verificationStatus !== "verified_diagnostics_only_continuation_execution"
);

const summary = {
  postSixLeagueFullMapContinuationExecutionVerificationReadCount: 3,
  sourceContinuationExecutionRowCount: executionRows.length,
  verificationRowCount: verificationRows.length,
  verifiedContinuationExecutionRowCount: verifiedRows.length,
  blockedContinuationExecutionVerificationCount: blockedRows.length,

  verifiedMainLaneContinuationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.routeFamily === "whole_map_main_lane_continuation"
  ),
  verifiedRepairBacklogContinuationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.routeFamily === "repair_backlog_continuation"
  ),
  verifiedSportomediaRepairContinuationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.routeFamily === "repair_backlog_continuation"
  ),

  diagnosticsOnlyContinuationExecutionVerifiedCount: verifiedRows.length,
  mayBuildPostSixLeagueFullMapContinuationCompletionRoutingArtifactCount: blockedRows.length === 0 ? 1 : 0,

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
  job: "verify-football-truth-post-six-league-full-map-continuation-execution-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_continuation_execution_verification_gate",
  dryRun: true,
  inputs: {
    postSixLeagueContinuationExecutionRunner: executionRunnerPath,
    postSixLeagueContinuationExecutionApprovalGate: executionApprovalPath,
    postSixLeagueContinuationRunnerManifest: runnerManifestPath
  },
  policy: {
    verificationOnly: true,
    verifyDiagnosticsOnlyContinuationExecution: true,
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
  throw new Error(`Continuation execution verification blocked ${blockedRows.length} rows`);
}
