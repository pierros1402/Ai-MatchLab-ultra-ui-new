import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowCanonicalWrite = args.has("--allow-canonical-write");
const explicitUserApproval = args.has("--explicit-user-approval-norway-ntf-canonical-candidate");

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-execution-approval-gate-2026-06-15",
  "norway-ntf-canonical-candidate-execution-approval-gate-2026-06-15.json"
);

const canonicalOutputPath = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-standings-candidates",
  "norway-ntf-standings-candidates-2026-06-15.json"
);

const diagnosticOutputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-write-runner-2026-06-15"
);

const diagnosticOutputPath = path.join(
  diagnosticOutputDir,
  "norway-ntf-canonical-candidate-write-runner-2026-06-15.json"
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

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
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

function buildCanonicalStandingCandidateRows(executionApprovedStandingRows) {
  return executionApprovedStandingRows
    .sort((a, b) => {
      if (a.competitionSlug !== b.competitionSlug) return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
      return Number(a.position) - Number(b.position);
    })
    .map((row, index) => ({
      canonicalStandingCandidateRowId: `norway_ntf_canonical_standing_candidate_${String(index + 1).padStart(3, "0")}`,
      sourceNorwayNtfCanonicalStandingCandidateExecutionApprovalGateRowId: row.norwayNtfCanonicalStandingCandidateExecutionApprovalGateRowId,
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
      canonicalCandidateStatus: "canonical_standings_candidate_written_not_production_not_truth_asserted",
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

function buildCanonicalCompetitionRows(executionApprovalRows, canonicalStandingRows) {
  return executionApprovalRows
    .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))
    .map((row, index) => {
      const standingRows = rowsForCompetition(canonicalStandingRows, row.competitionSlug);
      return {
        canonicalCompetitionCandidateRowId: `norway_ntf_canonical_competition_candidate_${String(index + 1).padStart(2, "0")}`,
        sourceNorwayNtfCanonicalCandidateExecutionApprovalGateRowId: row.norwayNtfCanonicalCandidateExecutionApprovalGateRowId,
        competitionSlug: row.competitionSlug,
        providerFamily: row.providerFamily,
        sourceUrl: row.sourceUrl,
        canonicalCandidateKind: row.proposedCanonicalCandidateKind,
        standingRowCount: standingRows.length,
        standingRowsSha256: sha256Json(standingRows),
        canonicalCandidateStatus: "canonical_competition_standings_candidate_written_not_production_not_truth_asserted",
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      };
    });
}

if (!allowExecute) throw new Error("Missing required --allow-execute flag.");
if (!allowCanonicalWrite) throw new Error("Missing required --allow-canonical-write flag.");
if (!explicitUserApproval) throw new Error("Missing required --explicit-user-approval-norway-ntf-canonical-candidate flag.");
if (!fs.existsSync(sourcePath)) throw new Error(`Missing Norway NTF canonical candidate execution approval gate diagnostic: ${sourcePath}`);

fs.mkdirSync(diagnosticOutputDir, { recursive: true });

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const executionApprovalRows = Array.isArray(source.executionApprovalRows) ? source.executionApprovalRows : [];
const executionApprovedStandingRows = Array.isArray(source.executionApprovedStandingRows) ? source.executionApprovedStandingRows : [];

const canonicalStandingCandidateRows = buildCanonicalStandingCandidateRows(executionApprovedStandingRows);
const canonicalCompetitionCandidateRows = buildCanonicalCompetitionRows(executionApprovalRows, canonicalStandingCandidateRows);

const preWriteChecks = [];

assertEqual("sourceExecutionApprovalGateStatus", summary.norwayNtfCanonicalCandidateExecutionApprovalGateStatus, "passed", preWriteChecks);
assertEqual("sourceMayBuildWriteRunnerCount", Number(summary.mayBuildNorwayNtfCanonicalCandidateWriteRunnerCount ?? 0), 1, preWriteChecks);
assertEqual("sourceRequiresExplicitUserApprovalCount", Number(summary.norwayNtfCanonicalCandidateWriteRunnerRequiresExplicitUserApprovalCount ?? 0), 1, preWriteChecks);
assertEqual("sourceExecutionApprovalRowCount", Number(summary.executionApprovalRowCount ?? 0), 2, preWriteChecks);
assertEqual("sourceExecutionApprovedStandingRowCount", Number(summary.executionApprovedStandingRowCount ?? 0), 32, preWriteChecks);
assertArrayEqual("sourceExecutionApprovalCompetitions", summary.executionApprovalCompetitions, ["nor.1", "nor.2"], preWriteChecks);

assertEqual("executionApprovalRowsPresent", executionApprovalRows.length, 2, preWriteChecks);
assertEqual("executionApprovedStandingRowsPresent", executionApprovedStandingRows.length, 32, preWriteChecks);
assertEqual("canonicalCompetitionCandidateRowCount", canonicalCompetitionCandidateRows.length, 2, preWriteChecks);
assertEqual("canonicalStandingCandidateRowCount", canonicalStandingCandidateRows.length, 32, preWriteChecks);
assertArrayEqual("canonicalCompetitionCandidateCompetitions", uniqueSorted(canonicalCompetitionCandidateRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], preWriteChecks);
assertArrayEqual("canonicalStandingCandidateCompetitions", uniqueSorted(canonicalStandingCandidateRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], preWriteChecks);
assertArrayEqual("canonicalProviderFamilies", uniqueSorted(canonicalCompetitionCandidateRows.map((row) => row.providerFamily)), ["norway_ntf"], preWriteChecks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const competitionRow = canonicalCompetitionCandidateRows.find((row) => row.competitionSlug === competitionSlug);
  const standingRows = rowsForCompetition(canonicalStandingCandidateRows, competitionSlug);
  const positions = [...new Set(standingRows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedRowCount }, (_, index) => String(index + 1));
  const teamNames = uniqueSorted(standingRows.map((row) => row.teamName));

  assertEqual(`${competitionSlug}.competitionRowPresent`, Boolean(competitionRow), true, preWriteChecks);
  assertEqual(`${competitionSlug}.sourceUrl`, competitionRow?.sourceUrl, expectation.sourceUrl, preWriteChecks);
  assertEqual(`${competitionSlug}.competitionStandingRowCount`, Number(competitionRow?.standingRowCount ?? 0), expectation.expectedRowCount, preWriteChecks);
  assertEqual(`${competitionSlug}.standingRowCount`, standingRows.length, expectation.expectedRowCount, preWriteChecks);
  assertEqual(`${competitionSlug}.uniqueTeamCount`, teamNames.length, expectation.expectedRowCount, preWriteChecks);
  assertArrayEqual(`${competitionSlug}.positions`, positions, expectedPositions, preWriteChecks);
  assertEqual(`${competitionSlug}.pointsNonIncreasing`, pointsNonIncreasing(standingRows), true, preWriteChecks);
  assertAll(`${competitionSlug}.playedMath`, standingRows, (row) => row.played === row.won + row.drawn + row.lost, preWriteChecks);
  assertEqual(`${competitionSlug}.standingRowsShaPresent`, typeof competitionRow?.standingRowsSha256 === "string" && competitionRow.standingRowsSha256.length === 64, true, preWriteChecks);
}

assertAll("executionApprovalRowsRequiredExplicitApproval", executionApprovalRows, (row) => row.nextRunnerRequiresExplicitUserApproval === true, preWriteChecks);
assertAll("executionApprovalRowsApprovedNextRunner", executionApprovalRows, (row) => row.nextRunnerMayWriteCanonicalCandidate === true, preWriteChecks);
assertAll("canonicalCompetitionCandidatesKeepProductionWriteBlocked", canonicalCompetitionCandidateRows, (row) => row.productionWriteAllowedNow === false, preWriteChecks);
assertAll("canonicalCompetitionCandidatesKeepTruthAssertionBlocked", canonicalCompetitionCandidateRows, (row) => row.truthAssertionAllowedNow === false, preWriteChecks);
assertAll("canonicalStandingCandidatesKeepProductionWriteBlocked", canonicalStandingCandidateRows, (row) => row.productionWriteAllowedNow === false, preWriteChecks);
assertAll("canonicalStandingCandidatesKeepTruthAssertionBlocked", canonicalStandingCandidateRows, (row) => row.truthAssertionAllowedNow === false, preWriteChecks);

assertEqual("allowExecuteFlagPresent", allowExecute, true, preWriteChecks);
assertEqual("allowCanonicalWriteFlagPresent", allowCanonicalWrite, true, preWriteChecks);
assertEqual("explicitUserApprovalFlagPresent", explicitUserApproval, true, preWriteChecks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 0, preWriteChecks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, preWriteChecks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, preWriteChecks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, preWriteChecks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, preWriteChecks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, preWriteChecks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, preWriteChecks);

const blockedPreWriteCheckCount = preWriteChecks.filter((check) => !check.passed).length;

if (blockedPreWriteCheckCount !== 0) {
  writeJson(diagnosticOutputPath, {
    output: diagnosticOutputPath,
    job: "run-football-truth-norway-ntf-canonical-candidate-write-runner-file",
    status: "blocked_before_canonical_candidate_write",
    sourcePaths: { sourcePath },
    preWriteChecks
  });
  console.log(JSON.stringify({
    output: diagnosticOutputPath,
    norwayNtfCanonicalCandidateWriteRunnerStatus: "blocked_before_canonical_candidate_write",
    blockedPreWriteCheckCount
  }, null, 2));
  process.exit(1);
}

const canonicalPayload = {
  output: canonicalOutputPath,
  canonicalCandidateKind: "norway_ntf_standings_candidates",
  generatedAt: new Date().toISOString(),
  sourcePaths: { executionApprovalGatePath: sourcePath },
  policy: {
    canonicalCandidateWrite: true,
    productionWrite: false,
    truthAssertion: false,
    explicitUserApprovalReceived: true,
    approvedScope: {
      competitions: ["nor.1", "nor.2"],
      standingRowCount: 32,
      providerFamily: "norway_ntf"
    }
  },
  summary: {
    canonicalStandingCandidateCompetitionCount: canonicalCompetitionCandidateRows.length,
    canonicalStandingCandidateRowCount: canonicalStandingCandidateRows.length,
    canonicalStandingCandidateRowsByCompetition: countBy(canonicalStandingCandidateRows, "competitionSlug"),
    canonicalStandingCandidateCompetitions: uniqueSorted(canonicalCompetitionCandidateRows.map((row) => row.competitionSlug)),
    providerFamilyCount: uniqueSorted(canonicalCompetitionCandidateRows.map((row) => row.providerFamily)).length,
    providerFamilies: uniqueSorted(canonicalCompetitionCandidateRows.map((row) => row.providerFamily)),
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  canonicalCompetitionCandidateRows,
  canonicalStandingCandidateRows
};

writeJson(canonicalOutputPath, canonicalPayload);

const canonicalOutputSha256 = sha256File(canonicalOutputPath);
const postWriteChecks = [];

assertEqual("canonicalOutputPathExists", fs.existsSync(canonicalOutputPath), true, postWriteChecks);
assertEqual("canonicalOutputSha256Present", typeof canonicalOutputSha256 === "string" && canonicalOutputSha256.length === 64, true, postWriteChecks);

const written = readJson(canonicalOutputPath);
const writtenSummary = written.summary && typeof written.summary === "object" ? written.summary : {};
const writtenRows = Array.isArray(written.canonicalStandingCandidateRows) ? written.canonicalStandingCandidateRows : [];
const writtenCompetitionRows = Array.isArray(written.canonicalCompetitionCandidateRows) ? written.canonicalCompetitionCandidateRows : [];

assertEqual("writtenCompetitionCandidateRowCount", writtenCompetitionRows.length, 2, postWriteChecks);
assertEqual("writtenStandingCandidateRowCount", writtenRows.length, 32, postWriteChecks);
assertArrayEqual("writtenCompetitions", writtenSummary.canonicalStandingCandidateCompetitions, ["nor.1", "nor.2"], postWriteChecks);
assertEqual("writtenProductionWriteExecutedNowCount", Number(writtenSummary.productionWriteExecutedNowCount ?? 0), 0, postWriteChecks);
assertEqual("writtenTruthAssertionExecutedNowCount", Number(writtenSummary.truthAssertionExecutedNowCount ?? 0), 0, postWriteChecks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const rows = rowsForCompetition(writtenRows, competitionSlug);
  const positions = [...new Set(rows.map((row) => Number(row.position)).filter((value) => Number.isFinite(value)))].sort((a, b) => a - b).map(String);
  const expectedPositions = Array.from({ length: expectation.expectedRowCount }, (_, index) => String(index + 1));

  assertEqual(`written.${competitionSlug}.rowCount`, rows.length, expectation.expectedRowCount, postWriteChecks);
  assertArrayEqual(`written.${competitionSlug}.positions`, positions, expectedPositions, postWriteChecks);
}

const blockedPostWriteCheckCount = postWriteChecks.filter((check) => !check.passed).length;
const passedPreWriteCheckCount = preWriteChecks.filter((check) => check.passed).length;
const passedPostWriteCheckCount = postWriteChecks.filter((check) => check.passed).length;

const status = blockedPostWriteCheckCount === 0 ? "passed" : "blocked_after_canonical_candidate_write_verification";

const diagnostic = {
  output: diagnosticOutputPath,
  job: "run-football-truth-norway-ntf-canonical-candidate-write-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  canonicalOutputPath,
  canonicalOutputSha256,
  policy: {
    canonicalCandidateWriteRunner: true,
    explicitUserApprovalRequiredAndPresent: true,
    canonicalWriteScope: "norway_ntf_standings_candidates_nor_1_nor_2_32_rows",
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    norwayNtfCanonicalCandidateWriteRunnerStatus: status,
    executionApprovalGateReadCount: 1,
    canonicalWriteFileCount: blockedPostWriteCheckCount === 0 ? 1 : 0,
    canonicalOutputSha256,

    canonicalStandingCandidateCompetitionCount: writtenSummary.canonicalStandingCandidateCompetitionCount,
    canonicalStandingCandidateRowCount: writtenSummary.canonicalStandingCandidateRowCount,
    canonicalStandingCandidateRowsByCompetition: writtenSummary.canonicalStandingCandidateRowsByCompetition,
    canonicalStandingCandidateCompetitions: writtenSummary.canonicalStandingCandidateCompetitions,

    preWriteCheckCount: preWriteChecks.length,
    passedPreWriteCheckCount,
    blockedPreWriteCheckCount,
    postWriteCheckCount: postWriteChecks.length,
    passedPostWriteCheckCount,
    blockedPostWriteCheckCount,

    mayBuildNorwayNtfCanonicalCandidateWriteVerificationCount: blockedPostWriteCheckCount === 0 ? 1 : 0,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: blockedPostWriteCheckCount === 0 ? 1 : 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    canonicalWrites: blockedPostWriteCheckCount === 0 ? 1 : 0,
    productionWrite: false,
    truthAssertion: false
  },
  preWriteChecks,
  postWriteChecks
};

writeJson(diagnosticOutputPath, diagnostic);

console.log(JSON.stringify({
  output: diagnostic.output,
  canonicalOutputPath: diagnostic.canonicalOutputPath,
  norwayNtfCanonicalCandidateWriteRunnerStatus: diagnostic.summary.norwayNtfCanonicalCandidateWriteRunnerStatus,
  canonicalWriteFileCount: diagnostic.summary.canonicalWriteFileCount,
  canonicalOutputSha256: diagnostic.summary.canonicalOutputSha256,
  canonicalStandingCandidateCompetitionCount: diagnostic.summary.canonicalStandingCandidateCompetitionCount,
  canonicalStandingCandidateRowCount: diagnostic.summary.canonicalStandingCandidateRowCount,
  canonicalStandingCandidateRowsByCompetition: diagnostic.summary.canonicalStandingCandidateRowsByCompetition,
  mayBuildNorwayNtfCanonicalCandidateWriteVerificationCount: diagnostic.summary.mayBuildNorwayNtfCanonicalCandidateWriteVerificationCount,
  canonicalWriteExecutedNowCount: diagnostic.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: diagnostic.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: diagnostic.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostWriteCheckCount !== 0) {
  process.exitCode = 1;
}
