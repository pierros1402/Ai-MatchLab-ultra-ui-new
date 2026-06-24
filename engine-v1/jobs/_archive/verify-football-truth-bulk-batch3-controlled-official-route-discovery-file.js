import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 3;
const pad = "003";

const diagnosticPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-controlled-official-route-discovery-${today}`, `bulk-batch3-controlled-official-route-discovery-${today}.json`);
const diagnosticRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-controlled-official-route-discovery-${today}`, `bulk-batch3-controlled-official-route-discovery-rows-${today}.jsonl`);
const qualityVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-verification-${today}`, `bulk-batch-route-quality-board-batch-${pad}-verification-${today}.json`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-controlled-official-route-discovery-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch3-controlled-official-route-discovery-verification-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function sameSet(actual, expected) {
  return JSON.stringify([...(actual || [])].sort()) === JSON.stringify([...expected].sort());
}

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, "utf8"));
const rows = parseJsonl(await fs.readFile(diagnosticRowsPath, "utf8"));
const qualityVerification = JSON.parse(await fs.readFile(qualityVerificationPath, "utf8"));

const expectedPassed = [
  "wal.2", "nzl.1", "nzl.2", "col.1", "col.2", "chi.1", "chi.2", "ecu.1", "ecu.2", "per.1", "per.2", "uru.1", "uru.2", "par.1", "par.2", "bol.1", "bol.2", "ven.1", "ven.2", "crc.1", "pan.1", "pan.2", "gua.1", "gua.2", "can.1", "ind.1", "ind.2", "tha.1", "tha.2", "vie.1", "vie.2", "mys.1"
];
const expectedNeedsReview = ["hon.1", "slv.1", "slv.2", "can.2"];
const expectedNotFound = ["crc.2", "hon.2", "idn.1", "idn.2"];
const expectedAll = [...expectedPassed, ...expectedNeedsReview, ...expectedNotFound];

if (qualityVerification.status !== "passed") blocks.push("quality_verification_not_passed");
if (qualityVerification.verified?.batchIndex !== 3) blocks.push("quality_batch_not_3");
if (qualityVerification.verified?.needsControlledOfficialRouteDiscoveryCount !== 40) blocks.push("quality_discovery_count_not_40");

if (diagnostic.status !== "passed") blocks.push("diagnostic_not_passed");
if (diagnostic.runner !== "bulk_batch3_controlled_official_route_discovery") blocks.push("runner_mismatch");
if (diagnostic.batchIndex !== batchIndex) blocks.push("batch_index_mismatch");
if (diagnostic.summary?.batchIndex !== batchIndex) blocks.push("summary_batch_index_mismatch");
if (diagnostic.summary?.targetCount !== 40) blocks.push("target_count_not_40");
if (diagnostic.summary?.attemptedFetchCount !== 140) blocks.push("attempted_fetch_count_not_140");
if (diagnostic.summary?.passedCount !== 32) blocks.push("passed_count_not_32");
if (diagnostic.summary?.needsReviewCount !== 4) blocks.push("needs_review_count_not_4");
if (diagnostic.summary?.notFoundCount !== 4) blocks.push("not_found_count_not_4");
if (!sameSet(diagnostic.summary?.passedSlugs, expectedPassed)) blocks.push("passed_slug_set_bad");
if (!sameSet(diagnostic.summary?.needsReviewSlugs, expectedNeedsReview)) blocks.push("needs_review_slug_set_bad");
if (!sameSet(diagnostic.summary?.notFoundSlugs, expectedNotFound)) blocks.push("not_found_slug_set_bad");
if (diagnostic.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_count_not_zero");
if (diagnostic.summary?.routeClaimMadeNowCount !== 0) blocks.push("route_claim_count_not_zero");
if (diagnostic.summary?.familyClaimMadeNowCount !== 0) blocks.push("family_claim_count_not_zero");
if (diagnostic.summary?.canonicalWriteAllowedNow !== false) blocks.push("canonical_write_allowed_true");
if (diagnostic.summary?.lifecycleWriteAllowedNow !== false) blocks.push("lifecycle_write_allowed_true");
if (diagnostic.summary?.productionWriteAllowedNow !== false) blocks.push("production_write_allowed_true");
if (diagnostic.summary?.truthAssertionAllowedNow !== false) blocks.push("truth_assertion_allowed_true");

if (rows.length !== 40) blocks.push("rows_not_40");
if (!sameSet(rows.map(row => row.slug), expectedAll)) blocks.push("row_slug_set_bad");

for (const row of rows) {
  if (!expectedAll.includes(row.slug)) blocks.push(`unexpected_slug_${row.slug}`);
  if (expectedPassed.includes(row.slug) && row.discoveryStatus !== "controlled_official_route_candidate_passed") blocks.push(`passed_status_bad_${row.slug}`);
  if (expectedNeedsReview.includes(row.slug) && row.discoveryStatus !== "controlled_official_route_candidate_needs_review") blocks.push(`needs_review_status_bad_${row.slug}`);
  if (expectedNotFound.includes(row.slug) && row.discoveryStatus !== "controlled_official_route_candidate_not_found") blocks.push(`not_found_status_bad_${row.slug}`);

  if (row.acceptedNow !== false) blocks.push(`accepted_now_true_${row.slug}`);
  if (row.routeClaimMadeNow !== false) blocks.push(`route_claim_true_${row.slug}`);
  if (row.familyClaimMadeNow !== false) blocks.push(`family_claim_true_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_true_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_true_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_true_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_true_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_true_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_true_${row.slug}`);

  if (!Array.isArray(row.fetches) || row.fetches.length < 2 || row.fetches.length > 4) blocks.push(`fetches_count_out_of_range_${row.slug}`);

  if (row.discoveryStatus === "controlled_official_route_candidate_passed") {
    if (!row.selectedUrl || !row.selectedFinalUrl || !row.selectedHost) blocks.push(`passed_missing_selected_route_${row.slug}`);
    if (!(row.selectedScore >= 185)) blocks.push(`passed_score_low_${row.slug}`);
    if (!((row.selectedFetchStatus ?? 0) >= 200 && (row.selectedFetchStatus ?? 0) < 400)) blocks.push(`passed_fetch_status_bad_${row.slug}`);
    if (row.selectedHasChallenge !== false) blocks.push(`passed_has_challenge_${row.slug}`);
  }

  if (row.slug === "can.1") {
    if (row.discoveryStatus !== "controlled_official_route_candidate_passed") blocks.push("can1_not_passed_after_host_normalization");
    if (row.selectedHost !== "cplsoccer.com") blocks.push("can1_selected_host_not_normalized_cplsoccer");
  }

  if (row.slug === "idn.1" || row.slug === "idn.2") {
    if (row.selectedHasChallenge !== true) blocks.push(`indonesia_challenge_not_detected_${row.slug}`);
    if (row.discoveryStatus !== "controlled_official_route_candidate_not_found") blocks.push(`indonesia_not_found_status_bad_${row.slug}`);
  }
}

const guardrails = diagnostic.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 140) blocks.push("fetch_executed_not_140");
if (guardrails.controlledOfficialRouteDiscoveryFetchExecutedNowCount !== 140) blocks.push("controlled_fetch_not_140");
if (guardrails.providerFetchExecutedNowCount !== 0) blocks.push("provider_fetch_not_zero");
if (guardrails.routeClaimMadeNowCount !== 0) blocks.push("route_claim_guardrail_not_zero");
if (guardrails.familyClaimMadeNowCount !== 0) blocks.push("family_claim_guardrail_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_guardrail_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_guardrail_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_guardrail_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_guardrail_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_true");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_true");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch3_controlled_official_route_discovery",
  contractVersion: 1,
  batchIndex,
  diagnosticPath: rel(diagnosticPath),
  diagnosticRowsPath: rel(diagnosticRowsPath),
  qualityVerificationPath: rel(qualityVerificationPath),
  verificationPath: rel(verificationPath),
  diagnosticSha256: await sha256(diagnosticPath),
  diagnosticRowsSha256: await sha256(diagnosticRowsPath),
  qualityVerificationSha256: await sha256(qualityVerificationPath),
  verified: {
    batchIndex,
    targetCount: diagnostic.summary.targetCount,
    attemptedFetchCount: diagnostic.summary.attemptedFetchCount,
    passedCount: diagnostic.summary.passedCount,
    needsReviewCount: diagnostic.summary.needsReviewCount,
    notFoundCount: diagnostic.summary.notFoundCount,
    passedSlugs: diagnostic.summary.passedSlugs,
    needsReviewSlugs: diagnostic.summary.needsReviewSlugs,
    notFoundSlugs: diagnostic.summary.notFoundSlugs,
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
  conclusion: "Bulk batch 3 controlled official route discovery is verified. 32 slugs produced controlled route candidates, 4 require review, and 4 were not found in this lane. These are discovery candidates only: no route/family truth claim, canonical write, lifecycle write, production write, truth assertion, or raw payload commit was executed.",
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
