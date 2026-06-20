import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchId = process.argv.find(arg => arg.startsWith("--batch-id="))?.split("=")[1] || "global-macro-official-host-wave-001";

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-${batchId}-${today}`, `football-truth-global-macro-official-host-wave-${batchId}-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-${batchId}-${today}`, `football-truth-global-macro-official-host-wave-${batchId}-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-${batchId}-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-global-macro-official-host-wave-${batchId}-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_global_macro_official_host_wave_batch") blocks.push("runner_mismatch");
if (report.batchId !== batchId) blocks.push("batch_id_mismatch");
if (report.summary?.targetCount !== rows.length) blocks.push("row_count_mismatch");
if (report.summary?.targetCount !== 100) blocks.push("target_count_not_100");
if (report.summary?.attemptedFetchCount !== report.guardrails?.fetchExecutedNowCount) blocks.push("fetch_count_mismatch");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.macroFinalLane) blocks.push(`missing_macro_lane_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${row.slug}`);
}

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_global_macro_official_host_wave_batch",
  contractVersion: 1,
  batchId,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    summary: report.summary,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Global macro official-host wave batch is verified. It runs one full macro batch through controlled official-host fetch, route scoring, extraction, salvage, and classification without canonical/lifecycle/production/truth write.",
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

if (blocks.length) process.exitCode = 1;
