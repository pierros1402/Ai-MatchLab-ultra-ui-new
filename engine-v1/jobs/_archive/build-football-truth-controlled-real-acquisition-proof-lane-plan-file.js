import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const impactProofBoardPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-post-continuation-completion-impact-proof-board-2026-06-15",
  "post-six-league-full-map-post-continuation-completion-impact-proof-board-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-proof-lane-plan-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "controlled-real-acquisition-proof-lane-plan-2026-06-15.json"
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

const impactProofBoard = readJson(impactProofBoardPath);
const impactSummary = impactProofBoard.summary || {};

if (impactSummary.provenPipelineValueProofRowCount !== 5) {
  throw new Error(`Expected provenPipelineValueProofRowCount=5, got ${impactSummary.provenPipelineValueProofRowCount}`);
}

if (impactSummary.impactVerdictPipelineHasPaidOffAsControlSystemCount !== 1) {
  throw new Error("Expected impactVerdictPipelineHasPaidOffAsControlSystemCount=1");
}

if (impactSummary.impactVerdictLatestChainHasProducedNewRealCoverageCount !== 0) {
  throw new Error("Expected impactVerdictLatestChainHasProducedNewRealCoverageCount=0");
}

if (impactSummary.impactVerdictMustMoveToControlledRealAcquisitionCount !== 1) {
  throw new Error("Expected impactVerdictMustMoveToControlledRealAcquisitionCount=1");
}

if (impactSummary.mayBuildControlledRealAcquisitionProofLanePlanCount !== 1) {
  throw new Error("Expected mayBuildControlledRealAcquisitionProofLanePlanCount=1");
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
].forEach((key) => assertZero(impactSummary[key], `impactProofBoard.summary.${key}`));

assertFalse(impactProofBoard.productionWrite, "impactProofBoard.productionWrite");
assertFalse(impactProofBoard.sourceFetch?.executed, "impactProofBoard.sourceFetch.executed");
assertFalse(impactProofBoard.searchProviderUsed, "impactProofBoard.searchProviderUsed");
assertFalse(impactProofBoard.broadSearchUsed, "impactProofBoard.broadSearchUsed");
assertFalse(impactProofBoard.classifierExecuted, "impactProofBoard.classifierExecuted");

const proofTargetRows = [
  {
    controlledRealAcquisitionProofTargetId: "controlled_real_acquisition_proof_target_01",
    competitionSlug: "esp.1",
    providerFamily: "laliga",
    targetRole: "main_lane_known_configured_route",
    proofIntent: "refresh_real_evidence_for_standings_or_season_state_delta",
    initialPermissionMode: "future_explicit_controlled_fetch_only_after_approval",
    allowFetchNow: false,
    allowSearchNow: false,
    allowBroadSearchNow: false,
    allowClassifyNow: false,
    allowCanonicalWriteNow: false,
    allowProductionWriteNow: false,
    allowTruthAssertionNow: false
  },
  {
    controlledRealAcquisitionProofTargetId: "controlled_real_acquisition_proof_target_02",
    competitionSlug: "esp.2",
    providerFamily: "laliga",
    targetRole: "main_lane_known_configured_route",
    proofIntent: "refresh_real_evidence_for_standings_or_season_state_delta",
    initialPermissionMode: "future_explicit_controlled_fetch_only_after_approval",
    allowFetchNow: false,
    allowSearchNow: false,
    allowBroadSearchNow: false,
    allowClassifyNow: false,
    allowCanonicalWriteNow: false,
    allowProductionWriteNow: false,
    allowTruthAssertionNow: false
  },
  {
    controlledRealAcquisitionProofTargetId: "controlled_real_acquisition_proof_target_03",
    competitionSlug: "nor.1",
    providerFamily: "norway_ntf",
    targetRole: "main_lane_known_configured_route",
    proofIntent: "refresh_real_evidence_for_standings_or_season_state_delta",
    initialPermissionMode: "future_explicit_controlled_fetch_only_after_approval",
    allowFetchNow: false,
    allowSearchNow: false,
    allowBroadSearchNow: false,
    allowClassifyNow: false,
    allowCanonicalWriteNow: false,
    allowProductionWriteNow: false,
    allowTruthAssertionNow: false
  },
  {
    controlledRealAcquisitionProofTargetId: "controlled_real_acquisition_proof_target_04",
    competitionSlug: "nor.2",
    providerFamily: "norway_ntf",
    targetRole: "main_lane_known_configured_route",
    proofIntent: "refresh_real_evidence_for_standings_or_season_state_delta",
    initialPermissionMode: "future_explicit_controlled_fetch_only_after_approval",
    allowFetchNow: false,
    allowSearchNow: false,
    allowBroadSearchNow: false,
    allowClassifyNow: false,
    allowCanonicalWriteNow: false,
    allowProductionWriteNow: false,
    allowTruthAssertionNow: false
  },
  {
    controlledRealAcquisitionProofTargetId: "controlled_real_acquisition_proof_target_05",
    competitionSlug: "swe.1",
    providerFamily: "sportomedia",
    targetRole: "repair_backlog_known_provider_family",
    proofIntent: "prove_repair_family_can_generate_real_accepted_evidence_delta",
    initialPermissionMode: "future_explicit_controlled_fetch_only_after_approval",
    allowFetchNow: false,
    allowSearchNow: false,
    allowBroadSearchNow: false,
    allowClassifyNow: false,
    allowCanonicalWriteNow: false,
    allowProductionWriteNow: false,
    allowTruthAssertionNow: false
  },
  {
    controlledRealAcquisitionProofTargetId: "controlled_real_acquisition_proof_target_06",
    competitionSlug: "swe.2",
    providerFamily: "sportomedia",
    targetRole: "repair_backlog_known_provider_family",
    proofIntent: "prove_repair_family_can_generate_real_accepted_evidence_delta",
    initialPermissionMode: "future_explicit_controlled_fetch_only_after_approval",
    allowFetchNow: false,
    allowSearchNow: false,
    allowBroadSearchNow: false,
    allowClassifyNow: false,
    allowCanonicalWriteNow: false,
    allowProductionWriteNow: false,
    allowTruthAssertionNow: false
  }
];

const proofLaneRows = [
  {
    controlledRealAcquisitionProofLaneId: "controlled_real_acquisition_proof_lane_01",
    laneName: "six_league_configured_route_real_evidence_smoke",
    laneStatus: "planned_requires_quality_gate_before_any_fetch",
    targetCount: proofTargetRows.length,
    targetSlugs: proofTargetRows.map((row) => row.competitionSlug),
    providerFamilies: [...new Set(proofTargetRows.map((row) => row.providerFamily))],
    purpose: "prove the verified control pipeline can produce real accepted football evidence on a bounded known-source target set",
    successMetric: "accepted_evidence_delta_count_gt_0_and_no_unsafe_write",
    currentRunFetchAllowed: false,
    currentRunSearchAllowed: false,
    currentRunClassifierAllowed: false,
    currentRunCanonicalWriteAllowed: false,
    currentRunProductionWriteAllowed: false,
    currentRunTruthAssertionAllowed: false,
    nextRequiredGate: "controlled_real_acquisition_proof_lane_quality_gate"
  },
  {
    controlledRealAcquisitionProofLaneId: "controlled_real_acquisition_proof_lane_02",
    laneName: "main_lane_standings_or_season_state_delta_measurement",
    laneStatus: "planned_requires_successful_evidence_smoke_first",
    targetCount: countWhere(proofTargetRows, (row) => row.targetRole === "main_lane_known_configured_route"),
    targetSlugs: proofTargetRows
      .filter((row) => row.targetRole === "main_lane_known_configured_route")
      .map((row) => row.competitionSlug),
    providerFamilies: [...new Set(proofTargetRows.filter((row) => row.targetRole === "main_lane_known_configured_route").map((row) => row.providerFamily))],
    purpose: "measure whether trusted evidence changes active/standings/season-state status for main-lane competitions",
    successMetric: "season_state_or_standings_delta_count_gt_0",
    currentRunFetchAllowed: false,
    currentRunSearchAllowed: false,
    currentRunClassifierAllowed: false,
    currentRunCanonicalWriteAllowed: false,
    currentRunProductionWriteAllowed: false,
    currentRunTruthAssertionAllowed: false,
    nextRequiredGate: "controlled_real_acquisition_proof_lane_quality_gate"
  },
  {
    controlledRealAcquisitionProofLaneId: "controlled_real_acquisition_proof_lane_03",
    laneName: "sportomedia_repair_family_real_evidence_delta_measurement",
    laneStatus: "planned_requires_successful_evidence_smoke_first",
    targetCount: countWhere(proofTargetRows, (row) => row.providerFamily === "sportomedia"),
    targetSlugs: proofTargetRows
      .filter((row) => row.providerFamily === "sportomedia")
      .map((row) => row.competitionSlug),
    providerFamilies: ["sportomedia"],
    purpose: "measure whether the repair backlog path can produce accepted real evidence for Sportomedia targets",
    successMetric: "sportomedia_accepted_evidence_delta_count_gt_0",
    currentRunFetchAllowed: false,
    currentRunSearchAllowed: false,
    currentRunClassifierAllowed: false,
    currentRunCanonicalWriteAllowed: false,
    currentRunProductionWriteAllowed: false,
    currentRunTruthAssertionAllowed: false,
    nextRequiredGate: "controlled_real_acquisition_proof_lane_quality_gate"
  }
];

const successCriteriaRows = [
  {
    successCriterionId: "controlled_real_acquisition_success_01",
    criterion: "fetch_or_search_attempts_are_explicitly_approved",
    requiredForSuccess: true,
    expectedMeasurement: "future_approved_fetch_or_search_attempt_count_gt_0"
  },
  {
    successCriterionId: "controlled_real_acquisition_success_02",
    criterion: "accepted_evidence_rows_are_created",
    requiredForSuccess: true,
    expectedMeasurement: "accepted_evidence_row_count_gt_0"
  },
  {
    successCriterionId: "controlled_real_acquisition_success_03",
    criterion: "standings_or_season_state_delta_is_measured",
    requiredForSuccess: true,
    expectedMeasurement: "standings_delta_count_gt_0_or_season_state_delta_count_gt_0"
  },
  {
    successCriterionId: "controlled_real_acquisition_success_04",
    criterion: "canonical_write_candidates_are_separated_from_canonical_writes",
    requiredForSuccess: true,
    expectedMeasurement: "canonical_write_candidate_count_may_be_gt_0_while_canonical_writes_remain_0_until_write_approval"
  },
  {
    successCriterionId: "controlled_real_acquisition_success_05",
    criterion: "unsafe_write_and_truth_assertion_guardrails_remain_zero",
    requiredForSuccess: true,
    expectedMeasurement: "productionWrite_false_and_truthAssertionExecutedNowCount_0"
  }
];

const nextGateRows = [
  {
    nextGateId: "controlled_real_acquisition_next_gate_01",
    gateName: "controlled_real_acquisition_proof_lane_quality_gate",
    gatePurpose: "validate target set, success criteria, and explicit permission boundaries before any controlled fetch/search",
    mayBuildNow: true,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifyNow: false,
    mayWriteCanonicalNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false
  },
  {
    nextGateId: "controlled_real_acquisition_next_gate_02",
    gateName: "controlled_real_acquisition_execution_approval_gate",
    gatePurpose: "only after quality gate, explicitly approve the smallest real acquisition smoke",
    mayBuildNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifyNow: false,
    mayWriteCanonicalNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false
  }
];

const summary = {
  controlledRealAcquisitionProofLanePlanReadCount: 1,

  impactBoardPipelineValueProofRowCount: impactSummary.pipelineValueProofRowCount,
  impactBoardProvenPipelineValueProofRowCount: impactSummary.provenPipelineValueProofRowCount,
  impactBoardRealCoverageImpactRowCount: impactSummary.realCoverageImpactRowCount,
  impactBoardLatestChainRealCoverageImpactStartedCount: impactSummary.latestChainRealCoverageImpactStartedCount,
  impactBoardLatestChainRealCoverageImpactNotStartedCount: impactSummary.latestChainRealCoverageImpactNotStartedCount,
  impactBoardLatestChainRealSideEffectCount: impactSummary.latestChainRealSideEffectCount,

  proofTargetRowCount: proofTargetRows.length,
  proofLaneRowCount: proofLaneRows.length,
  successCriteriaRowCount: successCriteriaRows.length,
  nextGateRowCount: nextGateRows.length,

  mainLaneProofTargetCount: countWhere(proofTargetRows, (row) => row.targetRole === "main_lane_known_configured_route"),
  repairBacklogProofTargetCount: countWhere(proofTargetRows, (row) => row.targetRole === "repair_backlog_known_provider_family"),
  laligaProofTargetCount: countWhere(proofTargetRows, (row) => row.providerFamily === "laliga"),
  norwayNtfProofTargetCount: countWhere(proofTargetRows, (row) => row.providerFamily === "norway_ntf"),
  sportomediaProofTargetCount: countWhere(proofTargetRows, (row) => row.providerFamily === "sportomedia"),

  currentRunProofLaneFetchAllowedCount: countWhere(proofTargetRows, (row) => row.allowFetchNow === true),
  currentRunProofLaneSearchAllowedCount: countWhere(proofTargetRows, (row) => row.allowSearchNow === true),
  currentRunProofLaneBroadSearchAllowedCount: countWhere(proofTargetRows, (row) => row.allowBroadSearchNow === true),
  currentRunProofLaneClassifierAllowedCount: countWhere(proofTargetRows, (row) => row.allowClassifyNow === true),
  currentRunProofLaneCanonicalWriteAllowedCount: countWhere(proofTargetRows, (row) => row.allowCanonicalWriteNow === true),
  currentRunProofLaneProductionWriteAllowedCount: countWhere(proofTargetRows, (row) => row.allowProductionWriteNow === true),
  currentRunProofLaneTruthAssertionAllowedCount: countWhere(proofTargetRows, (row) => row.allowTruthAssertionNow === true),

  mayBuildControlledRealAcquisitionProofLaneQualityGateCount: 1,
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
  job: "build-football-truth-controlled-real-acquisition-proof-lane-plan-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_controlled_real_acquisition_proof_lane_plan",
  dryRun: true,
  inputs: {
    postContinuationCompletionImpactProofBoard: impactProofBoardPath
  },
  policy: {
    controlledRealAcquisitionProofLanePlanOnly: true,
    proofLaneQualityGateRequiredBeforeAnyRealFetchOrSearch: true,
    explicitApprovalRequiredBeforeAnyRealAcquisitionExecution: true,
    canonicalWritesRemainBlockedUntilAcceptedEvidenceAndWriteApproval: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  verdict: {
    shouldStopBlindDiagnosticsLoop: true,
    shouldMoveToControlledRealAcquisitionProofLane: true,
    firstProofLane: "six_league_configured_route_real_evidence_smoke",
    expectedFirstVisibleValue: "accepted evidence delta and standings/season-state delta on a bounded six-competition target set"
  },
  summary,
  proofLaneRows,
  proofTargetRows,
  successCriteriaRows,
  nextGateRows,
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
