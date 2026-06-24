import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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
  "post-six-league-full-map-next-cycle-continuation-completion-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-execution-approval-gate-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionRunnerManifestReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionRunnerManifestReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionRunnerManifestReadCount}`);
  }
  if (s.sourceNextCycleContinuationCompletionActionPackQualityGateRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionActionPackQualityGateRowCount=5, got ${s.sourceNextCycleContinuationCompletionActionPackQualityGateRowCount}`);
  if (s.sourceNextCycleContinuationCompletionActionPackRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionActionPackRowCount=5, got ${s.sourceNextCycleContinuationCompletionActionPackRowCount}`);
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

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateReadCount}`);
  }
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

function validateRunnerTarget(target) {
  const failures = [];

  if (!target.postSixLeagueNextCycleContinuationCompletionRunnerTargetId) failures.push("missing_completion_runner_target_id");
  if (!target.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId) failures.push("missing_completion_action_pack_quality_gate_row_id");
  if (!target.postSixLeagueNextCycleContinuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!target.postSixLeagueNextCycleContinuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!target.postSixLeagueNextCycleContinuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!target.postSixLeagueNextCycleContinuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!target.postSixLeagueNextCycleContinuationExecutionApprovalRowId) failures.push("missing_continuation_execution_approval_row_id");
  if (!target.postSixLeagueNextCycleContinuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!target.sourceLane) failures.push("missing_source_lane");
  if (!target.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!target.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!target.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");
  if (!target.nextCycleContinuationCompletionActionPackLane) failures.push("missing_next_cycle_continuation_completion_action_pack_lane");
  if (!target.nextCycleContinuationCompletionRunnerGroup) failures.push("missing_next_cycle_continuation_completion_runner_group");

  if (target.continuationCompletionRunnerTargetStatus !== "ready_for_post_six_league_next_cycle_continuation_completion_execution_approval_gate") {
    failures.push(`unexpected_completion_runner_target_status:${target.continuationCompletionRunnerTargetStatus}`);
  }

  if (target.requiresExecutionApprovalGate !== true) failures.push("execution_approval_gate_not_required");
  if (target.requiresExplicitAllowExecuteFlag !== true) failures.push("explicit_allow_execute_flag_not_required");

  [
    "continuationCompletionRunnerIsExecutionPermissionNow",
    "continuationCompletionRunnerIsFetchPermissionNow",
    "continuationCompletionRunnerIsSearchPermissionNow",
    "continuationCompletionRunnerIsBroadSearchPermissionNow",
    "continuationCompletionRunnerIsClassifierPermissionNow",
    "continuationCompletionRunnerIsCanonicalWritePermissionNow",
    "continuationCompletionRunnerIsProductionWritePermissionNow",
    "continuationCompletionRunnerIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (target[key] !== false) failures.push(`completion_runner_guardrail_not_false:${key}`);
  });

  return failures;
}

const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateManifest(manifest);
validateQualityGate(qualityGate);

const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];
const qualityGateRows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];

if (runnerTargets.length !== 5) throw new Error(`Expected 5 continuation-completion runner targets, got ${runnerTargets.length}`);
if (qualityGateRows.length !== 5) throw new Error(`Expected 5 continuation-completion quality gate rows, got ${qualityGateRows.length}`);

const approvalRows = runnerTargets.map((target, index) => {
  const failures = validateRunnerTarget(target);

  return {
    postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId: `post_six_league_next_cycle_continuation_completion_execution_approval_${String(index + 1).padStart(2, "0")}`,
    postSixLeagueNextCycleContinuationCompletionRunnerTargetId: target.postSixLeagueNextCycleContinuationCompletionRunnerTargetId,
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId: target.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId,
    postSixLeagueNextCycleContinuationCompletionActionPackRowId: target.postSixLeagueNextCycleContinuationCompletionActionPackRowId,
    postSixLeagueNextCycleContinuationCompletionRoutingRowId: target.postSixLeagueNextCycleContinuationCompletionRoutingRowId,
    postSixLeagueNextCycleContinuationExecutionVerificationRowId: target.postSixLeagueNextCycleContinuationExecutionVerificationRowId,
    postSixLeagueNextCycleContinuationExecutionRowId: target.postSixLeagueNextCycleContinuationExecutionRowId,
    postSixLeagueNextCycleContinuationExecutionApprovalRowId: target.postSixLeagueNextCycleContinuationExecutionApprovalRowId,
    postSixLeagueNextCycleContinuationRunnerTargetId: target.postSixLeagueNextCycleContinuationRunnerTargetId,
    postSixLeagueNextCycleContinuationActionPackQualityGateRowId: target.postSixLeagueNextCycleContinuationActionPackQualityGateRowId,
    postSixLeagueNextCycleContinuationActionPackRowId: target.postSixLeagueNextCycleContinuationActionPackRowId,
    postSixLeagueNextCycleContinuationRoutingRowId: target.postSixLeagueNextCycleContinuationRoutingRowId,
    postSixLeagueNextCycleExecutionVerificationRowId: target.postSixLeagueNextCycleExecutionVerificationRowId,
    postSixLeagueNextCycleExecutionRowId: target.postSixLeagueNextCycleExecutionRowId,
    postSixLeagueNextCycleExecutionApprovalRowId: target.postSixLeagueNextCycleExecutionApprovalRowId,
    postSixLeagueNextCycleRunnerTargetId: target.postSixLeagueNextCycleRunnerTargetId,
    postSixLeagueNextCycleActionPackQualityGateRowId: target.postSixLeagueNextCycleActionPackQualityGateRowId,
    postSixLeagueNextCycleActionPackRowId: target.postSixLeagueNextCycleActionPackRowId,
    postSixLeagueNextCycleRoutingRowId: target.postSixLeagueNextCycleRoutingRowId,
    continuationCompletionCloseoutRowId: target.continuationCompletionCloseoutRowId,
    continuationCompletionExecutionVerificationRowId: target.continuationCompletionExecutionVerificationRowId,
    continuationCompletionExecutionRowId: target.continuationCompletionExecutionRowId,
    continuationCompletionExecutionApprovalRowId: target.continuationCompletionExecutionApprovalRowId,
    continuationCompletionRunnerTargetId: target.continuationCompletionRunnerTargetId,
    sourceContinuationRoutingRowId: target.sourceContinuationRoutingRowId,
    sourceVerificationRowId: target.sourceVerificationRowId,
    sourceLane: target.sourceLane,
    actionPackLane: target.actionPackLane,
    routeFamily: target.routeFamily,
    completionRouteFamily: target.completionRouteFamily,
    nextCycleRouteFamily: target.nextCycleRouteFamily,
    nextCycleContinuationRouteFamily: target.nextCycleContinuationRouteFamily,
    nextCycleContinuationCompletionRouteFamily: target.nextCycleContinuationCompletionRouteFamily,
    providerFamily: target.providerFamily || null,
    executionGroup: target.executionGroup || null,
    nextCycleActionPackLane: target.nextCycleActionPackLane,
    nextCycleRunnerGroup: target.nextCycleRunnerGroup,
    nextCycleContinuationActionPackLane: target.nextCycleContinuationActionPackLane,
    nextCycleContinuationRunnerGroup: target.nextCycleContinuationRunnerGroup,
    nextCycleContinuationCompletionActionPackLane: target.nextCycleContinuationCompletionActionPackLane,
    nextCycleContinuationCompletionRunnerGroup: target.nextCycleContinuationCompletionRunnerGroup,

    approvalStatus:
      failures.length === 0
        ? "approved_to_build_post_six_league_next_cycle_continuation_completion_execution_runner"
        : "blocked_from_post_six_league_next_cycle_continuation_completion_execution_runner",
    failures,
    mayBuildNextCycleContinuationCompletionExecutionRunnerForTarget: failures.length === 0,
    nextRunnerRequiresExplicitAllowExecuteFlag: true,

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,
    approvalIsSearchPermissionNow: false,
    approvalIsBroadSearchPermissionNow: false,
    approvalIsClassifierPermissionNow: false,
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsProductionWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false,

    nextRunnerMayExecuteContinuationCompletion: failures.length === 0,
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
  (row) => row.approvalStatus === "approved_to_build_post_six_league_next_cycle_continuation_completion_execution_runner"
);

const blockedRows = approvalRows.filter(
  (row) => row.approvalStatus !== "approved_to_build_post_six_league_next_cycle_continuation_completion_execution_runner"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateReadCount: 2,
  sourceNextCycleContinuationCompletionRunnerTargetCount: runnerTargets.length,
  sourceNextCycleContinuationCompletionActionPackQualityGateRowCount: qualityGateRows.length,

  nextCycleContinuationCompletionExecutionApprovalRowCount: approvalRows.length,
  approvedNextCycleContinuationCompletionExecutionApprovalRowCount: approvedRows.length,
  blockedNextCycleContinuationCompletionExecutionApprovalRowCount: blockedRows.length,

  approvedMainLaneNextCycleContinuationCompletionExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  approvedRepairBacklogNextCycleContinuationCompletionExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  approvedSportomediaRepairNextCycleContinuationCompletionExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    manifest.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    manifest.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    manifest.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionRunnerCount:
    blockedRows.length === 0 ? 1 : 0,

  executionApprovalIsExecutionPermissionNowCount: 0,
  executionApprovalIsFetchPermissionNowCount: 0,
  executionApprovalIsSearchPermissionNowCount: 0,
  executionApprovalIsBroadSearchPermissionNowCount: 0,
  executionApprovalIsClassifierPermissionNowCount: 0,
  executionApprovalIsCanonicalWritePermissionNowCount: 0,
  executionApprovalIsProductionWritePermissionNowCount: 0,
  executionApprovalIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayExecuteContinuationCompletionCount: approvedRows.length,
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
  job: "run-football-truth-post-six-league-full-map-next-cycle-continuation-completion-execution-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_execution_approval_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionRunnerManifest: manifestPath,
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGate: qualityGatePath
  },
  policy: {
    continuationCompletionExecutionApprovalGateOnly: true,
    approvalDoesNotExecuteContinuationCompletion: true,
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
  throw new Error(`Next-cycle continuation-completion execution approval gate blocked ${blockedRows.length} targets`);
}
