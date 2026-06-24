import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-${today}`, `football-truth-global-macro-official-host-wave-plan-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-${today}`, `football-truth-global-macro-official-host-wave-plan-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-global-macro-official-host-wave-plan-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_global_macro_official_host_wave_plan") blocks.push("runner_mismatch");
if (report.summary?.plannedTargetCount !== rows.length) blocks.push("row_count_mismatch");
if (report.summary?.plannedTargetCount !== 303) blocks.push("planned_target_count_not_303");
if (report.summary?.plannedBatchCount !== 4) blocks.push("planned_batch_count_not_4");
if (report.guardrails?.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (report.guardrails?.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (report.guardrails?.localEvidenceReuseAllowed !== false) blocks.push("local_evidence_reuse_not_false");
if (report.guardrails?.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (report.guardrails?.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (report.guardrails?.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (report.guardrails?.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (row.sourceLocalEvidenceReuseAllowed !== false) blocks.push(`local_evidence_reuse_true_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
}

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_global_macro_official_host_wave_plan",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    summary: report.summary,
    executionPolicy: report.executionPolicy,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Global macro official-host wave plan is verified. It plans all 303 remaining no-current slugs into four macro batches, forbids contaminated local-evidence reuse, and performs no fetch/search/write/truth action.",
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
