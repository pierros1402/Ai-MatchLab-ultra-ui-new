import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const auditPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-${today}`, `football-truth-global-batch001-strict-precision-audit-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-${today}`, `football-truth-global-batch001-strict-precision-audit-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-global-batch001-strict-precision-audit-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const audit = JSON.parse(await fs.readFile(auditPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (audit.status !== "passed") blocks.push("audit_not_passed");
if (audit.runner !== "global_batch001_strict_precision_audit") blocks.push("runner_mismatch");
if (audit.summary?.targetCount !== 80) blocks.push("target_count_not_80");
if (rows.length !== 80) blocks.push("rows_not_80");
if (audit.summary?.inputInflatedPassCount !== 74) blocks.push("input_inflated_pass_count_not_74");
if (audit.summary?.falsePositiveInflationDetected !== true) blocks.push("false_positive_inflation_not_detected");
if ((audit.summary?.strictAcceptedForNextGateCount || 999) >= 74) blocks.push("strict_acceptance_did_not_reduce_inflated_passes");
if ((audit.summary?.strictRejectedOrReviewCount || 0) < 40) blocks.push("strict_rejected_or_review_too_low");
if (!audit.summary?.topSelectedHostFrequency?.["the-aiff.com"] || audit.summary.topSelectedHostFrequency["the-aiff.com"] < 20) blocks.push("aiff_contamination_not_detected");

const guardrails = audit.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.routeClaimMadeNowCount !== 0) blocks.push("route_claim_not_zero");
if (guardrails.familyClaimMadeNowCount !== 0) blocks.push("family_claim_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.strictPrecisionLane) blocks.push(`missing_strict_lane_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.routeClaimMadeNow !== false) blocks.push(`route_claim_true_${row.slug}`);
  if (row.familyClaimMadeNow !== false) blocks.push(`family_claim_true_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
}

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_global_batch001_strict_precision_audit",
  contractVersion: 1,
  auditPath: rel(auditPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  auditSha256: await sha256(auditPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    targetCount: audit.summary.targetCount,
    inputInflatedPassCount: audit.summary.inputInflatedPassCount,
    strictAcceptedForNextGateCount: audit.summary.strictAcceptedForNextGateCount,
    strictRejectedOrReviewCount: audit.summary.strictRejectedOrReviewCount,
    strictLaneCounts: audit.summary.strictLaneCounts,
    strictAcceptedSlugs: audit.summary.strictAcceptedSlugs,
    topSelectedHostFrequency: audit.summary.topSelectedHostFrequency,
    falsePositiveInflationDetected: audit.summary.falsePositiveInflationDetected,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Strict precision audit is verified. It downgrades the inflated batch001 local-evidence passes by applying official-host, country, contaminant-host, non-official media, fetch-status, and league-level checks. No fetch/search/write/truth action was executed.",
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
