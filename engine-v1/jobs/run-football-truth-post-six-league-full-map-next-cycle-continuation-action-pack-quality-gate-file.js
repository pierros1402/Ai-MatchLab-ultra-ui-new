import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-action-pack-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-action-pack-2026-06-15.json"
);

const routingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-routing-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-routing-artifact-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-action-pack-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-action-pack-quality-gate-2026-06-15.json"
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

function validateRouting(input) {
  const s = input.summary || {};

  if (s.nextCycleContinuationRoutingRowCount !== 5) throw new Error(`Expected nextCycleContinuationRoutingRowCount=5, got ${s.nextCycleContinuationRoutingRowCount}`);
  if (s.readyNextCycleContinuationRoutingRowCount !== 5) throw new Error(`Expected readyNextCycleContinuationRoutingRowCount=5, got ${s.readyNextCycleContinuationRoutingRowCount}`);
  if (s.blockedNextCycleContinuationRoutingRowCount !== 0) throw new Error(`Expected blockedNextCycleContinuationRoutingRowCount=0, got ${s.blockedNextCycleContinuationRoutingRowCount}`);
  if (s.mainLaneNextCycleContinuationRoutingRowCount !== 4) throw new Error(`Expected mainLaneNextCycleContinuationRoutingRowCount=4, got ${s.mainLaneNextCycleContinuationRoutingRowCount}`);
  if (s.repairBacklogNextCycleContinuationRoutingRowCount !== 1) throw new Error(`Expected repairBacklogNextCycleContinuationRoutingRowCount=1, got ${s.repairBacklogNextCycleContinuationRoutingRowCount}`);
  if (s.sportomediaRepairNextCycleContinuationRoutingRowCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleContinuationRoutingRowCount=1, got ${s.sportomediaRepairNextCycleContinuationRoutingRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationActionPackCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationActionPackCount=1");
  }

  [
    "continuationRoutingIsExecutionPermissionNowCount",
    "continuationRoutingIsFetchPermissionNowCount",
    "continuationRoutingIsSearchPermissionNowCount",
    "continuationRoutingIsBroadSearchPermissionNowCount",
    "continuationRoutingIsClassifierPermissionNowCount",
    "continuationRoutingIsCanonicalWritePermissionNowCount",
    "continuationRoutingIsProductionWritePermissionNowCount",
    "continuationRoutingIsTruthAssertionPermissionNowCount",
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

  if (!row.postSixLeagueNextCycleContinuationActionPackRowId) failures.push("missing_continuation_action_pack_row_id");
  if (!row.postSixLeagueNextCycleContinuationRoutingRowId) failures.push("missing_continuation_routing_row_id");
  if (!row.postSixLeagueNextCycleExecutionVerificationRowId) failures.push("missing_next_cycle_execution_verification_row_id");
  if (!row.postSixLeagueNextCycleExecutionRowId) failures.push("missing_next_cycle_execution_row_id");
  if (!row.postSixLeagueNextCycleExecutionApprovalRowId) failures.push("missing_next_cycle_execution_approval_row_id");
  if (!row.postSixLeagueNextCycleRunnerTargetId) failures.push("missing_next_cycle_runner_target_id");
  if (!row.postSixLeagueNextCycleActionPackQualityGateRowId) failures.push("missing_next_cycle_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleActionPackRowId) failures.push("missing_next_cycle_action_pack_row_id");
  if (!row.postSixLeagueNextCycleRoutingRowId) failures.push("missing_next_cycle_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationActionPackLane) failures.push("missing_next_cycle_continuation_action_pack_lane");
  if (!row.nextCycleContinuationActionPackIntent) failures.push("missing_next_cycle_continuation_action_pack_intent");

  if (row.nextCycleContinuationActionPackStatus !== "ready_for_post_six_league_next_cycle_continuation_action_pack_quality_gate") {
    failures.push(`unexpected_continuation_action_pack_status:${row.nextCycleContinuationActionPackStatus}`);
  }

  if (row.mayBuildNextCycleContinuationActionPackQualityGateForRow !== true) {
    failures.push("may_build_continuation_action_pack_quality_gate_not_true");
  }

  [
    "continuationActionPackIsExecutionPermissionNow",
    "continuationActionPackIsFetchPermissionNow",
    "continuationActionPackIsSearchPermissionNow",
    "continuationActionPackIsBroadSearchPermissionNow",
    "continuationActionPackIsClassifierPermissionNow",
    "continuationActionPackIsCanonicalWritePermissionNow",
    "continuationActionPackIsProductionWritePermissionNow",
    "continuationActionPackIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`continuation_action_pack_guardrail_not_false:${key}`);
  });

  return failures;
}

const actionPack = readJson(actionPackPath);
const routing = readJson(routingPath);

validateActionPack(actionPack);
validateRouting(routing);

const actionPackRows = Array.isArray(actionPack.continuationActionPackRows)
  ? actionPack.continuationActionPackRows
  : [];

const routingRows = Array.isArray(routing.continuationRoutingRows)
  ? routing.continuationRoutingRows
  : [];

if (actionPackRows.length !== 5) throw new Error(`Expected 5 continuation action-pack rows, got ${actionPackRows.length}`);
if (routingRows.length !== 5) throw new Error(`Expected 5 continuation routing rows, got ${routingRows.length}`);

const qualityGateRows = actionPackRows.map((row, index) => {
  const failures = validateActionPackRow(row);

  return {
    postSixLeagueNextCycleContinuationActionPackQualityGateRowId: `post_six_league_next_cycle_continuation_action_pack_quality_gate_${String(index + 1).padStart(2, "0")}`,
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

    qualityGateStatus:
      failures.length === 0
        ? "passed_ready_for_post_six_league_next_cycle_continuation_runner_manifest"
        : "blocked_from_post_six_league_next_cycle_continuation_runner_manifest",
    failures,
    mayBuildNextCycleContinuationRunnerManifestForRow: failures.length === 0,

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
  (row) => row.qualityGateStatus === "passed_ready_for_post_six_league_next_cycle_continuation_runner_manifest"
);

const blockedRows = qualityGateRows.filter(
  (row) => row.qualityGateStatus !== "passed_ready_for_post_six_league_next_cycle_continuation_runner_manifest"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationActionPackQualityGateReadCount: 2,
  sourceNextCycleContinuationActionPackRowCount: actionPackRows.length,
  sourceNextCycleContinuationRoutingRowCount: routingRows.length,

  nextCycleContinuationActionPackQualityGateRowCount: qualityGateRows.length,
  nextCycleContinuationActionPackQualityGatePassedCount: passedRows.length,
  nextCycleContinuationActionPackQualityGateBlockedCount: blockedRows.length,

  mainLaneNextCycleContinuationActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleContinuationActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleContinuationActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    actionPack.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    actionPack.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationRunnerManifestCount:
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
  job: "run-football-truth-post-six-league-full-map-next-cycle-continuation-action-pack-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_action_pack_quality_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationActionPack: actionPackPath,
    postSixLeagueNextCycleContinuationRoutingArtifact: routingPath
  },
  policy: {
    continuationActionPackQualityGateOnly: true,
    continuationRunnerManifestRequiredBeforeAnyFurtherExecution: true,
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
  throw new Error(`Next-cycle continuation action-pack quality gate blocked ${blockedRows.length} rows`);
}
