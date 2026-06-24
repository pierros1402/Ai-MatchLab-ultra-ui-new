import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
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
  "post-six-league-full-map-materialization-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-materialization-quality-gate-2026-06-15.json"
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

function validateMaterializationPlan(input) {
  const s = input.summary || {};

  if (s.materializationPlanRowCount !== 5) {
    throw new Error(`Expected materializationPlanRowCount=5, got ${s.materializationPlanRowCount}`);
  }

  if (s.mainLaneMaterializationPlanRowCount !== 4) {
    throw new Error(`Expected mainLaneMaterializationPlanRowCount=4, got ${s.mainLaneMaterializationPlanRowCount}`);
  }

  if (s.repairBacklogMaterializationPlanRowCount !== 1) {
    throw new Error(`Expected repairBacklogMaterializationPlanRowCount=1, got ${s.repairBacklogMaterializationPlanRowCount}`);
  }

  if (s.sportomediaProviderFamilyRepairMaterializationPlanRowCount !== 1) {
    throw new Error(`Expected sportomediaProviderFamilyRepairMaterializationPlanRowCount=1, got ${s.sportomediaProviderFamilyRepairMaterializationPlanRowCount}`);
  }

  if (s.readyMaterializationPlanRowCount !== 5) {
    throw new Error(`Expected readyMaterializationPlanRowCount=5, got ${s.readyMaterializationPlanRowCount}`);
  }

  if (s.blockedMaterializationPlanRowCount !== 0) {
    throw new Error(`Expected blockedMaterializationPlanRowCount=0, got ${s.blockedMaterializationPlanRowCount}`);
  }

  if (s.mayBuildPostSixLeagueFullMapMaterializationQualityGateCount !== 1) {
    throw new Error("Expected mayBuildPostSixLeagueFullMapMaterializationQualityGateCount=1");
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

  [
    "materializationPlanIsExecutionPermissionNowCount",
    "materializationPlanIsFetchPermissionNowCount",
    "materializationPlanIsSearchPermissionNowCount",
    "materializationPlanIsBroadSearchPermissionNowCount",
    "materializationPlanIsClassifierPermissionNowCount",
    "materializationPlanIsCanonicalWritePermissionNowCount",
    "materializationPlanIsProductionWritePermissionNowCount",
    "materializationPlanIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `materializationPlan.summary.${key}`));

  assertFalse(input.productionWrite, "materializationPlan.productionWrite");
  assertFalse(input.sourceFetch?.executed, "materializationPlan.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "materializationPlan.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "materializationPlan.broadSearchUsed");
  assertFalse(input.classifierExecuted, "materializationPlan.classifierExecuted");
}

function validatePlanRow(row) {
  const failures = [];

  if (!row.materializationPlanRowId) failures.push("missing_materialization_plan_row_id");
  if (!row.sourceLane) failures.push("missing_source_lane");
  if (!row.materializationLane) failures.push("missing_materialization_lane");
  if (!row.materializationIntent) failures.push("missing_materialization_intent");
  if (row.requiredBlockerState !== "six_league_blocker_verified_closed") failures.push("six_league_blocker_not_required_closed");
  if (row.planStatus !== "ready_for_materialization_quality_gate") failures.push(`unexpected_plan_status:${row.planStatus}`);

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
    if (row[key] !== false) failures.push(`guardrail_not_false:${key}`);
  });

  return failures;
}

const input = readJson(inputPath);
validateMaterializationPlan(input);

const planRows = Array.isArray(input.materializationPlanRows) ? input.materializationPlanRows : [];
if (planRows.length !== 5) {
  throw new Error(`Expected 5 materialization plan rows, got ${planRows.length}`);
}

const qualityGateRows = planRows.map((row, index) => {
  const failures = validatePlanRow(row);

  return {
    materializationQualityGateRowId: `post_six_league_materialization_quality_gate_${String(index + 1).padStart(2, "0")}`,
    materializationPlanRowId: row.materializationPlanRowId,
    sourceLane: row.sourceLane,
    materializationLane: row.materializationLane,
    materializationIntent: row.materializationIntent,
    providerFamily: row.providerFamily || null,
    isMainLane: row.isMainLane === true,
    isRepairBacklogLane: row.isRepairBacklogLane === true,
    qualityGateStatus:
      failures.length === 0
        ? "passed_ready_for_materialization_runner_manifest"
        : "blocked_from_materialization_runner_manifest",
    failures,
    mayBuildRunnerManifestForRow: failures.length === 0,
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

const passedRows = qualityGateRows.filter((row) => row.failures.length === 0);
const blockedRows = qualityGateRows.filter((row) => row.failures.length > 0);

const summary = {
  postSixLeagueFullMapMaterializationQualityGateReadCount: 1,
  sourceMaterializationPlanRowCount: planRows.length,
  materializationQualityGateRowCount: qualityGateRows.length,
  materializationQualityGatePassedCount: passedRows.length,
  materializationQualityGateBlockedCount: blockedRows.length,

  mainLaneMaterializationQualityGatedCount: countWhere(passedRows, (row) => row.isMainLane),
  repairBacklogMaterializationQualityGatedCount: countWhere(passedRows, (row) => row.isRepairBacklogLane),
  sportomediaProviderFamilyRepairMaterializationQualityGatedCount: countWhere(
    passedRows,
    (row) => row.providerFamily === "sportomedia"
  ),

  wholeMapMainLaneResumedMaterializationQualityGatedCount: countWhere(
    passedRows,
    (row) => row.materializationLane === "whole_map_main_lane_resumed"
  ),

  mayBuildPostSixLeagueFullMapMaterializationRunnerManifestCount: blockedRows.length === 0 ? 1 : 0,

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
  job: "run-football-truth-post-six-league-full-map-materialization-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_full_map_materialization_quality_gate",
  dryRun: true,
  inputs: {
    postSixLeagueFullMapMaterializationPlan: inputPath
  },
  policy: {
    qualityGateOnly: true,
    qualityGateDoesNotExecuteMaterialization: true,
    runnerManifestRequiredBeforeAnyExecution: true,
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
  throw new Error(`Materialization quality gate blocked ${blockedRows.length} rows`);
}
