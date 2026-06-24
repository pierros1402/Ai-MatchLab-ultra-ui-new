import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-proposal-quality-gate-2026-06-15",
  "laliga-full-table-canonical-candidate-proposal-quality-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "laliga-full-table-canonical-candidate-approval-gate-2026-06-15.json"
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

function buildApprovalRows(qualityGatedProposalRows) {
  return qualityGatedProposalRows.map((row, index) => ({
    laligaFullTableCanonicalCandidateApprovalGateRowId: `laliga_full_table_canonical_candidate_approval_gate_${String(index + 1).padStart(2, "0")}`,
    sourceLaligaFullTableCanonicalCandidateProposalQualityGateRowId: row.laligaFullTableCanonicalCandidateProposalQualityGateRowId,
    sourceLaligaFullTableCanonicalCandidateProposalRowId: row.sourceLaligaFullTableCanonicalCandidateProposalRowId,
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    proposedCanonicalDataset: row.proposedCanonicalDataset,
    proposedCanonicalCandidateKind: row.proposedCanonicalCandidateKind,
    approvedStandingRowCount: row.proposedStandingRowCount,
    expectedLeagueSize: row.expectedLeagueSize,
    expectedPlayed: row.expectedPlayed,
    sourceQualityGateRowIds: row.sourceQualityGateRowIds,
    sourceCandidateRowIds: row.sourceCandidateRowIds,
    approvedStandingRows: row.proposedStandingRows,
    approvalStatus: "approved_for_laliga_full_table_canonical_candidate_execution_approval_gate_only",
    nextAllowedAction: "build_laliga_full_table_canonical_candidate_execution_approval_gate",
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false
  }));
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing LaLiga proposal quality gate diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const qualityGatedProposalRows = Array.isArray(source.qualityGatedProposalRows) ? source.qualityGatedProposalRows : [];
const qualityGatedProposedStandingRows = Array.isArray(source.qualityGatedProposedStandingRows) ? source.qualityGatedProposedStandingRows : [];
const approvalRows = buildApprovalRows(qualityGatedProposalRows);
const approvedStandingRows = approvalRows.flatMap((row) =>
  row.approvedStandingRows.map((standingRow) => ({
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    ...standingRow
  }))
);

const checks = [];

assertEqual("sourceProposalQualityGateStatus", summary.laligaFullTableCanonicalCandidateProposalQualityGateStatus, "passed", checks);
assertEqual("sourceProposalQualityGatePassedCount", Number(summary.laligaFullTableCanonicalCandidateProposalQualityGatePassedCount ?? 0), 1, checks);
assertEqual("sourceMayBuildApprovalGateCount", Number(summary.mayBuildLaligaFullTableCanonicalCandidateApprovalGateCount ?? 0), 1, checks);
assertEqual("sourceQualityGatedProposalRowCount", Number(summary.qualityGatedProposalRowCount ?? 0), 2, checks);
assertEqual("sourceQualityGatedProposalCompetitionCount", Number(summary.qualityGatedProposalCompetitionCount ?? 0), 2, checks);
assertEqual("sourceQualityGatedProposedStandingRowCount", Number(summary.qualityGatedProposedStandingRowCount ?? 0), 42, checks);

assertEqual("qualityGatedProposalRowCount", qualityGatedProposalRows.length, 2, checks);
assertEqual("qualityGatedProposedStandingRowCount", qualityGatedProposedStandingRows.length, 42, checks);
assertEqual("approvalRowCount", approvalRows.length, 2, checks);
assertEqual("approvedStandingRowCount", approvedStandingRows.length, 42, checks);

assertArrayEqual("approvalCompetitions", uniqueSorted(approvalRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);
assertArrayEqual("approvalProviderFamilies", uniqueSorted(approvalRows.map((row) => row.providerFamily)), ["laliga"], checks);
assertArrayEqual("approvedStandingCompetitions", uniqueSorted(approvedStandingRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const approvalRow = approvalRows.find((row) => row.competitionSlug === competitionSlug);
  const rows = rowsForCompetition(approvedStandingRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedLeagueSize }, (_, index) => String(index + 1));
  const playedValues = uniqueSorted(rows.map((row) => row.played));
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.approvalRowPresent`, Boolean(approvalRow), true, checks);
  assertEqual(`${competitionSlug}.expectedLeagueSize`, Number(approvalRow?.expectedLeagueSize ?? 0), expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.expectedPlayed`, Number(approvalRow?.expectedPlayed ?? 0), expectation.expectedPlayed, checks);
  assertEqual(`${competitionSlug}.approvedStandingRowCount`, Number(approvalRow?.approvedStandingRowCount ?? 0), expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.flatApprovedStandingRowCount`, rows.length, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedLeagueSize, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertArrayEqual(`${competitionSlug}.playedValues`, playedValues, [String(expectation.expectedPlayed)], checks);
  assertEqual(`${competitionSlug}.sourceQualityGateRowIdCount`, Array.isArray(approvalRow?.sourceQualityGateRowIds) ? approvalRow.sourceQualityGateRowIds.length : 0, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.sourceCandidateRowIdCount`, Array.isArray(approvalRow?.sourceCandidateRowIds) ? approvalRow.sourceCandidateRowIds.length : 0, expectation.expectedLeagueSize, checks);
}

assertAll("approvalRowsHaveCorrectStatus", approvalRows, (row) => row.approvalStatus === "approved_for_laliga_full_table_canonical_candidate_execution_approval_gate_only", checks);
assertAll("approvalRowsHaveCorrectNextAllowedAction", approvalRows, (row) => row.nextAllowedAction === "build_laliga_full_table_canonical_candidate_execution_approval_gate", checks);
assertAll("approvalRowsDoNotAllowCanonicalWriteNow", approvalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("approvalRowsDoNotAllowProductionWriteNow", approvalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("approvalRowsDoNotAllowTruthAssertionNow", approvalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("approvalRowsDidNotExecuteCanonicalWrite", approvalRows, (row) => row.canonicalWriteExecutedNow === false, checks);
assertAll("approvalRowsDidNotExecuteProductionWrite", approvalRows, (row) => row.productionWriteExecutedNow === false, checks);
assertAll("approvalRowsDidNotExecuteTruthAssertion", approvalRows, (row) => row.truthAssertionExecutedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWrites", Number(summary.canonicalWrites ?? 0), 0, checks);
assertEqual("sourceProductionWrite", Boolean(summary.productionWrite), false, checks);
assertEqual("sourceTruthAssertion", Boolean(summary.truthAssertion), false, checks);

const blockedApprovalCheckCount = checks.filter((check) => !check.passed).length;
const passedApprovalCheckCount = checks.filter((check) => check.passed).length;

const gate = {
  output: outputPath,
  job: "run-football-truth-laliga-full-table-canonical-candidate-approval-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    approvalGateOnly: true,
    approvalDoesNotWriteCanonicalStandings: true,
    approvalDoesNotWriteProduction: true,
    approvalDoesNotAssertTruth: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    laligaFullTableCanonicalCandidateApprovalGateReadCount: 1,
    sourceProposalQualityGateStatus: summary.laligaFullTableCanonicalCandidateProposalQualityGateStatus,

    approvedProposalRowCount: approvalRows.length,
    approvedProposalCompetitionCount: uniqueSorted(approvalRows.map((row) => row.competitionSlug)).length,
    approvedProposalProviderFamilyCount: uniqueSorted(approvalRows.map((row) => row.providerFamily)).length,
    approvedStandingRowCount: approvedStandingRows.length,
    approvedStandingRowsByCompetition: countBy(approvedStandingRows, "competitionSlug"),
    approvedCompetitions: uniqueSorted(approvalRows.map((row) => row.competitionSlug)),

    approvalCheckCount: checks.length,
    passedApprovalCheckCount,
    blockedApprovalCheckCount,
    laligaFullTableCanonicalCandidateApprovalGateStatus: blockedApprovalCheckCount === 0 ? "passed" : "blocked",
    laligaFullTableCanonicalCandidateApprovalGatePassedCount: blockedApprovalCheckCount === 0 ? 1 : 0,

    mayBuildLaligaFullTableCanonicalCandidateExecutionApprovalGateCount: blockedApprovalCheckCount === 0 ? 1 : 0,
    mayBuildProviderSpecificParserGapPlanCount: blockedApprovalCheckCount === 0 ? 1 : 0,

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
  approvalRows,
  approvedStandingRows
};

writeJson(outputPath, gate);

console.log(JSON.stringify({
  output: gate.output,
  laligaFullTableCanonicalCandidateApprovalGateStatus: gate.summary.laligaFullTableCanonicalCandidateApprovalGateStatus,
  approvedProposalRowCount: gate.summary.approvedProposalRowCount,
  approvedProposalCompetitionCount: gate.summary.approvedProposalCompetitionCount,
  approvedStandingRowCount: gate.summary.approvedStandingRowCount,
  approvedStandingRowsByCompetition: gate.summary.approvedStandingRowsByCompetition,
  mayBuildLaligaFullTableCanonicalCandidateExecutionApprovalGateCount: gate.summary.mayBuildLaligaFullTableCanonicalCandidateExecutionApprovalGateCount,
  mayBuildProviderSpecificParserGapPlanCount: gate.summary.mayBuildProviderSpecificParserGapPlanCount,
  productionWriteExecutedNowCount: gate.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: gate.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedApprovalCheckCount !== 0) {
  process.exitCode = 1;
}
