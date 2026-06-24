import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-standings-extraction-approval-board-${today}`, `bulk-batch-standings-extraction-approval-board-batch-${pad}-${today}.json`);
const boardRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-standings-extraction-approval-board-${today}`, `bulk-batch-standings-extraction-approval-board-batch-${pad}-rows-${today}.jsonl`);
const proofVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-verification-${today}`, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-standings-extraction-approval-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-standings-extraction-approval-board-batch-${pad}-verification-${today}.json`);

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
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const rows = parseJsonl(await fs.readFile(boardRowsPath, "utf8"));
const proofVerification = JSON.parse(await fs.readFile(proofVerificationPath, "utf8"));

if (proofVerification.status !== "passed") blocks.push("proof_verification_not_passed");
if (board.status !== "passed") blocks.push("board_not_passed");
if (board.runner !== "bulk_batch_standings_extraction_approval_board") blocks.push("runner_mismatch");
if (rows.length !== 3) blocks.push("row_count_not_3");
if (board.summary?.eligibleAfterExplicitApprovalCount !== 1) blocks.push("eligible_count_not_1");
if (board.summary?.blockedCount !== 2) blocks.push("blocked_count_not_2");
if (JSON.stringify([...(board.summary?.eligibleAfterExplicitApprovalSlugs || [])].sort()) !== JSON.stringify(["ksa.1"])) blocks.push("eligible_slug_set_mismatch");
if (JSON.stringify([...(board.summary?.blockedSlugs || [])].sort()) !== JSON.stringify(["aut.2", "jpn.2"])) blocks.push("blocked_slug_set_mismatch");
if (board.summary?.explicitUserApprovalRequiredBeforeCandidateWrite !== true) blocks.push("approval_required_not_true");
if (board.summary?.canonicalCandidateWriteAllowedNow !== false) blocks.push("canonical_write_allowed_now");
if (board.summary?.lifecycleCandidateWriteAllowedNow !== false) blocks.push("lifecycle_write_allowed_now");
if (board.summary?.productionWriteAllowedNow !== false) blocks.push("production_write_allowed_now");
if (board.summary?.truthAssertionAllowedNow !== false) blocks.push("truth_assertion_allowed_now");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

const bySlug = Object.fromEntries(rows.map(row => [row.slug, row]));

if (bySlug["ksa.1"]?.reviewOnlyCandidateEligibleAfterExplicitApproval !== true) blocks.push("ksa_not_eligible");
if (bySlug["ksa.1"]?.seasonLabel !== "2025/26") blocks.push("ksa_season_label_bad");
if (bySlug["ksa.1"]?.seasonScope !== "previous_completed_or_recent_completed") blocks.push("ksa_season_scope_bad");
if ((bySlug["ksa.1"]?.reviewOnlyCandidateBlocks || []).length !== 0) blocks.push("ksa_has_blocks");

if (bySlug["aut.2"]?.requiredNextLane !== "season_identity_lifecycle_review") blocks.push("aut2_next_lane_bad");
if (!(bySlug["aut.2"]?.reviewOnlyCandidateBlocks || []).includes("season_label_not_explicit_in_title_or_url")) blocks.push("aut2_missing_season_label_block");

if (bySlug["jpn.2"]?.requiredNextLane !== "start_date_lifecycle_lane") blocks.push("jpn2_next_lane_bad");
if (!(bySlug["jpn.2"]?.reviewOnlyCandidateBlocks || []).includes("zero_played_requires_start_date_lifecycle_lane")) blocks.push("jpn2_missing_zero_played_block");

for (const row of rows) {
  if (row.canonicalCandidateWriteAllowedNow !== false) blocks.push(`canonical_allowed_${row.slug}`);
  if (row.lifecycleCandidateWriteAllowedNow !== false) blocks.push(`lifecycle_allowed_${row.slug}`);
  if (row.productionWriteAllowedNow !== false) blocks.push(`production_allowed_${row.slug}`);
  if (row.truthAssertionAllowedNow !== false) blocks.push(`truth_allowed_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${row.slug}`);
}

const guardrails = board.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "lifecycleWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_standings_extraction_approval_board",
  contractVersion: 1,
  batchIndex,
  boardPath: rel(boardPath),
  boardRowsPath: rel(boardRowsPath),
  proofVerificationPath: rel(proofVerificationPath),
  verificationPath: rel(verificationPath),
  boardSha256: await sha256(boardPath),
  boardRowsSha256: await sha256(boardRowsPath),
  proofVerificationSha256: await sha256(proofVerificationPath),
  verified: {
    batchIndex,
    boardRowCount: board.summary.boardRowCount,
    eligibleAfterExplicitApprovalCount: board.summary.eligibleAfterExplicitApprovalCount,
    blockedCount: board.summary.blockedCount,
    eligibleAfterExplicitApprovalSlugs: board.summary.eligibleAfterExplicitApprovalSlugs,
    blockedSlugs: board.summary.blockedSlugs,
    requiredNextLaneBySlug: board.summary.requiredNextLaneBySlug,
    blocksBySlug: board.summary.blocksBySlug,
    explicitUserApprovalRequiredBeforeCandidateWrite: board.summary.explicitUserApprovalRequiredBeforeCandidateWrite,
    canonicalCandidateWriteAllowedNow: board.summary.canonicalCandidateWriteAllowedNow,
    lifecycleCandidateWriteAllowedNow: board.summary.lifecycleCandidateWriteAllowedNow,
    productionWriteAllowedNow: board.summary.productionWriteAllowedNow,
    truthAssertionAllowedNow: board.summary.truthAssertionAllowedNow,
    acceptedNowCount: board.summary.acceptedNowCount,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Bulk batch 1 standings extraction approval board is verified. Only ksa.1 is eligible for review-only candidate write after explicit user approval. aut.2 is blocked pending season/lifecycle identity review, and jpn.2 is blocked pending start-date lifecycle handling. No write or truth assertion was executed.",
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
