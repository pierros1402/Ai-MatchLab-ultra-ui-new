import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-runner-manifest-2026-06-15",
  "post-six-league-full-map-materialization-runner-manifest-2026-06-15.json"
);

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-quality-gate-2026-06-15",
  "post-six-league-full-map-materialization-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-materialization-execution-approval-gate-2026-06-15.json"
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

function validateManifest(input) {
  const s = input.summary || {};

  if (s.runnerTargetCount !== 5) throw new Error(`Expected runnerTargetCount=5, got ${s.runnerTargetCount}`);
  if (s.mainLaneRunnerTargetCount !== 4) throw new Error(`Expected mainLaneRunnerTargetCount=4, got ${s.mainLaneRunnerTargetCount}`);
  if (s.repairBacklogRunnerTargetCount !== 1) throw new Error(`Expected repairBacklogRunnerTargetCount=1, got ${s.repairBacklogRunnerTargetCount}`);
  if (s.sportomediaRepairRunnerTargetCount !== 1) throw new Error(`Expected sportomediaRepairRunnerTargetCount=1, got ${s.sportomediaRepairRunnerTargetCount}`);
  if (s.readyRunnerTargetCount !== 5) throw new Error(`Expected readyRunnerTargetCount=5, got ${s.readyRunnerTargetCount}`);
  if (s.blockedRunnerTargetCount !== 0) throw new Error(`Expected blockedRunnerTargetCount=0, got ${s.blockedRunnerTargetCount}`);
  if (s.mayBuildPostSixLeagueFullMapMaterializationExecutionApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapMaterializationExecutionApprovalGateCount=1");
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

  if (s.materializationQualityGatePassedCount !== 5) throw new Error(`Expected materializationQualityGatePassedCount=5, got ${s.materializationQualityGatePassedCount}`);
  if (s.materializationQualityGateBlockedCount !== 0) throw new Error(`Expected materializationQualityGateBlockedCount=0, got ${s.materializationQualityGateBlockedCount}`);
  if (s.mayBuildPostSixLeagueFullMapMaterializationRunnerManifestCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapMaterializationRunnerManifestCount=1");
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
  assertFalse(input.sourceFetch?.executed, "qualityGate.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "qualityGate.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "qualityGate.broadSearchUsed");
  assertFalse(input.classifierExecuted, "qualityGate.classifierExecuted");
}

function validateRunnerTarget(row) {
  const failures = [];

  if (!row.runnerTargetId) failures.push("missing_runner_target_id");
  if (!row.materializationQualityGateRowId) failures.push("missing_materialization_quality_gate_row_id");
  if (!row.materializationPlanRowId) failures.push("missing_materialization_plan_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.materializationLane) failures.push("missing_materialization_lane");
  if (!row.materializationIntent) failures.push("missing_materialization_intent");
  if (!row.executionGroup) failures.push("missing_execution_group");

  if (row.runnerTargetStatus !== "ready_for_materialization_execution_approval_gate") {
    failures.push(`unexpected_runner_target_status:${row.runnerTargetStatus}`);
  }

  if (row.requiresExecutionApprovalGate !== true) {
    failures.push("execution_approval_gate_not_required");
  }

  if (row.requiresExplicitAllowExecutionFlag !== true) {
    failures.push("explicit_allow_execution_flag_not_required");
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
    if (row[key] !== false) failures.push(`runner_manifest_guardrail_not_false:${key}`);
  });

  return failures;
}

const manifest = readJson(manifestPath);
const qualityGate = readJson(qualityGatePath);

validateManifest(manifest);
validateQualityGate(qualityGate);

const runnerTargets = Array.isArray(manifest.runnerTargets) ? manifest.runnerTargets : [];
if (runnerTargets.length !== 5) {
  throw new Error(`Expected 5 runner targets, got ${runnerTargets.length}`);
}

const approvalRows = runnerTargets.map((target, index) => {
  const failures = validateRunnerTarget(target);

  return {
    materializationExecutionApprovalRowId: `post_six_league_materialization_execution_approval_${String(index + 1).padStart(2, "0")}`,
    runnerTargetId: target.runnerTargetId,
    materializationQualityGateRowId: target.materializationQualityGateRowId,
    materializationPlanRowId: target.materializationPlanRowId,
    sourceLane: target.sourceLane,
    materializationLane: target.materializationLane,
    materializationIntent: target.materializationIntent,
    providerFamily: target.providerFamily || null,
    executionGroup: target.executionGroup,
    approvalStatus:
      failures.length === 0
        ? "approved_to_build_materialization_execution_runner"
        : "blocked_from_materialization_execution_runner",
    failures,
    mayBuildExecutionRunnerForTarget: failures.length === 0,
    nextRunnerRequiresExplicitAllowExecutionFlag: true,

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,
    approvalIsSearchPermissionNow: false,
    approvalIsBroadSearchPermissionNow: false,
    approvalIsClassifierPermissionNow: false,
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsProductionWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false,

    nextRunnerMayExecuteMaterialization: failures.length === 0,
    nextRunnerMayFetch: false,
    nextRunnerMaySearch: false,
    nextRunnerMayBroadSearch: false,
    nextRunnerMayClassify: false,
    nextRunnerMayWriteCanonical: false,
    nextRunnerMayWriteProduction: false,
    nextRunnerMayAssertTruth: false
  };
});

const approvedRows = approvalRows.filter((row) => row.failures.length === 0);
const blockedRows = approvalRows.filter((row) => row.failures.length > 0);

const summary = {
  postSixLeagueFullMapMaterializationExecutionApprovalGateReadCount: 2,
  sourceRunnerTargetCount: runnerTargets.length,
  sourceQualityGateRowCount: (qualityGate.qualityGateRows || []).length,

  executionApprovalRowCount: approvalRows.length,
  approvedExecutionApprovalRowCount: approvedRows.length,
  blockedExecutionApprovalRowCount: blockedRows.length,

  approvedMainLaneExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.executionGroup === "main_lane_materialization_group"
  ),
  approvedRepairBacklogExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.executionGroup === "repair_backlog_materialization_group"
  ),
  approvedSportomediaRepairExecutionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "sportomedia" && row.executionGroup === "repair_backlog_materialization_group"
  ),

  mayBuildPostSixLeagueFullMapMaterializationExecutionRunnerCount: blockedRows.length === 0 ? 1 : 0,

  executionApprovalIsExecutionPermissionNowCount: 0,
  executionApprovalIsFetchPermissionNowCount: 0,
  executionApprovalIsSearchPermissionNowCount: 0,
  executionApprovalIsBroadSearchPermissionNowCount: 0,
  executionApprovalIsClassifierPermissionNowCount: 0,
  executionApprovalIsCanonicalWritePermissionNowCount: 0,
  executionApprovalIsProductionWritePermissionNowCount: 0,
  executionApprovalIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayExecuteMaterializationCount: approvedRows.length,
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
  job: "run-football-truth-post-six-league-full-map-materialization-execution-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_materialization_execution_approval_gate",
  dryRun: true,
  inputs: {
    postSixLeagueMaterializationRunnerManifest: manifestPath,
    postSixLeagueMaterializationQualityGate: qualityGatePath
  },
  policy: {
    executionApprovalGateOnly: true,
    approvalDoesNotExecuteMaterialization: true,
    nextRunnerMustRequireExplicitAllowExecutionFlag: true,
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
  throw new Error(`Materialization execution approval gate blocked ${blockedRows.length} targets`);
}
