import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const probePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-alternative-route-probe-${today}`, `bulk-batch-alternative-route-probe-batch-${pad}-${today}.json`);
const probeRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-alternative-route-probe-${today}`, `bulk-batch-alternative-route-probe-batch-${pad}-rows-${today}.jsonl`);
const controlledFetchVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-controlled-fetch-verification-verification-${today}`, `bulk-batch-route-controlled-fetch-verification-batch-${pad}-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-alternative-route-probe-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-alternative-route-probe-batch-${pad}-verification-${today}.json`);

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
const probe = JSON.parse(await fs.readFile(probePath, "utf8"));
const rows = parseJsonl(await fs.readFile(probeRowsPath, "utf8"));
const controlledFetchVerification = JSON.parse(await fs.readFile(controlledFetchVerificationPath, "utf8"));

const expectedPassed = ["aut.2", "gre.1", "gre.2", "kor.1", "kor.2", "jpn.2", "ita.2", "ksa.1", "aus.2", "rou.1"].sort();
const expectedRenderedReview = ["arg.2", "chn.1", "chn.2", "cze.2", "den.2"].sort();
const expectedDiscovery = ["fra.1", "fra.2", "por.1", "por.2", "bel.1", "bel.2", "sui.1", "sui.2", "pol.2", "cze.1", "tur.1", "tur.2", "mex.1", "mex.2", "bra.1", "bra.2"].sort();

if (controlledFetchVerification.status !== "passed") blocks.push("controlled_fetch_verification_not_passed");
if (probe.status !== "passed") blocks.push("probe_status_not_passed");
if (probe.runner !== "bulk_batch_alternative_route_probe") blocks.push("probe_runner_mismatch");
if (probe.batchIndex !== 1) blocks.push("batch_index_not_1");
if (probe.summary?.targetSlugCount !== 31) blocks.push("target_slug_count_not_31");
if (probe.summary?.attemptedFetchCount !== 121) blocks.push("attempted_fetch_count_not_121");
if (probe.summary?.alternativeRoutePassedCount !== 10) blocks.push("alternative_passed_count_not_10");
if (probe.summary?.renderedOrParserReviewCount !== 5) blocks.push("rendered_review_count_not_5");
if (probe.summary?.needsSearchOrManualOfficialDiscoveryCount !== 16) blocks.push("discovery_count_not_16");
if (probe.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");
if (probe.summary?.productionWriteAllowedNow !== false) blocks.push("production_allowed");
if (probe.summary?.truthAssertionAllowedNow !== false) blocks.push("truth_allowed");
if (rows.length !== 31) blocks.push("rows_length_not_31");

const actualPassed = [...(probe.summary?.alternativeRoutePassedSlugs || [])].sort();
const actualRenderedReview = [...(probe.summary?.renderedOrParserReviewSlugs || [])].sort();
const actualDiscovery = [...(probe.summary?.needsSearchOrManualOfficialDiscoverySlugs || [])].sort();

if (JSON.stringify(actualPassed) !== JSON.stringify(expectedPassed)) blocks.push("alternative_passed_slug_set_mismatch");
if (JSON.stringify(actualRenderedReview) !== JSON.stringify(expectedRenderedReview)) blocks.push("rendered_review_slug_set_mismatch");
if (JSON.stringify(actualDiscovery) !== JSON.stringify(expectedDiscovery)) blocks.push("discovery_slug_set_mismatch");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (!["alternative_route_passed", "route_fetches_but_needs_rendered_or_parser_review", "needs_search_or_manual_official_discovery"].includes(row.bestStatus)) {
    blocks.push(`invalid_best_status_${row.slug}`);
  }

  for (const attempt of row.attempts || []) {
    if (attempt.rawPayloadWritten !== false) blocks.push(`raw_payload_written_${row.slug}`);
    if (attempt.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
    if (attempt.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
    if (attempt.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);
  }

  if (expectedPassed.includes(row.slug)) {
    if (row.bestStatus !== "alternative_route_passed") blocks.push(`expected_passed_status_mismatch_${row.slug}`);
    if (!(row.passedUrlCount >= 1)) blocks.push(`expected_passed_has_no_passed_url_${row.slug}`);
    if (!(row.status2xxUrlCount >= 1)) blocks.push(`expected_passed_has_no_2xx_${row.slug}`);
    if ((row.bestValidationBlocks || []).length !== 0) blocks.push(`expected_passed_has_validation_blocks_${row.slug}`);
  }

  if (expectedRenderedReview.includes(row.slug)) {
    if (row.bestStatus !== "route_fetches_but_needs_rendered_or_parser_review") blocks.push(`expected_rendered_review_status_mismatch_${row.slug}`);
    if (!(row.status2xxUrlCount >= 1)) blocks.push(`expected_rendered_review_has_no_2xx_${row.slug}`);
  }

  if (expectedDiscovery.includes(row.slug)) {
    if (row.bestStatus !== "needs_search_or_manual_official_discovery") blocks.push(`expected_discovery_status_mismatch_${row.slug}`);
  }
}

const guardrails = probe.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 121) blocks.push("fetch_executed_not_121");
if (guardrails.controlledAlternativeRouteFetchExecutedNowCount !== 121) blocks.push("controlled_alternative_fetch_not_121");
if (guardrails.providerFetchExecutedNowCount !== 0) blocks.push("provider_fetch_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_guardrail_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_guardrail_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_alternative_route_probe",
  contractVersion: 1,
  batchIndex,
  probePath: rel(probePath),
  probeRowsPath: rel(probeRowsPath),
  controlledFetchVerificationPath: rel(controlledFetchVerificationPath),
  verificationPath: rel(verificationPath),
  probeSha256: await sha256(probePath),
  probeRowsSha256: await sha256(probeRowsPath),
  controlledFetchVerificationSha256: await sha256(controlledFetchVerificationPath),
  verified: {
    batchIndex,
    targetSlugCount: probe.summary.targetSlugCount,
    attemptedFetchCount: probe.summary.attemptedFetchCount,
    alternativeRoutePassedCount: probe.summary.alternativeRoutePassedCount,
    renderedOrParserReviewCount: probe.summary.renderedOrParserReviewCount,
    needsSearchOrManualOfficialDiscoveryCount: probe.summary.needsSearchOrManualOfficialDiscoveryCount,
    alternativeRoutePassedSlugs: probe.summary.alternativeRoutePassedSlugs,
    renderedOrParserReviewSlugs: probe.summary.renderedOrParserReviewSlugs,
    needsSearchOrManualOfficialDiscoverySlugs: probe.summary.needsSearchOrManualOfficialDiscoverySlugs,
    acceptedNowCount: probe.summary.acceptedNowCount,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    searchExecutedNowCount: guardrails.searchExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Bulk batch 1 alternative-route probe is verified as diagnostic evidence only. 10 additional candidate surfaces passed bounded route checks, 5 require rendered/parser review, and 16 require controlled search/manual official discovery. No route truth, production write, canonical write, or raw payload commit was executed.",
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
