import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-next-cycle-action-pack-quality-gate-2026-06-15.json"
);

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-action-pack-2026-06-15",
  "post-six-league-full-map-next-cycle-action-pack-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-runner-manifest-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-next-cycle-runner-manifest-2026-06-15.json"
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

  if (s.nextCycleActionPackQualityGateRowCount !== 5) throw new Error(`Expected nextCycleActionPackQualityGateRowCount=5, got ${s.nextCycleActionPackQualityGateRowCount}`);
  if (s.nextCycleActionPackQualityGatePassedCount !== 5) throw new Error(`Expected nextCycleActionPackQualityGatePassedCount=5, got ${s.nextCycleActionPackQualityGatePassedCount}`);
  if (s.nextCycleActionPackQualityGateBlockedCount !== 0) throw new Error(`Expected nextCycleActionPackQualityGateBlockedCount=0, got ${s.nextCycleActionPackQualityGateBlockedCount}`);
  if (s.mainLaneNextCycleActionPackQualityGatedCount !== 4) throw new Error(`Expected mainLaneNextCycleActionPackQualityGatedCount=4, got ${s.mainLaneNextCycleActionPackQualityGatedCount}`);
  if (s.repairBacklogNextCycleActionPackQualityGatedCount !== 1) throw new Error(`Expected repairBacklogNextCycleActionPackQualityGatedCount=1, got ${s.repairBacklogNextCycleActionPackQualityGatedCount}`);
  if (s.sportomediaRepairNextCycleActionPackQualityGatedCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleActionPackQualityGatedCount=1, got ${s.sportomediaRepairNextCycleActionPackQualityGatedCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleRunnerManifestCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleRunnerManifestCount=1");

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

  if (s.nextCycleActionPackRowCount !== 5) throw new Error(`Expected nextCycleActionPackRowCount=5, got ${s.nextCycleActionPackRowCount}`);
  if (s.readyNextCycleActionPackRowCount !== 5) throw new Error(`Expected readyNextCycleActionPackRowCount=5, got ${s.readyNextCycleActionPackRowCount}`);
  if (s.blockedNextCycleActionPackRowCount !== 0) throw new Error(`Expected blockedNextCycleActionPackRowCount=0, got ${s.blockedNextCycleActionPackRowCount}`);
  if (s.mainLaneNextCycleActionPackRowCount !== 4) throw new Error(`Expected mainLaneNextCycleActionPackRowCount=4, got ${s.mainLaneNextCycleActionPackRowCount}`);
  if (s.repairBacklogNextCycleActionPackRowCount !== 1) throw new Error(`Expected repairBacklogNextCycleActionPackRowCount=1, got ${s.repairBacklogNextCycleActionPackRowCount}`);
  if (s.sportomediaRepairNextCycleActionPackRowCount !== 1) throw new Error(`Expected sportomediaRepairNextCycleActionPackRowCount=1, got ${s.sportomediaRepairNextCycleActionPackRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.mayBuildPostSixLeagueFullMapNextCycleActionPackQualityGateCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapNextCycleActionPackQualityGateCount=1");

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

function validateQualityGateRow(row) {
  const failures = [];

  if (!row.postSixLeagueNextCycleActionPackQualityGateRowId) failures.push("missing_next_cycle_action_pack_quality_gate_row_id");
  if (!row.postSixLeagueNextCycleActionPackRowId) failures.push("missing_next_cycle_action_pack_row_id");
  if (!row.postSixLeagueNextCycleRoutingRowId) failures.push("missing_next_cycle_routing_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleActionPackLane) failures.push("missing_next_cycle_action_pack_lane");

  if (row.qualityGateStatus !== "passed_ready_for_post_six_league_next_cycle_runner_manifest") {
    failures.push(`unexpected_quality_gate_status:${row.qualityGateStatus}`);
  }

  if (row.mayBuildNextCycleRunnerManifestForRow !== true) {
    failures.push("may_build_next_cycle_runner_manifest_not_true");
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
const actionPackRows = Array.isArray(actionPack.nextCycleActionPackRows) ? actionPack.nextCycleActionPackRows : [];

if (qualityGateRows.length !== 5) throw new Error(`Expected 5 next-cycle quality gate rows, got ${qualityGateRows.length}`);
if (actionPackRows.length !== 5) throw new Error(`Expected 5 next-cycle action pack rows, got ${actionPackRows.length}`);

const actionPackById = new Map(
  actionPackRows.map((row) => [row.postSixLeagueNextCycleActionPackRowId, row])
);

const runnerTargets = qualityGateRows.map((row, index) => {
  const failures = validateQualityGateRow(row);
  const actionPackRow = actionPackById.get(row.postSixLeagueNextCycleActionPackRowId);

  if (!actionPackRow) failures.push("missing_matching_next_cycle_action_pack_row");

  const isMainLane = row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle";

  return {
    postSixLeagueNextCycleRunnerTargetId: `post_six_league_next_cycle_runner_target_${String(index + 1).padStart(2, "0")}`,
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
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    nextCycleActionPackLane: row.nextCycleActionPackLane,
    nextCycleRunnerGroup: isMainLane
      ? "whole_map_main_lane_next_cycle_runner_group"
      : "repair_backlog_next_cycle_runner_group",
    runnerTargetStatus:
      failures.length === 0
        ? "ready_for_post_six_league_next_cycle_execution_approval_gate"
        : "blocked_from_post_six_league_next_cycle_execution_approval_gate",
    failures,
    requiresExecutionApprovalGate: true,
    requiresExplicitAllowExecuteFlag: true,

    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const readyTargets = runnerTargets.filter(
  (row) => row.runnerTargetStatus === "ready_for_post_six_league_next_cycle_execution_approval_gate"
);

const blockedTargets = runnerTargets.filter(
  (row) => row.runnerTargetStatus !== "ready_for_post_six_league_next_cycle_execution_approval_gate"
);

const summary = {
  postSixLeagueFullMapNextCycleRunnerManifestReadCount: 2,
  sourceNextCycleActionPackQualityGateRowCount: qualityGateRows.length,
  sourceNextCycleActionPackRowCount: actionPackRows.length,

  nextCycleRunnerTargetCount: runnerTargets.length,
  readyNextCycleRunnerTargetCount: readyTargets.length,
  blockedNextCycleRunnerTargetCount: blockedTargets.length,

  mainLaneNextCycleRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogNextCycleRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairNextCycleRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    qualityGate.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  mayBuildPostSixLeagueFullMapNextCycleExecutionApprovalGateCount:
    blockedTargets.length === 0 ? 1 : 0,

  runnerManifestIsExecutionPermissionNowCount: 0,
  runnerManifestIsFetchPermissionNowCount: 0,
  runnerManifestIsSearchPermissionNowCount: 0,
  runnerManifestIsBroadSearchPermissionNowCount: 0,
  runnerManifestIsClassifierPermissionNowCount: 0,
  runnerManifestIsCanonicalWritePermissionNowCount: 0,
  runnerManifestIsProductionWritePermissionNowCount: 0,
  runnerManifestIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-next-cycle-runner-manifest-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_next_cycle_runner_manifest",
  dryRun: true,
  inputs: {
    postSixLeagueNextCycleActionPackQualityGate: qualityGatePath,
    postSixLeagueNextCycleActionPack: actionPackPath
  },
  policy: {
    nextCycleRunnerManifestOnly: true,
    executionApprovalGateRequiredBeforeAnyFurtherExecution: true,
    explicitAllowExecuteFlagRequiredForFutureRunner: true,
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
  throw new Error(`Next-cycle runner manifest blocked ${blockedTargets.length} targets`);
}
