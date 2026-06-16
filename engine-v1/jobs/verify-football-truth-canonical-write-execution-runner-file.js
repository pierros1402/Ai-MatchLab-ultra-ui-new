import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const runnerDiagnosticPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-execution-runner-2026-06-15",
  "canonical-write-execution-runner-2026-06-15.json"
);

const canonicalOutputPath = path.join(
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
  "canonical-write-execution-runner-verification-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "canonical-write-execution-runner-verification-2026-06-15.json"
);

const expectedCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];
const expectedProviderFamilies = ["laliga", "norway_ntf", "sportomedia"];
const expectedSha256 = "8ae7376820222e91c0156354a22e4a74cd593e4772fe1174e9eedea91034764d";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath, "utf8")).digest("hex");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
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

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(runnerDiagnosticPath)) {
  throw new Error(`Missing canonical write execution runner diagnostic: ${runnerDiagnosticPath}`);
}

if (!fs.existsSync(canonicalOutputPath)) {
  throw new Error(`Missing canonical evidence pointer output: ${canonicalOutputPath}`);
}

const runnerDiagnostic = readJson(runnerDiagnosticPath);
const canonicalOutput = readJson(canonicalOutputPath);
const runnerSummary = runnerDiagnostic.summary && typeof runnerDiagnostic.summary === "object" ? runnerDiagnostic.summary : {};
const canonicalSummary = canonicalOutput.summary && typeof canonicalOutput.summary === "object" ? canonicalOutput.summary : {};
const canonicalRows = Array.isArray(canonicalOutput.canonicalEvidencePointerRows) ? canonicalOutput.canonicalEvidencePointerRows : [];

const actualSha256 = sha256File(canonicalOutputPath);
const canonicalCompetitions = uniqueSorted(canonicalRows.map((row) => row.competitionSlug));
const canonicalProviderFamilies = uniqueSorted(canonicalRows.flatMap((row) => Array.isArray(row.providerFamilies) ? row.providerFamilies : []));
const representedAcceptedEvidenceRowCount = canonicalRows.reduce((sum, row) => sum + Number(row.sourceAcceptedEvidenceRowCount ?? 0), 0);

const checks = [];

assertEqual("runnerStatus", runnerSummary.canonicalWriteExecutionRunnerStatus, "passed", checks);
assertEqual("runnerCanonicalWriteFileCount", Number(runnerSummary.canonicalWriteFileCount ?? 0), 1, checks);
assertEqual("runnerCanonicalWrites", Number(runnerSummary.canonicalWrites ?? 0), 1, checks);
assertEqual("runnerCanonicalEvidencePointerRowCount", Number(runnerSummary.canonicalEvidencePointerRowCount ?? 0), 6, checks);
assertEqual("runnerCanonicalEvidencePointerCompetitionCount", Number(runnerSummary.canonicalEvidencePointerCompetitionCount ?? 0), 6, checks);
assertEqual("runnerCanonicalEvidencePointerProviderFamilyCount", Number(runnerSummary.canonicalEvidencePointerProviderFamilyCount ?? 0), 3, checks);
assertEqual("runnerRepresentedAcceptedEvidenceRowCount", Number(runnerSummary.representedAcceptedEvidenceRowCount ?? 0), 12, checks);
assertEqual("runnerProductionWriteExecutedNowCount", Number(runnerSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerTruthAssertionExecutedNowCount", Number(runnerSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerProductionWrite", Boolean(runnerSummary.productionWrite), false, checks);
assertEqual("runnerTruthAssertion", Boolean(runnerSummary.truthAssertion), false, checks);

assertEqual("canonicalOutputPathMatchesDiagnostic", runnerDiagnostic.canonicalOutputPath, canonicalOutputPath, checks);
assertEqual("canonicalOutputSha256MatchesDiagnostic", runnerDiagnostic.canonicalOutputSha256, actualSha256, checks);
assertEqual("canonicalOutputSha256MatchesExpected", actualSha256, expectedSha256, checks);

assertEqual("canonicalDataset", canonicalOutput.canonicalDataset, "football_truth_controlled_real_source_evidence_pointers", checks);
assertEqual("canonicalWriteScope", canonicalOutput.writeScope, "controlled_real_source_evidence_pointer_only", checks);
assertEqual("canonicalGuaranteeCanonicalEvidencePointerWrite", canonicalOutput.guarantees?.canonicalEvidencePointerWrite, true, checks);
assertEqual("canonicalGuaranteeProductionWrite", canonicalOutput.guarantees?.productionWrite, false, checks);
assertEqual("canonicalGuaranteeTruthAssertion", canonicalOutput.guarantees?.truthAssertion, false, checks);
assertEqual("canonicalGuaranteeFetchExecutedNow", canonicalOutput.guarantees?.fetchExecutedNow, false, checks);
assertEqual("canonicalGuaranteeSearchExecutedNow", canonicalOutput.guarantees?.searchExecutedNow, false, checks);
assertEqual("canonicalGuaranteeBroadSearchExecutedNow", canonicalOutput.guarantees?.broadSearchExecutedNow, false, checks);
assertEqual("canonicalGuaranteeClassifierExecutedNow", canonicalOutput.guarantees?.classifierExecutedNow, false, checks);

assertEqual("canonicalEvidencePointerRowCount", canonicalRows.length, 6, checks);
assertEqual("canonicalSummaryRowCount", Number(canonicalSummary.canonicalEvidencePointerRowCount ?? 0), 6, checks);
assertEqual("canonicalSummaryCompetitionCount", Number(canonicalSummary.canonicalEvidencePointerCompetitionCount ?? 0), 6, checks);
assertEqual("canonicalSummaryProviderFamilyCount", Number(canonicalSummary.canonicalEvidencePointerProviderFamilyCount ?? 0), 3, checks);
assertEqual("representedAcceptedEvidenceRowCount", representedAcceptedEvidenceRowCount, 12, checks);
assertEqual("canonicalSummaryRepresentedAcceptedEvidenceRowCount", Number(canonicalSummary.representedAcceptedEvidenceRowCount ?? 0), 12, checks);

assertArrayEqual("canonicalCompetitions", canonicalCompetitions, expectedCompetitions, checks);
assertArrayEqual("canonicalProviderFamilies", canonicalProviderFamilies, expectedProviderFamilies, checks);
assertArrayEqual("canonicalSummaryCompetitions", canonicalSummary.canonicalCompetitions, expectedCompetitions, checks);
assertArrayEqual("canonicalSummaryProviderFamilies", canonicalSummary.canonicalProviderFamilies, expectedProviderFamilies, checks);

assertEqual("canonicalTruthValueWrittenCount", Number(canonicalSummary.canonicalTruthValueWrittenCount ?? 0), 0, checks);
assertEqual("productionWriteCount", Number(canonicalSummary.productionWriteCount ?? 0), 0, checks);
assertEqual("truthAssertionCount", Number(canonicalSummary.truthAssertionCount ?? 0), 0, checks);

assertAll("rowsAreEvidencePointerWrites", canonicalRows, (row) => row.canonicalWriteKind === "canonical_evidence_pointer_write", checks);
assertAll("rowsAreWritten", canonicalRows, (row) => row.canonicalWriteStatus === "written", checks);
assertAll("rowsHaveTwoAcceptedEvidencePointers", canonicalRows, (row) => Number(row.sourceAcceptedEvidenceRowCount ?? 0) === 2, checks);
assertAll("rowsMatchApprovedEvidenceCount", canonicalRows, (row) => Number(row.sourceAcceptedEvidenceRowCount ?? 0) === Number(row.approvedEvidenceRowCount ?? 0), checks);
assertAll("rowsHaveSourceEvidencePointers", canonicalRows, (row) => Array.isArray(row.sourceEvidencePointers) && row.sourceEvidencePointers.length === Number(row.sourceAcceptedEvidenceRowCount ?? 0), checks);
assertAll("rowsDoNotProductionWrite", canonicalRows, (row) => row.productionWrite === false, checks);
assertAll("rowsDoNotTruthAssert", canonicalRows, (row) => row.truthAssertion === false, checks);
assertAll("rowsDoNotWriteCanonicalTruthValue", canonicalRows, (row) => row.canonicalTruthValueWritten === false, checks);
assertAll("rowsAreDeltaCandidates", canonicalRows, (row) => row.standingsOrSeasonStateDeltaCandidate === true, checks);
assertAll("rowsScopeEvidencePointerOnly", canonicalRows, (row) => row.writeScope === "controlled_real_source_evidence_pointer_only", checks);

const blockedVerificationCheckCount = checks.filter((check) => !check.passed).length;
const passedVerificationCheckCount = checks.filter((check) => check.passed).length;

const verification = {
  output: outputPath,
  job: "verify-football-truth-canonical-write-execution-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    runnerDiagnosticPath,
    canonicalOutputPath
  },
  canonicalOutputSha256: actualSha256,
  policy: {
    verificationOnly: true,
    canonicalEvidencePointerWriteVerified: blockedVerificationCheckCount === 0,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false
  },
  summary: {
    canonicalWriteExecutionRunnerVerificationReadCount: 2,
    canonicalWriteExecutionRunnerVerificationStatus: blockedVerificationCheckCount === 0 ? "passed" : "blocked",
    verificationCheckCount: checks.length,
    passedVerificationCheckCount,
    blockedVerificationCheckCount,

    canonicalOutputSha256: actualSha256,
    canonicalWriteFileCount: 1,
    canonicalEvidencePointerRowCount: canonicalRows.length,
    canonicalEvidencePointerCompetitionCount: canonicalCompetitions.length,
    canonicalEvidencePointerProviderFamilyCount: canonicalProviderFamilies.length,
    representedAcceptedEvidenceRowCount,

    canonicalCompetitions,
    canonicalProviderFamilies,

    canonicalWritesVerifiedCount: blockedVerificationCheckCount === 0 ? 1 : 0,
    mayBuildCanonicalEvidencePointerResultBoardCount: blockedVerificationCheckCount === 0 ? 1 : 0,
    mayBuildStandingsSeasonStateExtractionPlanCount: blockedVerificationCheckCount === 0 ? 1 : 0,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    productionWrite: false,
    truthAssertion: false
  },
  checks
};

fs.writeFileSync(outputPath, `${JSON.stringify(verification, null, 2)}\n`);

console.log(JSON.stringify({
  output: verification.output,
  canonicalWriteExecutionRunnerVerificationStatus: verification.summary.canonicalWriteExecutionRunnerVerificationStatus,
  canonicalOutputSha256: verification.summary.canonicalOutputSha256,
  canonicalWritesVerifiedCount: verification.summary.canonicalWritesVerifiedCount,
  canonicalEvidencePointerRowCount: verification.summary.canonicalEvidencePointerRowCount,
  canonicalEvidencePointerCompetitionCount: verification.summary.canonicalEvidencePointerCompetitionCount,
  representedAcceptedEvidenceRowCount: verification.summary.representedAcceptedEvidenceRowCount,
  mayBuildCanonicalEvidencePointerResultBoardCount: verification.summary.mayBuildCanonicalEvidencePointerResultBoardCount,
  mayBuildStandingsSeasonStateExtractionPlanCount: verification.summary.mayBuildStandingsSeasonStateExtractionPlanCount,
  productionWriteExecutedNowCount: verification.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: verification.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedVerificationCheckCount !== 0) {
  process.exitCode = 1;
}
