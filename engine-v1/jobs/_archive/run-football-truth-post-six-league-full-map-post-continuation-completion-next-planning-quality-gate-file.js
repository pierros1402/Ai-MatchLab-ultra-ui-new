import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const planningPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-artifact-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-artifact-2026-06-15.json"
);

const cycleExitVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-verification-2026-06-15",
  "post-six-league-full-map-next-cycle-continuation-completion-cycle-exit-verification-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-2026-06-15.json"
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

function validatePlanning(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactReadCount !== 3) {
    throw new Error(`Expected postSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactReadCount=3, got ${s.postSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactReadCount}`);
  }
  if (s.sourceContinuationCompletionCycleExitVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCycleExitVerificationRowCount=5, got ${s.sourceContinuationCompletionCycleExitVerificationRowCount}`);
  if (s.sourceContinuationCompletionCycleExitRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCycleExitRowCount=5, got ${s.sourceContinuationCompletionCycleExitRowCount}`);
  if (s.sourceContinuationCompletionCloseoutVerificationRowCount !== 5) throw new Error(`Expected sourceContinuationCompletionCloseoutVerificationRowCount=5, got ${s.sourceContinuationCompletionCloseoutVerificationRowCount}`);
  if (s.postContinuationCompletionNextPlanningRowCount !== 5) throw new Error(`Expected postContinuationCompletionNextPlanningRowCount=5, got ${s.postContinuationCompletionNextPlanningRowCount}`);
  if (s.readyPostContinuationCompletionNextPlanningRowCount !== 5) throw new Error(`Expected readyPostContinuationCompletionNextPlanningRowCount=5, got ${s.readyPostContinuationCompletionNextPlanningRowCount}`);
  if (s.blockedPostContinuationCompletionNextPlanningRowCount !== 0) throw new Error(`Expected blockedPostContinuationCompletionNextPlanningRowCount=0, got ${s.blockedPostContinuationCompletionNextPlanningRowCount}`);
  if (s.mainLanePostContinuationCompletionNextPlanningRowCount !== 4) throw new Error(`Expected mainLanePostContinuationCompletionNextPlanningRowCount=4, got ${s.mainLanePostContinuationCompletionNextPlanningRowCount}`);
  if (s.repairBacklogPostContinuationCompletionNextPlanningRowCount !== 1) throw new Error(`Expected repairBacklogPostContinuationCompletionNextPlanningRowCount=1, got ${s.repairBacklogPostContinuationCompletionNextPlanningRowCount}`);
  if (s.sportomediaRepairPostContinuationCompletionNextPlanningRowCount !== 1) throw new Error(`Expected sportomediaRepairPostContinuationCompletionNextPlanningRowCount=1, got ${s.sportomediaRepairPostContinuationCompletionNextPlanningRowCount}`);
  if (s.postSixLeagueContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueContinuationCompletionCycleClosedCount=1");
  if (s.diagnosticsOnlyNextCycleExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyNextCycleExecutionVerifiedCount=5, got ${s.diagnosticsOnlyNextCycleExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationExecutionVerifiedCount !== 5) throw new Error(`Expected diagnosticsOnlyContinuationExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationExecutionVerifiedCount}`);
  if (s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount !== 5) {
    throw new Error(`Expected diagnosticsOnlyContinuationCompletionExecutionVerifiedCount=5, got ${s.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount}`);
  }
  if (s.postSixLeagueNextCycleContinuationCompletionCycleClosedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleClosedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitedCount=1");
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount=1");
  if (s.mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateCount=1");
  }

  [
    "postContinuationCompletionNextPlanningIsExecutionPermissionNowCount",
    "postContinuationCompletionNextPlanningIsFetchPermissionNowCount",
    "postContinuationCompletionNextPlanningIsSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningIsBroadSearchPermissionNowCount",
    "postContinuationCompletionNextPlanningIsClassifierPermissionNowCount",
    "postContinuationCompletionNextPlanningIsCanonicalWritePermissionNowCount",
    "postContinuationCompletionNextPlanningIsProductionWritePermissionNowCount",
    "postContinuationCompletionNextPlanningIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `planning.summary.${key}`));

  assertFalse(input.productionWrite, "planning.productionWrite");
  assertFalse(input.sourceFetch?.executed, "planning.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "planning.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "planning.broadSearchUsed");
  assertFalse(input.classifierExecuted, "planning.classifierExecuted");
}

function validateCycleExitVerification(input) {
  const s = input.summary || {};

  if (s.cycleExitVerificationRowCount !== 5) throw new Error(`Expected cycleExitVerificationRowCount=5, got ${s.cycleExitVerificationRowCount}`);
  if (s.verifiedContinuationCompletionCycleExitRowCount !== 5) throw new Error(`Expected verifiedContinuationCompletionCycleExitRowCount=5, got ${s.verifiedContinuationCompletionCycleExitRowCount}`);
  if (s.blockedContinuationCompletionCycleExitVerificationCount !== 0) throw new Error(`Expected blockedContinuationCompletionCycleExitVerificationCount=0, got ${s.blockedContinuationCompletionCycleExitVerificationCount}`);
  if (s.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount !== 1) throw new Error("Expected postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount=1");
  if (s.mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningArtifactCount=1");
  }

  [
    "cycleExitVerificationIsExecutionPermissionNowCount",
    "cycleExitVerificationIsFetchPermissionNowCount",
    "cycleExitVerificationIsSearchPermissionNowCount",
    "cycleExitVerificationIsBroadSearchPermissionNowCount",
    "cycleExitVerificationIsClassifierPermissionNowCount",
    "cycleExitVerificationIsCanonicalWritePermissionNowCount",
    "cycleExitVerificationIsProductionWritePermissionNowCount",
    "cycleExitVerificationIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `cycleExitVerification.summary.${key}`));

  assertFalse(input.productionWrite, "cycleExitVerification.productionWrite");
  assertFalse(input.sourceFetch?.executed, "cycleExitVerification.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "cycleExitVerification.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "cycleExitVerification.broadSearchUsed");
  assertFalse(input.classifierExecuted, "cycleExitVerification.classifierExecuted");
}

function validatePlanningRow(row) {
  const failures = [];

  if (!row.postSixLeaguePostContinuationCompletionNextPlanningRowId) failures.push("missing_post_continuation_completion_next_planning_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId) failures.push("missing_cycle_exit_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCycleExitRowId) failures.push("missing_cycle_exit_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId) failures.push("missing_closeout_verification_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionCloseoutRowId) failures.push("missing_closeout_row_id");
  if (!row.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId) failures.push("missing_completion_execution_verification_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");
  if (!row.nextCycleContinuationRouteFamily) failures.push("missing_next_cycle_continuation_route_family");
  if (!row.nextCycleContinuationCompletionRouteFamily) failures.push("missing_next_cycle_continuation_completion_route_family");
  if (!row.postContinuationCompletionNextPlanningLayer) failures.push("missing_post_continuation_completion_next_planning_layer");
  if (!row.postContinuationCompletionNextPlanningIntent) failures.push("missing_post_continuation_completion_next_planning_intent");

  if (row.postContinuationCompletionNextPlanningStatus !== "ready_for_post_six_league_post_continuation_completion_next_planning_quality_gate") {
    failures.push(`unexpected_next_planning_status:${row.postContinuationCompletionNextPlanningStatus}`);
  }

  if (row.mayBuildPostContinuationCompletionNextPlanningQualityGateForRow !== true) {
    failures.push("may_build_post_continuation_completion_next_planning_quality_gate_not_true");
  }

  [
    "postContinuationCompletionNextPlanningIsExecutionPermissionNow",
    "postContinuationCompletionNextPlanningIsFetchPermissionNow",
    "postContinuationCompletionNextPlanningIsSearchPermissionNow",
    "postContinuationCompletionNextPlanningIsBroadSearchPermissionNow",
    "postContinuationCompletionNextPlanningIsClassifierPermissionNow",
    "postContinuationCompletionNextPlanningIsCanonicalWritePermissionNow",
    "postContinuationCompletionNextPlanningIsProductionWritePermissionNow",
    "postContinuationCompletionNextPlanningIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`next_planning_guardrail_not_false:${key}`);
  });

  return failures;
}

const planning = readJson(planningPath);
const cycleExitVerification = readJson(cycleExitVerificationPath);

validatePlanning(planning);
validateCycleExitVerification(cycleExitVerification);

const planningRows = Array.isArray(planning.planningRows) ? planning.planningRows : [];
const cycleExitVerificationRows = Array.isArray(cycleExitVerification.cycleExitVerificationRows)
  ? cycleExitVerification.cycleExitVerificationRows
  : [];

if (planningRows.length !== 5) throw new Error(`Expected 5 post-continuation-completion planning rows, got ${planningRows.length}`);
if (cycleExitVerificationRows.length !== 5) throw new Error(`Expected 5 cycle-exit verification rows, got ${cycleExitVerificationRows.length}`);

const qualityGateRows = planningRows.map((row, index) => {
  const failures = validatePlanningRow(row);

  return {
    postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId: `post_six_league_post_continuation_completion_next_planning_quality_gate_${String(index + 1).padStart(2, "0")}`,
    postSixLeaguePostContinuationCompletionNextPlanningRowId: row.postSixLeaguePostContinuationCompletionNextPlanningRowId,
    postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionCycleExitVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionCycleExitRowId: row.postSixLeagueNextCycleContinuationCompletionCycleExitRowId,
    postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionCloseoutVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionCloseoutRowId: row.postSixLeagueNextCycleContinuationCompletionCloseoutRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionVerificationRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionRowId,
    postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId: row.postSixLeagueNextCycleContinuationCompletionExecutionApprovalRowId,
    postSixLeagueNextCycleContinuationCompletionRunnerTargetId: row.postSixLeagueNextCycleContinuationCompletionRunnerTargetId,
    postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId: row.postSixLeagueNextCycleContinuationCompletionActionPackQualityGateRowId,
    postSixLeagueNextCycleContinuationCompletionActionPackRowId: row.postSixLeagueNextCycleContinuationCompletionActionPackRowId,
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
    nextCycleContinuationCompletionActionPackLane: row.nextCycleContinuationCompletionActionPackLane,
    nextCycleContinuationCompletionRunnerGroup: row.nextCycleContinuationCompletionRunnerGroup,
    postContinuationCompletionNextPlanningLayer: row.postContinuationCompletionNextPlanningLayer,
    postContinuationCompletionNextPlanningIntent: row.postContinuationCompletionNextPlanningIntent,

    postContinuationCompletionNextPlanningQualityGateStatus:
      failures.length === 0
        ? "passed_ready_for_post_continuation_completion_next_planning_runner_manifest"
        : "blocked_from_post_continuation_completion_next_planning_runner_manifest",
    failures,
    mayBuildPostContinuationCompletionNextPlanningRunnerManifestForRow: failures.length === 0,

    postContinuationCompletionNextPlanningQualityGateIsExecutionPermissionNow: false,
    postContinuationCompletionNextPlanningQualityGateIsFetchPermissionNow: false,
    postContinuationCompletionNextPlanningQualityGateIsSearchPermissionNow: false,
    postContinuationCompletionNextPlanningQualityGateIsBroadSearchPermissionNow: false,
    postContinuationCompletionNextPlanningQualityGateIsClassifierPermissionNow: false,
    postContinuationCompletionNextPlanningQualityGateIsCanonicalWritePermissionNow: false,
    postContinuationCompletionNextPlanningQualityGateIsProductionWritePermissionNow: false,
    postContinuationCompletionNextPlanningQualityGateIsTruthAssertionPermissionNow: false
  };
});

const passedRows = qualityGateRows.filter(
  (row) => row.postContinuationCompletionNextPlanningQualityGateStatus === "passed_ready_for_post_continuation_completion_next_planning_runner_manifest"
);

const blockedRows = qualityGateRows.filter(
  (row) => row.postContinuationCompletionNextPlanningQualityGateStatus !== "passed_ready_for_post_continuation_completion_next_planning_runner_manifest"
);

const summary = {
  postSixLeagueFullMapPostContinuationCompletionNextPlanningQualityGateReadCount: 2,
  sourcePostContinuationCompletionNextPlanningRowCount: planningRows.length,
  sourceContinuationCompletionCycleExitVerificationRowCount: cycleExitVerificationRows.length,

  postContinuationCompletionNextPlanningQualityGateRowCount: qualityGateRows.length,
  passedPostContinuationCompletionNextPlanningQualityGateRowCount: passedRows.length,
  blockedPostContinuationCompletionNextPlanningQualityGateRowCount: blockedRows.length,

  mainLanePostContinuationCompletionNextPlanningQualityGatedCount: countWhere(
    passedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  repairBacklogPostContinuationCompletionNextPlanningQualityGatedCount: countWhere(
    passedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  sportomediaRepairPostContinuationCompletionNextPlanningQualityGatedCount: countWhere(
    passedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  postSixLeagueContinuationCompletionCycleClosedCount:
    planning.summary.postSixLeagueContinuationCompletionCycleClosedCount,

  diagnosticsOnlyNextCycleExecutionVerifiedCount:
    planning.summary.diagnosticsOnlyNextCycleExecutionVerifiedCount,

  diagnosticsOnlyContinuationExecutionVerifiedCount:
    planning.summary.diagnosticsOnlyContinuationExecutionVerifiedCount,

  diagnosticsOnlyContinuationCompletionExecutionVerifiedCount:
    planning.summary.diagnosticsOnlyContinuationCompletionExecutionVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleClosedCount:
    planning.summary.postSixLeagueNextCycleContinuationCompletionCycleClosedCount,

  postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount:
    planning.summary.postSixLeagueNextCycleContinuationCompletionCloseoutVerifiedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitedCount:
    planning.summary.postSixLeagueNextCycleContinuationCompletionCycleExitedCount,

  postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount:
    planning.summary.postSixLeagueNextCycleContinuationCompletionCycleExitVerifiedCount,

  mayBuildPostSixLeagueFullMapPostContinuationCompletionNextPlanningRunnerManifestCount:
    blockedRows.length === 0 ? 1 : 0,

  postContinuationCompletionNextPlanningQualityGateIsExecutionPermissionNowCount: 0,
  postContinuationCompletionNextPlanningQualityGateIsFetchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningQualityGateIsSearchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningQualityGateIsBroadSearchPermissionNowCount: 0,
  postContinuationCompletionNextPlanningQualityGateIsClassifierPermissionNowCount: 0,
  postContinuationCompletionNextPlanningQualityGateIsCanonicalWritePermissionNowCount: 0,
  postContinuationCompletionNextPlanningQualityGateIsProductionWritePermissionNowCount: 0,
  postContinuationCompletionNextPlanningQualityGateIsTruthAssertionPermissionNowCount: 0,

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
  job: "run-football-truth-post-six-league-full-map-post-continuation-completion-next-planning-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_post_continuation_completion_next_planning_quality_gate",
  dryRun: true,
  inputs: {
    postSixLeaguePostContinuationCompletionNextPlanningArtifact: planningPath,
    postSixLeagueNextCycleContinuationCompletionCycleExitVerification: cycleExitVerificationPath
  },
  policy: {
    postContinuationCompletionNextPlanningQualityGateOnly: true,
    nextPlanningRunnerManifestRequiredBeforeAnyExecution: true,
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
  throw new Error(`Post-continuation-completion next-planning quality gate blocked ${blockedRows.length} rows`);
}
