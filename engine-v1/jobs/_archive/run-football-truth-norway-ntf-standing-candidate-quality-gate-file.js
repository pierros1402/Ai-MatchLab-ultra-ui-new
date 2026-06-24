import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-controlled-html-table-parser-runner-2026-06-15",
  "norway-ntf-controlled-html-table-parser-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-standing-candidate-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-standing-candidate-quality-gate-2026-06-15.json"
);

const expected = {
  "nor.1": { expectedLeagueSize: 16 },
  "nor.2": { expectedLeagueSize: 16 }
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

function compactName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamName(rawName) {
  let name = compactName(rawName);

  const words = name.split(" ").filter(Boolean);
  if (words.length >= 2 && words.length % 2 === 0) {
    const half = words.length / 2;
    const left = words.slice(0, half).join(" ");
    const right = words.slice(half).join(" ");
    if (left.toLocaleLowerCase("nb-NO") === right.toLocaleLowerCase("nb-NO")) {
      name = left;
    }
  }

  const afterHalf = name.split(" ").filter(Boolean);
  if (afterHalf.length >= 3) {
    const first = afterHalf[0].toLocaleLowerCase("nb-NO");
    const last = afterHalf[afterHalf.length - 1].toLocaleLowerCase("nb-NO");
    if (first === last) {
      name = afterHalf.slice(0, -1).join(" ");
    }
  }

  return compactName(name);
}

function rowsForCompetition(rows, competitionSlug) {
  return rows
    .filter((row) => row.competitionSlug === competitionSlug)
    .sort((a, b) => Number(a.position) - Number(b.position));
}

function pointsNonIncreasing(rows) {
  const ordered = rowsForCompetition(rows, rows[0]?.competitionSlug);
  for (let index = 1; index < ordered.length; index += 1) {
    if (Number(ordered[index].points) > Number(ordered[index - 1].points)) return false;
  }
  return true;
}

function buildQualityGatedRows(rows) {
  return rows
    .sort((a, b) => {
      if (a.competitionSlug !== b.competitionSlug) return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
      return Number(a.position) - Number(b.position);
    })
    .map((row, index) => {
      const teamNameCanonical = normalizeTeamName(row.teamName);
      return {
        norwayNtfStandingCandidateQualityGateRowId: `norway_ntf_standing_candidate_quality_gate_${String(index + 1).padStart(3, "0")}`,
        sourceNorwayNtfStandingCandidateRowId: row.norwayNtfStandingCandidateRowId,
        sourceNorwayNtfHtmlTableParserFetchRowId: row.sourceNorwayNtfHtmlTableParserFetchRowId,
        competitionSlug: row.competitionSlug,
        providerFamily: row.providerFamily,
        parserStrategy: row.parserStrategy,
        tableOrdinal: row.tableOrdinal,
        sourceRowOrdinal: row.sourceRowOrdinal,
        teamNameRaw: row.teamName,
        teamNameCanonical,
        position: Number(row.position),
        points: Number(row.points),
        played: row.played === null ? null : Number(row.played),
        won: row.won === null ? null : Number(row.won),
        drawn: row.drawn === null ? null : Number(row.drawn),
        lost: row.lost === null ? null : Number(row.lost),
        goalsFor: row.goalsFor === null ? null : Number(row.goalsFor),
        goalsAgainst: row.goalsAgainst === null ? null : Number(row.goalsAgainst),
        goalDifference: row.goalDifference === null ? null : Number(row.goalDifference),
        rawCells: row.rawCells,
        qualityGateStatus: "quality_gated_standing_candidate_not_truth_asserted",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      };
    });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Norway NTF controlled HTML table parser runner diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const standingCandidateRows = Array.isArray(source.standingCandidateRows) ? source.standingCandidateRows : [];
const qualityGatedRows = buildQualityGatedRows(standingCandidateRows);

const checks = [];

assertEqual("sourceParserRunnerStatus", summary.norwayNtfControlledHtmlTableParserRunnerStatus, "passed_with_standing_candidates", checks);
assertEqual("sourceMayBuildQualityGateCount", Number(summary.mayBuildNorwayNtfStandingCandidateQualityGateCount ?? 0), 1, checks);
assertEqual("sourceStandingCandidateRowCount", Number(summary.standingCandidateRowCount ?? 0), 32, checks);
assertEqual("sourceStandingCandidateCompetitionCount", Number(summary.standingCandidateCompetitionCount ?? 0), 2, checks);
assertArrayEqual("sourceCompetitionsWithStandingCandidates", summary.competitionsWithStandingCandidates, ["nor.1", "nor.2"], checks);

assertEqual("standingCandidateRowCount", standingCandidateRows.length, 32, checks);
assertEqual("qualityGatedRowCount", qualityGatedRows.length, 32, checks);
assertArrayEqual("qualityGatedCompetitions", uniqueSorted(qualityGatedRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("qualityGatedProviderFamilies", uniqueSorted(qualityGatedRows.map((row) => row.providerFamily)), ["norway_ntf"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const rows = rowsForCompetition(qualityGatedRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedLeagueSize }, (_, index) => String(index + 1));
  const teamNames = uniqueSorted(rows.map((row) => row.teamNameCanonical));

  assertEqual(`${competitionSlug}.rowCount`, rows.length, expectation.expectedLeagueSize, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedLeagueSize, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertEqual(`${competitionSlug}.pointsNonIncreasing`, pointsNonIncreasing(rows), true, checks);
  assertAll(`${competitionSlug}.playedMath`, rows, (row) => row.played === row.won + row.drawn + row.lost, checks);
  assertAll(`${competitionSlug}.teamNameCanonicalPresent`, rows, (row) => row.teamNameCanonical.length >= 2, checks);
  assertAll(`${competitionSlug}.teamNameCanonicalNotExactDouble`, rows, (row) => {
    const words = row.teamNameCanonical.split(" ").filter(Boolean);
    if (words.length < 2 || words.length % 2 !== 0) return true;
    const half = words.length / 2;
    return words.slice(0, half).join(" ").toLocaleLowerCase("nb-NO") !== words.slice(half).join(" ").toLocaleLowerCase("nb-NO");
  }, checks);
}

assertAll("qualityGatedRowsHaveCandidateStatus", qualityGatedRows, (row) => row.qualityGateStatus === "quality_gated_standing_candidate_not_truth_asserted", checks);
assertAll("qualityGatedRowsKeepCanonicalWriteBlocked", qualityGatedRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("qualityGatedRowsKeepProductionWriteBlocked", qualityGatedRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("qualityGatedRowsKeepTruthAssertionBlocked", qualityGatedRows, (row) => row.truthAssertionAllowedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 2, checks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);

const blockedQualityGateCheckCount = checks.filter((check) => !check.passed).length;
const passedQualityGateCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-standing-candidate-quality-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    qualityGateOnly: true,
    teamNameNormalizationOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    norwayNtfStandingCandidateQualityGateReadCount: 1,
    sourceParserRunnerStatus: summary.norwayNtfControlledHtmlTableParserRunnerStatus,

    qualityGatedStandingCandidateRowCount: qualityGatedRows.length,
    qualityGatedStandingCandidateCompetitionCount: uniqueSorted(qualityGatedRows.map((row) => row.competitionSlug)).length,
    qualityGatedStandingCandidateRowsByCompetition: countBy(qualityGatedRows, "competitionSlug"),
    qualityGatedStandingCandidateRowsByParserStrategy: countBy(qualityGatedRows, "parserStrategy"),
    qualityGatedStandingCandidateCompetitions: uniqueSorted(qualityGatedRows.map((row) => row.competitionSlug)),

    qualityGateCheckCount: checks.length,
    passedQualityGateCheckCount,
    blockedQualityGateCheckCount,
    norwayNtfStandingCandidateQualityGateStatus: blockedQualityGateCheckCount === 0 ? "passed" : "blocked",
    norwayNtfStandingCandidateQualityGatePassedCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfCanonicalCandidateProposalCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

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
  qualityGatedStandingCandidateRows: qualityGatedRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfStandingCandidateQualityGateStatus: output.summary.norwayNtfStandingCandidateQualityGateStatus,
  qualityGatedStandingCandidateRowCount: output.summary.qualityGatedStandingCandidateRowCount,
  qualityGatedStandingCandidateCompetitionCount: output.summary.qualityGatedStandingCandidateCompetitionCount,
  qualityGatedStandingCandidateRowsByCompetition: output.summary.qualityGatedStandingCandidateRowsByCompetition,
  sampleQualityGatedStandingCandidates: qualityGatedRows.slice(0, 16).map((row) => ({
    competitionSlug: row.competitionSlug,
    position: row.position,
    teamNameRaw: row.teamNameRaw,
    teamNameCanonical: row.teamNameCanonical,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    points: row.points
  })),
  mayBuildNorwayNtfCanonicalCandidateProposalCount: output.summary.mayBuildNorwayNtfCanonicalCandidateProposalCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedQualityGateCheckCount !== 0) {
  process.exitCode = 1;
}
