import fs from "node:fs";
import path from "node:path";

const sourceGatePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "accepted-evidence-promotion-approval-gate-2026-06-15",
  "accepted-evidence-promotion-approval-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "canonical-write-candidate-proposal-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "canonical-write-candidate-proposal-2026-06-15.json"
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

function groupByCompetition(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!groups.has(row.competitionSlug)) {
      groups.set(row.competitionSlug, []);
    }

    groups.get(row.competitionSlug).push(row);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([competitionSlug, evidenceRows]) => ({ competitionSlug, evidenceRows }));
}

function proposalRow(group, index) {
  const providerFamilies = uniqueSorted(group.evidenceRows.map((row) => row.providerFamily));
  const attemptKinds = uniqueSorted(group.evidenceRows.map((row) => row.attemptKind));
  const urls = uniqueSorted(group.evidenceRows.map((row) => row.url));
  const finalUrls = uniqueSorted(group.evidenceRows.map((row) => row.finalUrl));
  const evidenceSha256 = uniqueSorted(group.evidenceRows.map((row) => row.bodySha256));
  const markerHits = uniqueSorted(group.evidenceRows.flatMap((row) => Array.isArray(row.markerHits) ? row.markerHits : []));

  return {
    canonicalWriteCandidateProposalRowId: `canonical_write_candidate_proposal_${String(index + 1).padStart(2, "0")}`,
    competitionSlug: group.competitionSlug,
    providerFamilies,
    attemptKinds,
    approvedEvidenceRowCount: group.evidenceRows.length,
    approvedEvidenceRowIds: group.evidenceRows.map((row) => row.acceptedEvidencePromotionApprovalGateRowId),
    sourceAcceptedEvidenceRowIds: group.evidenceRows.map((row) => row.sourceAcceptedEvidenceRowId),
    urls,
    finalUrls,
    evidenceSha256,
    markerHits,
    proposedCanonicalScope: "trusted_source_evidence_pointer_and_delta_candidate_only",
    proposedStandingOrSeasonStateDeltaCandidate: true,
    proposedWriteKind: "canonical_candidate_not_written",
    candidateRationale: "Accepted controlled real evidence is available for the competition, but no canonical truth write is authorized in this proposal stage.",
    requiredNextGate: "canonical_write_candidate_proposal_quality_gate",
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false
  };
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourceGatePath)) {
  throw new Error(`Missing accepted evidence promotion approval gate: ${sourceGatePath}`);
}

const sourceGate = readJson(sourceGatePath);
const sourceSummary = sourceGate.summary && typeof sourceGate.summary === "object" ? sourceGate.summary : {};
const approvedPromotionRows = Array.isArray(sourceGate.approvedPromotionRows) ? sourceGate.approvedPromotionRows : [];

const validApprovedRows = approvedPromotionRows
  .filter((row) => row.approvalGateStatus === "approved_for_no_write_promotion_planning_only")
  .filter((row) => row.standingsOrSeasonStateDeltaCandidate === true)
  .filter((row) => row.canonicalWriteCandidateOnly === true)
  .filter((row) => row.canonicalWriteAllowedNow === false)
  .filter((row) => row.productionWriteAllowedNow === false)
  .filter((row) => row.truthAssertionAllowedNow === false);

const canonicalWriteCandidateProposalRows = groupByCompetition(validApprovedRows).map(proposalRow);

const approvedCompetitions = uniqueSorted(validApprovedRows.map((row) => row.competitionSlug));
const approvedProviderFamilies = uniqueSorted(validApprovedRows.map((row) => row.providerFamily));
const proposalCompetitions = uniqueSorted(canonicalWriteCandidateProposalRows.map((row) => row.competitionSlug));
const proposalProviderFamilies = uniqueSorted(canonicalWriteCandidateProposalRows.flatMap((row) => row.providerFamilies));

const checks = [];

assertEqual("sourceApprovalGateStatus", sourceSummary.acceptedEvidencePromotionApprovalGateStatus, "passed", checks);
assertEqual("sourceApprovalGatePassedCount", Number(sourceSummary.acceptedEvidencePromotionApprovalGatePassedCount ?? 0), 1, checks);
assertEqual("sourceMayBuildCanonicalWriteCandidateProposalCount", Number(sourceSummary.mayBuildCanonicalWriteCandidateProposalCount ?? 0), 1, checks);
assertEqual("sourceMayRunNoWritePromotionPlanningCount", Number(sourceSummary.mayRunNoWritePromotionPlanningCount ?? 0), 1, checks);

assertEqual("approvedPromotionRowCount", approvedPromotionRows.length, 12, checks);
assertEqual("validApprovedPromotionRowCount", validApprovedRows.length, 12, checks);
assertEqual("canonicalWriteCandidateProposalRowCount", canonicalWriteCandidateProposalRows.length, 6, checks);

assertArrayEqual("approvedCompetitions", approvedCompetitions, expectedCompetitions, checks);
assertArrayEqual("proposalCompetitions", proposalCompetitions, expectedCompetitions, checks);
assertArrayEqual("approvedProviderFamilies", approvedProviderFamilies, expectedProviderFamilies, checks);
assertArrayEqual("proposalProviderFamilies", proposalProviderFamilies, expectedProviderFamilies, checks);

assertEqual("sourceMayWriteCanonicalNowCount", Number(sourceSummary.mayWriteCanonicalNowCount ?? 0), 0, checks);
assertEqual("sourceMayWriteProductionNowCount", Number(sourceSummary.mayWriteProductionNowCount ?? 0), 0, checks);
assertEqual("sourceMayAssertTruthNowCount", Number(sourceSummary.mayAssertTruthNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(sourceSummary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(sourceSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(sourceSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWrites", Number(sourceSummary.canonicalWrites ?? 0), 0, checks);
assertEqual("sourceProductionWrite", Boolean(sourceSummary.productionWrite), false, checks);

const rowsWithCanonicalWriteAllowedNow = canonicalWriteCandidateProposalRows.filter((row) => row.canonicalWriteAllowedNow === true);
const rowsWithProductionWriteAllowedNow = canonicalWriteCandidateProposalRows.filter((row) => row.productionWriteAllowedNow === true);
const rowsWithTruthAssertionAllowedNow = canonicalWriteCandidateProposalRows.filter((row) => row.truthAssertionAllowedNow === true);
const rowsWithCanonicalWriteExecutedNow = canonicalWriteCandidateProposalRows.filter((row) => row.canonicalWriteExecutedNow === true);
const rowsWithProductionWriteExecutedNow = canonicalWriteCandidateProposalRows.filter((row) => row.productionWriteExecutedNow === true);
const rowsWithTruthAssertionExecutedNow = canonicalWriteCandidateProposalRows.filter((row) => row.truthAssertionExecutedNow === true);

assertEqual("rowsWithCanonicalWriteAllowedNowCount", rowsWithCanonicalWriteAllowedNow.length, 0, checks);
assertEqual("rowsWithProductionWriteAllowedNowCount", rowsWithProductionWriteAllowedNow.length, 0, checks);
assertEqual("rowsWithTruthAssertionAllowedNowCount", rowsWithTruthAssertionAllowedNow.length, 0, checks);
assertEqual("rowsWithCanonicalWriteExecutedNowCount", rowsWithCanonicalWriteExecutedNow.length, 0, checks);
assertEqual("rowsWithProductionWriteExecutedNowCount", rowsWithProductionWriteExecutedNow.length, 0, checks);
assertEqual("rowsWithTruthAssertionExecutedNowCount", rowsWithTruthAssertionExecutedNow.length, 0, checks);

const blockedProposalCheckCount = checks.filter((check) => !check.passed).length;
const passedProposalCheckCount = checks.filter((check) => check.passed).length;

const proposal = {
  output: outputPath,
  job: "build-football-truth-canonical-write-candidate-proposal-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    sourceGatePath
  },
  policy: {
    proposalOnly: true,
    approvedScope: "canonical_write_candidate_proposal_without_writes",
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    canonicalWriteCandidateProposalReadCount: 1,
    sourceApprovalGateStatus: sourceSummary.acceptedEvidencePromotionApprovalGateStatus,
    sourceApprovalGatePassedCount: Number(sourceSummary.acceptedEvidencePromotionApprovalGatePassedCount ?? 0),
    sourceMayBuildCanonicalWriteCandidateProposalCount: Number(sourceSummary.mayBuildCanonicalWriteCandidateProposalCount ?? 0),
    sourceMayRunNoWritePromotionPlanningCount: Number(sourceSummary.mayRunNoWritePromotionPlanningCount ?? 0),

    approvedPromotionRowCount: approvedPromotionRows.length,
    validApprovedPromotionRowCount: validApprovedRows.length,
    canonicalWriteCandidateProposalRowCount: canonicalWriteCandidateProposalRows.length,
    canonicalWriteCandidateProposalCompetitionCount: proposalCompetitions.length,
    canonicalWriteCandidateProposalProviderFamilyCount: proposalProviderFamilies.length,

    approvedCompetitions,
    approvedProviderFamilies,
    proposalCompetitions,
    proposalProviderFamilies,
    byCompetitionSlug: countBy(validApprovedRows, "competitionSlug"),
    byProviderFamily: countBy(validApprovedRows, "providerFamily"),

    proposalCheckCount: checks.length,
    passedProposalCheckCount,
    blockedProposalCheckCount,
    canonicalWriteCandidateProposalStatus: blockedProposalCheckCount === 0 ? "passed" : "blocked",
    canonicalWriteCandidateProposalBuiltCount: blockedProposalCheckCount === 0 ? 1 : 0,
    mayBuildCanonicalWriteCandidateProposalQualityGateCount: blockedProposalCheckCount === 0 ? 1 : 0,

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
  canonicalWriteCandidateProposalRows
};

fs.writeFileSync(outputPath, `${JSON.stringify(proposal, null, 2)}\n`);

console.log(JSON.stringify({
  output: proposal.output,
  canonicalWriteCandidateProposalStatus: proposal.summary.canonicalWriteCandidateProposalStatus,
  validApprovedPromotionRowCount: proposal.summary.validApprovedPromotionRowCount,
  canonicalWriteCandidateProposalRowCount: proposal.summary.canonicalWriteCandidateProposalRowCount,
  canonicalWriteCandidateProposalCompetitionCount: proposal.summary.canonicalWriteCandidateProposalCompetitionCount,
  canonicalWriteCandidateProposalProviderFamilyCount: proposal.summary.canonicalWriteCandidateProposalProviderFamilyCount,
  mayBuildCanonicalWriteCandidateProposalQualityGateCount: proposal.summary.mayBuildCanonicalWriteCandidateProposalQualityGateCount,
  mayWriteCanonicalNowCount: proposal.summary.mayWriteCanonicalNowCount,
  mayWriteProductionNowCount: proposal.summary.mayWriteProductionNowCount,
  mayAssertTruthNowCount: proposal.summary.mayAssertTruthNowCount
}, null, 2));

if (blockedProposalCheckCount !== 0) {
  process.exitCode = 1;
}
