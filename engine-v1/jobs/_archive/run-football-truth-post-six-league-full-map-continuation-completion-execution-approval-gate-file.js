import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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
  "post-six-league-full-map-continuation-completion-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-completion-execution-approval-gate-2026-06-15.json"
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

function validateManifest(input) {
  const s = input.summary || {};

  if (s.continuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected continuationCompletionRunnerTargetCount=5, got ${s.continuationCompletionRunnerTargetCount}`);
  if (s.readyContinuationCompletionRunnerTargetCount !== 5) throw new Error(`Expected readyContinuationCompletionRunnerTargetCount=5, got ${s.readyContinuationCompletionRunnerTargetCount}`);
  if (s.blockedContinuationCompletionRunnerTargetCount !== 0) throw new Error(`Expected blockedContinuationCompletionRunnerTargetCount=0, got ${s.blockedContinuationCompletionRunnerTargetCount}`);
  if (s.mainLaneContinuationCompletionRunnerTargetCount !== 4) throw new Error(`Expected mainLaneContinuationCompletionRunnerTargetCount=4, got ${s.mainLaneContinuationCompletionRunnerTargetCount}`);
  if (s.repairBacklogContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogContinuationCompletionRunnerTargetCount=1, got ${s.repairBacklogContinuationCompletionRunnerTargetCount}`);
  if (s.sportomediaRepairContinuationCompletionRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairContinuationCompletionRunnerTargetCount=1, got ${s.sportomediaRepairContinuationCompletionRunnerTargetCount}`);

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionExecutionApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionExecutionApprovalGateCount=1");
  }

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

  if (s.continuationCompletionActionPackQualityGateRowCount !== 5) {
    throw new Error(`Expected continuationCompletionActionPackQualityGateRowCount=5, got ${s.continuationCompletionActionPackQualityGateRowCount}`);
  }

  if (s.continuationCompletionActionPackQualityGatePassedCount !== 5) {
    throw new Error(`Expected continuationCompletionActionPackQualityGatePassedCount=5, got ${s.continuationCompletionActionPackQualityGatePassedCount}`);
  }

  if (s.continuationCompletionActionPackQualityGateBlockedCount !== 0) {
    throw new Error(`Expected continuationCompletionActionPackQualityGateBlockedCount=0, got ${s.continuationCompletionActionPackQualityGateBlockedCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionRunnerManifestCount=1");
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

function validateRunnerTarget(target) {
  const failures = [];

  if (!target.continuationCompletionRunnerTargetId) failures.push("missing_completion_runner_target_id");
  if (!target.continuationCompletionActionPackQualityGateRowId) failures.push("missing_completion_quality_gate_row_id");
  if (!target.continuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!target.continuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!target.continuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!target.continuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!target.sourceLane) failures.push("missing_source_lane");
  if (!target.completionRouteFamily) failures.push("missing_completion_route_family");
  if (!target.completionRunnerGroup) failures.push("missing_completion_runner_group");

  if (target.runnerTargetStatus !== "ready_for_completion_execution_approval_gate") {
    failures.push(`unexpected_runner_target_status:${target.runnerTargetStatus}`);
  }

  if (target.requiresExecutionApprovalGate !== true) failures.push("execution_approval_gate_not_required");
  if (target.requiresExplicitAllowExecuteFlag !== true) failures.push("explicit_allow_execute_flag_not_required");

  [
    "isExecutionPermissionNow",
    "isFetchPermissionNow",
    "isSearchPermissionNow",
    "isBroadSearchPermissionNow",
    "isClassifierPermissionNow",
    "isCanonicalWritePermissionNow",
    "isProductionWritePermissionNow",
    "isTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (target[key] !== false) failures.push(`runner_target_guardrail_not_false:${key}`);
  });

  return failures;
}

const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateManifest(manifest);
validateQualityGate(qualityGate);

const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];
if (runnerTargets.length !== 5) {
  throw new Error(`Expected 5 completion runner targets, got ${runnerTargets.length}`);
}

const approvalRows = runnerTargets.map((target, index) => {
  const failures = validateRunnerTarget(target);

  return {
    continuationCompletionExecutionApprovalRowId: `post_six_league_completion_execution_approval_${String(index + 1).padStart(2, "0")}`,
    continuationCompletionRunnerTargetId: target.continuationCompletionRunnerTargetId,
    continuationCompletionActionPackQualityGateRowId: target.continuationCompletionActionPackQualityGateRowId,
    continuationCompletionActionPackRowId: target.continuationCompletionActionPackRowId,
    continuationCompletionRoutingRowId: target.continuationCompletionRoutingRowId,
    continuationExecutionVerificationRowId: target.continuationExecutionVerificationRowId,
    continuationExecutionRowId: target.continuationExecutionRowId,
    continuationExecutionApprovalRowId: target.continuationExecutionApprovalRowId,
    continuationRunnerTargetId: target.continuationRunnerTargetId,
    sourceContinuationRoutingRowId: target.sourceContinuationRoutingRowId,
    sourceVerificationRowId: target.sourceVerificationRowId,
    sourceLane: target.sourceLane,
    actionPackLane: target.actionPackLane,
    routeFamily: target.routeFamily,
    completionRouteFamily: target.completionRouteFamily,
    providerFamily: target.providerFamily || null,
    executionGroup: target.executionGroup || null,
    continuationRunnerGroup: target.continuationRunnerGroup,
    completionActionPackLane: target.completionActionPackLane,
    completionRunnerGroup: target.completionRunnerGroup,
    approvalStatus:
      failures.length === 0
        ? "approved_to_build_completion_execution_runner"
        : "blocked_from_completion_execution_runner",
    failures,
    mayBuildCompletionExecutionRunnerForTarget: failures.length === 0,
    nextRunnerRequiresExplicitAllowExecuteFlag: true,

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,
    approvalIsSearchPermissionNow: false,
    approvalIsBroadSearchPermissionNow: false,
    approvalIsClassifierPermissionNow: false,
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsProductionWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false,

    nextRunnerMayExecuteCompletion: failures.length === 0,
    nextRunnerMayFetch: false,
    nextRunnerMaySearch: false,
    nextRunnerMayBroadSearch: false,
    nextRunnerMayClassify: false,
    nextRunnerMayWriteCanonical: false,
    nextRunnerMayWriteProduction: false,
    nextRunnerMayAssertTruth: false
  };
});

const approvedRows = approvalRows.filter(
  (row) => row.approvalStatus === "approved_to_build_completion_execution_runner"
);

const blockedRows = approvalRows.filter(
  (row) => row.approvalStatus !== "approved_to_build_completion_execution_runner"
);

const summary = {
  postSixLeagueFullMapContinuationCompletionExecutionApprovalGateReadCount: 2,
  sourceContinuationCompletionRunnerTargetCount: runnerTargets.length,
  sourceContinuationCompletionActionPackQualityGateRowCount:
    (qualityGate.qualityGateRows || []).length,

  continuationCompletionExecutionApprovalRowCount: approvalRows.length,
  approvedContinuationCompletionExecutionApprovalRowCount: approvedRows.length,
  blockedContinuationCompletionExecutionApprovalRowCount: blockedRows.length,

  approvedMainLaneContinuationCompletionExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.completionRouteFamily === "whole_map_main_lane_completion"
  ),
  approvedRepairBacklogContinuationCompletionExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.completionRouteFamily === "repair_backlog_completion"
  ),
  approvedSportomediaRepairContinuationCompletionExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "sportomedia" && row.completionRouteFamily === "repair_backlog_completion"
  ),

  mayBuildPostSixLeagueFullMapContinuationCompletionExecutionRunnerCount:
    blockedRows.length === 0 ? 1 : 0,

  executionApprovalIsExecutionPermissionNowCount: 0,
  executionApprovalIsFetchPermissionNowCount: 0,
  executionApprovalIsSearchPermissionNowCount: 0,
  executionApprovalIsBroadSearchPermissionNowCount: 0,
  executionApprovalIsClassifierPermissionNowCount: 0,
  executionApprovalIsCanonicalWritePermissionNowCount: 0,
  executionApprovalIsProductionWritePermissionNowCount: 0,
  executionApprovalIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayExecuteCompletionCount: approvedRows.length,
  nextRunnerMayFetchCount: 0,
  nextRunnerMaySearchCount: 0,
  nextRunnerMayBroadSearchCount: 0,
  nextRunnerMayClassifyCount: 0,
  nextRunnerMayWriteCanonicalCount: 0,
  nextRunnerMayWriteProductionCount: 0,
  nextRunnerMayAssertTruthCount: 0,

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
  job: "run-football-truth-post-six-league-full-map-continuation-completion-execution-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_completion_execution_approval_gate",
  dryRun: true,
  inputs: {
    postSixLeagueCompletionRunnerManifest: manifestPath,
    postSixLeagueCompletionActionPackQualityGate: qualityGatePath
  },
  policy: {
    executionApprovalGateOnly: true,
    approvalDoesNotExecuteCompletion: true,
    nextRunnerMustRequireExplicitAllowExecuteFlag: true,
    nextRunnerMustRemainNoFetchNoSearchNoWriteUnlessSeparatelyApproved: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  approvalRows,
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
  throw new Error(`Completion execution approval gate blocked ${blockedRows.length} targets`);
}
