import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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
  "post-six-league-full-map-next-cycle-continuation-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-execution-approval-gate-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationRunnerManifestReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationRunnerManifestReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationRunnerManifestReadCount}`);
  }
  if (s.sourceNextCycleContinuationActionPackQualityGateRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationActionPackQualityGateRowCount=5, got ${s.sourceNextCycleContinuationActionPackQualityGateRowCount}`);
  if (s.sourceNextCycleContinuationActionPackRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationActionPackRowCount=5, got ${s.sourceNextCycleContinuationActionPackRowCount}`);
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

function validateRunnerTarget(target) {
  const failures = [];

  if (!target.postSixLeagueNextCycleContinuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!target.postSixLeagueNextCycleContinuationActionPackQualityGateRowId) failures.push("missing_continuation_action_pack_quality_gate_row_id");
  if (!target.postSixLeagueNextCycleContinuationActionPackRowId) failures.push("missing_continuation_action_pack_row_id");
  if (!target.postSixLeagueNextCycleContinuationRoutingRowId) failures.push("missing_continuation_routing_row_id");
  if (!target.postSixLeagueNextCycleExecutionVerificationRowId) failures.push("missing_next_cycle_execution_verification_row_id");
  if (!target.postSixLeagueNextCycleExecutionRowId) failures.push("missing_next_cycle_execution_row_id");
  if (!target.postSixLeagueNextCycleExecutionApprovalRowId) failures.push("missing_next_cycle_execution_approval_row_id");
  if (!target.postSixLeagueNextCycleRunnerTargetId) failures.push("missing_next_cycle_runner_target_id");
  if (!target.sourceLane) failures.push("missing_source_lane");
  if (!target.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!target.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!target.nextCycleContinuationActionPackLane) failures.push("missing_next_cycle_continuation_action_pack_lane");
  if (!target.nextCycleContinuationRunnerGroup) failures.push("missing_next_cycle_continuation_runner_group");

  if (target.continuationRunnerTargetStatus !== "ready_for_post_six_league_next_cycle_continuation_execution_approval_gate") {
    failures.push(`unexpected_continuation_runner_target_status:${target.continuationRunnerTargetStatus}`);
  }

  if (target.requiresExecutionApprovalGate !== true) failures.push("execution_approval_gate_not_required");
  if (target.requiresExplicitAllowExecuteFlag !== true) failures.push("explicit_allow_execute_flag_not_required");

  [
    "continuationRunnerIsExecutionPermissionNow",
    "continuationRunnerIsFetchPermissionNow",
    "continuationRunnerIsSearchPermissionNow",
    "continuationRunnerIsBroadSearchPermissionNow",
    "continuationRunnerIsClassifierPermissionNow",
    "continuationRunnerIsCanonicalWritePermissionNow",
    "continuationRunnerIsProductionWritePermissionNow",
    "continuationRunnerIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (target[key] !== false) failures.push(`continuation_runner_guardrail_not_false:${key}`);
  });

  return failures;
}

const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateManifest(manifest);
validateQualityGate(qualityGate);

const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];
const qualityGateRows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];

if (runnerTargets.length !== 5) throw new Error(`Expected 5 continuation runner targets, got ${runnerTargets.length}`);
if (qualityGateRows.length !== 5) throw new Error(`Expected 5 continuation quality gate rows, got ${qualityGateRows.length}`);

const approvalRows = runnerTargets.map((target, index) => {
  const failures = validateRunnerTarget(target);

  return {
    postSixLeagueNextCycleContinuationExecutionApprovalRowId: `post_six_league_next_cycle_continuation_execution_approval_${String(index + 1).padStart(2, "0")}`,
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
    providerFamily: target.providerFamily || null,
    executionGroup: target.executionGroup || null,
    nextCycleActionPackLane: target.nextCycleActionPackLane,
    nextCycleRunnerGroup: target.nextCycleRunnerGroup,
    nextCycleContinuationActionPackLane: target.nextCycleContinuationActionPackLane,
    nextCycleContinuationRunnerGroup: target.nextCycleContinuationRunnerGroup,

    approvalStatus:
      failures.length === 0
        ? "approved_to_build_post_six_league_next_cycle_continuation_execution_runner"
        : "blocked_from_post_six_league_next_cycle_continuation_execution_runner",
    failures,
    mayBuildNextCycleContinuationExecutionRunnerForTarget: failures.length === 0,
    nextRunnerRequiresExplicitAllowExecuteFlag: true,

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,
    approvalIsSearchPermissionNow: false,
    approvalIsBroadSearchPermissionNow: false,
    approvalIsClassifierPermissionNow: false,
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsProductionWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false,

    nextRunnerMayExecuteContinuation: failures.length === 0,
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
  (row) => row.approvalStatus === "approved_to_build_post_six_league_next_cycle_continuation_execution_runner"
);

const blockedRows = approvalRows.filter(
  (row) => row.approvalStatus !== "approved_to_build_post_six_league_next_cycle_continuation_execution_runner"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationExecutionApprovalGateReadCount: 2,
  sourceNextCycleContinuationRunnerTargetCount: runnerTargets.length,
  sourceNextCycleContinuationActionPackQualityGateRowCount: qualityGateRows.length,

  nextCycleContinuationExecutionApprovalRowCount: approvalRows.length,
  approvedNextCycleContinuationExecutionApprovalRowCount: approvedRows.length,
  blockedNextCycleContinuationExecutionApprovalRowCount: blockedRows.length,

  approvedMainLaneNextCycleContinuationExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  approvedRepairBacklogNextCycleContinuationExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  approvedSportomediaRepairNextCycleContinuationExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    manifest.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    manifest.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionRunnerCount:
    blockedRows.length === 0 ? 1 : 0,

  executionApprovalIsExecutionPermissionNowCount: 0,
  executionApprovalIsFetchPermissionNowCount: 0,
  executionApprovalIsSearchPermissionNowCount: 0,
  executionApprovalIsBroadSearchPermissionNowCount: 0,
  executionApprovalIsClassifierPermissionNowCount: 0,
  executionApprovalIsCanonicalWritePermissionNowCount: 0,
  executionApprovalIsProductionWritePermissionNowCount: 0,
  executionApprovalIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayExecuteContinuationCount: approvedRows.length,
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
  job: "run-football-truth-post-six-league-full-map-next-cycle-continuation-execution-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_execution_approval_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationRunnerManifest: manifestPath,
    postSixLeagueNextCycleContinuationActionPackQualityGate: qualityGatePath
  },
  policy: {
    continuationExecutionApprovalGateOnly: true,
    approvalDoesNotExecuteContinuation: true,
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
  throw new Error(`Next-cycle continuation execution approval gate blocked ${blockedRows.length} targets`);
}
