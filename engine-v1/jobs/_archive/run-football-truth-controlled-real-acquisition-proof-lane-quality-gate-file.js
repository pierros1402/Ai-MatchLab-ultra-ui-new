import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const planPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-proof-lane-plan-2026-06-15",
  "controlled-real-acquisition-proof-lane-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-proof-lane-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "controlled-real-acquisition-proof-lane-quality-gate-2026-06-15.json"
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

function validatePlan(input) {
  const s = input.summary || {};

  if (s.controlledRealAcquisitionProofLanePlanReadCount !== 1) throw new Error("Expected plan read count 1");
  if (s.impactBoardProvenPipelineValueProofRowCount !== 5) throw new Error("Expected proven pipeline proof rows 5");
  if (s.impactBoardLatestChainRealCoverageImpactStartedCount !== 0) throw new Error("Expected latest real coverage impact started 0");
  if (s.impactBoardLatestChainRealSideEffectCount !== 0) throw new Error("Expected latest real side effect count 0");

  if (s.proofTargetRowCount !== 6) throw new Error(`Expected proofTargetRowCount=6, got ${s.proofTargetRowCount}`);
  if (s.proofLaneRowCount !== 3) throw new Error(`Expected proofLaneRowCount=3, got ${s.proofLaneRowCount}`);
  if (s.successCriteriaRowCount !== 5) throw new Error(`Expected successCriteriaRowCount=5, got ${s.successCriteriaRowCount}`);
  if (s.nextGateRowCount !== 2) throw new Error(`Expected nextGateRowCount=2, got ${s.nextGateRowCount}`);

  if (s.mainLaneProofTargetCount !== 4) throw new Error(`Expected mainLaneProofTargetCount=4, got ${s.mainLaneProofTargetCount}`);
  if (s.repairBacklogProofTargetCount !== 2) throw new Error(`Expected repairBacklogProofTargetCount=2, got ${s.repairBacklogProofTargetCount}`);
  if (s.laligaProofTargetCount !== 2) throw new Error(`Expected laligaProofTargetCount=2, got ${s.laligaProofTargetCount}`);
  if (s.norwayNtfProofTargetCount !== 2) throw new Error(`Expected norwayNtfProofTargetCount=2, got ${s.norwayNtfProofTargetCount}`);
  if (s.sportomediaProofTargetCount !== 2) throw new Error(`Expected sportomediaProofTargetCount=2, got ${s.sportomediaProofTargetCount}`);

  if (s.mayBuildControlledRealAcquisitionProofLaneQualityGateCount !== 1) {
    throw new Error("Expected mayBuildControlledRealAcquisitionProofLaneQualityGateCount=1");
  }

  [
    "currentRunProofLaneFetchAllowedCount",
    "currentRunProofLaneSearchAllowedCount",
    "currentRunProofLaneBroadSearchAllowedCount",
    "currentRunProofLaneClassifierAllowedCount",
    "currentRunProofLaneCanonicalWriteAllowedCount",
    "currentRunProofLaneProductionWriteAllowedCount",
    "currentRunProofLaneTruthAssertionAllowedCount",
    "mayExecuteControlledRealAcquisitionNowCount",
    "mayFetchControlledRealAcquisitionNowCount",
    "maySearchControlledRealAcquisitionNowCount",
    "mayClassifyControlledRealAcquisitionNowCount",
    "mayWriteCanonicalControlledRealAcquisitionNowCount",
    "mayWriteProductionControlledRealAcquisitionNowCount",
    "mayAssertTruthControlledRealAcquisitionNowCount",
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

function validateTarget(row) {
  const failures = [];

  if (!row.controlledRealAcquisitionProofTargetId) failures.push("missing_proof_target_id");
  if (!row.competitionSlug) failures.push("missing_competition_slug");
  if (!row.providerFamily) failures.push("missing_provider_family");
  if (!row.targetRole) failures.push("missing_target_role");
  if (!row.proofIntent) failures.push("missing_proof_intent");
  if (row.initialPermissionMode !== "future_explicit_controlled_fetch_only_after_approval") {
    failures.push(`unexpected_initial_permission_mode:${row.initialPermissionMode}`);
  }

  if (!["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"].includes(row.competitionSlug)) {
    failures.push(`unexpected_competition_slug:${row.competitionSlug}`);
  }

  if (!["laliga", "norway_ntf", "sportomedia"].includes(row.providerFamily)) {
    failures.push(`unexpected_provider_family:${row.providerFamily}`);
  }

  [
    "allowFetchNow",
    "allowSearchNow",
    "allowBroadSearchNow",
    "allowClassifyNow",
    "allowCanonicalWriteNow",
    "allowProductionWriteNow",
    "allowTruthAssertionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`current_run_permission_not_false:${key}`);
  });

  return failures;
}

function validateLane(row) {
  const failures = [];

  if (!row.controlledRealAcquisitionProofLaneId) failures.push("missing_proof_lane_id");
  if (!row.laneName) failures.push("missing_lane_name");
  if (!row.laneStatus) failures.push("missing_lane_status");
  if (!row.purpose) failures.push("missing_purpose");
  if (!row.successMetric) failures.push("missing_success_metric");
  if (!row.nextRequiredGate) failures.push("missing_next_required_gate");

  if (!String(row.laneStatus).startsWith("planned_requires_")) {
    failures.push(`unexpected_lane_status:${row.laneStatus}`);
  }

  if (row.nextRequiredGate !== "controlled_real_acquisition_proof_lane_quality_gate") {
    failures.push(`unexpected_next_required_gate:${row.nextRequiredGate}`);
  }

  [
    "currentRunFetchAllowed",
    "currentRunSearchAllowed",
    "currentRunClassifierAllowed",
    "currentRunCanonicalWriteAllowed",
    "currentRunProductionWriteAllowed",
    "currentRunTruthAssertionAllowed"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`lane_current_run_permission_not_false:${key}`);
  });

  return failures;
}

function validateSuccessCriterion(row) {
  const failures = [];

  if (!row.successCriterionId) failures.push("missing_success_criterion_id");
  if (!row.criterion) failures.push("missing_criterion");
  if (!row.expectedMeasurement) failures.push("missing_expected_measurement");
  if (row.requiredForSuccess !== true) failures.push("required_for_success_not_true");

  return failures;
}

const plan = readJson(planPath);
validatePlan(plan);

const proofTargetRows = Array.isArray(plan.proofTargetRows) ? plan.proofTargetRows : [];
const proofLaneRows = Array.isArray(plan.proofLaneRows) ? plan.proofLaneRows : [];
const successCriteriaRows = Array.isArray(plan.successCriteriaRows) ? plan.successCriteriaRows : [];
const nextGateRows = Array.isArray(plan.nextGateRows) ? plan.nextGateRows : [];

if (proofTargetRows.length !== 6) throw new Error(`Expected 6 proof target rows, got ${proofTargetRows.length}`);
if (proofLaneRows.length !== 3) throw new Error(`Expected 3 proof lane rows, got ${proofLaneRows.length}`);
if (successCriteriaRows.length !== 5) throw new Error(`Expected 5 success criteria rows, got ${successCriteriaRows.length}`);
if (nextGateRows.length !== 2) throw new Error(`Expected 2 next gate rows, got ${nextGateRows.length}`);

const targetQualityGateRows = proofTargetRows.map((row, index) => {
  const failures = validateTarget(row);

  return {
    controlledRealAcquisitionProofTargetQualityGateRowId: `controlled_real_acquisition_proof_target_quality_gate_${String(index + 1).padStart(2, "0")}`,
    controlledRealAcquisitionProofTargetId: row.controlledRealAcquisitionProofTargetId,
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    targetRole: row.targetRole,
    proofIntent: row.proofIntent,
    qualityGateStatus:
      failures.length === 0
        ? "passed_controlled_real_acquisition_proof_target_quality_gate"
        : "blocked_controlled_real_acquisition_proof_target_quality_gate",
    failures,
    mayIncludeInExecutionApprovalGate: failures.length === 0,

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

const laneQualityGateRows = proofLaneRows.map((row, index) => {
  const failures = validateLane(row);

  return {
    controlledRealAcquisitionProofLaneQualityGateRowId: `controlled_real_acquisition_proof_lane_quality_gate_${String(index + 1).padStart(2, "0")}`,
    controlledRealAcquisitionProofLaneId: row.controlledRealAcquisitionProofLaneId,
    laneName: row.laneName,
    laneStatus: row.laneStatus,
    targetCount: row.targetCount,
    targetSlugs: row.targetSlugs,
    providerFamilies: row.providerFamilies,
    purpose: row.purpose,
    successMetric: row.successMetric,
    nextRequiredGate: row.nextRequiredGate,
    qualityGateStatus:
      failures.length === 0
        ? "passed_controlled_real_acquisition_proof_lane_quality_gate"
        : "blocked_controlled_real_acquisition_proof_lane_quality_gate",
    failures,
    mayIncludeInExecutionApprovalGate: failures.length === 0,

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

const successCriteriaQualityGateRows = successCriteriaRows.map((row, index) => {
  const failures = validateSuccessCriterion(row);

  return {
    controlledRealAcquisitionSuccessCriteriaQualityGateRowId: `controlled_real_acquisition_success_criteria_quality_gate_${String(index + 1).padStart(2, "0")}`,
    successCriterionId: row.successCriterionId,
    criterion: row.criterion,
    expectedMeasurement: row.expectedMeasurement,
    requiredForSuccess: row.requiredForSuccess,
    qualityGateStatus:
      failures.length === 0
        ? "passed_controlled_real_acquisition_success_criteria_quality_gate"
        : "blocked_controlled_real_acquisition_success_criteria_quality_gate",
    failures
  };
});

const passedTargetRows = targetQualityGateRows.filter((row) => row.qualityGateStatus === "passed_controlled_real_acquisition_proof_target_quality_gate");
const blockedTargetRows = targetQualityGateRows.filter((row) => row.qualityGateStatus !== "passed_controlled_real_acquisition_proof_target_quality_gate");

const passedLaneRows = laneQualityGateRows.filter((row) => row.qualityGateStatus === "passed_controlled_real_acquisition_proof_lane_quality_gate");
const blockedLaneRows = laneQualityGateRows.filter((row) => row.qualityGateStatus !== "passed_controlled_real_acquisition_proof_lane_quality_gate");

const passedSuccessCriteriaRows = successCriteriaQualityGateRows.filter((row) => row.qualityGateStatus === "passed_controlled_real_acquisition_success_criteria_quality_gate");
const blockedSuccessCriteriaRows = successCriteriaQualityGateRows.filter((row) => row.qualityGateStatus !== "passed_controlled_real_acquisition_success_criteria_quality_gate");

const blockedRows = [
  ...blockedTargetRows,
  ...blockedLaneRows,
  ...blockedSuccessCriteriaRows
];

const summary = {
  controlledRealAcquisitionProofLaneQualityGateReadCount: 1,

  sourceProofTargetRowCount: proofTargetRows.length,
  sourceProofLaneRowCount: proofLaneRows.length,
  sourceSuccessCriteriaRowCount: successCriteriaRows.length,
  sourceNextGateRowCount: nextGateRows.length,

  proofTargetQualityGateRowCount: targetQualityGateRows.length,
  passedProofTargetQualityGateRowCount: passedTargetRows.length,
  blockedProofTargetQualityGateRowCount: blockedTargetRows.length,

  proofLaneQualityGateRowCount: laneQualityGateRows.length,
  passedProofLaneQualityGateRowCount: passedLaneRows.length,
  blockedProofLaneQualityGateRowCount: blockedLaneRows.length,

  successCriteriaQualityGateRowCount: successCriteriaQualityGateRows.length,
  passedSuccessCriteriaQualityGateRowCount: passedSuccessCriteriaRows.length,
  blockedSuccessCriteriaQualityGateRowCount: blockedSuccessCriteriaRows.length,

  mainLaneProofTargetQualityGatedCount: countWhere(passedTargetRows, (row) => row.targetRole === "main_lane_known_configured_route"),
  repairBacklogProofTargetQualityGatedCount: countWhere(passedTargetRows, (row) => row.targetRole === "repair_backlog_known_provider_family"),
  laligaProofTargetQualityGatedCount: countWhere(passedTargetRows, (row) => row.providerFamily === "laliga"),
  norwayNtfProofTargetQualityGatedCount: countWhere(passedTargetRows, (row) => row.providerFamily === "norway_ntf"),
  sportomediaProofTargetQualityGatedCount: countWhere(passedTargetRows, (row) => row.providerFamily === "sportomedia"),

  mayBuildControlledRealAcquisitionExecutionApprovalGateCount:
    blockedRows.length === 0 ? 1 : 0,

  qualityGateIsExecutionPermissionNowCount: 0,
  qualityGateIsFetchPermissionNowCount: 0,
  qualityGateIsSearchPermissionNowCount: 0,
  qualityGateIsBroadSearchPermissionNowCount: 0,
  qualityGateIsClassifierPermissionNowCount: 0,
  qualityGateIsCanonicalWritePermissionNowCount: 0,
  qualityGateIsProductionWritePermissionNowCount: 0,
  qualityGateIsTruthAssertionPermissionNowCount: 0,

  mayExecuteControlledRealAcquisitionNowCount: 0,
  mayFetchControlledRealAcquisitionNowCount: 0,
  maySearchControlledRealAcquisitionNowCount: 0,
  mayClassifyControlledRealAcquisitionNowCount: 0,
  mayWriteCanonicalControlledRealAcquisitionNowCount: 0,
  mayWriteProductionControlledRealAcquisitionNowCount: 0,
  mayAssertTruthControlledRealAcquisitionNowCount: 0,

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
  job: "run-football-truth-controlled-real-acquisition-proof-lane-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_controlled_real_acquisition_proof_lane_quality_gate",
  dryRun: true,
  inputs: {
    controlledRealAcquisitionProofLanePlan: planPath
  },
  policy: {
    controlledRealAcquisitionProofLaneQualityGateOnly: true,
    executionApprovalGateRequiredBeforeAnyRealFetchOrSearch: true,
    thisGateDoesNotGrantFetchSearchOrWrite: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  verdict: {
    targetSetPassed: blockedTargetRows.length === 0,
    proofLanesPassed: blockedLaneRows.length === 0,
    successCriteriaPassed: blockedSuccessCriteriaRows.length === 0,
    recommendedNextGate: "controlled_real_acquisition_execution_approval_gate",
    expectedNextStep: "approve the smallest real acquisition smoke with explicit fetch/search permissions but still no canonical or production writes"
  },
  summary,
  targetQualityGateRows,
  laneQualityGateRows,
  successCriteriaQualityGateRows,
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
  throw new Error(`Controlled real acquisition proof lane quality gate blocked ${blockedRows.length} rows`);
}
