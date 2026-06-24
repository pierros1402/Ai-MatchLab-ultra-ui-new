import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const actionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-action-pack-2026-06-15",
  "post-six-league-full-map-continuation-action-pack-2026-06-15.json"
);

const routingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-routing-artifact-2026-06-15",
  "post-six-league-full-map-continuation-routing-artifact-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-action-pack-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-action-pack-quality-gate-2026-06-15.json"
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

  if (s.mainLaneContinuationActionPackRowCount !== 4) {
    throw new Error(`Expected mainLaneContinuationActionPackRowCount=4, got ${s.mainLaneContinuationActionPackRowCount}`);
  }

  if (s.repairBacklogContinuationActionPackRowCount !== 1) {
    throw new Error(`Expected repairBacklogContinuationActionPackRowCount=1, got ${s.repairBacklogContinuationActionPackRowCount}`);
  }

  if (s.sportomediaRepairContinuationActionPackRowCount !== 1) {
    throw new Error(`Expected sportomediaRepairContinuationActionPackRowCount=1, got ${s.sportomediaRepairContinuationActionPackRowCount}`);
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

  if (s.mayBuildPostSixLeagueFullMapContinuationActionPackQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationActionPackQualityGateCount=1");
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

  if (s.readyContinuationRoutingRowCount !== 5) {
    throw new Error(`Expected readyContinuationRoutingRowCount=5, got ${s.readyContinuationRoutingRowCount}`);
  }

  if (s.blockedContinuationRoutingRowCount !== 0) {
    throw new Error(`Expected blockedContinuationRoutingRowCount=0, got ${s.blockedContinuationRoutingRowCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationActionPackCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationActionPackCount=1");
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
  ].forEach((key) => assertZero(s[key], `routing.summary.${key}`));

  assertFalse(input.productionWrite, "routing.productionWrite");
}

function validateActionPackRow(row) {
  const failures = [];

  if (!row.continuationActionPackRowId) failures.push("missing_continuation_action_pack_row_id");
  if (!row.sourceContinuationRoutingRowId) failures.push("missing_source_continuation_routing_row_id");
  if (!row.sourceVerificationRowId) failures.push("missing_source_verification_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.actionPackLane) failures.push("missing_action_pack_lane");
  if (!row.actionPackIntent) failures.push("missing_action_pack_intent");
  if (!row.routeFamily) failures.push("missing_route_family");

  if (row.actionPackStatus !== "ready_for_continuation_action_pack_quality_gate") {
    failures.push(`unexpected_action_pack_status:${row.actionPackStatus}`);
  }

  if (row.mayBuildContinuationActionPackQualityGateForRow !== true) {
    failures.push("may_build_quality_gate_not_true");
  }

  [
    "isExecutionPermissionNow",
    "isFetchPermissionNow",
    "isSearchPermissionNow",
    "isBroadSearchPermissionNow",
    "isClassifierPermissionNow",
    "isCanonicalWritePermissionNow",
    "isProductionWritePermissionNow",
    "isTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`action_pack_guardrail_not_false:${key}`);
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

if (actionPackRows.length !== 5) {
  throw new Error(`Expected 5 continuation action pack rows, got ${actionPackRows.length}`);
}

const qualityGateRows = actionPackRows.map((row, index) => {
  const failures = validateActionPackRow(row);

  return {
    continuationActionPackQualityGateRowId: `post_six_league_continuation_action_pack_quality_gate_${String(index + 1).padStart(2, "0")}`,
    continuationActionPackRowId: row.continuationActionPackRowId,
    sourceContinuationRoutingRowId: row.sourceContinuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    qualityGateStatus:
      failures.length === 0
        ? "passed_ready_for_continuation_runner_manifest"
        : "blocked_from_continuation_runner_manifest",
    failures,
    mayBuildContinuationRunnerManifestForRow: failures.length === 0,

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
  (row) => row.qualityGateStatus === "passed_ready_for_continuation_runner_manifest"
);

const blockedRows = qualityGateRows.filter(
  (row) => row.qualityGateStatus !== "passed_ready_for_continuation_runner_manifest"
);

const summary = {
  postSixLeagueFullMapContinuationActionPackQualityGateReadCount: 2,
  sourceContinuationActionPackRowCount: actionPackRows.length,
  sourceContinuationRoutingRowCount: (routing.continuationRoutingRows || []).length,

  continuationActionPackQualityGateRowCount: qualityGateRows.length,
  continuationActionPackQualityGatePassedCount: passedRows.length,
  continuationActionPackQualityGateBlockedCount: blockedRows.length,

  mainLaneContinuationActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.routeFamily === "whole_map_main_lane_continuation"
  ),
  repairBacklogContinuationActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.routeFamily === "repair_backlog_continuation"
  ),
  sportomediaRepairContinuationActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.providerFamily === "sportomedia" && row.routeFamily === "repair_backlog_continuation"
  ),

  sixLeagueBlockerClosedCount: actionPack.summary.sixLeagueBlockerClosedCount,
  sixLeagueVerifiedCompetitionCount: actionPack.summary.sixLeagueVerifiedCompetitionCount,
  sixLeagueVerifiedPromotedAreaCount: actionPack.summary.sixLeagueVerifiedPromotedAreaCount,
  materializationExecutionVerifiedCount: actionPack.summary.materializationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapContinuationRunnerManifestCount: blockedRows.length === 0 ? 1 : 0,

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
  job: "run-football-truth-post-six-league-full-map-continuation-action-pack-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_continuation_action_pack_quality_gate",
  dryRun: true,
  inputs: {
    postSixLeagueFullMapContinuationActionPack: actionPackPath,
    postSixLeagueFullMapContinuationRoutingArtifact: routingPath
  },
  policy: {
    qualityGateOnly: true,
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
  throw new Error(`Continuation action pack quality gate blocked ${blockedRows.length} rows`);
}
