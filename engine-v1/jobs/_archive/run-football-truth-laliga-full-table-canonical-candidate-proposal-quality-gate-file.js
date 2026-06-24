import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-proposal-2026-06-15",
  "laliga-full-table-canonical-candidate-proposal-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-proposal-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "laliga-full-table-canonical-candidate-proposal-quality-gate-2026-06-15.json"
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

function isNonIncreasingByPoints(rows) {
  const sorted = [...rows].sort((a, b) => Number(a.position) - Number(b.position));
  for (let index = 1; index < sorted.length; index += 1) {
    if (Number(sorted[index].points) > Number(sorted[index - 1].points)) return false;
  }
  return true;
}

function qualityGateProposalRows(proposalRows) {
  return proposalRows.map((row, index) => ({
    laligaFullTableCanonicalCandidateProposalQualityGateRowId: `laliga_full_table_canonical_candidate_proposal_quality_gate_${String(index + 1).padStart(2, "0")}`,
    sourceLaligaFullTableCanonicalCandidateProposalRowId: row.laligaFullTableCanonicalCandidateProposalRowId,
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    proposedCanonicalDataset: row.proposedCanonicalDataset,
    proposedCanonicalCandidateKind: row.proposedCanonicalCandidateKind,
    proposedStandingRowCount: row.proposedStandingRowCount,
    expectedLeagueSize: row.expectedLeagueSize,
    expectedPlayed: row.expectedPlayed,
    sourceQualityGateRowIds: row.sourceQualityGateRowIds,
    sourceCandidateRowIds: row.sourceCandidateRowIds,
    proposedStandingRows: row.proposedStandingRows,
    qualityGateStatus: "passed_canonical_standings_candidate_proposal_not_written",
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
  throw new Error(`Missing LaLiga canonical candidate proposal diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const proposalRows = Array.isArray(source.proposalRows) ? source.proposalRows : [];
const proposedStandingRows = Array.isArray(source.proposedStandingRows) ? source.proposedStandingRows : [];
const qualityGatedProposalRows = qualityGateProposalRows(proposalRows);

const checks = [];

assertEqual("sourceProposalStatus", summary.laligaFullTableCanonicalCandidateProposalStatus, "passed", checks);
assertEqual("sourceProposalPassedCount", Number(summary.laligaFullTableCanonicalCandidateProposalPassedCount ?? 0), 1, checks);
assertEqual("sourceMayBuildProposalQualityGateCount", Number(summary.mayBuildLaligaFullTableCanonicalCandidateProposalQualityGateCount ?? 0), 1, checks);
assertEqual("sourceProposalRowCount", Number(summary.proposalRowCount ?? 0), 2, checks);
assertEqual("sourceProposalCompetitionCount", Number(summary.proposalCompetitionCount ?? 0), 2, checks);
assertEqual("sourceProposedStandingRowCount", Number(summary.proposedStandingRowCount ?? 0), 42, checks);
assertArrayEqual("sourceProposalCompetitions", summary.proposalCompetitions, ["esp.1", "esp.2"], checks);

assertEqual("proposalRowCount", proposalRows.length, 2, checks);
assertEqual("proposedStandingRowCount", proposedStandingRows.length, 42, checks);
assertArrayEqual("proposalCompetitions", uniqueSorted(proposalRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);
assertArrayEqual("proposalProviderFamilies", uniqueSorted(proposalRows.map((row) => row.providerFamily)), ["laliga"], checks);
assertArrayEqual("proposedStandingCompetitions", uniqueSorted(proposedStandingRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const proposalRow = proposalRows.find((row) => row.competitionSlug === competitionSlug);
  const rows = proposedStandingRows
    .filter((row) => row.competitionSlug === competitionSlug)
    .sort((a, b) => Number(a.position) - Number(b.position));

  const proposalStandingRows = Array.isArray(proposalRow?.proposedStandingRows) ? proposalRow.proposedStandingRows : [];
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedLeagueSize }, (_, index) => String(index + 1));
  const playedValues = uniqueSorted(rows.map((row) => row.played));
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.proposalRowPresent`, Boolean(proposalRow), true, checks);
  assertEqual(`${competitionSlug}.proposalExpectedLeagueSize`, Number(proposalRow?.expectedLeagueSize ?? 0), expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.proposalExpectedPlayed`, Number(proposalRow?.expectedPlayed ?? 0), expectation.expectedPlayed, checks);
  assertEqual(`${competitionSlug}.proposalStandingRowCount`, Number(proposalRow?.proposedStandingRowCount ?? 0), expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.proposalNestedStandingRowCount`, proposalStandingRows.length, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.flatStandingRowCount`, rows.length, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedLeagueSize, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertArrayEqual(`${competitionSlug}.playedValues`, playedValues, [String(expectation.expectedPlayed)], checks);
  assertEqual(`${competitionSlug}.pointsNonIncreasingByPosition`, isNonIncreasingByPoints(rows), true, checks);
  assertEqual(`${competitionSlug}.sourceQualityGateRowIdCount`, Array.isArray(proposalRow?.sourceQualityGateRowIds) ? proposalRow.sourceQualityGateRowIds.length : 0, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.sourceCandidateRowIdCount`, Array.isArray(proposalRow?.sourceCandidateRowIds) ? proposalRow.sourceCandidateRowIds.length : 0, expectation.expectedLeagueSize, checks);
}

assertAll("proposalRowsHaveCorrectDataset", proposalRows, (row) => row.proposedCanonicalDataset === "football_truth_standings_candidates", checks);
assertAll("proposalRowsHaveCorrectCandidateKind", proposalRows, (row) => row.proposedCanonicalCandidateKind === "quality_gated_full_table_standings_candidate", checks);
assertAll("proposalRowsAreNotWritten", proposalRows, (row) => row.proposalStatus === "proposed_canonical_standings_candidate_not_written", checks);
assertAll("proposalRowsDoNotAllowCanonicalWriteNow", proposalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("proposalRowsDoNotAllowProductionWriteNow", proposalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("proposalRowsDoNotAllowTruthAssertionNow", proposalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("proposalRowsDidNotExecuteCanonicalWrite", proposalRows, (row) => row.canonicalWriteExecutedNow === false, checks);
assertAll("proposalRowsDidNotExecuteProductionWrite", proposalRows, (row) => row.productionWriteExecutedNow === false, checks);
assertAll("proposalRowsDidNotExecuteTruthAssertion", proposalRows, (row) => row.truthAssertionExecutedNow === false, checks);

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

const blockedQualityGateCheckCount = checks.filter((check) => !check.passed).length;
const passedQualityGateCheckCount = checks.filter((check) => check.passed).length;

const gate = {
  output: outputPath,
  job: "run-football-truth-laliga-full-table-canonical-candidate-proposal-quality-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    qualityGateOnly: true,
    proposalRowsAreNotTruthAssertions: true,
    proposalRowsAreNotCanonicalWrites: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    laligaFullTableCanonicalCandidateProposalQualityGateReadCount: 1,
    sourceProposalStatus: summary.laligaFullTableCanonicalCandidateProposalStatus,

    qualityGatedProposalRowCount: qualityGatedProposalRows.length,
    qualityGatedProposalCompetitionCount: uniqueSorted(qualityGatedProposalRows.map((row) => row.competitionSlug)).length,
    qualityGatedProposalProviderFamilyCount: uniqueSorted(qualityGatedProposalRows.map((row) => row.providerFamily)).length,
    qualityGatedProposedStandingRowCount: proposedStandingRows.length,
    qualityGatedProposedStandingRowsByCompetition: countBy(proposedStandingRows, "competitionSlug"),
    qualityGatedProposalCompetitions: uniqueSorted(qualityGatedProposalRows.map((row) => row.competitionSlug)),

    qualityGateCheckCount: checks.length,
    passedQualityGateCheckCount,
    blockedQualityGateCheckCount,
    laligaFullTableCanonicalCandidateProposalQualityGateStatus: blockedQualityGateCheckCount === 0 ? "passed" : "blocked",
    laligaFullTableCanonicalCandidateProposalQualityGatePassedCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

    mayBuildLaligaFullTableCanonicalCandidateApprovalGateCount: blockedQualityGateCheckCount === 0 ? 1 : 0,
    mayBuildProviderSpecificParserGapPlanCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

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
  qualityGatedProposalRows,
  qualityGatedProposedStandingRows: proposedStandingRows
};

writeJson(outputPath, gate);

console.log(JSON.stringify({
  output: gate.output,
  laligaFullTableCanonicalCandidateProposalQualityGateStatus: gate.summary.laligaFullTableCanonicalCandidateProposalQualityGateStatus,
  qualityGatedProposalRowCount: gate.summary.qualityGatedProposalRowCount,
  qualityGatedProposalCompetitionCount: gate.summary.qualityGatedProposalCompetitionCount,
  qualityGatedProposedStandingRowCount: gate.summary.qualityGatedProposedStandingRowCount,
  qualityGatedProposedStandingRowsByCompetition: gate.summary.qualityGatedProposedStandingRowsByCompetition,
  mayBuildLaligaFullTableCanonicalCandidateApprovalGateCount: gate.summary.mayBuildLaligaFullTableCanonicalCandidateApprovalGateCount,
  mayBuildProviderSpecificParserGapPlanCount: gate.summary.mayBuildProviderSpecificParserGapPlanCount,
  productionWriteExecutedNowCount: gate.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: gate.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedQualityGateCheckCount !== 0) {
  process.exitCode = 1;
}
