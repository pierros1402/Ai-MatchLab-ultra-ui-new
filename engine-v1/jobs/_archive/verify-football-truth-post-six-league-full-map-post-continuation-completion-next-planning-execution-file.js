import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const runnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-runner-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-runner-2026-06-15.json"
);

const approvalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-approval-gate-2026-06-15.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-next-planning-runner-manifest-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-verification-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-post-continuation-completion-next-planning-execution-verification-2026-06-15.json"
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

function validateRunner(input) {
  const s = input.summary || {};

  if (s.postSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionRunnerReadCount !== 3) throw new Error("Expected runner read count 3");
  if (s.allowExecuteFlagPresent !== true) throw new Error("Expected allowExecuteFlagPresent true");
  if (s.sourcePostContinuationCompletionNextPlanningExecutionApprovalRowCount !== 5) throw new Error("Expected source approval rows 5");
  if (s.sourcePostContinuationCompletionNextPlanningRunnerTargetCount !== 5) throw new Error("Expected source runner targets 5");
  if (s.postContinuationCompletionNextPlanningExecutionRowCount !== 5) throw new Error("Expected execution rows 5");
  if (s.executedPostContinuationCompletionNextPlanningTargetCount !== 5) throw new Error("Expected executed targets 5");
  if (s.mainLanePostContinuationCompletionNextPlanningExecutedCount !== 4) throw new Error("Expected executed main lane 4");
  if (s.repairBacklogPostContinuationCompletionNextPlanningExecutedCount !== 1) throw new Error("Expected executed repair backlog 1");
  if (s.sportomediaRepairPostContinuationCompletionNextPlanningExecutedCount !== 1) throw new Error("Expected executed sportomedia repair 1");
  if (s.diagnosticsOnlyPostContinuationCompletionNextPlanningExecutionTraceCount !== 5) throw new Error("Expected diagnostics-only execution trace count 5");
  if (s.mayVerifyPostSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionCount !== 1) throw new Error("Expected may verify execution count 1");

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `runner.summary.${key}`));

  assertFalse(input.productionWrite, "runner.productionWrite");
  assertFalse(input.sourceFetch?.executed, "runner.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "runner.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "runner.broadSearchUsed");
  assertFalse(input.classifierExecuted, "runner.classifierExecuted");
}

function validateApproval(input) {
  const s = input.summary || {};

  if (s.postContinuationCompletionNextPlanningExecutionApprovalRowCount !== 5) throw new Error("Expected approval rows 5");
  if (s.approvedPostContinuationCompletionNextPlanningExecutionApprovalRowCount !== 5) throw new Error("Expected approved rows 5");
  if (s.blockedPostContinuationCompletionNextPlanningExecutionApprovalRowCount !== 0) throw new Error("Expected blocked approval rows 0");
  if (s.nextRunnerMayExecutePostContinuationCompletionNextPlanningCount !== 5) throw new Error("Expected next runner may execute count 5");

  [
    "nextRunnerMayFetchCount",
    "nextRunnerMaySearchCount",
    "nextRunnerMayBroadSearchCount",
    "nextRunnerMayClassifyCount",
    "nextRunnerMayWriteCanonicalCount",
    "nextRunnerMayWriteProductionCount",
    "nextRunnerMayAssertTruthCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `approval.summary.${key}`));

  assertFalse(input.productionWrite, "approval.productionWrite");
  assertFalse(input.sourceFetch?.executed, "approval.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "approval.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "approval.broadSearchUsed");
  assertFalse(input.classifierExecuted, "approval.classifierExecuted");
}

function validateManifest(input) {
  const s = input.summary || {};

  if (s.postContinuationCompletionNextPlanningRunnerTargetCount !== 5) throw new Error("Expected manifest runner targets 5");
  if (s.readyPostContinuationCompletionNextPlanningRunnerTargetCount !== 5) throw new Error("Expected ready manifest targets 5");
  if (s.blockedPostContinuationCompletionNextPlanningRunnerTargetCount !== 0) throw new Error("Expected blocked manifest targets 0");

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `manifest.summary.${key}`));

  assertFalse(input.productionWrite, "manifest.productionWrite");
  assertFalse(input.sourceFetch?.executed, "manifest.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "manifest.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "manifest.broadSearchUsed");
  assertFalse(input.classifierExecuted, "manifest.classifierExecuted");
}

function validateExecutionRow(row) {
  const failures = [];

  if (!row.postSixLeaguePostContinuationCompletionNextPlanningExecutionRowId) failures.push("missing_execution_row_id");
  if (!row.postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId) failures.push("missing_execution_approval_row_id");
  if (!row.postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId) failures.push("missing_runner_target_id");
  if (!row.postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId) failures.push("missing_quality_gate_row_id");
  if (!row.postSixLeaguePostContinuationCompletionNextPlanningRowId) failures.push("missing_next_planning_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.nextCycleRouteFamily) failures.push("missing_next_cycle_route_family");

  if (row.executionStatus !== "post_continuation_completion_next_planning_target_executed_as_diagnostics_only_no_fetch_no_write") {
    failures.push(`unexpected_execution_status:${row.executionStatus}`);
  }

  if (row.materializedArtifactKind !== "diagnostics_only_post_continuation_completion_next_planning_execution_trace") {
    failures.push(`unexpected_materialized_artifact_kind:${row.materializedArtifactKind}`);
  }

  if (row.executionAllowedByExplicitFlag !== true) failures.push("missing_explicit_allow_execute_marker");

  [
    "fetchExecutedNow",
    "searchExecutedNow",
    "broadSearchExecutedNow",
    "classifierExecutedNow",
    "canonicalWriteExecutedNow",
    "productionWriteExecutedNow",
    "truthAssertionExecutedNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`side_effect_guardrail_not_false:${key}`);
  });

  return failures;
}

const runner = readJson(runnerPath);
const approval = readJson(approvalPath);
const manifest = readJson(manifestPath);

validateRunner(runner);
validateApproval(approval);
validateManifest(manifest);

const executionRows = Array.isArray(runner.executionRows) ? runner.executionRows : [];
const approvalRows = Array.isArray(approval.executionApprovalRows) ? approval.executionApprovalRows : [];
const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];

if (executionRows.length !== 5) throw new Error(`Expected 5 execution rows, got ${executionRows.length}`);
if (approvalRows.length !== 5) throw new Error(`Expected 5 approval rows, got ${approvalRows.length}`);
if (runnerTargets.length !== 5) throw new Error(`Expected 5 runner targets, got ${runnerTargets.length}`);

const verificationRows = executionRows.map((row, index) => {
  const failures = validateExecutionRow(row);

  return {
    postSixLeaguePostContinuationCompletionNextPlanningExecutionVerificationRowId: `post_six_league_post_continuation_completion_next_planning_execution_verification_${String(index + 1).padStart(2, "0")}`,
    postSixLeaguePostContinuationCompletionNextPlanningExecutionRowId: row.postSixLeaguePostContinuationCompletionNextPlanningExecutionRowId,
    postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId: row.postSixLeaguePostContinuationCompletionNextPlanningExecutionApprovalRowId,
    postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId: row.postSixLeaguePostContinuationCompletionNextPlanningRunnerTargetId,
    postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId: row.postSixLeaguePostContinuationCompletionNextPlanningQualityGateRowId,
    postSixLeaguePostContinuationCompletionNextPlanningRowId: row.postSixLeaguePostContinuationCompletionNextPlanningRowId,
    sourceLane: row.sourceLane,
    actionPackLane: row.actionPackLane,
    routeFamily: row.routeFamily,
    completionRouteFamily: row.completionRouteFamily,
    nextCycleRouteFamily: row.nextCycleRouteFamily,
    nextCycleContinuationRouteFamily: row.nextCycleContinuationRouteFamily,
    nextCycleContinuationCompletionRouteFamily: row.nextCycleContinuationCompletionRouteFamily,
    providerFamily: row.providerFamily || null,
    executionGroup: row.executionGroup || null,
    postContinuationCompletionNextPlanningLayer: row.postContinuationCompletionNextPlanningLayer,
    postContinuationCompletionNextPlanningIntent: row.postContinuationCompletionNextPlanningIntent,
    postContinuationCompletionNextPlanningRunnerGroup: row.postContinuationCompletionNextPlanningRunnerGroup,

    verificationStatus:
      failures.length === 0
        ? "verified_diagnostics_only_post_continuation_completion_next_planning_execution"
        : "blocked_post_continuation_completion_next_planning_execution_verification",
    failures,
    noFetchVerified: row.fetchExecutedNow === false,
    noSearchVerified: row.searchExecutedNow === false,
    noBroadSearchVerified: row.broadSearchExecutedNow === false,
    noClassifierVerified: row.classifierExecutedNow === false,
    noCanonicalWriteVerified: row.canonicalWriteExecutedNow === false,
    noProductionWriteVerified: row.productionWriteExecutedNow === false,
    noTruthAssertionVerified: row.truthAssertionExecutedNow === false
  };
});

const verifiedRows = verificationRows.filter(
  (row) => row.verificationStatus === "verified_diagnostics_only_post_continuation_completion_next_planning_execution"
);

const blockedRows = verificationRows.filter(
  (row) => row.verificationStatus !== "verified_diagnostics_only_post_continuation_completion_next_planning_execution"
);

const summary = {
  postSixLeagueFullMapPostContinuationCompletionNextPlanningExecutionVerificationReadCount: 3,
  sourcePostContinuationCompletionNextPlanningExecutionRowCount: executionRows.length,
  sourcePostContinuationCompletionNextPlanningExecutionApprovalRowCount: approvalRows.length,
  sourcePostContinuationCompletionNextPlanningRunnerTargetCount: runnerTargets.length,

  postContinuationCompletionNextPlanningExecutionVerificationRowCount: verificationRows.length,
  verifiedPostContinuationCompletionNextPlanningExecutionRowCount: verifiedRows.length,
  blockedPostContinuationCompletionNextPlanningExecutionVerificationCount: blockedRows.length,

  verifiedMainLanePostContinuationCompletionNextPlanningExecutionCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "whole_map_main_lane_next_cycle"
  ),
  verifiedRepairBacklogPostContinuationCompletionNextPlanningExecutionCount: countWhere(
    verifiedRows,
    (row) => row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),
  verifiedSportomediaRepairPostContinuationCompletionNextPlanningExecutionCount: countWhere(
    verifiedRows,
    (row) => row.providerFamily === "sportomedia" && row.nextCycleRouteFamily === "repair_backlog_next_cycle"
  ),

  diagnosticsOnlyPostContinuationCompletionNextPlanningExecutionVerifiedCount: verifiedRows.length,
  mayBuildPostSixLeagueFullMapPostContinuationCompletionImpactProofBoardCount:
    blockedRows.length === 0 ? 1 : 0,

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
  job: "verify-football-truth-post-six-league-full-map-post-continuation-completion-next-planning-execution-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_continuation_completion_next_planning_execution_verification",
  dryRun: true,
  inputs: {
    postContinuationCompletionNextPlanningExecutionRunner: runnerPath,
    postContinuationCompletionNextPlanningExecutionApprovalGate: approvalPath,
    postContinuationCompletionNextPlanningRunnerManifest: manifestPath
  },
  policy: {
    verificationOnly: true,
    nextStepMustBeImpactProofBoardBeforeMoreDiagnosticsLooping: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  verificationRows,
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
  throw new Error(`Post-continuation-completion next-planning execution verification blocked ${blockedRows.length} rows`);
}
