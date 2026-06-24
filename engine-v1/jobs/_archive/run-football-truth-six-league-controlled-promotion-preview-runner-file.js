import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-promotion-candidate-plan-2026-06-15",
  "six-league-controlled-promotion-candidate-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-promotion-preview-runner-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-controlled-promotion-preview-runner-2026-06-15.json"
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

function assertPromotionPlan(input) {
  const s = input.summary || {};

  if (s.promotionCandidateRowCount !== 18) throw new Error(`Expected promotionCandidateRowCount 18, got ${s.promotionCandidateRowCount}`);
  if (s.competitionPromotionPackageCount !== 6) throw new Error(`Expected competitionPromotionPackageCount 6, got ${s.competitionPromotionPackageCount}`);
  if (s.familyPromotionPackageCount !== 3) throw new Error(`Expected familyPromotionPackageCount 3, got ${s.familyPromotionPackageCount}`);
  if (s.blockedPromotionCandidateRowCount !== 0) throw new Error(`Expected blockedPromotionCandidateRowCount 0, got ${s.blockedPromotionCandidateRowCount}`);
  if (s.allCompetitionPromotionPackagesReadyCount !== 6) throw new Error(`Expected allCompetitionPromotionPackagesReadyCount 6, got ${s.allCompetitionPromotionPackagesReadyCount}`);
  if (s.mayBuildSixLeagueControlledPromotionPreviewRunnerCount !== 1) throw new Error("Expected mayBuildSixLeagueControlledPromotionPreviewRunnerCount 1");

  [
    "promotionPlanIsExecutionPermissionNowCount",
    "promotionPlanIsFetchPermissionNowCount",
    "promotionPlanIsSearchPermissionNowCount",
    "promotionPlanIsBroadSearchPermissionNowCount",
    "promotionPlanIsClassifierPermissionNowCount",
    "promotionPlanIsCanonicalWritePermissionNowCount",
    "promotionPlanIsProductionWritePermissionNowCount",
    "promotionPlanIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueControlledPromotionCandidatePlanTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `summary.${key}`));

  assertZero(input.canonicalWrites, "canonicalWrites");
  assertFalse(input.productionWrite, "productionWrite");
  assertFalse(input.sourceFetch?.executed, "sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "searchProviderUsed");
  assertFalse(input.broadSearchUsed, "broadSearchUsed");
  assertFalse(input.classifierExecuted, "classifierExecuted");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

const input = readJson(inputPath);
assertPromotionPlan(input);

const promotionRows = Array.isArray(input.promotionCandidateRows) ? input.promotionCandidateRows : [];
const competitionPackages = Array.isArray(input.competitionPromotionPackages) ? input.competitionPromotionPackages : [];
const familyPackages = Array.isArray(input.familyPromotionPackages) ? input.familyPromotionPackages : [];

if (promotionRows.length !== 18) throw new Error(`Expected 18 promotion rows, got ${promotionRows.length}`);
if (competitionPackages.length !== 6) throw new Error(`Expected 6 competition packages, got ${competitionPackages.length}`);
if (familyPackages.length !== 3) throw new Error(`Expected 3 family packages, got ${familyPackages.length}`);

const previewRows = promotionRows.map((row, index) => ({
  previewRowId: `six_league_controlled_promotion_preview_${String(index + 1).padStart(2, "0")}`,
  promotionCandidateRowId: row.promotionCandidateRowId,
  competitionSlug: row.competitionSlug,
  family: row.family,
  evidenceArea: row.evidenceArea,
  canonicalTargetArea: row.canonicalTargetArea,
  controlledPromotionLane: row.controlledPromotionLane,
  sourceRawPayloadFile: row.sourceRawPayloadFile,
  sourceRoutePurpose: row.sourceRoutePurpose,
  routeBackedCandidate: row.routeBackedCandidate,
  parserSignalBackedCandidate: row.parserSignalBackedCandidate,
  previewOperation: "would_stage_canonical_truth_promotion_if_explicit_write_approval_is_granted",
  previewStatus: "ready_for_explicit_write_approval_gate",
  canonicalWriteRequiresExplicitApproval: true,
  truthAssertionRequiresExplicitApproval: true,
  isExecutionPermissionNow: false,
  isFetchPermissionNow: false,
  isSearchPermissionNow: false,
  isBroadSearchPermissionNow: false,
  isClassifierPermissionNow: false,
  isCanonicalWritePermissionNow: false,
  isProductionWritePermissionNow: false,
  isTruthAssertionPermissionNow: false,
  canonicalWriteExecutedNow: false,
  productionWriteExecutedNow: false,
  truthAssertedNow: false
}));

const competitionPreviewRows = competitionPackages.map((pkg) => {
  const rows = previewRows.filter((row) => row.competitionSlug === pkg.competitionSlug);
  const previewAreas = unique(rows.map((row) => row.evidenceArea)).sort();
  const expectedAreas = Array.isArray(pkg.expectedAreas) ? pkg.expectedAreas : [];
  const missingPreviewAreas = expectedAreas.filter((area) => !previewAreas.includes(area));

  return {
    competitionSlug: pkg.competitionSlug,
    family: pkg.family,
    expectedAreas,
    previewAreas,
    missingPreviewAreas,
    previewRowCount: rows.length,
    previewStatus:
      missingPreviewAreas.length === 0
        ? "ready_for_explicit_write_approval_gate"
        : "blocked_missing_preview_areas",
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const familyPreviewRows = familyPackages.map((pkg) => {
  const rows = previewRows.filter((row) => row.family === pkg.family);

  return {
    family: pkg.family,
    targetCompetitions: unique(rows.map((row) => row.competitionSlug)).sort(),
    previewAreas: unique(rows.map((row) => row.evidenceArea)).sort(),
    previewRowCount: rows.length,
    previewStatus: "ready_for_explicit_write_approval_gate",
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const blockedRows = [
  ...previewRows.filter((row) => row.routeBackedCandidate !== true).map((row) => ({
    previewRowId: row.previewRowId,
    blockReason: "not_route_backed_candidate"
  })),
  ...competitionPreviewRows
    .filter((row) => row.missingPreviewAreas.length > 0)
    .map((row) => ({
      competitionSlug: row.competitionSlug,
      blockReason: "missing_competition_preview_areas",
      missingPreviewAreas: row.missingPreviewAreas
    }))
];

const summary = {
  sixLeagueControlledPromotionPreviewRunnerReadCount: 1,
  sourcePromotionCandidateRowCount: promotionRows.length,
  sourceCompetitionPromotionPackageCount: competitionPackages.length,
  sourceFamilyPromotionPackageCount: familyPackages.length,

  promotionPreviewRowCount: previewRows.length,
  competitionPromotionPreviewRowCount: competitionPreviewRows.length,
  familyPromotionPreviewRowCount: familyPreviewRows.length,
  blockedPromotionPreviewRowCount: blockedRows.length,

  laligaPromotionPreviewCount: countWhere(previewRows, (row) => row.family === "laliga"),
  norwayNtfPromotionPreviewCount: countWhere(previewRows, (row) => row.family === "norway_ntf"),
  sportomediaPromotionPreviewCount: countWhere(previewRows, (row) => row.family === "sportomedia"),

  standingsStatisticsPromotionPreviewCount: countWhere(previewRows, (row) => row.evidenceArea === "standings_statistics"),
  fixturesResultsPromotionPreviewCount: countWhere(previewRows, (row) => row.evidenceArea === "fixtures_results"),
  seasonStatePromotionPreviewCount: countWhere(previewRows, (row) => row.evidenceArea === "season_state"),
  nextActiveRestartDatePromotionPreviewCount: countWhere(previewRows, (row) => row.evidenceArea === "next_active_restart_date"),

  allCompetitionPromotionPreviewsReadyCount: countWhere(
    competitionPreviewRows,
    (row) => row.previewStatus === "ready_for_explicit_write_approval_gate"
  ),
  blockedCompetitionPromotionPreviewCount: countWhere(
    competitionPreviewRows,
    (row) => row.previewStatus !== "ready_for_explicit_write_approval_gate"
  ),

  mayBuildSixLeagueExplicitWriteApprovalGateCount: blockedRows.length === 0 ? 1 : 0,

  previewRunnerIsExecutionPermissionNowCount: 0,
  previewRunnerIsFetchPermissionNowCount: 0,
  previewRunnerIsSearchPermissionNowCount: 0,
  previewRunnerIsBroadSearchPermissionNowCount: 0,
  previewRunnerIsClassifierPermissionNowCount: 0,
  previewRunnerIsCanonicalWritePermissionNowCount: 0,
  previewRunnerIsProductionWritePermissionNowCount: 0,
  previewRunnerIsTruthAssertionPermissionNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueControlledPromotionPreviewTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "run-football-truth-six-league-controlled-promotion-preview-runner-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_controlled_promotion_preview_runner_artifact",
  dryRun: true,
  inputs: {
    sixLeagueControlledPromotionCandidatePlan: inputPath
  },
  policy: {
    previewOnly: true,
    previewDoesNotWriteCanonical: true,
    previewDoesNotAssertTruth: true,
    explicitWriteApprovalGateRequiredBeforeAnyWrite: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  previewRows,
  competitionPreviewRows,
  familyPreviewRows,
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
  throw new Error(`Promotion preview blocked ${blockedRows.length} rows/packages`);
}
