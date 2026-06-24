import fs from "node:fs";
import path from "node:path";

const smokeRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-smoke-runner-2026-06-15",
  "controlled-real-acquisition-smoke-runner-2026-06-15.json"
);

const verificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-real-acquisition-smoke-runner-verification-2026-06-15",
  "controlled-real-acquisition-smoke-runner-verification-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "accepted-evidence-promotion-measurement-board-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "accepted-evidence-promotion-measurement-board-2026-06-15.json"
);

const expectedCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];
const expectedProviderFamilies = ["laliga", "norway_ntf", "sportomedia"];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function toBoardRow(row, index) {
  return {
    acceptedEvidencePromotionMeasurementBoardRowId: `accepted_evidence_promotion_measurement_board_${String(index + 1).padStart(2, "0")}`,
    sourceAcceptedEvidenceRowId: row.controlledRealAcquisitionAcceptedEvidenceRowId,
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    attemptKind: row.attemptKind,
    evidenceStatus: row.evidenceStatus,
    acceptedEvidenceKind: row.acceptedEvidenceKind,
    statusCode: row.statusCode,
    contentType: row.contentType,
    bodyCharCount: row.bodyCharCount,
    clippedBodyCharCount: row.clippedBodyCharCount,
    bodySha256: row.bodySha256,
    url: row.url,
    finalUrl: row.finalUrl,
    markerHits: Array.isArray(row.markerHits) ? row.markerHits : [],
    standingsOrSeasonStateDeltaCandidate: row.standingsOrSeasonStateDeltaCandidate === true,
    canonicalWriteCandidateOnly: row.canonicalWriteCandidateOnly === true,
    canonicalWriteExecutedNow: row.canonicalWriteExecutedNow === true,
    productionWriteExecutedNow: row.productionWriteExecutedNow === true,
    truthAssertionExecutedNow: row.truthAssertionExecutedNow === true,
    promotionMeasurementStatus: "measured_candidate_only",
    promotionWriteApprovalStatus: "blocked_pending_explicit_write_approval",
    canonicalWriteDecision: "not_written_measurement_only",
    truthAssertionDecision: "not_asserted_measurement_only"
  };
}

function assertEqual(name, actual, expected, checks) {
  const passed = Object.is(actual, expected);
  checks.push({ name, actual, expected, passed });
}

function assertArrayEqual(name, actual, expected, checks) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  const passed = actualJson === expectedJson;
  checks.push({ name, actual, expected, passed });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(smokeRunnerPath)) {
  throw new Error(`Missing smoke runner diagnostic: ${smokeRunnerPath}`);
}

if (!fs.existsSync(verificationPath)) {
  throw new Error(`Missing smoke runner verification diagnostic: ${verificationPath}`);
}

const smokeRunner = readJson(smokeRunnerPath);
const verification = readJson(verificationPath);
const sourceSummary = smokeRunner.summary && typeof smokeRunner.summary === "object" ? smokeRunner.summary : smokeRunner;
const acceptedEvidenceRows = Array.isArray(smokeRunner.acceptedEvidenceRows) ? smokeRunner.acceptedEvidenceRows : [];
const evidenceAttemptRows = Array.isArray(smokeRunner.evidenceAttemptRows) ? smokeRunner.evidenceAttemptRows : [];

const promotionMeasurementRows = acceptedEvidenceRows.map(toBoardRow);

const acceptedControlledRealEvidenceRows = promotionMeasurementRows.filter(
  (row) => row.evidenceStatus === "accepted_controlled_real_evidence"
);

const standingsOrSeasonStateDeltaCandidateRows = promotionMeasurementRows.filter(
  (row) => row.standingsOrSeasonStateDeltaCandidate === true
);

const canonicalWriteCandidateOnlyRows = promotionMeasurementRows.filter(
  (row) => row.canonicalWriteCandidateOnly === true
);

const canonicalWriteExecutedRows = promotionMeasurementRows.filter(
  (row) => row.canonicalWriteExecutedNow === true
);

const productionWriteExecutedRows = promotionMeasurementRows.filter(
  (row) => row.productionWriteExecutedNow === true
);

const truthAssertionExecutedRows = promotionMeasurementRows.filter(
  (row) => row.truthAssertionExecutedNow === true
);

const statusCode200Rows = promotionMeasurementRows.filter((row) => row.statusCode === 200);

const measuredCompetitions = uniqueSorted(promotionMeasurementRows.map((row) => row.competitionSlug));
const measuredProviderFamilies = uniqueSorted(promotionMeasurementRows.map((row) => row.providerFamily));

const checks = [];
assertEqual("verificationStatus", verification.verificationStatus, "passed", checks);
assertEqual("controlledRealAcquisitionSmokeRunnerVerifiedCount", verification.controlledRealAcquisitionSmokeRunnerVerifiedCount, 1, checks);
assertEqual("mayBuildAcceptedEvidencePromotionMeasurementBoardCount", verification.mayBuildAcceptedEvidencePromotionMeasurementBoardCount, 1, checks);

assertEqual("acceptedEvidenceRowCount", acceptedEvidenceRows.length, 12, checks);
assertEqual("evidenceAttemptRowCount", evidenceAttemptRows.length, 12, checks);
assertEqual("promotionMeasurementRowCount", promotionMeasurementRows.length, 12, checks);
assertEqual("acceptedControlledRealEvidenceRowCount", acceptedControlledRealEvidenceRows.length, 12, checks);
assertEqual("statusCode200RowCount", statusCode200Rows.length, 12, checks);
assertEqual("standingsOrSeasonStateDeltaCandidateRowCount", standingsOrSeasonStateDeltaCandidateRows.length, 12, checks);
assertEqual("canonicalWriteCandidateOnlyRowCount", canonicalWriteCandidateOnlyRows.length, 12, checks);

assertArrayEqual("measuredCompetitions", measuredCompetitions, expectedCompetitions, checks);
assertArrayEqual("measuredProviderFamilies", measuredProviderFamilies, expectedProviderFamilies, checks);

assertEqual("canonicalWriteExecutedRowCount", canonicalWriteExecutedRows.length, 0, checks);
assertEqual("productionWriteExecutedRowCount", productionWriteExecutedRows.length, 0, checks);
assertEqual("truthAssertionExecutedRowCount", truthAssertionExecutedRows.length, 0, checks);
assertEqual("summaryCanonicalWriteExecutedNowCount", Number(sourceSummary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("summaryProductionWriteExecutedNowCount", Number(sourceSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("summaryTruthAssertionExecutedNowCount", Number(sourceSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("summaryCanonicalWrites", Number(sourceSummary.canonicalWrites ?? smokeRunner.canonicalWrites ?? 0), 0, checks);
assertEqual("summaryProductionWrite", Boolean(sourceSummary.productionWrite ?? smokeRunner.productionWrite), false, checks);

const blockedMeasurementCheckCount = checks.filter((check) => !check.passed).length;
const passedMeasurementCheckCount = checks.filter((check) => check.passed).length;

const board = {
  output: outputPath,
  job: "build-football-truth-accepted-evidence-promotion-measurement-board-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    smokeRunnerPath,
    verificationPath
  },
  policy: {
    measurementOnly: true,
    evidenceCandidatesSeparatedFromCanonicalWrites: true,
    fetchAllowed: false,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    acceptedEvidencePromotionMeasurementBoardReadCount: 2,
    verificationStatus: verification.verificationStatus,
    controlledRealAcquisitionSmokeRunnerVerifiedCount: verification.controlledRealAcquisitionSmokeRunnerVerifiedCount,
    mayBuildAcceptedEvidencePromotionMeasurementBoardCount: verification.mayBuildAcceptedEvidencePromotionMeasurementBoardCount,

    acceptedEvidenceRowCount: acceptedEvidenceRows.length,
    evidenceAttemptRowCount: evidenceAttemptRows.length,
    promotionMeasurementRowCount: promotionMeasurementRows.length,
    acceptedControlledRealEvidenceRowCount: acceptedControlledRealEvidenceRows.length,
    statusCode200RowCount: statusCode200Rows.length,

    standingsOrSeasonStateDeltaCandidateRowCount: standingsOrSeasonStateDeltaCandidateRows.length,
    canonicalWriteCandidateOnlyRowCount: canonicalWriteCandidateOnlyRows.length,

    measuredCompetitionCount: measuredCompetitions.length,
    measuredProviderFamilyCount: measuredProviderFamilies.length,
    measuredCompetitions,
    measuredProviderFamilies,

    byCompetitionSlug: countBy(promotionMeasurementRows, "competitionSlug"),
    byProviderFamily: countBy(promotionMeasurementRows, "providerFamily"),
    byAttemptKind: countBy(promotionMeasurementRows, "attemptKind"),
    byAcceptedEvidenceKind: countBy(promotionMeasurementRows, "acceptedEvidenceKind"),

    fetchExecutedNowCount: Number(sourceSummary.fetchExecutedNowCount ?? 0),
    searchExecutedNowCount: Number(sourceSummary.searchExecutedNowCount ?? 0),
    broadSearchExecutedNowCount: Number(sourceSummary.broadSearchExecutedNowCount ?? 0),
    classifierExecutedNowCount: Number(sourceSummary.classifierExecutedNowCount ?? 0),
    canonicalWriteExecutedNowCount: Number(sourceSummary.canonicalWriteExecutedNowCount ?? 0),
    productionWriteExecutedNowCount: Number(sourceSummary.productionWriteExecutedNowCount ?? 0),
    truthAssertionExecutedNowCount: Number(sourceSummary.truthAssertionExecutedNowCount ?? 0),
    canonicalWrites: Number(sourceSummary.canonicalWrites ?? smokeRunner.canonicalWrites ?? 0),
    productionWrite: Boolean(sourceSummary.productionWrite ?? smokeRunner.productionWrite),

    canonicalWriteExecutedRowCount: canonicalWriteExecutedRows.length,
    productionWriteExecutedRowCount: productionWriteExecutedRows.length,
    truthAssertionExecutedRowCount: truthAssertionExecutedRows.length,

    measurementCheckCount: checks.length,
    passedMeasurementCheckCount,
    blockedMeasurementCheckCount,
    acceptedEvidencePromotionMeasurementBoardStatus: blockedMeasurementCheckCount === 0 ? "passed" : "blocked",
    acceptedEvidencePromotionMeasurementBoardBuiltCount: blockedMeasurementCheckCount === 0 ? 1 : 0,
    mayBuildAcceptedEvidencePromotionApprovalGateCount: blockedMeasurementCheckCount === 0 ? 1 : 0,
    mayWriteCanonicalNowCount: 0,
    mayWriteProductionNowCount: 0,
    mayAssertTruthNowCount: 0
  },
  checks,
  promotionMeasurementRows
};

fs.writeFileSync(outputPath, `${JSON.stringify(board, null, 2)}\n`);

console.log(JSON.stringify({
  output: board.output,
  acceptedEvidencePromotionMeasurementBoardStatus: board.summary.acceptedEvidencePromotionMeasurementBoardStatus,
  promotionMeasurementRowCount: board.summary.promotionMeasurementRowCount,
  acceptedControlledRealEvidenceRowCount: board.summary.acceptedControlledRealEvidenceRowCount,
  standingsOrSeasonStateDeltaCandidateRowCount: board.summary.standingsOrSeasonStateDeltaCandidateRowCount,
  canonicalWriteCandidateOnlyRowCount: board.summary.canonicalWriteCandidateOnlyRowCount,
  canonicalWriteExecutedNowCount: board.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: board.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: board.summary.truthAssertionExecutedNowCount,
  mayBuildAcceptedEvidencePromotionApprovalGateCount: board.summary.mayBuildAcceptedEvidencePromotionApprovalGateCount
}, null, 2));

if (blockedMeasurementCheckCount !== 0) {
  process.exitCode = 1;
}
