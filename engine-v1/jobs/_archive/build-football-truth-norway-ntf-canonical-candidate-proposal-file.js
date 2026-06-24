import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-standing-candidate-quality-gate-2026-06-15",
  "norway-ntf-standing-candidate-quality-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-proposal-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-canonical-candidate-proposal-2026-06-15.json"
);

const expected = {
  "nor.1": {
    providerFamily: "norway_ntf",
    expectedRowCount: 16,
    sourceUrl: "https://www.eliteserien.no/tabell",
    proposedCanonicalCandidateKind: "standings_table_candidate"
  },
  "nor.2": {
    providerFamily: "norway_ntf",
    expectedRowCount: 16,
    sourceUrl: "https://www.obos-ligaen.no/tabell",
    proposedCanonicalCandidateKind: "standings_table_candidate"
  }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function pointsNonIncreasing(rows) {
  const ordered = [...rows].sort((a, b) => Number(a.position) - Number(b.position));
  for (let index = 1; index < ordered.length; index += 1) {
    if (Number(ordered[index].points) > Number(ordered[index - 1].points)) return false;
  }
  return true;
}

function buildCanonicalStandingRows(rows) {
  return rows
    .sort((a, b) => {
      if (a.competitionSlug !== b.competitionSlug) return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
      return Number(a.position) - Number(b.position);
    })
    .map((row, index) => ({
      norwayNtfCanonicalStandingCandidateProposalRowId: `norway_ntf_canonical_standing_candidate_proposal_row_${String(index + 1).padStart(3, "0")}`,
      sourceNorwayNtfStandingCandidateQualityGateRowId: row.norwayNtfStandingCandidateQualityGateRowId,
      sourceNorwayNtfStandingCandidateRowId: row.sourceNorwayNtfStandingCandidateRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      sourceUrl: expected[row.competitionSlug]?.sourceUrl ?? null,
      teamName: row.teamNameCanonical,
      position: Number(row.position),
      played: Number(row.played),
      won: Number(row.won),
      drawn: Number(row.drawn),
      lost: Number(row.lost),
      goalsFor: row.goalsFor === null ? null : Number(row.goalsFor),
      goalsAgainst: row.goalsAgainst === null ? null : Number(row.goalsAgainst),
      goalDifference: row.goalDifference === null ? null : Number(row.goalDifference),
      points: Number(row.points),
      parserStrategy: row.parserStrategy,
      proposalStatus: "canonical_standings_candidate_proposed_not_written",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

function buildProposalRows(canonicalStandingRows) {
  return Object.entries(expected).map(([competitionSlug, expectation], index) => {
    const rows = rowsForCompetition(canonicalStandingRows, competitionSlug);

    return {
      norwayNtfCanonicalCandidateProposalRowId: `norway_ntf_canonical_candidate_proposal_${String(index + 1).padStart(2, "0")}`,
      competitionSlug,
      providerFamily: expectation.providerFamily,
      sourceUrl: expectation.sourceUrl,
      proposedCanonicalCandidateKind: expectation.proposedCanonicalCandidateKind,
      proposedStandingRowCount: rows.length,
      proposedStandingRowIds: rows.map((row) => row.norwayNtfCanonicalStandingCandidateProposalRowId),
      proposedStandingRowsSha256: sha256Json(rows),
      proposalStatus: rows.length === expectation.expectedRowCount
        ? "ready_for_canonical_candidate_quality_gate"
        : "blocked_incomplete_row_count",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    };
  });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Norway NTF standing candidate quality gate diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const qualityGatedStandingCandidateRows = Array.isArray(source.qualityGatedStandingCandidateRows) ? source.qualityGatedStandingCandidateRows : [];
const canonicalStandingCandidateProposalRows = buildCanonicalStandingRows(qualityGatedStandingCandidateRows);
const proposalRows = buildProposalRows(canonicalStandingCandidateProposalRows);

const checks = [];

assertEqual("sourceQualityGateStatus", summary.norwayNtfStandingCandidateQualityGateStatus, "passed", checks);
assertEqual("sourceMayBuildCanonicalCandidateProposalCount", Number(summary.mayBuildNorwayNtfCanonicalCandidateProposalCount ?? 0), 1, checks);
assertEqual("sourceQualityGatedStandingCandidateRowCount", Number(summary.qualityGatedStandingCandidateRowCount ?? 0), 32, checks);
assertEqual("sourceQualityGatedStandingCandidateCompetitionCount", Number(summary.qualityGatedStandingCandidateCompetitionCount ?? 0), 2, checks);

assertEqual("qualityGatedStandingCandidateRowsPresent", qualityGatedStandingCandidateRows.length, 32, checks);
assertEqual("canonicalStandingCandidateProposalRowCount", canonicalStandingCandidateProposalRows.length, 32, checks);
assertEqual("canonicalCandidateProposalRowCount", proposalRows.length, 2, checks);
assertArrayEqual("proposalCompetitions", uniqueSorted(proposalRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("proposalProviderFamilies", uniqueSorted(proposalRows.map((row) => row.providerFamily)), ["norway_ntf"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const rows = rowsForCompetition(canonicalStandingCandidateProposalRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedRowCount }, (_, index) => String(index + 1));
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));
  const proposalRow = proposalRows.find((row) => row.competitionSlug === competitionSlug);

  assertEqual(`${competitionSlug}.proposalRowPresent`, Boolean(proposalRow), true, checks);
  assertEqual(`${competitionSlug}.standingRowCount`, rows.length, expectation.expectedRowCount, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedRowCount, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertEqual(`${competitionSlug}.pointsNonIncreasing`, pointsNonIncreasing(rows), true, checks);
  assertAll(`${competitionSlug}.playedMath`, rows, (row) => row.played === row.won + row.drawn + row.lost, checks);
  assertEqual(`${competitionSlug}.proposalStatus`, proposalRow?.proposalStatus, "ready_for_canonical_candidate_quality_gate", checks);
  assertEqual(`${competitionSlug}.proposalSourceUrl`, proposalRow?.sourceUrl, expectation.sourceUrl, checks);
}

assertAll("canonicalStandingCandidateRowsHaveProposalStatus", canonicalStandingCandidateProposalRows, (row) => row.proposalStatus === "canonical_standings_candidate_proposed_not_written", checks);
assertAll("canonicalStandingCandidateRowsKeepCanonicalWriteBlocked", canonicalStandingCandidateProposalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("canonicalStandingCandidateRowsKeepProductionWriteBlocked", canonicalStandingCandidateProposalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("canonicalStandingCandidateRowsKeepTruthAssertionBlocked", canonicalStandingCandidateProposalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("proposalRowsKeepCanonicalWriteBlocked", proposalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("proposalRowsKeepProductionWriteBlocked", proposalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("proposalRowsKeepTruthAssertionBlocked", proposalRows, (row) => row.truthAssertionAllowedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);

const blockedProposalCheckCount = checks.filter((check) => !check.passed).length;
const passedProposalCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-norway-ntf-canonical-candidate-proposal-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    proposalOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    norwayNtfCanonicalCandidateProposalReadCount: 1,
    sourceQualityGateStatus: summary.norwayNtfStandingCandidateQualityGateStatus,

    canonicalCandidateProposalRowCount: proposalRows.length,
    canonicalStandingCandidateProposalRowCount: canonicalStandingCandidateProposalRows.length,
    canonicalCandidateProposalCompetitionCount: uniqueSorted(proposalRows.map((row) => row.competitionSlug)).length,
    canonicalCandidateProposalProviderFamilyCount: uniqueSorted(proposalRows.map((row) => row.providerFamily)).length,
    canonicalCandidateProposalRowsByStatus: countBy(proposalRows, "proposalStatus"),
    canonicalStandingCandidateProposalRowsByCompetition: countBy(canonicalStandingCandidateProposalRows, "competitionSlug"),
    canonicalCandidateProposalCompetitions: uniqueSorted(proposalRows.map((row) => row.competitionSlug)),

    proposalCheckCount: checks.length,
    passedProposalCheckCount,
    blockedProposalCheckCount,
    norwayNtfCanonicalCandidateProposalStatus: blockedProposalCheckCount === 0 ? "passed" : "blocked",
    norwayNtfCanonicalCandidateProposalPassedCount: blockedProposalCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfCanonicalCandidateProposalQualityGateCount: blockedProposalCheckCount === 0 ? 1 : 0,

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
  canonicalStandingCandidateProposalRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfCanonicalCandidateProposalStatus: output.summary.norwayNtfCanonicalCandidateProposalStatus,
  canonicalCandidateProposalRowCount: output.summary.canonicalCandidateProposalRowCount,
  canonicalStandingCandidateProposalRowCount: output.summary.canonicalStandingCandidateProposalRowCount,
  canonicalCandidateProposalCompetitions: output.summary.canonicalCandidateProposalCompetitions,
  canonicalStandingCandidateProposalRowsByCompetition: output.summary.canonicalStandingCandidateProposalRowsByCompetition,
  canonicalCandidateProposalRowsByStatus: output.summary.canonicalCandidateProposalRowsByStatus,
  sampleCanonicalStandingCandidateProposalRows: canonicalStandingCandidateProposalRows.slice(0, 16).map((row) => ({
    competitionSlug: row.competitionSlug,
    position: row.position,
    teamName: row.teamName,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    points: row.points,
    proposalStatus: row.proposalStatus
  })),
  mayBuildNorwayNtfCanonicalCandidateProposalQualityGateCount: output.summary.mayBuildNorwayNtfCanonicalCandidateProposalQualityGateCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedProposalCheckCount !== 0) {
  process.exitCode = 1;
}
