import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-action-pack-2026-06-15",
  "post-six-league-full-map-next-cycle-action-pack-2026-06-15.json"
);

const routingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-routing-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-routing-artifact-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-action-pack-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-action-pack-quality-gate-2026-06-15.json"
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

  if (s.nextCycleActionPackRowCount !== 5) throw new Error(`Expected nextCycleActionPackRowCount=5, got ${s.nextCycleActionPackRowCount}`);
  if (s.readyNextCycleActionPackRowCount !== 5) throw new Error(`Expected readyNextCycleActionPackRowCount=5, got ${s.readyNextCycleActionPackRowCount}`);
  if (s.blockedNextCycleActionPackRowCount !== 0) throw new Error(`Expected blockedNextCycleActionPackRowCount=0, got ${s.blockedNextCycleActionPackRowCount}`);
  if (s.mainLaneNextCycleActionPackRowCount !== 4) throw new Error(`Expected mainLaneNextCycleActionPackRowCount=4, got ${s.mainLaneNextCycleActionPackRowCount}`);
  if (s.repairBacklogNextCycleActionPackRowCount !== 1) throw new Error(`Expected repairBacklogNextCycleActionPackRowCount=1, got ${s.repairBacklogNextCycleActionPackRowCount}`);
  if (s.sportomediaRepairNextCycleActionPackRowCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleActionPackRowCount=1, got ${s.sportomediaRepairNextCycleActionPackRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleActionPackQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleActionPackQualityGateCount=1");
  }

  [
    "nextCycleActionPackIsExecutionPermissionNowCount",
    "nextCycleActionPackIsFetchPermissionNowCount",
    "nextCycleActionPackIsSearchPermissionNowCount",
    "nextCycleActionPackIsBroadSearchPermissionNowCount",
    "nextCycleActionPackIsClassifierPermissionNowCount",
    "nextCycleActionPackIsCanonicalWritePermissionNowCount",
    "nextCycleActionPackIsProductionWritePermissionNowCount",
    "nextCycleActionPackIsTruthAssertionPermissionNowCount",
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

  if (s.nextCycleRoutingRowCount !== 5) throw new Error(`Expected nextCycleRoutingRowCount=5, got ${s.nextCycleRoutingRowCount}`);
  if (s.readyNextCycleRoutingRowCount !== 5) throw new Error(`Expected readyNextCycleRoutingRowCount=5, got ${s.readyNextCycleRoutingRowCount}`);
  if (s.blockedNextCycleRoutingRowCount !== 0) throw new Error(`Expected blockedNextCycleRoutingRowCount=0, got ${s.blockedNextCycleRoutingRowCount}`);
  if (s.mainLaneNextCycleRoutingRowCount !== 4) throw new Error(`Expected mainLaneNextCycleRoutingRowCount=4, got ${s.mainLaneNextCycleRoutingRowCount}`);
  if (s.repairBacklogNextCycleRoutingRowCount !== 1) throw new Error(`Expected repairBacklogNextCycleRoutingRowCount=1, got ${s.repairBacklogNextCycleRoutingRowCount}`);
  if (s.sportomediaRepairNextCycleRoutingRowCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleRoutingRowCount=1, got ${s.sportomediaRepairNextCycleRoutingRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleActionPackCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleActionPackCount=1");
  }

  [
    "nextCycleRoutingIsExecutionPermissionNowCount",
    "nextCycleRoutingIsFetchPermissionNowCount",
    "nextCycleRoutingIsSearchPermissionNowCount",
    "nextCycleRoutingIsBroadSearchPermissionNowCount",
    "nextCycleRoutingIsClassifierPermissionNowCount",
    "nextCycleRoutingIsCanonicalWritePermissionNowCount",
    "nextCycleRoutingIsProductionWritePermissionNowCount",
    "nextCycleRoutingIsTruthAssertionPermissionNowCount",
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

  if (!row.postSixLeagueNextCycleActionPackRowId) failures.push("missing_next_cycle_action_pack_row_id");
  if (!row.postSixLeagueNextCycleRoutingRowId) failures.push("missing_next_cycle_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleActionPackLane) failures.push("missing_next_cycle_action_pack_lane");
  if (!row.nextCycleActionPackIntent) failures.push("missing_next_cycle_action_pack_intent");

  if (row.nextCycleActionPackStatus !== "ready_for_post_six_league_next_cycle_action_pack_quality_gate") {
    failures.push(`unexpected_next_cycle_action_pack_status:${row.nextCycleActionPackStatus}`);
  }

  if (row.mayBuildNextCycleActionPackQualityGateForRow !== true) {
    failures.push("may_build_next_cycle_action_pack_quality_gate_not_true");
  }

  [
    "nextCycleActionPackIsExecutionPermissionNow",
    "nextCycleActionPackIsFetchPermissionNow",
    "nextCycleActionPackIsSearchPermissionNow",
    "nextCycleActionPackIsBroadSearchPermissionNow",
    "nextCycleActionPackIsClassifierPermissionNow",
    "nextCycleActionPackIsCanonicalWritePermissionNow",
    "nextCycleActionPackIsProductionWritePermissionNow",
    "nextCycleActionPackIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`next_cycle_action_pack_guardrail_not_false:${key}`);
  });

  return failures;
}

const actionPack = readJson(actionPackPath);
const routing = readJson(routingPath);

validateActionPack(actionPack);
validateRouting(routing);

const actionPackRows = Array.isArray(actionPack.nextCycleActionPackRows)
  ? actionPack.nextCycleActionPackRows
  : [];

const routingRows = Array.isArray(routing.nextCycleRoutingRows)
  ? routing.nextCycleRoutingRows
  : [];

if (actionPackRows.length !== 5) throw new Error(`Expected 5 next-cycle action-pack rows, got ${actionPackRows.length}`);
if (routingRows.length !== 5) throw new Error(`Expected 5 next-cycle routing rows, got ${routingRows.length}`);

const qualityGateRows = actionPackRows.map((row, index) => {
  const failures = validateActionPackRow(row);

  return {
    postSixLeagueNextCycleActionPackQualityGateRowId: `post_six_league_next_cycle_action_pack_quality_gate_${String(index + 1).padStart(2, "0")}`,
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
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    nextCycleActionPackLane: row.nextCycleActionPackLane,
    qualityGateStatus:
      failures.length === 0
        ? "passed_ready_for_post_six_league_next_cycle_runner_manifest"
        : "blocked_from_post_six_league_next_cycle_runner_manifest",
    failures,
    mayBuildNextCycleRunnerManifestForRow: failures.length === 0,

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
  (row) => row.qualityGateStatus === "passed_ready_for_post_six_league_next_cycle_runner_manifest"
);

const blockedRows = qualityGateRows.filter(
  (row) => row.qualityGateStatus !== "passed_ready_for_post_six_league_next_cycle_runner_manifest"
);

const summary = {
  postSixLeagueFullMapNextCycleActionPackQualityGateReadCount: 2,
  sourceNextCycleActionPackRowCount: actionPackRows.length,
  sourceNextCycleRoutingRowCount: routingRows.length,

  nextCycleActionPackQualityGateRowCount: qualityGateRows.length,
  nextCycleActionPackQualityGatePassedCount: passedRows.length,
  nextCycleActionPackQualityGateBlockedCount: blockedRows.length,

  mainLaneNextCycleActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    actionPack.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  mayBuildPostSixLeagueFullMapNextCycleRunnerManifestCount:
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
  job: "run-football-truth-post-six-league-full-map-next-cycle-action-pack-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_action_pack_quality_gate",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleActionPack: actionPackPath,
    postSixLeagueNextCycleRoutingArtifact: routingPath
  },
  policy: {
    nextCycleActionPackQualityGateOnly: true,
    nextCycleRunnerManifestRequiredBeforeAnyFurtherExecution: true,
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
  throw new Error(`Next-cycle action-pack quality gate blocked ${blockedRows.length} rows`);
}
