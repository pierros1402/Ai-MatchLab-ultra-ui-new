import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";
const ALLOW_EXECUTE = process.argv.includes("--allow-execute");

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-2026-06-15.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-runner-2026-06-15.json"
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

  if (s.postSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionApprovalGateReadCount !== 2) throw new Error("Expected approval read count 2");
  if (s.sourcePostContinuationCompletionNextPlanningRunnerTargetCount !== 5) throw new Error("Expected source runner target count 5");
  if (s.sourcePostContinuationCompletionNextPlanningQualityGateRowCount !== 5) throw new Error("Expected source quality gate rows 5");
  if (s.postContinuationCompletionNextPlanningExecutionApprovalRowCount !== 5) throw new Error("Expected approval rows 5");
  if (s.approvedPostContinuationCompletionNextPlanningExecutionApprovalRowCount !== 5) throw new Error("Expected approved rows 5");
  if (s.blockedPostContinuationCompletionNextPlanningExecutionApprovalRowCount !== 0) throw new Error("Expected blocked approval rows 0");
  if (s.approvedMainLanePostContinuationCompletionNextPlanningExecutionTargetCount !== 4) throw new Error("Expected approved main lane 4");
  if (s.approvedRepairBacklogPostContinuationCompletionNextPlanningExecutionTargetCount !== 1) throw new Error("Expected approved repair backlog 1");
  if (s.approvedSportomediaRepairPostContinuationCompletionNextPlanningExecutionTargetCount !== 1) throw new Error("Expected approved sportomedia repair 1");
  if (s.mayRunPostSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionRunnerCount !== 1) throw new Error("Expected may run execution runner 1");
  if (s.nextRunnerMayExecutePostContinuationCompletionNextPlanningCount !== 5) throw new Error("Expected next runner may execute count 5");

  [
    "postContinuationCompletionNextPlanningExecutionApprovalIsExecutionPermissionNowCount",
    "postContinuationCompletionNextPlanningExecutionApprovalIsFetchPermissionNowCount",
    "postContinuationCompletionNextPlanningExecutionApprovalIsSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningExecutionApprovalIsBroadSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningExecutionApprovalIsClassifierPermissionNowCount",
    "postContinuationCompletionNextPlanningExecutionApprovalIsCanonicalWritePermissionNowCount",
    "postContinuationCompletionNextPlanningExecutionApprovalIsProductionWritePermissionNowCount",
    "postContinuationCompletionNextPlanningExecutionApprovalIsTruthAssertionPermissionNowCount",
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
  ].forEach((key) => assertZero(s[key], `approval.summary.${key}`));

  assertFalse(input.productionWrite, "approval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "approval.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "approval.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "approval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "approval.classifierExecuted");
}

function validateManifest(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestReadCount !== 2) throw new Error("Expected manifest read count 2");
  if (s.postContinuationCompletionNextPlanningRunnerTargetCount !== 5) throw new Error("Expected manifest runner targets 5");
  if (s.readyPostContinuationCompletionNextPlanningRunnerTargetCount !== 5) throw new Error("Expected ready manifest runner targets 5");
  if (s.blockedPostContinuationCompletionNextPlanningRunnerTargetCount !== 0) throw new Error("Expected blocked manifest runner targets 0");
  if (s.mainLanePostContinuationCompletionNextPlanningRunnerTargetCount !== 4) throw new Error("Expected main lane manifest targets 4");
  if (s.repairBacklogPostContinuationCompletionNextPlanningRunnerTargetCount !== 1) throw new Error("Expected repair backlog manifest targets 1");
  if (s.sportomediaRepairPostContinuationCompletionNextPlanningRunnerTargetCount !== 1) throw new Error("Expected sportomedia repair manifest targets 1");
  if (s.mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionApprovalGateCount !== 1) throw new Error("Expected may build approval gate 1");

  [
    "postContinuationCompletionNextPlanningRunnerManifestIsExecutionPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsFetchPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsBroadSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsClassifierPermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsCanonicalWritePermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsProductionWritePermissionNowCount",
    "postContinuationCompletionNextPlanningRunnerManifestIsTruthAssertionPermissionNowCount",
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

  if (s.postSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateReadCount !== 2) throw new Error("Expected quality gate read count 2");
  if (s.postContinuationCompletionNextPlanningQualityGateRowCount !== 5) throw new Error("Expected quality gate rows 5");
  if (s.passedPostContinuationCompletionNextPlanningQualityGateRowCount !== 5) throw new Error("Expected passed quality gate rows 5");
  if (s.blockedPostContinuationCompletionNextPlanningQualityGateRowCount !== 0) throw new Error("Expected blocked quality gate rows 0");
  if (s.mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestCount !== 1) throw new Error("Expected may build manifest 1");

  [
    "postContinuationCompletionNextPlanningQualityGateIsExecutionPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsFetchPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsBroadSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsClassifierPermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsCanonicalWritePermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsProductionWritePermissionNowCount",
    "postContinuationCompletionNextPlanningQualityGateIsTruthAssertionPermissionNowCount",
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
  throw new Error("Refusing to run post-continuation-completion next-planning execution runner without explicit --allow-execute");
}

const approval = readJson(approvalPath);
const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateApproval(approval);
validateManifest(manifest);
validateQualityGate(qualityGate);

const approvalRows = Array.isArray(approval.executionApprovalRows) ? approval.executionApprovalRows : [];
const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];

if (approvalRows.length !== 5) throw new Error(`Expected 5 execution approval rows, got ${approvalRows.length}`);
if (runnerTargets.length !== 5) throw new Error(`Expected 5 runner targets, got ${runnerTargets.length}`);

const runnerTargetById = new Map(
  runnerTargets.map((target) => [target.postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId, target])
);

const executionRows = approvalRows.map((row, index) => {
  if (row.postContinuationCompletionNextPlanningExecutionApprovalStatus !== "approved_for_explicit_diagnostics_only_post_continuation_completion_next_planning_execution_runner") {
    throw new Error(`Cannot execute non-approved row: ${row.postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId}`);
  }

  if (row.nextRunnerMayExecutePostContinuationCompletionNextPlanning !== true) {
    throw new Error(`Approval row lacks execution permission marker: ${row.postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId}`);
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
    throw new Error(`Approval row grants forbidden side-effect permission: ${row.postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId}`);
  }

  const target = runnerTargetById.get(row.postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId);
  if (!target) {
    throw new Error(`Missing matching runner target for ${row.postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId}`);
  }

  return {
    postSixLeaguePostContinuationCompletionNextPlanningExecutionRowId: `post_six_league_post_continuation_completion_next_planning_execution_${String(index + 1).padStart(2, "0")}`,
    postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId: row.postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId,
    postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId: row.postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId,
    postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId: row.postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId,
    postSixLeaguePostContinuationCompletionNextPlanningRowId: row.postSixLeaguePostContinuationCompletionNextPlanningRowId,

    postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionCycleExitRowId: row.postSixLeagueNextCycleContinuationCompletionCycleExitRowId,
    postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionCloseoutRowId: row.postSixLeagueNextCycleContinuationCompletionCloseoutRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionRowId,
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
    postContinuationCompletionNextPlanningLayer: row.postContinuationCompletionNextPlanningLayer,
    postContinuationCompletionNextPlanningIntent: row.postContinuationCompletionNextPlanningIntent,
    postContinuationCompletionNextPlanningRunnerGroup: row.postContinuationCompletionNextPlanningRunnerGroup,

    executionStatus: "post_continuation_completion_next_planning_target_executed_as_diagnostics_only_no_fetch_no_write",
    materializedArtifactKind: "diagnostics_only_post_continuation_completion_next_planning_execution_trace",
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
  postSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionRunnerReadCount: 3,
  allowExecuteFlagPresent: true,

  sourcePostContinuationCompletionNextPlanningExecutionApprovalRowCount: approvalRows.length,
  sourcePostContinuationCompletionNextPlanningRunnerTargetCount: runnerTargets.length,

  postContinuationCompletionNextPlanningExecutionRowCount: executionRows.length,
  executedPostContinuationCompletionNextPlanningTargetCount: executionRows.length,

  mainLanePostContinuationCompletionNextPlanningExecutedCount: countWhere(
    executionRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogPostContinuationCompletionNextPlanningExecutedCount: countWhere(
    executionRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairPostContinuationCompletionNextPlanningExecutedCount: countWhere(
    executionRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    approval.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    approval.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    approval.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    approval.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    approval.summary.postSixLeagueNextCycleContinuationCompletionCycleClosedCount,

  postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount:
    approval.summary.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitedCount:
    approval.summary.postSixLeagueNextCycleContinuationCompletionCycleExitedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount:
    approval.summary.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount,

  diagnosticsOnlyPostContinuationCompletionNextPlanningExecutionTraceCount: executionRows.length,
  mayVerifyPostSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionCount: 1,

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
  job: "run-football-truth-post-six-league-full-map-post-continuation-completion-next-planning-execution-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "explicit_allow_execute_diagnostics_only_post_six_league_post_continuation_completion_next_planning_execution_runner",
  dryRun: false,
  inputs: {
    postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalGate: approvalPath,
    postSixLeaguePostContinuationCompletionNextPlanningRunnerManifest: manifestPath,
    postSixLeaguePostContinuationCompletionNextPlanningQualityGate: qualityGatePath
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
