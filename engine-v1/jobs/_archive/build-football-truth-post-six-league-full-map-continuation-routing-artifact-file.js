import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-verification-2026-06-15",
  "post-six-league-full-map-materialization-execution-verification-2026-06-15.json"
);

const executionRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-runner-2026-06-15",
  "post-six-league-full-map-materialization-execution-runner-2026-06-15.json"
);

const resumeGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-resume-gate-2026-06-15",
  "post-six-league-full-map-resume-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-routing-artifact-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-routing-artifact-2026-06-15.json"
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

function validateExecutionVerification(input) {
  const s = input.summary || {};

  if (s.sourceMaterializationExecutionRowCount !== 5) {
    throw new Error(`Expected sourceMaterializationExecutionRowCount=5, got ${s.sourceMaterializationExecutionRowCount}`);
  }

  if (s.verificationRowCount !== 5) {
    throw new Error(`Expected verificationRowCount=5, got ${s.verificationRowCount}`);
  }

  if (s.verifiedMaterializationExecutionRowCount !== 5) {
    throw new Error(`Expected verifiedMaterializationExecutionRowCount=5, got ${s.verifiedMaterializationExecutionRowCount}`);
  }

  if (s.blockedMaterializationExecutionVerificationCount !== 0) {
    throw new Error(`Expected blockedMaterializationExecutionVerificationCount=0, got ${s.blockedMaterializationExecutionVerificationCount}`);
  }

  if (s.verifiedMainLaneMaterializationExecutionCount !== 4) {
    throw new Error(`Expected verifiedMainLaneMaterializationExecutionCount=4, got ${s.verifiedMainLaneMaterializationExecutionCount}`);
  }

  if (s.verifiedRepairBacklogMaterializationExecutionCount !== 1) {
    throw new Error(`Expected verifiedRepairBacklogMaterializationExecutionCount=1, got ${s.verifiedRepairBacklogMaterializationExecutionCount}`);
  }

  if (s.verifiedSportomediaRepairMaterializationExecutionCount !== 1) {
    throw new Error(`Expected verifiedSportomediaRepairMaterializationExecutionCount=1, got ${s.verifiedSportomediaRepairMaterializationExecutionCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationRoutingArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationRoutingArtifactCount=1");
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
  ].forEach((key) => assertZero(s[key], `executionVerification.summary.${key}`));

  assertFalse(input.productionWrite, "executionVerification.productionWrite");
  assertFalse(input.sourceFetch?.executed, "executionVerification.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "executionVerification.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "executionVerification.broadSearchUsed");
  assertFalse(input.classifierExecuted, "executionVerification.classifierExecuted");
}

function validateExecutionRunner(input) {
  const s = input.summary || {};

  if (s.materializationExecutionRowCount !== 5) {
    throw new Error(`Expected materializationExecutionRowCount=5, got ${s.materializationExecutionRowCount}`);
  }

  if (s.executedMaterializationTargetCount !== 5) {
    throw new Error(`Expected executedMaterializationTargetCount=5, got ${s.executedMaterializationTargetCount}`);
  }

  if (s.mainLaneMaterializationExecutedCount !== 4) {
    throw new Error(`Expected mainLaneMaterializationExecutedCount=4, got ${s.mainLaneMaterializationExecutedCount}`);
  }

  if (s.repairBacklogMaterializationExecutedCount !== 1) {
    throw new Error(`Expected repairBacklogMaterializationExecutedCount=1, got ${s.repairBacklogMaterializationExecutedCount}`);
  }

  if (s.sportomediaRepairMaterializationExecutedCount !== 1) {
    throw new Error(`Expected sportomediaRepairMaterializationExecutedCount=1, got ${s.sportomediaRepairMaterializationExecutedCount}`);
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
  ].forEach((key) => assertZero(s[key], `executionRunner.summary.${key}`));

  assertFalse(input.productionWrite, "executionRunner.productionWrite");
  assertFalse(input.sourceFetch?.executed, "executionRunner.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "executionRunner.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "executionRunner.broadSearchUsed");
  assertFalse(input.classifierExecuted, "executionRunner.classifierExecuted");
}

function validateResumeGate(input) {
  const s = input.summary || {};

  if (s.resumeGatePassedCount !== 2) throw new Error(`Expected resumeGatePassedCount=2, got ${s.resumeGatePassedCount}`);
  if (s.resumeGateBlockedCount !== 0) throw new Error(`Expected resumeGateBlockedCount=0, got ${s.resumeGateBlockedCount}`);
  if (s.sixLeagueBlockerClosedCount !== 1) throw new Error(`Expected sixLeagueBlockerClosedCount=1, got ${s.sixLeagueBlockerClosedCount}`);
  if (s.sixLeagueVerifiedCompetitionCount !== 6) throw new Error(`Expected sixLeagueVerifiedCompetitionCount=6, got ${s.sixLeagueVerifiedCompetitionCount}`);
  if (s.sixLeagueVerifiedPromotedAreaCount !== 18) throw new Error(`Expected sixLeagueVerifiedPromotedAreaCount=18, got ${s.sixLeagueVerifiedPromotedAreaCount}`);
  if (s.mayResumePostSixLeagueFullMapMaterializationCount !== 1) throw new Error("Expected mayResumePostSixLeagueFullMapMaterializationCount=1");

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `resumeGate.summary.${key}`));

  assertFalse(input.productionWrite, "resumeGate.productionWrite");
  assertFalse(input.sourceFetch?.executed, "resumeGate.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "resumeGate.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "resumeGate.broadSearchUsed");
  assertFalse(input.classifierExecuted, "resumeGate.classifierExecuted");
}

function validateVerificationRow(row) {
  const failures = [];

  if (!row.materializationExecutionVerificationRowId) failures.push("missing_verification_row_id");
  if (!row.materializationExecutionRowId) failures.push("missing_execution_row_id");
  if (!row.runnerTargetId) failures.push("missing_runner_target_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.executionGroup) failures.push("missing_execution_group");

  if (row.verificationStatus !== "verified_diagnostics_only_materialization_execution") {
    failures.push(`unexpected_verification_status:${row.verificationStatus}`);
  }

  if (row.noFetchVerified !== true) failures.push("no_fetch_not_verified");
  if (row.noSearchVerified !== true) failures.push("no_search_not_verified");
  if (row.noWriteVerified !== true) failures.push("no_write_not_verified");
  if (row.noTruthAssertionVerified !== true) failures.push("no_truth_assertion_not_verified");

  return failures;
}

const executionVerification = readJson(verificationPath);
const executionRunner = readJson(executionRunnerPath);
const resumeGate = readJson(resumeGatePath);

validateExecutionVerification(executionVerification);
validateExecutionRunner(executionRunner);
validateResumeGate(resumeGate);

const verificationRows = Array.isArray(executionVerification.verificationRows)
  ? executionVerification.verificationRows
  : [];

if (verificationRows.length !== 5) {
  throw new Error(`Expected 5 verification rows, got ${verificationRows.length}`);
}

const continuationRoutingRows = verificationRows.map((row, index) => {
  const failures = validateVerificationRow(row);

  const isMainLane = row.executionGroup === "main_lane_materialization_group";
  const isRepairBacklog = row.executionGroup === "repair_backlog_materialization_group";

  return {
    continuationRoutingRowId: `post_six_league_full_map_continuation_route_${String(index + 1).padStart(2, "0")}`,
    sourceVerificationRowId: row.materializationExecutionVerificationRowId,
    sourceLane: row.sourceLane,
    materializationLane: row.materializationLane,
    executionGroup: row.executionGroup,
    providerFamily: row.providerFamily || null,
    routeFamily: isMainLane ? "whole_map_main_lane_continuation" : "repair_backlog_continuation",
    routeIntent: isMainLane
      ? "continue_full_map_main_lane_after_verified_materialization_execution"
      : "continue_provider_family_repair_backlog_after_verified_materialization_execution",
    routingStatus:
      failures.length === 0
        ? "ready_for_next_full_map_continuation_action_pack"
        : "blocked_from_next_full_map_continuation_action_pack",
    failures,
    mayBuildNextContinuationActionPackForRoute: failures.length === 0,

    routingIsExecutionPermissionNow: false,
    routingIsFetchPermissionNow: false,
    routingIsSearchPermissionNow: false,
    routingIsBroadSearchPermissionNow: false,
    routingIsClassifierPermissionNow: false,
    routingIsCanonicalWritePermissionNow: false,
    routingIsProductionWritePermissionNow: false,
    routingIsTruthAssertionPermissionNow: false
  };
});

const readyRows = continuationRoutingRows.filter(
  (row) => row.routingStatus === "ready_for_next_full_map_continuation_action_pack"
);

const blockedRows = continuationRoutingRows.filter(
  (row) => row.routingStatus !== "ready_for_next_full_map_continuation_action_pack"
);

const summary = {
  postSixLeagueFullMapContinuationRoutingArtifactReadCount: 3,
  sourceVerificationRowCount: verificationRows.length,
  sourceMaterializationExecutionRowCount: (executionRunner.executionRows || []).length,

  continuationRoutingRowCount: continuationRoutingRows.length,
  readyContinuationRoutingRowCount: readyRows.length,
  blockedContinuationRoutingRowCount: blockedRows.length,

  mainLaneContinuationRoutingRowCount: countWhere(
    readyRows,
    (row) => row.routeFamily === "whole_map_main_lane_continuation"
  ),
  repairBacklogContinuationRoutingRowCount: countWhere(
    readyRows,
    (row) => row.routeFamily === "repair_backlog_continuation"
  ),
  sportomediaRepairContinuationRoutingRowCount: countWhere(
    readyRows,
    (row) => row.providerFamily === "sportomedia" && row.routeFamily === "repair_backlog_continuation"
  ),

  sixLeagueBlockerClosedCount: 1,
  sixLeagueVerifiedCompetitionCount: resumeGate.summary.sixLeagueVerifiedCompetitionCount,
  sixLeagueVerifiedPromotedAreaCount: resumeGate.summary.sixLeagueVerifiedPromotedAreaCount,

  materializationExecutionVerifiedCount:
    executionVerification.summary.verifiedMaterializationExecutionRowCount,
  diagnosticsOnlyMaterializationExecutionVerifiedCount:
    executionVerification.summary.diagnosticsOnlyMaterializationExecutionVerifiedCount,

  mayBuildPostSixLeagueFullMapContinuationActionPackCount: blockedRows.length === 0 ? 1 : 0,

  continuationRoutingIsExecutionPermissionNowCount: 0,
  continuationRoutingIsFetchPermissionNowCount: 0,
  continuationRoutingIsSearchPermissionNowCount: 0,
  continuationRoutingIsBroadSearchPermissionNowCount: 0,
  continuationRoutingIsClassifierPermissionNowCount: 0,
  continuationRoutingIsCanonicalWritePermissionNowCount: 0,
  continuationRoutingIsProductionWritePermissionNowCount: 0,
  continuationRoutingIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-continuation-routing-artifact-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_full_map_continuation_routing",
  dryRun: true,
  inputs: {
    postSixLeagueMaterializationExecutionVerification: verificationPath,
    postSixLeagueMaterializationExecutionRunner: executionRunnerPath,
    postSixLeagueFullMapResumeGate: resumeGatePath
  },
  policy: {
    continuationRoutingOnly: true,
    nextStepMustBuildActionPackBeforeAnyExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  continuationRoutingRows,
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
  throw new Error(`Continuation routing blocked ${blockedRows.length} rows`);
}
