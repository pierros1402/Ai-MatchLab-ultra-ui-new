import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-action-batch-${today}`, `football-truth-post-rollup-action-batch-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-action-batch-${today}`, `football-truth-post-rollup-action-batch-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-action-batch-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-post-rollup-action-batch-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function sorted(values) { return [...new Set(values || [])].sort((a,b) => a.localeCompare(b)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_post_rollup_action_batch") blocks.push("runner_mismatch");
if (report.summary?.actionTargetCount !== 10) blocks.push("action_target_count_not_10");
if (rows.length !== 10) blocks.push("rows_not_10");
if (report.summary?.suppressedLongTailCount !== 284) blocks.push("suppressed_long_tail_not_284");
if (JSON.stringify(sorted(report.summary?.renderedOrApiRequiredSlugs || [])) !== JSON.stringify(["eng.4","eng.5","gha.2","irl.2"])) blocks.push("rendered_api_slug_set_mismatch");
if (JSON.stringify(sorted(report.summary?.proofShapeNeedsSeasonLeagueReviewSlugs || [])) !== JSON.stringify(["bih.2","mne.2"])) blocks.push("proof_shape_slug_set_mismatch");
if (JSON.stringify(sorted(report.summary?.zeroPlayedStartDateLaneSlugs || [])) !== JSON.stringify(["ned.2"])) blocks.push("zero_played_slug_set_mismatch");
if (JSON.stringify(sorted(report.summary?.extractionReviewRequiredSlugs || [])) !== JSON.stringify(["arm.2","egy.2","qat.2"])) blocks.push("extraction_review_slug_set_mismatch");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.actionLane) blocks.push(`missing_action_lane_${row.slug}`);
  if (row.writeNowAllowed !== false) blocks.push(`write_now_allowed_not_false_${row.slug}`);
}

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.reviewOnlyCandidateWriteExecutedNowCount !== 0) blocks.push("review_only_candidate_write_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_post_rollup_action_batch",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    summary: report.summary,
    decision: report.decision,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Post-rollup action batch is verified. It consolidates the remaining useful queue after long-tail suppression without fetch/search/write/truth action, and selects rendered/API as the next immediate lane.",
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
