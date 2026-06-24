import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-candidate-quality-gate-2026-06-15",
  "laliga-full-table-candidate-quality-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-canonical-candidate-proposal-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "laliga-full-table-canonical-candidate-proposal-2026-06-15.json"
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

function buildProposalRows(qualityGatedRows) {
  return Object.entries(expected).map(([competitionSlug, expectation], index) => {
    const rows = rowsForCompetition(qualityGatedRows, competitionSlug);

    return {
      laligaFullTableCanonicalCandidateProposalRowId: `laliga_full_table_canonical_candidate_proposal_${String(index + 1).padStart(2, "0")}`,
      competitionSlug,
      providerFamily: "laliga",
      proposedCanonicalDataset: "football_truth_standings_candidates",
      proposedCanonicalCandidateKind: "quality_gated_full_table_standings_candidate",
      sourceQualityGateRowIds: rows.map((row) => row.laligaFullTableCandidateQualityGateRowId),
      sourceCandidateRowIds: rows.map((row) => row.sourceLaligaFullTableCandidateRowId),
      expectedLeagueSize: expectation.expectedLeagueSize,
      expectedPlayed: expectation.expectedPlayed,
      proposedStandingRowCount: rows.length,
      proposedStandingRows: rows.map((row) => ({
        position: Number(row.position),
        teamName: row.teamName,
        points: Number(row.points),
        played: Number(row.played),
        won: row.won === null ? null : Number(row.won),
        drawn: row.drawn === null ? null : Number(row.drawn),
        lost: row.lost === null ? null : Number(row.lost),
        goalsFor: row.goalsFor === null ? null : Number(row.goalsFor),
        goalsAgainst: row.goalsAgainst === null ? null : Number(row.goalsAgainst),
        goalDifference: row.goalDifference === null ? null : Number(row.goalDifference)
      })),
      proposalStatus: "proposed_canonical_standings_candidate_not_written",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false,
      canonicalWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false
    };
  });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing LaLiga full-table candidate quality gate diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const qualityGatedRows = Array.isArray(source.qualityGatedRows) ? source.qualityGatedRows : [];
const proposalRows = buildProposalRows(qualityGatedRows);

const proposedStandingRows = proposalRows.flatMap((row) =>
  row.proposedStandingRows.map((standingRow) => ({
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    ...standingRow
  }))
);

const checks = [];

assertEqual("sourceQualityGateStatus", summary.laligaFullTableCandidateQualityGateStatus, "passed", checks);
assertEqual("sourceQualityGatePassedCount", Number(summary.laligaFullTableCandidateQualityGatePassedCount ?? 0), 1, checks);
assertEqual("sourceMayBuildProposalCount", Number(summary.mayBuildLaligaFullTableCanonicalCandidateProposalCount ?? 0), 1, checks);
assertEqual("sourceQualityGatedCandidateRowCount", Number(summary.qualityGatedCandidateRowCount ?? 0), 42, checks);
assertEqual("sourceQualityGatedCompetitionCount", Number(summary.qualityGatedCompetitionCount ?? 0), 2, checks);
assertArrayEqual("sourceCompetitionsWithQualityGatedFullTables", summary.competitionsWithQualityGatedFullTables, ["esp.1", "esp.2"], checks);

assertEqual("qualityGatedRowCount", qualityGatedRows.length, 42, checks);
assertEqual("proposalRowCount", proposalRows.length, 2, checks);
assertEqual("proposedStandingRowCount", proposedStandingRows.length, 42, checks);
assertArrayEqual("proposalCompetitions", uniqueSorted(proposalRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);
assertArrayEqual("proposalProviderFamilies", uniqueSorted(proposalRows.map((row) => row.providerFamily)), ["laliga"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const rows = proposedStandingRows.filter((row) => row.competitionSlug === competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedLeagueSize }, (_, index) => String(index + 1));
  const playedValues = uniqueSorted(rows.map((row) => row.played));

  assertEqual(`${competitionSlug}.proposedStandingRowCount`, rows.length, expectation.expectedLeagueSize, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertArrayEqual(`${competitionSlug}.playedValues`, playedValues, [String(expectation.expectedPlayed)], checks);
}

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

const blockedProposalCheckCount = checks.filter((check) => !check.passed).length;
const passedProposalCheckCount = checks.filter((check) => check.passed).length;

const proposal = {
  output: outputPath,
  job: "build-football-truth-laliga-full-table-canonical-candidate-proposal-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    proposalOnly: true,
    proposedRowsAreNotTruthAssertions: true,
    proposedRowsAreNotCanonicalWrites: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    laligaFullTableCanonicalCandidateProposalReadCount: 1,
    sourceQualityGateStatus: summary.laligaFullTableCandidateQualityGateStatus,

    proposalRowCount: proposalRows.length,
    proposalCompetitionCount: uniqueSorted(proposalRows.map((row) => row.competitionSlug)).length,
    proposalProviderFamilyCount: uniqueSorted(proposalRows.map((row) => row.providerFamily)).length,
    proposedStandingRowCount: proposedStandingRows.length,
    proposedStandingRowsByCompetition: countBy(proposedStandingRows, "competitionSlug"),
    proposalCompetitions: uniqueSorted(proposalRows.map((row) => row.competitionSlug)),

    proposalCheckCount: checks.length,
    passedProposalCheckCount,
    blockedProposalCheckCount,
    laligaFullTableCanonicalCandidateProposalStatus: blockedProposalCheckCount === 0 ? "passed" : "blocked",
    laligaFullTableCanonicalCandidateProposalPassedCount: blockedProposalCheckCount === 0 ? 1 : 0,

    mayBuildLaligaFullTableCanonicalCandidateProposalQualityGateCount: blockedProposalCheckCount === 0 ? 1 : 0,
    mayBuildProviderSpecificParserGapPlanCount: blockedProposalCheckCount === 0 ? 1 : 0,

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
  proposalRows,
  proposedStandingRows
};

writeJson(outputPath, proposal);

console.log(JSON.stringify({
  output: proposal.output,
  laligaFullTableCanonicalCandidateProposalStatus: proposal.summary.laligaFullTableCanonicalCandidateProposalStatus,
  proposalRowCount: proposal.summary.proposalRowCount,
  proposalCompetitionCount: proposal.summary.proposalCompetitionCount,
  proposedStandingRowCount: proposal.summary.proposedStandingRowCount,
  proposedStandingRowsByCompetition: proposal.summary.proposedStandingRowsByCompetition,
  mayBuildLaligaFullTableCanonicalCandidateProposalQualityGateCount: proposal.summary.mayBuildLaligaFullTableCanonicalCandidateProposalQualityGateCount,
  mayBuildProviderSpecificParserGapPlanCount: proposal.summary.mayBuildProviderSpecificParserGapPlanCount,
  productionWriteExecutedNowCount: proposal.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: proposal.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedProposalCheckCount !== 0) {
  process.exitCode = 1;
}
