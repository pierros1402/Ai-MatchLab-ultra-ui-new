import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-${today}`, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-${today}.json`);
const proofRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-${today}`, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-rows-${today}.jsonl`);
const identityGateVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-identity-gate-verification-${today}`, `bulk-batch-html-table-identity-gate-batch-${pad}-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-verification-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofRows = parseJsonl(await fs.readFile(proofRowsPath, "utf8"));
const identityGateVerification = JSON.parse(await fs.readFile(identityGateVerificationPath, "utf8"));

const expectedNonzero = ["aut.2", "ksa.1"].sort();
const expectedZero = ["jpn.2"].sort();
const expectedFailed = [];
const expectedRowCounts = { "aut.2": 16, "jpn.2": 20, "ksa.1": 18 };

if (identityGateVerification.status !== "passed") blocks.push("identity_gate_verification_not_passed");
if (proof.status !== "passed") blocks.push("proof_status_not_passed");
if (proof.runner !== "bulk_batch_generic_standings_extraction_proof") blocks.push("runner_mismatch");
if (proof.batchIndex !== 1) blocks.push("batch_index_not_1");
if (proof.summary?.targetCount !== 3) blocks.push("target_count_not_3");
if (proof.summary?.attemptedFetchCount !== 3) blocks.push("attempted_fetch_count_not_3");
if (proof.summary?.proofPassedNonzeroCount !== 2) blocks.push("nonzero_count_not_2");
if (proof.summary?.proofPassedZeroPlayedCount !== 1) blocks.push("zero_played_count_not_1");
if (proof.summary?.proofFailedCount !== 0) blocks.push("proof_failed_count_not_0");
if (proof.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");
if (proof.summary?.productionWriteAllowedNow !== false) blocks.push("production_write_allowed");
if (proof.summary?.truthAssertionAllowedNow !== false) blocks.push("truth_assertion_allowed");
if (proofRows.length !== 3) blocks.push("proof_rows_not_3");

const actualNonzero = [...(proof.summary?.proofPassedNonzeroSlugs || [])].sort();
const actualZero = [...(proof.summary?.proofPassedZeroPlayedSlugs || [])].sort();
const actualFailed = [...(proof.summary?.proofFailedSlugs || [])].sort();

if (JSON.stringify(actualNonzero) !== JSON.stringify(expectedNonzero)) blocks.push("nonzero_slug_set_mismatch");
if (JSON.stringify(actualZero) !== JSON.stringify(expectedZero)) blocks.push("zero_played_slug_set_mismatch");
if (JSON.stringify(actualFailed) !== JSON.stringify(expectedFailed)) blocks.push("failed_slug_set_mismatch");

for (const row of proofRows) {
  if (!expectedRowCounts[row.slug]) blocks.push(`unexpected_slug_${row.slug}`);
  if (row.extractedStandingRowCount !== expectedRowCounts[row.slug]) blocks.push(`row_count_bad_${row.slug}`);
  if (row.expectedStandingRowCount !== expectedRowCounts[row.slug]) blocks.push(`expected_row_count_bad_${row.slug}`);
  if (row.arithmeticFailedRowCount !== 0) blocks.push(`arithmetic_failed_${row.slug}`);
  if (row.duplicateTeamNameCount !== 0) blocks.push(`duplicate_teams_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);
  if (row.rawPayloadWritten !== false) blocks.push(`raw_payload_written_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
  if (!(row.fetchStatus >= 200 && row.fetchStatus < 400)) blocks.push(`fetch_status_bad_${row.slug}`);
  if (!(row.bodyLength >= 500)) blocks.push(`body_too_short_${row.slug}`);
  if (!Array.isArray(row.standingsRows) || row.standingsRows.length !== expectedRowCounts[row.slug]) blocks.push(`standings_rows_bad_${row.slug}`);

  for (const standingRow of row.standingsRows || []) {
    if (standingRow.arithmeticPassed !== true) blocks.push(`standing_arithmetic_bad_${row.slug}_${standingRow.position}`);
    if (standingRow.played !== standingRow.wins + standingRow.draws + standingRow.losses) blocks.push(`wdl_bad_${row.slug}_${standingRow.position}`);
    if (standingRow.goalDifference !== standingRow.goalsFor - standingRow.goalsAgainst) blocks.push(`gd_bad_${row.slug}_${standingRow.position}`);
  }

  if (expectedNonzero.includes(row.slug)) {
    if (row.extractionProofStatus !== "proof_passed_nonzero_standings") blocks.push(`nonzero_status_bad_${row.slug}`);
    if ((row.validationBlocks || []).length !== 0) blocks.push(`nonzero_has_validation_blocks_${row.slug}`);
    if (!(row.maxPlayed > 0)) blocks.push(`nonzero_max_played_not_positive_${row.slug}`);
  }

  if (expectedZero.includes(row.slug)) {
    if (row.extractionProofStatus !== "proof_passed_zero_played_table_needs_start_date_lane") blocks.push(`zero_status_bad_${row.slug}`);
    if (!Array.isArray(row.validationBlocks) || !row.validationBlocks.includes("all_rows_zero_played_preseason_or_not_started")) blocks.push(`zero_missing_lifecycle_block_${row.slug}`);
    if (row.allRowsZeroPlayed !== true) blocks.push(`zero_all_rows_flag_bad_${row.slug}`);
    if (row.minPlayed !== 0 || row.maxPlayed !== 0) blocks.push(`zero_played_bounds_bad_${row.slug}`);
  }
}

const guardrails = proof.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 3) blocks.push("fetch_executed_not_3");
if (guardrails.controlledExtractionProofFetchExecutedNowCount !== 3) blocks.push("controlled_extraction_fetch_not_3");
if (guardrails.providerFetchExecutedNowCount !== 0) blocks.push("provider_fetch_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_generic_standings_extraction_proof",
  contractVersion: 1,
  batchIndex,
  proofPath: rel(proofPath),
  proofRowsPath: rel(proofRowsPath),
  identityGateVerificationPath: rel(identityGateVerificationPath),
  verificationPath: rel(verificationPath),
  proofSha256: await sha256(proofPath),
  proofRowsSha256: await sha256(proofRowsPath),
  identityGateVerificationSha256: await sha256(identityGateVerificationPath),
  verified: {
    batchIndex,
    targetCount: proof.summary.targetCount,
    attemptedFetchCount: proof.summary.attemptedFetchCount,
    proofPassedNonzeroCount: proof.summary.proofPassedNonzeroCount,
    proofPassedZeroPlayedCount: proof.summary.proofPassedZeroPlayedCount,
    proofFailedCount: proof.summary.proofFailedCount,
    proofPassedNonzeroSlugs: proof.summary.proofPassedNonzeroSlugs,
    proofPassedZeroPlayedSlugs: proof.summary.proofPassedZeroPlayedSlugs,
    proofFailedSlugs: proof.summary.proofFailedSlugs,
    extractedRowsBySlug: proof.summary.extractedRowsBySlug,
    validationBlocksBySlug: proof.summary.validationBlocksBySlug,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    searchExecutedNowCount: guardrails.searchExecutedNowCount,
    canonicalWriteExecutedNowCount: guardrails.canonicalWriteExecutedNowCount,
    lifecycleWriteExecutedNowCount: guardrails.lifecycleWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Bulk batch 1 generic standings extraction proof is verified. aut.2 and ksa.1 passed nonzero standings extraction with arithmetic checks; jpn.2 has a valid zero-played standings table and must enter the start-date/lifecycle lane before any candidate acceptance. No canonical, lifecycle, production, truth, or raw-payload write was executed.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: verification.status,
  verificationPath: verification.verificationPath,
  verified: verification.verified,
  conclusion: verification.conclusion,
  blocks: verification.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
