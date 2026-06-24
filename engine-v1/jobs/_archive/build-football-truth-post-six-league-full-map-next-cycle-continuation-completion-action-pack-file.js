import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const routingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-routing-artifact-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-routing-artifact-2026-06-15.json"
);

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-execution-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-execution-verification-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-continuation-completion-action-pack-2026-06-15.json"
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

  if (s.postSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactReadCount=3, got ${s.postSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactReadCount}`);
  }
  if (s.sourceContinuationExecutionVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationExecutionVerificationRowCount=5, got ${s.sourceContinuationExecutionVerificationRowCount}`);
  if (s.sourceContinuationExecutionRowCount !== 5) throw new Error(`Expected sourceContinuationExecutionRowCount=5, got ${s.sourceContinuationExecutionRowCount}`);
  if (s.sourceContinuationExecutionApprovalRowCount !== 5) throw new Error(`Expected sourceContinuationExecutionApprovalRowCount=5, got ${s.sourceContinuationExecutionApprovalRowCount}`);
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

function validateVerification(input) {
  const s = input.summary || {};

  if (s.verifiedContinuationExecutionRowCount !== 5) throw new Error(`Expected verifiedContinuationExecutionRowCount=5, got ${s.verifiedContinuationExecutionRowCount}`);
  if (s.blockedContinuationExecutionVerificationCount !== 0) throw new Error(`Expected blockedContinuationExecutionVerificationCount=0, got ${s.blockedContinuationExecutionVerificationCount}`);
  if (s.verifiedMainLaneContinuationExecutionCount !== 4) throw new Error(`Expected verifiedMainLaneContinuationExecutionCount=4, got ${s.verifiedMainLaneContinuationExecutionCount}`);
  if (s.verifiedRepairBacklogContinuationExecutionCount !== 1) throw new Error(`Expected verifiedRepairBacklogContinuationExecutionCount=1, got ${s.verifiedRepairBacklogContinuationExecutionCount}`);
  if (s.verifiedSportomediaRepairContinuationExecutionCount !== 1) throw new Error(`Expected verifiedSportomediaRepairContinuationExecutionCount=1, got ${s.verifiedSportomediaRepairContinuationExecutionCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionRoutingArtifactCount=1");
  }

  [
    "verificationIsExecutionPermissionNowCount",
    "verificationIsFetchPermissionNowCount",
    "verificationIsSearchPermissionNowCount",
    "verificationIsBroadSearchPermissionNowCount",
    "verificationIsClassifierPermissionNowCount",
    "verificationIsCanonicalWritePermissionNowCount",
    "verificationIsProductionWritePermissionNowCount",
    "verificationIsTruthAssertionPermissionNowCount",
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

  if (!row.postSixLeagueNextCycleContinuationCompletionRoutingRowId) failures.push("missing_continuation_completion_routing_row_id");
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
  if (!row.nextCycleContinuationCompletionRouteIntent) failures.push("missing_next_cycle_continuation_completion_route_intent");

  if (row.nextCycleContinuationCompletionRoutingStatus !== "ready_for_post_six_league_next_cycle_continuation_completion_action_pack") {
    failures.push(`unexpected_completion_routing_status:${row.nextCycleContinuationCompletionRoutingStatus}`);
  }

  if (row.mayBuildNextCycleContinuationCompletionActionPackForRoute !== true) {
    failures.push("may_build_completion_action_pack_not_true");
  }

  [
    "continuationCompletionRoutingIsExecutionPermissionNow",
    "continuationCompletionRoutingIsFetchPermissionNow",
    "continuationCompletionRoutingIsSearchPermissionNow",
    "continuationCompletionRoutingIsBroadSearchPermissionNow",
    "continuationCompletionRoutingIsClassifierPermissionNow",
    "continuationCompletionRoutingIsCanonicalWritePermissionNow",
    "continuationCompletionRoutingIsProductionWritePermissionNow",
    "continuationCompletionRoutingIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`completion_routing_guardrail_not_false:${key}`);
  });

  return failures;
}

const routing = readJson(routingPath);
const verification = readJson(verificationPath);

validateRouting(routing);
validateVerification(verification);

const routingRows = Array.isArray(routing.completionRoutingRows) ? routing.completionRoutingRows : [];
const verificationRows = Array.isArray(verification.verificationRows) ? verification.verificationRows : [];

if (routingRows.length !== 5) throw new Error(`Expected 5 continuation-completion routing rows, got ${routingRows.length}`);
if (verificationRows.length !== 5) throw new Error(`Expected 5 continuation execution verification rows, got ${verificationRows.length}`);

const completionActionPackRows = routingRows.map((row, index) => {
  const failures = validateRoutingRow(row);

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";
  const isRepairBacklog = row.nextCycleRouteFamily === "repair_backlog_next_cycle";

  if (!isMainLane && !isRepairBacklog) {
    failures.push(`unexpected_next_cycle_route_family:${row.nextCycleRouteFamily}`);
  }

  return {
    postSixLeagueNextCycleContinuationCompletionActionPackRowId: `post_six_league_next_cycle_continuation_completion_action_pack_${String(index + 1).padStart(2, "0")}`,
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

    nextCycleContinuationCompletionActionPackLane: isMainLane
      ? "whole_map_main_lane_next_cycle_continuation_completion_action_pack"
      : "repair_backlog_next_cycle_continuation_completion_action_pack",
    nextCycleContinuationCompletionActionPackIntent: isMainLane
      ? "build_completion_action_pack_for_whole_map_main_lane_after_verified_continuation_execution"
      : "build_completion_action_pack_for_repair_backlog_after_verified_continuation_execution",
    nextCycleContinuationCompletionActionPackStatus:
      failures.length === 0
        ? "ready_for_post_six_league_next_cycle_continuation_completion_action_pack_quality_gate"
        : "blocked_from_post_six_league_next_cycle_continuation_completion_action_pack_quality_gate",
    failures,
    mayBuildNextCycleContinuationCompletionActionPackQualityGateForRow: failures.length === 0,

    continuationCompletionActionPackIsExecutionPermissionNow: false,
    continuationCompletionActionPackIsFetchPermissionNow: false,
    continuationCompletionActionPackIsSearchPermissionNow: false,
    continuationCompletionActionPackIsBroadSearchPermissionNow: false,
    continuationCompletionActionPackIsClassifierPermissionNow: false,
    continuationCompletionActionPackIsCanonicalWritePermissionNow: false,
    continuationCompletionActionPackIsProductionWritePermissionNow: false,
    continuationCompletionActionPackIsTruthAssertionPermissionNow: false
  };
});

const readyRows = completionActionPackRows.filter(
  (row) => row.nextCycleContinuationCompletionActionPackStatus === "ready_for_post_six_league_next_cycle_continuation_completion_action_pack_quality_gate"
);

const blockedRows = completionActionPackRows.filter(
  (row) => row.nextCycleContinuationCompletionActionPackStatus !== "ready_for_post_six_league_next_cycle_continuation_completion_action_pack_quality_gate"
);

const summary = {
  postSixLeagueFullMapNextCycleContinuationCompletionActionPackReadCount: 2,
  sourceNextCycleContinuationCompletionRoutingRowCount: routingRows.length,
  sourceContinuationExecutionVerificationRowCount: verificationRows.length,

  nextCycleContinuationCompletionActionPackRowCount: completionActionPackRows.length,
  readyNextCycleContinuationCompletionActionPackRowCount: readyRows.length,
  blockedNextCycleContinuationCompletionActionPackRowCount: blockedRows.length,

  mainLaneNextCycleContinuationCompletionActionPackRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleContinuationCompletionActionPackRowCount: countWhere(
    readyRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleContinuationCompletionActionPackRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    routing.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    routing.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    routing.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapNextCycleContinuationCompletionActionPackQualityGateCount:
    blockedRows.length === 0 ? 1 : 0,

  continuationCompletionActionPackIsExecutionPermissionNowCount: 0,
  continuationCompletionActionPackIsFetchPermissionNowCount: 0,
  continuationCompletionActionPackIsSearchPermissionNowCount: 0,
  continuationCompletionActionPackIsBroadSearchPermissionNowCount: 0,
  continuationCompletionActionPackIsClassifierPermissionNowCount: 0,
  continuationCompletionActionPackIsCanonicalWritePermissionNowCount: 0,
  continuationCompletionActionPackIsProductionWritePermissionNowCount: 0,
  continuationCompletionActionPackIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-continuation-completion-action-pack-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_continuation_completion_action_pack",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleContinuationCompletionRoutingArtifact: routingPath,
    postSixLeagueNextCycleContinuationExecutionVerification: verificationPath
  },
  policy: {
    continuationCompletionActionPackOnly: true,
    continuationCompletionActionPackQualityGateRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  completionActionPackRows,
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
  throw new Error(`Next-cycle continuation-completion action pack blocked ${blockedRows.length} rows`);
}
