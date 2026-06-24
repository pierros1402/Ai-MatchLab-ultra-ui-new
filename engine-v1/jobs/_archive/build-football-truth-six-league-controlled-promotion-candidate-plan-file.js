import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const validationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-structured-evidence-validation-gate-2026-06-15",
  "six-league-structured-evidence-validation-gate-2026-06-15.json"
);

const candidatesPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-structured-evidence-candidates-2026-06-15",
  "six-league-structured-evidence-candidates-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-promotion-candidate-plan-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-controlled-promotion-candidate-plan-2026-06-15.json"
);

const expectedCompetitionAreas = {
  "esp.1": ["next_active_restart_date"],
  "esp.2": ["next_active_restart_date"],
  "nor.1": ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"],
  "nor.2": ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"],
  "swe.1": ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"],
  "swe.2": ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"]
};

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

function assertValidationGate(validation) {
  const s = validation.summary || {};

  if (s.validationRowCount !== 18) throw new Error(`Expected validationRowCount 18, got ${s.validationRowCount}`);
  if (s.approvedStructuredEvidenceCandidateCount !== 18) throw new Error(`Expected approvedStructuredEvidenceCandidateCount 18, got ${s.approvedStructuredEvidenceCandidateCount}`);
  if (s.blockedStructuredEvidenceCandidateCount !== 0) throw new Error(`Expected blockedStructuredEvidenceCandidateCount 0, got ${s.blockedStructuredEvidenceCandidateCount}`);
  if (s.allExpectedEvidenceAreasApprovedCompetitionCount !== 6) throw new Error(`Expected allExpectedEvidenceAreasApprovedCompetitionCount 6, got ${s.allExpectedEvidenceAreasApprovedCompetitionCount}`);
  if (s.missingApprovedEvidenceAreasCompetitionCount !== 0) throw new Error(`Expected missingApprovedEvidenceAreasCompetitionCount 0, got ${s.missingApprovedEvidenceAreasCompetitionCount}`);
  if (s.mayBuildSixLeagueControlledPromotionCandidatePlanCount !== 1) throw new Error("Expected mayBuildSixLeagueControlledPromotionCandidatePlanCount 1");

  [
    "validationGateIsExecutionPermissionNowCount",
    "validationGateIsFetchPermissionNowCount",
    "validationGateIsSearchPermissionNowCount",
    "validationGateIsBroadSearchPermissionNowCount",
    "validationGateIsClassifierPermissionNowCount",
    "validationGateIsCanonicalWritePermissionNowCount",
    "validationGateIsProductionWritePermissionNowCount",
    "validationGateIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueStructuredEvidenceValidationGateTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `validation.summary.${key}`));

  assertZero(validation.canonicalWrites, "validation.canonicalWrites");
  assertFalse(validation.productionWrite, "validation.productionWrite");
  assertFalse(validation.sourceFetch?.executed, "validation.sourceFetch.executed");
  assertFalse(validation.searchProviderUsed, "validation.searchProviderUsed");
  assertFalse(validation.broadSearchUsed, "validation.broadSearchUsed");
  assertFalse(validation.classifierExecuted, "validation.classifierExecuted");
}

function assertStructuredCandidates(candidatesArtifact) {
  const s = candidatesArtifact.summary || {};

  if (s.structuredEvidenceCandidateCount !== 18) throw new Error(`Expected structuredEvidenceCandidateCount 18, got ${s.structuredEvidenceCandidateCount}`);
  if (s.blockedStructuredEvidenceCandidateCount !== 0) throw new Error(`Expected blockedStructuredEvidenceCandidateCount 0, got ${s.blockedStructuredEvidenceCandidateCount}`);
  if (s.allExpectedStructuredEvidenceCandidatesBuiltCompetitionCount !== 6) throw new Error("Expected all 6 competition candidate rows built");

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueStructuredEvidenceCandidatesTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `candidates.summary.${key}`));

  assertZero(candidatesArtifact.canonicalWrites, "candidates.canonicalWrites");
  assertFalse(candidatesArtifact.productionWrite, "candidates.productionWrite");
  assertFalse(candidatesArtifact.sourceFetch?.executed, "candidates.sourceFetch.executed");
  assertFalse(candidatesArtifact.searchProviderUsed, "candidates.searchProviderUsed");
  assertFalse(candidatesArtifact.broadSearchUsed, "candidates.broadSearchUsed");
  assertFalse(candidatesArtifact.classifierExecuted, "candidates.classifierExecuted");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function canonicalTargetForArea(area) {
  const map = {
    standings_statistics: "standingsStats",
    fixtures_results: "fixturesResults",
    season_state: "seasonState",
    next_active_restart_date: "nextActiveRestartDate"
  };
  return map[area] || area;
}

function promotionLaneForArea(area) {
  const map = {
    standings_statistics: "controlled_canonical_standings_statistics_candidate",
    fixtures_results: "controlled_canonical_fixtures_results_candidate",
    season_state: "controlled_canonical_season_state_candidate",
    next_active_restart_date: "controlled_canonical_next_active_restart_date_candidate"
  };
  return map[area] || "controlled_canonical_unknown_candidate";
}

const validation = readJson(validationPath);
const candidatesArtifact = readJson(candidatesPath);

assertValidationGate(validation);
assertStructuredCandidates(candidatesArtifact);

const validationRows = Array.isArray(validation.validationRows) ? validation.validationRows : [];
const structuredEvidenceCandidates = Array.isArray(candidatesArtifact.structuredEvidenceCandidates)
  ? candidatesArtifact.structuredEvidenceCandidates
  : [];

if (validationRows.length !== 18) throw new Error(`Expected 18 validation rows, got ${validationRows.length}`);
if (structuredEvidenceCandidates.length !== 18) throw new Error(`Expected 18 structured candidates, got ${structuredEvidenceCandidates.length}`);

const approvedValidationRows = validationRows.filter(
  (row) => row.validationStatus === "approved_for_controlled_promotion_candidate_path"
);

if (approvedValidationRows.length !== 18) {
  throw new Error(`Expected 18 approved validation rows, got ${approvedValidationRows.length}`);
}

const candidateById = new Map(
  structuredEvidenceCandidates.map((candidate) => [candidate.structuredEvidenceCandidateId, candidate])
);

const promotionCandidateRows = approvedValidationRows.map((validationRow, index) => {
  const candidate = candidateById.get(validationRow.structuredEvidenceCandidateId);

  if (!candidate) {
    throw new Error(`Missing structured candidate for validation row ${validationRow.structuredEvidenceCandidateId}`);
  }

  return {
    promotionCandidateRowId: `six_league_controlled_promotion_candidate_${String(index + 1).padStart(2, "0")}`,
    validationRowId: validationRow.validationRowId,
    structuredEvidenceCandidateId: validationRow.structuredEvidenceCandidateId,
    competitionSlug: validationRow.competitionSlug,
    family: validationRow.family,
    evidenceArea: validationRow.evidenceArea,
    canonicalTargetArea: canonicalTargetForArea(validationRow.evidenceArea),
    controlledPromotionLane: promotionLaneForArea(validationRow.evidenceArea),
    sourceRawPayloadFile: validationRow.sourceRawPayloadFile,
    sourceRoutePurpose: validationRow.sourceRoutePurpose,
    routeBackedCandidate: validationRow.routeBackedCandidate === true,
    parserSignalBackedCandidate: validationRow.parserSignalBackedCandidate === true,
    dateCandidateCount: validationRow.dateCandidateCount || 0,
    structuredScriptHintCount: validationRow.structuredScriptHintCount || 0,
    sourceResponseRawTextLength: candidate.responseRawTextLength || 0,
    promotionCandidateStatus: "ready_for_controlled_promotion_preview_runner",
    canonicalWriteRequiresExplicitApproval: true,
    truthAssertionRequiresExplicitApproval: true,
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

const competitionPromotionPackages = Object.entries(expectedCompetitionAreas).map(([competitionSlug, expectedAreas]) => {
  const rows = promotionCandidateRows.filter((row) => row.competitionSlug === competitionSlug);
  const family = rows[0]?.family || "unknown";
  const candidateAreas = unique(rows.map((row) => row.evidenceArea)).sort();
  const missingCandidateAreas = expectedAreas.filter((area) => !candidateAreas.includes(area));

  return {
    competitionPromotionPackageId: `${competitionSlug}_controlled_promotion_candidate_package`,
    competitionSlug,
    family,
    expectedAreas,
    candidateAreas,
    missingCandidateAreas,
    promotionCandidateRowCount: rows.length,
    packageStatus:
      missingCandidateAreas.length === 0
        ? "ready_for_controlled_promotion_preview_runner"
        : "blocked_missing_promotion_candidate_areas",
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const familyPromotionPackages = ["laliga", "norway_ntf", "sportomedia"].map((family) => {
  const rows = promotionCandidateRows.filter((row) => row.family === family);
  const competitions = unique(rows.map((row) => row.competitionSlug)).sort();
  const evidenceAreas = unique(rows.map((row) => row.evidenceArea)).sort();

  return {
    familyPromotionPackageId: `${family}_controlled_promotion_candidate_package`,
    family,
    targetCompetitions: competitions,
    evidenceAreas,
    promotionCandidateRowCount: rows.length,
    packageStatus: "ready_for_controlled_promotion_preview_runner",
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const blockedRows = [
  ...promotionCandidateRows.filter((row) => row.routeBackedCandidate !== true).map((row) => ({
    promotionCandidateRowId: row.promotionCandidateRowId,
    blockReason: "not_route_backed_candidate"
  })),
  ...competitionPromotionPackages
    .filter((row) => row.missingCandidateAreas.length > 0)
    .map((row) => ({
      competitionSlug: row.competitionSlug,
      blockReason: "missing_competition_promotion_candidate_areas",
      missingCandidateAreas: row.missingCandidateAreas
    }))
];

const summary = {
  sixLeagueControlledPromotionCandidatePlanReadCount: 1,
  sourceValidationRowCount: validationRows.length,
  sourceApprovedValidationRowCount: approvedValidationRows.length,
  sourceStructuredEvidenceCandidateCount: structuredEvidenceCandidates.length,

  promotionCandidateRowCount: promotionCandidateRows.length,
  competitionPromotionPackageCount: competitionPromotionPackages.length,
  familyPromotionPackageCount: familyPromotionPackages.length,
  blockedPromotionCandidateRowCount: blockedRows.length,

  laligaPromotionCandidateCount: countWhere(promotionCandidateRows, (row) => row.family === "laliga"),
  norwayNtfPromotionCandidateCount: countWhere(promotionCandidateRows, (row) => row.family === "norway_ntf"),
  sportomediaPromotionCandidateCount: countWhere(promotionCandidateRows, (row) => row.family === "sportomedia"),

  standingsStatisticsPromotionCandidateCount: countWhere(promotionCandidateRows, (row) => row.evidenceArea === "standings_statistics"),
  fixturesResultsPromotionCandidateCount: countWhere(promotionCandidateRows, (row) => row.evidenceArea === "fixtures_results"),
  seasonStatePromotionCandidateCount: countWhere(promotionCandidateRows, (row) => row.evidenceArea === "season_state"),
  nextActiveRestartDatePromotionCandidateCount: countWhere(promotionCandidateRows, (row) => row.evidenceArea === "next_active_restart_date"),

  allCompetitionPromotionPackagesReadyCount: countWhere(
    competitionPromotionPackages,
    (row) => row.packageStatus === "ready_for_controlled_promotion_preview_runner"
  ),
  blockedCompetitionPromotionPackageCount: countWhere(
    competitionPromotionPackages,
    (row) => row.packageStatus !== "ready_for_controlled_promotion_preview_runner"
  ),

  mayBuildSixLeagueControlledPromotionPreviewRunnerCount: blockedRows.length === 0 ? 1 : 0,

  promotionPlanIsExecutionPermissionNowCount: 0,
  promotionPlanIsFetchPermissionNowCount: 0,
  promotionPlanIsSearchPermissionNowCount: 0,
  promotionPlanIsBroadSearchPermissionNowCount: 0,
  promotionPlanIsClassifierPermissionNowCount: 0,
  promotionPlanIsCanonicalWritePermissionNowCount: 0,
  promotionPlanIsProductionWritePermissionNowCount: 0,
  promotionPlanIsTruthAssertionPermissionNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueControlledPromotionCandidatePlanTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "build-football-truth-six-league-controlled-promotion-candidate-plan-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_controlled_promotion_candidate_plan_artifact",
  dryRun: true,
  inputs: {
    sixLeagueStructuredEvidenceValidationGate: validationPath,
    sixLeagueStructuredEvidenceCandidates: candidatesPath
  },
  policy: {
    promotionPlanOnly: true,
    promotionCandidatesAreNotCanonicalWrites: true,
    controlledPromotionPreviewRunnerRequiredBeforeAnyWrite: true,
    canonicalWriteRequiresExplicitApproval: true,
    truthAssertionRequiresExplicitApproval: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  promotionCandidateRows,
  competitionPromotionPackages,
  familyPromotionPackages,
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
  throw new Error(`Promotion candidate plan blocked ${blockedRows.length} rows/packages`);
}
