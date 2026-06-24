import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const diagnosticPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-html-table-extraction-probe-${today}`, `bulk-batch3-html-table-extraction-probe-${today}.json`);
const diagnosticRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-html-table-extraction-probe-${today}`, `bulk-batch3-html-table-extraction-probe-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-html-table-extraction-probe-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch3-html-table-extraction-probe-verification-${today}.json`);

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
const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, "utf8"));
const rows = parseJsonl(await fs.readFile(diagnosticRowsPath, "utf8"));

if (diagnostic.status !== "passed") blocks.push("diagnostic_not_passed");
if (diagnostic.runner !== "bulk_batch3_html_table_extraction_probe") blocks.push("runner_mismatch");
if (diagnostic.summary?.targetCount !== 8) blocks.push("target_count_not_8");
if (diagnostic.summary?.attemptedFetchCount !== 8) blocks.push("attempted_fetch_count_not_8");
if (rows.length !== 8) blocks.push("rows_not_8");

const statusCounts = diagnostic.summary?.extractionProbeStatusCounts || {};
const countSum = Object.values(statusCounts).reduce((sum, value) => sum + Number(value || 0), 0);
if (countSum !== 8) blocks.push("status_counts_do_not_sum_to_8");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.extractionProbeStatus) blocks.push(`missing_extraction_status_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${row.slug}`);
}

const guardrails = diagnostic.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 8) blocks.push("fetch_executed_not_8");
if (guardrails.controlledHtmlTableExtractionFetchExecutedNowCount !== 8) blocks.push("controlled_fetch_not_8");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_guardrail_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_guardrail_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_guardrail_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_guardrail_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_true");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch3_html_table_extraction_probe",
  contractVersion: 1,
  diagnosticPath: rel(diagnosticPath),
  diagnosticRowsPath: rel(diagnosticRowsPath),
  verificationPath: rel(verificationPath),
  diagnosticSha256: await sha256(diagnosticPath),
  diagnosticRowsSha256: await sha256(diagnosticRowsPath),
  verified: {
    targetCount: diagnostic.summary.targetCount,
    attemptedFetchCount: diagnostic.summary.attemptedFetchCount,
    extractionProbeStatusCounts: diagnostic.summary.extractionProbeStatusCounts,
    proofShapePassedNonzeroSlugs: diagnostic.summary.proofShapePassedNonzeroSlugs,
    proofShapePassedZeroPlayedSlugs: diagnostic.summary.proofShapePassedZeroPlayedSlugs,
    extractionReviewRequiredSlugs: diagnostic.summary.extractionReviewRequiredSlugs,
    noExtractableTableSlugs: diagnostic.summary.noExtractableTableSlugs,
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
  conclusion: "Batch 3 HTML-table extraction factory probe is verified. Results show which of the 8 extraction-ready surfaces actually produced proof-shape standings rows. No canonical/lifecycle/production/truth write was executed.",
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
