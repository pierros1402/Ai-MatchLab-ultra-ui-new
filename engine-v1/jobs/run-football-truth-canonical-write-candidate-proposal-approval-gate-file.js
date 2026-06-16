import fs from "node:fs";
import path from "node:path";

const sourceQualityGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-candidate-proposal-quality-gate-2026-06-15",
  "canonical-write-candidate-proposal-quality-gate-2026-06-15.json"
);

const sourceProposalPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-candidate-proposal-2026-06-15",
  "canonical-write-candidate-proposal-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-candidate-proposal-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "canonical-write-candidate-proposal-approval-gate-2026-06-15.json"
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

function approvedProposalRow(row, index) {
  return {
    canonicalWriteCandidateProposalApprovalGateRowId: `canonical_write_candidate_proposal_approval_gate_${String(index + 1).padStart(2, "0")}`,
    sourceCanonicalWriteCandidateProposalQualityGateRowId: row.canonicalWriteCandidateProposalQualityGateRowId,
    sourceCanonicalWriteCandidateProposalRowId: row.sourceCanonicalWriteCandidateProposalRowId,
    competitionSlug: row.competitionSlug,
    providerFamilies: row.providerFamilies,
    approvedEvidenceRowCount: row.approvedEvidenceRowCount,
    sourceAcceptedEvidenceRowIds: row.sourceAcceptedEvidenceRowIds,
    evidenceSha256: row.evidenceSha256,
    approvalGateStatus: "approved_for_execution_approval_gate_construction_only",
    nextAllowedAction: "build_canonical_write_execution_approval_gate_without_writes",
    canonicalWriteExecutionAllowedNow: false,
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false
  };
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourceQualityGatePath)) {
  throw new Error(`Missing canonical write candidate proposal quality gate: ${sourceQualityGatePath}`);
}

if (!fs.existsSync(sourceProposalPath)) {
  throw new Error(`Missing canonical write candidate proposal: ${sourceProposalPath}`);
}

const sourceQualityGate = readJson(sourceQualityGatePath);
const sourceProposal = readJson(sourceProposalPath);

const qualitySummary = sourceQualityGate.summary && typeof sourceQualityGate.summary === "object" ? sourceQualityGate.summary : {};
const proposalSummary = sourceProposal.summary && typeof sourceProposal.summary === "object" ? sourceProposal.summary : {};

const qualityGatedProposalRows = Array.isArray(sourceQualityGate.qualityGatedProposalRows)
  ? sourceQualityGate.qualityGatedProposalRows
  : [];

const sourceProposalRows = Array.isArray(sourceProposal.canonicalWriteCandidateProposalRows)
  ? sourceProposal.canonicalWriteCandidateProposalRows
  : [];

const approvableRows = qualityGatedProposalRows
  .filter((row) => row.qualityGateStatus === "passed_for_candidate_approval_gate_only")
  .filter((row) => row.nextAllowedAction === "build_canonical_write_candidate_proposal_approval_gate_without_writes")
  .filter((row) => row.canonicalWriteAllowedNow === false)
  .filter((row) => row.productionWriteAllowedNow === false)
  .filter((row) => row.truthAssertionAllowedNow === false);

const approvedProposalRows = approvableRows.map(approvedProposalRow);

const approvedCompetitions = uniqueSorted(approvedProposalRows.map((row) => row.competitionSlug));
const approvedProviderFamilies = uniqueSorted(approvedProposalRows.flatMap((row) => Array.isArray(row.providerFamilies) ? row.providerFamilies : []));
const totalApprovedEvidenceRowsRepresented = approvedProposalRows.reduce((sum, row) => sum + Number(row.approvedEvidenceRowCount ?? 0), 0);

const checks = [];

assertEqual("qualityGateStatus", qualitySummary.canonicalWriteCandidateProposalQualityGateStatus, "passed", checks);
assertEqual("qualityGatePassedCount", Number(qualitySummary.canonicalWriteCandidateProposalQualityGatePassedCount ?? 0), 1, checks);
assertEqual("qualityGateMayBuildApprovalGateCount", Number(qualitySummary.mayBuildCanonicalWriteCandidateProposalApprovalGateCount ?? 0), 1, checks);
assertEqual("qualityGateMayBuildExecutionApprovalGateCount", Number(qualitySummary.mayBuildCanonicalWriteExecutionApprovalGateCount ?? 0), 0, checks);

assertEqual("proposalStatus", proposalSummary.canonicalWriteCandidateProposalStatus, "passed", checks);
assertEqual("proposalBuiltCount", Number(proposalSummary.canonicalWriteCandidateProposalBuiltCount ?? 0), 1, checks);

assertEqual("sourceProposalRowCount", sourceProposalRows.length, 6, checks);
assertEqual("qualityGatedProposalRowCount", qualityGatedProposalRows.length, 6, checks);
assertEqual("approvableProposalRowCount", approvableRows.length, 6, checks);
assertEqual("approvedProposalRowCount", approvedProposalRows.length, 6, checks);
assertEqual("totalApprovedEvidenceRowsRepresented", totalApprovedEvidenceRowsRepresented, 12, checks);

assertArrayEqual("approvedCompetitions", approvedCompetitions, expectedCompetitions, checks);
assertArrayEqual("approvedProviderFamilies", approvedProviderFamilies, expectedProviderFamilies, checks);

assertAll("approvedRowsHaveExecutionGateConstructionOnlyStatus", approvedProposalRows, (row) => row.approvalGateStatus === "approved_for_execution_approval_gate_construction_only", checks);
assertAll("approvedRowsDoNotAllowCanonicalWriteExecutionNow", approvedProposalRows, (row) => row.canonicalWriteExecutionAllowedNow === false, checks);
assertAll("approvedRowsDoNotAllowCanonicalWriteNow", approvedProposalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("approvedRowsDoNotAllowProductionWriteNow", approvedProposalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("approvedRowsDoNotAllowTruthAssertionNow", approvedProposalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("approvedRowsDidNotExecuteCanonicalWrite", approvedProposalRows, (row) => row.canonicalWriteExecutedNow === false, checks);
assertAll("approvedRowsDidNotExecuteProductionWrite", approvedProposalRows, (row) => row.productionWriteExecutedNow === false, checks);
assertAll("approvedRowsDidNotExecuteTruthAssertion", approvedProposalRows, (row) => row.truthAssertionExecutedNow === false, checks);

assertEqual("qualityGateFetchExecutedNowCount", Number(qualitySummary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("qualityGateSearchExecutedNowCount", Number(qualitySummary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("qualityGateBroadSearchExecutedNowCount", Number(qualitySummary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("qualityGateClassifierExecutedNowCount", Number(qualitySummary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("qualityGateCanonicalWriteExecutedNowCount", Number(qualitySummary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("qualityGateProductionWriteExecutedNowCount", Number(qualitySummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("qualityGateTruthAssertionExecutedNowCount", Number(qualitySummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("qualityGateCanonicalWrites", Number(qualitySummary.canonicalWrites ?? 0), 0, checks);
assertEqual("qualityGateProductionWrite", Boolean(qualitySummary.productionWrite), false, checks);
assertEqual("qualityGateMayWriteCanonicalNowCount", Number(qualitySummary.mayWriteCanonicalNowCount ?? 0), 0, checks);
assertEqual("qualityGateMayWriteProductionNowCount", Number(qualitySummary.mayWriteProductionNowCount ?? 0), 0, checks);
assertEqual("qualityGateMayAssertTruthNowCount", Number(qualitySummary.mayAssertTruthNowCount ?? 0), 0, checks);

const blockedApprovalCheckCount = checks.filter((check) => !check.passed).length;
const passedApprovalCheckCount = checks.filter((check) => check.passed).length;

const approvalGate = {
  output: outputPath,
  job: "run-football-truth-canonical-write-candidate-proposal-approval-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    sourceQualityGatePath,
    sourceProposalPath
  },
  policy: {
    approvalGateOnly: true,
    approvedScope: "execution_approval_gate_construction_only_without_writes",
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    canonicalWriteCandidateProposalApprovalGateReadCount: 2,
    qualityGateStatus: qualitySummary.canonicalWriteCandidateProposalQualityGateStatus,
    qualityGatePassedCount: Number(qualitySummary.canonicalWriteCandidateProposalQualityGatePassedCount ?? 0),
    qualityGateMayBuildApprovalGateCount: Number(qualitySummary.mayBuildCanonicalWriteCandidateProposalApprovalGateCount ?? 0),

    proposalStatus: proposalSummary.canonicalWriteCandidateProposalStatus,
    proposalBuiltCount: Number(proposalSummary.canonicalWriteCandidateProposalBuiltCount ?? 0),

    sourceProposalRowCount: sourceProposalRows.length,
    qualityGatedProposalRowCount: qualityGatedProposalRows.length,
    approvableProposalRowCount: approvableRows.length,
    approvedProposalRowCount: approvedProposalRows.length,
    approvedProposalCompetitionCount: approvedCompetitions.length,
    approvedProposalProviderFamilyCount: approvedProviderFamilies.length,
    totalApprovedEvidenceRowsRepresented,

    approvedCompetitions,
    approvedProviderFamilies,
    byCompetitionSlug: countBy(approvedProposalRows, "competitionSlug"),

    approvalCheckCount: checks.length,
    passedApprovalCheckCount,
    blockedApprovalCheckCount,
    canonicalWriteCandidateProposalApprovalGateStatus: blockedApprovalCheckCount === 0 ? "passed" : "blocked",
    canonicalWriteCandidateProposalApprovalGatePassedCount: blockedApprovalCheckCount === 0 ? 1 : 0,

    mayBuildCanonicalWriteExecutionApprovalGateCount: blockedApprovalCheckCount === 0 ? 1 : 0,
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
  approvedProposalRows
};

fs.writeFileSync(outputPath, `${JSON.stringify(approvalGate, null, 2)}\n`);

console.log(JSON.stringify({
  output: approvalGate.output,
  canonicalWriteCandidateProposalApprovalGateStatus: approvalGate.summary.canonicalWriteCandidateProposalApprovalGateStatus,
  approvedProposalRowCount: approvalGate.summary.approvedProposalRowCount,
  approvedProposalCompetitionCount: approvalGate.summary.approvedProposalCompetitionCount,
  approvedProposalProviderFamilyCount: approvalGate.summary.approvedProposalProviderFamilyCount,
  totalApprovedEvidenceRowsRepresented: approvalGate.summary.totalApprovedEvidenceRowsRepresented,
  mayBuildCanonicalWriteExecutionApprovalGateCount: approvalGate.summary.mayBuildCanonicalWriteExecutionApprovalGateCount,
  mayExecuteCanonicalWriteNowCount: approvalGate.summary.mayExecuteCanonicalWriteNowCount,
  mayWriteCanonicalNowCount: approvalGate.summary.mayWriteCanonicalNowCount,
  mayWriteProductionNowCount: approvalGate.summary.mayWriteProductionNowCount,
  mayAssertTruthNowCount: approvalGate.summary.mayAssertTruthNowCount
}, null, 2));

if (blockedApprovalCheckCount !== 0) {
  process.exitCode = 1;
}
