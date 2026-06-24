import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-quality-gate-2026-06-15",
  "post-six-league-full-map-materialization-quality-gate-2026-06-15.json"
);

const materializationPlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-plan-2026-06-15",
  "post-six-league-full-map-materialization-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-runner-manifest-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-materialization-runner-manifest-2026-06-15.json"
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

  if (s.sourceMaterializationPlanRowCount !== 5) throw new Error(`Expected sourceMaterializationPlanRowCount=5, got ${s.sourceMaterializationPlanRowCount}`);
  if (s.materializationQualityGateRowCount !== 5) throw new Error(`Expected materializationQualityGateRowCount=5, got ${s.materializationQualityGateRowCount}`);
  if (s.materializationQualityGatePassedCount !== 5) throw new Error(`Expected materializationQualityGatePassedCount=5, got ${s.materializationQualityGatePassedCount}`);
  if (s.materializationQualityGateBlockedCount !== 0) throw new Error(`Expected materializationQualityGateBlockedCount=0, got ${s.materializationQualityGateBlockedCount}`);
  if (s.mainLaneMaterializationQualityGatedCount !== 4) throw new Error(`Expected mainLaneMaterializationQualityGatedCount=4, got ${s.mainLaneMaterializationQualityGatedCount}`);
  if (s.repairBacklogMaterializationQualityGatedCount !== 1) throw new Error(`Expected repairBacklogMaterializationQualityGatedCount=1, got ${s.repairBacklogMaterializationQualityGatedCount}`);
  if (s.sportomediaProviderFamilyRepairMaterializationQualityGatedCount !== 1) throw new Error(`Expected sportomediaProviderFamilyRepairMaterializationQualityGatedCount=1, got ${s.sportomediaProviderFamilyRepairMaterializationQualityGatedCount}`);
  if (s.mayBuildPostSixLeagueFullMapMaterializationRunnerManifestCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapMaterializationRunnerManifestCount=1");

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

function validatePlan(input) {
  const s = input.summary || {};

  if (s.materializationPlanRowCount !== 5) throw new Error(`Expected materializationPlanRowCount=5, got ${s.materializationPlanRowCount}`);
  if (s.readyMaterializationPlanRowCount !== 5) throw new Error(`Expected readyMaterializationPlanRowCount=5, got ${s.readyMaterializationPlanRowCount}`);
  if (s.blockedMaterializationPlanRowCount !== 0) throw new Error(`Expected blockedMaterializationPlanRowCount=0, got ${s.blockedMaterializationPlanRowCount}`);
  if (s.sixLeagueBlockerClosedCount !== 1) throw new Error(`Expected sixLeagueBlockerClosedCount=1, got ${s.sixLeagueBlockerClosedCount}`);

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `plan.summary.${key}`));

  assertFalse(input.productionWrite, "plan.productionWrite");
  assertFalse(input.sourceFetch?.executed, "plan.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "plan.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "plan.broadSearchUsed");
  assertFalse(input.classifierExecuted, "plan.classifierExecuted");
}

const qualityGate = readJson(qualityGatePath);
const plan = readJson(materializationPlanPath);

validateQualityGate(qualityGate);
validatePlan(plan);

const qualityGateRows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];
const planRows = Array.isArray(plan.materializationPlanRows) ? plan.materializationPlanRows : [];

if (qualityGateRows.length !== 5) throw new Error(`Expected 5 quality gate rows, got ${qualityGateRows.length}`);
if (planRows.length !== 5) throw new Error(`Expected 5 plan rows, got ${planRows.length}`);

const planById = new Map(planRows.map((row) => [row.materializationPlanRowId, row]));

const runnerTargets = qualityGateRows.map((row, index) => {
  const sourcePlanRow = planById.get(row.materializationPlanRowId);
  if (!sourcePlanRow) throw new Error(`Missing source plan row for ${row.materializationPlanRowId}`);

  if (row.qualityGateStatus !== "passed_ready_for_materialization_runner_manifest") {
    throw new Error(`Cannot build manifest for non-passed row ${row.materializationQualityGateRowId}`);
  }

  return {
    runnerTargetId: `post_six_league_materialization_runner_target_${String(index + 1).padStart(2, "0")}`,
    materializationQualityGateRowId: row.materializationQualityGateRowId,
    materializationPlanRowId: row.materializationPlanRowId,
    sourceLane: row.sourceLane,
    materializationLane: row.materializationLane,
    materializationIntent: row.materializationIntent,
    providerFamily: row.providerFamily || sourcePlanRow.providerFamily || null,
    runnerTargetStatus: "ready_for_materialization_execution_approval_gate",
    executionGroup:
      row.isRepairBacklogLane === true
        ? "repair_backlog_materialization_group"
        : "main_lane_materialization_group",
    requiresExecutionApprovalGate: true,
    requiresExplicitAllowExecutionFlag: true,
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

const blockedRows = runnerTargets.filter((row) => row.runnerTargetStatus !== "ready_for_materialization_execution_approval_gate");

const summary = {
  postSixLeagueFullMapMaterializationRunnerManifestReadCount: 2,
  sourceQualityGateRowCount: qualityGateRows.length,
  sourceMaterializationPlanRowCount: planRows.length,

  runnerTargetCount: runnerTargets.length,
  mainLaneRunnerTargetCount: countWhere(runnerTargets, (row) => row.executionGroup === "main_lane_materialization_group"),
  repairBacklogRunnerTargetCount: countWhere(runnerTargets, (row) => row.executionGroup === "repair_backlog_materialization_group"),
  sportomediaRepairRunnerTargetCount: countWhere(
    runnerTargets,
    (row) => row.providerFamily === "sportomedia" && row.executionGroup === "repair_backlog_materialization_group"
  ),

  readyRunnerTargetCount: countWhere(
    runnerTargets,
    (row) => row.runnerTargetStatus === "ready_for_materialization_execution_approval_gate"
  ),
  blockedRunnerTargetCount: blockedRows.length,

  mayBuildPostSixLeagueFullMapMaterializationExecutionApprovalGateCount: blockedRows.length === 0 ? 1 : 0,

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
  job: "build-football-truth-post-six-league-full-map-materialization-runner-manifest-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_materialization_runner_manifest",
  dryRun: true,
  inputs: {
    postSixLeagueFullMapMaterializationQualityGate: qualityGatePath,
    postSixLeagueFullMapMaterializationPlan: materializationPlanPath
  },
  policy: {
    runnerManifestOnly: true,
    executionApprovalGateRequiredBeforeAnyMaterializationExecution: true,
    explicitAllowExecutionFlagRequiredForFutureRunner: true,
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
  throw new Error(`Materialization runner manifest blocked ${blockedRows.length} targets`);
}
