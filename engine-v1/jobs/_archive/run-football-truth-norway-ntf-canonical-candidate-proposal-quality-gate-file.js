import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-proposal-2026-06-15",
  "norway-ntf-canonical-candidate-proposal-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-proposal-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-canonical-candidate-proposal-quality-gate-2026-06-15.json"
);

const expected = {
  "nor.1": {
    expectedRowCount: 16,
    sourceUrl: "https://www.eliteserien.no/tabell"
  },
  "nor.2": {
    expectedRowCount: 16,
    sourceUrl: "https://www.obos-ligaen.no/tabell"
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

function buildQualityGatedProposalRows(proposalRows, standingRows) {
  return proposalRows
    .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))
    .map((proposalRow, index) => {
      const rows = rowsForCompetition(standingRows, proposalRow.competitionSlug);
      return {
        norwayNtfCanonicalCandidateProposalQualityGateRowId: `norway_ntf_canonical_candidate_proposal_quality_gate_${String(index + 1).padStart(2, "0")}`,
        sourceNorwayNtfCanonicalCandidateProposalRowId: proposalRow.norwayNtfCanonicalCandidateProposalRowId,
        competitionSlug: proposalRow.competitionSlug,
        providerFamily: proposalRow.providerFamily,
        sourceUrl: proposalRow.sourceUrl,
        proposedCanonicalCandidateKind: proposalRow.proposedCanonicalCandidateKind,
        proposedStandingRowCount: proposalRow.proposedStandingRowCount,
        representedStandingRowCount: rows.length,
        representedStandingRowsSha256: sha256Json(rows),
        sourceProposedStandingRowsSha256: proposalRow.proposedStandingRowsSha256,
        qualityGateStatus: "quality_gated_ready_for_canonical_candidate_approval_gate",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      };
    });
}

function buildQualityGatedStandingRows(standingRows) {
  return standingRows
    .sort((a, b) => {
      if (a.competitionSlug !== b.competitionSlug) return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
      return Number(a.position) - Number(b.position);
    })
    .map((row, index) => ({
      norwayNtfCanonicalStandingCandidateQualityGateRowId: `norway_ntf_canonical_standing_candidate_quality_gate_${String(index + 1).padStart(3, "0")}`,
      sourceNorwayNtfCanonicalStandingCandidateProposalRowId: row.norwayNtfCanonicalStandingCandidateProposalRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      sourceUrl: row.sourceUrl,
      teamName: row.teamName,
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
      qualityGateStatus: "quality_gated_canonical_standings_candidate_not_written",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Norway NTF canonical candidate proposal diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const proposalRows = Array.isArray(source.proposalRows) ? source.proposalRows : [];
const canonicalStandingCandidateProposalRows = Array.isArray(source.canonicalStandingCandidateProposalRows) ? source.canonicalStandingCandidateProposalRows : [];

const qualityGatedStandingRows = buildQualityGatedStandingRows(canonicalStandingCandidateProposalRows);
const qualityGatedProposalRows = buildQualityGatedProposalRows(proposalRows, qualityGatedStandingRows);

const checks = [];

assertEqual("sourceProposalStatus", summary.norwayNtfCanonicalCandidateProposalStatus, "passed", checks);
assertEqual("sourceMayBuildProposalQualityGateCount", Number(summary.mayBuildNorwayNtfCanonicalCandidateProposalQualityGateCount ?? 0), 1, checks);
assertEqual("sourceCanonicalCandidateProposalRowCount", Number(summary.canonicalCandidateProposalRowCount ?? 0), 2, checks);
assertEqual("sourceCanonicalStandingCandidateProposalRowCount", Number(summary.canonicalStandingCandidateProposalRowCount ?? 0), 32, checks);
assertArrayEqual("sourceCanonicalCandidateProposalCompetitions", summary.canonicalCandidateProposalCompetitions, ["nor.1", "nor.2"], checks);

assertEqual("proposalRowsPresent", proposalRows.length, 2, checks);
assertEqual("standingRowsPresent", canonicalStandingCandidateProposalRows.length, 32, checks);
assertEqual("qualityGatedProposalRowCount", qualityGatedProposalRows.length, 2, checks);
assertEqual("qualityGatedStandingRowCount", qualityGatedStandingRows.length, 32, checks);
assertArrayEqual("qualityGatedProposalCompetitions", uniqueSorted(qualityGatedProposalRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("qualityGatedStandingCompetitions", uniqueSorted(qualityGatedStandingRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("qualityGatedProviderFamilies", uniqueSorted(qualityGatedProposalRows.map((row) => row.providerFamily)), ["norway_ntf"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const proposalRow = qualityGatedProposalRows.find((row) => row.competitionSlug === competitionSlug);
  const standingRows = rowsForCompetition(qualityGatedStandingRows, competitionSlug);
  const positions = [...new Set(standingRows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedRowCount }, (_, index) => String(index + 1));
  const teamNames = uniqueSorted(standingRows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.proposalRowPresent`, Boolean(proposalRow), true, checks);
  assertEqual(`${competitionSlug}.sourceUrl`, proposalRow?.sourceUrl, expectation.sourceUrl, checks);
  assertEqual(`${competitionSlug}.proposalRowCount`, Number(proposalRow?.proposedStandingRowCount ?? 0), expectation.expectedRowCount, checks);
  assertEqual(`${competitionSlug}.representedStandingRowCount`, Number(proposalRow?.representedStandingRowCount ?? 0), expectation.expectedRowCount, checks);
  assertEqual(`${competitionSlug}.standingRowCount`, standingRows.length, expectation.expectedRowCount, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedRowCount, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertEqual(`${competitionSlug}.pointsNonIncreasing`, pointsNonIncreasing(standingRows), true, checks);
  assertAll(`${competitionSlug}.playedMath`, standingRows, (row) => row.played === row.won + row.drawn + row.lost, checks);
  assertAll(`${competitionSlug}.teamNamesPresent`, standingRows, (row) => String(row.teamName ?? "").trim().length >= 2, checks);
  assertEqual(`${competitionSlug}.qualityGateStatus`, proposalRow?.qualityGateStatus, "quality_gated_ready_for_canonical_candidate_approval_gate", checks);
}

assertAll("qualityGatedProposalRowsKeepCanonicalWriteBlocked", qualityGatedProposalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("qualityGatedProposalRowsKeepProductionWriteBlocked", qualityGatedProposalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("qualityGatedProposalRowsKeepTruthAssertionBlocked", qualityGatedProposalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("qualityGatedStandingRowsKeepCanonicalWriteBlocked", qualityGatedStandingRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("qualityGatedStandingRowsKeepProductionWriteBlocked", qualityGatedStandingRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("qualityGatedStandingRowsKeepTruthAssertionBlocked", qualityGatedStandingRows, (row) => row.truthAssertionAllowedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 0, checks);
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
  job: "run-football-truth-norway-ntf-canonical-candidate-proposal-quality-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    qualityGateOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    norwayNtfCanonicalCandidateProposalQualityGateReadCount: 1,
    sourceProposalStatus: summary.norwayNtfCanonicalCandidateProposalStatus,

    qualityGatedProposalRowCount: qualityGatedProposalRows.length,
    qualityGatedStandingRowCount: qualityGatedStandingRows.length,
    qualityGatedProposalCompetitionCount: uniqueSorted(qualityGatedProposalRows.map((row) => row.competitionSlug)).length,
    qualityGatedStandingCompetitionCount: uniqueSorted(qualityGatedStandingRows.map((row) => row.competitionSlug)).length,
    qualityGatedStandingRowsByCompetition: countBy(qualityGatedStandingRows, "competitionSlug"),
    qualityGatedProposalRowsByStatus: countBy(qualityGatedProposalRows, "qualityGateStatus"),
    qualityGatedStandingRowsByStatus: countBy(qualityGatedStandingRows, "qualityGateStatus"),
    qualityGatedProposalCompetitions: uniqueSorted(qualityGatedProposalRows.map((row) => row.competitionSlug)),

    qualityGateCheckCount: checks.length,
    passedQualityGateCheckCount,
    blockedQualityGateCheckCount,
    norwayNtfCanonicalCandidateProposalQualityGateStatus: blockedQualityGateCheckCount === 0 ? "passed" : "blocked",
    norwayNtfCanonicalCandidateProposalQualityGatePassedCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfCanonicalCandidateApprovalGateCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

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
  qualityGatedStandingRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfCanonicalCandidateProposalQualityGateStatus: output.summary.norwayNtfCanonicalCandidateProposalQualityGateStatus,
  qualityGatedProposalRowCount: output.summary.qualityGatedProposalRowCount,
  qualityGatedStandingRowCount: output.summary.qualityGatedStandingRowCount,
  qualityGatedProposalCompetitions: output.summary.qualityGatedProposalCompetitions,
  qualityGatedStandingRowsByCompetition: output.summary.qualityGatedStandingRowsByCompetition,
  qualityGatedProposalRowsByStatus: output.summary.qualityGatedProposalRowsByStatus,
  sampleQualityGatedStandingRows: qualityGatedStandingRows.slice(0, 16).map((row) => ({
    competitionSlug: row.competitionSlug,
    position: row.position,
    teamName: row.teamName,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    points: row.points,
    qualityGateStatus: row.qualityGateStatus
  })),
  mayBuildNorwayNtfCanonicalCandidateApprovalGateCount: output.summary.mayBuildNorwayNtfCanonicalCandidateApprovalGateCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedQualityGateCheckCount !== 0) {
  process.exitCode = 1;
}
