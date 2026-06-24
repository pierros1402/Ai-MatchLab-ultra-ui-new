import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_EXECUTE = process.argv.includes("--allow-execute");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-approval-gate-2026-06-15.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-runner-manifest-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-execution-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-execution-runner-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateReadCount}`);
  }
  if (s.sourceNextCycleContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionRunnerTargetCount=5, got ${s.sourceNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.sourceNextCycleContinuationCompletionActionPackQualityGateRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionActionPackQualityGateRowCount=5, got ${s.sourceNextCycleContinuationCompletionActionPackQualityGateRowCount}`);
  if (s.nextCycleContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected nextCycleContinuationCompletionExecutionApprovalRowCount=5, got ${s.nextCycleContinuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedNextCycleContinuationCompletionExecutionApprovalRowCount !== 5) throw new Error(`Expected approvedNextCycleContinuationCompletionExecutionApprovalRowCount=5, got ${s.approvedNextCycleContinuationCompletionExecutionApprovalRowCount}`);
  if (s.blockedNextCycleContinuationCompletionExecutionApprovalRowCount !== 0) throw new Error(`Expected blockedNextCycleContinuationCompletionExecutionApprovalRowCount=0, got ${s.blockedNextCycleContinuationCompletionExecutionApprovalRowCount}`);
  if (s.approvedMainLaneNextCycleContinuationCompletionExecutionTargetCount !== 4) throw new Error(`Expected approvedMainLaneNextCycleContinuationCompletionExecutionTargetCount=4, got ${s.approvedMainLaneNextCycleContinuationCompletionExecutionTargetCount}`);
  if (s.approvedRepairBacklogNextCycleContinuationCompletionExecutionTargetCount !== 1) throw new Error(`Expected approvedRepairBacklogNextCycleContinuationCompletionExecutionTargetCount=1, got ${s.approvedRepairBacklogNextCycleContinuationCompletionExecutionTargetCount}`);
  if (s.approvedSportomediaRepairNextCycleContinuationCompletionExecutionTargetCount !== 1) throw new Error(`Expected approvedSportomediaRepairNextCycleContinuationCompletionExecutionTargetCount=1, got ${s.approvedSportomediaRepairNextCycleContinuationCompletionExecutionTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionRunnerCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionRunnerCount=1");
  }
  if (s.nextRunnerMayExecuteContinuationCompletionCount !== 5) throw new Error(`Expected nextRunnerMayExecuteContinuationCompletionCount=5, got ${s.nextRunnerMayExecuteContinuationCompletionCount}`);

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

  if (s.nextCycleContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected nextCycleContinuationCompletionRunnerTargetCount=5, got ${s.nextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.readyNextCycleContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected readyNextCycleContinuationCompletionRunnerTargetCount=5, got ${s.readyNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.blockedNextCycleContinuationCompletionRunnerTargetCount !== 0) throw new Error(`Expected blockedNextCycleContinuationCompletionRunnerTargetCount=0, got ${s.blockedNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.mainLaneNextCycleContinuationCompletionRunnerTargetCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationCompletionRunnerTargetCount=4, got ${s.mainLaneNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.repairBacklogNextCycleContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationCompletionRunnerTargetCount=1, got ${s.repairBacklogNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.sportomediaRepairNextCycleContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationCompletionRunnerTargetCount=1, got ${s.sportomediaRepairNextCycleContinuationCompletionRunnerTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateCount=1");
  }

  [
    "continuationCompletionRunnerManifestIsExecutionPermissionNowCount",
    "continuationCompletionRunnerManifestIsFetchPermissionNowCount",
    "continuationCompletionRunnerManifestIsSearchPermissionNowCount",
    "continuationCompletionRunnerManifestIsBroadSearchPermissionNowCount",
    "continuationCompletionRunnerManifestIsClassifierPermissionNowCount",
    "continuationCompletionRunnerManifestIsCanonicalWritePermissionNowCount",
    "continuationCompletionRunnerManifestIsProductionWritePermissionNowCount",
    "continuationCompletionRunnerManifestIsTruthAssertionPermissionNowCount",
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

  if (s.nextCycleContinuationCompletionActionPackQualityGateRowCount !== 5) throw new Error(`Expected nextCycleContinuationCompletionActionPackQualityGateRowCount=5, got ${s.nextCycleContinuationCompletionActionPackQualityGateRowCount}`);
  if (s.nextCycleContinuationCompletionActionPackQualityGatePassedCount !== 5) throw new Error(`Expected nextCycleContinuationCompletionActionPackQualityGatePassedCount=5, got ${s.nextCycleContinuationCompletionActionPackQualityGatePassedCount}`);
  if (s.nextCycleContinuationCompletionActionPackQualityGateBlockedCount !== 0) throw new Error(`Expected nextCycleContinuationCompletionActionPackQualityGateBlockedCount=0, got ${s.nextCycleContinuationCompletionActionPackQualityGateBlockedCount}`);
  if (s.mainLaneNextCycleContinuationCompletionActionPackQualityGatedCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationCompletionActionPackQualityGatedCount=4, got ${s.mainLaneNextCycleContinuationCompletionActionPackQualityGatedCount}`);
  if (s.repairBacklogNextCycleContinuationCompletionActionPackQualityGatedCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationCompletionActionPackQualityGatedCount=1, got ${s.repairBacklogNextCycleContinuationCompletionActionPackQualityGatedCount}`);
  if (s.sportomediaRepairNextCycleContinuationCompletionActionPackQualityGatedCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationCompletionActionPackQualityGatedCount=1, got ${s.sportomediaRepairNextCycleContinuationCompletionActionPackQualityGatedCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionRunnerManifestCount=1");
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
  throw new Error("Refusing to execute continuation-completion runner without explicit --allow-execute");
}

const approval = readJson(approvalPath);
const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateApproval(approval);
validateManifest(manifest);
validateQualityGate(qualityGate);

const approvalRows = Array.isArray(approval.approvalRows) ? approval.approvalRows : [];
const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];

if (approvalRows.length !== 5) throw new Error(`Expected 5 continuation-completion approval rows, got ${approvalRows.length}`);
if (runnerTargets.length !== 5) throw new Error(`Expected 5 continuation-completion runner targets, got ${runnerTargets.length}`);

const targetById = new Map(
  runnerTargets.map((target) => [target.postSixLeagueNextCycleContinuationCompletionRunnerTargetId, target])
);

const executionRows = approvalRows.map((row, index) => {
  if (row.approvalStatus !== "approved_to_build_post_six_league_next_cycle_continuation_completion_execution_runner") {
    throw new Error(`Cannot execute non-approved continuation-completion row: ${row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId}`);
  }

  if (row.nextRunnerMayExecuteContinuationCompletion !== true) {
    throw new Error(`Approval row lacks continuation-completion execution permission: ${row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId}`);
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
    throw new Error(`Approval row grants forbidden side-effect permission: ${row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId}`);
  }

  const target = targetById.get(row.postSixLeagueNextCycleContinuationCompletionRunnerTargetId);
  if (!target) {
    throw new Error(`Missing continuation-completion runner target for approval row ${row.postSixLeagueNextCycleContinuationCompletionRunnerTargetId}`);
  }

  return {
    postSixLeagueNextCycleContinuationCompletionExecutionRowId: `post_six_league_next_cycle_continuation_completion_execution_${String(index + 1).padStart(2, "0")}`,
    postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId,
    postSixLeagueNextCycleContinuationCompletionRunnerTargetId: row.postSixLeagueNextCycleContinuationCompletionRunnerTargetId,
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId: row.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId,
    postSixLeagueNextCycleContinuationCompletionActionPackRowId: row.postSixLeagueNextCycleContinuationCompletionActionPackRowId,
    postSixLeagueNextCycleContinuationCompletionRoutingRowId: row.postSixLeagueNextCycleContinuationCompletionRoutingRowId,
    postSixLeagueNextCycleContinuationExecutionVerificationRowId: row.postSixLeagueNextCycleContinuationExecutionVerificationRowId,
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
    nextCycleContinuationCompletionRouteFamily: row.nextCycleContinuationCompletionRouteFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    nextCycleActionPackLane: row.nextCycleActionPackLane,
    nextCycleRunnerGroup: row.nextCycleRunnerGroup,
    nextCycleContinuationActionPackLane: row.nextCycleContinuationActionPackLane,
    nextCycleContinuationRunnerGroup: row.nextCycleContinuationRunnerGroup,
    nextCycleContinuationCompletionActionPackLane: row.nextCycleContinuationCompletionActionPackLane,
    nextCycleContinuationCompletionRunnerGroup: row.nextCycleContinuationCompletionRunnerGroup,

    executionStatus: "continuation_completion_target_executed_as_diagnostics_only_no_fetch_no_write",
    materializedArtifactKind: "diagnostics_only_next_cycle_continuation_completion_execution_trace",
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
  postSixLeagueFullMapNextCycleContinuationCompletionExecutionRunnerReadCount: 3,
  allowExecuteFlagPresent: ALLOW_EXECUTE,

  sourceNextCycleContinuationCompletionExecutionApprovalRowCount: approvalRows.length,
  sourceNextCycleContinuationCompletionRunnerTargetCount: runnerTargets.length,

  continuationCompletionExecutionRowCount: executionRows.length,
  executedContinuationCompletionTargetCount: countWhere(
    executionRows,
    (row) => row.executionStatus === "continuation_completion_target_executed_as_diagnostics_only_no_fetch_no_write"
  ),

  mainLaneContinuationCompletionExecutedCount: countWhere(
    executionRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogContinuationCompletionExecutedCount: countWhere(
    executionRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairContinuationCompletionExecutedCount: countWhere(
    executionRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    approval.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    approval.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    approval.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionTraceCount: executionRows.length,
  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionVerificationGateCount: 1,

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
  job: "run-football-truth-post-six-league-full-map-next-cycle-continuation-completion-execution-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "explicit_allow_execute_diagnostics_only_post_six_league_next_cycle_continuation_completion_execution_runner",
  dryRun: false,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionExecutionApprovalGate: approvalPath,
    postSixLeagueNextCycleContinuationCompletionRunnerManifest: manifestPath,
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGate: qualityGatePath
  },
  policy: {
    explicitAllowExecuteFlagRequired: true,
    diagnosticsOnlyContinuationCompletionExecutionTrace: true,
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
