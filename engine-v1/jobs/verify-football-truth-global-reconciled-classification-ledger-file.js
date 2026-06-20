import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-reconciled-classification-ledger-${today}`, `football-truth-global-reconciled-classification-ledger-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-reconciled-classification-ledger-${today}`, `football-truth-global-reconciled-classification-ledger-rows-${today}.jsonl`);
const groupsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-reconciled-classification-ledger-${today}`, `football-truth-global-reconciled-classification-ledger-groups-${today}.json`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-reconciled-classification-ledger-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-global-reconciled-classification-ledger-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_global_reconciled_classification_ledger") blocks.push("runner_mismatch");
if (report.summary?.allKnownSlugCount !== rows.length) blocks.push("row_count_mismatch");
if ((report.summary?.allKnownSlugCount || 0) < 400) blocks.push("all_known_too_low");
if (report.summary?.countableCoverageNow !== 14) blocks.push("countable_coverage_not_14");
if (report.summary?.batch001ProcessedCount !== 80) blocks.push("batch001_processed_not_80");
if (report.summary?.batch001StrictAcceptedForNextGateCount !== 7) blocks.push("strict_accepted_not_7");
if (report.summary?.batch001StrictRejectedOrReviewCount !== 73) blocks.push("strict_rejected_not_73");
if (report.summary?.batch001PartialPhaseCount !== 1) blocks.push("partial_phase_not_1");
if ((report.summary?.noCurrentUnprocessedCount || 999) > 305) blocks.push("no_current_unprocessed_too_high");
if (!rows.some(row => row.slug === "cyp.1" && row.reconciledClassificationLane === "batch001_custom_split_table_partial_phase_review_required")) blocks.push("cyp1_not_partial_phase");
if (!rows.some(row => row.slug === "ind.2" && row.reconciledClassificationLane === "batch001_no_extractable_standings_table_found")) blocks.push("ind2_not_template_no_extractable");

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

for (const row of rows) {
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
}

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_football_truth_global_reconciled_classification_ledger",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  groupsPath: rel(groupsPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  groupsSha256: await sha256(groupsPath),
  verified: {
    summary: report.summary,
    priorityOrder: report.priorityOrder,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Global reconciled classification ledger is verified. It folds batch001 strict precision, identity/surface, HTML extraction, and CYP1 split-phase diagnostics back into the global league classification, without fetch/search/canonical/lifecycle/production/truth action.",
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
