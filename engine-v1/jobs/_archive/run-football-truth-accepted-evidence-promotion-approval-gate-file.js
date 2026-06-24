import fs from "node:fs";
import path from "node:path";

const sourceBoardPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "accepted-evidence-promotion-measurement-board-2026-06-15",
  "accepted-evidence-promotion-measurement-board-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "accepted-evidence-promotion-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "accepted-evidence-promotion-approval-gate-2026-06-15.json"
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

function approvedRow(row, index) {
  return {
    acceptedEvidencePromotionApprovalGateRowId: `accepted_evidence_promotion_approval_gate_${String(index + 1).padStart(2, "0")}`,
    sourcePromotionMeasurementBoardRowId: row.acceptedEvidencePromotionMeasurementBoardRowId,
    sourceAcceptedEvidenceRowId: row.sourceAcceptedEvidenceRowId,
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    attemptKind: row.attemptKind,
    evidenceStatus: row.evidenceStatus,
    acceptedEvidenceKind: row.acceptedEvidenceKind,
    statusCode: row.statusCode,
    bodySha256: row.bodySha256,
    url: row.url,
    finalUrl: row.finalUrl,
    markerHits: Array.isArray(row.markerHits) ? row.markerHits : [],
    standingsOrSeasonStateDeltaCandidate: row.standingsOrSeasonStateDeltaCandidate === true,
    canonicalWriteCandidateOnly: row.canonicalWriteCandidateOnly === true,
    approvalGateStatus: "approved_for_no_write_promotion_planning_only",
    nextAllowedAction: "build_canonical_write_candidate_proposal_without_writes",
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false
  };
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourceBoardPath)) {
  throw new Error(`Missing accepted evidence promotion measurement board: ${sourceBoardPath}`);
}

const sourceBoard = readJson(sourceBoardPath);
const sourceSummary = sourceBoard.summary && typeof sourceBoard.summary === "object" ? sourceBoard.summary : {};
const promotionMeasurementRows = Array.isArray(sourceBoard.promotionMeasurementRows) ? sourceBoard.promotionMeasurementRows : [];

const measuredCompetitions = uniqueSorted(promotionMeasurementRows.map((row) => row.competitionSlug));
const measuredProviderFamilies = uniqueSorted(promotionMeasurementRows.map((row) => row.providerFamily));

const approvedPromotionRows = promotionMeasurementRows
  .filter((row) => row.evidenceStatus === "accepted_controlled_real_evidence")
  .filter((row) => row.standingsOrSeasonStateDeltaCandidate === true)
  .filter((row) => row.canonicalWriteCandidateOnly === true)
  .filter((row) => row.canonicalWriteExecutedNow !== true)
  .filter((row) => row.productionWriteExecutedNow !== true)
  .filter((row) => row.truthAssertionExecutedNow !== true)
  .map(approvedRow);

const checks = [];

assertEqual("sourceBoardStatus", sourceSummary.acceptedEvidencePromotionMeasurementBoardStatus, "passed", checks);
assertEqual("sourceBoardBuiltCount", sourceSummary.acceptedEvidencePromotionMeasurementBoardBuiltCount, 1, checks);
assertEqual("sourceMayBuildAcceptedEvidencePromotionApprovalGateCount", sourceSummary.mayBuildAcceptedEvidencePromotionApprovalGateCount, 1, checks);

assertEqual("promotionMeasurementRowCount", promotionMeasurementRows.length, 12, checks);
assertEqual("approvedPromotionRowCount", approvedPromotionRows.length, 12, checks);
assertEqual("sourceAcceptedControlledRealEvidenceRowCount", Number(sourceSummary.acceptedControlledRealEvidenceRowCount ?? 0), 12, checks);
assertEqual("sourceStandingsOrSeasonStateDeltaCandidateRowCount", Number(sourceSummary.standingsOrSeasonStateDeltaCandidateRowCount ?? 0), 12, checks);
assertEqual("sourceCanonicalWriteCandidateOnlyRowCount", Number(sourceSummary.canonicalWriteCandidateOnlyRowCount ?? 0), 12, checks);

assertArrayEqual("approvedCompetitions", uniqueSorted(approvedPromotionRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertArrayEqual("approvedProviderFamilies", uniqueSorted(approvedPromotionRows.map((row) => row.providerFamily)), expectedProviderFamilies, checks);
assertArrayEqual("measuredCompetitions", measuredCompetitions, expectedCompetitions, checks);
assertArrayEqual("measuredProviderFamilies", measuredProviderFamilies, expectedProviderFamilies, checks);

assertEqual("sourceCanonicalWriteExecutedNowCount", Number(sourceSummary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(sourceSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(sourceSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedRowCount", Number(sourceSummary.canonicalWriteExecutedRowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedRowCount", Number(sourceSummary.productionWriteExecutedRowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedRowCount", Number(sourceSummary.truthAssertionExecutedRowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWrites", Number(sourceSummary.canonicalWrites ?? 0), 0, checks);
assertEqual("sourceProductionWrite", Boolean(sourceSummary.productionWrite), false, checks);

const blockedApprovalCheckCount = checks.filter((check) => !check.passed).length;
const passedApprovalCheckCount = checks.filter((check) => check.passed).length;

const gate = {
  output: outputPath,
  job: "run-football-truth-accepted-evidence-promotion-approval-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    sourceBoardPath
  },
  policy: {
    approvalGateOnly: true,
    approvedScope: "no_write_promotion_planning_only",
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    acceptedEvidencePromotionApprovalGateReadCount: 1,
    sourceBoardStatus: sourceSummary.acceptedEvidencePromotionMeasurementBoardStatus,
    sourceBoardBuiltCount: Number(sourceSummary.acceptedEvidencePromotionMeasurementBoardBuiltCount ?? 0),
    sourceMayBuildAcceptedEvidencePromotionApprovalGateCount: Number(sourceSummary.mayBuildAcceptedEvidencePromotionApprovalGateCount ?? 0),

    sourcePromotionMeasurementRowCount: promotionMeasurementRows.length,
    approvedPromotionRowCount: approvedPromotionRows.length,
    approvedPromotionCompetitionCount: uniqueSorted(approvedPromotionRows.map((row) => row.competitionSlug)).length,
    approvedPromotionProviderFamilyCount: uniqueSorted(approvedPromotionRows.map((row) => row.providerFamily)).length,

    approvedCompetitions: uniqueSorted(approvedPromotionRows.map((row) => row.competitionSlug)),
    approvedProviderFamilies: uniqueSorted(approvedPromotionRows.map((row) => row.providerFamily)),
    byCompetitionSlug: countBy(approvedPromotionRows, "competitionSlug"),
    byProviderFamily: countBy(approvedPromotionRows, "providerFamily"),
    byAttemptKind: countBy(approvedPromotionRows, "attemptKind"),

    approvalCheckCount: checks.length,
    passedApprovalCheckCount,
    blockedApprovalCheckCount,
    acceptedEvidencePromotionApprovalGateStatus: blockedApprovalCheckCount === 0 ? "passed" : "blocked",
    acceptedEvidencePromotionApprovalGatePassedCount: blockedApprovalCheckCount === 0 ? 1 : 0,

    mayBuildCanonicalWriteCandidateProposalCount: blockedApprovalCheckCount === 0 ? 1 : 0,
    mayRunNoWritePromotionPlanningCount: blockedApprovalCheckCount === 0 ? 1 : 0,

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
  approvedPromotionRows
};

fs.writeFileSync(outputPath, `${JSON.stringify(gate, null, 2)}\n`);

console.log(JSON.stringify({
  output: gate.output,
  acceptedEvidencePromotionApprovalGateStatus: gate.summary.acceptedEvidencePromotionApprovalGateStatus,
  approvedPromotionRowCount: gate.summary.approvedPromotionRowCount,
  approvedPromotionCompetitionCount: gate.summary.approvedPromotionCompetitionCount,
  approvedPromotionProviderFamilyCount: gate.summary.approvedPromotionProviderFamilyCount,
  mayBuildCanonicalWriteCandidateProposalCount: gate.summary.mayBuildCanonicalWriteCandidateProposalCount,
  mayRunNoWritePromotionPlanningCount: gate.summary.mayRunNoWritePromotionPlanningCount,
  mayWriteCanonicalNowCount: gate.summary.mayWriteCanonicalNowCount,
  mayWriteProductionNowCount: gate.summary.mayWriteProductionNowCount,
  mayAssertTruthNowCount: gate.summary.mayAssertTruthNowCount
}, null, 2));

if (blockedApprovalCheckCount !== 0) {
  process.exitCode = 1;
}
