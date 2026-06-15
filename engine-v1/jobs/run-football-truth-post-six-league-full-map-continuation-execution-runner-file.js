import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_EXECUTE = process.argv.includes("--allow-execute");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-continuation-execution-approval-gate-2026-06-15.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-runner-manifest-2026-06-15",
  "post-six-league-full-map-continuation-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-continuation-action-pack-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-execution-runner-2026-06-15.json"
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

function validateApproval(input) {
  const s = input.summary || {};

  if (s.continuationExecutionApprovalRowCount !== 5) throw new Error(`Expected continuationExecutionApprovalRowCount=5, got ${s.continuationExecutionApprovalRowCount}`);
  if (s.approvedContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedContinuationExecutionApprovalRowCount=5, got ${s.approvedContinuationExecutionApprovalRowCount}`);
  if (s.blockedContinuationExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedContinuationExecutionApprovalRowCount=0, got ${s.blockedContinuationExecutionApprovalRowCount}`);
  if (s.approvedMainLaneContinuationExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneContinuationExecutionTargetCount=4, got ${s.approvedMainLaneContinuationExecutionTargetCount}`);
  if (s.approvedRepairBacklogContinuationExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogContinuationExecutionTargetCount=1, got ${s.approvedRepairBacklogContinuationExecutionTargetCount}`);
  if (s.approvedSportomediaRepairContinuationExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairContinuationExecutionTargetCount=1, got ${s.approvedSportomediaRepairContinuationExecutionTargetCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationExecutionRunnerCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationExecutionRunnerCount=1");
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
  ].forEach((key) => assertZero(s[key], `approval.summary.${key}`));

  assertFalse(input.productionWrite, "approval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "approval.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "approval.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "approval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "approval.classifierExecuted");
}

function validateManifest(input) {
  const s = input.summary || {};

  if (s.continuationRunnerTargetCount !== 5) throw new Error(`Expected continuationRunnerTargetCount=5, got ${s.continuationRunnerTargetCount}`);
  if (s.readyContinuationRunnerTargetCount !== 5) throw new Error(`Expected readyContinuationRunnerTargetCount=5, got ${s.readyContinuationRunnerTargetCount}`);
  if (s.blockedContinuationRunnerTargetCount !== 0) throw new Error(`Expected blockedContinuationRunnerTargetCount=0, got ${s.blockedContinuationRunnerTargetCount}`);
  if (s.mainLaneContinuationRunnerTargetCount !== 4) throw new Error(`Expected mainLaneContinuationRunnerTargetCount=4, got ${s.mainLaneContinuationRunnerTargetCount}`);
  if (s.repairBacklogContinuationRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogContinuationRunnerTargetCount=1, got ${s.repairBacklogContinuationRunnerTargetCount}`);
  if (s.sportomediaRepairContinuationRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairContinuationRunnerTargetCount=1, got ${s.sportomediaRepairContinuationRunnerTargetCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationExecutionApprovalGateCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationExecutionApprovalGateCount=1");

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

  if (s.continuationActionPackQualityGatePassedCount !== 5) throw new Error(`Expected continuationActionPackQualityGatePassedCount=5, got ${s.continuationActionPackQualityGatePassedCount}`);
  if (s.continuationActionPackQualityGateBlockedCount !== 0) throw new Error(`Expected continuationActionPackQualityGateBlockedCount=0, got ${s.continuationActionPackQualityGateBlockedCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationRunnerManifestCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationRunnerManifestCount=1");

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
}

if (!ALLOW_EXECUTE) {
  throw new Error("Refusing to execute continuation runner without explicit --allow-execute");
}

const approval = readJson(approvalPath);
const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateApproval(approval);
validateManifest(manifest);
validateQualityGate(qualityGate);

const approvalRows = Array.isArray(approval.approvalRows) ? approval.approvalRows : [];
const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];

if (approvalRows.length !== 5) throw new Error(`Expected 5 approval rows, got ${approvalRows.length}`);
if (runnerTargets.length !== 5) throw new Error(`Expected 5 runner targets, got ${runnerTargets.length}`);

const targetById = new Map(runnerTargets.map((target) => [target.continuationRunnerTargetId, target]));

const executionRows = approvalRows.map((row, index) => {
  if (row.approvalStatus !== "approved_to_build_continuation_execution_runner") {
    throw new Error(`Cannot execute non-approved continuation row: ${row.continuationExecutionApprovalRowId}`);
  }

  if (row.nextRunnerMayExecuteContinuation !== true) {
    throw new Error(`Approval row lacks continuation execution permission: ${row.continuationExecutionApprovalRowId}`);
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
    throw new Error(`Approval row grants forbidden side-effect permission: ${row.continuationExecutionApprovalRowId}`);
  }

  const target = targetById.get(row.continuationRunnerTargetId);
  if (!target) throw new Error(`Missing runner target for approval row ${row.continuationRunnerTargetId}`);

  return {
    continuationExecutionRowId: `post_six_league_continuation_execution_${String(index + 1).padStart(2, "0")}`,
    continuationExecutionApprovalRowId: row.continuationExecutionApprovalRowId,
    continuationRunnerTargetId: row.continuationRunnerTargetId,
    continuationActionPackQualityGateRowId: row.continuationActionPackQualityGateRowId,
    continuationActionPackRowId: row.continuationActionPackRowId,
    sourceContinuationRoutingRowId: row.sourceContinuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    continuationRunnerGroup: row.continuationRunnerGroup,
    executionStatus: "continuation_target_executed_as_diagnostics_only_no_fetch_no_write",
    materializedArtifactKind: "diagnostics_only_continuation_execution_trace",
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
  postSixLeagueFullMapContinuationExecutionRunnerReadCount: 3,
  allowExecuteFlagPresent: ALLOW_EXECUTE,

  sourceContinuationExecutionApprovalRowCount: approvalRows.length,
  sourceContinuationRunnerTargetCount: runnerTargets.length,

  continuationExecutionRowCount: executionRows.length,
  executedContinuationTargetCount: countWhere(
    executionRows,
    (row) => row.executionStatus === "continuation_target_executed_as_diagnostics_only_no_fetch_no_write"
  ),

  mainLaneContinuationExecutedCount: countWhere(
    executionRows,
    (row) => row.routeFamily === "whole_map_main_lane_continuation"
  ),
  repairBacklogContinuationExecutedCount: countWhere(
    executionRows,
    (row) => row.routeFamily === "repair_backlog_continuation"
  ),
  sportomediaRepairContinuationExecutedCount: countWhere(
    executionRows,
    (row) => row.providerFamily === "sportomedia" && row.routeFamily === "repair_backlog_continuation"
  ),

  diagnosticsOnlyContinuationExecutionTraceCount: executionRows.length,
  mayBuildPostSixLeagueFullMapContinuationExecutionVerificationGateCount: 1,

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
  job: "run-football-truth-post-six-league-full-map-continuation-execution-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "explicit_allow_execute_diagnostics_only_continuation_execution_runner",
  dryRun: false,
  inputs: {
    postSixLeagueContinuationExecutionApprovalGate: approvalPath,
    postSixLeagueContinuationRunnerManifest: manifestPath,
    postSixLeagueContinuationActionPackQualityGate: qualityGatePath
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
