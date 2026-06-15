import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const closeoutPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-closeout-artifact-2026-06-15",
  "post-six-league-full-map-continuation-completion-closeout-artifact-2026-06-15.json"
);

const completionVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-execution-verification-2026-06-15",
  "post-six-league-full-map-continuation-completion-execution-verification-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-routing-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-routing-artifact-2026-06-15.json"
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

function validateCloseout(input) {
  const s = input.summary || {};

  if (s.continuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected continuationCompletionCloseoutRowCount=5, got ${s.continuationCompletionCloseoutRowCount}`);
  if (s.closedContinuationCompletionCloseoutRowCount !== 5) throw new Error(`Expected closedContinuationCompletionCloseoutRowCount=5, got ${s.closedContinuationCompletionCloseoutRowCount}`);
  if (s.blockedContinuationCompletionCloseoutRowCount !== 0) throw new Error(`Expected blockedContinuationCompletionCloseoutRowCount=0, got ${s.blockedContinuationCompletionCloseoutRowCount}`);
  if (s.closedMainLaneCompletionCount !== 4) throw new Error(`Expected closedMainLaneCompletionCount=4, got ${s.closedMainLaneCompletionCount}`);
  if (s.closedRepairBacklogCompletionCount !== 1) throw new Error(`Expected closedRepairBacklogCompletionCount=1, got ${s.closedRepairBacklogCompletionCount}`);
  if (s.closedSportomediaRepairCompletionCount !== 1) throw new Error(`Expected closedSportomediaRepairCompletionCount=1, got ${s.closedSportomediaRepairCompletionCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleRoutingArtifactCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleRoutingArtifactCount=1");

  [
    "closeoutIsExecutionPermissionNowCount",
    "closeoutIsFetchPermissionNowCount",
    "closeoutIsSearchPermissionNowCount",
    "closeoutIsBroadSearchPermissionNowCount",
    "closeoutIsClassifierPermissionNowCount",
    "closeoutIsCanonicalWritePermissionNowCount",
    "closeoutIsProductionWritePermissionNowCount",
    "closeoutIsTruthAssertionPermissionNowCount",
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
  assertFalse(input.sourceFetch?.executed, "closeout.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "closeout.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "closeout.broadSearchUsed");
  assertFalse(input.classifierExecuted, "closeout.classifierExecuted");
}

function validateCompletionVerification(input) {
  const s = input.summary || {};

  if (s.verifiedCompletionExecutionRowCount !== 5) throw new Error(`Expected verifiedCompletionExecutionRowCount=5, got ${s.verifiedCompletionExecutionRowCount}`);
  if (s.blockedCompletionExecutionVerificationCount !== 0) throw new Error(`Expected blockedCompletionExecutionVerificationCount=0, got ${s.blockedCompletionExecutionVerificationCount}`);
  if (s.diagnosticsOnlyCompletionExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyCompletionExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionCloseoutArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionCloseoutArtifactCount=1");
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
  ].forEach((key) => assertZero(s[key], `completionVerification.summary.${key}`));

  assertFalse(input.productionWrite, "completionVerification.productionWrite");
}

function validateCloseoutRow(row) {
  const failures = [];

  if (!row.continuationCompletionCloseoutRowId) failures.push("missing_completion_closeout_row_id");
  if (!row.continuationCompletionExecutionVerificationRowId) failures.push("missing_completion_execution_verification_row_id");
  if (!row.continuationCompletionExecutionRowId) failures.push("missing_completion_execution_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.completionRouteFamily) failures.push("missing_completion_route_family");
  if (!row.closeoutStatus) failures.push("missing_closeout_status");

  if (row.closeoutStatus !== "closed_verified_diagnostics_only_post_six_league_completion_lane") {
    failures.push(`unexpected_closeout_status:${row.closeoutStatus}`);
  }

  if (row.laneClosedForCurrentPostSixLeagueContinuationCycle !== true) {
    failures.push("lane_not_closed_for_current_cycle");
  }

  [
    "closeoutIsExecutionPermissionNow",
    "closeoutIsFetchPermissionNow",
    "closeoutIsSearchPermissionNow",
    "closeoutIsBroadSearchPermissionNow",
    "closeoutIsClassifierPermissionNow",
    "closeoutIsCanonicalWritePermissionNow",
    "closeoutIsProductionWritePermissionNow",
    "closeoutIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`closeout_guardrail_not_false:${key}`);
  });

  return failures;
}

const closeout = readJson(closeoutPath);
const completionVerification = readJson(completionVerificationPath);

validateCloseout(closeout);
validateCompletionVerification(completionVerification);

const closeoutRows = Array.isArray(closeout.closeoutRows) ? closeout.closeoutRows : [];
const completionVerificationRows = Array.isArray(completionVerification.verificationRows)
  ? completionVerification.verificationRows
  : [];

if (closeoutRows.length !== 5) throw new Error(`Expected 5 closeout rows, got ${closeoutRows.length}`);
if (completionVerificationRows.length !== 5) throw new Error(`Expected 5 completion verification rows, got ${completionVerificationRows.length}`);

const nextCycleRoutingRows = closeoutRows.map((row, index) => {
  const failures = validateCloseoutRow(row);

  const isMainLane = row.completionRouteFamily === "whole_map_main_lane_completion";
  const isRepairBacklog = row.completionRouteFamily === "repair_backlog_completion";

  return {
    postSixLeagueNextCycleRoutingRowId: `post_six_league_next_cycle_route_${String(index + 1).padStart(2, "0")}`,
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
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    continuationRunnerGroup: row.continuationRunnerGroup,
    completionActionPackLane: row.completionActionPackLane,
    completionRunnerGroup: row.completionRunnerGroup,

    nextCycleRouteFamily: isMainLane
      ? "whole_map_main_lane_next_cycle"
      : "repair_backlog_next_cycle",
    nextCycleRouteIntent: isMainLane
      ? "route_closed_main_lane_completion_to_next_full_map_action_pack"
      : "route_closed_repair_backlog_completion_to_next_repair_action_pack",
    nextCycleRoutingStatus:
      failures.length === 0
        ? "ready_for_post_six_league_full_map_next_cycle_action_pack"
        : "blocked_from_post_six_league_full_map_next_cycle_action_pack",
    failures,
    mayBuildNextCycleActionPackForRoute: failures.length === 0,

    nextCycleRoutingIsExecutionPermissionNow: false,
    nextCycleRoutingIsFetchPermissionNow: false,
    nextCycleRoutingIsSearchPermissionNow: false,
    nextCycleRoutingIsBroadSearchPermissionNow: false,
    nextCycleRoutingIsClassifierPermissionNow: false,
    nextCycleRoutingIsCanonicalWritePermissionNow: false,
    nextCycleRoutingIsProductionWritePermissionNow: false,
    nextCycleRoutingIsTruthAssertionPermissionNow: false
  };
});

const readyRows = nextCycleRoutingRows.filter(
  (row) => row.nextCycleRoutingStatus === "ready_for_post_six_league_full_map_next_cycle_action_pack"
);

const blockedRows = nextCycleRoutingRows.filter(
  (row) => row.nextCycleRoutingStatus !== "ready_for_post_six_league_full_map_next_cycle_action_pack"
);

const summary = {
  postSixLeagueFullMapNextCycleRoutingArtifactReadCount: 2,
  sourceContinuationCompletionCloseoutRowCount: closeoutRows.length,
  sourceCompletionExecutionVerificationRowCount: completionVerificationRows.length,

  nextCycleRoutingRowCount: nextCycleRoutingRows.length,
  readyNextCycleRoutingRowCount: readyRows.length,
  blockedNextCycleRoutingRowCount: blockedRows.length,

  mainLaneNextCycleRoutingRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleRoutingRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleRoutingRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    closeout.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  mayBuildPostSixLeagueFullMapNextCycleActionPackCount:
    blockedRows.length === 0 ? 1 : 0,

  nextCycleRoutingIsExecutionPermissionNowCount: 0,
  nextCycleRoutingIsFetchPermissionNowCount: 0,
  nextCycleRoutingIsSearchPermissionNowCount: 0,
  nextCycleRoutingIsBroadSearchPermissionNowCount: 0,
  nextCycleRoutingIsClassifierPermissionNowCount: 0,
  nextCycleRoutingIsCanonicalWritePermissionNowCount: 0,
  nextCycleRoutingIsProductionWritePermissionNowCount: 0,
  nextCycleRoutingIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-routing-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_routing_artifact",
  dryRun: true,
  inputs: {
    postSixLeagueCompletionCloseoutArtifact: closeoutPath,
    postSixLeagueCompletionExecutionVerification: completionVerificationPath
  },
  policy: {
    nextCycleRoutingOnly: true,
    nextCycleActionPackRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  nextCycleRoutingRows,
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
  throw new Error(`Next cycle routing blocked ${blockedRows.length} rows`);
}
