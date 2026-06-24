import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-runner-manifest-2026-06-15",
  "post-six-league-full-map-continuation-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-action-pack-quality-gate-2026-06-15",
  "post-six-league-full-map-continuation-action-pack-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-continuation-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-continuation-execution-approval-gate-2026-06-15.json"
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

function validateManifest(input) {
  const s = input.summary || {};

  if (s.continuationRunnerTargetCount !== 5) throw new Error(`Expected continuationRunnerTargetCount=5, got ${s.continuationRunnerTargetCount}`);
  if (s.readyContinuationRunnerTargetCount !== 5) throw new Error(`Expected readyContinuationRunnerTargetCount=5, got ${s.readyContinuationRunnerTargetCount}`);
  if (s.blockedContinuationRunnerTargetCount !== 0) throw new Error(`Expected blockedContinuationRunnerTargetCount=0, got ${s.blockedContinuationRunnerTargetCount}`);
  if (s.mainLaneContinuationRunnerTargetCount !== 4) throw new Error(`Expected mainLaneContinuationRunnerTargetCount=4, got ${s.mainLaneContinuationRunnerTargetCount}`);
  if (s.repairBacklogContinuationRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogContinuationRunnerTargetCount=1, got ${s.repairBacklogContinuationRunnerTargetCount}`);
  if (s.sportomediaRepairContinuationRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairContinuationRunnerTargetCount=1, got ${s.sportomediaRepairContinuationRunnerTargetCount}`);
  if (s.mayBuildPostSixLeagueFullMapContinuationExecutionApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationExecutionApprovalGateCount=1");
  }

  [
    "runnerManifestIsExecutionPermissionNowCount",
    "runnerManifestIsFetchPermissionNowCount",
    "runnerManifestIsSearchPermissionNowCount",
    "runnerManifestIsBroadSearchPermissionNowCount",
    "runnerManifestIsClassifierPermissionNowCount",
    "runnerManifestIsCanonicalWritePermissionNowCount",
    "runnerManifestIsProductionWritePermissionNowCount",
    "runnerManifestIsTruthAssertionPermissionNowCount",
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

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.continuationActionPackQualityGatePassedCount !== 5) {
    throw new Error(`Expected continuationActionPackQualityGatePassedCount=5, got ${s.continuationActionPackQualityGatePassedCount}`);
  }

  if (s.continuationActionPackQualityGateBlockedCount !== 0) {
    throw new Error(`Expected continuationActionPackQualityGateBlockedCount=0, got ${s.continuationActionPackQualityGateBlockedCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapContinuationRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapContinuationRunnerManifestCount=1");
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
  ].forEach((key) => assertZero(s[key], `qualityGate.summary.${key}`));

  assertFalse(input.productionWrite, "qualityGate.productionWrite");
}

function validateRunnerTarget(target) {
  const failures = [];

  if (!target.continuationRunnerTargetId) failures.push("missing_continuation_runner_target_id");
  if (!target.continuationActionPackQualityGateRowId) failures.push("missing_quality_gate_row_id");
  if (!target.continuationActionPackRowId) failures.push("missing_action_pack_row_id");
  if (!target.sourceContinuationRoutingRowId) failures.push("missing_source_continuation_routing_row_id");
  if (!target.sourceVerificationRowId) failures.push("missing_source_verification_row_id");
  if (!target.sourceLane) failures.push("missing_source_lane");
  if (!target.actionPackLane) failures.push("missing_action_pack_lane");
  if (!target.routeFamily) failures.push("missing_route_family");
  if (!target.continuationRunnerGroup) failures.push("missing_continuation_runner_group");

  if (target.runnerTargetStatus !== "ready_for_continuation_execution_approval_gate") {
    failures.push(`unexpected_runner_target_status:${target.runnerTargetStatus}`);
  }

  if (target.requiresExecutionApprovalGate !== true) failures.push("execution_approval_gate_not_required");
  if (target.requiresExplicitAllowExecuteFlag !== true) failures.push("explicit_allow_execute_flag_not_required");

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
    if (target[key] !== false) failures.push(`runner_target_guardrail_not_false:${key}`);
  });

  return failures;
}

const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateManifest(manifest);
validateQualityGate(qualityGate);

const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];
if (runnerTargets.length !== 5) {
  throw new Error(`Expected 5 continuation runner targets, got ${runnerTargets.length}`);
}

const approvalRows = runnerTargets.map((target, index) => {
  const failures = validateRunnerTarget(target);

  return {
    continuationExecutionApprovalRowId: `post_six_league_continuation_execution_approval_${String(index + 1).padStart(2, "0")}`,
    continuationRunnerTargetId: target.continuationRunnerTargetId,
    continuationActionPackQualityGateRowId: target.continuationActionPackQualityGateRowId,
    continuationActionPackRowId: target.continuationActionPackRowId,
    sourceContinuationRoutingRowId: target.sourceContinuationRoutingRowId,
    sourceVerificationRowId: target.sourceVerificationRowId,
    sourceLane: target.sourceLane,
    actionPackLane: target.actionPackLane,
    routeFamily: target.routeFamily,
    providerFamily: target.providerFamily || null,
    executionGroup: target.executionGroup || null,
    continuationRunnerGroup: target.continuationRunnerGroup,
    approvalStatus:
      failures.length === 0
        ? "approved_to_build_continuation_execution_runner"
        : "blocked_from_continuation_execution_runner",
    failures,
    mayBuildContinuationExecutionRunnerForTarget: failures.length === 0,
    nextRunnerRequiresExplicitAllowExecuteFlag: true,

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,
    approvalIsSearchPermissionNow: false,
    approvalIsBroadSearchPermissionNow: false,
    approvalIsClassifierPermissionNow: false,
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsProductionWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false,

    nextRunnerMayExecuteContinuation: failures.length === 0,
    nextRunnerMayFetch: false,
    nextRunnerMaySearch: false,
    nextRunnerMayBroadSearch: false,
    nextRunnerMayClassify: false,
    nextRunnerMayWriteCanonical: false,
    nextRunnerMayWriteProduction: false,
    nextRunnerMayAssertTruth: false
  };
});

const approvedRows = approvalRows.filter((row) => row.approvalStatus === "approved_to_build_continuation_execution_runner");
const blockedRows = approvalRows.filter((row) => row.approvalStatus !== "approved_to_build_continuation_execution_runner");

const summary = {
  postSixLeagueFullMapContinuationExecutionApprovalGateReadCount: 2,
  sourceContinuationRunnerTargetCount: runnerTargets.length,
  sourceContinuationActionPackQualityGateRowCount: (qualityGate.qualityGateRows || []).length,

  continuationExecutionApprovalRowCount: approvalRows.length,
  approvedContinuationExecutionApprovalRowCount: approvedRows.length,
  blockedContinuationExecutionApprovalRowCount: blockedRows.length,

  approvedMainLaneContinuationExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.routeFamily === "whole_map_main_lane_continuation"
  ),
  approvedRepairBacklogContinuationExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.routeFamily === "repair_backlog_continuation"
  ),
  approvedSportomediaRepairContinuationExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "sportomedia" && row.routeFamily === "repair_backlog_continuation"
  ),

  mayBuildPostSixLeagueFullMapContinuationExecutionRunnerCount: blockedRows.length === 0 ? 1 : 0,

  executionApprovalIsExecutionPermissionNowCount: 0,
  executionApprovalIsFetchPermissionNowCount: 0,
  executionApprovalIsSearchPermissionNowCount: 0,
  executionApprovalIsBroadSearchPermissionNowCount: 0,
  executionApprovalIsClassifierPermissionNowCount: 0,
  executionApprovalIsCanonicalWritePermissionNowCount: 0,
  executionApprovalIsProductionWritePermissionNowCount: 0,
  executionApprovalIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayExecuteContinuationCount: approvedRows.length,
  nextRunnerMayFetchCount: 0,
  nextRunnerMaySearchCount: 0,
  nextRunnerMayBroadSearchCount: 0,
  nextRunnerMayClassifyCount: 0,
  nextRunnerMayWriteCanonicalCount: 0,
  nextRunnerMayWriteProductionCount: 0,
  nextRunnerMayAssertTruthCount: 0,

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
  job: "run-football-truth-post-six-league-full-map-continuation-execution-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_continuation_execution_approval_gate",
  dryRun: true,
  inputs: {
    postSixLeagueContinuationRunnerManifest: manifestPath,
    postSixLeagueContinuationActionPackQualityGate: qualityGatePath
  },
  policy: {
    executionApprovalGateOnly: true,
    approvalDoesNotExecuteContinuation: true,
    nextRunnerMustRequireExplicitAllowExecuteFlag: true,
    nextRunnerMustRemainNoFetchNoSearchNoWriteUnlessSeparatelyApproved: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  approvalRows,
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
  throw new Error(`Continuation execution approval gate blocked ${blockedRows.length} targets`);
}
