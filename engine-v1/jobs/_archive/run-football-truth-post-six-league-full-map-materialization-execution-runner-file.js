import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_EXECUTE = process.argv.includes("--allow-execute");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-materialization-execution-approval-gate-2026-06-15.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-runner-manifest-2026-06-15",
  "post-six-league-full-map-materialization-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-quality-gate-2026-06-15",
  "post-six-league-full-map-materialization-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-materialization-execution-runner-2026-06-15.json"
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

function validateApprovalGate(input) {
  const s = input.summary || {};

  if (s.executionApprovalRowCount !== 5) throw new Error(`Expected executionApprovalRowCount=5, got ${s.executionApprovalRowCount}`);
  if (s.approvedExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedExecutionApprovalRowCount=5, got ${s.approvedExecutionApprovalRowCount}`);
  if (s.blockedExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedExecutionApprovalRowCount=0, got ${s.blockedExecutionApprovalRowCount}`);
  if (s.mayBuildPostSixLeagueFullMapMaterializationExecutionRunnerCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapMaterializationExecutionRunnerCount=1");
  }

  if (s.nextRunnerMayExecuteMaterializationCount !== 5) {
    throw new Error(`Expected nextRunnerMayExecuteMaterializationCount=5, got ${s.nextRunnerMayExecuteMaterializationCount}`);
  }

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
  ].forEach((key) => assertZero(s[key], `approval.summary.${key}`));

  assertFalse(input.productionWrite, "approval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "approval.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "approval.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "approval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "approval.classifierExecuted");
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
  ].forEach((key) => assertZero(s[key], `manifest.summary.${key}`));

  assertFalse(input.productionWrite, "manifest.productionWrite");
  assertFalse(input.sourceFetch?.executed, "manifest.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "manifest.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "manifest.broadSearchUsed");
  assertFalse(input.classifierExecuted, "manifest.classifierExecuted");
}

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.materializationQualityGatePassedCount !== 5) {
    throw new Error(`Expected materializationQualityGatePassedCount=5, got ${s.materializationQualityGatePassedCount}`);
  }

  if (s.materializationQualityGateBlockedCount !== 0) {
    throw new Error(`Expected materializationQualityGateBlockedCount=0, got ${s.materializationQualityGateBlockedCount}`);
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
  ].forEach((key) => assertZero(s[key], `qualityGate.summary.${key}`));

  assertFalse(input.productionWrite, "qualityGate.productionWrite");
  assertFalse(input.sourceFetch?.executed, "qualityGate.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "qualityGate.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "qualityGate.broadSearchUsed");
  assertFalse(input.classifierExecuted, "qualityGate.classifierExecuted");
}

if (!ALLOW_EXECUTE) {
  throw new Error("Refusing to execute materialization runner without explicit --allow-execute");
}

const approval = readJson(approvalPath);
const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateApprovalGate(approval);
validateManifest(manifest);
validateQualityGate(qualityGate);

const approvalRows = Array.isArray(approval.approvalRows) ? approval.approvalRows : [];
const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];

if (approvalRows.length !== 5) throw new Error(`Expected 5 approval rows, got ${approvalRows.length}`);
if (runnerTargets.length !== 5) throw new Error(`Expected 5 runner targets, got ${runnerTargets.length}`);

const targetById = new Map(runnerTargets.map((target) => [target.runnerTargetId, target]));

const executionRows = approvalRows.map((row, index) => {
  if (row.approvalStatus !== "approved_to_build_materialization_execution_runner") {
    throw new Error(`Cannot execute non-approved row: ${row.materializationExecutionApprovalRowId}`);
  }

  if (row.nextRunnerMayExecuteMaterialization !== true) {
    throw new Error(`Approval row lacks execution permission for next runner: ${row.materializationExecutionApprovalRowId}`);
  }

  if (
    row.nextRunnerMayFetch !== false ||
    row.nextRunnerMaySearch !== false ||
    row.nextRunnerMayBroadSearch !== false ||
    row.nextRunnerMayClassify !== false ||
    row.nextRunnerMayWriteCanonical !== false ||
    row.nextRunnerMayWriteProduction !== false ||
    row.nextRunnerMayAssertTruth !== false
  ) {
    throw new Error(`Approval row grants forbidden side-effect permission: ${row.materializationExecutionApprovalRowId}`);
  }

  const target = targetById.get(row.runnerTargetId);
  if (!target) throw new Error(`Missing runner target for approval row ${row.runnerTargetId}`);

  return {
    materializationExecutionRowId: `post_six_league_materialization_execution_${String(index + 1).padStart(2, "0")}`,
    materializationExecutionApprovalRowId: row.materializationExecutionApprovalRowId,
    runnerTargetId: row.runnerTargetId,
    materializationQualityGateRowId: row.materializationQualityGateRowId,
    materializationPlanRowId: row.materializationPlanRowId,
    sourceLane: row.sourceLane,
    materializationLane: row.materializationLane,
    materializationIntent: row.materializationIntent,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup,
    executionStatus: "materialization_target_executed_as_diagnostics_only_no_fetch_no_write",
    materializedArtifactKind: "diagnostics_only_materialization_execution_trace",
    executionAllowedByExplicitFlag: true,
    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false
  };
});

const summary = {
  postSixLeagueFullMapMaterializationExecutionRunnerReadCount: 3,
  allowExecuteFlagPresent: ALLOW_EXECUTE,

  sourceExecutionApprovalRowCount: approvalRows.length,
  sourceRunnerTargetCount: runnerTargets.length,

  materializationExecutionRowCount: executionRows.length,
  executedMaterializationTargetCount: countWhere(
    executionRows,
    (row) => row.executionStatus === "materialization_target_executed_as_diagnostics_only_no_fetch_no_write"
  ),

  mainLaneMaterializationExecutedCount: countWhere(
    executionRows,
    (row) => row.executionGroup === "main_lane_materialization_group"
  ),
  repairBacklogMaterializationExecutedCount: countWhere(
    executionRows,
    (row) => row.executionGroup === "repair_backlog_materialization_group"
  ),
  sportomediaRepairMaterializationExecutedCount: countWhere(
    executionRows,
    (row) => row.providerFamily === "sportomedia" && row.executionGroup === "repair_backlog_materialization_group"
  ),

  diagnosticsOnlyMaterializationExecutionTraceCount: executionRows.length,

  mayBuildPostSixLeagueFullMapMaterializationExecutionVerificationGateCount: 1,

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
  job: "run-football-truth-post-six-league-full-map-materialization-execution-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "explicit_allow_execute_diagnostics_only_materialization_execution_runner",
  dryRun: false,
  inputs: {
    postSixLeagueMaterializationExecutionApprovalGate: approvalPath,
    postSixLeagueMaterializationRunnerManifest: manifestPath,
    postSixLeagueMaterializationQualityGate: qualityGatePath
  },
  policy: {
    explicitAllowExecuteFlagRequired: true,
    diagnosticsOnlyExecutionTrace: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  executionRows,
  blockedRows: [],
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
