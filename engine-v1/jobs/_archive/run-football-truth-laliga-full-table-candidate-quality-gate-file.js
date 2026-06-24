import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-extraction-expansion-runner-2026-06-15",
  "laliga-full-table-extraction-expansion-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-candidate-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "laliga-full-table-candidate-quality-gate-2026-06-15.json"
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

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
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

function expectedPositions(size) {
  return Array.from({ length: size }, (_, index) => String(index + 1));
}

function qualityGateRowsForCompetition(competitionSlug, rows) {
  return rows
    .filter((row) => row.competitionSlug === competitionSlug)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((row, index) => ({
      laligaFullTableCandidateQualityGateRowId: `laliga_full_table_candidate_quality_gate_${competitionSlug}_${String(index + 1).padStart(2, "0")}`,
      sourceLaligaFullTableCandidateRowId: row.laligaFullTableCandidateRowId,
      competitionSlug,
      providerFamily: row.providerFamily,
      teamName: row.teamName,
      position: Number(row.position),
      points: Number(row.points),
      played: Number(row.played),
      won: row.won === null ? null : Number(row.won),
      drawn: row.drawn === null ? null : Number(row.drawn),
      lost: row.lost === null ? null : Number(row.lost),
      goalsFor: row.goalsFor === null ? null : Number(row.goalsFor),
      goalsAgainst: row.goalsAgainst === null ? null : Number(row.goalsAgainst),
      goalDifference: row.goalDifference === null ? null : Number(row.goalDifference),
      qualityGateStatus: "passed_full_table_candidate_not_truth_asserted",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

function isNonIncreasingByPoints(rows) {
  const sorted = [...rows].sort((a, b) => Number(a.position) - Number(b.position));
  for (let index = 1; index < sorted.length; index += 1) {
    if (Number(sorted[index].points) > Number(sorted[index - 1].points)) return false;
  }
  return true;
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing LaLiga full-table extraction expansion runner diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const candidateRows = Array.isArray(source.laligaFullTableCandidateRows) ? source.laligaFullTableCandidateRows : [];

const checks = [];

assertEqual("sourceStatus", summary.laligaFullTableExtractionExpansionRunnerStatus, "passed_with_complete_full_tables", checks);
assertEqual("sourceFetchAttemptCount", Number(summary.laligaExpansionFetchAttemptCount ?? 0), 4, checks);
assertEqual("sourceOkFetchCount", Number(summary.laligaExpansionOkFetchCount ?? 0), 4, checks);
assertEqual("sourceRawStandingCandidateCount", Number(summary.rawStandingCandidateCount ?? 0), 344, checks);
assertEqual("sourceFullTableCandidateRowCount", Number(summary.laligaFullTableCandidateRowCount ?? 0), 42, checks);
assertEqual("sourceFullTableCompetitionCount", Number(summary.laligaFullTableCompetitionCount ?? 0), 2, checks);
assertArrayEqual("sourceCompleteFullTableCompetitions", summary.competitionsWithCompleteFullTables, ["esp.1", "esp.2"], checks);
assertEqual("sourceMayBuildQualityGateCount", Number(summary.mayBuildLaligaFullTableCandidateQualityGateCount ?? 0), 1, checks);

assertEqual("candidateRowCount", candidateRows.length, 42, checks);
assertArrayEqual("candidateCompetitions", uniqueSorted(candidateRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], checks);
assertArrayEqual("candidateProviderFamilies", uniqueSorted(candidateRows.map((row) => row.providerFamily)), ["laliga"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const rows = candidateRows.filter((row) => row.competitionSlug === competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));
  const playedValues = uniqueSorted(rows.map((row) => row.played));

  assertEqual(`${competitionSlug}.rowCount`, rows.length, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedLeagueSize, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions(expectation.expectedLeagueSize), checks);
  assertArrayEqual(`${competitionSlug}.playedValues`, playedValues, [String(expectation.expectedPlayed)], checks);
  assertEqual(`${competitionSlug}.pointsNonIncreasingByPosition`, isNonIncreasingByPoints(rows), true, checks);
}

assertAll("rowsHaveCandidateStatus", candidateRows, (row) => row.candidateStatus === "laliga_full_table_candidate_not_truth_asserted", checks);
assertAll("rowsHaveNumericPosition", candidateRows, (row) => Number.isFinite(Number(row.position)), checks);
assertAll("rowsHaveNumericPoints", candidateRows, (row) => Number.isFinite(Number(row.points)), checks);
assertAll("rowsHaveNumericPlayed", candidateRows, (row) => Number.isFinite(Number(row.played)), checks);
assertAll("rowsDoNotAllowCanonicalWriteNow", candidateRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("rowsDoNotAllowProductionWriteNow", candidateRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("rowsDoNotAllowTruthAssertionNow", candidateRows, (row) => row.truthAssertionAllowedNow === false, checks);

assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWrites", Number(summary.canonicalWrites ?? 0), 0, checks);
assertEqual("sourceProductionWrite", Boolean(summary.productionWrite), false, checks);
assertEqual("sourceTruthAssertion", Boolean(summary.truthAssertion), false, checks);

const qualityGatedRows = [
  ...qualityGateRowsForCompetition("esp.1", candidateRows),
  ...qualityGateRowsForCompetition("esp.2", candidateRows)
];

const blockedQualityGateCheckCount = checks.filter((check) => !check.passed).length;
const passedQualityGateCheckCount = checks.filter((check) => check.passed).length;

const gate = {
  output: outputPath,
  job: "run-football-truth-laliga-full-table-candidate-quality-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    qualityGateOnly: true,
    fullTableCandidatesAreNotTruthAssertions: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    laligaFullTableCandidateQualityGateReadCount: 1,
    sourceStatus: summary.laligaFullTableExtractionExpansionRunnerStatus,

    candidateRowCount: candidateRows.length,
    qualityGatedCandidateRowCount: qualityGatedRows.length,
    qualityGatedCompetitionCount: uniqueSorted(qualityGatedRows.map((row) => row.competitionSlug)).length,
    qualityGatedProviderFamilyCount: uniqueSorted(qualityGatedRows.map((row) => row.providerFamily)).length,

    fullTableCountsByCompetition: countBy(qualityGatedRows, "competitionSlug"),
    competitionsWithQualityGatedFullTables: uniqueSorted(qualityGatedRows.map((row) => row.competitionSlug)),

    qualityGateCheckCount: checks.length,
    passedQualityGateCheckCount,
    blockedQualityGateCheckCount,
    laligaFullTableCandidateQualityGateStatus: blockedQualityGateCheckCount === 0 ? "passed" : "blocked",
    laligaFullTableCandidateQualityGatePassedCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

    mayBuildLaligaFullTableCanonicalCandidateProposalCount: blockedQualityGateCheckCount === 0 ? 1 : 0,
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
  qualityGatedRows
};

writeJson(outputPath, gate);

console.log(JSON.stringify({
  output: gate.output,
  laligaFullTableCandidateQualityGateStatus: gate.summary.laligaFullTableCandidateQualityGateStatus,
  qualityGatedCandidateRowCount: gate.summary.qualityGatedCandidateRowCount,
  qualityGatedCompetitionCount: gate.summary.qualityGatedCompetitionCount,
  fullTableCountsByCompetition: gate.summary.fullTableCountsByCompetition,
  competitionsWithQualityGatedFullTables: gate.summary.competitionsWithQualityGatedFullTables,
  mayBuildLaligaFullTableCanonicalCandidateProposalCount: gate.summary.mayBuildLaligaFullTableCanonicalCandidateProposalCount,
  mayBuildProviderSpecificParserGapPlanCount: gate.summary.mayBuildProviderSpecificParserGapPlanCount,
  productionWriteExecutedNowCount: gate.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: gate.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedQualityGateCheckCount !== 0) {
  process.exitCode = 1;
}

