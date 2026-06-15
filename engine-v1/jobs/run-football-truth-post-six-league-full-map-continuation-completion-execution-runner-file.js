import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_EXECUTE = process.argv.includes("--allow-execute");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-continuation-completion-execution-approval-gate-2026-06-15.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-runner-manifest-2026-06-15",
  "post-six-league-full-map-continuation-completion-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-continuation-completion-action-pack-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-completion-execution-runner-2026-06-15.json"
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

  if (s.continuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected continuationCompletionExecutionApprovalRowCount=5, got ${s.continuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedContinuationCompletionExecutionApprovalRowCount=5, got ${s.approvedContinuationCompletionExecutionApprovalRowCount}`);
  if (s.blockedContinuationCompletionExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedContinuationCompletionExecutionApprovalRowCount=0, got ${s.blockedContinuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedMainLaneContinuationCompletionExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneContinuationCompletionExecutionTargetCount=4, got ${s.approvedMainLaneContinuationCompletionExecutionTargetCount}`);
  if (s.approvedRepairBacklogContinuationCompletionExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogContinuationCompletionExecutionTargetCount=1, got ${s.approvedRepairBacklogContinuationCompletionExecutionTargetCount}`);
  if (s.approvedSportomediaRepairContinuationCompletionExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairContinuationCompletionExecutionTargetCount=1, got ${s.approvedSportomediaRepairContinuationCompletionExecutionTargetCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionExecutionRunnerCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionExecutionRunnerCount=1");
  if (s.nextRunnerMayExecuteCompletionCount !== 5) throw new Error(`Expected nextRunnerMayExecuteCompletionCount=5, got ${s.nextRunnerMayExecuteCompletionCount}`);

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

  if (s.continuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected continuationCompletionRunnerTargetCount=5, got ${s.continuationCompletionRunnerTargetCount}`);
  if (s.readyContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected readyContinuationCompletionRunnerTargetCount=5, got ${s.readyContinuationCompletionRunnerTargetCount}`);
  if (s.blockedContinuationCompletionRunnerTargetCount !== 0) throw new Error(`Expected blockedContinuationCompletionRunnerTargetCount=0, got ${s.blockedContinuationCompletionRunnerTargetCount}`);
  if (s.mainLaneContinuationCompletionRunnerTargetCount !== 4) throw new Error(`Expected mainLaneContinuationCompletionRunnerTargetCount=4, got ${s.mainLaneContinuationCompletionRunnerTargetCount}`);
  if (s.repairBacklogContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogContinuationCompletionRunnerTargetCount=1, got ${s.repairBacklogContinuationCompletionRunnerTargetCount}`);
  if (s.sportomediaRepairContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairContinuationCompletionRunnerTargetCount=1, got ${s.sportomediaRepairContinuationCompletionRunnerTargetCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionExecutionApprovalGateCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionExecutionApprovalGateCount=1");

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
  ].forEach((key) => assertZero(s[key], `manifest.summary.${key}`));

  assertFalse(input.productionWrite, "manifest.productionWrite");
  assertFalse(input.sourceFetch?.executed, "manifest.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "manifest.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "manifest.broadSearchUsed");
  assertFalse(input.classifierExecuted, "manifest.classifierExecuted");
}

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.continuationCompletionActionPackQualityGateRowCount !== 5) throw new Error(`Expected continuationCompletionActionPackQualityGateRowCount=5, got ${s.continuationCompletionActionPackQualityGateRowCount}`);
  if (s.continuationCompletionActionPackQualityGatePassedCount !== 5) throw new Error(`Expected continuationCompletionActionPackQualityGatePassedCount=5, got ${s.continuationCompletionActionPackQualityGatePassedCount}`);
  if (s.continuationCompletionActionPackQualityGateBlockedCount !== 0) throw new Error(`Expected continuationCompletionActionPackQualityGateBlockedCount=0, got ${s.continuationCompletionActionPackQualityGateBlockedCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionRunnerManifestCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionRunnerManifestCount=1");

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
  throw new Error("Refusing to execute completion runner without explicit --allow-execute");
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

const targetById = new Map(runnerTargets.map((target) => [target.continuationCompletionRunnerTargetId, target]));

const executionRows = approvalRows.map((row, index) => {
  if (row.approvalStatus !== "approved_to_build_completion_execution_runner") {
    throw new Error(`Cannot execute non-approved completion row: ${row.continuationCompletionExecutionApprovalRowId}`);
  }

  if (row.nextRunnerMayExecuteCompletion !== true) {
    throw new Error(`Approval row lacks completion execution permission: ${row.continuationCompletionExecutionApprovalRowId}`);
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
    throw new Error(`Approval row grants forbidden side-effect permission: ${row.continuationCompletionExecutionApprovalRowId}`);
  }

  const target = targetById.get(row.continuationCompletionRunnerTargetId);
  if (!target) throw new Error(`Missing completion runner target for approval row ${row.continuationCompletionRunnerTargetId}`);

  return {
    continuationCompletionExecutionRowId: `post_six_league_completion_execution_${String(index + 1).padStart(2, "0")}`,
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
    executionStatus: "completion_target_executed_as_diagnostics_only_no_fetch_no_write",
    materializedArtifactKind: "diagnostics_only_completion_execution_trace",
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
  postSixLeagueFullMapContinuationCompletionExecutionRunnerReadCount: 3,
  allowExecuteFlagPresent: ALLOW_EXECUTE,

  sourceContinuationCompletionExecutionApprovalRowCount: approvalRows.length,
  sourceContinuationCompletionRunnerTargetCount: runnerTargets.length,

  completionExecutionRowCount: executionRows.length,
  executedCompletionTargetCount: countWhere(
    executionRows,
    (row) => row.executionStatus === "completion_target_executed_as_diagnostics_only_no_fetch_no_write"
  ),

  mainLaneCompletionExecutedCount: countWhere(
    executionRows,
    (row) => row.completionRouteFamily === "whole_map_main_lane_completion"
  ),
  repairBacklogCompletionExecutedCount: countWhere(
    executionRows,
    (row) => row.completionRouteFamily === "repair_backlog_completion"
  ),
  sportomediaRepairCompletionExecutedCount: countWhere(
    executionRows,
    (row) => row.providerFamily === "sportomedia" && row.completionRouteFamily === "repair_backlog_completion"
  ),

  diagnosticsOnlyCompletionExecutionTraceCount: executionRows.length,
  mayBuildPostSixLeagueFullMapContinuationCompletionExecutionVerificationGateCount: 1,

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
  job: "run-football-truth-post-six-league-full-map-continuation-completion-execution-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "explicit_allow_execute_diagnostics_only_completion_execution_runner",
  dryRun: false,
  inputs: {
    postSixLeagueCompletionExecutionApprovalGate: approvalPath,
    postSixLeagueCompletionRunnerManifest: manifestPath,
    postSixLeagueCompletionActionPackQualityGate: qualityGatePath
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
