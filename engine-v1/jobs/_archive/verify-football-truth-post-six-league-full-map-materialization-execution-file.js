import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-runner-2026-06-15",
  "post-six-league-full-map-materialization-execution-runner-2026-06-15.json"
);

const executionApprovalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-materialization-execution-approval-gate-2026-06-15.json"
);

const runnerManifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-runner-manifest-2026-06-15",
  "post-six-league-full-map-materialization-runner-manifest-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-materialization-execution-verification-2026-06-15.json"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
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
  if (s.sourceExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceExecutionApprovalRowCount=5, got ${s.sourceExecutionApprovalRowCount}`);
  if (s.sourceRunnerTargetCount !== 5) throw new Error(`Expected sourceRunnerTargetCount=5, got ${s.sourceRunnerTargetCount}`);
  if (s.materializationExecutionRowCount !== 5) throw new Error(`Expected materializationExecutionRowCount=5, got ${s.materializationExecutionRowCount}`);
  if (s.executedMaterializationTargetCount !== 5) throw new Error(`Expected executedMaterializationTargetCount=5, got ${s.executedMaterializationTargetCount}`);
  if (s.mainLaneMaterializationExecutedCount !== 4) throw new Error(`Expected mainLaneMaterializationExecutedCount=4, got ${s.mainLaneMaterializationExecutedCount}`);
  if (s.repairBacklogMaterializationExecutedCount !== 1) throw new Error(`Expected repairBacklogMaterializationExecutedCount=1, got ${s.repairBacklogMaterializationExecutedCount}`);
  if (s.sportomediaRepairMaterializationExecutedCount !== 1) throw new Error(`Expected sportomediaRepairMaterializationExecutedCount=1, got ${s.sportomediaRepairMaterializationExecutedCount}`);
  if (s.diagnosticsOnlyMaterializationExecutionTraceCount !== 5) throw new Error(`Expected diagnosticsOnlyMaterializationExecutionTraceCount=5, got ${s.diagnosticsOnlyMaterializationExecutionTraceCount}`);
  if (s.mayBuildPostSixLeagueFullMapMaterializationExecutionVerificationGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapMaterializationExecutionVerificationGateCount=1");
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

function validateApprovalGate(input) {
  const s = input.summary || {};

  if (s.executionApprovalRowCount !== 5) throw new Error(`Expected executionApprovalRowCount=5, got ${s.executionApprovalRowCount}`);
  if (s.approvedExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedExecutionApprovalRowCount=5, got ${s.approvedExecutionApprovalRowCount}`);
  if (s.blockedExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedExecutionApprovalRowCount=0, got ${s.blockedExecutionApprovalRowCount}`);
  if (s.nextRunnerMayExecuteMaterializationCount !== 5) throw new Error(`Expected nextRunnerMayExecuteMaterializationCount=5, got ${s.nextRunnerMayExecuteMaterializationCount}`);

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
}

function validateManifest(input) {
  const s = input.summary || {};

  if (s.runnerTargetCount !== 5) throw new Error(`Expected runnerTargetCount=5, got ${s.runnerTargetCount}`);
  if (s.readyRunnerTargetCount !== 5) throw new Error(`Expected readyRunnerTargetCount=5, got ${s.readyRunnerTargetCount}`);
  if (s.blockedRunnerTargetCount !== 0) throw new Error(`Expected blockedRunnerTargetCount=0, got ${s.blockedRunnerTargetCount}`);

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
}

function validateExecutionRow(row) {
  const failures = [];

  if (!row.materializationExecutionRowId) failures.push("missing_materialization_execution_row_id");
  if (!row.materializationExecutionApprovalRowId) failures.push("missing_execution_approval_row_id");
  if (!row.runnerTargetId) failures.push("missing_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.executionGroup) failures.push("missing_execution_group");

  if (row.executionStatus !== "materialization_target_executed_as_diagnostics_only_no_fetch_no_write") {
    failures.push(`unexpected_execution_status:${row.executionStatus}`);
  }

  if (row.materializedArtifactKind !== "diagnostics_only_materialization_execution_trace") {
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
validateApprovalGate(executionApproval);
validateManifest(runnerManifest);

const executionRows = Array.isArray(executionRunner.executionRows) ? executionRunner.executionRows : [];
if (executionRows.length !== 5) {
  throw new Error(`Expected 5 execution rows, got ${executionRows.length}`);
}

const verificationRows = executionRows.map((row, index) => {
  const failures = validateExecutionRow(row);

  return {
    materializationExecutionVerificationRowId: `post_six_league_materialization_execution_verification_${String(index + 1).padStart(2, "0")}`,
    materializationExecutionRowId: row.materializationExecutionRowId,
    materializationExecutionApprovalRowId: row.materializationExecutionApprovalRowId,
    runnerTargetId: row.runnerTargetId,
    sourceLane: row.sourceLane,
    materializationLane: row.materializationLane,
    executionGroup: row.executionGroup,
    providerFamily: row.providerFamily || null,
    verificationStatus:
      failures.length === 0
        ? "verified_diagnostics_only_materialization_execution"
        : "blocked_materialization_execution_verification",
    failures,
    noFetchVerified: row.fetchExecutedNow === false,
    noSearchVerified: row.searchExecutedNow === false,
    noWriteVerified: row.canonicalWriteExecutedNow === false && row.productionWriteExecutedNow === false,
    noTruthAssertionVerified: row.truthAssertionExecutedNow === false
  };
});

const verifiedRows = verificationRows.filter((row) => row.failures.length === 0);
const blockedRows = verificationRows.filter((row) => row.failures.length > 0);

const summary = {
  postSixLeagueFullMapMaterializationExecutionVerificationReadCount: 3,
  sourceMaterializationExecutionRowCount: executionRows.length,
  verificationRowCount: verificationRows.length,
  verifiedMaterializationExecutionRowCount: verifiedRows.length,
  blockedMaterializationExecutionVerificationCount: blockedRows.length,

  verifiedMainLaneMaterializationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.executionGroup === "main_lane_materialization_group"
  ),
  verifiedRepairBacklogMaterializationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.executionGroup === "repair_backlog_materialization_group"
  ),
  verifiedSportomediaRepairMaterializationExecutionCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.executionGroup === "repair_backlog_materialization_group"
  ),

  diagnosticsOnlyMaterializationExecutionVerifiedCount: verifiedRows.length,
  mayBuildPostSixLeagueFullMapContinuationRoutingArtifactCount: blockedRows.length === 0 ? 1 : 0,

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
  job: "verify-football-truth-post-six-league-full-map-materialization-execution-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_materialization_execution_verification_gate",
  dryRun: true,
  inputs: {
    postSixLeagueMaterializationExecutionRunner: executionRunnerPath,
    postSixLeagueMaterializationExecutionApprovalGate: executionApprovalPath,
    postSixLeagueMaterializationRunnerManifest: runnerManifestPath
  },
  policy: {
    verificationOnly: true,
    verifyDiagnosticsOnlyMaterializationExecution: true,
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
  throw new Error(`Materialization execution verification blocked ${blockedRows.length} rows`);
}
