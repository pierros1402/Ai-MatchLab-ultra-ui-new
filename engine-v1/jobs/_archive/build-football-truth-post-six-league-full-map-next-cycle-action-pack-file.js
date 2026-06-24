import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const routingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-routing-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-routing-artifact-2026-06-15.json"
);

const closeoutPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-closeout-artifact-2026-06-15",
  "post-six-league-full-map-continuation-completion-closeout-artifact-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-action-pack-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-action-pack-2026-06-15.json"
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

function validateRouting(input) {
  const s = input.summary || {};

  if (s.nextCycleRoutingRowCount !== 5) throw new Error(`Expected nextCycleRoutingRowCount=5, got ${s.nextCycleRoutingRowCount}`);
  if (s.readyNextCycleRoutingRowCount !== 5) throw new Error(`Expected readyNextCycleRoutingRowCount=5, got ${s.readyNextCycleRoutingRowCount}`);
  if (s.blockedNextCycleRoutingRowCount !== 0) throw new Error(`Expected blockedNextCycleRoutingRowCount=0, got ${s.blockedNextCycleRoutingRowCount}`);
  if (s.mainLaneNextCycleRoutingRowCount !== 4) throw new Error(`Expected mainLaneNextCycleRoutingRowCount=4, got ${s.mainLaneNextCycleRoutingRowCount}`);
  if (s.repairBacklogNextCycleRoutingRowCount !== 1) throw new Error(`Expected repairBacklogNextCycleRoutingRowCount=1, got ${s.repairBacklogNextCycleRoutingRowCount}`);
  if (s.sportomediaRepairNextCycleRoutingRowCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleRoutingRowCount=1, got ${s.sportomediaRepairNextCycleRoutingRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleActionPackCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleActionPackCount=1");

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

function validateCloseout(input) {
  const s = input.summary || {};

  if (s.continuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected continuationCompletionCloseoutRowCount=5, got ${s.continuationCompletionCloseoutRowCount}`);
  if (s.closedContinuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected closedContinuationCompletionCloseoutRowCount=5, got ${s.closedContinuationCompletionCloseoutRowCount}`);
  if (s.blockedContinuationCompletionCloseoutRowCount !== 0) throw new Error(`Expected blockedContinuationCompletionCloseoutRowCount=0, got ${s.blockedContinuationCompletionCloseoutRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleRoutingArtifactCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleRoutingArtifactCount=1");

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `closeout.summary.${key}`));

  assertFalse(input.productionWrite, "closeout.productionWrite");
}

function validateRoutingRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleRoutingRowId) failures.push("missing_next_cycle_routing_row_id");
  if (!row.continuationCompletionCloseoutRowId) failures.push("missing_completion_closeout_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleRouteIntent) failures.push("missing_next_cycle_route_intent");

  if (row.nextCycleRoutingStatus !== "ready_for_post_six_league_full_map_next_cycle_action_pack") {
    failures.push(`unexpected_next_cycle_routing_status:${row.nextCycleRoutingStatus}`);
  }

  if (row.mayBuildNextCycleActionPackForRoute !== true) {
    failures.push("may_build_next_cycle_action_pack_not_true");
  }

  [
    "nextCycleRoutingIsExecutionPermissionNow",
    "nextCycleRoutingIsFetchPermissionNow",
    "nextCycleRoutingIsSearchPermissionNow",
    "nextCycleRoutingIsBroadSearchPermissionNow",
    "nextCycleRoutingIsClassifierPermissionNow",
    "nextCycleRoutingIsCanonicalWritePermissionNow",
    "nextCycleRoutingIsProductionWritePermissionNow",
    "nextCycleRoutingIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`next_cycle_routing_guardrail_not_false:${key}`);
  });

  return failures;
}

const routing = readJson(routingPath);
const closeout = readJson(closeoutPath);

validateRouting(routing);
validateCloseout(closeout);

const routingRows = Array.isArray(routing.nextCycleRoutingRows) ? routing.nextCycleRoutingRows : [];
const closeoutRows = Array.isArray(closeout.closeoutRows) ? closeout.closeoutRows : [];

if (routingRows.length !== 5) throw new Error(`Expected 5 next-cycle routing rows, got ${routingRows.length}`);
if (closeoutRows.length !== 5) throw new Error(`Expected 5 closeout rows, got ${closeoutRows.length}`);

const nextCycleActionPackRows = routingRows.map((row, index) => {
  const failures = validateRoutingRow(row);

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";
  const isRepairBacklog = row.nextCycleRouteFamily === "repair_backlog_next_cycle";

  return {
    postSixLeagueNextCycleActionPackRowId: `post_six_league_next_cycle_action_pack_${String(index + 1).padStart(2, "0")}`,
    postSixLeagueNextCycleRoutingRowId: row.postSixLeagueNextCycleRoutingRowId,
    continuationCompletionCloseoutRowId: row.continuationCompletionCloseoutRowId,
    continuationCompletionExecutionVerificationRowId: row.continuationCompletionExecutionVerificationRowId,
    continuationCompletionExecutionRowId: row.continuationCompletionExecutionRowId,
    continuationCompletionExecutionApprovalRowId: row.continuationCompletionExecutionApprovalRowId,
    continuationCompletionRunnerTargetId: row.continuationCompletionRunnerTargetId,
    continuationCompletionActionPackQualityGateRowId: row.continuationCompletionActionPackQualityGateRowId,
    continuationCompletionActionPackRowId: row.continuationCompletionActionPackRowId,
    continuationCompletionRoutingRowId: row.continuationCompletionRoutingRowId,
    continuationExecutionVerificationRowId: row.continuationExecutionVerificationRowId,
    continuationExecutionRowId: row.continuationExecutionRowId,
    sourceContinuationRoutingRowId: row.sourceContinuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    completionRouteFamily: row.completionRouteFamily,
    nextCycleRouteFamily: row.nextCycleRouteFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,

    nextCycleActionPackLane: isMainLane
      ? "whole_map_main_lane_next_cycle_action_pack"
      : "repair_backlog_next_cycle_action_pack",
    nextCycleActionPackIntent: isMainLane
      ? "build_next_full_map_main_lane_action_pack_after_post_six_league_cycle_closeout"
      : "build_next_repair_backlog_action_pack_after_post_six_league_cycle_closeout",
    nextCycleActionPackStatus:
      failures.length === 0
        ? "ready_for_post_six_league_next_cycle_action_pack_quality_gate"
        : "blocked_from_post_six_league_next_cycle_action_pack_quality_gate",
    failures,
    mayBuildNextCycleActionPackQualityGateForRow: failures.length === 0,

    nextCycleActionPackIsExecutionPermissionNow: false,
    nextCycleActionPackIsFetchPermissionNow: false,
    nextCycleActionPackIsSearchPermissionNow: false,
    nextCycleActionPackIsBroadSearchPermissionNow: false,
    nextCycleActionPackIsClassifierPermissionNow: false,
    nextCycleActionPackIsCanonicalWritePermissionNow: false,
    nextCycleActionPackIsProductionWritePermissionNow: false,
    nextCycleActionPackIsTruthAssertionPermissionNow: false
  };
});

const readyRows = nextCycleActionPackRows.filter(
  (row) => row.nextCycleActionPackStatus === "ready_for_post_six_league_next_cycle_action_pack_quality_gate"
);

const blockedRows = nextCycleActionPackRows.filter(
  (row) => row.nextCycleActionPackStatus !== "ready_for_post_six_league_next_cycle_action_pack_quality_gate"
);

const summary = {
  postSixLeagueFullMapNextCycleActionPackReadCount: 2,
  sourceNextCycleRoutingRowCount: routingRows.length,
  sourceContinuationCompletionCloseoutRowCount: closeoutRows.length,

  nextCycleActionPackRowCount: nextCycleActionPackRows.length,
  readyNextCycleActionPackRowCount: readyRows.length,
  blockedNextCycleActionPackRowCount: blockedRows.length,

  mainLaneNextCycleActionPackRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleActionPackRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleActionPackRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    routing.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  mayBuildPostSixLeagueFullMapNextCycleActionPackQualityGateCount:
    blockedRows.length === 0 ? 1 : 0,

  nextCycleActionPackIsExecutionPermissionNowCount: 0,
  nextCycleActionPackIsFetchPermissionNowCount: 0,
  nextCycleActionPackIsSearchPermissionNowCount: 0,
  nextCycleActionPackIsBroadSearchPermissionNowCount: 0,
  nextCycleActionPackIsClassifierPermissionNowCount: 0,
  nextCycleActionPackIsCanonicalWritePermissionNowCount: 0,
  nextCycleActionPackIsProductionWritePermissionNowCount: 0,
  nextCycleActionPackIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-action-pack-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_action_pack",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleRoutingArtifact: routingPath,
    postSixLeagueCompletionCloseoutArtifact: closeoutPath
  },
  policy: {
    nextCycleActionPackOnly: true,
    nextCycleActionPackQualityGateRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  nextCycleActionPackRows,
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
  throw new Error(`Next cycle action pack blocked ${blockedRows.length} rows`);
}
