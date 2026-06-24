import fs from "node:fs";
import path from "node:path";

const sourceProposalApprovalGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-candidate-proposal-approval-gate-2026-06-15",
  "canonical-write-candidate-proposal-approval-gate-2026-06-15.json"
);

const sourceProposalQualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-candidate-proposal-quality-gate-2026-06-15",
  "canonical-write-candidate-proposal-quality-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-execution-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "canonical-write-execution-approval-gate-2026-06-15.json"
);

const expectedCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];
const expectedProviderFamilies = ["laliga", "norway_ntf", "sportomedia"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function executionApprovalRow(row, index) {
  return {
    canonicalWriteExecutionApprovalGateRowId: `canonical_write_execution_approval_gate_${String(index + 1).padStart(2, "0")}`,
    sourceCanonicalWriteCandidateProposalApprovalGateRowId: row.canonicalWriteCandidateProposalApprovalGateRowId,
    sourceCanonicalWriteCandidateProposalQualityGateRowId: row.sourceCanonicalWriteCandidateProposalQualityGateRowId,
    sourceCanonicalWriteCandidateProposalRowId: row.sourceCanonicalWriteCandidateProposalRowId,
    competitionSlug: row.competitionSlug,
    providerFamilies: row.providerFamilies,
    approvedEvidenceRowCount: row.approvedEvidenceRowCount,
    sourceAcceptedEvidenceRowIds: row.sourceAcceptedEvidenceRowIds,
    evidenceSha256: row.evidenceSha256,
    executionApprovalStatus: "approved_for_explicit_user_approved_canonical_write_runner_only",
    approvedExecutionScope: "canonical_evidence_pointer_candidate_write_only",
    nextAllowedAction: "build_canonical_write_execution_runner_after_explicit_user_approval",
    requiresExplicitUserApprovalBeforeWriteRunner: true,
    canonicalWriteRunnerMayBeBuilt: true,
    canonicalWriteRunnerMayBeExecutedWithoutUserApproval: false,
    canonicalWriteExecutionAllowedInThisJob: false,
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false
  };
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourceProposalApprovalGatePath)) {
  throw new Error(`Missing canonical write candidate proposal approval gate: ${sourceProposalApprovalGatePath}`);
}

if (!fs.existsSync(sourceProposalQualityGatePath)) {
  throw new Error(`Missing canonical write candidate proposal quality gate: ${sourceProposalQualityGatePath}`);
}

const sourceApprovalGate = readJson(sourceProposalApprovalGatePath);
const sourceQualityGate = readJson(sourceProposalQualityGatePath);

const approvalSummary = sourceApprovalGate.summary && typeof sourceApprovalGate.summary === "object" ? sourceApprovalGate.summary : {};
const qualitySummary = sourceQualityGate.summary && typeof sourceQualityGate.summary === "object" ? sourceQualityGate.summary : {};

const approvedProposalRows = Array.isArray(sourceApprovalGate.approvedProposalRows)
  ? sourceApprovalGate.approvedProposalRows
  : [];

const qualityGatedProposalRows = Array.isArray(sourceQualityGate.qualityGatedProposalRows)
  ? sourceQualityGate.qualityGatedProposalRows
  : [];

const eligibleRows = approvedProposalRows
  .filter((row) => row.approvalGateStatus === "approved_for_execution_approval_gate_construction_only")
  .filter((row) => row.nextAllowedAction === "build_canonical_write_execution_approval_gate_without_writes")
  .filter((row) => row.canonicalWriteExecutionAllowedNow === false)
  .filter((row) => row.canonicalWriteAllowedNow === false)
  .filter((row) => row.productionWriteAllowedNow === false)
  .filter((row) => row.truthAssertionAllowedNow === false)
  .filter((row) => row.canonicalWriteExecutedNow === false)
  .filter((row) => row.productionWriteExecutedNow === false)
  .filter((row) => row.truthAssertionExecutedNow === false);

const canonicalWriteExecutionApprovalRows = eligibleRows.map(executionApprovalRow);

const approvedCompetitions = uniqueSorted(canonicalWriteExecutionApprovalRows.map((row) => row.competitionSlug));
const approvedProviderFamilies = uniqueSorted(canonicalWriteExecutionApprovalRows.flatMap((row) => Array.isArray(row.providerFamilies) ? row.providerFamilies : []));
const totalApprovedEvidenceRowsRepresented = canonicalWriteExecutionApprovalRows.reduce((sum, row) => sum + Number(row.approvedEvidenceRowCount ?? 0), 0);

const checks = [];

assertEqual("proposalApprovalGateStatus", approvalSummary.canonicalWriteCandidateProposalApprovalGateStatus, "passed", checks);
assertEqual("proposalApprovalGatePassedCount", Number(approvalSummary.canonicalWriteCandidateProposalApprovalGatePassedCount ?? 0), 1, checks);
assertEqual("proposalApprovalMayBuildCanonicalWriteExecutionApprovalGateCount", Number(approvalSummary.mayBuildCanonicalWriteExecutionApprovalGateCount ?? 0), 1, checks);
assertEqual("proposalApprovalMayExecuteCanonicalWriteNowCount", Number(approvalSummary.mayExecuteCanonicalWriteNowCount ?? 0), 0, checks);

assertEqual("proposalQualityGateStatus", qualitySummary.canonicalWriteCandidateProposalQualityGateStatus, "passed", checks);
assertEqual("proposalQualityGatePassedCount", Number(qualitySummary.canonicalWriteCandidateProposalQualityGatePassedCount ?? 0), 1, checks);

assertEqual("approvedProposalRowCount", approvedProposalRows.length, 6, checks);
assertEqual("qualityGatedProposalRowCount", qualityGatedProposalRows.length, 6, checks);
assertEqual("eligibleCanonicalWriteExecutionApprovalRowCount", eligibleRows.length, 6, checks);
assertEqual("canonicalWriteExecutionApprovalRowCount", canonicalWriteExecutionApprovalRows.length, 6, checks);
assertEqual("totalApprovedEvidenceRowsRepresented", totalApprovedEvidenceRowsRepresented, 12, checks);

assertArrayEqual("approvedCompetitions", approvedCompetitions, expectedCompetitions, checks);
assertArrayEqual("approvedProviderFamilies", approvedProviderFamilies, expectedProviderFamilies, checks);

assertAll("executionApprovalRowsRequireExplicitUserApprovalBeforeWriteRunner", canonicalWriteExecutionApprovalRows, (row) => row.requiresExplicitUserApprovalBeforeWriteRunner === true, checks);
assertAll("executionApprovalRowsDoNotAllowWriteRunnerWithoutUserApproval", canonicalWriteExecutionApprovalRows, (row) => row.canonicalWriteRunnerMayBeExecutedWithoutUserApproval === false, checks);
assertAll("executionApprovalRowsDoNotAllowCanonicalWriteInThisJob", canonicalWriteExecutionApprovalRows, (row) => row.canonicalWriteExecutionAllowedInThisJob === false, checks);
assertAll("executionApprovalRowsDoNotAllowCanonicalWriteNow", canonicalWriteExecutionApprovalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("executionApprovalRowsDoNotAllowProductionWriteNow", canonicalWriteExecutionApprovalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("executionApprovalRowsDoNotAllowTruthAssertionNow", canonicalWriteExecutionApprovalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("executionApprovalRowsDidNotExecuteCanonicalWrite", canonicalWriteExecutionApprovalRows, (row) => row.canonicalWriteExecutedNow === false, checks);
assertAll("executionApprovalRowsDidNotExecuteProductionWrite", canonicalWriteExecutionApprovalRows, (row) => row.productionWriteExecutedNow === false, checks);
assertAll("executionApprovalRowsDidNotExecuteTruthAssertion", canonicalWriteExecutionApprovalRows, (row) => row.truthAssertionExecutedNow === false, checks);

assertEqual("approvalGateFetchExecutedNowCount", Number(approvalSummary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("approvalGateSearchExecutedNowCount", Number(approvalSummary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("approvalGateBroadSearchExecutedNowCount", Number(approvalSummary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("approvalGateClassifierExecutedNowCount", Number(approvalSummary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("approvalGateCanonicalWriteExecutedNowCount", Number(approvalSummary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("approvalGateProductionWriteExecutedNowCount", Number(approvalSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("approvalGateTruthAssertionExecutedNowCount", Number(approvalSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("approvalGateCanonicalWrites", Number(approvalSummary.canonicalWrites ?? 0), 0, checks);
assertEqual("approvalGateProductionWrite", Boolean(approvalSummary.productionWrite), false, checks);
assertEqual("approvalGateMayWriteCanonicalNowCount", Number(approvalSummary.mayWriteCanonicalNowCount ?? 0), 0, checks);
assertEqual("approvalGateMayWriteProductionNowCount", Number(approvalSummary.mayWriteProductionNowCount ?? 0), 0, checks);
assertEqual("approvalGateMayAssertTruthNowCount", Number(approvalSummary.mayAssertTruthNowCount ?? 0), 0, checks);

const blockedExecutionApprovalCheckCount = checks.filter((check) => !check.passed).length;
const passedExecutionApprovalCheckCount = checks.filter((check) => check.passed).length;

const executionApprovalGate = {
  output: outputPath,
  job: "run-football-truth-canonical-write-execution-approval-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    sourceProposalApprovalGatePath,
    sourceProposalQualityGatePath
  },
  policy: {
    executionApprovalGateOnly: true,
    approvedScope: "canonical_write_runner_path_requires_explicit_user_approval",
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowedInThisJob: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    actualWriteRunnerRequiresExplicitUserApproval: true
  },
  summary: {
    canonicalWriteExecutionApprovalGateReadCount: 2,
    proposalApprovalGateStatus: approvalSummary.canonicalWriteCandidateProposalApprovalGateStatus,
    proposalApprovalGatePassedCount: Number(approvalSummary.canonicalWriteCandidateProposalApprovalGatePassedCount ?? 0),
    proposalApprovalMayBuildCanonicalWriteExecutionApprovalGateCount: Number(approvalSummary.mayBuildCanonicalWriteExecutionApprovalGateCount ?? 0),

    proposalQualityGateStatus: qualitySummary.canonicalWriteCandidateProposalQualityGateStatus,
    proposalQualityGatePassedCount: Number(qualitySummary.canonicalWriteCandidateProposalQualityGatePassedCount ?? 0),

    approvedProposalRowCount: approvedProposalRows.length,
    qualityGatedProposalRowCount: qualityGatedProposalRows.length,
    eligibleCanonicalWriteExecutionApprovalRowCount: eligibleRows.length,
    canonicalWriteExecutionApprovalRowCount: canonicalWriteExecutionApprovalRows.length,
    canonicalWriteExecutionApprovalCompetitionCount: approvedCompetitions.length,
    canonicalWriteExecutionApprovalProviderFamilyCount: approvedProviderFamilies.length,
    totalApprovedEvidenceRowsRepresented,

    approvedCompetitions,
    approvedProviderFamilies,
    byCompetitionSlug: countBy(canonicalWriteExecutionApprovalRows, "competitionSlug"),

    executionApprovalCheckCount: checks.length,
    passedExecutionApprovalCheckCount,
    blockedExecutionApprovalCheckCount,
    canonicalWriteExecutionApprovalGateStatus: blockedExecutionApprovalCheckCount === 0 ? "passed" : "blocked",
    canonicalWriteExecutionApprovalGatePassedCount: blockedExecutionApprovalCheckCount === 0 ? 1 : 0,

    mayBuildCanonicalWriteExecutionRunnerCount: blockedExecutionApprovalCheckCount === 0 ? 1 : 0,
    canonicalWriteExecutionRunnerRequiresExplicitUserApprovalCount: 1,
    mayExecuteCanonicalWriteNowCount: 0,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    canonicalWrites: 0,
    productionWrite: false,

    mayWriteCanonicalNowCount: 0,
    mayWriteProductionNowCount: 0,
    mayAssertTruthNowCount: 0
  },
  checks,
  canonicalWriteExecutionApprovalRows
};

fs.writeFileSync(outputPath, `${JSON.stringify(executionApprovalGate, null, 2)}\n`);

console.log(JSON.stringify({
  output: executionApprovalGate.output,
  canonicalWriteExecutionApprovalGateStatus: executionApprovalGate.summary.canonicalWriteExecutionApprovalGateStatus,
  canonicalWriteExecutionApprovalRowCount: executionApprovalGate.summary.canonicalWriteExecutionApprovalRowCount,
  canonicalWriteExecutionApprovalCompetitionCount: executionApprovalGate.summary.canonicalWriteExecutionApprovalCompetitionCount,
  canonicalWriteExecutionApprovalProviderFamilyCount: executionApprovalGate.summary.canonicalWriteExecutionApprovalProviderFamilyCount,
  totalApprovedEvidenceRowsRepresented: executionApprovalGate.summary.totalApprovedEvidenceRowsRepresented,
  mayBuildCanonicalWriteExecutionRunnerCount: executionApprovalGate.summary.mayBuildCanonicalWriteExecutionRunnerCount,
  canonicalWriteExecutionRunnerRequiresExplicitUserApprovalCount: executionApprovalGate.summary.canonicalWriteExecutionRunnerRequiresExplicitUserApprovalCount,
  mayExecuteCanonicalWriteNowCount: executionApprovalGate.summary.mayExecuteCanonicalWriteNowCount,
  mayWriteCanonicalNowCount: executionApprovalGate.summary.mayWriteCanonicalNowCount,
  mayWriteProductionNowCount: executionApprovalGate.summary.mayWriteProductionNowCount,
  mayAssertTruthNowCount: executionApprovalGate.summary.mayAssertTruthNowCount
}, null, 2));

if (blockedExecutionApprovalCheckCount !== 0) {
  process.exitCode = 1;
}
