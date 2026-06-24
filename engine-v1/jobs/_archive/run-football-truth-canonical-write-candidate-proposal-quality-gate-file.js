import fs from "node:fs";
import path from "node:path";

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
  "canonical-write-candidate-proposal-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "canonical-write-candidate-proposal-quality-gate-2026-06-15.json"
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

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourceProposalPath)) {
  throw new Error(`Missing canonical write candidate proposal: ${sourceProposalPath}`);
}

const sourceProposal = readJson(sourceProposalPath);
const sourceSummary = sourceProposal.summary && typeof sourceProposal.summary === "object" ? sourceProposal.summary : {};
const proposalRows = Array.isArray(sourceProposal.canonicalWriteCandidateProposalRows)
  ? sourceProposal.canonicalWriteCandidateProposalRows
  : [];

const proposalCompetitions = uniqueSorted(proposalRows.map((row) => row.competitionSlug));
const proposalProviderFamilies = uniqueSorted(proposalRows.flatMap((row) => Array.isArray(row.providerFamilies) ? row.providerFamilies : []));
const totalApprovedEvidenceRowsRepresented = proposalRows.reduce((sum, row) => sum + Number(row.approvedEvidenceRowCount ?? 0), 0);

const rowsWithTwoEvidenceRows = proposalRows.filter((row) => Number(row.approvedEvidenceRowCount ?? 0) === 2);
const rowsWithSourceIds = proposalRows.filter((row) => Array.isArray(row.sourceAcceptedEvidenceRowIds) && row.sourceAcceptedEvidenceRowIds.length === Number(row.approvedEvidenceRowCount ?? 0));
const rowsWithApprovalIds = proposalRows.filter((row) => Array.isArray(row.approvedEvidenceRowIds) && row.approvedEvidenceRowIds.length === Number(row.approvedEvidenceRowCount ?? 0));
const rowsWithSha = proposalRows.filter((row) => Array.isArray(row.evidenceSha256) && row.evidenceSha256.length > 0);
const rowsWithUrls = proposalRows.filter((row) => Array.isArray(row.urls) && row.urls.length > 0 && Array.isArray(row.finalUrls) && row.finalUrls.length > 0);
const rowsWithMarkers = proposalRows.filter((row) => Array.isArray(row.markerHits) && row.markerHits.length > 0);

const checks = [];

assertEqual("sourceProposalStatus", sourceSummary.canonicalWriteCandidateProposalStatus, "passed", checks);
assertEqual("sourceProposalBuiltCount", Number(sourceSummary.canonicalWriteCandidateProposalBuiltCount ?? 0), 1, checks);
assertEqual("sourceMayBuildCanonicalWriteCandidateProposalQualityGateCount", Number(sourceSummary.mayBuildCanonicalWriteCandidateProposalQualityGateCount ?? 0), 1, checks);

assertEqual("sourceApprovedPromotionRowCount", Number(sourceSummary.approvedPromotionRowCount ?? 0), 12, checks);
assertEqual("sourceValidApprovedPromotionRowCount", Number(sourceSummary.validApprovedPromotionRowCount ?? 0), 12, checks);
assertEqual("proposalRowCount", proposalRows.length, 6, checks);
assertEqual("totalApprovedEvidenceRowsRepresented", totalApprovedEvidenceRowsRepresented, 12, checks);

assertEqual("rowsWithTwoEvidenceRowsCount", rowsWithTwoEvidenceRows.length, 6, checks);
assertEqual("rowsWithSourceIdsCount", rowsWithSourceIds.length, 6, checks);
assertEqual("rowsWithApprovalIdsCount", rowsWithApprovalIds.length, 6, checks);
assertEqual("rowsWithShaCount", rowsWithSha.length, 6, checks);
assertEqual("rowsWithUrlsCount", rowsWithUrls.length, 6, checks);
assertEqual("rowsWithMarkersCount", rowsWithMarkers.length, 6, checks);

assertArrayEqual("proposalCompetitions", proposalCompetitions, expectedCompetitions, checks);
assertArrayEqual("proposalProviderFamilies", proposalProviderFamilies, expectedProviderFamilies, checks);

assertAll("proposalRowsHaveCandidateOnlyScope", proposalRows, (row) => row.proposedWriteKind === "canonical_candidate_not_written", checks);
assertAll("proposalRowsRequireQualityGate", proposalRows, (row) => row.requiredNextGate === "canonical_write_candidate_proposal_quality_gate", checks);
assertAll("proposalRowsDisallowCanonicalWriteNow", proposalRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("proposalRowsDisallowProductionWriteNow", proposalRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("proposalRowsDisallowTruthAssertionNow", proposalRows, (row) => row.truthAssertionAllowedNow === false, checks);
assertAll("proposalRowsDidNotExecuteCanonicalWrite", proposalRows, (row) => row.canonicalWriteExecutedNow === false, checks);
assertAll("proposalRowsDidNotExecuteProductionWrite", proposalRows, (row) => row.productionWriteExecutedNow === false, checks);
assertAll("proposalRowsDidNotExecuteTruthAssertion", proposalRows, (row) => row.truthAssertionExecutedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(sourceSummary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceSearchExecutedNowCount", Number(sourceSummary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(sourceSummary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(sourceSummary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(sourceSummary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(sourceSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(sourceSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWrites", Number(sourceSummary.canonicalWrites ?? 0), 0, checks);
assertEqual("sourceProductionWrite", Boolean(sourceSummary.productionWrite), false, checks);
assertEqual("sourceMayWriteCanonicalNowCount", Number(sourceSummary.mayWriteCanonicalNowCount ?? 0), 0, checks);
assertEqual("sourceMayWriteProductionNowCount", Number(sourceSummary.mayWriteProductionNowCount ?? 0), 0, checks);
assertEqual("sourceMayAssertTruthNowCount", Number(sourceSummary.mayAssertTruthNowCount ?? 0), 0, checks);

const blockedQualityGateCheckCount = checks.filter((check) => !check.passed).length;
const passedQualityGateCheckCount = checks.filter((check) => check.passed).length;

const qualityGate = {
  output: outputPath,
  job: "run-football-truth-canonical-write-candidate-proposal-quality-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    sourceProposalPath
  },
  policy: {
    qualityGateOnly: true,
    validatedScope: "canonical_write_candidate_proposal_without_writes",
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    canonicalWriteCandidateProposalQualityGateReadCount: 1,
    sourceProposalStatus: sourceSummary.canonicalWriteCandidateProposalStatus,
    sourceProposalBuiltCount: Number(sourceSummary.canonicalWriteCandidateProposalBuiltCount ?? 0),
    sourceMayBuildCanonicalWriteCandidateProposalQualityGateCount: Number(sourceSummary.mayBuildCanonicalWriteCandidateProposalQualityGateCount ?? 0),

    sourceApprovedPromotionRowCount: Number(sourceSummary.approvedPromotionRowCount ?? 0),
    sourceValidApprovedPromotionRowCount: Number(sourceSummary.validApprovedPromotionRowCount ?? 0),
    proposalRowCount: proposalRows.length,
    totalApprovedEvidenceRowsRepresented,
    proposalCompetitionCount: proposalCompetitions.length,
    proposalProviderFamilyCount: proposalProviderFamilies.length,

    proposalCompetitions,
    proposalProviderFamilies,
    byCompetitionSlug: countBy(proposalRows, "competitionSlug"),

    qualityGateCheckCount: checks.length,
    passedQualityGateCheckCount,
    blockedQualityGateCheckCount,
    canonicalWriteCandidateProposalQualityGateStatus: blockedQualityGateCheckCount === 0 ? "passed" : "blocked",
    canonicalWriteCandidateProposalQualityGatePassedCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

    mayBuildCanonicalWriteCandidateProposalApprovalGateCount: blockedQualityGateCheckCount === 0 ? 1 : 0,
    mayBuildCanonicalWriteExecutionApprovalGateCount: 0,

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
  qualityGatedProposalRows: proposalRows.map((row, index) => ({
    canonicalWriteCandidateProposalQualityGateRowId: `canonical_write_candidate_proposal_quality_gate_${String(index + 1).padStart(2, "0")}`,
    sourceCanonicalWriteCandidateProposalRowId: row.canonicalWriteCandidateProposalRowId,
    competitionSlug: row.competitionSlug,
    providerFamilies: row.providerFamilies,
    approvedEvidenceRowCount: row.approvedEvidenceRowCount,
    sourceAcceptedEvidenceRowIds: row.sourceAcceptedEvidenceRowIds,
    evidenceSha256: row.evidenceSha256,
    qualityGateStatus: "passed_for_candidate_approval_gate_only",
    nextAllowedAction: "build_canonical_write_candidate_proposal_approval_gate_without_writes",
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false
  }))
};

fs.writeFileSync(outputPath, `${JSON.stringify(qualityGate, null, 2)}\n`);

console.log(JSON.stringify({
  output: qualityGate.output,
  canonicalWriteCandidateProposalQualityGateStatus: qualityGate.summary.canonicalWriteCandidateProposalQualityGateStatus,
  proposalRowCount: qualityGate.summary.proposalRowCount,
  totalApprovedEvidenceRowsRepresented: qualityGate.summary.totalApprovedEvidenceRowsRepresented,
  proposalCompetitionCount: qualityGate.summary.proposalCompetitionCount,
  proposalProviderFamilyCount: qualityGate.summary.proposalProviderFamilyCount,
  mayBuildCanonicalWriteCandidateProposalApprovalGateCount: qualityGate.summary.mayBuildCanonicalWriteCandidateProposalApprovalGateCount,
  mayBuildCanonicalWriteExecutionApprovalGateCount: qualityGate.summary.mayBuildCanonicalWriteExecutionApprovalGateCount,
  mayWriteCanonicalNowCount: qualityGate.summary.mayWriteCanonicalNowCount,
  mayWriteProductionNowCount: qualityGate.summary.mayWriteProductionNowCount,
  mayAssertTruthNowCount: qualityGate.summary.mayAssertTruthNowCount
}, null, 2));

if (blockedQualityGateCheckCount !== 0) {
  process.exitCode = 1;
}
