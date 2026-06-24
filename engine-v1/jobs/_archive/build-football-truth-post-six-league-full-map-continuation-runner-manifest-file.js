import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-continuation-action-pack-quality-gate-2026-06-15.json"
);

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-action-pack-2026-06-15",
  "post-six-league-full-map-continuation-action-pack-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-runner-manifest-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-runner-manifest-2026-06-15.json"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
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

  if (s.continuationActionPackQualityGateRowCount !== 5) {
    throw new Error(`Expected continuationActionPackQualityGateRowCount=5, got ${s.continuationActionPackQualityGateRowCount}`);
  }

  if (s.continuationActionPackQualityGatePassedCount !== 5) {
    throw new Error(`Expected continuationActionPackQualityGatePassedCount=5, got ${s.continuationActionPackQualityGatePassedCount}`);
  }

  if (s.continuationActionPackQualityGateBlockedCount !== 0) {
    throw new Error(`Expected continuationActionPackQualityGateBlockedCount=0, got ${s.continuationActionPackQualityGateBlockedCount}`);
  }

  if (s.mainLaneContinuationActionPackQualityGatedCount !== 4) {
    throw new Error(`Expected mainLaneContinuationActionPackQualityGatedCount=4, got ${s.mainLaneContinuationActionPackQualityGatedCount}`);
  }

  if (s.repairBacklogContinuationActionPackQualityGatedCount !== 1) {
    throw new Error(`Expected repairBacklogContinuationActionPackQualityGatedCount=1, got ${s.repairBacklogContinuationActionPackQualityGatedCount}`);
  }

  if (s.sportomediaRepairContinuationActionPackQualityGatedCount !== 1) {
    throw new Error(`Expected sportomediaRepairContinuationActionPackQualityGatedCount=1, got ${s.sportomediaRepairContinuationActionPackQualityGatedCount}`);
  }

  if (s.sixLeagueBlockerClosedCount !== 1) {
    throw new Error(`Expected sixLeagueBlockerClosedCount=1, got ${s.sixLeagueBlockerClosedCount}`);
  }

  if (s.sixLeagueVerifiedCompetitionCount !== 6) {
    throw new Error(`Expected sixLeagueVerifiedCompetitionCount=6, got ${s.sixLeagueVerifiedCompetitionCount}`);
  }

  if (s.sixLeagueVerifiedPromotedAreaCount !== 18) {
    throw new Error(`Expected sixLeagueVerifiedPromotedAreaCount=18, got ${s.sixLeagueVerifiedPromotedAreaCount}`);
  }

  if (s.materializationExecutionVerifiedCount !== 5) {
    throw new Error(`Expected materializationExecutionVerifiedCount=5, got ${s.materializationExecutionVerifiedCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationRunnerManifestCount=1");
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

  if (s.continuationActionPackRowCount !== 5) {
    throw new Error(`Expected continuationActionPackRowCount=5, got ${s.continuationActionPackRowCount}`);
  }

  if (s.readyContinuationActionPackRowCount !== 5) {
    throw new Error(`Expected readyContinuationActionPackRowCount=5, got ${s.readyContinuationActionPackRowCount}`);
  }

  if (s.blockedContinuationActionPackRowCount !== 0) {
    throw new Error(`Expected blockedContinuationActionPackRowCount=0, got ${s.blockedContinuationActionPackRowCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationActionPackQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationActionPackQualityGateCount=1");
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
  ].forEach((key) => assertZero(s[key], `actionPack.summary.${key}`));

  assertFalse(input.productionWrite, "actionPack.productionWrite");
  assertFalse(input.sourceFetch?.executed, "actionPack.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "actionPack.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "actionPack.broadSearchUsed");
  assertFalse(input.classifierExecuted, "actionPack.classifierExecuted");
}

function validateQualityGateRow(row) {
  const failures = [];

  if (!row.continuationActionPackQualityGateRowId) failures.push("missing_quality_gate_row_id");
  if (!row.continuationActionPackRowId) failures.push("missing_action_pack_row_id");
  if (!row.sourceContinuationRoutingRowId) failures.push("missing_source_continuation_routing_row_id");
  if (!row.sourceVerificationRowId) failures.push("missing_source_verification_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.actionPackLane) failures.push("missing_action_pack_lane");
  if (!row.routeFamily) failures.push("missing_route_family");

  if (row.qualityGateStatus !== "passed_ready_for_continuation_runner_manifest") {
    failures.push(`unexpected_quality_gate_status:${row.qualityGateStatus}`);
  }

  if (row.mayBuildContinuationRunnerManifestForRow !== true) {
    failures.push("may_build_runner_manifest_not_true");
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
    if (row[key] !== false) failures.push(`quality_gate_row_guardrail_not_false:${key}`);
  });

  return failures;
}

const qualityGate = readJson(qualityGatePath);
const actionPack = readJson(actionPackPath);

validateQualityGate(qualityGate);
validateActionPack(actionPack);

const qualityGateRows = Array.isArray(qualityGate.qualityGateRows)
  ? qualityGate.qualityGateRows
  : [];

if (qualityGateRows.length !== 5) {
  throw new Error(`Expected 5 quality gate rows, got ${qualityGateRows.length}`);
}

const actionPackRows = Array.isArray(actionPack.continuationActionPackRows)
  ? actionPack.continuationActionPackRows
  : [];

const actionPackById = new Map(actionPackRows.map((row) => [row.continuationActionPackRowId, row]));

const runnerTargets = qualityGateRows.map((row, index) => {
  const failures = validateQualityGateRow(row);
  const sourceActionPackRow = actionPackById.get(row.continuationActionPackRowId);

  if (!sourceActionPackRow) {
    failures.push("missing_matching_action_pack_row");
  }

  const isMainLane = row.routeFamily === "whole_map_main_lane_continuation";
  const isRepairBacklog = row.routeFamily === "repair_backlog_continuation";

  return {
    continuationRunnerTargetId: `post_six_league_continuation_runner_target_${String(index + 1).padStart(2, "0")}`,
    continuationActionPackQualityGateRowId: row.continuationActionPackQualityGateRowId,
    continuationActionPackRowId: row.continuationActionPackRowId,
    sourceContinuationRoutingRowId: row.sourceContinuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    continuationRunnerGroup: isMainLane
      ? "whole_map_main_lane_continuation_runner_group"
      : "repair_backlog_continuation_runner_group",
    runnerTargetStatus:
      failures.length === 0
        ? "ready_for_continuation_execution_approval_gate"
        : "blocked_from_continuation_execution_approval_gate",
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
  (row) => row.runnerTargetStatus === "ready_for_continuation_execution_approval_gate"
);

const blockedTargets = runnerTargets.filter(
  (row) => row.runnerTargetStatus !== "ready_for_continuation_execution_approval_gate"
);

const summary = {
  postSixLeagueFullMapContinuationRunnerManifestReadCount: 2,
  sourceContinuationActionPackQualityGateRowCount: qualityGateRows.length,
  sourceContinuationActionPackRowCount: actionPackRows.length,

  continuationRunnerTargetCount: runnerTargets.length,
  readyContinuationRunnerTargetCount: readyTargets.length,
  blockedContinuationRunnerTargetCount: blockedTargets.length,

  mainLaneContinuationRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.routeFamily === "whole_map_main_lane_continuation"
  ),
  repairBacklogContinuationRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.routeFamily === "repair_backlog_continuation"
  ),
  sportomediaRepairContinuationRunnerTargetCount: countWhere(
    readyTargets,
    (row) => row.providerFamily === "sportomedia" && row.routeFamily === "repair_backlog_continuation"
  ),

  mayBuildPostSixLeagueFullMapContinuationExecutionApprovalGateCount:
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
  job: "build-football-truth-post-six-league-full-map-continuation-runner-manifest-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_continuation_runner_manifest",
  dryRun: true,
  inputs: {
    postSixLeagueContinuationActionPackQualityGate: qualityGatePath,
    postSixLeagueContinuationActionPack: actionPackPath
  },
  policy: {
    runnerManifestOnly: true,
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
  throw new Error(`Continuation runner manifest blocked ${blockedTargets.length} targets`);
}
