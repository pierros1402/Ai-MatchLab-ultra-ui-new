import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

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
  "post-six-league-full-map-next-cycle-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-execution-approval-gate-2026-06-15.json"
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

  if (s.nextCycleRunnerTargetCount !== 5) throw new Error(`Expected nextCycleRunnerTargetCount=5, got ${s.nextCycleRunnerTargetCount}`);
  if (s.readyNextCycleRunnerTargetCount !== 5) throw new Error(`Expected readyNextCycleRunnerTargetCount=5, got ${s.readyNextCycleRunnerTargetCount}`);
  if (s.blockedNextCycleRunnerTargetCount !== 0) throw new Error(`Expected blockedNextCycleRunnerTargetCount=0, got ${s.blockedNextCycleRunnerTargetCount}`);
  if (s.mainLaneNextCycleRunnerTargetCount !== 4) throw new Error(`Expected mainLaneNextCycleRunnerTargetCount=4, got ${s.mainLaneNextCycleRunnerTargetCount}`);
  if (s.repairBacklogNextCycleRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogNextCycleRunnerTargetCount=1, got ${s.repairBacklogNextCycleRunnerTargetCount}`);
  if (s.sportomediaRepairNextCycleRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleRunnerTargetCount=1, got ${s.sportomediaRepairNextCycleRunnerTargetCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleExecutionApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleExecutionApprovalGateCount=1");
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

  if (s.nextCycleActionPackQualityGateRowCount !== 5) throw new Error(`Expected nextCycleActionPackQualityGateRowCount=5, got ${s.nextCycleActionPackQualityGateRowCount}`);
  if (s.nextCycleActionPackQualityGatePassedCount !== 5) throw new Error(`Expected nextCycleActionPackQualityGatePassedCount=5, got ${s.nextCycleActionPackQualityGatePassedCount}`);
  if (s.nextCycleActionPackQualityGateBlockedCount !== 0) throw new Error(`Expected nextCycleActionPackQualityGateBlockedCount=0, got ${s.nextCycleActionPackQualityGateBlockedCount}`);
  if (s.mainLaneNextCycleActionPackQualityGatedCount !== 4) throw new Error(`Expected mainLaneNextCycleActionPackQualityGatedCount=4, got ${s.mainLaneNextCycleActionPackQualityGatedCount}`);
  if (s.repairBacklogNextCycleActionPackQualityGatedCount !== 1) throw new Error(`Expected repairBacklogNextCycleActionPackQualityGatedCount=1, got ${s.repairBacklogNextCycleActionPackQualityGatedCount}`);
  if (s.sportomediaRepairNextCycleActionPackQualityGatedCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleActionPackQualityGatedCount=1, got ${s.sportomediaRepairNextCycleActionPackQualityGatedCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleRunnerManifestCount=1");
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

  if (!target.postSixLeagueNextCycleRunnerTargetId) failures.push("missing_next_cycle_runner_target_id");
  if (!target.postSixLeagueNextCycleActionPackQualityGateRowId) failures.push("missing_next_cycle_action_pack_quality_gate_row_id");
  if (!target.postSixLeagueNextCycleActionPackRowId) failures.push("missing_next_cycle_action_pack_row_id");
  if (!target.postSixLeagueNextCycleRoutingRowId) failures.push("missing_next_cycle_routing_row_id");
  if (!target.sourceLane) failures.push("missing_source_lane");
  if (!target.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!target.nextCycleActionPackLane) failures.push("missing_next_cycle_action_pack_lane");
  if (!target.nextCycleRunnerGroup) failures.push("missing_next_cycle_runner_group");

  if (target.runnerTargetStatus !== "ready_for_post_six_league_next_cycle_execution_approval_gate") {
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
const qualityGateRows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];

if (runnerTargets.length !== 5) throw new Error(`Expected 5 next-cycle runner targets, got ${runnerTargets.length}`);
if (qualityGateRows.length !== 5) throw new Error(`Expected 5 next-cycle quality gate rows, got ${qualityGateRows.length}`);

const approvalRows = runnerTargets.map((target, index) => {
  const failures = validateRunnerTarget(target);

  return {
    postSixLeagueNextCycleExecutionApprovalRowId: `post_six_league_next_cycle_execution_approval_${String(index + 1).padStart(2, "0")}`,
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
    providerFamily: target.providerFamily || null,
    executionGroup: target.executionGroup || null,
    nextCycleActionPackLane: target.nextCycleActionPackLane,
    nextCycleRunnerGroup: target.nextCycleRunnerGroup,

    approvalStatus:
      failures.length === 0
        ? "approved_to_build_post_six_league_next_cycle_execution_runner"
        : "blocked_from_post_six_league_next_cycle_execution_runner",
    failures,
    mayBuildNextCycleExecutionRunnerForTarget: failures.length === 0,
    nextRunnerRequiresExplicitAllowExecuteFlag: true,

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,
    approvalIsSearchPermissionNow: false,
    approvalIsBroadSearchPermissionNow: false,
    approvalIsClassifierPermissionNow: false,
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsProductionWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false,

    nextRunnerMayExecuteNextCycle: failures.length === 0,
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
  (row) => row.approvalStatus === "approved_to_build_post_six_league_next_cycle_execution_runner"
);

const blockedRows = approvalRows.filter(
  (row) => row.approvalStatus !== "approved_to_build_post_six_league_next_cycle_execution_runner"
);

const summary = {
  postSixLeagueFullMapNextCycleExecutionApprovalGateReadCount: 2,
  sourceNextCycleRunnerTargetCount: runnerTargets.length,
  sourceNextCycleActionPackQualityGateRowCount: qualityGateRows.length,

  nextCycleExecutionApprovalRowCount: approvalRows.length,
  approvedNextCycleExecutionApprovalRowCount: approvedRows.length,
  blockedNextCycleExecutionApprovalRowCount: blockedRows.length,

  approvedMainLaneNextCycleExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  approvedRepairBacklogNextCycleExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  approvedSportomediaRepairNextCycleExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    manifest.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  mayBuildPostSixLeagueFullMapNextCycleExecutionRunnerCount:
    blockedRows.length === 0 ? 1 : 0,

  executionApprovalIsExecutionPermissionNowCount: 0,
  executionApprovalIsFetchPermissionNowCount: 0,
  executionApprovalIsSearchPermissionNowCount: 0,
  executionApprovalIsBroadSearchPermissionNowCount: 0,
  executionApprovalIsClassifierPermissionNowCount: 0,
  executionApprovalIsCanonicalWritePermissionNowCount: 0,
  executionApprovalIsProductionWritePermissionNowCount: 0,
  executionApprovalIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayExecuteNextCycleCount: approvedRows.length,
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
  job: "run-football-truth-post-six-league-full-map-next-cycle-execution-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_execution_approval_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleRunnerManifest: manifestPath,
    postSixLeagueNextCycleActionPackQualityGate: qualityGatePath
  },
  policy: {
    executionApprovalGateOnly: true,
    approvalDoesNotExecuteNextCycle: true,
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
  throw new Error(`Next-cycle execution approval gate blocked ${blockedRows.length} targets`);
}
