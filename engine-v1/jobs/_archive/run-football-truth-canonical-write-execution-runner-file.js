import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowCanonicalWrite = args.has("--allow-canonical-write");
const approvalTokenArg = process.argv.slice(2).find((arg) => arg.startsWith("--approval-token="));
const approvalToken = approvalTokenArg ? approvalTokenArg.slice("--approval-token=".length) : "";

const sourceExecutionApprovalGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-execution-approval-gate-2026-06-15",
  "canonical-write-execution-approval-gate-2026-06-15.json"
);

const sourceSmokeRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-smoke-runner-2026-06-15",
  "controlled-real-acquisition-smoke-runner-2026-06-15.json"
);

const canonicalOutputDir = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-evidence-pointers"
);

const canonicalOutputPath = path.join(
  canonicalOutputDir,
  "controlled-real-source-evidence-2026-06-15.json"
);

const diagnosticOutputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-execution-runner-2026-06-15"
);

const diagnosticOutputPath = path.join(
  diagnosticOutputDir,
  "canonical-write-execution-runner-2026-06-15.json"
);

const expectedCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];
const expectedProviderFamilies = ["laliga", "norway_ntf", "sportomedia"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath, "utf8"));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function assertEqual(name, actual, expected, checks) {
  const passed = Object.is(actual, expected);
  checks.push({ name, actual, expected, passed });
}

function assertArrayEqual(name, actual, expected, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, actual, expected, passed });
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

function evidencePointerRow(approvalRow, acceptedEvidenceById, index) {
  const acceptedEvidenceRows = approvalRow.sourceAcceptedEvidenceRowIds.map((id) => acceptedEvidenceById.get(id));

  return {
    canonicalEvidencePointerRowId: `canonical_evidence_pointer_${String(index + 1).padStart(2, "0")}`,
    competitionSlug: approvalRow.competitionSlug,
    providerFamilies: approvalRow.providerFamilies,
    sourceCanonicalWriteExecutionApprovalGateRowId: approvalRow.canonicalWriteExecutionApprovalGateRowId,
    sourceAcceptedEvidenceRowIds: approvalRow.sourceAcceptedEvidenceRowIds,
    sourceAcceptedEvidenceRowCount: acceptedEvidenceRows.length,
    approvedEvidenceRowCount: approvalRow.approvedEvidenceRowCount,
    evidenceSha256: approvalRow.evidenceSha256,
    sourceEvidencePointers: acceptedEvidenceRows.map((row) => ({
      sourceAcceptedEvidenceRowId: row.controlledRealAcquisitionAcceptedEvidenceRowId,
      attemptKind: row.attemptKind,
      providerFamily: row.providerFamily,
      url: row.url,
      finalUrl: row.finalUrl,
      statusCode: row.statusCode,
      contentType: row.contentType,
      bodyCharCount: row.bodyCharCount,
      clippedBodyCharCount: row.clippedBodyCharCount,
      bodySha256: row.bodySha256,
      markerHits: Array.isArray(row.markerHits) ? row.markerHits : [],
      evidenceStatus: row.evidenceStatus,
      acceptedEvidenceKind: row.acceptedEvidenceKind,
      standingsOrSeasonStateDeltaCandidate: row.standingsOrSeasonStateDeltaCandidate === true
    })),
    canonicalWriteKind: "canonical_evidence_pointer_write",
    canonicalWriteStatus: "written",
    productionWrite: false,
    truthAssertion: false,
    canonicalTruthValueWritten: false,
    standingsOrSeasonStateDeltaCandidate: true,
    writeScope: "controlled_real_source_evidence_pointer_only"
  };
}

if (!allowExecute) {
  throw new Error("Missing required --allow-execute flag.");
}

if (!allowCanonicalWrite) {
  throw new Error("Missing required --allow-canonical-write flag.");
}

if (approvalToken !== "user-approved-canonical-evidence-pointer-write-2026-06-16") {
  throw new Error("Missing or invalid explicit user approval token for this canonical evidence-pointer write runner.");
}

if (!fs.existsSync(sourceExecutionApprovalGatePath)) {
  throw new Error(`Missing canonical write execution approval gate: ${sourceExecutionApprovalGatePath}`);
}

if (!fs.existsSync(sourceSmokeRunnerPath)) {
  throw new Error(`Missing controlled real acquisition smoke runner diagnostic: ${sourceSmokeRunnerPath}`);
}

fs.mkdirSync(canonicalOutputDir, { recursive: true });
fs.mkdirSync(diagnosticOutputDir, { recursive: true });

const executionApprovalGate = readJson(sourceExecutionApprovalGatePath);
const smokeRunner = readJson(sourceSmokeRunnerPath);

const approvalSummary = executionApprovalGate.summary && typeof executionApprovalGate.summary === "object" ? executionApprovalGate.summary : {};
const approvalRows = Array.isArray(executionApprovalGate.canonicalWriteExecutionApprovalRows)
  ? executionApprovalGate.canonicalWriteExecutionApprovalRows
  : [];

const acceptedEvidenceRows = Array.isArray(smokeRunner.acceptedEvidenceRows) ? smokeRunner.acceptedEvidenceRows : [];
const acceptedEvidenceById = new Map(acceptedEvidenceRows.map((row) => [row.controlledRealAcquisitionAcceptedEvidenceRowId, row]));

const eligibleApprovalRows = approvalRows
  .filter((row) => row.executionApprovalStatus === "approved_for_explicit_user_approved_canonical_write_runner_only")
  .filter((row) => row.nextAllowedAction === "build_canonical_write_execution_runner_after_explicit_user_approval")
  .filter((row) => row.requiresExplicitUserApprovalBeforeWriteRunner === true)
  .filter((row) => row.canonicalWriteRunnerMayBeBuilt === true)
  .filter((row) => row.canonicalWriteRunnerMayBeExecutedWithoutUserApproval === false)
  .filter((row) => row.canonicalWriteExecutionAllowedInThisJob === false)
  .filter((row) => row.canonicalWriteAllowedNow === false)
  .filter((row) => row.productionWriteAllowedNow === false)
  .filter((row) => row.truthAssertionAllowedNow === false)
  .filter((row) => row.canonicalWriteExecutedNow === false)
  .filter((row) => row.productionWriteExecutedNow === false)
  .filter((row) => row.truthAssertionExecutedNow === false);

const missingEvidenceIds = eligibleApprovalRows
  .flatMap((row) => row.sourceAcceptedEvidenceRowIds)
  .filter((id) => !acceptedEvidenceById.has(id));

const canonicalEvidencePointerRows = eligibleApprovalRows.map((row, index) => evidencePointerRow(row, acceptedEvidenceById, index));

const canonicalCompetitions = uniqueSorted(canonicalEvidencePointerRows.map((row) => row.competitionSlug));
const canonicalProviderFamilies = uniqueSorted(canonicalEvidencePointerRows.flatMap((row) => Array.isArray(row.providerFamilies) ? row.providerFamilies : []));
const representedAcceptedEvidenceRowCount = canonicalEvidencePointerRows.reduce((sum, row) => sum + row.sourceAcceptedEvidenceRowCount, 0);

const preWriteChecks = [];

assertEqual("allowExecuteFlagPresent", allowExecute, true, preWriteChecks);
assertEqual("allowCanonicalWriteFlagPresent", allowCanonicalWrite, true, preWriteChecks);
assertEqual("explicitUserApprovalTokenPresent", approvalToken, "user-approved-canonical-evidence-pointer-write-2026-06-16", preWriteChecks);

assertEqual("sourceExecutionApprovalGateStatus", approvalSummary.canonicalWriteExecutionApprovalGateStatus, "passed", preWriteChecks);
assertEqual("sourceExecutionApprovalGatePassedCount", Number(approvalSummary.canonicalWriteExecutionApprovalGatePassedCount ?? 0), 1, preWriteChecks);
assertEqual("sourceMayBuildCanonicalWriteExecutionRunnerCount", Number(approvalSummary.mayBuildCanonicalWriteExecutionRunnerCount ?? 0), 1, preWriteChecks);
assertEqual("sourceRequiresExplicitUserApprovalCount", Number(approvalSummary.canonicalWriteExecutionRunnerRequiresExplicitUserApprovalCount ?? 0), 1, preWriteChecks);

assertEqual("sourceMayExecuteCanonicalWriteNowCountBeforeExplicitRunner", Number(approvalSummary.mayExecuteCanonicalWriteNowCount ?? 0), 0, preWriteChecks);
assertEqual("sourceMayWriteProductionNowCount", Number(approvalSummary.mayWriteProductionNowCount ?? 0), 0, preWriteChecks);
assertEqual("sourceMayAssertTruthNowCount", Number(approvalSummary.mayAssertTruthNowCount ?? 0), 0, preWriteChecks);

assertEqual("approvalRowCount", approvalRows.length, 6, preWriteChecks);
assertEqual("eligibleApprovalRowCount", eligibleApprovalRows.length, 6, preWriteChecks);
assertEqual("acceptedEvidenceRowCount", acceptedEvidenceRows.length, 12, preWriteChecks);
assertEqual("missingEvidenceIdCount", missingEvidenceIds.length, 0, preWriteChecks);
assertEqual("canonicalEvidencePointerRowCount", canonicalEvidencePointerRows.length, 6, preWriteChecks);
assertEqual("representedAcceptedEvidenceRowCount", representedAcceptedEvidenceRowCount, 12, preWriteChecks);

assertArrayEqual("canonicalCompetitions", canonicalCompetitions, expectedCompetitions, preWriteChecks);
assertArrayEqual("canonicalProviderFamilies", canonicalProviderFamilies, expectedProviderFamilies, preWriteChecks);

assertAll("acceptedEvidenceRowsAreAcceptedControlledRealEvidence", acceptedEvidenceRows, (row) => row.evidenceStatus === "accepted_controlled_real_evidence", preWriteChecks);
assertAll("acceptedEvidenceRowsAreStatusCode200", acceptedEvidenceRows, (row) => row.statusCode === 200, preWriteChecks);
assertAll("acceptedEvidenceRowsAreStandingsOrSeasonStateDeltaCandidates", acceptedEvidenceRows, (row) => row.standingsOrSeasonStateDeltaCandidate === true, preWriteChecks);
assertAll("acceptedEvidenceRowsAreCanonicalWriteCandidateOnly", acceptedEvidenceRows, (row) => row.canonicalWriteCandidateOnly === true, preWriteChecks);
assertAll("acceptedEvidenceRowsDidNotExecuteProductionWrite", acceptedEvidenceRows, (row) => row.productionWriteExecutedNow === false, preWriteChecks);
assertAll("acceptedEvidenceRowsDidNotExecuteTruthAssertion", acceptedEvidenceRows, (row) => row.truthAssertionExecutedNow === false, preWriteChecks);

assertAll("canonicalRowsAreEvidencePointerOnly", canonicalEvidencePointerRows, (row) => row.writeScope === "controlled_real_source_evidence_pointer_only", preWriteChecks);
assertAll("canonicalRowsDoNotWriteProduction", canonicalEvidencePointerRows, (row) => row.productionWrite === false, preWriteChecks);
assertAll("canonicalRowsDoNotAssertTruth", canonicalEvidencePointerRows, (row) => row.truthAssertion === false, preWriteChecks);
assertAll("canonicalRowsDoNotWriteCanonicalTruthValue", canonicalEvidencePointerRows, (row) => row.canonicalTruthValueWritten === false, preWriteChecks);

const blockedPreWriteCheckCount = preWriteChecks.filter((check) => !check.passed).length;
if (blockedPreWriteCheckCount !== 0) {
  const failed = preWriteChecks.filter((check) => !check.passed);
  writeJson(diagnosticOutputPath, {
    output: diagnosticOutputPath,
    job: "run-football-truth-canonical-write-execution-runner-file",
    status: "blocked_before_write",
    failedChecks: failed,
    preWriteChecks
  });
  console.log(JSON.stringify({
    output: diagnosticOutputPath,
    canonicalWriteExecutionRunnerStatus: "blocked_before_write",
    blockedPreWriteCheckCount
  }, null, 2));
  process.exitCode = 1;
} else {
  const generatedAt = new Date().toISOString();

  const canonicalOutput = {
    schemaVersion: 1,
    generatedAt,
    canonicalDataset: "football_truth_controlled_real_source_evidence_pointers",
    writeScope: "controlled_real_source_evidence_pointer_only",
    sourcePaths: {
      sourceExecutionApprovalGatePath,
      sourceSmokeRunnerPath
    },
    guarantees: {
      canonicalEvidencePointerWrite: true,
      productionWrite: false,
      truthAssertion: false,
      fetchExecutedNow: false,
      searchExecutedNow: false,
      broadSearchExecutedNow: false,
      classifierExecutedNow: false
    },
    summary: {
      canonicalEvidencePointerCompetitionCount: canonicalCompetitions.length,
      canonicalEvidencePointerProviderFamilyCount: canonicalProviderFamilies.length,
      canonicalEvidencePointerRowCount: canonicalEvidencePointerRows.length,
      representedAcceptedEvidenceRowCount,
      canonicalCompetitions,
      canonicalProviderFamilies,
      byCompetitionSlug: countBy(canonicalEvidencePointerRows, "competitionSlug"),
      canonicalWriteKind: "canonical_evidence_pointer_write",
      canonicalTruthValueWrittenCount: 0,
      productionWriteCount: 0,
      truthAssertionCount: 0
    },
    canonicalEvidencePointerRows
  };

  writeJson(canonicalOutputPath, canonicalOutput);

  const canonicalOutputSha256 = sha256File(canonicalOutputPath);
  const writtenCanonicalOutput = readJson(canonicalOutputPath);

  const postWriteChecks = [];
  assertEqual("canonicalOutputExists", fs.existsSync(canonicalOutputPath), true, postWriteChecks);
  assertEqual("writtenCanonicalEvidencePointerRowCount", writtenCanonicalOutput.canonicalEvidencePointerRows.length, 6, postWriteChecks);
  assertEqual("writtenRepresentedAcceptedEvidenceRowCount", Number(writtenCanonicalOutput.summary.representedAcceptedEvidenceRowCount ?? 0), 12, postWriteChecks);
  assertArrayEqual("writtenCanonicalCompetitions", writtenCanonicalOutput.summary.canonicalCompetitions, expectedCompetitions, postWriteChecks);
  assertArrayEqual("writtenCanonicalProviderFamilies", writtenCanonicalOutput.summary.canonicalProviderFamilies, expectedProviderFamilies, postWriteChecks);
  assertEqual("writtenProductionWriteGuarantee", writtenCanonicalOutput.guarantees.productionWrite, false, postWriteChecks);
  assertEqual("writtenTruthAssertionGuarantee", writtenCanonicalOutput.guarantees.truthAssertion, false, postWriteChecks);
  assertEqual("writtenCanonicalTruthValueWrittenCount", Number(writtenCanonicalOutput.summary.canonicalTruthValueWrittenCount ?? 0), 0, postWriteChecks);
  assertEqual("writtenProductionWriteCount", Number(writtenCanonicalOutput.summary.productionWriteCount ?? 0), 0, postWriteChecks);
  assertEqual("writtenTruthAssertionCount", Number(writtenCanonicalOutput.summary.truthAssertionCount ?? 0), 0, postWriteChecks);

  const blockedPostWriteCheckCount = postWriteChecks.filter((check) => !check.passed).length;
  const passedPreWriteCheckCount = preWriteChecks.filter((check) => check.passed).length;
  const passedPostWriteCheckCount = postWriteChecks.filter((check) => check.passed).length;

  const diagnostic = {
    output: diagnosticOutputPath,
    job: "run-football-truth-canonical-write-execution-runner-file",
    generatedAt,
    sourcePaths: {
      sourceExecutionApprovalGatePath,
      sourceSmokeRunnerPath
    },
    canonicalOutputPath,
    canonicalOutputSha256,
    policy: {
      explicitUserApprovalTokenAccepted: true,
      canonicalWriteExecutionRunner: true,
      canonicalWriteScope: "controlled_real_source_evidence_pointer_only",
      productionWriteAllowed: false,
      truthAssertionAllowed: false,
      fetchAllowed: false,
      searchAllowed: false,
      broadSearchAllowed: false,
      classifierAllowed: false
    },
    summary: {
      canonicalWriteExecutionRunnerStatus: blockedPostWriteCheckCount === 0 ? "passed" : "blocked_after_write_validation",
      allowExecuteFlagPresent: allowExecute,
      allowCanonicalWriteFlagPresent: allowCanonicalWrite,
      explicitUserApprovalTokenPresent: true,

      canonicalWriteFileCount: 1,
      canonicalWrites: 1,
      canonicalEvidencePointerRowCount: canonicalEvidencePointerRows.length,
      canonicalEvidencePointerCompetitionCount: canonicalCompetitions.length,
      canonicalEvidencePointerProviderFamilyCount: canonicalProviderFamilies.length,
      representedAcceptedEvidenceRowCount,

      canonicalCompetitions,
      canonicalProviderFamilies,

      preWriteCheckCount: preWriteChecks.length,
      passedPreWriteCheckCount,
      blockedPreWriteCheckCount,
      postWriteCheckCount: postWriteChecks.length,
      passedPostWriteCheckCount,
      blockedPostWriteCheckCount,

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 1,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      productionWrite: false,
      truthAssertion: false
    },
    preWriteChecks,
    postWriteChecks,
    canonicalEvidencePointerRows
  };

  writeJson(diagnosticOutputPath, diagnostic);

  console.log(JSON.stringify({
    output: diagnostic.output,
    canonicalOutputPath,
    canonicalOutputSha256,
    canonicalWriteExecutionRunnerStatus: diagnostic.summary.canonicalWriteExecutionRunnerStatus,
    canonicalWriteFileCount: diagnostic.summary.canonicalWriteFileCount,
    canonicalEvidencePointerRowCount: diagnostic.summary.canonicalEvidencePointerRowCount,
    canonicalEvidencePointerCompetitionCount: diagnostic.summary.canonicalEvidencePointerCompetitionCount,
    canonicalEvidencePointerProviderFamilyCount: diagnostic.summary.canonicalEvidencePointerProviderFamilyCount,
    representedAcceptedEvidenceRowCount: diagnostic.summary.representedAcceptedEvidenceRowCount,
    productionWriteExecutedNowCount: diagnostic.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: diagnostic.summary.truthAssertionExecutedNowCount
  }, null, 2));

  if (blockedPostWriteCheckCount !== 0) {
    process.exitCode = 1;
  }
}
