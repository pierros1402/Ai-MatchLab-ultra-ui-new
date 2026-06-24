import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const completionActionPackPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-action-pack-2026-06-15",
  "post-six-league-full-map-continuation-completion-action-pack-2026-06-15.json"
);

const completionRoutingPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-routing-artifact-2026-06-15",
  "post-six-league-full-map-continuation-completion-routing-artifact-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-completion-action-pack-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-completion-action-pack-quality-gate-2026-06-15.json"
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

function validateCompletionActionPack(input) {
  const s = input.summary || {};

  if (s.continuationCompletionActionPackRowCount !== 5) {
    throw new Error(`Expected continuationCompletionActionPackRowCount=5, got ${s.continuationCompletionActionPackRowCount}`);
  }

  if (s.readyContinuationCompletionActionPackRowCount !== 5) {
    throw new Error(`Expected readyContinuationCompletionActionPackRowCount=5, got ${s.readyContinuationCompletionActionPackRowCount}`);
  }

  if (s.blockedContinuationCompletionActionPackRowCount !== 0) {
    throw new Error(`Expected blockedContinuationCompletionActionPackRowCount=0, got ${s.blockedContinuationCompletionActionPackRowCount}`);
  }

  if (s.mainLaneContinuationCompletionActionPackRowCount !== 4) {
    throw new Error(`Expected mainLaneContinuationCompletionActionPackRowCount=4, got ${s.mainLaneContinuationCompletionActionPackRowCount}`);
  }

  if (s.repairBacklogContinuationCompletionActionPackRowCount !== 1) {
    throw new Error(`Expected repairBacklogContinuationCompletionActionPackRowCount=1, got ${s.repairBacklogContinuationCompletionActionPackRowCount}`);
  }

  if (s.sportomediaRepairContinuationCompletionActionPackRowCount !== 1) {
    throw new Error(`Expected sportomediaRepairContinuationCompletionActionPackRowCount=1, got ${s.sportomediaRepairContinuationCompletionActionPackRowCount}`);
  }

  if (s.continuationExecutionVerifiedCount !== 5) {
    throw new Error(`Expected continuationExecutionVerifiedCount=5, got ${s.continuationExecutionVerifiedCount}`);
  }

  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) {
    throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionActionPackQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionActionPackQualityGateCount=1");
  }

  [
    "completionActionPackIsExecutionPermissionNowCount",
    "completionActionPackIsFetchPermissionNowCount",
    "completionActionPackIsSearchPermissionNowCount",
    "completionActionPackIsBroadSearchPermissionNowCount",
    "completionActionPackIsClassifierPermissionNowCount",
    "completionActionPackIsCanonicalWritePermissionNowCount",
    "completionActionPackIsProductionWritePermissionNowCount",
    "completionActionPackIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `completionActionPack.summary.${key}`));

  assertFalse(input.productionWrite, "completionActionPack.productionWrite");
  assertFalse(input.sourceFetch?.executed, "completionActionPack.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "completionActionPack.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "completionActionPack.broadSearchUsed");
  assertFalse(input.classifierExecuted, "completionActionPack.classifierExecuted");
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

  if (s.mayBuildPostSixLeagueFullMapContinuationCompletionActionPackCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationCompletionActionPackCount=1");
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
  ].forEach((key) => assertZero(s[key], `completionRouting.summary.${key}`));

  assertFalse(input.productionWrite, "completionRouting.productionWrite");
  assertFalse(input.sourceFetch?.executed, "completionRouting.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "completionRouting.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "completionRouting.broadSearchUsed");
  assertFalse(input.classifierExecuted, "completionRouting.classifierExecuted");
}

function validateCompletionActionPackRow(row) {
  const failures = [];

  if (!row.continuationCompletionActionPackRowId) failures.push("missing_completion_action_pack_row_id");
  if (!row.continuationCompletionRoutingRowId) failures.push("missing_completion_routing_row_id");
  if (!row.continuationExecutionVerificationRowId) failures.push("missing_continuation_execution_verification_row_id");
  if (!row.continuationExecutionRowId) failures.push("missing_continuation_execution_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.completionRouteFamily) failures.push("missing_completion_route_family");
  if (!row.completionActionPackLane) failures.push("missing_completion_action_pack_lane");
  if (!row.completionActionPackIntent) failures.push("missing_completion_action_pack_intent");

  if (row.completionActionPackStatus !== "ready_for_post_six_league_completion_action_pack_quality_gate") {
    failures.push(`unexpected_completion_action_pack_status:${row.completionActionPackStatus}`);
  }

  if (row.mayBuildCompletionActionPackQualityGateForRow !== true) {
    failures.push("may_build_completion_action_pack_quality_gate_not_true");
  }

  [
    "completionActionPackIsExecutionPermissionNow",
    "completionActionPackIsFetchPermissionNow",
    "completionActionPackIsSearchPermissionNow",
    "completionActionPackIsBroadSearchPermissionNow",
    "completionActionPackIsClassifierPermissionNow",
    "completionActionPackIsCanonicalWritePermissionNow",
    "completionActionPackIsProductionWritePermissionNow",
    "completionActionPackIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`completion_action_pack_guardrail_not_false:${key}`);
  });

  return failures;
}

const completionActionPack = readJson(completionActionPackPath);
const completionRouting = readJson(completionRoutingPath);

validateCompletionActionPack(completionActionPack);
validateCompletionRouting(completionRouting);

const completionActionPackRows = Array.isArray(completionActionPack.completionActionPackRows)
  ? completionActionPack.completionActionPackRows
  : [];

if (completionActionPackRows.length !== 5) {
  throw new Error(`Expected 5 completion action pack rows, got ${completionActionPackRows.length}`);
}

const qualityGateRows = completionActionPackRows.map((row, index) => {
  const failures = validateCompletionActionPackRow(row);

  return {
    continuationCompletionActionPackQualityGateRowId: `post_six_league_continuation_completion_action_pack_quality_gate_${String(index + 1).padStart(2, "0")}`,
    continuationCompletionActionPackRowId: row.continuationCompletionActionPackRowId,
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
    completionActionPackLane: row.completionActionPackLane,
    qualityGateStatus:
      failures.length === 0
        ? "passed_ready_for_post_six_league_completion_runner_manifest"
        : "blocked_from_post_six_league_completion_runner_manifest",
    failures,
    mayBuildCompletionRunnerManifestForRow: failures.length === 0,

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
  (row) => row.qualityGateStatus === "passed_ready_for_post_six_league_completion_runner_manifest"
);

const blockedRows = qualityGateRows.filter(
  (row) => row.qualityGateStatus !== "passed_ready_for_post_six_league_completion_runner_manifest"
);

const summary = {
  postSixLeagueFullMapContinuationCompletionActionPackQualityGateReadCount: 2,
  sourceContinuationCompletionActionPackRowCount: completionActionPackRows.length,
  sourceContinuationCompletionRoutingRowCount:
    (completionRouting.completionRoutingRows || []).length,

  continuationCompletionActionPackQualityGateRowCount: qualityGateRows.length,
  continuationCompletionActionPackQualityGatePassedCount: passedRows.length,
  continuationCompletionActionPackQualityGateBlockedCount: blockedRows.length,

  mainLaneContinuationCompletionActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.completionRouteFamily === "whole_map_main_lane_completion"
  ),
  repairBacklogContinuationCompletionActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.completionRouteFamily === "repair_backlog_completion"
  ),
  sportomediaRepairContinuationCompletionActionPackQualityGatedCount: countWhere(
    passedRows,
    (row) => row.providerFamily === "sportomedia" && row.completionRouteFamily === "repair_backlog_completion"
  ),

  continuationExecutionVerifiedCount:
    completionActionPack.summary.continuationExecutionVerifiedCount,
  diagnosticsOnlyContinuationExecutionVerifiedCount:
    completionActionPack.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapContinuationCompletionRunnerManifestCount:
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
  job: "run-football-truth-post-six-league-full-map-continuation-completion-action-pack-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_continuation_completion_action_pack_quality_gate",
  dryRun: true,
  inputs: {
    postSixLeagueContinuationCompletionActionPack: completionActionPackPath,
    postSixLeagueContinuationCompletionRoutingArtifact: completionRoutingPath
  },
  policy: {
    completionActionPackQualityGateOnly: true,
    completionRunnerManifestRequiredBeforeAnyFurtherExecution: true,
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
  throw new Error(`Continuation completion action pack quality gate blocked ${blockedRows.length} rows`);
}
