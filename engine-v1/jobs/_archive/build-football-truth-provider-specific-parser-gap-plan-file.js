import fs from "node:fs";
import path from "node:path";

const reviewBoardPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-standings-season-state-extraction-review-board-2026-06-15",
  "controlled-standings-season-state-extraction-review-board-2026-06-15.json"
);

const laligaVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-canonical-standings-candidate-write-verification-2026-06-15",
  "laliga-canonical-standings-candidate-write-verification-2026-06-15.json"
);

const extractionPlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "standings-season-state-extraction-plan-2026-06-15",
  "standings-season-state-extraction-plan-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "provider-specific-parser-gap-plan-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "provider-specific-parser-gap-plan-2026-06-15.json"
);

const expectedGapCompetitions = ["nor.1", "nor.2", "swe.1", "swe.2"];
const expectedProviderFamilies = ["norway_ntf", "sportomedia"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))].sort();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function assertEqual(name, actual, expected, checks) {
  const passed = Object.is(actual, expected);
  checks.push({ name, actual, expected, passed });
}

function assertArrayEqual(name, actual, expected, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, actual, expected, passed });
}

function assertAll(name, rows, predicate, checks) {
  const failedRows = rows
    .map((row, index) => ({ index, row }))
    .filter(({ row }) => !predicate(row));

  checks.push({
    name,
    actual: failedRows.length,
    expected: 0,
    passed: failedRows.length === 0,
    failedRowIndexes: failedRows.map(({ index }) => index)
  });
}

function providerRoute(providerFamily) {
  if (providerFamily === "norway_ntf") {
    return {
      parserRoute: "norway_ntf_tabell_route_specific_parser",
      routeStatus: "ready_for_controlled_provider_specific_parser_runner",
      expectedSignals: ["tabell", "terminliste", "kamper", "ntf"],
      targetOutputKind: "standings_candidate_and_season_state_candidate",
      controlledFetchAllowedNext: true,
      recommendedRunner: "run-football-truth-norway-ntf-standings-season-state-parser-runner-file.js"
    };
  }

  if (providerFamily === "sportomedia") {
    return {
      parserRoute: "sportomedia_competition_page_or_graphql_route_specific_parser",
      routeStatus: "ready_for_controlled_provider_specific_parser_runner",
      expectedSignals: ["sportomedia", "standings", "matches", "graphql"],
      targetOutputKind: "standings_candidate_and_season_state_candidate",
      controlledFetchAllowedNext: true,
      recommendedRunner: "run-football-truth-sportomedia-standings-season-state-parser-runner-file.js"
    };
  }

  return {
    parserRoute: "unsupported_provider_specific_parser_route",
    routeStatus: "blocked_unsupported_provider_family",
    expectedSignals: [],
    targetOutputKind: "unknown",
    controlledFetchAllowedNext: false,
    recommendedRunner: null
  };
}

function buildGapPlanRows(providerParserGapRows, extractionPlanRows) {
  return providerParserGapRows.map((gapRow, index) => {
    const planRow = extractionPlanRows.find((row) => row.competitionSlug === gapRow.competitionSlug);
    const route = providerRoute(gapRow.providerFamily);

    return {
      providerSpecificParserGapPlanRowId: `provider_specific_parser_gap_plan_${String(index + 1).padStart(2, "0")}`,
      sourceProviderParserGapRowId: gapRow.providerParserGapRowId,
      sourceStandingsSeasonStateExtractionPlanRowId: planRow?.standingsSeasonStateExtractionPlanRowId ?? null,
      competitionSlug: gapRow.competitionSlug,
      providerFamily: gapRow.providerFamily,
      originalExtractionRoute: gapRow.extractionRoute,
      parserRoute: route.parserRoute,
      routeStatus: route.routeStatus,
      targetOutputKind: route.targetOutputKind,
      expectedSignals: route.expectedSignals,
      recommendedRunner: route.recommendedRunner,
      okFetchCountFromGenericRunner: Number(gapRow.okFetchCount ?? 0),
      genericStandingCandidateRowCount: Number(gapRow.standingCandidateRowCount ?? 0),
      genericSeasonStateCandidateRowCount: Number(gapRow.seasonStateCandidateRowCount ?? 0),
      urls: Array.isArray(planRow?.urls) ? planRow.urls : [],
      finalUrls: Array.isArray(planRow?.finalUrls) ? planRow.finalUrls : [],
      evidenceSha256: Array.isArray(planRow?.evidenceSha256) ? planRow.evidenceSha256 : [],
      controlledFetchAllowedNext: route.controlledFetchAllowedNext,
      broadSearchAllowedNext: false,
      classifierAllowedNext: false,
      canonicalWriteAllowedNext: false,
      productionWriteAllowedNext: false,
      truthAssertionAllowedNext: false,
      gapPlanStatus: route.routeStatus === "ready_for_controlled_provider_specific_parser_runner"
        ? "ready"
        : "blocked"
    };
  });
}

fs.mkdirSync(outputDir, { recursive: true });

for (const requiredPath of [reviewBoardPath, laligaVerificationPath, extractionPlanPath]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`Missing required diagnostic: ${requiredPath}`);
}

const reviewBoard = readJson(reviewBoardPath);
const laligaVerification = readJson(laligaVerificationPath);
const extractionPlan = readJson(extractionPlanPath);

const reviewSummary = reviewBoard.summary && typeof reviewBoard.summary === "object" ? reviewBoard.summary : {};
const verificationSummary = laligaVerification.summary && typeof laligaVerification.summary === "object" ? laligaVerification.summary : {};
const extractionPlanSummary = extractionPlan.summary && typeof extractionPlan.summary === "object" ? extractionPlan.summary : {};

const providerParserGapRows = Array.isArray(reviewBoard.providerParserGapRows) ? reviewBoard.providerParserGapRows : [];
const extractionPlanRows = Array.isArray(extractionPlan.extractionPlanRows) ? extractionPlan.extractionPlanRows : [];
const gapPlanRows = buildGapPlanRows(providerParserGapRows, extractionPlanRows);

const checks = [];

assertEqual("reviewBoardStatus", reviewSummary.controlledStandingsSeasonStateExtractionReviewBoardStatus, "passed", checks);
assertEqual("reviewMayBuildProviderSpecificParserGapPlanCount", Number(reviewSummary.mayBuildProviderSpecificParserGapPlanCount ?? 0), 1, checks);
assertEqual("reviewProviderParserGapRowCount", Number(reviewSummary.providerParserGapRowCount ?? 0), 4, checks);
assertArrayEqual("reviewProviderParserGapCompetitions", reviewSummary.providerParserGapCompetitions, expectedGapCompetitions, checks);

assertEqual("laligaVerificationStatus", verificationSummary.laligaCanonicalStandingCandidateWriteVerificationStatus, "passed", checks);
assertEqual("laligaCanonicalWritesVerifiedCount", Number(verificationSummary.canonicalWritesVerifiedCount ?? 0), 1, checks);
assertEqual("laligaVerificationMayBuildProviderSpecificParserGapPlanCount", Number(verificationSummary.mayBuildProviderSpecificParserGapPlanCount ?? 0), 1, checks);

assertEqual("extractionPlanStatus", extractionPlanSummary.standingsSeasonStateExtractionPlanStatus, "passed", checks);
assertEqual("extractionPlanRowCount", Number(extractionPlanSummary.extractionPlanRowCount ?? 0), 6, checks);

assertEqual("providerParserGapRowCount", providerParserGapRows.length, 4, checks);
assertEqual("gapPlanRowCount", gapPlanRows.length, 4, checks);
assertArrayEqual("gapPlanCompetitions", uniqueSorted(gapPlanRows.map((row) => row.competitionSlug)), expectedGapCompetitions, checks);
assertArrayEqual("gapPlanProviderFamilies", uniqueSorted(gapPlanRows.map((row) => row.providerFamily)), expectedProviderFamilies, checks);

assertAll("gapRowsHaveOkFetch", gapPlanRows, (row) => row.okFetchCountFromGenericRunner >= 1, checks);
assertAll("gapRowsHaveSeasonStateCandidates", gapPlanRows, (row) => row.genericSeasonStateCandidateRowCount >= 1, checks);
assertAll("gapRowsHaveNoGenericStandingsCandidates", gapPlanRows, (row) => row.genericStandingCandidateRowCount === 0, checks);
assertAll("gapRowsHaveUrls", gapPlanRows, (row) => Array.isArray(row.urls) && row.urls.length > 0, checks);
assertAll("gapRowsHaveFinalUrls", gapPlanRows, (row) => Array.isArray(row.finalUrls) && row.finalUrls.length > 0, checks);
assertAll("gapRowsHaveEvidenceSha", gapPlanRows, (row) => Array.isArray(row.evidenceSha256) && row.evidenceSha256.length > 0, checks);
assertAll("gapRowsReady", gapPlanRows, (row) => row.gapPlanStatus === "ready", checks);
assertAll("gapRowsAllowOnlyControlledFetchNext", gapPlanRows, (row) => row.controlledFetchAllowedNext === true && row.broadSearchAllowedNext === false, checks);
assertAll("gapRowsKeepClassifierBlocked", gapPlanRows, (row) => row.classifierAllowedNext === false, checks);
assertAll("gapRowsKeepCanonicalWriteBlocked", gapPlanRows, (row) => row.canonicalWriteAllowedNext === false, checks);
assertAll("gapRowsKeepProductionWriteBlocked", gapPlanRows, (row) => row.productionWriteAllowedNext === false, checks);
assertAll("gapRowsKeepTruthAssertionBlocked", gapPlanRows, (row) => row.truthAssertionAllowedNext === false, checks);

assertEqual("reviewFetchExecutedNowCount", Number(reviewSummary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("reviewSearchExecutedNowCount", Number(reviewSummary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("reviewBroadSearchExecutedNowCount", Number(reviewSummary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("reviewClassifierExecutedNowCount", Number(reviewSummary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("reviewCanonicalWriteExecutedNowCount", Number(reviewSummary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("reviewProductionWriteExecutedNowCount", Number(reviewSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("reviewTruthAssertionExecutedNowCount", Number(reviewSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);

const blockedGapPlanCheckCount = checks.filter((check) => !check.passed).length;
const passedGapPlanCheckCount = checks.filter((check) => check.passed).length;

const plan = {
  output: outputPath,
  job: "build-football-truth-provider-specific-parser-gap-plan-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    reviewBoardPath,
    laligaVerificationPath,
    extractionPlanPath
  },
  policy: {
    planOnly: true,
    providerSpecificParserGapPlan: true,
    nextStepMayUseControlledFetchFromTrustedExtractionPlanUrls: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    providerSpecificParserGapPlanReadCount: 3,
    reviewBoardStatus: reviewSummary.controlledStandingsSeasonStateExtractionReviewBoardStatus,
    laligaVerificationStatus: verificationSummary.laligaCanonicalStandingCandidateWriteVerificationStatus,

    providerParserGapRowCount: providerParserGapRows.length,
    providerSpecificParserGapPlanRowCount: gapPlanRows.length,
    providerSpecificParserGapCompetitionCount: uniqueSorted(gapPlanRows.map((row) => row.competitionSlug)).length,
    providerSpecificParserGapProviderFamilyCount: uniqueSorted(gapPlanRows.map((row) => row.providerFamily)).length,

    gapPlanCompetitions: uniqueSorted(gapPlanRows.map((row) => row.competitionSlug)),
    gapPlanProviderFamilies: uniqueSorted(gapPlanRows.map((row) => row.providerFamily)),
    gapPlanRowsByProviderFamily: countBy(gapPlanRows, "providerFamily"),
    gapPlanRowsByParserRoute: countBy(gapPlanRows, "parserRoute"),

    gapPlanCheckCount: checks.length,
    passedGapPlanCheckCount,
    blockedGapPlanCheckCount,
    providerSpecificParserGapPlanStatus: blockedGapPlanCheckCount === 0 ? "passed" : "blocked",
    providerSpecificParserGapPlanPassedCount: blockedGapPlanCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfParserRunnerCount: blockedGapPlanCheckCount === 0 ? 1 : 0,
    mayBuildSportomediaParserRunnerCount: blockedGapPlanCheckCount === 0 ? 1 : 0,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    canonicalWrites: 0,
    productionWrite: false,
    truthAssertion: false
  },
  checks,
  gapPlanRows
};

writeJson(outputPath, plan);

console.log(JSON.stringify({
  output: plan.output,
  providerSpecificParserGapPlanStatus: plan.summary.providerSpecificParserGapPlanStatus,
  providerSpecificParserGapPlanRowCount: plan.summary.providerSpecificParserGapPlanRowCount,
  gapPlanCompetitions: plan.summary.gapPlanCompetitions,
  gapPlanRowsByProviderFamily: plan.summary.gapPlanRowsByProviderFamily,
  gapPlanRowsByParserRoute: plan.summary.gapPlanRowsByParserRoute,
  mayBuildNorwayNtfParserRunnerCount: plan.summary.mayBuildNorwayNtfParserRunnerCount,
  mayBuildSportomediaParserRunnerCount: plan.summary.mayBuildSportomediaParserRunnerCount,
  productionWriteExecutedNowCount: plan.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: plan.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedGapPlanCheckCount !== 0) {
  process.exitCode = 1;
}
