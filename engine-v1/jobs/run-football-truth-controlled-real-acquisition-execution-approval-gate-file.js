import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const qualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-proof-lane-quality-gate-2026-06-15",
  "controlled-real-acquisition-proof-lane-quality-gate-2026-06-15.json"
);

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
  "controlled-real-acquisition-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "controlled-real-acquisition-execution-approval-gate-2026-06-15.json"
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

function validateQualityGate(input) {
  const s = input.summary || {};

  if (s.controlledRealAcquisitionProofLaneQualityGateReadCount !== 1) throw new Error("Expected quality gate read count 1");

  if (s.sourceProofTargetRowCount !== 6) throw new Error(`Expected sourceProofTargetRowCount=6, got ${s.sourceProofTargetRowCount}`);
  if (s.sourceProofLaneRowCount !== 3) throw new Error(`Expected sourceProofLaneRowCount=3, got ${s.sourceProofLaneRowCount}`);
  if (s.sourceSuccessCriteriaRowCount !== 5) throw new Error(`Expected sourceSuccessCriteriaRowCount=5, got ${s.sourceSuccessCriteriaRowCount}`);
  if (s.sourceNextGateRowCount !== 2) throw new Error(`Expected sourceNextGateRowCount=2, got ${s.sourceNextGateRowCount}`);

  if (s.passedProofTargetQualityGateRowCount !== 6) throw new Error(`Expected passedProofTargetQualityGateRowCount=6, got ${s.passedProofTargetQualityGateRowCount}`);
  if (s.blockedProofTargetQualityGateRowCount !== 0) throw new Error(`Expected blockedProofTargetQualityGateRowCount=0, got ${s.blockedProofTargetQualityGateRowCount}`);

  if (s.passedProofLaneQualityGateRowCount !== 3) throw new Error(`Expected passedProofLaneQualityGateRowCount=3, got ${s.passedProofLaneQualityGateRowCount}`);
  if (s.blockedProofLaneQualityGateRowCount !== 0) throw new Error(`Expected blockedProofLaneQualityGateRowCount=0, got ${s.blockedProofLaneQualityGateRowCount}`);

  if (s.passedSuccessCriteriaQualityGateRowCount !== 5) throw new Error(`Expected passedSuccessCriteriaQualityGateRowCount=5, got ${s.passedSuccessCriteriaQualityGateRowCount}`);
  if (s.blockedSuccessCriteriaQualityGateRowCount !== 0) throw new Error(`Expected blockedSuccessCriteriaQualityGateRowCount=0, got ${s.blockedSuccessCriteriaQualityGateRowCount}`);

  if (s.mainLaneProofTargetQualityGatedCount !== 4) throw new Error(`Expected mainLaneProofTargetQualityGatedCount=4, got ${s.mainLaneProofTargetQualityGatedCount}`);
  if (s.repairBacklogProofTargetQualityGatedCount !== 2) throw new Error(`Expected repairBacklogProofTargetQualityGatedCount=2, got ${s.repairBacklogProofTargetQualityGatedCount}`);
  if (s.laligaProofTargetQualityGatedCount !== 2) throw new Error(`Expected laligaProofTargetQualityGatedCount=2, got ${s.laligaProofTargetQualityGatedCount}`);
  if (s.norwayNtfProofTargetQualityGatedCount !== 2) throw new Error(`Expected norwayNtfProofTargetQualityGatedCount=2, got ${s.norwayNtfProofTargetQualityGatedCount}`);
  if (s.sportomediaProofTargetQualityGatedCount !== 2) throw new Error(`Expected sportomediaProofTargetQualityGatedCount=2, got ${s.sportomediaProofTargetQualityGatedCount}`);

  if (s.mayBuildControlledRealAcquisitionExecutionApprovalGateCount !== 1) {
    throw new Error("Expected mayBuildControlledRealAcquisitionExecutionApprovalGateCount=1");
  }

  [
    "qualityGateIsExecutionPermissionNowCount",
    "qualityGateIsFetchPermissionNowCount",
    "qualityGateIsSearchPermissionNowCount",
    "qualityGateIsBroadSearchPermissionNowCount",
    "qualityGateIsClassifierPermissionNowCount",
    "qualityGateIsCanonicalWritePermissionNowCount",
    "qualityGateIsProductionWritePermissionNowCount",
    "qualityGateIsTruthAssertionPermissionNowCount",
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
  ].forEach((key) => assertZero(s[key], `qualityGate.summary.${key}`));

  assertFalse(input.productionWrite, "qualityGate.productionWrite");
  assertFalse(input.sourceFetch?.executed, "qualityGate.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "qualityGate.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "qualityGate.broadSearchUsed");
  assertFalse(input.classifierExecuted, "qualityGate.classifierExecuted");
}

function validatePlan(input) {
  const s = input.summary || {};

  if (s.controlledRealAcquisitionProofLanePlanReadCount !== 1) throw new Error("Expected plan read count 1");
  if (s.proofTargetRowCount !== 6) throw new Error(`Expected proofTargetRowCount=6, got ${s.proofTargetRowCount}`);
  if (s.proofLaneRowCount !== 3) throw new Error(`Expected proofLaneRowCount=3, got ${s.proofLaneRowCount}`);
  if (s.successCriteriaRowCount !== 5) throw new Error(`Expected successCriteriaRowCount=5, got ${s.successCriteriaRowCount}`);

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

function validateTargetQualityGateRow(row) {
  const failures = [];

  if (!row.controlledRealAcquisitionProofTargetQualityGateRowId) failures.push("missing_target_quality_gate_row_id");
  if (!row.controlledRealAcquisitionProofTargetId) failures.push("missing_proof_target_id");
  if (!row.competitionSlug) failures.push("missing_competition_slug");
  if (!row.providerFamily) failures.push("missing_provider_family");
  if (!row.targetRole) failures.push("missing_target_role");
  if (!row.proofIntent) failures.push("missing_proof_intent");

  if (row.qualityGateStatus !== "passed_controlled_real_acquisition_proof_target_quality_gate") {
    failures.push(`unexpected_target_quality_gate_status:${row.qualityGateStatus}`);
  }

  if (row.mayIncludeInExecutionApprovalGate !== true) {
    failures.push("may_include_in_execution_approval_gate_not_true");
  }

  if (!["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"].includes(row.competitionSlug)) {
    failures.push(`unexpected_competition_slug:${row.competitionSlug}`);
  }

  if (!["laliga", "norway_ntf", "sportomedia"].includes(row.providerFamily)) {
    failures.push(`unexpected_provider_family:${row.providerFamily}`);
  }

  [
    "qualityGateIsExecutionPermissionNow",
    "qualityGateIsFetchPermissionNow",
    "qualityGateIsSearchPermissionNow",
    "qualityGateIsBroadSearchPermissionNow",
    "qualityGateIsClassifierPermissionNow",
    "qualityGateIsCanonicalWritePermissionNow",
    "qualityGateIsProductionWritePermissionNow",
    "qualityGateIsTruthAssertionPermissionNow"
  ].forEach((key) => {
    if (row[key] !== false) failures.push(`quality_gate_permission_not_false:${key}`);
  });

  return failures;
}

function validateLaneQualityGateRows(rows) {
  const failures = [];
  const requiredLaneNames = [
    "six_league_configured_route_real_evidence_smoke",
    "main_lane_standings_or_season_state_delta_measurement",
    "sportomedia_repair_family_real_evidence_delta_measurement"
  ];

  for (const laneName of requiredLaneNames) {
    if (!rows.some((row) => row.laneName === laneName && row.qualityGateStatus === "passed_controlled_real_acquisition_proof_lane_quality_gate")) {
      failures.push(`missing_passed_lane:${laneName}`);
    }
  }

  return failures;
}

const qualityGate = readJson(qualityGatePath);
const plan = readJson(planPath);

validateQualityGate(qualityGate);
validatePlan(plan);

const targetQualityGateRows = Array.isArray(qualityGate.targetQualityGateRows) ? qualityGate.targetQualityGateRows : [];
const laneQualityGateRows = Array.isArray(qualityGate.laneQualityGateRows) ? qualityGate.laneQualityGateRows : [];
const successCriteriaQualityGateRows = Array.isArray(qualityGate.successCriteriaQualityGateRows) ? qualityGate.successCriteriaQualityGateRows : [];
const proofTargetRows = Array.isArray(plan.proofTargetRows) ? plan.proofTargetRows : [];
const proofLaneRows = Array.isArray(plan.proofLaneRows) ? plan.proofLaneRows : [];

if (targetQualityGateRows.length !== 6) throw new Error(`Expected 6 target quality gate rows, got ${targetQualityGateRows.length}`);
if (laneQualityGateRows.length !== 3) throw new Error(`Expected 3 lane quality gate rows, got ${laneQualityGateRows.length}`);
if (successCriteriaQualityGateRows.length !== 5) throw new Error(`Expected 5 success criteria quality gate rows, got ${successCriteriaQualityGateRows.length}`);
if (proofTargetRows.length !== 6) throw new Error(`Expected 6 proof target rows, got ${proofTargetRows.length}`);
if (proofLaneRows.length !== 3) throw new Error(`Expected 3 proof lane rows, got ${proofLaneRows.length}`);

const laneFailures = validateLaneQualityGateRows(laneQualityGateRows);

if (laneFailures.length > 0) {
  throw new Error(`Lane quality gate validation failed: ${laneFailures.join(", ")}`);
}

const proofTargetById = new Map(
  proofTargetRows.map((row) => [row.controlledRealAcquisitionProofTargetId, row])
);

const approvalRows = targetQualityGateRows.map((row, index) => {
  const failures = validateTargetQualityGateRow(row);
  const planTarget = proofTargetById.get(row.controlledRealAcquisitionProofTargetId);

  if (!planTarget) failures.push("missing_matching_plan_target");

  const providerFamily = row.providerFamily;
  const knownConfiguredProvider = ["laliga", "norway_ntf", "sportomedia"].includes(providerFamily);

  if (!knownConfiguredProvider) {
    failures.push(`provider_not_configured_for_smoke:${providerFamily}`);
  }

  return {
    controlledRealAcquisitionExecutionApprovalRowId: `controlled_real_acquisition_execution_approval_${String(index + 1).padStart(2, "0")}`,
    controlledRealAcquisitionProofTargetQualityGateRowId: row.controlledRealAcquisitionProofTargetQualityGateRowId,
    controlledRealAcquisitionProofTargetId: row.controlledRealAcquisitionProofTargetId,
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    targetRole: row.targetRole,
    proofIntent: row.proofIntent,

    approvalStatus:
      failures.length === 0
        ? "approved_for_explicit_controlled_real_acquisition_smoke_runner"
        : "blocked_from_controlled_real_acquisition_smoke_runner",
    failures,

    approvedProofLane: "six_league_configured_route_real_evidence_smoke",
    approvedPurpose: "produce accepted evidence delta and standings_or_season_state_delta candidates on bounded six-target set",

    currentGateIsExecutionPermissionNow: false,
    currentGateIsFetchPermissionNow: false,
    currentGateIsSearchPermissionNow: false,
    currentGateIsBroadSearchPermissionNow: false,
    currentGateIsClassifierPermissionNow: false,
    currentGateIsCanonicalWritePermissionNow: false,
    currentGateIsProductionWritePermissionNow: false,
    currentGateIsTruthAssertionPermissionNow: false,

    nextRunnerMayExecuteControlledRealAcquisition: failures.length === 0,
    nextRunnerMayFetchControlledRealEvidence: failures.length === 0,
    nextRunnerMaySearchControlledRealEvidence: failures.length === 0,
    nextRunnerMayBroadSearch: false,
    nextRunnerMayClassify: false,
    nextRunnerMayWriteCanonical: false,
    nextRunnerMayWriteProduction: false,
    nextRunnerMayAssertTruth: false,

    nextRunnerRequiresExplicitAllowExecuteFlag: true,
    nextRunnerRequiresExplicitAllowFetchFlag: true,
    nextRunnerRequiresExplicitAllowSearchFlag: true,
    nextRunnerMustRemainNoBroadSearch: true,
    nextRunnerMustRemainNoClassifier: true,
    nextRunnerMustRemainNoCanonicalWrite: true,
    nextRunnerMustRemainNoProductionWrite: true,
    nextRunnerMustRemainNoTruthAssertion: true
  };
});

const approvedRows = approvalRows.filter(
  (row) => row.approvalStatus === "approved_for_explicit_controlled_real_acquisition_smoke_runner"
);

const blockedRows = approvalRows.filter(
  (row) => row.approvalStatus !== "approved_for_explicit_controlled_real_acquisition_smoke_runner"
);

const summary = {
  controlledRealAcquisitionExecutionApprovalGateReadCount: 2,

  sourceTargetQualityGateRowCount: targetQualityGateRows.length,
  sourceLaneQualityGateRowCount: laneQualityGateRows.length,
  sourceSuccessCriteriaQualityGateRowCount: successCriteriaQualityGateRows.length,
  sourceProofTargetRowCount: proofTargetRows.length,
  sourceProofLaneRowCount: proofLaneRows.length,

  controlledRealAcquisitionExecutionApprovalRowCount: approvalRows.length,
  approvedControlledRealAcquisitionExecutionApprovalRowCount: approvedRows.length,
  blockedControlledRealAcquisitionExecutionApprovalRowCount: blockedRows.length,

  approvedMainLaneControlledRealAcquisitionTargetCount: countWhere(
    approvedRows,
    (row) => row.targetRole === "main_lane_known_configured_route"
  ),
  approvedRepairBacklogControlledRealAcquisitionTargetCount: countWhere(
    approvedRows,
    (row) => row.targetRole === "repair_backlog_known_provider_family"
  ),
  approvedLaligaControlledRealAcquisitionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "laliga"
  ),
  approvedNorwayNtfControlledRealAcquisitionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "norway_ntf"
  ),
  approvedSportomediaControlledRealAcquisitionTargetCount: countWhere(
    approvedRows,
    (row) => row.providerFamily === "sportomedia"
  ),

  mayRunControlledRealAcquisitionSmokeRunnerCount:
    blockedRows.length === 0 ? 1 : 0,

  currentGateIsExecutionPermissionNowCount: 0,
  currentGateIsFetchPermissionNowCount: 0,
  currentGateIsSearchPermissionNowCount: 0,
  currentGateIsBroadSearchPermissionNowCount: 0,
  currentGateIsClassifierPermissionNowCount: 0,
  currentGateIsCanonicalWritePermissionNowCount: 0,
  currentGateIsProductionWritePermissionNowCount: 0,
  currentGateIsTruthAssertionPermissionNowCount: 0,

  nextRunnerMayExecuteControlledRealAcquisitionCount: approvedRows.length,
  nextRunnerMayFetchControlledRealEvidenceCount: approvedRows.length,
  nextRunnerMaySearchControlledRealEvidenceCount: approvedRows.length,
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
  job: "run-football-truth-controlled-real-acquisition-execution-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "controlled_real_acquisition_execution_approval_gate_no_current_fetch_no_current_search_no_write",
  dryRun: true,
  inputs: {
    controlledRealAcquisitionProofLaneQualityGate: qualityGatePath,
    controlledRealAcquisitionProofLanePlan: planPath
  },
  policy: {
    executionApprovalGateOnly: true,
    approvalDoesNotExecuteFetchOrSearchNow: true,
    nextRunnerRequiresExplicitAllowExecuteFetchSearchFlags: true,
    nextRunnerMayUseControlledFetch: true,
    nextRunnerMayUseControlledSearch: true,
    nextRunnerBroadSearchBlocked: true,
    nextRunnerClassifierBlocked: true,
    nextRunnerCanonicalWriteBlocked: true,
    nextRunnerProductionWriteBlocked: true,
    nextRunnerTruthAssertionBlocked: true,
    currentRunNoFetch: true,
    currentRunNoSearch: true,
    currentRunNoBroadSearch: true,
    currentRunNoClassifierExecution: true,
    currentRunNoCanonicalWrite: true,
    currentRunNoProductionWrite: true,
    currentRunNoTruthAssertion: true
  },
  verdict: {
    approvedForSmallestControlledRealAcquisitionSmoke:
      blockedRows.length === 0,
    approvedTargetCount: approvedRows.length,
    approvedTargets: approvedRows.map((row) => row.competitionSlug),
    firstVisibleValueToMeasure:
      "accepted evidence delta plus standings_or_season_state_delta candidates; canonical writes remain blocked",
    recommendedNextStep:
      "run controlled real acquisition smoke runner with explicit --allow-execute --allow-fetch --allow-search and no broad/classifier/write/truth"
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
  throw new Error(`Controlled real acquisition execution approval gate blocked ${blockedRows.length} rows`);
}
