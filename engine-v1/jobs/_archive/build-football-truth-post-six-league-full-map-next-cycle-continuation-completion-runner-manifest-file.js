import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-quality-gate-2026-06-15.json"
);

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-runner-manifest-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-runner-manifest-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateReadCount}`);
  }
  if (s.sourceNextCycleContinuationCompletionActionPackRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionActionPackRowCount=5, got ${s.sourceNextCycleContinuationCompletionActionPackRowCount}`);
  if (s.sourceNextCycleContinuationCompletionRoutingRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionRoutingRowCount=5, got ${s.sourceNextCycleContinuationCompletionRoutingRowCount}`);
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

function validateActionPack(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionActionPackReadCount !== 2) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionActionPackReadCount=2, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionActionPackReadCount}`);
  }
  if (s.sourceNextCycleContinuationCompletionRoutingRowCount !== 5) throw new Error(`Expected sourceNextCycleContinuationCompletionRoutingRowCount=5, got ${s.sourceNextCycleContinuationCompletionRoutingRowCount}`);
  if (s.sourceContinuationExecutionVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationExecutionVerificationRowCount=5, got ${s.sourceContinuationExecutionVerificationRowCount}`);
  if (s.nextCycleContinuationCompletionActionPackRowCount !== 5) throw new Error(`Expected nextCycleContinuationCompletionActionPackRowCount=5, got ${s.nextCycleContinuationCompletionActionPackRowCount}`);
  if (s.readyNextCycleContinuationCompletionActionPackRowCount !== 5) throw new Error(`Expected readyNextCycleContinuationCompletionActionPackRowCount=5, got ${s.readyNextCycleContinuationCompletionActionPackRowCount}`);
  if (s.blockedNextCycleContinuationCompletionActionPackRowCount !== 0) throw new Error(`Expected blockedNextCycleContinuationCompletionActionPackRowCount=0, got ${s.blockedNextCycleContinuationCompletionActionPackRowCount}`);
  if (s.mainLaneNextCycleContinuationCompletionActionPackRowCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationCompletionActionPackRowCount=4, got ${s.mainLaneNextCycleContinuationCompletionActionPackRowCount}`);
  if (s.repairBacklogNextCycleContinuationCompletionActionPackRowCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationCompletionActionPackRowCount=1, got ${s.repairBacklogNextCycleContinuationCompletionActionPackRowCount}`);
  if (s.sportomediaRepairNextCycleContinuationCompletionActionPackRowCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationCompletionActionPackRowCount=1, got ${s.sportomediaRepairNextCycleContinuationCompletionActionPackRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateCount=1");
  }

  [
    "continuationCompletionActionPackIsExecutionPermissionNowCount",
    "continuationCompletionActionPackIsFetchPermissionNowCount",
    "continuationCompletionActionPackIsSearchPermissionNowCount",
    "continuationCompletionActionPackIsBroadSearchPermissionNowCount",
    "continuationCompletionActionPackIsClassifierPermissionNowCount",
    "continuationCompletionActionPackIsCanonicalWritePermissionNowCount",
    "continuationCompletionActionPackIsProductionWritePermissionNowCount",
    "continuationCompletionActionPackIsTruthAssertionPermissionNowCount",
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

  if (!row.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId) failures.push("missing_completion_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionApprovalRowId) failures.push("missing_continuation_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleContinuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");
  if (!row.nextCycleContinuationCompletionActionPackLane) failures.push("missing_next_cycle_continuation_completion_action_pack_lane");

  if (row.qualityGateStatus !== "passed_ready_for_post_six_league_next_cycle_continuation_completion_runner_manifest") {
    failures.push(`unexpected_quality_gate_status:${row.qualityGateStatus}`);
  }

  if (row.mayBuildNextCycleContinuationCompletionRunnerManifestForRow !== true) {
    failures.push("may_build_completion_runner_manifest_not_true");
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
const actionPackRows = Array.isArray(actionPack.completionActionPackRows) ? actionPack.completionActionPackRows : [];

if (qualityGateRows.length !== 5) throw new Error(`Expected 5 continuation-completion quality gate rows, got ${qualityGateRows.length}`);
if (actionPackRows.length !== 5) throw new Error(`Expected 5 continuation-completion action-pack rows, got ${actionPackRows.length}`);

const actionPackById = new Map(
  actionPackRows.map((row) => [row.postSixLeagueNextCycleContinuationCompletionActionPackRowId, row])
);

const runnerTargets = qualityGateRows.map((row, index) => {
  const failures = validateQualityGateRow(row);
  const actionPackRow = actionPackById.get(row.postSixLeagueNextCycleContinuationCompletionActionPackRowId);

  if (!actionPackRow) failures.push("missing_matching_completion_action_pack_row");

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";

  return {
    postSixLeagueNextCycleContinuationCompletionRunnerTargetId: `post_six_league_next_cycle_continuation_completion_runner_target_${String(index + 1).padStart(2, "0")}`,
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

    nextCycleContinuationCompletionRunnerGroup: isMainLane
      ? "whole_map_main_lane_next_cycle_continuation_completion_runner_group"
      : "repair_backlog_next_cycle_continuation_completion_runner_group",
    continuationCompletionRunnerTargetStatus:
      failures.length === 0
        ? "ready_for_post_six_league_next_cycle_continuation_completion_execution_approval_gate"
        : "blocked_from_post_six_league_next_cycle_continuation_completion_execution_approval_gate",
    failures,
    requiresExecutionApprovalGate: true,
    requiresExplicitAllowExecuteFlag: true,

    continuationCompletionRunnerIsExecutionPermissionNow: false,
    continuationCompletionRunnerIsFetchPermissionNow: false,
    continuationCompletionRunnerIsSearchPermissionNow: false,
    continuationCompletionRunnerIsBroadSearchPermissionNow: false,
    continuationCompletionRunnerIsClassifierPermissionNow: false,
    continuationCompletionRunnerIsCanonicalWritePermissionNow: false,
    continuationCompletionRunnerIsProductionWritePermissionNow: false,
    continuationCompletionRunnerIsTruthAssertionPermissionNow: false
  };
});

const readyTargets = runnerTargets.filter(
  (row) => row.continuationCompletionRunnerTargetStatus === "ready_for_post_six_league_next_cycle_continuation_completion_execution_approval_gate"
);

const blockedTargets = runnerTargets.filter(
  (row) => row.continuationCompletionRunnerTargetStatus !== "ready_for_post_six_league_next_cycle_continuation_completion_execution_approval_gate"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionRunnerManifestReadCount: 2,
  sourceNextCycleContinuationCompletionActionPackQualityGateRowCount: qualityGateRows.length,
  sourceNextCycleContinuationCompletionActionPackRowCount: actionPackRows.length,

  nextCycleContinuationCompletionRunnerTargetCount: runnerTargets.length,
  readyNextCycleContinuationCompletionRunnerTargetCount: readyTargets.length,
  blockedNextCycleContinuationCompletionRunnerTargetCount: blockedTargets.length,

  mainLaneNextCycleContinuationCompletionRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleContinuationCompletionRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleContinuationCompletionRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    qualityGate.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    qualityGate.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    qualityGate.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionExecutionApprovalGateCount:
    blockedTargets.length === 0 ? 1 : 0,

  continuationCompletionRunnerManifestIsExecutionPermissionNowCount: 0,
  continuationCompletionRunnerManifestIsFetchPermissionNowCount: 0,
  continuationCompletionRunnerManifestIsSearchPermissionNowCount: 0,
  continuationCompletionRunnerManifestIsBroadSearchPermissionNowCount: 0,
  continuationCompletionRunnerManifestIsClassifierPermissionNowCount: 0,
  continuationCompletionRunnerManifestIsCanonicalWritePermissionNowCount: 0,
  continuationCompletionRunnerManifestIsProductionWritePermissionNowCount: 0,
  continuationCompletionRunnerManifestIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-continuation-completion-runner-manifest-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_runner_manifest",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGate: qualityGatePath,
    postSixLeagueNextCycleContinuationCompletionActionPack: actionPackPath
  },
  policy: {
    continuationCompletionRunnerManifestOnly: true,
    continuationCompletionExecutionApprovalGateRequiredBeforeAnyFurtherExecution: true,
    explicitAllowExecuteFlagRequiredForFutureContinuationCompletionRunner: true,
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
  throw new Error(`Next-cycle continuation-completion runner manifest blocked ${blockedTargets.length} targets`);
}
