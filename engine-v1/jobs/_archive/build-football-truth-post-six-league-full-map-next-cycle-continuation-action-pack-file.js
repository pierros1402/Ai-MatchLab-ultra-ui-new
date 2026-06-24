import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const routingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-routing-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-routing-artifact-2026-06-15.json"
);

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-execution-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-execution-verification-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-action-pack-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-action-pack-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationRoutingArtifactReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationRoutingArtifactReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationRoutingArtifactReadCount}`);
  }
  if (s.sourceNextCycleExecutionVerificationRowCount !== 5) throw new Error(`Expected sourceNextCycleExecutionVerificationRowCount=5, got ${s.sourceNextCycleExecutionVerificationRowCount}`);
  if (s.sourceNextCycleExecutionRowCount !== 5) throw new Error(`Expected sourceNextCycleExecutionRowCount=5, got ${s.sourceNextCycleExecutionRowCount}`);
  if (s.sourceNextCycleExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceNextCycleExecutionApprovalRowCount=5, got ${s.sourceNextCycleExecutionApprovalRowCount}`);
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

function validateVerification(input) {
  const s = input.summary || {};

  if (s.verifiedNextCycleExecutionRowCount !== 5) throw new Error(`Expected verifiedNextCycleExecutionRowCount=5, got ${s.verifiedNextCycleExecutionRowCount}`);
  if (s.blockedNextCycleExecutionVerificationCount !== 0) throw new Error(`Expected blockedNextCycleExecutionVerificationCount=0, got ${s.blockedNextCycleExecutionVerificationCount}`);
  if (s.verifiedMainLaneNextCycleExecutionCount !== 4) throw new Error(`Expected verifiedMainLaneNextCycleExecutionCount=4, got ${s.verifiedMainLaneNextCycleExecutionCount}`);
  if (s.verifiedRepairBacklogNextCycleExecutionCount !== 1) throw new Error(`Expected verifiedRepairBacklogNextCycleExecutionCount=1, got ${s.verifiedRepairBacklogNextCycleExecutionCount}`);
  if (s.verifiedSportomediaRepairNextCycleExecutionCount !== 1) throw new Error(`Expected verifiedSportomediaRepairNextCycleExecutionCount=1, got ${s.verifiedSportomediaRepairNextCycleExecutionCount}`);
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationRoutingArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationRoutingArtifactCount=1");
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
  ].forEach((key) => assertZero(s[key], `verification.summary.${key}`));

  assertFalse(input.productionWrite, "verification.productionWrite");
  assertFalse(input.sourceFetch?.executed, "verification.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "verification.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "verification.broadSearchUsed");
  assertFalse(input.classifierExecuted, "verification.classifierExecuted");
}

function validateRoutingRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleContinuationRoutingRowId) failures.push("missing_next_cycle_continuation_routing_row_id");
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
  if (!row.nextCycleContinuationRouteIntent) failures.push("missing_next_cycle_continuation_route_intent");

  if (row.nextCycleContinuationRoutingStatus !== "ready_for_post_six_league_next_cycle_continuation_action_pack") {
    failures.push(`unexpected_continuation_routing_status:${row.nextCycleContinuationRoutingStatus}`);
  }

  if (row.mayBuildNextCycleContinuationActionPackForRoute !== true) {
    failures.push("may_build_next_cycle_continuation_action_pack_not_true");
  }

  [
    "continuationRoutingIsExecutionPermissionNow",
    "continuationRoutingIsFetchPermissionNow",
    "continuationRoutingIsSearchPermissionNow",
    "continuationRoutingIsBroadSearchPermissionNow",
    "continuationRoutingIsClassifierPermissionNow",
    "continuationRoutingIsCanonicalWritePermissionNow",
    "continuationRoutingIsProductionWritePermissionNow",
    "continuationRoutingIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`continuation_routing_guardrail_not_false:${key}`);
  });

  return failures;
}

const routing = readJson(routingPath);
const verification = readJson(verificationPath);

validateRouting(routing);
validateVerification(verification);

const routingRows = Array.isArray(routing.continuationRoutingRows) ? routing.continuationRoutingRows : [];
const verificationRows = Array.isArray(verification.verificationRows) ? verification.verificationRows : [];

if (routingRows.length !== 5) throw new Error(`Expected 5 continuation routing rows, got ${routingRows.length}`);
if (verificationRows.length !== 5) throw new Error(`Expected 5 verification rows, got ${verificationRows.length}`);

const continuationActionPackRows = routingRows.map((row, index) => {
  const failures = validateRoutingRow(row);

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";
  const isRepairBacklog = row.nextCycleRouteFamily === "repair_backlog_next_cycle";

  if (!isMainLane && !isRepairBacklog) {
    failures.push(`unexpected_next_cycle_route_family:${row.nextCycleRouteFamily}`);
  }

  return {
    postSixLeagueNextCycleContinuationActionPackRowId: `post_six_league_next_cycle_continuation_action_pack_${String(index + 1).padStart(2, "0")}`,
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

    nextCycleContinuationActionPackLane: isMainLane
      ? "whole_map_main_lane_next_cycle_continuation_action_pack"
      : "repair_backlog_next_cycle_continuation_action_pack",
    nextCycleContinuationActionPackIntent: isMainLane
      ? "build_continuation_action_pack_for_whole_map_main_lane_after_verified_next_cycle_execution"
      : "build_continuation_action_pack_for_repair_backlog_after_verified_next_cycle_execution",
    nextCycleContinuationActionPackStatus:
      failures.length === 0
        ? "ready_for_post_six_league_next_cycle_continuation_action_pack_quality_gate"
        : "blocked_from_post_six_league_next_cycle_continuation_action_pack_quality_gate",
    failures,
    mayBuildNextCycleContinuationActionPackQualityGateForRow: failures.length === 0,

    continuationActionPackIsExecutionPermissionNow: false,
    continuationActionPackIsFetchPermissionNow: false,
    continuationActionPackIsSearchPermissionNow: false,
    continuationActionPackIsBroadSearchPermissionNow: false,
    continuationActionPackIsClassifierPermissionNow: false,
    continuationActionPackIsCanonicalWritePermissionNow: false,
    continuationActionPackIsProductionWritePermissionNow: false,
    continuationActionPackIsTruthAssertionPermissionNow: false
  };
});

const readyRows = continuationActionPackRows.filter(
  (row) => row.nextCycleContinuationActionPackStatus === "ready_for_post_six_league_next_cycle_continuation_action_pack_quality_gate"
);

const blockedRows = continuationActionPackRows.filter(
  (row) => row.nextCycleContinuationActionPackStatus !== "ready_for_post_six_league_next_cycle_continuation_action_pack_quality_gate"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationActionPackReadCount: 2,
  sourceNextCycleContinuationRoutingRowCount: routingRows.length,
  sourceNextCycleExecutionVerificationRowCount: verificationRows.length,

  nextCycleContinuationActionPackRowCount: continuationActionPackRows.length,
  readyNextCycleContinuationActionPackRowCount: readyRows.length,
  blockedNextCycleContinuationActionPackRowCount: blockedRows.length,

  mainLaneNextCycleContinuationActionPackRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleContinuationActionPackRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleContinuationActionPackRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    routing.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    routing.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationActionPackQualityGateCount:
    blockedRows.length === 0 ? 1 : 0,

  continuationActionPackIsExecutionPermissionNowCount: 0,
  continuationActionPackIsFetchPermissionNowCount: 0,
  continuationActionPackIsSearchPermissionNowCount: 0,
  continuationActionPackIsBroadSearchPermissionNowCount: 0,
  continuationActionPackIsClassifierPermissionNowCount: 0,
  continuationActionPackIsCanonicalWritePermissionNowCount: 0,
  continuationActionPackIsProductionWritePermissionNowCount: 0,
  continuationActionPackIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-continuation-action-pack-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_action_pack",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationRoutingArtifact: routingPath,
    postSixLeagueNextCycleExecutionVerification: verificationPath
  },
  policy: {
    continuationActionPackOnly: true,
    continuationActionPackQualityGateRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  continuationActionPackRows,
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
  throw new Error(`Next-cycle continuation action pack blocked ${blockedRows.length} rows`);
}
