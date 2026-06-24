import fs from "node:fs";
import path from "node:path";

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-execution-runner-verification-2026-06-15",
  "canonical-write-execution-runner-verification-2026-06-15.json"
);

const canonicalEvidencePointerPath = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-evidence-pointers",
  "controlled-real-source-evidence-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "standings-season-state-extraction-plan-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "standings-season-state-extraction-plan-2026-06-15.json"
);

const expectedCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];
const expectedProviderFamilies = ["laliga", "norway_ntf", "sportomedia"];

const providerExtractionRoute = {
  laliga: {
    extractionRoute: "trusted_laliga_standings_page_embedded_data_probe",
    expectedSignals: ["standing", "classification", "laliga"],
    supportedResultTypes: ["standings_candidate", "season_state_candidate"]
  },
  norway_ntf: {
    extractionRoute: "trusted_ntf_tabell_page_embedded_data_probe",
    expectedSignals: ["tabell", "terminliste", "kamper"],
    supportedResultTypes: ["standings_candidate", "season_state_candidate"]
  },
  sportomedia: {
    extractionRoute: "trusted_sportomedia_competition_page_or_graphql_probe",
    expectedSignals: ["sportomedia", "standings", "matches"],
    supportedResultTypes: ["standings_candidate", "season_state_candidate"]
  }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
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

function planRow(canonicalRow, index) {
  const providerFamily = Array.isArray(canonicalRow.providerFamilies) ? canonicalRow.providerFamilies[0] : null;
  const route = providerExtractionRoute[providerFamily] ?? {
    extractionRoute: "unsupported_provider_family",
    expectedSignals: [],
    supportedResultTypes: []
  };

  const sourceEvidencePointers = Array.isArray(canonicalRow.sourceEvidencePointers)
    ? canonicalRow.sourceEvidencePointers
    : [];

  return {
    standingsSeasonStateExtractionPlanRowId: `standings_season_state_extraction_plan_${String(index + 1).padStart(2, "0")}`,
    sourceCanonicalEvidencePointerRowId: canonicalRow.canonicalEvidencePointerRowId,
    competitionSlug: canonicalRow.competitionSlug,
    providerFamily,
    providerFamilies: canonicalRow.providerFamilies,
    extractionRoute: route.extractionRoute,
    expectedSignals: route.expectedSignals,
    supportedResultTypes: route.supportedResultTypes,
    sourceEvidencePointerCount: sourceEvidencePointers.length,
    sourceAcceptedEvidenceRowIds: canonicalRow.sourceAcceptedEvidenceRowIds,
    urls: uniqueSorted(sourceEvidencePointers.map((pointer) => pointer.url)),
    finalUrls: uniqueSorted(sourceEvidencePointers.map((pointer) => pointer.finalUrl)),
    evidenceSha256: canonicalRow.evidenceSha256,
    markerHits: uniqueSorted(sourceEvidencePointers.flatMap((pointer) => Array.isArray(pointer.markerHits) ? pointer.markerHits : [])),
    sourceStatusCodes: uniqueSorted(sourceEvidencePointers.map((pointer) => pointer.statusCode)),
    sourceContentTypes: uniqueSorted(sourceEvidencePointers.map((pointer) => pointer.contentType)),
    extractionAllowedNext: true,
    controlledFetchAllowedNext: true,
    broadSearchAllowedNext: false,
    classifierAllowedNext: false,
    canonicalWriteAllowedNext: false,
    productionWriteAllowedNext: false,
    truthAssertionAllowedNext: false,
    planStatus: route.extractionRoute === "unsupported_provider_family" ? "blocked_unsupported_provider_family" : "ready_for_controlled_extraction_probe"
  };
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(verificationPath)) {
  throw new Error(`Missing canonical write execution runner verification: ${verificationPath}`);
}

if (!fs.existsSync(canonicalEvidencePointerPath)) {
  throw new Error(`Missing canonical evidence pointer file: ${canonicalEvidencePointerPath}`);
}

const verification = readJson(verificationPath);
const canonicalEvidencePointer = readJson(canonicalEvidencePointerPath);

const verificationSummary = verification.summary && typeof verification.summary === "object" ? verification.summary : {};
const canonicalSummary = canonicalEvidencePointer.summary && typeof canonicalEvidencePointer.summary === "object" ? canonicalEvidencePointer.summary : {};
const canonicalRows = Array.isArray(canonicalEvidencePointer.canonicalEvidencePointerRows)
  ? canonicalEvidencePointer.canonicalEvidencePointerRows
  : [];

const extractionPlanRows = canonicalRows.map(planRow);
const readyRows = extractionPlanRows.filter((row) => row.planStatus === "ready_for_controlled_extraction_probe");

const planCompetitions = uniqueSorted(extractionPlanRows.map((row) => row.competitionSlug));
const planProviderFamilies = uniqueSorted(extractionPlanRows.map((row) => row.providerFamily));

const checks = [];

assertEqual("verificationStatus", verificationSummary.canonicalWriteExecutionRunnerVerificationStatus, "passed", checks);
assertEqual("canonicalWritesVerifiedCount", Number(verificationSummary.canonicalWritesVerifiedCount ?? 0), 1, checks);
assertEqual("mayBuildStandingsSeasonStateExtractionPlanCount", Number(verificationSummary.mayBuildStandingsSeasonStateExtractionPlanCount ?? 0), 1, checks);
assertEqual("mayBuildCanonicalEvidencePointerResultBoardCount", Number(verificationSummary.mayBuildCanonicalEvidencePointerResultBoardCount ?? 0), 1, checks);

assertEqual("canonicalEvidencePointerRowCount", canonicalRows.length, 6, checks);
assertEqual("canonicalSummaryEvidencePointerRowCount", Number(canonicalSummary.canonicalEvidencePointerRowCount ?? 0), 6, checks);
assertEqual("canonicalSummaryRepresentedAcceptedEvidenceRowCount", Number(canonicalSummary.representedAcceptedEvidenceRowCount ?? 0), 12, checks);
assertEqual("extractionPlanRowCount", extractionPlanRows.length, 6, checks);
assertEqual("readyForControlledExtractionProbeRowCount", readyRows.length, 6, checks);

assertArrayEqual("planCompetitions", planCompetitions, expectedCompetitions, checks);
assertArrayEqual("planProviderFamilies", planProviderFamilies, expectedProviderFamilies, checks);

assertAll("planRowsHaveEvidencePointers", extractionPlanRows, (row) => row.sourceEvidencePointerCount === 2, checks);
assertAll("planRowsHaveUrls", extractionPlanRows, (row) => Array.isArray(row.urls) && row.urls.length > 0, checks);
assertAll("planRowsHaveFinalUrls", extractionPlanRows, (row) => Array.isArray(row.finalUrls) && row.finalUrls.length > 0, checks);
assertAll("planRowsHaveSha", extractionPlanRows, (row) => Array.isArray(row.evidenceSha256) && row.evidenceSha256.length > 0, checks);
assertAll("planRowsHaveExtractionRoute", extractionPlanRows, (row) => row.extractionRoute !== "unsupported_provider_family", checks);
assertAll("planRowsAllowOnlyControlledFetchNext", extractionPlanRows, (row) => row.controlledFetchAllowedNext === true && row.broadSearchAllowedNext === false, checks);
assertAll("planRowsKeepClassifierBlocked", extractionPlanRows, (row) => row.classifierAllowedNext === false, checks);
assertAll("planRowsKeepCanonicalWritesBlocked", extractionPlanRows, (row) => row.canonicalWriteAllowedNext === false, checks);
assertAll("planRowsKeepProductionWritesBlocked", extractionPlanRows, (row) => row.productionWriteAllowedNext === false, checks);
assertAll("planRowsKeepTruthAssertionsBlocked", extractionPlanRows, (row) => row.truthAssertionAllowedNext === false, checks);

assertEqual("verificationProductionWriteExecutedNowCount", Number(verificationSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("verificationTruthAssertionExecutedNowCount", Number(verificationSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("canonicalProductionWriteGuarantee", canonicalEvidencePointer.guarantees?.productionWrite, false, checks);
assertEqual("canonicalTruthAssertionGuarantee", canonicalEvidencePointer.guarantees?.truthAssertion, false, checks);
assertEqual("canonicalTruthValueWrittenCount", Number(canonicalSummary.canonicalTruthValueWrittenCount ?? 0), 0, checks);
assertEqual("canonicalProductionWriteCount", Number(canonicalSummary.productionWriteCount ?? 0), 0, checks);
assertEqual("canonicalTruthAssertionCount", Number(canonicalSummary.truthAssertionCount ?? 0), 0, checks);

const blockedPlanCheckCount = checks.filter((check) => !check.passed).length;
const passedPlanCheckCount = checks.filter((check) => check.passed).length;

const plan = {
  output: outputPath,
  job: "build-football-truth-standings-season-state-extraction-plan-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    verificationPath,
    canonicalEvidencePointerPath
  },
  policy: {
    planOnly: true,
    nextStepMayUseControlledFetchFromCanonicalEvidencePointerUrls: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    standingsSeasonStateExtractionPlanReadCount: 2,
    verificationStatus: verificationSummary.canonicalWriteExecutionRunnerVerificationStatus,
    canonicalWritesVerifiedCount: Number(verificationSummary.canonicalWritesVerifiedCount ?? 0),
    mayBuildStandingsSeasonStateExtractionPlanCount: Number(verificationSummary.mayBuildStandingsSeasonStateExtractionPlanCount ?? 0),

    canonicalEvidencePointerRowCount: canonicalRows.length,
    representedAcceptedEvidenceRowCount: Number(canonicalSummary.representedAcceptedEvidenceRowCount ?? 0),
    extractionPlanRowCount: extractionPlanRows.length,
    readyForControlledExtractionProbeRowCount: readyRows.length,
    extractionPlanCompetitionCount: planCompetitions.length,
    extractionPlanProviderFamilyCount: planProviderFamilies.length,

    planCompetitions,
    planProviderFamilies,
    byCompetitionSlug: countBy(extractionPlanRows, "competitionSlug"),
    byProviderFamily: countBy(extractionPlanRows, "providerFamily"),
    byExtractionRoute: countBy(extractionPlanRows, "extractionRoute"),

    planCheckCount: checks.length,
    passedPlanCheckCount,
    blockedPlanCheckCount,
    standingsSeasonStateExtractionPlanStatus: blockedPlanCheckCount === 0 ? "passed" : "blocked",
    standingsSeasonStateExtractionPlanBuiltCount: blockedPlanCheckCount === 0 ? 1 : 0,
    mayBuildControlledStandingsSeasonStateExtractionRunnerCount: blockedPlanCheckCount === 0 ? 1 : 0,

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
  extractionPlanRows
};

fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(JSON.stringify({
  output: plan.output,
  standingsSeasonStateExtractionPlanStatus: plan.summary.standingsSeasonStateExtractionPlanStatus,
  extractionPlanRowCount: plan.summary.extractionPlanRowCount,
  readyForControlledExtractionProbeRowCount: plan.summary.readyForControlledExtractionProbeRowCount,
  extractionPlanCompetitionCount: plan.summary.extractionPlanCompetitionCount,
  extractionPlanProviderFamilyCount: plan.summary.extractionPlanProviderFamilyCount,
  byExtractionRoute: plan.summary.byExtractionRoute,
  mayBuildControlledStandingsSeasonStateExtractionRunnerCount: plan.summary.mayBuildControlledStandingsSeasonStateExtractionRunnerCount,
  productionWriteExecutedNowCount: plan.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: plan.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPlanCheckCount !== 0) {
  process.exitCode = 1;
}
