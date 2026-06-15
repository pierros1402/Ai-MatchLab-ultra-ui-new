import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_EXECUTE = process.argv.includes("--allow-execute");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-execution-approval-gate-2026-06-15.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-runner-manifest-2026-06-15",
  "post-six-league-full-map-next-cycle-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-action-pack-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-execution-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-execution-runner-2026-06-15.json"
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

  if (s.nextCycleExecutionApprovalRowCount !== 5) throw new Error(`Expected nextCycleExecutionApprovalRowCount=5, got ${s.nextCycleExecutionApprovalRowCount}`);
  if (s.approvedNextCycleExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedNextCycleExecutionApprovalRowCount=5, got ${s.approvedNextCycleExecutionApprovalRowCount}`);
  if (s.blockedNextCycleExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedNextCycleExecutionApprovalRowCount=0, got ${s.blockedNextCycleExecutionApprovalRowCount}`);
  if (s.approvedMainLaneNextCycleExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneNextCycleExecutionTargetCount=4, got ${s.approvedMainLaneNextCycleExecutionTargetCount}`);
  if (s.approvedRepairBacklogNextCycleExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogNextCycleExecutionTargetCount=1, got ${s.approvedRepairBacklogNextCycleExecutionTargetCount}`);
  if (s.approvedSportomediaRepairNextCycleExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairNextCycleExecutionTargetCount=1, got ${s.approvedSportomediaRepairNextCycleExecutionTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleExecutionRunnerCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleExecutionRunnerCount=1");
  if (s.nextRunnerMayExecuteNextCycleCount !== 5) throw new Error(`Expected nextRunnerMayExecuteNextCycleCount=5, got ${s.nextRunnerMayExecuteNextCycleCount}`);

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

  if (s.nextCycleRunnerTargetCount !== 5) throw new Error(`Expected nextCycleRunnerTargetCount=5, got ${s.nextCycleRunnerTargetCount}`);
  if (s.readyNextCycleRunnerTargetCount !== 5) throw new Error(`Expected readyNextCycleRunnerTargetCount=5, got ${s.readyNextCycleRunnerTargetCount}`);
  if (s.blockedNextCycleRunnerTargetCount !== 0) throw new Error(`Expected blockedNextCycleRunnerTargetCount=0, got ${s.blockedNextCycleRunnerTargetCount}`);
  if (s.mainLaneNextCycleRunnerTargetCount !== 4) throw new Error(`Expected mainLaneNextCycleRunnerTargetCount=4, got ${s.mainLaneNextCycleRunnerTargetCount}`);
  if (s.repairBacklogNextCycleRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogNextCycleRunnerTargetCount=1, got ${s.repairBacklogNextCycleRunnerTargetCount}`);
  if (s.sportomediaRepairNextCycleRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleRunnerTargetCount=1, got ${s.sportomediaRepairNextCycleRunnerTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleExecutionApprovalGateCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleExecutionApprovalGateCount=1");

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

  if (s.nextCycleActionPackQualityGateRowCount !== 5) throw new Error(`Expected nextCycleActionPackQualityGateRowCount=5, got ${s.nextCycleActionPackQualityGateRowCount}`);
  if (s.nextCycleActionPackQualityGatePassedCount !== 5) throw new Error(`Expected nextCycleActionPackQualityGatePassedCount=5, got ${s.nextCycleActionPackQualityGatePassedCount}`);
  if (s.nextCycleActionPackQualityGateBlockedCount !== 0) throw new Error(`Expected nextCycleActionPackQualityGateBlockedCount=0, got ${s.nextCycleActionPackQualityGateBlockedCount}`);
  if (s.mainLaneNextCycleActionPackQualityGatedCount !== 4) throw new Error(`Expected mainLaneNextCycleActionPackQualityGatedCount=4, got ${s.mainLaneNextCycleActionPackQualityGatedCount}`);
  if (s.repairBacklogNextCycleActionPackQualityGatedCount !== 1) throw new Error(`Expected repairBacklogNextCycleActionPackQualityGatedCount=1, got ${s.repairBacklogNextCycleActionPackQualityGatedCount}`);
  if (s.sportomediaRepairNextCycleActionPackQualityGatedCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleActionPackQualityGatedCount=1, got ${s.sportomediaRepairNextCycleActionPackQualityGatedCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleRunnerManifestCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleRunnerManifestCount=1");

  [
    "qualityGateIsExecutionPermissionNowCount",
    "qualityGateIsFetchPermissionNowCount",
    "qualityGateIsSearchPermissionNowCount",
    "qualityGateIsBroadSearchPermissionNowCount",
    "qualityGateIsClassifierPermissionNowCount",
    "qualityGateIsCanonicalWritePermissionNowCount",
    "qualityGateIsProductionWritePermissionNowCount",
    "qualityGateIsTruthAssertionPermissionNowCount",
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
  throw new Error("Refusing to execute next-cycle runner without explicit --allow-execute");
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

const targetById = new Map(runnerTargets.map((target) => [target.postSixLeagueNextCycleRunnerTargetId, target]));

const executionRows = approvalRows.map((row, index) => {
  if (row.approvalStatus !== "approved_to_build_post_six_league_next_cycle_execution_runner") {
    throw new Error(`Cannot execute non-approved next-cycle row: ${row.postSixLeagueNextCycleExecutionApprovalRowId}`);
  }

  if (row.nextRunnerMayExecuteNextCycle !== true) {
    throw new Error(`Approval row lacks next-cycle execution permission: ${row.postSixLeagueNextCycleExecutionApprovalRowId}`);
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
    throw new Error(`Approval row grants forbidden side-effect permission: ${row.postSixLeagueNextCycleExecutionApprovalRowId}`);
  }

  const target = targetById.get(row.postSixLeagueNextCycleRunnerTargetId);
  if (!target) throw new Error(`Missing next-cycle runner target for approval row ${row.postSixLeagueNextCycleRunnerTargetId}`);

  return {
    postSixLeagueNextCycleExecutionRowId: `post_six_league_next_cycle_execution_${String(index + 1).padStart(2, "0")}`,
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

    executionStatus: "next_cycle_target_executed_as_diagnostics_only_no_fetch_no_write",
    materializedArtifactKind: "diagnostics_only_next_cycle_execution_trace",
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
  postSixLeagueFullMapNextCycleExecutionRunnerReadCount: 3,
  allowExecuteFlagPresent: ALLOW_EXECUTE,

  sourceNextCycleExecutionApprovalRowCount: approvalRows.length,
  sourceNextCycleRunnerTargetCount: runnerTargets.length,

  nextCycleExecutionRowCount: executionRows.length,
  executedNextCycleTargetCount: countWhere(
    executionRows,
    (row) => row.executionStatus === "next_cycle_target_executed_as_diagnostics_only_no_fetch_no_write"
  ),

  mainLaneNextCycleExecutedCount: countWhere(
    executionRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleExecutedCount: countWhere(
    executionRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleExecutedCount: countWhere(
    executionRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    approval.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionTraceCount: executionRows.length,
  mayBuildPostSixLeagueFullMapNextCycleExecutionVerificationGateCount: 1,

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
  job: "run-football-truth-post-six-league-full-map-next-cycle-execution-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "explicit_allow_execute_diagnostics_only_post_six_league_next_cycle_execution_runner",
  dryRun: false,
  inputs: {
    postSixLeagueNextCycleExecutionApprovalGate: approvalPath,
    postSixLeagueNextCycleRunnerManifest: manifestPath,
    postSixLeagueNextCycleActionPackQualityGate: qualityGatePath
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
