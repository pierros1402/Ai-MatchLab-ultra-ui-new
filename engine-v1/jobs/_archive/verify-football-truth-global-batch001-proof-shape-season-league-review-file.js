import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-proof-shape-season-league-review-${today}`, `football-truth-global-batch001-proof-shape-season-league-review-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-proof-shape-season-league-review-${today}`, `football-truth-global-batch001-proof-shape-season-league-review-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-proof-shape-season-league-review-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-global-batch001-proof-shape-season-league-review-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "global_batch001_proof_shape_season_league_review") blocks.push("runner_mismatch");
if (report.summary?.targetCount !== 6) blocks.push("target_count_not_6");
if (report.summary?.attemptedFetchCount !== 6) blocks.push("attempted_fetch_count_not_6");
if (rows.length !== 6) blocks.push("rows_not_6");

const countSum = Object.values(report.summary?.reviewStatusCounts || {}).reduce((sum, value) => sum + Number(value || 0), 0);
if (countSum !== 6) blocks.push("review_status_counts_do_not_sum_to_6");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.reviewStatus) blocks.push(`missing_review_status_${row.slug}`);
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
if (guardrails.fetchExecutedNowCount !== 6) blocks.push("fetch_executed_not_6");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_global_batch001_proof_shape_season_league_review",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    targetCount: report.summary.targetCount,
    attemptedFetchCount: report.summary.attemptedFetchCount,
    reviewStatusCounts: report.summary.reviewStatusCounts,
    candidateAfterExplicitApprovalSlugs: report.summary.candidateAfterExplicitApprovalSlugs,
    seasonOrLeagueInsufficientSlugs: report.summary.seasonOrLeagueInsufficientSlugs,
    collisionReviewRequiredSlugs: report.summary.collisionReviewRequiredSlugs,
    zeroPlayedStartDateLaneRequiredSlugs: report.summary.zeroPlayedStartDateLaneRequiredSlugs,
    sourceFetchReviewRequiredSlugs: report.summary.sourceFetchReviewRequiredSlugs,
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
  conclusion: "Proof-shape season/league review is verified. It reviews non-collision proof-shape rows, collision rows, and the zero-played row without candidate/canonical/lifecycle/production/truth write. Explicit approval is still required before any review-only candidate write.",
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
