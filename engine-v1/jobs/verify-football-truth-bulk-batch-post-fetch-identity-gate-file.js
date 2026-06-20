import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const gatePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-post-fetch-identity-gate-${today}`, `bulk-batch-post-fetch-identity-gate-batch-${pad}-${today}.json`);
const gateRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-post-fetch-identity-gate-${today}`, `bulk-batch-post-fetch-identity-gate-batch-${pad}-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-post-fetch-identity-gate-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-post-fetch-identity-gate-batch-${pad}-verification-${today}.json`);

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
const gate = JSON.parse(await fs.readFile(gatePath, "utf8"));
const rows = parseJsonl(await fs.readFile(gateRowsPath, "utf8"));

if (gate.status !== "passed") blocks.push("gate_status_not_passed");
if (gate.runner !== "bulk_batch_post_fetch_identity_gate") blocks.push("runner_mismatch");
if (gate.summary?.dedupedSlugCount !== rows.length) blocks.push("deduped_count_mismatch");
if (gate.summary?.inputCandidateCount < rows.length) blocks.push("input_candidate_count_less_than_rows");
if (gate.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");
if (gate.summary?.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (gate.summary?.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");

const expectedTotal = 24;
if (rows.length !== expectedTotal) blocks.push(`rows_length_not_${expectedTotal}`);

for (const row of rows) {
  if (!["parser_ready", "rendered_or_parser_review", "rejected"].includes(row.identityConfidence)) blocks.push(`bad_identity_confidence_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_${row.slug}`);
  if (row.genericHomepage === true && row.identityConfidence === "parser_ready") blocks.push(`homepage_marked_parser_ready_${row.slug}`);
  if (row.identityConfidence === "parser_ready" && row.parserPlanningAllowedNow !== true) blocks.push(`parser_ready_not_allowed_${row.slug}`);
  if (row.identityConfidence !== "parser_ready" && row.parserPlanningAllowedNow !== false) blocks.push(`non_parser_ready_allows_parser_${row.slug}`);
}

const guardrails = gate.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "lifecycleWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_post_fetch_identity_gate",
  contractVersion: 1,
  batchIndex,
  gatePath: rel(gatePath),
  gateRowsPath: rel(gateRowsPath),
  verificationPath: rel(verificationPath),
  gateSha256: await sha256(gatePath),
  gateRowsSha256: await sha256(gateRowsPath),
  verified: {
    inputCandidateCount: gate.summary.inputCandidateCount,
    dedupedSlugCount: gate.summary.dedupedSlugCount,
    parserReadyCount: gate.summary.parserReadyCount,
    renderedOrParserReviewCount: gate.summary.renderedOrParserReviewCount,
    rejectedCount: gate.summary.rejectedCount,
    parserReadySlugs: gate.summary.parserReadySlugs,
    renderedOrParserReviewSlugs: gate.summary.renderedOrParserReviewSlugs,
    rejectedSlugs: gate.summary.rejectedSlugs,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Post-fetch identity gate is verified. Parser planning is allowed only for non-generic route surfaces; generic homepage/root redirects are downgraded before extraction work.",
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
