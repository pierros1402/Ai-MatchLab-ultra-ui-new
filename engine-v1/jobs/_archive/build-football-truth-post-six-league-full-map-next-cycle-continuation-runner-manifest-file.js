import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-action-pack-quality-gate-2026-06-15.json"
);

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-action-pack-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-action-pack-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-runner-manifest-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-runner-manifest-2026-06-15.json"
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

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationActionPackQualityGateReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationActionPackQualityGateReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationActionPackQualityGateReadCount}`);
  }
  if (s.sourceNextCycleContinuationActionPackRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationActionPackRowCount=5, got ${s.sourceNextCycleContinuationActionPackRowCount}`);
  if (s.sourceNextCycleContinuationRoutingRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationRoutingRowCount=5, got ${s.sourceNextCycleContinuationRoutingRowCount}`);
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

function validateActionPack(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationActionPackReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationActionPackReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationActionPackReadCount}`);
  }
  if (s.sourceNextCycleContinuationRoutingRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationRoutingRowCount=5, got ${s.sourceNextCycleContinuationRoutingRowCount}`);
  if (s.sourceNextCycleExecutionVerificationRowCount !== 5) throw new Error(`Expected sourceNextCycleExecutionVerificationRowCount=5, got ${s.sourceNextCycleExecutionVerificationRowCount}`);
  if (s.nextCycleContinuationActionPackRowCount !== 5) throw new Error(`Expected nextCycleContinuationActionPackRowCount=5, got ${s.nextCycleContinuationActionPackRowCount}`);
  if (s.readyNextCycleContinuationActionPackRowCount !== 5) throw new Error(`Expected readyNextCycleContinuationActionPackRowCount=5, got ${s.readyNextCycleContinuationActionPackRowCount}`);
  if (s.blockedNextCycleContinuationActionPackRowCount !== 0) throw new Error(`Expected blockedNextCycleContinuationActionPackRowCount=0, got ${s.blockedNextCycleContinuationActionPackRowCount}`);
  if (s.mainLaneNextCycleContinuationActionPackRowCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationActionPackRowCount=4, got ${s.mainLaneNextCycleContinuationActionPackRowCount}`);
  if (s.repairBacklogNextCycleContinuationActionPackRowCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationActionPackRowCount=1, got ${s.repairBacklogNextCycleContinuationActionPackRowCount}`);
  if (s.sportomediaRepairNextCycleContinuationActionPackRowCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationActionPackRowCount=1, got ${s.sportomediaRepairNextCycleContinuationActionPackRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationActionPackQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationActionPackQualityGateCount=1");
  }

  [
    "continuationActionPackIsExecutionPermissionNowCount",
    "continuationActionPackIsFetchPermissionNowCount",
    "continuationActionPackIsSearchPermissionNowCount",
    "continuationActionPackIsBroadSearchPermissionNowCount",
    "continuationActionPackIsClassifierPermissionNowCount",
    "continuationActionPackIsCanonicalWritePermissionNowCount",
    "continuationActionPackIsProductionWritePermissionNowCount",
    "continuationActionPackIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `actionPack.summary.${key}`));

  assertFalse(input.productionWrite, "actionPack.productionWrite");
  assertFalse(input.sourceFetch?.executed, "actionPack.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "actionPack.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "actionPack.broadSearchUsed");
  assertFalse(input.classifierExecuted, "actionPack.classifierExecuted");
}

function validateQualityGateRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleContinuationActionPackQualityGateRowId) failures.push("missing_continuation_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleContinuationActionPackRowId) failures.push("missing_continuation_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationRoutingRowId) failures.push("missing_continuation_routing_row_id");
  if (!row.postSixLeagueNextCycleExecutionVerificationRowId) failures.push("missing_next_cycle_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleExecutionRowId) failures.push("missing_next_cycle_execution_row_id");
  if (!row.postSixLeagueNextCycleExecutionApprovalRowId) failures.push("missing_next_cycle_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleRunnerTargetId) failures.push("missing_next_cycle_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationActionPackLane) failures.push("missing_next_cycle_continuation_action_pack_lane");

  if (row.qualityGateStatus !== "passed_ready_for_post_six_league_next_cycle_continuation_runner_manifest") {
    failures.push(`unexpected_quality_gate_status:${row.qualityGateStatus}`);
  }

  if (row.mayBuildNextCycleContinuationRunnerManifestForRow !== true) {
    failures.push("may_build_continuation_runner_manifest_not_true");
  }

  [
    "qualityGateIsExecutionPermissionNow",
    "qualityGateIsFetchPermissionNow",
    "qualityGateIsSearchPermissionNow",
    "qualityGateIsBroadSearchPermissionNow",
    "qualityGateIsClassifierPermissionNow",
    "qualityGateIsCanonicalWritePermissionNow",
    "qualityGateIsProductionWritePermissionNow",
    "qualityGateIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`quality_gate_guardrail_not_false:${key}`);
  });

  return failures;
}

const qualityGate = readJson(qualityGatePath);
const actionPack = readJson(actionPackPath);

validateQualityGate(qualityGate);
validateActionPack(actionPack);

const qualityGateRows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];
const actionPackRows = Array.isArray(actionPack.continuationActionPackRows) ? actionPack.continuationActionPackRows : [];

if (qualityGateRows.length !== 5) throw new Error(`Expected 5 continuation quality gate rows, got ${qualityGateRows.length}`);
if (actionPackRows.length !== 5) throw new Error(`Expected 5 continuation action-pack rows, got ${actionPackRows.length}`);

const actionPackById = new Map(
  actionPackRows.map((row) => [row.postSixLeagueNextCycleContinuationActionPackRowId, row])
);

const runnerTargets = qualityGateRows.map((row, index) => {
  const failures = validateQualityGateRow(row);
  const actionPackRow = actionPackById.get(row.postSixLeagueNextCycleContinuationActionPackRowId);

  if (!actionPackRow) failures.push("missing_matching_continuation_action_pack_row");

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";

  return {
    postSixLeagueNextCycleContinuationRunnerTargetId: `post_six_league_next_cycle_continuation_runner_target_${String(index + 1).padStart(2, "0")}`,
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

    nextCycleContinuationRunnerGroup: isMainLane
      ? "whole_map_main_lane_next_cycle_continuation_runner_group"
      : "repair_backlog_next_cycle_continuation_runner_group",
    continuationRunnerTargetStatus:
      failures.length === 0
        ? "ready_for_post_six_league_next_cycle_continuation_execution_approval_gate"
        : "blocked_from_post_six_league_next_cycle_continuation_execution_approval_gate",
    failures,
    requiresExecutionApprovalGate: true,
    requiresExplicitAllowExecuteFlag: true,

    continuationRunnerIsExecutionPermissionNow: false,
    continuationRunnerIsFetchPermissionNow: false,
    continuationRunnerIsSearchPermissionNow: false,
    continuationRunnerIsBroadSearchPermissionNow: false,
    continuationRunnerIsClassifierPermissionNow: false,
    continuationRunnerIsCanonicalWritePermissionNow: false,
    continuationRunnerIsProductionWritePermissionNow: false,
    continuationRunnerIsTruthAssertionPermissionNow: false
  };
});

const readyTargets = runnerTargets.filter(
  (row) => row.continuationRunnerTargetStatus === "ready_for_post_six_league_next_cycle_continuation_execution_approval_gate"
);

const blockedTargets = runnerTargets.filter(
  (row) => row.continuationRunnerTargetStatus !== "ready_for_post_six_league_next_cycle_continuation_execution_approval_gate"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationRunnerManifestReadCount: 2,
  sourceNextCycleContinuationActionPackQualityGateRowCount: qualityGateRows.length,
  sourceNextCycleContinuationActionPackRowCount: actionPackRows.length,

  nextCycleContinuationRunnerTargetCount: runnerTargets.length,
  readyNextCycleContinuationRunnerTargetCount: readyTargets.length,
  blockedNextCycleContinuationRunnerTargetCount: blockedTargets.length,

  mainLaneNextCycleContinuationRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleContinuationRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleContinuationRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    qualityGate.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    qualityGate.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationExecutionApprovalGateCount:
    blockedTargets.length === 0 ? 1 : 0,

  continuationRunnerManifestIsExecutionPermissionNowCount: 0,
  continuationRunnerManifestIsFetchPermissionNowCount: 0,
  continuationRunnerManifestIsSearchPermissionNowCount: 0,
  continuationRunnerManifestIsBroadSearchPermissionNowCount: 0,
  continuationRunnerManifestIsClassifierPermissionNowCount: 0,
  continuationRunnerManifestIsCanonicalWritePermissionNowCount: 0,
  continuationRunnerManifestIsProductionWritePermissionNowCount: 0,
  continuationRunnerManifestIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-continuation-runner-manifest-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_runner_manifest",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationActionPackQualityGate: qualityGatePath,
    postSixLeagueNextCycleContinuationActionPack: actionPackPath
  },
  policy: {
    continuationRunnerManifestOnly: true,
    continuationExecutionApprovalGateRequiredBeforeAnyFurtherExecution: true,
    explicitAllowExecuteFlagRequiredForFutureContinuationRunner: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  runnerTargets,
  blockedTargets,
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

if (blockedTargets.length > 0) {
  throw new Error(`Next-cycle continuation runner manifest blocked ${blockedTargets.length} targets`);
}
