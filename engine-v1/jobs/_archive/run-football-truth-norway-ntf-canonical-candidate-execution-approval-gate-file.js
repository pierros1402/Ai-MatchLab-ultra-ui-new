import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-approval-gate-2026-06-15",
  "norway-ntf-canonical-candidate-approval-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-canonical-candidate-execution-approval-gate-2026-06-15.json"
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

function buildExecutionApprovalRows(approvedProposalRows, approvedStandingRows) {
  return approvedProposalRows
    .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))
    .map((row, index) => {
      const standingRows = rowsForCompetition(approvedStandingRows, row.competitionSlug);
      return {
        norwayNtfCanonicalCandidateExecutionApprovalGateRowId: `norway_ntf_canonical_candidate_execution_approval_gate_${String(index + 1).padStart(2, "0")}`,
        sourceNorwayNtfCanonicalCandidateApprovalGateRowId: row.norwayNtfCanonicalCandidateApprovalGateRowId,
        competitionSlug: row.competitionSlug,
        providerFamily: row.providerFamily,
        sourceUrl: row.sourceUrl,
        proposedCanonicalCandidateKind: row.proposedCanonicalCandidateKind,
        executionApprovedStandingRowCount: standingRows.length,
        executionApprovedStandingRowsSha256: sha256Json(standingRows),
        executionApprovalStatus: "approved_for_canonical_candidate_write_runner_pending_explicit_user_approval",
        nextRunnerMayWriteCanonicalCandidate: true,
        nextRunnerRequiresExplicitUserApproval: true,
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      };
    });
}

function buildExecutionApprovedStandingRows(approvedStandingRows) {
  return approvedStandingRows
    .sort((a, b) => {
      if (a.competitionSlug !== b.competitionSlug) return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
      return Number(a.position) - Number(b.position);
    })
    .map((row, index) => ({
      norwayNtfCanonicalStandingCandidateExecutionApprovalGateRowId: `norway_ntf_canonical_standing_candidate_execution_approval_gate_${String(index + 1).padStart(3, "0")}`,
      sourceNorwayNtfCanonicalStandingCandidateApprovalGateRowId: row.norwayNtfCanonicalStandingCandidateApprovalGateRowId,
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
      executionApprovalStatus: "approved_canonical_standings_candidate_for_write_runner_not_written",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Norway NTF canonical candidate approval gate diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const approvedProposalRows = Array.isArray(source.approvedProposalRows) ? source.approvedProposalRows : [];
const approvedStandingRows = Array.isArray(source.approvedStandingRows) ? source.approvedStandingRows : [];

const executionApprovalRows = buildExecutionApprovalRows(approvedProposalRows, approvedStandingRows);
const executionApprovedStandingRows = buildExecutionApprovedStandingRows(approvedStandingRows);

const checks = [];

assertEqual("sourceApprovalGateStatus", summary.norwayNtfCanonicalCandidateApprovalGateStatus, "passed", checks);
assertEqual("sourceMayBuildExecutionApprovalGateCount", Number(summary.mayBuildNorwayNtfCanonicalCandidateExecutionApprovalGateCount ?? 0), 1, checks);
assertEqual("sourceApprovedProposalRowCount", Number(summary.approvedProposalRowCount ?? 0), 2, checks);
assertEqual("sourceApprovedStandingRowCount", Number(summary.approvedStandingRowCount ?? 0), 32, checks);
assertArrayEqual("sourceApprovedProposalCompetitions", summary.approvedProposalCompetitions, ["nor.1", "nor.2"], checks);

assertEqual("executionApprovalRowCount", executionApprovalRows.length, 2, checks);
assertEqual("executionApprovedStandingRowCount", executionApprovedStandingRows.length, 32, checks);
assertArrayEqual("executionApprovalCompetitions", uniqueSorted(executionApprovalRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("executionApprovedStandingCompetitions", uniqueSorted(executionApprovedStandingRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("executionApprovalProviderFamilies", uniqueSorted(executionApprovalRows.map((row) => row.providerFamily)), ["norway_ntf"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const approvalRow = executionApprovalRows.find((row) => row.competitionSlug === competitionSlug);
  const standingRows = rowsForCompetition(executionApprovedStandingRows, competitionSlug);
  const positions = [...new Set(standingRows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedRowCount }, (_, index) => String(index + 1));
  const teamNames = uniqueSorted(standingRows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.executionApprovalRowPresent`, Boolean(approvalRow), true, checks);
  assertEqual(`${competitionSlug}.sourceUrl`, approvalRow?.sourceUrl, expectation.sourceUrl, checks);
  assertEqual(`${competitionSlug}.executionApprovedStandingRowCount`, Number(approvalRow?.executionApprovedStandingRowCount ?? 0), expectation.expectedRowCount, checks);
  assertEqual(`${competitionSlug}.standingRowCount`, standingRows.length, expectation.expectedRowCount, checks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedRowCount, checks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, checks);
  assertEqual(`${competitionSlug}.pointsNonIncreasing`, pointsNonIncreasing(standingRows), true, checks);
  assertAll(`${competitionSlug}.playedMath`, standingRows, (row) => row.played === row.won + row.drawn + row.lost, checks);
  assertEqual(`${competitionSlug}.executionApprovedStandingRowsShaPresent`, typeof approvalRow?.executionApprovedStandingRowsSha256 === "string" && approvalRow.executionApprovedStandingRowsSha256.length === 64, true, checks);
}

assertAll("executionApprovalRowsHaveStatus", executionApprovalRows, (row) => row.executionApprovalStatus === "approved_for_canonical_candidate_write_runner_pending_explicit_user_approval", checks);
assertAll("executionApprovedStandingRowsHaveStatus", executionApprovedStandingRows, (row) => row.executionApprovalStatus === "approved_canonical_standings_candidate_for_write_runner_not_written", checks);
assertAll("executionApprovalRowsAllowNextRunnerOnly", executionApprovalRows, (row) => row.nextRunnerMayWriteCanonicalCandidate === true && row.nextRunnerRequiresExplicitUserApproval === true, checks);
assertAll("executionApprovalRowsKeepCanonicalWriteBlockedNow", executionApprovalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("executionApprovalRowsKeepProductionWriteBlocked", executionApprovalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("executionApprovalRowsKeepTruthAssertionBlocked", executionApprovalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("executionApprovedStandingRowsKeepCanonicalWriteBlockedNow", executionApprovedStandingRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("executionApprovedStandingRowsKeepProductionWriteBlocked", executionApprovedStandingRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("executionApprovedStandingRowsKeepTruthAssertionBlocked", executionApprovedStandingRows, (row) => row.truthAssertionAllowedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);

const blockedExecutionApprovalGateCheckCount = checks.filter((check) => !check.passed).length;
const passedExecutionApprovalGateCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-canonical-candidate-execution-approval-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    executionApprovalGateOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    nextRunnerRequiresExplicitUserApprovalBeforeCanonicalWrite: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    norwayNtfCanonicalCandidateExecutionApprovalGateReadCount: 1,
    sourceApprovalGateStatus: summary.norwayNtfCanonicalCandidateApprovalGateStatus,

    executionApprovalRowCount: executionApprovalRows.length,
    executionApprovedStandingRowCount: executionApprovedStandingRows.length,
    executionApprovalCompetitionCount: uniqueSorted(executionApprovalRows.map((row) => row.competitionSlug)).length,
    executionApprovedStandingCompetitionCount: uniqueSorted(executionApprovedStandingRows.map((row) => row.competitionSlug)).length,
    executionApprovedStandingRowsByCompetition: countBy(executionApprovedStandingRows, "competitionSlug"),
    executionApprovalRowsByStatus: countBy(executionApprovalRows, "executionApprovalStatus"),
    executionApprovedStandingRowsByStatus: countBy(executionApprovedStandingRows, "executionApprovalStatus"),
    executionApprovalCompetitions: uniqueSorted(executionApprovalRows.map((row) => row.competitionSlug)),

    executionApprovalGateCheckCount: checks.length,
    passedExecutionApprovalGateCheckCount,
    blockedExecutionApprovalGateCheckCount,
    norwayNtfCanonicalCandidateExecutionApprovalGateStatus: blockedExecutionApprovalGateCheckCount === 0 ? "passed" : "blocked",
    norwayNtfCanonicalCandidateExecutionApprovalGatePassedCount: blockedExecutionApprovalGateCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfCanonicalCandidateWriteRunnerCount: blockedExecutionApprovalGateCheckCount === 0 ? 1 : 0,
    norwayNtfCanonicalCandidateWriteRunnerRequiresExplicitUserApprovalCount: blockedExecutionApprovalGateCheckCount === 0 ? 1 : 0,

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

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfCanonicalCandidateExecutionApprovalGateStatus: output.summary.norwayNtfCanonicalCandidateExecutionApprovalGateStatus,
  executionApprovalRowCount: output.summary.executionApprovalRowCount,
  executionApprovedStandingRowCount: output.summary.executionApprovedStandingRowCount,
  executionApprovalCompetitions: output.summary.executionApprovalCompetitions,
  executionApprovedStandingRowsByCompetition: output.summary.executionApprovedStandingRowsByCompetition,
  executionApprovalRowsByStatus: output.summary.executionApprovalRowsByStatus,
  sampleExecutionApprovedStandingRows: executionApprovedStandingRows.slice(0, 16).map((row) => ({
    competitionSlug: row.competitionSlug,
    position: row.position,
    teamName: row.teamName,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    points: row.points,
    executionApprovalStatus: row.executionApprovalStatus
  })),
  mayBuildNorwayNtfCanonicalCandidateWriteRunnerCount: output.summary.mayBuildNorwayNtfCanonicalCandidateWriteRunnerCount,
  norwayNtfCanonicalCandidateWriteRunnerRequiresExplicitUserApprovalCount: output.summary.norwayNtfCanonicalCandidateWriteRunnerRequiresExplicitUserApprovalCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedExecutionApprovalGateCheckCount !== 0) {
  process.exitCode = 1;
}
