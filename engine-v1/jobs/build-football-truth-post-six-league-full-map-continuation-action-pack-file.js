import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const routingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-routing-artifact-2026-06-15",
  "post-six-league-full-map-continuation-routing-artifact-2026-06-15.json"
);

const executionVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-verification-2026-06-15",
  "post-six-league-full-map-materialization-execution-verification-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-action-pack-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-action-pack-2026-06-15.json"
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

function validateRouting(input) {
  const s = input.summary || {};

  if (s.continuationRoutingRowCount !== 5) {
    throw new Error(`Expected continuationRoutingRowCount=5, got ${s.continuationRoutingRowCount}`);
  }

  if (s.readyContinuationRoutingRowCount !== 5) {
    throw new Error(`Expected readyContinuationRoutingRowCount=5, got ${s.readyContinuationRoutingRowCount}`);
  }

  if (s.blockedContinuationRoutingRowCount !== 0) {
    throw new Error(`Expected blockedContinuationRoutingRowCount=0, got ${s.blockedContinuationRoutingRowCount}`);
  }

  if (s.mainLaneContinuationRoutingRowCount !== 4) {
    throw new Error(`Expected mainLaneContinuationRoutingRowCount=4, got ${s.mainLaneContinuationRoutingRowCount}`);
  }

  if (s.repairBacklogContinuationRoutingRowCount !== 1) {
    throw new Error(`Expected repairBacklogContinuationRoutingRowCount=1, got ${s.repairBacklogContinuationRoutingRowCount}`);
  }

  if (s.sportomediaRepairContinuationRoutingRowCount !== 1) {
    throw new Error(`Expected sportomediaRepairContinuationRoutingRowCount=1, got ${s.sportomediaRepairContinuationRoutingRowCount}`);
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

  if (s.mayBuildPostSixLeagueFullMapContinuationActionPackCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationActionPackCount=1");
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

function validateExecutionVerification(input) {
  const s = input.summary || {};

  if (s.verifiedMaterializationExecutionRowCount !== 5) {
    throw new Error(`Expected verifiedMaterializationExecutionRowCount=5, got ${s.verifiedMaterializationExecutionRowCount}`);
  }

  if (s.blockedMaterializationExecutionVerificationCount !== 0) {
    throw new Error(`Expected blockedMaterializationExecutionVerificationCount=0, got ${s.blockedMaterializationExecutionVerificationCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationRoutingArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationRoutingArtifactCount=1");
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
  ].forEach((key) => assertZero(s[key], `executionVerification.summary.${key}`));

  assertFalse(input.productionWrite, "executionVerification.productionWrite");
}

function validateRoutingRow(row) {
  const failures = [];

  if (!row.continuationRoutingRowId) failures.push("missing_continuation_routing_row_id");
  if (!row.sourceVerificationRowId) failures.push("missing_source_verification_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.routeFamily) failures.push("missing_route_family");
  if (!row.routeIntent) failures.push("missing_route_intent");

  if (row.routingStatus !== "ready_for_next_full_map_continuation_action_pack") {
    failures.push(`unexpected_routing_status:${row.routingStatus}`);
  }

  if (row.mayBuildNextContinuationActionPackForRoute !== true) {
    failures.push("may_build_next_action_pack_not_true");
  }

  [
    "routingIsExecutionPermissionNow",
    "routingIsFetchPermissionNow",
    "routingIsSearchPermissionNow",
    "routingIsBroadSearchPermissionNow",
    "routingIsClassifierPermissionNow",
    "routingIsCanonicalWritePermissionNow",
    "routingIsProductionWritePermissionNow",
    "routingIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`routing_guardrail_not_false:${key}`);
  });

  return failures;
}

const routing = readJson(routingPath);
const executionVerification = readJson(executionVerificationPath);

validateRouting(routing);
validateExecutionVerification(executionVerification);

const routingRows = Array.isArray(routing.continuationRoutingRows)
  ? routing.continuationRoutingRows
  : [];

if (routingRows.length !== 5) {
  throw new Error(`Expected 5 continuation routing rows, got ${routingRows.length}`);
}

const actionPackRows = routingRows.map((row, index) => {
  const failures = validateRoutingRow(row);

  const isMainLane = row.routeFamily === "whole_map_main_lane_continuation";
  const isRepairBacklog = row.routeFamily === "repair_backlog_continuation";

  return {
    continuationActionPackRowId: `post_six_league_full_map_continuation_action_pack_${String(index + 1).padStart(2, "0")}`,
    sourceContinuationRoutingRowId: row.continuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    materializationLane: row.materializationLane,
    executionGroup: row.executionGroup,
    providerFamily: row.providerFamily || null,
    routeFamily: row.routeFamily,
    routeIntent: row.routeIntent,
    actionPackLane: isMainLane ? "whole_map_main_lane_next_action_pack" : "repair_backlog_next_action_pack",
    actionPackIntent: isMainLane
      ? "build_next_full_map_main_lane_action_pack_after_verified_post_six_league_materialization"
      : "build_next_repair_backlog_action_pack_after_verified_post_six_league_materialization",
    actionPackStatus:
      failures.length === 0
        ? "ready_for_continuation_action_pack_quality_gate"
        : "blocked_from_continuation_action_pack_quality_gate",
    failures,
    mayBuildContinuationActionPackQualityGateForRow: failures.length === 0,

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

const readyRows = actionPackRows.filter(
  (row) => row.actionPackStatus === "ready_for_continuation_action_pack_quality_gate"
);

const blockedRows = actionPackRows.filter(
  (row) => row.actionPackStatus !== "ready_for_continuation_action_pack_quality_gate"
);

const summary = {
  postSixLeagueFullMapContinuationActionPackReadCount: 2,
  sourceContinuationRoutingRowCount: routingRows.length,
  sourceMaterializationExecutionVerificationRowCount:
    (executionVerification.verificationRows || []).length,

  continuationActionPackRowCount: actionPackRows.length,
  readyContinuationActionPackRowCount: readyRows.length,
  blockedContinuationActionPackRowCount: blockedRows.length,

  mainLaneContinuationActionPackRowCount: countWhere(
    readyRows,
    (row) => row.routeFamily === "whole_map_main_lane_continuation"
  ),
  repairBacklogContinuationActionPackRowCount: countWhere(
    readyRows,
    (row) => row.routeFamily === "repair_backlog_continuation"
  ),
  sportomediaRepairContinuationActionPackRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.routeFamily === "repair_backlog_continuation"
  ),

  sixLeagueBlockerClosedCount: routing.summary.sixLeagueBlockerClosedCount,
  sixLeagueVerifiedCompetitionCount: routing.summary.sixLeagueVerifiedCompetitionCount,
  sixLeagueVerifiedPromotedAreaCount: routing.summary.sixLeagueVerifiedPromotedAreaCount,
  materializationExecutionVerifiedCount: routing.summary.materializationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapContinuationActionPackQualityGateCount: blockedRows.length === 0 ? 1 : 0,

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
  job: "build-football-truth-post-six-league-full-map-continuation-action-pack-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_full_map_continuation_action_pack",
  dryRun: true,
  inputs: {
    postSixLeagueFullMapContinuationRoutingArtifact: routingPath,
    postSixLeagueFullMapMaterializationExecutionVerification: executionVerificationPath
  },
  policy: {
    continuationActionPackOnly: true,
    qualityGateRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  continuationActionPackRows: actionPackRows,
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
  throw new Error(`Continuation action pack blocked ${blockedRows.length} rows`);
}
