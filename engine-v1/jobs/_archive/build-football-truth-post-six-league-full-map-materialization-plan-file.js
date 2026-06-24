import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const resumeGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-resume-gate-2026-06-15",
  "post-six-league-full-map-resume-gate-2026-06-15.json"
);

const nextBatchQualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-resumption-full-map-next-batch-plan-quality-gate-2026-06-15",
  "post-resumption-full-map-next-batch-plan-quality-gate-2026-06-15.json"
);

const nextBatchPlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-resumption-full-map-next-batch-plan-2026-06-15",
  "post-resumption-full-map-next-batch-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-materialization-plan-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-materialization-plan-2026-06-15.json"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function maybeReadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function summaryOf(input) {
  return input.summary || input;
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

function validateResumeGate(input) {
  const s = summaryOf(input);

  if (s.resumeGatePassedCount !== 2) throw new Error(`Expected resumeGatePassedCount=2, got ${s.resumeGatePassedCount}`);
  if (s.resumeGateBlockedCount !== 0) throw new Error(`Expected resumeGateBlockedCount=0, got ${s.resumeGateBlockedCount}`);
  if (s.sixLeagueBlockerClosedCount !== 1) throw new Error(`Expected sixLeagueBlockerClosedCount=1, got ${s.sixLeagueBlockerClosedCount}`);
  if (s.sixLeagueVerifiedCompetitionCount !== 6) throw new Error(`Expected sixLeagueVerifiedCompetitionCount=6, got ${s.sixLeagueVerifiedCompetitionCount}`);
  if (s.sixLeagueVerifiedPromotedAreaCount !== 18) throw new Error(`Expected sixLeagueVerifiedPromotedAreaCount=18, got ${s.sixLeagueVerifiedPromotedAreaCount}`);
  if (s.postResumptionFullMapNextBatchPlanQualityGateStillValidCount !== 1) throw new Error("Expected prior next batch quality gate to still be valid");
  if (s.mayBuildPostSixLeagueFullMapMaterializationPlanCount !== 1) throw new Error("Expected mayBuildPostSixLeagueFullMapMaterializationPlanCount=1");
  if (s.mayResumePostSixLeagueFullMapMaterializationCount !== 1) throw new Error("Expected mayResumePostSixLeagueFullMapMaterializationCount=1");

  [
    "resumeGateIsExecutionPermissionNowCount",
    "resumeGateIsFetchPermissionNowCount",
    "resumeGateIsSearchPermissionNowCount",
    "resumeGateIsBroadSearchPermissionNowCount",
    "resumeGateIsClassifierPermissionNowCount",
    "resumeGateIsCanonicalWritePermissionNowCount",
    "resumeGateIsProductionWritePermissionNowCount",
    "resumeGateIsTruthAssertionPermissionNowCount",
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

function validateNextBatchQualityGate(input) {
  const s = summaryOf(input);

  if (s.postResumptionFullMapNextBatchPlanQualityGatePassedCount !== 5) {
    throw new Error(`Expected postResumptionFullMapNextBatchPlanQualityGatePassedCount=5, got ${s.postResumptionFullMapNextBatchPlanQualityGatePassedCount}`);
  }

  if (s.postResumptionFullMapNextBatchPlanQualityGateBlockedCount !== 0) {
    throw new Error(`Expected postResumptionFullMapNextBatchPlanQualityGateBlockedCount=0, got ${s.postResumptionFullMapNextBatchPlanQualityGateBlockedCount}`);
  }

  if (s.mayBuildPostResumptionFullMapNextBatchMaterializationPlanCount !== 1) {
    throw new Error("Expected mayBuildPostResumptionFullMapNextBatchMaterializationPlanCount=1");
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
    "mayExecuteFurtherNowCount",
    "mayFetchNowCount",
    "maySearchNowCount",
    "mayBroadSearchNowCount",
    "mayClassifySeasonStateNowCount",
    "mayWriteCanonicalNowCount",
    "mayAssertTruthNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "postResumptionFullMapNextBatchPlanQualityGateTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `nextBatchQualityGate.summary.${key}`));

  assertFalse(input.productionWrite, "nextBatchQualityGate.productionWrite");
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

const resumeGate = readJson(resumeGatePath);
const nextBatchQualityGate = readJson(nextBatchQualityGatePath);
const nextBatchPlan = maybeReadJson(nextBatchPlanPath);

validateResumeGate(resumeGate);
validateNextBatchQualityGate(nextBatchQualityGate);

const materializationPlanRows = [
  {
    materializationPlanRowId: "post_six_league_materialization_01_primary_manifest_next_batch",
    sourceLane: "primary_manifest_next_batch",
    materializationLane: "whole_map_main_lane_resumed",
    materializationIntent: "resume_primary_manifest_materialization_after_six_league_blocker_closed",
    expectedSourceGate: nextBatchQualityGatePath.replace(/\\/g, "/"),
    requiredBlockerState: "six_league_blocker_verified_closed",
    planStatus: "ready_for_materialization_quality_gate",
    isMainLane: true,
    isRepairBacklogLane: false,
    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  },
  {
    materializationPlanRowId: "post_six_league_materialization_02_followup_quality_gated_next_action",
    sourceLane: "followup_quality_gated_next_action",
    materializationLane: "whole_map_main_lane_resumed",
    materializationIntent: "resume_followup_quality_gated_materialization_after_six_league_blocker_closed",
    expectedSourceGate: nextBatchQualityGatePath.replace(/\\/g, "/"),
    requiredBlockerState: "six_league_blocker_verified_closed",
    planStatus: "ready_for_materialization_quality_gate",
    isMainLane: true,
    isRepairBacklogLane: false,
    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  },
  {
    materializationPlanRowId: "post_six_league_materialization_03_active_workstream_execution_wave",
    sourceLane: "active_workstream_execution_wave",
    materializationLane: "whole_map_main_lane_resumed",
    materializationIntent: "resume_active_workstream_materialization_after_six_league_blocker_closed",
    expectedSourceGate: nextBatchQualityGatePath.replace(/\\/g, "/"),
    requiredBlockerState: "six_league_blocker_verified_closed",
    planStatus: "ready_for_materialization_quality_gate",
    isMainLane: true,
    isRepairBacklogLane: false,
    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  },
  {
    materializationPlanRowId: "post_six_league_materialization_04_reusable_family_acceleration",
    sourceLane: "reusable_family_acceleration",
    materializationLane: "whole_map_main_lane_resumed",
    materializationIntent: "resume_reusable_family_acceleration_materialization_after_six_league_blocker_closed",
    expectedSourceGate: nextBatchQualityGatePath.replace(/\\/g, "/"),
    requiredBlockerState: "six_league_blocker_verified_closed",
    planStatus: "ready_for_materialization_quality_gate",
    isMainLane: true,
    isRepairBacklogLane: false,
    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  },
  {
    materializationPlanRowId: "post_six_league_materialization_05_provider_family_repair_backlog",
    sourceLane: "provider_family_repair_backlog",
    materializationLane: "repair_backlog_lane",
    materializationIntent: "resume_provider_family_repair_backlog_materialization_after_six_league_blocker_closed",
    providerFamily: "sportomedia",
    expectedSourceGate: nextBatchQualityGatePath.replace(/\\/g, "/"),
    requiredBlockerState: "six_league_blocker_verified_closed",
    planStatus: "ready_for_materialization_quality_gate",
    isMainLane: false,
    isRepairBacklogLane: true,
    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  }
];

const blockedRows = materializationPlanRows.filter((row) => row.planStatus !== "ready_for_materialization_quality_gate");

const summary = {
  postSixLeagueFullMapMaterializationPlanReadCount: nextBatchPlan ? 3 : 2,
  resumeGatePassedCount: summaryOf(resumeGate).resumeGatePassedCount,
  sixLeagueBlockerClosedCount: summaryOf(resumeGate).sixLeagueBlockerClosedCount,
  sixLeagueVerifiedCompetitionCount: summaryOf(resumeGate).sixLeagueVerifiedCompetitionCount,
  sixLeagueVerifiedPromotedAreaCount: summaryOf(resumeGate).sixLeagueVerifiedPromotedAreaCount,

  sourceNextBatchQualityGatePassedCount:
    summaryOf(nextBatchQualityGate).postResumptionFullMapNextBatchPlanQualityGatePassedCount,
  sourceNextBatchQualityGateBlockedCount:
    summaryOf(nextBatchQualityGate).postResumptionFullMapNextBatchPlanQualityGateBlockedCount,

  materializationPlanRowCount: materializationPlanRows.length,
  mainLaneMaterializationPlanRowCount: countWhere(materializationPlanRows, (row) => row.isMainLane),
  repairBacklogMaterializationPlanRowCount: countWhere(materializationPlanRows, (row) => row.isRepairBacklogLane),
  sportomediaProviderFamilyRepairMaterializationPlanRowCount: countWhere(
    materializationPlanRows,
    (row) => row.providerFamily === "sportomedia"
  ),

  readyMaterializationPlanRowCount: countWhere(
    materializationPlanRows,
    (row) => row.planStatus === "ready_for_materialization_quality_gate"
  ),
  blockedMaterializationPlanRowCount: blockedRows.length,

  mayBuildPostSixLeagueFullMapMaterializationQualityGateCount: blockedRows.length === 0 ? 1 : 0,

  materializationPlanIsExecutionPermissionNowCount: 0,
  materializationPlanIsFetchPermissionNowCount: 0,
  materializationPlanIsSearchPermissionNowCount: 0,
  materializationPlanIsBroadSearchPermissionNowCount: 0,
  materializationPlanIsClassifierPermissionNowCount: 0,
  materializationPlanIsCanonicalWritePermissionNowCount: 0,
  materializationPlanIsProductionWritePermissionNowCount: 0,
  materializationPlanIsTruthAssertionPermissionNowCount: 0,

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
  job: "build-football-truth-post-six-league-full-map-materialization-plan-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_full_map_materialization_plan",
  dryRun: true,
  inputs: {
    postSixLeagueFullMapResumeGate: resumeGatePath,
    postResumptionFullMapNextBatchPlanQualityGate: nextBatchQualityGatePath,
    postResumptionFullMapNextBatchPlan: fs.existsSync(nextBatchPlanPath) ? nextBatchPlanPath : null
  },
  policy: {
    materializationPlanOnly: true,
    sixLeagueBlockerMustRemainVerifiedClosed: true,
    qualityGateRequiredBeforeAnyExecution: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  materializationPlanRows,
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
  throw new Error(`Post-six-league materialization plan blocked ${blockedRows.length} rows`);
}
