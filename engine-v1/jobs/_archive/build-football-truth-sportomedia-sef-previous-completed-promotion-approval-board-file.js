import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-diagnostic-proof-${today}`, `sportomedia-sef-previous-completed-diagnostic-proof-${today}.json`);
const verificationPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-output-verification-${today}`, `sportomedia-sef-previous-completed-proof-output-verification-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-promotion-approval-board-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-previous-completed-promotion-approval-board-${today}.json`);
const rowsOutputPath = path.join(outputDir, `sportomedia-sef-previous-completed-promotion-approval-board-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

await fs.mkdir(outputDir, { recursive: true });

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const verification = JSON.parse(await fs.readFile(verificationPath, "utf8"));

const blocks = [];

if (proof.status !== "passed") blocks.push("proof_status_not_passed");
if (proof.runner !== "sportomedia_sef_previous_completed_diagnostic_only_proof") blocks.push("proof_runner_mismatch");
if (proof.summary?.targetSeasonScope !== "previous_completed") blocks.push("proof_scope_not_previous_completed");
if (proof.summary?.targetSeasonLabel !== "2024") blocks.push("proof_season_label_not_2024");
if (proof.summary?.validationPassedRowCount !== 2) blocks.push("proof_validation_passed_count_not_2");
if (proof.summary?.validationFailedRowCount !== 0) blocks.push("proof_validation_failed_count_not_0");
if (proof.summary?.acceptedNowCount !== 0) blocks.push("proof_accepted_now_not_zero");

if (verification.status !== "passed") blocks.push("verification_status_not_passed");
if (verification.mode !== "proof_verification") blocks.push("verification_mode_not_proof_verification");
if (verification.verification?.summary?.passedRowCount !== 2) blocks.push("verification_passed_row_count_not_2");
if (verification.verification?.summary?.failedRowCount !== 0) blocks.push("verification_failed_row_count_not_0");

const proofGuardrails = proof.guardrails || {};
for (const key of ["canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (proofGuardrails[key] !== 0) blocks.push(`proof_guardrail_${key}_not_zero`);
}
if (proofGuardrails.rawPayloadCommitted !== false) blocks.push("proof_raw_payload_committed_not_false");
if (proofGuardrails.fullRawPayloadWritten !== false) blocks.push("proof_full_raw_payload_written_not_false");

const verificationGuardrails = verification.guardrails || {};
for (const key of ["canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (verificationGuardrails[key] !== 0) blocks.push(`verification_guardrail_${key}_not_zero`);
}
if (verificationGuardrails.rawPayloadCommitted !== false) blocks.push("verification_raw_payload_committed_not_false");
if (verificationGuardrails.fullRawPayloadWritten !== false) blocks.push("verification_full_raw_payload_written_not_false");

const rows = (proof.rows || []).map(row => {
  const validation = row.validation || {};
  const metrics = validation.metrics || {};
  const eligibilityBlocks = [];

  if (row.sourceFamily !== "sportomedia_sef") eligibilityBlocks.push("source_family_mismatch");
  if (row.seasonScope !== "previous_completed") eligibilityBlocks.push("season_scope_mismatch");
  if (row.seasonLabel !== "2024") eligibilityBlocks.push("season_label_mismatch");
  if (row.expectedRows !== 16) eligibilityBlocks.push("expected_rows_mismatch");
  if (row.extractedRowCount !== 16) eligibilityBlocks.push("extracted_row_count_mismatch");
  if (validation.validationPassed !== true) eligibilityBlocks.push("row_validation_not_passed");
  if ((metrics.maxPlayed ?? null) !== 30) eligibilityBlocks.push("max_played_mismatch");
  if ((metrics.playedPassCount ?? null) !== 16) eligibilityBlocks.push("played_arithmetic_mismatch");
  if ((metrics.pointsPassCount ?? null) !== 16) eligibilityBlocks.push("points_arithmetic_mismatch");
  if ((metrics.gdPassCount ?? null) !== 16) eligibilityBlocks.push("gd_arithmetic_mismatch");
  if (!Array.isArray(row.teamSignalHits) || row.teamSignalHits.length < 4) eligibilityBlocks.push("team_signal_minimum_mismatch");
  if (row.acceptedNow !== false) eligibilityBlocks.push("accepted_now_not_false");
  if (row.acceptanceAllowedNow !== false) eligibilityBlocks.push("acceptance_allowed_now_not_false");
  if (row.reviewOnly !== true) eligibilityBlocks.push("review_only_not_true");

  return {
    slug: row.slug,
    league: row.league,
    country: row.country,
    sourceFamily: row.sourceFamily,
    seasonScope: row.seasonScope,
    seasonLabel: row.seasonLabel,
    sourceUrl: row.sourceUrl,
    endpoint: validation.endpoint,
    operationName: validation.operationName,
    variables: validation.variables,
    responseSha256: validation.responseSha256,
    expectedRows: row.expectedRows,
    extractedRowCount: row.extractedRowCount,
    maxPlayed: metrics.maxPlayed,
    playedPassCount: metrics.playedPassCount,
    pointsPassCount: metrics.pointsPassCount,
    gdPassCount: metrics.gdPassCount,
    nonTrivialCount: metrics.nonTrivialCount,
    teamSignalHits: row.teamSignalHits,
    promotionEligibilityStatus: eligibilityBlocks.length === 0 ? "eligible_after_explicit_user_approval" : "blocked",
    promotionEligibilityBlocks: eligibilityBlocks,
    explicitUserApprovalRequiredBeforeCanonicalCandidateWrite: true,
    mayWriteCanonicalCandidateNow: false,
    mayWriteLifecycleNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false,
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  };
});

if (rows.length !== 2) blocks.push("promotion_rows_length_not_2");
if (!rows.find(row => row.slug === "swe.1")) blocks.push("missing_swe_1_row");
if (!rows.find(row => row.slug === "swe.2")) blocks.push("missing_swe_2_row");
if (rows.some(row => row.promotionEligibilityStatus !== "eligible_after_explicit_user_approval")) blocks.push("some_rows_not_eligible_after_approval");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "sportomedia_sef_previous_completed_promotion_approval_board",
  contractVersion: 1,
  purpose: "Approval-gate board for promoting verified Sportomedia/SEF previous_completed diagnostic proof to canonical/lifecycle candidate files. This job performs no canonical, lifecycle, production, or truth writes.",
  proofPath: rel(proofPath),
  proofSha256: await sha256(proofPath),
  verificationPath: rel(verificationPath),
  verificationSha256: await sha256(verificationPath),
  output: rel(outputPath),
  rowsOutput: rel(rowsOutputPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  sourceProofSummary: proof.summary,
  sourceVerificationSummary: verification.verification?.summary || null,
  summary: {
    targetCount: rows.length,
    targetSlugs: rows.map(row => row.slug),
    targetSeasonScope: "previous_completed",
    targetSeasonLabel: "2024",
    eligibleAfterExplicitApprovalCount: rows.filter(row => row.promotionEligibilityStatus === "eligible_after_explicit_user_approval").length,
    blockedCount: rows.filter(row => row.promotionEligibilityStatus !== "eligible_after_explicit_user_approval").length,
    canonicalCandidateWriteAllowedNow: false,
    lifecycleWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    explicitUserApprovalRequiredBeforeCanonicalCandidateWrite: true,
    acceptedNowCount: 0,
    recommendedNextLane: "ask for explicit user approval before writing Sportomedia previous_completed canonical/lifecycle candidate files for swe.1 and swe.2"
  },
  rows,
  blocks
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(row => ({
    slug: row.slug,
    league: row.league,
    seasonScope: row.seasonScope,
    seasonLabel: row.seasonLabel,
    extractedRowCount: row.extractedRowCount,
    maxPlayed: row.maxPlayed,
    teamSignalHits: row.teamSignalHits,
    promotionEligibilityStatus: row.promotionEligibilityStatus,
    mayWriteCanonicalCandidateNow: row.mayWriteCanonicalCandidateNow,
    explicitUserApprovalRequiredBeforeCanonicalCandidateWrite: row.explicitUserApprovalRequiredBeforeCanonicalCandidateWrite
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
