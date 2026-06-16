import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-proposal-quality-gate-2026-06-15",
  "norway-ntf-canonical-candidate-proposal-quality-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-canonical-candidate-approval-gate-2026-06-15.json"
);

const expected = {
  "nor.1": { expectedRowCount: 16, sourceUrl: "https://www.eliteserien.no/tabell" },
  "nor.2": { expectedRowCount: 16, sourceUrl: "https://www.obos-ligaen.no/tabell" }
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

function buildApprovedProposalRows(rows) {
  return rows
    .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))
    .map((row, index) => ({
      norwayNtfCanonicalCandidateApprovalGateRowId: `norway_ntf_canonical_candidate_approval_gate_${String(index + 1).padStart(2, "0")}`,
      sourceNorwayNtfCanonicalCandidateProposalQualityGateRowId: row.norwayNtfCanonicalCandidateProposalQualityGateRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      sourceUrl: row.sourceUrl,
      proposedCanonicalCandidateKind: row.proposedCanonicalCandidateKind,
      approvedStandingRowCount: Number(row.representedStandingRowCount),
      approvedStandingRowsSha256: row.representedStandingRowsSha256,
      approvalStatus: "approved_for_canonical_candidate_execution_approval_gate",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

function buildApprovedStandingRows(rows) {
  return rows
    .sort((a, b) => {
      if (a.competitionSlug !== b.competitionSlug) return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
      return Number(a.position) - Number(b.position);
    })
    .map((row, index) => ({
      norwayNtfCanonicalStandingCandidateApprovalGateRowId: `norway_ntf_canonical_standing_candidate_approval_gate_${String(index + 1).padStart(3, "0")}`,
      sourceNorwayNtfCanonicalStandingCandidateQualityGateRowId: row.norwayNtfCanonicalStandingCandidateQualityGateRowId,
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
      approvalStatus: "approved_canonical_standings_candidate_not_written",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Norway NTF canonical candidate proposal quality gate diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const qualityGatedProposalRows = Array.isArray(source.qualityGatedProposalRows) ? source.qualityGatedProposalRows : [];
const qualityGatedStandingRows = Array.isArray(source.qualityGatedStandingRows) ? source.qualityGatedStandingRows : [];

const approvedProposalRows = buildApprovedProposalRows(qualityGatedProposalRows);
const approvedStandingRows = buildApprovedStandingRows(qualityGatedStandingRows);

const checks = [];

assertEqual("sourceQualityGateStatus", summary.norwayNtfCanonicalCandidateProposalQualityGateStatus, "passed", checks);
assertEqual("sourceMayBuildApprovalGateCount", Number(summary.mayBuildNorwayNtfCanonicalCandidateApprovalGateCount ?? 0), 1, checks);
assertEqual("sourceQualityGatedProposalRowCount", Number(summary.qualityGatedProposalRowCount ?? 0), 2, checks);
assertEqual("sourceQualityGatedStandingRowCount", Number(summary.qualityGatedStandingRowCount ?? 0), 32, checks);
assertArrayEqual("sourceQualityGatedProposalCompetitions", summary.qualityGatedProposalCompetitions, ["nor.1", "nor.2"], checks);

assertEqual("approvedProposalRowCount", approvedProposalRows.length, 2, checks);
assertEqual("approvedStandingRowCount", approvedStandingRows.length, 32, checks);
assertArrayEqual("approvedProposalCompetitions", uniqueSorted(approvedProposalRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("approvedStandingCompetitions", uniqueSorted(approvedStandingRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("approvedProviderFamilies", uniqueSorted(approvedProposalRows.map((row) => row.providerFamily)), ["norway_ntf"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const proposalRow = approvedProposalRows.find((row) => row.competitionSlug === competitionSlug);
  const rows = rowsForCompetition(approvedStandingRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedRowCount }, (_, index) => String(index + 1));
  const teamNames = uniqueSorted(rows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.proposalRowPresent`, Boolean(proposalRow), true, checks);
  assertEqual(`${competitionSlug}.sourceUrl`, proposalRow?.sourceUrl, expectation.sourceUrl, checks);
  assertEqual(`${competitionSlug}.approvedStandingRowCount`, Number(proposalRow?.approvedStandingRowCount ?? 0), expectation.expectedRowCount, checks);
  assertEqual(`${competitionSlug}.standingRowCount`, rows.length, expectation.expectedRowCount, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedRowCount, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertEqual(`${competitionSlug}.pointsNonIncreasing`, pointsNonIncreasing(rows), true, checks);
  assertAll(`${competitionSlug}.playedMath`, rows, (row) => row.played === row.won + row.drawn + row.lost, checks);
  assertEqual(`${competitionSlug}.approvedStandingRowsShaPresent`, typeof proposalRow?.approvedStandingRowsSha256 === "string" && proposalRow.approvedStandingRowsSha256.length === 64, true, checks);
}

assertAll("approvedProposalRowsHaveApprovalStatus", approvedProposalRows, (row) => row.approvalStatus === "approved_for_canonical_candidate_execution_approval_gate", checks);
assertAll("approvedStandingRowsHaveApprovalStatus", approvedStandingRows, (row) => row.approvalStatus === "approved_canonical_standings_candidate_not_written", checks);
assertAll("approvedProposalRowsKeepCanonicalWriteBlocked", approvedProposalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("approvedProposalRowsKeepProductionWriteBlocked", approvedProposalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("approvedProposalRowsKeepTruthAssertionBlocked", approvedProposalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("approvedStandingRowsKeepCanonicalWriteBlocked", approvedStandingRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("approvedStandingRowsKeepProductionWriteBlocked", approvedStandingRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("approvedStandingRowsKeepTruthAssertionBlocked", approvedStandingRows, (row) => row.truthAssertionAllowedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);

const blockedApprovalGateCheckCount = checks.filter((check) => !check.passed).length;
const passedApprovalGateCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-canonical-candidate-approval-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    approvalGateOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    norwayNtfCanonicalCandidateApprovalGateReadCount: 1,
    sourceQualityGateStatus: summary.norwayNtfCanonicalCandidateProposalQualityGateStatus,

    approvedProposalRowCount: approvedProposalRows.length,
    approvedStandingRowCount: approvedStandingRows.length,
    approvedProposalCompetitionCount: uniqueSorted(approvedProposalRows.map((row) => row.competitionSlug)).length,
    approvedStandingCompetitionCount: uniqueSorted(approvedStandingRows.map((row) => row.competitionSlug)).length,
    approvedStandingRowsByCompetition: countBy(approvedStandingRows, "competitionSlug"),
    approvedProposalRowsByStatus: countBy(approvedProposalRows, "approvalStatus"),
    approvedStandingRowsByStatus: countBy(approvedStandingRows, "approvalStatus"),
    approvedProposalCompetitions: uniqueSorted(approvedProposalRows.map((row) => row.competitionSlug)),

    approvalGateCheckCount: checks.length,
    passedApprovalGateCheckCount,
    blockedApprovalGateCheckCount,
    norwayNtfCanonicalCandidateApprovalGateStatus: blockedApprovalGateCheckCount === 0 ? "passed" : "blocked",
    norwayNtfCanonicalCandidateApprovalGatePassedCount: blockedApprovalGateCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfCanonicalCandidateExecutionApprovalGateCount: blockedApprovalGateCheckCount === 0 ? 1 : 0,

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
  approvedProposalRows,
  approvedStandingRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfCanonicalCandidateApprovalGateStatus: output.summary.norwayNtfCanonicalCandidateApprovalGateStatus,
  approvedProposalRowCount: output.summary.approvedProposalRowCount,
  approvedStandingRowCount: output.summary.approvedStandingRowCount,
  approvedProposalCompetitions: output.summary.approvedProposalCompetitions,
  approvedStandingRowsByCompetition: output.summary.approvedStandingRowsByCompetition,
  approvedProposalRowsByStatus: output.summary.approvedProposalRowsByStatus,
  sampleApprovedStandingRows: approvedStandingRows.slice(0, 16).map((row) => ({
    competitionSlug: row.competitionSlug,
    position: row.position,
    teamName: row.teamName,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    points: row.points,
    approvalStatus: row.approvalStatus
  })),
  mayBuildNorwayNtfCanonicalCandidateExecutionApprovalGateCount: output.summary.mayBuildNorwayNtfCanonicalCandidateExecutionApprovalGateCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedApprovalGateCheckCount !== 0) {
  process.exitCode = 1;
}

