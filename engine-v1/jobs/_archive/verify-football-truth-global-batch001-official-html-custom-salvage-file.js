import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-custom-salvage-${today}`, `football-truth-global-batch001-official-html-custom-salvage-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-custom-salvage-${today}`, `football-truth-global-batch001-official-html-custom-salvage-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-official-html-custom-salvage-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-global-batch001-official-html-custom-salvage-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "global_batch001_official_html_custom_salvage") blocks.push("runner_mismatch");
if (report.summary?.targetCount !== 11) blocks.push("target_count_not_11");
if (rows.length !== 11) blocks.push("rows_not_11");
if (!report.summary?.customSalvageStatusCounts) blocks.push("missing_status_counts");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.customSalvageStatus) blocks.push(`missing_custom_status_${row.slug}`);
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
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_global_batch001_official_html_custom_salvage",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    targetCount: report.summary.targetCount,
    customSalvageStatusCounts: report.summary.customSalvageStatusCounts,
    proofShapePassedNonzeroSlugs: report.summary.proofShapePassedNonzeroSlugs,
    proofShapePassedNonzeroWithCollisionSlugs: report.summary.proofShapePassedNonzeroWithCollisionSlugs,
    proofShapePassedZeroPlayedSlugs: report.summary.proofShapePassedZeroPlayedSlugs,
    reviewRequiredSlugs: report.summary.reviewRequiredSlugs,
    noProofSlugs: report.summary.noProofSlugs,
    collisionGroups: report.summary.collisionGroups,
    searchExecutedNowCount: guardrails.searchExecutedNowCount,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    canonicalWriteExecutedNowCount: guardrails.canonicalWriteExecutedNowCount,
    lifecycleWriteExecutedNowCount: guardrails.lifecycleWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Official HTML custom salvage is verified. It reparses extraction-review rows with known official table layouts and leaves all proof-shape rows non-countable until season/league identity review and approval gates. No fetch/search/canonical/lifecycle/production/truth action was executed.",
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
