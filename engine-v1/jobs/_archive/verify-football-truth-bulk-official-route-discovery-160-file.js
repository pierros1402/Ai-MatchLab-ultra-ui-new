import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-bulk-official-route-discovery-160-${today}`, `football-truth-bulk-official-route-discovery-160-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-bulk-official-route-discovery-160-${today}`, `football-truth-bulk-official-route-discovery-160-rows-${today}.jsonl`);
const fetchPlanPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-bulk-official-route-discovery-160-${today}`, `football-truth-bulk-official-route-discovery-160-fetch-plan-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-bulk-official-route-discovery-160-verification-${today}`);
const verificationPath = path.join(verificationDir, `football-truth-bulk-official-route-discovery-160-verification-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
async function sha256(file) { return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));
const fetchPlanRows = parseJsonl(await fs.readFile(fetchPlanPath, "utf8").catch(() => ""));

if (report.status !== "passed") blocks.push("report_not_passed");
if (report.runner !== "football_truth_bulk_official_route_discovery_160") blocks.push("runner_mismatch");
if (report.summary?.suppressedMissingAllowlistInputCount !== 284) blocks.push("suppressed_missing_input_not_284");
if (report.summary?.selectedBulkTargetCount <= 50) blocks.push("selected_bulk_target_count_not_large_enough");
if (rows.length !== report.summary?.selectedBulkTargetCount) blocks.push("row_count_mismatch");
if (report.summary?.rssSearchRequestCount !== report.guardrails?.rssSearchRequestExecutedNowCount) blocks.push("rss_count_mismatch");
if (report.summary?.routeProbeFetchCount !== report.guardrails?.routeProbeFetchExecutedNowCount) blocks.push("route_probe_count_mismatch");
if (report.summary?.fetchPlanTargetCount !== fetchPlanRows.length) blocks.push("fetch_plan_count_mismatch");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!row.discoveryLane) blocks.push(`missing_discovery_lane_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.reviewOnlyCandidateWriteExecutedNow !== false) blocks.push(`review_only_write_true_${row.slug}`);
  if (row.canonicalCandidateWriteExecutedNow !== false) blocks.push(`canonical_candidate_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${row.slug}`);
}

for (const row of fetchPlanRows) {
  if (!row.slug) blocks.push("fetch_plan_missing_slug");
  if (!Array.isArray(row.plannedUrls) || row.plannedUrls.length === 0) blocks.push(`fetch_plan_missing_urls_${row.slug}`);
}

const guardrails = report.guardrails || {};
if (guardrails.reviewOnlyCandidateWriteExecutedNowCount !== 0) blocks.push("review_only_write_not_zero");
if (guardrails.canonicalCandidateWriteExecutedNowCount !== 0) blocks.push("canonical_candidate_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_true");

const verification = {
  status: blocks.length ? "failed" : "passed",
  runner: "verify_football_truth_bulk_official_route_discovery_160",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  fetchPlanPath: rel(fetchPlanPath),
  verificationPath: rel(verificationPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  fetchPlanSha256: await sha256(fetchPlanPath),
  verified: {
    summary: report.summary,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Bulk official/provider route discovery is verified. This is the scale-correct lane: large target selection, RSS/search route discovery, route probing, and fetch plan output without candidate/canonical/lifecycle/production/truth write.",
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
