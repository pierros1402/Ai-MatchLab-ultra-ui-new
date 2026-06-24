import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-2026-06-15.json"
);

const routingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-routing-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-routing-artifact-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-quality-gate-2026-06-15.json"
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

function validateRouting(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactReadCount}`);
  }
  if (s.nextCycleContinuationCompletionRoutingRowCount !== 5) throw new Error(`Expected nextCycleContinuationCompletionRoutingRowCount=5, got ${s.nextCycleContinuationCompletionRoutingRowCount}`);
  if (s.readyNextCycleContinuationCompletionRoutingRowCount !== 5) throw new Error(`Expected readyNextCycleContinuationCompletionRoutingRowCount=5, got ${s.readyNextCycleContinuationCompletionRoutingRowCount}`);
  if (s.blockedNextCycleContinuationCompletionRoutingRowCount !== 0) throw new Error(`Expected blockedNextCycleContinuationCompletionRoutingRowCount=0, got ${s.blockedNextCycleContinuationCompletionRoutingRowCount}`);
  if (s.mainLaneNextCycleContinuationCompletionRoutingRowCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationCompletionRoutingRowCount=4, got ${s.mainLaneNextCycleContinuationCompletionRoutingRowCount}`);
  if (s.repairBacklogNextCycleContinuationCompletionRoutingRowCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationCompletionRoutingRowCount=1, got ${s.repairBacklogNextCycleContinuationCompletionRoutingRowCount}`);
  if (s.sportomediaRepairNextCycleContinuationCompletionRoutingRowCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationCompletionRoutingRowCount=1, got ${s.sportomediaRepairNextCycleContinuationCompletionRoutingRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionActionPackCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionActionPackCount=1");
  }

  [
    "continuationCompletionRoutingIsExecutionPermissionNowCount",
    "continuationCompletionRoutingIsFetchPermissionNowCount",
    "continuationCompletionRoutingIsSearchPermissionNowCount",
    "continuationCompletionRoutingIsBroadSearchPermissionNowCount",
    "continuationCompletionRoutingIsClassifierPermissionNowCount",
    "continuationCompletionRoutingIsCanonicalWritePermissionNowCount",
    "continuationCompletionRoutingIsProductionWritePermissionNowCount",
    "continuationCompletionRoutingIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `routing.summary.${key}`));

  assertFalse(input.productionWrite, "routing.productionWrite");
  assertFalse(input.sourceFetch?.executed, "routing.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "routing.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "routing.broadSearchUsed");
  assertFalse(input.classifierExecuted, "routing.classifierExecuted");
}

function validateActionPackRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleContinuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.postSixLeagueNextCycleContinuationExecutionApprovalRowId) failures.push("missing_continuation_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleContinuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!row.postSixLeagueNextCycleContinuationActionPackQualityGateRowId) failures.push("missing_continuation_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleContinuationActionPackRowId) failures.push("missing_continuation_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationRoutingRowId) failures.push("missing_continuation_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");
  if (!row.nextCycleContinuationCompletionActionPackLane) failures.push("missing_next_cycle_continuation_completion_action_pack_lane");
  if (!row.nextCycleContinuationCompletionActionPackIntent) failures.push("missing_next_cycle_continuation_completion_action_pack_intent");

  if (row.nextCycleContinuationCompletionActionPackStatus !== "ready_for_post_six_league_next_cycle_continuation_completion_action_pack_quality_gate") {
    failures.push(`unexpected_completion_action_pack_status:${row.nextCycleContinuationCompletionActionPackStatus}`);
  }

  if (row.mayBuildNextCycleContinuationCompletionActionPackQualityGateForRow !== true) {
    failures.push("may_build_completion_action_pack_quality_gate_not_true");
  }

  [
    "continuationCompletionActionPackIsExecutionPermissionNow",
    "continuationCompletionActionPackIsFetchPermissionNow",
    "continuationCompletionActionPackIsSearchPermissionNow",
    "continuationCompletionActionPackIsBroadSearchPermissionNow",
    "continuationCompletionActionPackIsClassifierPermissionNow",
    "continuationCompletionActionPackIsCanonicalWritePermissionNow",
    "continuationCompletionActionPackIsProductionWritePermissionNow",
    "continuationCompletionActionPackIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`completion_action_pack_guardrail_not_false:${key}`);
  });

  return failures;
}

const actionPack = readJson(actionPackPath);
const routing = readJson(routingPath);

validateActionPack(actionPack);
validateRouting(routing);

const actionPackRows = Array.isArray(actionPack.completionActionPackRows)
  ? actionPack.completionActionPackRows
  : [];

const routingRows = Array.isArray(routing.completionRoutingRows)
  ? routing.completionRoutingRows
  : [];

if (actionPackRows.length !== 5) throw new Error(`Expected 5 continuation-completion action-pack rows, got ${actionPackRows.length}`);
if (routingRows.length !== 5) throw new Error(`Expected 5 continuation-completion routing rows, got ${routingRows.length}`);

const qualityGateRows = actionPackRows.map((row, index) => {
  const failures = validateActionPackRow(row);

  return {
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId: `post_six_league_next_cycle_continuation_completion_action_pack_quality_gate_${String(index + 1).padStart(2, "0")}`,
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

    qualityGateStatus:
      failures.length === 0
        ? "passed_ready_for_post_six_league_next_cycle_continuation_completion_runner_manifest"
        : "blocked_from_post_six_league_next_cycle_continuation_completion_runner_manifest",
    failures,
    mayBuildNextCycleContinuationCompletionRunnerManifestForRow: failures.length === 0,

    qualityGateIsExecutionPermissionNow: false,
    qualityGateIsFetchPermissionNow: false,
    qualityGateIsSearchPermissionNow: false,
    qualityGateIsBroadSearchPermissionNow: false,
    qualityGateIsClassifierPermissionNow: false,
    qualityGateIsCanonicalWritePermissionNow: false,
    qualityGateIsProductionWritePermissionNow: false,
    qualityGateIsTruthAssertionPermissionNow: false
  };
});

const passedRows = qualityGateRows.filter(
  (row) => row.qualityGateStatus === "passed_ready_for_post_six_league_next_cycle_continuation_completion_runner_manifest"
);

const blockedRows = qualityGateRows.filter(
  (row) => row.qualityGateStatus !== "passed_ready_for_post_six_league_next_cycle_continuation_completion_runner_manifest"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateReadCount: 2,
  sourceNextCycleContinuationCompletionActionPackRowCount: actionPackRows.length,
  sourceNextCycleContinuationCompletionRoutingRowCount: routingRows.length,

  nextCycleContinuationCompletionActionPackQualityGateRowCount: qualityGateRows.length,
  nextCycleContinuationCompletionActionPackQualityGatePassedCount: passedRows.length,
  nextCycleContinuationCompletionActionPackQualityGateBlockedCount: blockedRows.length,

  mainLaneNextCycleContinuationCompletionActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleContinuationCompletionActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleContinuationCompletionActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    actionPack.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    actionPack.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    actionPack.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionRunnerManifestCount:
    blockedRows.length === 0 ? 1 : 0,

  qualityGateIsExecutionPermissionNowCount: 0,
  qualityGateIsFetchPermissionNowCount: 0,
  qualityGateIsSearchPermissionNowCount: 0,
  qualityGateIsBroadSearchPermissionNowCount: 0,
  qualityGateIsClassifierPermissionNowCount: 0,
  qualityGateIsCanonicalWritePermissionNowCount: 0,
  qualityGateIsProductionWritePermissionNowCount: 0,
  qualityGateIsTruthAssertionPermissionNowCount: 0,

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
  job: "run-football-truth-post-six-league-full-map-next-cycle-continuation-completion-action-pack-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_action_pack_quality_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionActionPack: actionPackPath,
    postSixLeagueNextCycleContinuationCompletionRoutingArtifact: routingPath
  },
  policy: {
    continuationCompletionActionPackQualityGateOnly: true,
    continuationCompletionRunnerManifestRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  qualityGateRows,
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
  throw new Error(`Next-cycle continuation-completion action-pack quality gate blocked ${blockedRows.length} rows`);
}
