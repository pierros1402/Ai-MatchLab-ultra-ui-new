import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const batchLabel = String(batchIndex).padStart(2, "0");

const resultPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-results-${today}`,
  `high-yield-previous-completed-official-route-search-results-batch-${batchLabel}-${today}.json`
);

const rowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-results-${today}`,
  `high-yield-previous-completed-official-route-search-result-rows-batch-${batchLabel}-${today}.jsonl`
);

const verificationDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-results-verification-${today}`
);

const verificationPath = path.join(
  verificationDir,
  `high-yield-previous-completed-official-route-search-results-verification-batch-${batchLabel}-${today}.json`
);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];
const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (result.status !== "passed") blocks.push("result_status_not_passed");
if (result.contractVersion !== 2) blocks.push("contract_version_not_2");
if (result.batchIndex !== 1) blocks.push("batch_index_not_1");
if (result.summary?.targetCount !== 6) blocks.push("target_count_not_6");
if (result.summary?.queryCount !== 40) blocks.push("query_count_not_40");
if (result.summary?.rssOkCount !== 40) blocks.push("rss_ok_count_not_40");
if (result.summary?.rssNonOkCount !== 0) blocks.push("rss_non_ok_count_not_0");
if (rows.length !== result.summary?.resultRowCount) blocks.push("rows_count_mismatch_result_row_count");
if (!Number.isInteger(result.summary?.duplicateSearchResultSkippedCount) || result.summary.duplicateSearchResultSkippedCount < 1) blocks.push("dedupe_not_evidenced");
if (result.summary?.routeCandidateCount !== 0) blocks.push("unexpected_route_candidates_present");
if (result.summary?.reviewCandidateOnly !== true) blocks.push("review_candidate_only_not_true");
if (result.acceptance?.acceptedNowCount !== 0) blocks.push("accepted_now_count_not_zero");

const guardrails = result.guardrails || {};
if (guardrails.allowSearch !== true) blocks.push("allow_search_not_true_for_executed_search_batch");
if (guardrails.searchExecutedNowCount !== 40) blocks.push("search_executed_now_count_not_40");
if (guardrails.fetchResultPagesExecutedNowCount !== 0) blocks.push("fetch_result_pages_executed_now_count_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_executed_now_count_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_executed_now_count_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_executed_now_count_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");

const expectedTargets = ["arg.1", "aus.1", "aut.1", "bel.1", "bra.1", "fra.1"];
const actualTargets = result.summary?.targetSlugs || [];
if (JSON.stringify(actualTargets) !== JSON.stringify(expectedTargets)) blocks.push("target_slug_order_mismatch");

for (const row of rows) {
  if (!expectedTargets.includes(row.slug)) blocks.push(`unexpected_slug_${row.slug}`);
  if (row.lane !== "previous_completed_standings") blocks.push(`wrong_lane_${row.slug}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`acceptance_allowed_in_search_row_${row.slug}`);
  if (row.reviewOnly !== true) blocks.push(`review_only_not_true_${row.slug}`);
  if (row.routeCandidate !== false) blocks.push(`route_candidate_unexpectedly_true_${row.slug}`);
  if (typeof row.candidateScore !== "number") blocks.push(`candidate_score_missing_${row.slug}`);
  if (!Array.isArray(row.positiveSignals)) blocks.push(`positive_signals_missing_${row.slug}`);
  if (!Array.isArray(row.negativeSignals)) blocks.push(`negative_signals_missing_${row.slug}`);
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_high_yield_previous_completed_official_route_search_batch",
  contractVersion: 1,
  resultPath: path.relative(root, resultPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  resultSha256: await sha256(resultPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    batchIndex: result.batchIndex,
    targetCount: result.summary.targetCount,
    queryCount: result.summary.queryCount,
    rssOkCount: result.summary.rssOkCount,
    resultRowCount: rows.length,
    duplicateSearchResultSkippedCount: result.summary.duplicateSearchResultSkippedCount,
    routeCandidateCount: result.summary.routeCandidateCount,
    acceptedNowCount: result.acceptance.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 40 &&
      guardrails.fetchResultPagesExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false
  },
  conclusion: "Batch 01 search was safely executed and produced no acceptable route candidates. Treat as negative diagnostic evidence only; do not fetch, canonical-write, production-write, or truth-assert from these rows.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  verificationPath: path.relative(root, verificationPath).replaceAll("\\", "/"),
  verified: report.verified,
  conclusion: report.conclusion,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) {
  process.exitCode = 1;
}
