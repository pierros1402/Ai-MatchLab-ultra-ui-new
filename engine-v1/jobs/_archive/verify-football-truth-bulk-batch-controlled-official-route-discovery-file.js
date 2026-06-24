import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 2);
const pad = String(batchIndex).padStart(3, "0");

const discoveryPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-controlled-official-route-discovery-${today}`, `bulk-batch-controlled-official-route-discovery-batch-${pad}-${today}.json`);
const discoveryRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-controlled-official-route-discovery-${today}`, `bulk-batch-controlled-official-route-discovery-batch-${pad}-rows-${today}.jsonl`);
const qualityVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-verification-${today}`, `bulk-batch-route-quality-board-batch-${pad}-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-controlled-official-route-discovery-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-controlled-official-route-discovery-batch-${pad}-verification-${today}.json`);

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
const discovery = JSON.parse(await fs.readFile(discoveryPath, "utf8"));
const rows = parseJsonl(await fs.readFile(discoveryRowsPath, "utf8"));
const qualityVerification = JSON.parse(await fs.readFile(qualityVerificationPath, "utf8"));

const expectedPassedSlugs = ["srb.1", "lva.1", "lva.2", "mda.1", "mda.2", "mne.1", "mne.2"].sort();

if (qualityVerification.status !== "passed") blocks.push("quality_verification_not_passed");
if (discovery.status !== "passed") blocks.push("discovery_not_passed");
if (discovery.runner !== "bulk_batch_controlled_official_route_discovery") blocks.push("runner_mismatch");
if (discovery.batchIndex !== batchIndex) blocks.push("batch_index_mismatch");
if (discovery.summary?.targetCount !== 40) blocks.push("target_count_not_40");
if (discovery.summary?.attemptedFetchCount !== 116) blocks.push("attempted_fetch_count_not_116");
if (discovery.summary?.passedCount !== 7) blocks.push("passed_count_not_7");
if (discovery.summary?.needsReviewCount !== 33) blocks.push("needs_review_count_not_33");
if (discovery.summary?.failedCount !== 0) blocks.push("failed_count_not_0");
if (rows.length !== 40) blocks.push("rows_not_40");

const actualPassedSlugs = [...(discovery.summary?.passedSlugs || [])].sort();
if (JSON.stringify(actualPassedSlugs) !== JSON.stringify(expectedPassedSlugs)) blocks.push("passed_slug_set_mismatch");

const passedRows = rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_passed");
const reviewRows = rows.filter(row => row.discoveryStatus === "controlled_official_route_candidate_needs_review");
const failedRows = rows.filter(row => row.discoveryStatus === "controlled_official_route_discovery_failed");

if (passedRows.length !== 7) blocks.push("passed_rows_not_7");
if (reviewRows.length !== 33) blocks.push("review_rows_not_33");
if (failedRows.length !== 0) blocks.push("failed_rows_not_0");

const attemptedFetchSum = rows.reduce((sum, row) => sum + Number(row.attemptedFetchCount || 0), 0);
if (attemptedFetchSum !== 116) blocks.push("attempted_fetch_sum_not_116");

for (const row of rows) {
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${row.slug}`);
  if (row.routeClaimMadeNow !== false) blocks.push(`route_claim_${row.slug}`);
  if (row.familyClaimMadeNow !== false) blocks.push(`family_claim_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_${row.slug}`);

  if (!Array.isArray(row.attemptSummaries) || row.attemptSummaries.length !== row.attemptedFetchCount) {
    blocks.push(`attempt_summary_count_bad_${row.slug}`);
  }

  if (row.discoveryStatus === "controlled_official_route_candidate_passed") {
    if (!row.selectedFinalUrl) blocks.push(`passed_missing_final_url_${row.slug}`);
    if (!row.selectedHost) blocks.push(`passed_missing_host_${row.slug}`);
    if (!row.selectedTitle) blocks.push(`passed_missing_title_${row.slug}`);
    if (!(Number(row.selectedScore) >= 200)) blocks.push(`passed_score_too_low_${row.slug}`);
    if ((row.reviewBlocks || []).length !== 0) blocks.push(`passed_has_review_blocks_${row.slug}`);
  }

  if (row.discoveryStatus === "controlled_official_route_candidate_needs_review") {
    if (row.selectedFinalUrl !== null) blocks.push(`review_has_selected_final_url_${row.slug}`);
    if (row.selectedHost !== null) blocks.push(`review_has_selected_host_${row.slug}`);
    if (!row.bestReviewFinalUrl) blocks.push(`review_missing_best_url_${row.slug}`);
    if (!Array.isArray(row.reviewBlocks) || row.reviewBlocks.length === 0) blocks.push(`review_missing_blocks_${row.slug}`);
  }
}

const guardrails = discovery.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 116) blocks.push("fetch_executed_not_116");
if (guardrails.controlledOfficialRouteDiscoveryFetchExecutedNowCount !== 116) blocks.push("controlled_discovery_fetch_not_116");
if (guardrails.providerFetchExecutedNowCount !== 0) blocks.push("provider_fetch_not_zero");
if (guardrails.routeClaimMadeNowCount !== 0) blocks.push("route_claim_count_not_zero");
if (guardrails.familyClaimMadeNowCount !== 0) blocks.push("family_claim_count_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_controlled_official_route_discovery",
  contractVersion: 1,
  batchIndex,
  discoveryPath: rel(discoveryPath),
  discoveryRowsPath: rel(discoveryRowsPath),
  qualityVerificationPath: rel(qualityVerificationPath),
  verificationPath: rel(verificationPath),
  discoverySha256: await sha256(discoveryPath),
  discoveryRowsSha256: await sha256(discoveryRowsPath),
  qualityVerificationSha256: await sha256(qualityVerificationPath),
  verified: {
    batchIndex,
    targetCount: discovery.summary.targetCount,
    attemptedFetchCount: discovery.summary.attemptedFetchCount,
    passedCount: discovery.summary.passedCount,
    needsReviewCount: discovery.summary.needsReviewCount,
    failedCount: discovery.summary.failedCount,
    passedSlugs: discovery.summary.passedSlugs,
    needsReviewSlugs: discovery.summary.needsReviewSlugs,
    failedSlugs: discovery.summary.failedSlugs,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    searchExecutedNowCount: guardrails.searchExecutedNowCount,
    routeClaimMadeNowCount: guardrails.routeClaimMadeNowCount,
    familyClaimMadeNowCount: guardrails.familyClaimMadeNowCount,
    canonicalWriteExecutedNowCount: guardrails.canonicalWriteExecutedNowCount,
    lifecycleWriteExecutedNowCount: guardrails.lifecycleWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Bulk batch 2 controlled official-route discovery is verified as diagnostic evidence only. 7 slugs have route candidates requiring identity/surface verification; 33 require review or stronger route discovery. No route/family truth claim, canonical write, lifecycle write, production write, truth assertion, or raw payload commit was executed.",
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
