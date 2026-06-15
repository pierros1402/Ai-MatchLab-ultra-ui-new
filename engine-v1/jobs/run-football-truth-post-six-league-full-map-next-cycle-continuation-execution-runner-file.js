import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_EXECUTE = process.argv.includes("--allow-execute");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-execution-approval-gate-2026-06-15.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-runner-manifest-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-action-pack-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-execution-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-execution-runner-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationExecutionApprovalGateReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationExecutionApprovalGateReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationExecutionApprovalGateReadCount}`);
  }
  if (s.sourceNextCycleContinuationRunnerTargetCount !== 5) throw new Error(`Expected sourceNextCycleContinuationRunnerTargetCount=5, got ${s.sourceNextCycleContinuationRunnerTargetCount}`);
  if (s.sourceNextCycleContinuationActionPackQualityGateRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationActionPackQualityGateRowCount=5, got ${s.sourceNextCycleContinuationActionPackQualityGateRowCount}`);
  if (s.nextCycleContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected nextCycleContinuationExecutionApprovalRowCount=5, got ${s.nextCycleContinuationExecutionApprovalRowCount}`);
  if (s.approvedNextCycleContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedNextCycleContinuationExecutionApprovalRowCount=5, got ${s.approvedNextCycleContinuationExecutionApprovalRowCount}`);
  if (s.blockedNextCycleContinuationExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedNextCycleContinuationExecutionApprovalRowCount=0, got ${s.blockedNextCycleContinuationExecutionApprovalRowCount}`);
  if (s.approvedMainLaneNextCycleContinuationExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneNextCycleContinuationExecutionTargetCount=4, got ${s.approvedMainLaneNextCycleContinuationExecutionTargetCount}`);
  if (s.approvedRepairBacklogNextCycleContinuationExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogNextCycleContinuationExecutionTargetCount=1, got ${s.approvedRepairBacklogNextCycleContinuationExecutionTargetCount}`);
  if (s.approvedSportomediaRepairNextCycleContinuationExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairNextCycleContinuationExecutionTargetCount=1, got ${s.approvedSportomediaRepairNextCycleContinuationExecutionTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionRunnerCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionRunnerCount=1");
  }
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

  if (s.nextCycleContinuationRunnerTargetCount !== 5) throw new Error(`Expected nextCycleContinuationRunnerTargetCount=5, got ${s.nextCycleContinuationRunnerTargetCount}`);
  if (s.readyNextCycleContinuationRunnerTargetCount !== 5) throw new Error(`Expected readyNextCycleContinuationRunnerTargetCount=5, got ${s.readyNextCycleContinuationRunnerTargetCount}`);
  if (s.blockedNextCycleContinuationRunnerTargetCount !== 0) throw new Error(`Expected blockedNextCycleContinuationRunnerTargetCount=0, got ${s.blockedNextCycleContinuationRunnerTargetCount}`);
  if (s.mainLaneNextCycleContinuationRunnerTargetCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationRunnerTargetCount=4, got ${s.mainLaneNextCycleContinuationRunnerTargetCount}`);
  if (s.repairBacklogNextCycleContinuationRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationRunnerTargetCount=1, got ${s.repairBacklogNextCycleContinuationRunnerTargetCount}`);
  if (s.sportomediaRepairNextCycleContinuationRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationRunnerTargetCount=1, got ${s.sportomediaRepairNextCycleContinuationRunnerTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionApprovalGateCount=1");
  }

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
  ].forEach((key) => assertZero(s[key], `manifest.summary.${key}`));

  assertFalse(input.productionWrite, "manifest.productionWrite");
  assertFalse(input.sourceFetch?.executed, "manifest.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "manifest.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "manifest.broadSearchUsed");
  assertFalse(input.classifierExecuted, "manifest.classifierExecuted");
}

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.nextCycleContinuationActionPackQualityGateRowCount !== 5) throw new Error(`Expected nextCycleContinuationActionPackQualityGateRowCount=5, got ${s.nextCycleContinuationActionPackQualityGateRowCount}`);
  if (s.nextCycleContinuationActionPackQualityGatePassedCount !== 5) throw new Error(`Expected nextCycleContinuationActionPackQualityGatePassedCount=5, got ${s.nextCycleContinuationActionPackQualityGatePassedCount}`);
  if (s.nextCycleContinuationActionPackQualityGateBlockedCount !== 0) throw new Error(`Expected nextCycleContinuationActionPackQualityGateBlockedCount=0, got ${s.nextCycleContinuationActionPackQualityGateBlockedCount}`);
  if (s.mainLaneNextCycleContinuationActionPackQualityGatedCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationActionPackQualityGatedCount=4, got ${s.mainLaneNextCycleContinuationActionPackQualityGatedCount}`);
  if (s.repairBacklogNextCycleContinuationActionPackQualityGatedCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationActionPackQualityGatedCount=1, got ${s.repairBacklogNextCycleContinuationActionPackQualityGatedCount}`);
  if (s.sportomediaRepairNextCycleContinuationActionPackQualityGatedCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationActionPackQualityGatedCount=1, got ${s.sportomediaRepairNextCycleContinuationActionPackQualityGatedCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationRunnerManifestCount=1");
  }

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

if (approvalRows.length !== 5) throw new Error(`Expected 5 continuation approval rows, got ${approvalRows.length}`);
if (runnerTargets.length !== 5) throw new Error(`Expected 5 continuation runner targets, got ${runnerTargets.length}`);

const targetById = new Map(
  runnerTargets.map((target) => [target.postSixLeagueNextCycleContinuationRunnerTargetId, target])
);

const executionRows = approvalRows.map((row, index) => {
  if (row.approvalStatus !== "approved_to_build_post_six_league_next_cycle_continuation_execution_runner") {
    throw new Error(`Cannot execute non-approved continuation row: ${row.postSixLeagueNextCycleContinuationExecutionApprovalRowId}`);
  }

  if (row.nextRunnerMayExecuteContinuation !== true) {
    throw new Error(`Approval row lacks continuation execution permission: ${row.postSixLeagueNextCycleContinuationExecutionApprovalRowId}`);
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
    throw new Error(`Approval row grants forbidden side-effect permission: ${row.postSixLeagueNextCycleContinuationExecutionApprovalRowId}`);
  }

  const target = targetById.get(row.postSixLeagueNextCycleContinuationRunnerTargetId);
  if (!target) {
    throw new Error(`Missing continuation runner target for approval row ${row.postSixLeagueNextCycleContinuationRunnerTargetId}`);
  }

  return {
    postSixLeagueNextCycleContinuationExecutionRowId: `post_six_league_next_cycle_continuation_execution_${String(index + 1).padStart(2, "0")}`,
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

    executionStatus: "continuation_target_executed_as_diagnostics_only_no_fetch_no_write",
    materializedArtifactKind: "diagnostics_only_next_cycle_continuation_execution_trace",
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
  postSixLeagueFullMapNextCycleContinuationExecutionRunnerReadCount: 3,
  allowExecuteFlagPresent: ALLOW_EXECUTE,

  sourceNextCycleContinuationExecutionApprovalRowCount: approvalRows.length,
  sourceNextCycleContinuationRunnerTargetCount: runnerTargets.length,

  continuationExecutionRowCount: executionRows.length,
  executedContinuationTargetCount: countWhere(
    executionRows,
    (row) => row.executionStatus === "continuation_target_executed_as_diagnostics_only_no_fetch_no_write"
  ),

  mainLaneContinuationExecutedCount: countWhere(
    executionRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogContinuationExecutedCount: countWhere(
    executionRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairContinuationExecutedCount: countWhere(
    executionRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    approval.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    approval.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionTraceCount: executionRows.length,
  mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionVerificationGateCount: 1,

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
  job: "run-football-truth-post-six-league-full-map-next-cycle-continuation-execution-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "explicit_allow_execute_diagnostics_only_post_six_league_next_cycle_continuation_execution_runner",
  dryRun: false,
  inputs: {
    postSixLeagueNextCycleContinuationExecutionApprovalGate: approvalPath,
    postSixLeagueNextCycleContinuationRunnerManifest: manifestPath,
    postSixLeagueNextCycleContinuationActionPackQualityGate: qualityGatePath
  },
  policy: {
    explicitAllowExecuteFlagRequired: true,
    diagnosticsOnlyContinuationExecutionTrace: true,
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
