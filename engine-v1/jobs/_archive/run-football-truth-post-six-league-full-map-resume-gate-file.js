import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const sixLeagueVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-write-verification-2026-06-15",
  "six-league-controlled-write-verification-2026-06-15.json"
);

const nextBatchQualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-resumption-full-map-next-batch-plan-quality-gate-2026-06-15",
  "post-resumption-full-map-next-batch-plan-quality-gate-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-six-league-full-map-resume-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-six-league-full-map-resume-gate-2026-06-15.json"
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

function validateSixLeagueVerification(input) {
  const s = input.summary || {};

  if (s.verifiedCompetitionCount !== 6) throw new Error(`Expected verifiedCompetitionCount=6, got ${s.verifiedCompetitionCount}`);
  if (s.blockedCompetitionVerificationCount !== 0) throw new Error(`Expected blockedCompetitionVerificationCount=0, got ${s.blockedCompetitionVerificationCount}`);
  if (s.verifiedPromotedAreaCount !== 18) throw new Error(`Expected verifiedPromotedAreaCount=18, got ${s.verifiedPromotedAreaCount}`);
  if (s.expectedPromotedAreaCount !== 18) throw new Error(`Expected expectedPromotedAreaCount=18, got ${s.expectedPromotedAreaCount}`);
  if (s.mayResumePostSixLeagueFullMapMaterializationCount !== 1) throw new Error("Expected mayResumePostSixLeagueFullMapMaterializationCount=1");

  [
    "verificationIsExecutionPermissionNowCount",
    "verificationIsFetchPermissionNowCount",
    "verificationIsSearchPermissionNowCount",
    "verificationIsBroadSearchPermissionNowCount",
    "verificationIsClassifierPermissionNowCount",
    "verificationIsCanonicalWritePermissionNowCount",
    "verificationIsProductionWritePermissionNowCount",
    "verificationIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "truthAssertionExecutedNowCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `sixLeagueVerification.summary.${key}`));

  assertFalse(input.productionWrite, "sixLeagueVerification.productionWrite");
  assertZero(input.canonicalWrites, "sixLeagueVerification.canonicalWrites");
  assertFalse(input.sourceFetch?.executed, "sixLeagueVerification.sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "sixLeagueVerification.searchProviderUsed");
  assertFalse(input.broadSearchUsed, "sixLeagueVerification.broadSearchUsed");
  assertFalse(input.classifierExecuted, "sixLeagueVerification.classifierExecuted");
}

function validateNextBatchQualityGate(input) {
  const s = input.summary || input;

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

const sixLeagueVerification = readJson(sixLeagueVerificationPath);
const nextBatchQualityGate = readJson(nextBatchQualityGatePath);

validateSixLeagueVerification(sixLeagueVerification);
validateNextBatchQualityGate(nextBatchQualityGate);

const resumeRows = [
  {
    resumeGateRowId: "post_six_league_resume_gate_01_six_league_blocker_closed",
    sourceDiagnostic: sixLeagueVerificationPath.replace(/\\/g, "/"),
    resumeCondition: "six_league_source_authority_memory_write_verified",
    conditionStatus: "passed",
    verifiedCompetitionCount: sixLeagueVerification.summary.verifiedCompetitionCount,
    verifiedPromotedAreaCount: sixLeagueVerification.summary.verifiedPromotedAreaCount,
    mayResume: true
  },
  {
    resumeGateRowId: "post_six_league_resume_gate_02_full_map_next_batch_quality_gate_still_valid",
    sourceDiagnostic: nextBatchQualityGatePath.replace(/\\/g, "/"),
    resumeCondition: "post_resumption_full_map_next_batch_plan_quality_gate_passed",
    conditionStatus: "passed",
    qualityGatePassedCount: nextBatchQualityGate.summary.postResumptionFullMapNextBatchPlanQualityGatePassedCount,
    qualityGateBlockedCount: nextBatchQualityGate.summary.postResumptionFullMapNextBatchPlanQualityGateBlockedCount,
    mayResume: true
  }
];

const summary = {
  postSixLeagueFullMapResumeGateReadCount: 2,
  resumeGateRowCount: resumeRows.length,
  resumeGatePassedCount: resumeRows.filter((row) => row.conditionStatus === "passed").length,
  resumeGateBlockedCount: resumeRows.filter((row) => row.conditionStatus !== "passed").length,

  sixLeagueBlockerClosedCount: 1,
  sixLeagueVerifiedCompetitionCount: sixLeagueVerification.summary.verifiedCompetitionCount,
  sixLeagueVerifiedPromotedAreaCount: sixLeagueVerification.summary.verifiedPromotedAreaCount,

  postResumptionFullMapNextBatchPlanQualityGateStillValidCount: 1,
  postResumptionFullMapNextBatchPlanQualityGatePassedCount:
    nextBatchQualityGate.summary.postResumptionFullMapNextBatchPlanQualityGatePassedCount,

  mayBuildPostSixLeagueFullMapMaterializationPlanCount: 1,
  mayResumePostSixLeagueFullMapMaterializationCount: 1,

  resumeGateIsExecutionPermissionNowCount: 0,
  resumeGateIsFetchPermissionNowCount: 0,
  resumeGateIsSearchPermissionNowCount: 0,
  resumeGateIsBroadSearchPermissionNowCount: 0,
  resumeGateIsClassifierPermissionNowCount: 0,
  resumeGateIsCanonicalWritePermissionNowCount: 0,
  resumeGateIsProductionWritePermissionNowCount: 0,
  resumeGateIsTruthAssertionPermissionNowCount: 0,

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
  job: "run-football-truth-post-six-league-full-map-resume-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_post_six_league_full_map_resume_gate",
  dryRun: true,
  inputs: {
    sixLeagueControlledWriteVerification: sixLeagueVerificationPath,
    postResumptionFullMapNextBatchPlanQualityGate: nextBatchQualityGatePath
  },
  policy: {
    resumeGateOnly: true,
    sixLeagueBlockerMustBeClosedBeforeFullMapMaterialization: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  resumeRows,
  blockedRows: [],
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
