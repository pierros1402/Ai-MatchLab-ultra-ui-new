import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const runnerDiagnosticPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-write-runner-2026-06-15",
  "laliga-full-table-canonical-candidate-write-runner-2026-06-15.json"
);

const canonicalCandidatePath = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-standings-candidates",
  "laliga-full-table-standings-candidates-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-canonical-standings-candidate-write-verification-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "laliga-canonical-standings-candidate-write-verification-2026-06-15.json"
);

const expectedSha256 = "c4006ac992b0d252adcb84c372e9bd39a47867a555a49462a45a34f19f888225";
const expected = {
  "esp.1": { expectedLeagueSize: 20, expectedPlayed: 38 },
  "esp.2": { expectedLeagueSize: 22, expectedPlayed: 42 }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath, "utf8")).digest("hex");
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

function rowsForCompetition(rows, competitionSlug) {
  return rows
    .filter((row) => row.competitionSlug === competitionSlug)
    .sort((a, b) => Number(a.position) - Number(b.position));
}

function assertEqual(name, actual, expectedValue, checks) {
  const passed = Object.is(actual, expectedValue);
  checks.push({ name, actual, expected: expectedValue, passed });
}

function assertArrayEqual(name, actual, expectedValue, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expectedValue);
  checks.push({ name, actual, expected: expectedValue, passed });
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
  throw new Error(`Missing write runner diagnostic: ${runnerDiagnosticPath}`);
}

if (!fs.existsSync(canonicalCandidatePath)) {
  throw new Error(`Missing canonical standings candidate file: ${canonicalCandidatePath}`);
}

const runnerDiagnostic = readJson(runnerDiagnosticPath);
const canonicalCandidate = readJson(canonicalCandidatePath);
const runnerSummary = runnerDiagnostic.summary && typeof runnerDiagnostic.summary === "object" ? runnerDiagnostic.summary : {};
const canonicalSummary = canonicalCandidate.summary && typeof canonicalCandidate.summary === "object" ? canonicalCandidate.summary : {};
const competitionRows = Array.isArray(canonicalCandidate.canonicalStandingCandidateCompetitionRows) ? canonicalCandidate.canonicalStandingCandidateCompetitionRows : [];
const standingRows = Array.isArray(canonicalCandidate.canonicalStandingCandidateRows) ? canonicalCandidate.canonicalStandingCandidateRows : [];
const actualSha256 = sha256File(canonicalCandidatePath);

const checks = [];

assertEqual("runnerStatus", runnerSummary.laligaFullTableCanonicalCandidateWriteRunnerStatus, "passed", checks);
assertEqual("runnerCanonicalOutputPath", runnerDiagnostic.canonicalOutputPath, canonicalCandidatePath, checks);
assertEqual("runnerCanonicalOutputSha256", runnerDiagnostic.canonicalOutputSha256, actualSha256, checks);
assertEqual("canonicalOutputSha256Expected", actualSha256, expectedSha256, checks);
assertEqual("runnerCanonicalWriteFileCount", Number(runnerSummary.canonicalWriteFileCount ?? 0), 1, checks);
assertEqual("runnerCanonicalWrites", Number(runnerSummary.canonicalWrites ?? 0), 1, checks);
assertEqual("runnerCompetitionCount", Number(runnerSummary.canonicalStandingCandidateCompetitionCount ?? 0), 2, checks);
assertEqual("runnerStandingRowCount", Number(runnerSummary.canonicalStandingCandidateRowCount ?? 0), 42, checks);
assertEqual("runnerProductionWriteExecutedNowCount", Number(runnerSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerTruthAssertionExecutedNowCount", Number(runnerSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerProductionWrite", Boolean(runnerSummary.productionWrite), false, checks);
assertEqual("runnerTruthAssertion", Boolean(runnerSummary.truthAssertion), false, checks);

assertEqual("canonicalDataset", canonicalCandidate.canonicalDataset, "football_truth_standings_candidates", checks);
assertEqual("canonicalWriteScope", canonicalCandidate.writeScope, "laliga_full_table_canonical_standings_candidate_write_only", checks);
assertEqual("canonicalGuaranteeCandidateWrite", canonicalCandidate.guarantees?.canonicalStandingsCandidateWrite, true, checks);
assertEqual("canonicalGuaranteeTruthValueWritten", canonicalCandidate.guarantees?.canonicalTruthValueWritten, false, checks);
assertEqual("canonicalGuaranteeProductionWrite", canonicalCandidate.guarantees?.productionWrite, false, checks);
assertEqual("canonicalGuaranteeTruthAssertion", canonicalCandidate.guarantees?.truthAssertion, false, checks);
assertEqual("canonicalGuaranteeFetchExecutedNow", canonicalCandidate.guarantees?.fetchExecutedNow, false, checks);
assertEqual("canonicalGuaranteeSearchExecutedNow", canonicalCandidate.guarantees?.searchExecutedNow, false, checks);
assertEqual("canonicalGuaranteeBroadSearchExecutedNow", canonicalCandidate.guarantees?.broadSearchExecutedNow, false, checks);
assertEqual("canonicalGuaranteeClassifierExecutedNow", canonicalCandidate.guarantees?.classifierExecutedNow, false, checks);

assertEqual("canonicalCompetitionRowCount", competitionRows.length, 2, checks);
assertEqual("canonicalStandingRowCount", standingRows.length, 42, checks);
assertEqual("canonicalSummaryCompetitionCount", Number(canonicalSummary.canonicalStandingCandidateCompetitionCount ?? 0), 2, checks);
assertEqual("canonicalSummaryStandingRowCount", Number(canonicalSummary.canonicalStandingCandidateRowCount ?? 0), 42, checks);
assertArrayEqual("canonicalCompetitions", uniqueSorted(competitionRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);
assertArrayEqual("canonicalStandingCompetitions", uniqueSorted(standingRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);
assertArrayEqual("canonicalProviderFamilies", uniqueSorted(competitionRows.map((row) => row.providerFamily)), ["laliga"], checks);
assertEqual("canonicalTruthValueWrittenCount", Number(canonicalSummary.canonicalTruthValueWrittenCount ?? 0), 0, checks);
assertEqual("productionWriteCount", Number(canonicalSummary.productionWriteCount ?? 0), 0, checks);
assertEqual("truthAssertionCount", Number(canonicalSummary.truthAssertionCount ?? 0), 0, checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const compRow = competitionRows.find((row) => row.competitionSlug === competitionSlug);
  const rows = rowsForCompetition(standingRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedLeagueSize }, (_, index) => String(index + 1));
  const playedValues = uniqueSorted(rows.map((row) => row.played));
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.competitionRowPresent`, Boolean(compRow), true, checks);
  assertEqual(`${competitionSlug}.competitionRowExpectedLeagueSize`, Number(compRow?.expectedLeagueSize ?? 0), expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.competitionRowExpectedPlayed`, Number(compRow?.expectedPlayed ?? 0), expectation.expectedPlayed, checks);
  assertEqual(`${competitionSlug}.competitionRowStandingRowCount`, Number(compRow?.standingRowCount ?? 0), expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.standingRowCount`, rows.length, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedLeagueSize, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertArrayEqual(`${competitionSlug}.playedValues`, playedValues, [String(expectation.expectedPlayed)], checks);
}

assertAll("standingRowsHaveCandidateStatus", standingRows, (row) => row.rowStatus === "canonical_candidate_written_not_truth_asserted", checks);
assertAll("standingRowsDoNotProductionWrite", standingRows, (row) => row.productionWrite === false, checks);
assertAll("standingRowsDoNotTruthAssert", standingRows, (row) => row.truthAssertion === false, checks);
assertAll("competitionRowsHaveCandidateStatus", competitionRows, (row) => row.candidateStatus === "canonical_candidate_written_not_truth_asserted", checks);
assertAll("competitionRowsAreCandidateWrites", competitionRows, (row) => row.canonicalWriteKind === "canonical_standings_candidate_write", checks);
assertAll("competitionRowsDoNotWriteTruthValues", competitionRows, (row) => row.canonicalTruthValueWritten === false, checks);
assertAll("competitionRowsDoNotProductionWrite", competitionRows, (row) => row.productionWrite === false, checks);
assertAll("competitionRowsDoNotTruthAssert", competitionRows, (row) => row.truthAssertion === false, checks);

const blockedVerificationCheckCount = checks.filter((check) => !check.passed).length;
const passedVerificationCheckCount = checks.filter((check) => check.passed).length;

const verification = {
  output: outputPath,
  job: "verify-football-truth-laliga-canonical-standings-candidate-write-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    runnerDiagnosticPath,
    canonicalCandidatePath
  },
  canonicalOutputSha256: actualSha256,
  policy: {
    verificationOnly: true,
    canonicalStandingsCandidateWriteVerified: blockedVerificationCheckCount === 0,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false
  },
  summary: {
    laligaCanonicalStandingCandidateWriteVerificationReadCount: 2,
    laligaCanonicalStandingCandidateWriteVerificationStatus: blockedVerificationCheckCount === 0 ? "passed" : "blocked",
    verificationCheckCount: checks.length,
    passedVerificationCheckCount,
    blockedVerificationCheckCount,

    canonicalOutputSha256: actualSha256,
    canonicalWriteFileCount: 1,
    canonicalWritesVerifiedCount: blockedVerificationCheckCount === 0 ? 1 : 0,
    canonicalStandingCandidateCompetitionCount: competitionRows.length,
    canonicalStandingCandidateRowCount: standingRows.length,
    canonicalStandingCandidateRowsByCompetition: countBy(standingRows, "competitionSlug"),
    canonicalStandingCandidateCompetitions: uniqueSorted(competitionRows.map((row) => row.competitionSlug)),
    canonicalStandingCandidateProviderFamilies: uniqueSorted(competitionRows.map((row) => row.providerFamily)),

    mayBuildProviderSpecificParserGapPlanCount: blockedVerificationCheckCount === 0 ? 1 : 0,
    mayBuildLaligaCanonicalStandingCandidatePromotionReviewBoardCount: blockedVerificationCheckCount === 0 ? 1 : 0,

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

writeJson(outputPath, verification);

console.log(JSON.stringify({
  output: verification.output,
  laligaCanonicalStandingCandidateWriteVerificationStatus: verification.summary.laligaCanonicalStandingCandidateWriteVerificationStatus,
  canonicalOutputSha256: verification.summary.canonicalOutputSha256,
  canonicalWritesVerifiedCount: verification.summary.canonicalWritesVerifiedCount,
  canonicalStandingCandidateCompetitionCount: verification.summary.canonicalStandingCandidateCompetitionCount,
  canonicalStandingCandidateRowCount: verification.summary.canonicalStandingCandidateRowCount,
  canonicalStandingCandidateRowsByCompetition: verification.summary.canonicalStandingCandidateRowsByCompetition,
  mayBuildProviderSpecificParserGapPlanCount: verification.summary.mayBuildProviderSpecificParserGapPlanCount,
  productionWriteExecutedNowCount: verification.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: verification.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedVerificationCheckCount !== 0) {
  process.exitCode = 1;
}
