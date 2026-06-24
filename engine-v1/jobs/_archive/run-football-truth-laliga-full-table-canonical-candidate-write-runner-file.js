import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowCanonicalWrite = args.has("--allow-canonical-write");
const approvalTokenArg = process.argv.slice(2).find((arg) => arg.startsWith("--approval-token="));
const approvalToken = approvalTokenArg ? approvalTokenArg.slice("--approval-token=".length) : "";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-execution-approval-gate-2026-06-15",
  "laliga-full-table-canonical-candidate-execution-approval-gate-2026-06-15.json"
);

const canonicalOutputDir = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-standings-candidates"
);

const canonicalOutputPath = path.join(
  canonicalOutputDir,
  "laliga-full-table-standings-candidates-2026-06-15.json"
);

const diagnosticOutputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-write-runner-2026-06-15"
);

const diagnosticOutputPath = path.join(
  diagnosticOutputDir,
  "laliga-full-table-canonical-candidate-write-runner-2026-06-15.json"
);

const expected = {
  "esp.1": { expectedLeagueSize: 20, expectedPlayed: 38 },
  "esp.2": { expectedLeagueSize: 22, expectedPlayed: 42 }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath, "utf8")).digest("hex");
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

function rowsForCompetition(rows, competitionSlug) {
  return rows
    .filter((row) => row.competitionSlug === competitionSlug)
    .sort((a, b) => Number(a.position) - Number(b.position));
}

function buildCanonicalCompetitionRows(executionApprovalRows) {
  return executionApprovalRows
    .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))
    .map((row, index) => ({
      canonicalStandingCandidateCompetitionRowId: `canonical_standings_candidate_competition_${String(index + 1).padStart(2, "0")}`,
      sourceLaligaFullTableCanonicalCandidateExecutionApprovalGateRowId: row.laligaFullTableCanonicalCandidateExecutionApprovalGateRowId,
      sourceLaligaFullTableCanonicalCandidateApprovalGateRowId: row.sourceLaligaFullTableCanonicalCandidateApprovalGateRowId,
      sourceLaligaFullTableCanonicalCandidateProposalQualityGateRowId: row.sourceLaligaFullTableCanonicalCandidateProposalQualityGateRowId,
      sourceLaligaFullTableCanonicalCandidateProposalRowId: row.sourceLaligaFullTableCanonicalCandidateProposalRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      candidateDataset: "football_truth_standings_candidates",
      candidateKind: "laliga_quality_gated_full_table_standings_candidate",
      candidateStatus: "canonical_candidate_written_not_truth_asserted",
      expectedLeagueSize: row.expectedLeagueSize,
      expectedPlayed: row.expectedPlayed,
      standingRowCount: row.approvedStandingRowCount,
      sourceQualityGateRowIds: row.sourceQualityGateRowIds,
      sourceCandidateRowIds: row.sourceCandidateRowIds,
      standingRows: row.approvedStandingRows.map((standingRow, standingIndex) => ({
        canonicalStandingCandidateRowId: `canonical_standings_candidate_${row.competitionSlug}_${String(standingIndex + 1).padStart(2, "0")}`,
        competitionSlug: row.competitionSlug,
        providerFamily: row.providerFamily,
        position: Number(standingRow.position),
        teamName: standingRow.teamName,
        points: Number(standingRow.points),
        played: Number(standingRow.played),
        won: standingRow.won === null ? null : Number(standingRow.won),
        drawn: standingRow.drawn === null ? null : Number(standingRow.drawn),
        lost: standingRow.lost === null ? null : Number(standingRow.lost),
        goalsFor: standingRow.goalsFor === null ? null : Number(standingRow.goalsFor),
        goalsAgainst: standingRow.goalsAgainst === null ? null : Number(standingRow.goalsAgainst),
        goalDifference: standingRow.goalDifference === null ? null : Number(standingRow.goalDifference),
        rowStatus: "canonical_candidate_written_not_truth_asserted",
        productionWrite: false,
        truthAssertion: false
      })),
      canonicalWriteKind: "canonical_standings_candidate_write",
      productionWrite: false,
      truthAssertion: false,
      canonicalTruthValueWritten: false
    }));
}

if (!allowExecute) throw new Error("Missing required --allow-execute flag.");
if (!allowCanonicalWrite) throw new Error("Missing required --allow-canonical-write flag.");

if (approvalToken !== "user-approved-laliga-canonical-standings-candidate-write-2026-06-16") {
  throw new Error("Missing or invalid explicit user approval token for LaLiga canonical standings candidate write runner.");
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing LaLiga execution approval gate diagnostic: ${sourcePath}`);
}

fs.mkdirSync(canonicalOutputDir, { recursive: true });
fs.mkdirSync(diagnosticOutputDir, { recursive: true });

const source = readJson(sourcePath);
const sourceSummary = source.summary && typeof source.summary === "object" ? source.summary : {};
const executionApprovalRows = Array.isArray(source.executionApprovalRows) ? source.executionApprovalRows : [];
const sourceExecutionApprovedStandingRows = Array.isArray(source.executionApprovedStandingRows) ? source.executionApprovedStandingRows : [];

const preChecks = [];

assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowCanonicalWriteFlagPresent", allowCanonicalWrite, true, preChecks);
assertEqual("explicitUserApprovalTokenPresent", approvalToken, "user-approved-laliga-canonical-standings-candidate-write-2026-06-16", preChecks);

assertEqual("sourceExecutionApprovalGateStatus", sourceSummary.laligaFullTableCanonicalCandidateExecutionApprovalGateStatus, "passed", preChecks);
assertEqual("sourceExecutionApprovalGatePassedCount", Number(sourceSummary.laligaFullTableCanonicalCandidateExecutionApprovalGatePassedCount ?? 0), 1, preChecks);
assertEqual("sourceMayBuildWriteRunnerCount", Number(sourceSummary.mayBuildLaligaFullTableCanonicalCandidateWriteRunnerCount ?? 0), 1, preChecks);
assertEqual("sourceRequiresExplicitUserApprovalCount", Number(sourceSummary.laligaFullTableCanonicalCandidateWriteRunnerRequiresExplicitUserApprovalCount ?? 0), 1, preChecks);

assertEqual("sourceMayWriteCanonicalNowCountBeforeRunner", Number(sourceSummary.mayWriteCanonicalNowCount ?? 0), 0, preChecks);
assertEqual("sourceMayWriteProductionNowCount", Number(sourceSummary.mayWriteProductionNowCount ?? 0), 0, preChecks);
assertEqual("sourceMayAssertTruthNowCount", Number(sourceSummary.mayAssertTruthNowCount ?? 0), 0, preChecks);

assertEqual("executionApprovalRowCount", executionApprovalRows.length, 2, preChecks);
assertEqual("sourceExecutionApprovedStandingRowCount", sourceExecutionApprovedStandingRows.length, 42, preChecks);
assertArrayEqual("executionApprovalCompetitions", uniqueSorted(executionApprovalRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], preChecks);
assertArrayEqual("executionApprovalProviderFamilies", uniqueSorted(executionApprovalRows.map((row) => row.providerFamily)), ["laliga"], preChecks);

assertAll("executionApprovalRowsHaveApprovedStatus", executionApprovalRows, (row) => row.executionApprovalStatus === "approved_for_explicit_user_approved_laliga_canonical_standings_candidate_write_runner_only", preChecks);
assertAll("executionApprovalRowsHaveCandidateWriteScope", executionApprovalRows, (row) => row.approvedExecutionScope === "canonical_standings_candidate_write_only", preChecks);
assertAll("executionApprovalRowsRequireExplicitApproval", executionApprovalRows, (row) => row.requiresExplicitUserApprovalBeforeWriteRunner === true, preChecks);
assertAll("executionApprovalRowsMayBuildRunner", executionApprovalRows, (row) => row.canonicalWriteRunnerMayBeBuilt === true, preChecks);
assertAll("executionApprovalRowsMayNotExecuteWithoutUserApproval", executionApprovalRows, (row) => row.canonicalWriteRunnerMayBeExecutedWithoutUserApproval === false, preChecks);
assertAll("executionApprovalRowsDidNotAlreadyWriteCanonical", executionApprovalRows, (row) => row.canonicalWriteExecutedNow === false, preChecks);
assertAll("executionApprovalRowsDoNotAllowProduction", executionApprovalRows, (row) => row.productionWriteAllowedNow === false && row.productionWriteExecutedNow === false, preChecks);
assertAll("executionApprovalRowsDoNotAllowTruthAssertion", executionApprovalRows, (row) => row.truthAssertionAllowedNow === false && row.truthAssertionExecutedNow === false, preChecks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const approvalRow = executionApprovalRows.find((row) => row.competitionSlug === competitionSlug);
  const rows = rowsForCompetition(sourceExecutionApprovedStandingRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedLeagueSize }, (_, index) => String(index + 1));
  const playedValues = uniqueSorted(rows.map((row) => row.played));
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.approvalRowPresent`, Boolean(approvalRow), true, preChecks);
  assertEqual(`${competitionSlug}.expectedLeagueSize`, Number(approvalRow?.expectedLeagueSize ?? 0), expectation.expectedLeagueSize, preChecks);
  assertEqual(`${competitionSlug}.expectedPlayed`, Number(approvalRow?.expectedPlayed ?? 0), expectation.expectedPlayed, preChecks);
  assertEqual(`${competitionSlug}.approvedStandingRowCount`, Number(approvalRow?.approvedStandingRowCount ?? 0), expectation.expectedLeagueSize, preChecks);
  assertEqual(`${competitionSlug}.flatStandingRowCount`, rows.length, expectation.expectedLeagueSize, preChecks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedLeagueSize, preChecks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, preChecks);
  assertArrayEqual(`${competitionSlug}.playedValues`, playedValues, [String(expectation.expectedPlayed)], preChecks);
}

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;
if (blockedPreCheckCount !== 0) {
  writeJson(diagnosticOutputPath, {
    output: diagnosticOutputPath,
    job: "run-football-truth-laliga-full-table-canonical-candidate-write-runner-file",
    status: "blocked_before_write",
    sourcePaths: { sourcePath },
    preChecks
  });

  console.log(JSON.stringify({
    output: diagnosticOutputPath,
    laligaFullTableCanonicalCandidateWriteRunnerStatus: "blocked_before_write",
    blockedPreCheckCount
  }, null, 2));

  process.exit(1);
}

const canonicalCompetitionRows = buildCanonicalCompetitionRows(executionApprovalRows);
const canonicalStandingRows = canonicalCompetitionRows.flatMap((row) => row.standingRows);

const canonicalOutput = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  canonicalDataset: "football_truth_standings_candidates",
  writeScope: "laliga_full_table_canonical_standings_candidate_write_only",
  sourcePaths: { sourcePath },
  guarantees: {
    canonicalStandingsCandidateWrite: true,
    canonicalTruthValueWritten: false,
    productionWrite: false,
    truthAssertion: false,
    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false
  },
  summary: {
    canonicalStandingCandidateCompetitionCount: canonicalCompetitionRows.length,
    canonicalStandingCandidateRowCount: canonicalStandingRows.length,
    canonicalStandingCandidateProviderFamilyCount: uniqueSorted(canonicalCompetitionRows.map((row) => row.providerFamily)).length,
    canonicalStandingCandidateRowsByCompetition: countBy(canonicalStandingRows, "competitionSlug"),
    canonicalStandingCandidateCompetitions: uniqueSorted(canonicalCompetitionRows.map((row) => row.competitionSlug)),
    canonicalStandingCandidateProviderFamilies: uniqueSorted(canonicalCompetitionRows.map((row) => row.providerFamily)),
    canonicalWriteKind: "canonical_standings_candidate_write",
    canonicalTruthValueWrittenCount: 0,
    productionWriteCount: 0,
    truthAssertionCount: 0
  },
  canonicalStandingCandidateCompetitionRows: canonicalCompetitionRows,
  canonicalStandingCandidateRows: canonicalStandingRows
};

writeJson(canonicalOutputPath, canonicalOutput);

const canonicalOutputSha256 = sha256File(canonicalOutputPath);
const written = readJson(canonicalOutputPath);
const writtenRows = Array.isArray(written.canonicalStandingCandidateRows) ? written.canonicalStandingCandidateRows : [];
const writtenCompetitionRows = Array.isArray(written.canonicalStandingCandidateCompetitionRows) ? written.canonicalStandingCandidateCompetitionRows : [];

const postChecks = [];

assertEqual("canonicalOutputExists", fs.existsSync(canonicalOutputPath), true, postChecks);
assertEqual("writtenDataset", written.canonicalDataset, "football_truth_standings_candidates", postChecks);
assertEqual("writtenScope", written.writeScope, "laliga_full_table_canonical_standings_candidate_write_only", postChecks);
assertEqual("writtenCompetitionRowCount", writtenCompetitionRows.length, 2, postChecks);
assertEqual("writtenStandingRowCount", writtenRows.length, 42, postChecks);
assertArrayEqual("writtenCompetitions", uniqueSorted(writtenCompetitionRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], postChecks);
assertArrayEqual("writtenProviderFamilies", uniqueSorted(writtenCompetitionRows.map((row) => row.providerFamily)), ["laliga"], postChecks);
assertEqual("writtenCanonicalStandingsCandidateWriteGuarantee", written.guarantees?.canonicalStandingsCandidateWrite, true, postChecks);
assertEqual("writtenProductionWriteGuarantee", written.guarantees?.productionWrite, false, postChecks);
assertEqual("writtenTruthAssertionGuarantee", written.guarantees?.truthAssertion, false, postChecks);
assertEqual("writtenCanonicalTruthValueWrittenCount", Number(written.summary?.canonicalTruthValueWrittenCount ?? 0), 0, postChecks);
assertEqual("writtenProductionWriteCount", Number(written.summary?.productionWriteCount ?? 0), 0, postChecks);
assertEqual("writtenTruthAssertionCount", Number(written.summary?.truthAssertionCount ?? 0), 0, postChecks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const rows = rowsForCompetition(writtenRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedLeagueSize }, (_, index) => String(index + 1));
  const playedValues = uniqueSorted(rows.map((row) => row.played));
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.writtenStandingRowCount`, rows.length, expectation.expectedLeagueSize, postChecks);
  assertEqual(`${competitionSlug}.writtenUniqueTeamCount`, teamNames.length, expectation.expectedLeagueSize, postChecks);
  assertArrayEqual(`${competitionSlug}.writtenPositions`, positions, expectedPositions, postChecks);
  assertArrayEqual(`${competitionSlug}.writtenPlayedValues`, playedValues, [String(expectation.expectedPlayed)], postChecks);
}

assertAll("writtenRowsAreCandidatesNotTruthAssertions", writtenRows, (row) => row.rowStatus === "canonical_candidate_written_not_truth_asserted", postChecks);
assertAll("writtenRowsDoNotProductionWrite", writtenRows, (row) => row.productionWrite === false, postChecks);
assertAll("writtenRowsDoNotTruthAssert", writtenRows, (row) => row.truthAssertion === false, postChecks);
assertAll("writtenCompetitionRowsDoNotWriteTruthValues", writtenCompetitionRows, (row) => row.canonicalTruthValueWritten === false, postChecks);
assertAll("writtenCompetitionRowsDoNotProductionWrite", writtenCompetitionRows, (row) => row.productionWrite === false, postChecks);
assertAll("writtenCompetitionRowsDoNotTruthAssert", writtenCompetitionRows, (row) => row.truthAssertion === false, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const passedPreCheckCount = preChecks.filter((check) => check.passed).length;
const passedPostCheckCount = postChecks.filter((check) => check.passed).length;

const diagnostic = {
  output: diagnosticOutputPath,
  job: "run-football-truth-laliga-full-table-canonical-candidate-write-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  canonicalOutputPath,
  canonicalOutputSha256,
  policy: {
    explicitUserApprovalTokenAccepted: true,
    canonicalStandingsCandidateWriteRunner: true,
    canonicalWriteScope: "laliga_full_table_canonical_standings_candidate_write_only",
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false
  },
  summary: {
    laligaFullTableCanonicalCandidateWriteRunnerStatus: blockedPostCheckCount === 0 ? "passed" : "blocked_after_write_validation",
    allowExecuteFlagPresent: allowExecute,
    allowCanonicalWriteFlagPresent: allowCanonicalWrite,
    explicitUserApprovalTokenPresent: true,

    canonicalOutputSha256,
    canonicalWriteFileCount: 1,
    canonicalWrites: 1,
    canonicalStandingCandidateCompetitionCount: writtenCompetitionRows.length,
    canonicalStandingCandidateRowCount: writtenRows.length,
    canonicalStandingCandidateProviderFamilyCount: uniqueSorted(writtenCompetitionRows.map((row) => row.providerFamily)).length,
    canonicalStandingCandidateRowsByCompetition: countBy(writtenRows, "competitionSlug"),

    preCheckCount: preChecks.length,
    passedPreCheckCount,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount,
    blockedPostCheckCount,

    mayBuildLaligaCanonicalStandingCandidateWriteVerificationGateCount: blockedPostCheckCount === 0 ? 1 : 0,
    mayBuildProviderSpecificParserGapPlanCount: blockedPostCheckCount === 0 ? 1 : 0,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 1,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    productionWrite: false,
    truthAssertion: false
  },
  preChecks,
  postChecks,
  canonicalStandingCandidateCompetitionRows: writtenCompetitionRows,
  canonicalStandingCandidateRows: writtenRows
};

writeJson(diagnosticOutputPath, diagnostic);

console.log(JSON.stringify({
  output: diagnostic.output,
  canonicalOutputPath,
  canonicalOutputSha256,
  laligaFullTableCanonicalCandidateWriteRunnerStatus: diagnostic.summary.laligaFullTableCanonicalCandidateWriteRunnerStatus,
  canonicalWriteFileCount: diagnostic.summary.canonicalWriteFileCount,
  canonicalStandingCandidateCompetitionCount: diagnostic.summary.canonicalStandingCandidateCompetitionCount,
  canonicalStandingCandidateRowCount: diagnostic.summary.canonicalStandingCandidateRowCount,
  canonicalStandingCandidateRowsByCompetition: diagnostic.summary.canonicalStandingCandidateRowsByCompetition,
  mayBuildLaligaCanonicalStandingCandidateWriteVerificationGateCount: diagnostic.summary.mayBuildLaligaCanonicalStandingCandidateWriteVerificationGateCount,
  productionWriteExecutedNowCount: diagnostic.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: diagnostic.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}
