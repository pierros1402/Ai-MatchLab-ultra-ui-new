import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const completionRoutingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-routing-artifact-2026-06-15",
  "post-six-league-full-map-continuation-completion-routing-artifact-2026-06-15.json"
);

const executionVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-verification-2026-06-15",
  "post-six-league-full-map-continuation-execution-verification-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-action-pack-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-completion-action-pack-2026-06-15.json"
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

function validateCompletionRouting(input) {
  const s = input.summary || {};

  if (s.continuationCompletionRoutingRowCount !== 5) {
    throw new Error(`Expected continuationCompletionRoutingRowCount=5, got ${s.continuationCompletionRoutingRowCount}`);
  }

  if (s.readyContinuationCompletionRoutingRowCount !== 5) {
    throw new Error(`Expected readyContinuationCompletionRoutingRowCount=5, got ${s.readyContinuationCompletionRoutingRowCount}`);
  }

  if (s.blockedContinuationCompletionRoutingRowCount !== 0) {
    throw new Error(`Expected blockedContinuationCompletionRoutingRowCount=0, got ${s.blockedContinuationCompletionRoutingRowCount}`);
  }

  if (s.mainLaneContinuationCompletionRoutingRowCount !== 4) {
    throw new Error(`Expected mainLaneContinuationCompletionRoutingRowCount=4, got ${s.mainLaneContinuationCompletionRoutingRowCount}`);
  }

  if (s.repairBacklogContinuationCompletionRoutingRowCount !== 1) {
    throw new Error(`Expected repairBacklogContinuationCompletionRoutingRowCount=1, got ${s.repairBacklogContinuationCompletionRoutingRowCount}`);
  }

  if (s.sportomediaRepairContinuationCompletionRoutingRowCount !== 1) {
    throw new Error(`Expected sportomediaRepairContinuationCompletionRoutingRowCount=1, got ${s.sportomediaRepairContinuationCompletionRoutingRowCount}`);
  }

  if (s.continuationExecutionVerifiedCount !== 5) {
    throw new Error(`Expected continuationExecutionVerifiedCount=5, got ${s.continuationExecutionVerifiedCount}`);
  }

  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) {
    throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionActionPackCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionActionPackCount=1");
  }

  [
    "completionRoutingIsExecutionPermissionNowCount",
    "completionRoutingIsFetchPermissionNowCount",
    "completionRoutingIsSearchPermissionNowCount",
    "completionRoutingIsBroadSearchPermissionNowCount",
    "completionRoutingIsClassifierPermissionNowCount",
    "completionRoutingIsCanonicalWritePermissionNowCount",
    "completionRoutingIsProductionWritePermissionNowCount",
    "completionRoutingIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `completionRouting.summary.${key}`));

  assertFalse(input.productionWrite, "completionRouting.productionWrite");
  assertFalse(input.sourceFetch?.executed, "completionRouting.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "completionRouting.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "completionRouting.broadSearchUsed");
  assertFalse(input.classifierExecuted, "completionRouting.classifierExecuted");
}

function validateExecutionVerification(input) {
  const s = input.summary || {};

  if (s.verifiedContinuationExecutionRowCount !== 5) {
    throw new Error(`Expected verifiedContinuationExecutionRowCount=5, got ${s.verifiedContinuationExecutionRowCount}`);
  }

  if (s.blockedContinuationExecutionVerificationCount !== 0) {
    throw new Error(`Expected blockedContinuationExecutionVerificationCount=0, got ${s.blockedContinuationExecutionVerificationCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionRoutingArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionRoutingArtifactCount=1");
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

function validateCompletionRoutingRow(row) {
  const failures = [];

  if (!row.continuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!row.continuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!row.continuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.completionRouteFamily) failures.push("missing_completion_route_family");
  if (!row.completionRouteIntent) failures.push("missing_completion_route_intent");

  if (row.completionRoutingStatus !== "ready_for_post_six_league_full_map_completion_action_pack") {
    failures.push(`unexpected_completion_routing_status:${row.completionRoutingStatus}`);
  }

  if (row.mayBuildCompletionActionPackForRoute !== true) {
    failures.push("may_build_completion_action_pack_not_true");
  }

  [
    "completionRoutingIsExecutionPermissionNow",
    "completionRoutingIsFetchPermissionNow",
    "completionRoutingIsSearchPermissionNow",
    "completionRoutingIsBroadSearchPermissionNow",
    "completionRoutingIsClassifierPermissionNow",
    "completionRoutingIsCanonicalWritePermissionNow",
    "completionRoutingIsProductionWritePermissionNow",
    "completionRoutingIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`completion_routing_guardrail_not_false:${key}`);
  });

  return failures;
}

const completionRouting = readJson(completionRoutingPath);
const executionVerification = readJson(executionVerificationPath);

validateCompletionRouting(completionRouting);
validateExecutionVerification(executionVerification);

const completionRoutingRows = Array.isArray(completionRouting.completionRoutingRows)
  ? completionRouting.completionRoutingRows
  : [];

if (completionRoutingRows.length !== 5) {
  throw new Error(`Expected 5 completion routing rows, got ${completionRoutingRows.length}`);
}

const completionActionPackRows = completionRoutingRows.map((row, index) => {
  const failures = validateCompletionRoutingRow(row);

  const isMainLane = row.completionRouteFamily === "whole_map_main_lane_completion";
  const isRepairBacklog = row.completionRouteFamily === "repair_backlog_completion";

  return {
    continuationCompletionActionPackRowId: `post_six_league_continuation_completion_action_pack_${String(index + 1).padStart(2, "0")}`,
    continuationCompletionRoutingRowId: row.continuationCompletionRoutingRowId,
    continuationExecutionVerificationRowId: row.continuationExecutionVerificationRowId,
    continuationExecutionRowId: row.continuationExecutionRowId,
    continuationExecutionApprovalRowId: row.continuationExecutionApprovalRowId,
    continuationRunnerTargetId: row.continuationRunnerTargetId,
    sourceContinuationRoutingRowId: row.sourceContinuationRoutingRowId,
    sourceVerificationRowId: row.sourceVerificationRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    completionRouteFamily: row.completionRouteFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    continuationRunnerGroup: row.continuationRunnerGroup,
    completionActionPackLane: isMainLane
      ? "whole_map_main_lane_completion_action_pack"
      : "repair_backlog_completion_action_pack",
    completionActionPackIntent: isMainLane
      ? "build_post_six_league_main_lane_completion_quality_gate_after_verified_continuation_execution"
      : "build_post_six_league_repair_backlog_completion_quality_gate_after_verified_continuation_execution",
    completionActionPackStatus:
      failures.length === 0
        ? "ready_for_post_six_league_completion_action_pack_quality_gate"
        : "blocked_from_post_six_league_completion_action_pack_quality_gate",
    failures,
    mayBuildCompletionActionPackQualityGateForRow: failures.length === 0,

    completionActionPackIsExecutionPermissionNow: false,
    completionActionPackIsFetchPermissionNow: false,
    completionActionPackIsSearchPermissionNow: false,
    completionActionPackIsBroadSearchPermissionNow: false,
    completionActionPackIsClassifierPermissionNow: false,
    completionActionPackIsCanonicalWritePermissionNow: false,
    completionActionPackIsProductionWritePermissionNow: false,
    completionActionPackIsTruthAssertionPermissionNow: false
  };
});

const readyRows = completionActionPackRows.filter(
  (row) => row.completionActionPackStatus === "ready_for_post_six_league_completion_action_pack_quality_gate"
);

const blockedRows = completionActionPackRows.filter(
  (row) => row.completionActionPackStatus !== "ready_for_post_six_league_completion_action_pack_quality_gate"
);

const summary = {
  postSixLeagueFullMapContinuationCompletionActionPackReadCount: 2,
  sourceContinuationCompletionRoutingRowCount: completionRoutingRows.length,
  sourceContinuationExecutionVerificationRowCount:
    (executionVerification.verificationRows || []).length,

  continuationCompletionActionPackRowCount: completionActionPackRows.length,
  readyContinuationCompletionActionPackRowCount: readyRows.length,
  blockedContinuationCompletionActionPackRowCount: blockedRows.length,

  mainLaneContinuationCompletionActionPackRowCount: countWhere(
    readyRows,
    (row) => row.completionRouteFamily === "whole_map_main_lane_completion"
  ),
  repairBacklogContinuationCompletionActionPackRowCount: countWhere(
    readyRows,
    (row) => row.completionRouteFamily === "repair_backlog_completion"
  ),
  sportomediaRepairContinuationCompletionActionPackRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.completionRouteFamily === "repair_backlog_completion"
  ),

  continuationExecutionVerifiedCount: completionRouting.summary.continuationExecutionVerifiedCount,
  diagnosticsOnlyContinuationExecutionVerifiedCount:
    completionRouting.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapContinuationCompletionActionPackQualityGateCount:
    blockedRows.length === 0 ? 1 : 0,

  completionActionPackIsExecutionPermissionNowCount: 0,
  completionActionPackIsFetchPermissionNowCount: 0,
  completionActionPackIsSearchPermissionNowCount: 0,
  completionActionPackIsBroadSearchPermissionNowCount: 0,
  completionActionPackIsClassifierPermissionNowCount: 0,
  completionActionPackIsCanonicalWritePermissionNowCount: 0,
  completionActionPackIsProductionWritePermissionNowCount: 0,
  completionActionPackIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-continuation-completion-action-pack-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_continuation_completion_action_pack",
  dryRun: true,
  inputs: {
    postSixLeagueContinuationCompletionRoutingArtifact: completionRoutingPath,
    postSixLeagueContinuationExecutionVerification: executionVerificationPath
  },
  policy: {
    continuationCompletionActionPackOnly: true,
    completionActionPackQualityGateRequiredBeforeAnyFurtherExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  completionActionPackRows: completionActionPackRows,
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
  throw new Error(`Continuation completion action pack blocked ${blockedRows.length} rows`);
}
