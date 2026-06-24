import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-approval-gate-2026-06-15",
  "laliga-full-table-canonical-candidate-approval-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "laliga-full-table-canonical-candidate-execution-approval-gate-2026-06-15.json"
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

function buildExecutionApprovalRows(approvalRows) {
  return approvalRows.map((row, index) => ({
    laligaFullTableCanonicalCandidateExecutionApprovalGateRowId: `laliga_full_table_canonical_candidate_execution_approval_gate_${String(index + 1).padStart(2, "0")}`,
    sourceLaligaFullTableCanonicalCandidateApprovalGateRowId: row.laligaFullTableCanonicalCandidateApprovalGateRowId,
    sourceLaligaFullTableCanonicalCandidateProposalQualityGateRowId: row.sourceLaligaFullTableCanonicalCandidateProposalQualityGateRowId,
    sourceLaligaFullTableCanonicalCandidateProposalRowId: row.sourceLaligaFullTableCanonicalCandidateProposalRowId,
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    proposedCanonicalDataset: row.proposedCanonicalDataset,
    proposedCanonicalCandidateKind: row.proposedCanonicalCandidateKind,
    approvedStandingRowCount: row.approvedStandingRowCount,
    expectedLeagueSize: row.expectedLeagueSize,
    expectedPlayed: row.expectedPlayed,
    sourceQualityGateRowIds: row.sourceQualityGateRowIds,
    sourceCandidateRowIds: row.sourceCandidateRowIds,
    approvedStandingRows: row.approvedStandingRows,
    executionApprovalStatus: "approved_for_explicit_user_approved_laliga_canonical_standings_candidate_write_runner_only",
    approvedExecutionScope: "canonical_standings_candidate_write_only",
    nextAllowedAction: "build_laliga_full_table_canonical_candidate_write_runner_after_explicit_user_approval",
    requiresExplicitUserApprovalBeforeWriteRunner: true,
    canonicalWriteRunnerMayBeBuilt: true,
    canonicalWriteRunnerMayBeExecutedWithoutUserApproval: false,
    canonicalWriteExecutionAllowedInThisJob: false,
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
  throw new Error(`Missing LaLiga canonical candidate approval gate diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const approvalRows = Array.isArray(source.approvalRows) ? source.approvalRows : [];
const approvedStandingRows = Array.isArray(source.approvedStandingRows) ? source.approvedStandingRows : [];
const executionApprovalRows = buildExecutionApprovalRows(approvalRows);
const executionApprovedStandingRows = executionApprovalRows.flatMap((row) =>
  row.approvedStandingRows.map((standingRow) => ({
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    ...standingRow
  }))
);

const checks = [];

assertEqual("sourceApprovalGateStatus", summary.laligaFullTableCanonicalCandidateApprovalGateStatus, "passed", checks);
assertEqual("sourceApprovalGatePassedCount", Number(summary.laligaFullTableCanonicalCandidateApprovalGatePassedCount ?? 0), 1, checks);
assertEqual("sourceMayBuildExecutionApprovalGateCount", Number(summary.mayBuildLaligaFullTableCanonicalCandidateExecutionApprovalGateCount ?? 0), 1, checks);
assertEqual("sourceApprovedProposalRowCount", Number(summary.approvedProposalRowCount ?? 0), 2, checks);
assertEqual("sourceApprovedProposalCompetitionCount", Number(summary.approvedProposalCompetitionCount ?? 0), 2, checks);
assertEqual("sourceApprovedStandingRowCount", Number(summary.approvedStandingRowCount ?? 0), 42, checks);

assertEqual("approvalRowCount", approvalRows.length, 2, checks);
assertEqual("approvedStandingRowCount", approvedStandingRows.length, 42, checks);
assertEqual("executionApprovalRowCount", executionApprovalRows.length, 2, checks);
assertEqual("executionApprovedStandingRowCount", executionApprovedStandingRows.length, 42, checks);

assertArrayEqual("executionApprovalCompetitions", uniqueSorted(executionApprovalRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);
assertArrayEqual("executionApprovalProviderFamilies", uniqueSorted(executionApprovalRows.map((row) => row.providerFamily)), ["laliga"], checks);
assertArrayEqual("executionApprovedStandingCompetitions", uniqueSorted(executionApprovedStandingRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const executionApprovalRow = executionApprovalRows.find((row) => row.competitionSlug === competitionSlug);
  const rows = rowsForCompetition(executionApprovedStandingRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedLeagueSize }, (_, index) => String(index + 1));
  const playedValues = uniqueSorted(rows.map((row) => row.played));
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.executionApprovalRowPresent`, Boolean(executionApprovalRow), true, checks);
  assertEqual(`${competitionSlug}.expectedLeagueSize`, Number(executionApprovalRow?.expectedLeagueSize ?? 0), expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.expectedPlayed`, Number(executionApprovalRow?.expectedPlayed ?? 0), expectation.expectedPlayed, checks);
  assertEqual(`${competitionSlug}.approvedStandingRowCount`, Number(executionApprovalRow?.approvedStandingRowCount ?? 0), expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.flatApprovedStandingRowCount`, rows.length, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedLeagueSize, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertArrayEqual(`${competitionSlug}.playedValues`, playedValues, [String(expectation.expectedPlayed)], checks);
  assertEqual(`${competitionSlug}.sourceQualityGateRowIdCount`, Array.isArray(executionApprovalRow?.sourceQualityGateRowIds) ? executionApprovalRow.sourceQualityGateRowIds.length : 0, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.sourceCandidateRowIdCount`, Array.isArray(executionApprovalRow?.sourceCandidateRowIds) ? executionApprovalRow.sourceCandidateRowIds.length : 0, expectation.expectedLeagueSize, checks);
}

assertAll("executionApprovalRowsHaveCorrectStatus", executionApprovalRows, (row) => row.executionApprovalStatus === "approved_for_explicit_user_approved_laliga_canonical_standings_candidate_write_runner_only", checks);
assertAll("executionApprovalRowsHaveCorrectScope", executionApprovalRows, (row) => row.approvedExecutionScope === "canonical_standings_candidate_write_only", checks);
assertAll("executionApprovalRowsHaveCorrectNextAllowedAction", executionApprovalRows, (row) => row.nextAllowedAction === "build_laliga_full_table_canonical_candidate_write_runner_after_explicit_user_approval", checks);
assertAll("executionApprovalRowsRequireExplicitUserApproval", executionApprovalRows, (row) => row.requiresExplicitUserApprovalBeforeWriteRunner === true, checks);
assertAll("executionApprovalRowsMayBuildRunner", executionApprovalRows, (row) => row.canonicalWriteRunnerMayBeBuilt === true, checks);
assertAll("executionApprovalRowsMayNotExecuteRunnerWithoutUserApproval", executionApprovalRows, (row) => row.canonicalWriteRunnerMayBeExecutedWithoutUserApproval === false, checks);
assertAll("executionApprovalRowsDoNotAllowCanonicalWriteInThisJob", executionApprovalRows, (row) => row.canonicalWriteExecutionAllowedInThisJob === false, checks);
assertAll("executionApprovalRowsDoNotAllowCanonicalWriteNow", executionApprovalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("executionApprovalRowsDoNotAllowProductionWriteNow", executionApprovalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("executionApprovalRowsDoNotAllowTruthAssertionNow", executionApprovalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("executionApprovalRowsDidNotExecuteCanonicalWrite", executionApprovalRows, (row) => row.canonicalWriteExecutedNow === false, checks);
assertAll("executionApprovalRowsDidNotExecuteProductionWrite", executionApprovalRows, (row) => row.productionWriteExecutedNow === false, checks);
assertAll("executionApprovalRowsDidNotExecuteTruthAssertion", executionApprovalRows, (row) => row.truthAssertionExecutedNow === false, checks);

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

const blockedExecutionApprovalCheckCount = checks.filter((check) => !check.passed).length;
const passedExecutionApprovalCheckCount = checks.filter((check) => check.passed).length;

const gate = {
  output: outputPath,
  job: "run-football-truth-laliga-full-table-canonical-candidate-execution-approval-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    executionApprovalGateOnly: true,
    executionApprovalDoesNotWriteCanonicalStandings: true,
    executionApprovalDoesNotWriteProduction: true,
    executionApprovalDoesNotAssertTruth: true,
    explicitUserApprovalRequiredBeforeWriteRunner: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowedInThisJob: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    laligaFullTableCanonicalCandidateExecutionApprovalGateReadCount: 1,
    sourceApprovalGateStatus: summary.laligaFullTableCanonicalCandidateApprovalGateStatus,

    executionApprovalRowCount: executionApprovalRows.length,
    executionApprovalCompetitionCount: uniqueSorted(executionApprovalRows.map((row) => row.competitionSlug)).length,
    executionApprovalProviderFamilyCount: uniqueSorted(executionApprovalRows.map((row) => row.providerFamily)).length,
    executionApprovedStandingRowCount: executionApprovedStandingRows.length,
    executionApprovedStandingRowsByCompetition: countBy(executionApprovedStandingRows, "competitionSlug"),
    executionApprovalCompetitions: uniqueSorted(executionApprovalRows.map((row) => row.competitionSlug)),

    executionApprovalCheckCount: checks.length,
    passedExecutionApprovalCheckCount,
    blockedExecutionApprovalCheckCount,
    laligaFullTableCanonicalCandidateExecutionApprovalGateStatus: blockedExecutionApprovalCheckCount === 0 ? "passed" : "blocked",
    laligaFullTableCanonicalCandidateExecutionApprovalGatePassedCount: blockedExecutionApprovalCheckCount === 0 ? 1 : 0,

    mayBuildLaligaFullTableCanonicalCandidateWriteRunnerCount: blockedExecutionApprovalCheckCount === 0 ? 1 : 0,
    laligaFullTableCanonicalCandidateWriteRunnerRequiresExplicitUserApprovalCount: blockedExecutionApprovalCheckCount === 0 ? 1 : 0,
    mayExecuteCanonicalWriteNowCount: 0,
    mayWriteCanonicalNowCount: 0,
    mayWriteProductionNowCount: 0,
    mayAssertTruthNowCount: 0,

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
  executionApprovalRows,
  executionApprovedStandingRows
};

writeJson(outputPath, gate);

console.log(JSON.stringify({
  output: gate.output,
  laligaFullTableCanonicalCandidateExecutionApprovalGateStatus: gate.summary.laligaFullTableCanonicalCandidateExecutionApprovalGateStatus,
  executionApprovalRowCount: gate.summary.executionApprovalRowCount,
  executionApprovalCompetitionCount: gate.summary.executionApprovalCompetitionCount,
  executionApprovedStandingRowCount: gate.summary.executionApprovedStandingRowCount,
  executionApprovedStandingRowsByCompetition: gate.summary.executionApprovedStandingRowsByCompetition,
  mayBuildLaligaFullTableCanonicalCandidateWriteRunnerCount: gate.summary.mayBuildLaligaFullTableCanonicalCandidateWriteRunnerCount,
  laligaFullTableCanonicalCandidateWriteRunnerRequiresExplicitUserApprovalCount: gate.summary.laligaFullTableCanonicalCandidateWriteRunnerRequiresExplicitUserApprovalCount,
  mayWriteCanonicalNowCount: gate.summary.mayWriteCanonicalNowCount,
  productionWriteExecutedNowCount: gate.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: gate.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedExecutionApprovalCheckCount !== 0) {
  process.exitCode = 1;
}
