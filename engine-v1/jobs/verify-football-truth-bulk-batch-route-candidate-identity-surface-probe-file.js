import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 2);
const pad = String(batchIndex).padStart(3, "0");

const probePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-candidate-identity-surface-probe-${today}`, `bulk-batch-route-candidate-identity-surface-probe-batch-${pad}-${today}.json`);
const probeRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-candidate-identity-surface-probe-${today}`, `bulk-batch-route-candidate-identity-surface-probe-batch-${pad}-rows-${today}.jsonl`);
const discoveryVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-controlled-official-route-discovery-verification-${today}`, `bulk-batch-controlled-official-route-discovery-batch-${pad}-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-candidate-identity-surface-probe-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-route-candidate-identity-surface-probe-batch-${pad}-verification-${today}.json`);

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
const discoveryVerification = JSON.parse(await fs.readFile(discoveryVerificationPath, "utf8"));

const expectedParser = ["srb.1"].sort();
const expectedRendered = ["lva.1"].sort();
const expectedReview = ["mda.1", "mda.2"].sort();
const expectedRejected = ["lva.2", "mne.1", "mne.2"].sort();

if (discoveryVerification.status !== "passed") blocks.push("discovery_verification_not_passed");
if (probe.status !== "passed") blocks.push("probe_not_passed");
if (probe.runner !== "bulk_batch_route_candidate_identity_surface_probe") blocks.push("runner_mismatch");
if (probe.batchIndex !== batchIndex) blocks.push("batch_index_mismatch");
if (probe.summary?.targetCount !== 7) blocks.push("target_count_not_7");
if (probe.summary?.attemptedFetchCount !== 7) blocks.push("attempted_fetch_count_not_7");
if (probe.summary?.parserPlanningAllowedCount !== 1) blocks.push("parser_count_not_1");
if (probe.summary?.renderedOrApiRequiredCount !== 1) blocks.push("rendered_count_not_1");
if (probe.summary?.identityReviewRequiredCount !== 2) blocks.push("review_count_not_2");
if (probe.summary?.rejectedCount !== 3) blocks.push("rejected_count_not_3");
if (rows.length !== 7) blocks.push("rows_not_7");

const actualParser = [...(probe.summary?.parserPlanningAllowedSlugs || [])].sort();
const actualRendered = [...(probe.summary?.renderedOrApiRequiredSlugs || [])].sort();
const actualReview = [...(probe.summary?.identityReviewRequiredSlugs || [])].sort();
const actualRejected = [...(probe.summary?.rejectedSlugs || [])].sort();

if (JSON.stringify(actualParser) !== JSON.stringify(expectedParser)) blocks.push("parser_slug_set_mismatch");
if (JSON.stringify(actualRendered) !== JSON.stringify(expectedRendered)) blocks.push("rendered_slug_set_mismatch");
if (JSON.stringify(actualReview) !== JSON.stringify(expectedReview)) blocks.push("review_slug_set_mismatch");
if (JSON.stringify(actualRejected) !== JSON.stringify(expectedRejected)) blocks.push("rejected_slug_set_mismatch");

const bySlug = Object.fromEntries(rows.map(row => [row.slug, row]));

if (bySlug["srb.1"]?.candidateSurfaceStatus !== "candidate_surface_parser_planning_allowed") blocks.push("srb1_not_parser_allowed");
if (bySlug["srb.1"]?.identityStatus !== "route_identity_passed") blocks.push("srb1_identity_not_passed");
if (bySlug["srb.1"]?.surfaceStatus !== "html_table_parser_candidate") blocks.push("srb1_surface_not_html_table");
if (!(bySlug["srb.1"]?.tableCount >= 1 && bySlug["srb.1"]?.trCount >= 8)) blocks.push("srb1_table_signal_weak");

if (bySlug["lva.1"]?.candidateSurfaceStatus !== "candidate_surface_rendered_or_api_required") blocks.push("lva1_not_rendered_api");
if (bySlug["lva.1"]?.identityStatus !== "route_identity_passed") blocks.push("lva1_identity_not_passed");
if (bySlug["lva.1"]?.surfaceStatus !== "rendered_or_api_required") blocks.push("lva1_surface_not_rendered_api");

for (const slug of expectedReview) {
  const row = bySlug[slug];
  if (!row) blocks.push(`missing_${slug}`);
  else {
    if (row.candidateSurfaceStatus !== "candidate_surface_identity_review_required") blocks.push(`review_status_bad_${slug}`);
    if (row.identityStatus !== "route_identity_needs_review") blocks.push(`review_identity_bad_${slug}`);
    if (!Array.isArray(row.identityBlocks) || !row.identityBlocks.includes("root_route_weak_competition_identity")) blocks.push(`review_missing_root_weak_block_${slug}`);
  }
}

for (const slug of expectedRejected) {
  const row = bySlug[slug];
  if (!row) blocks.push(`missing_${slug}`);
  else {
    if (row.candidateSurfaceStatus !== "candidate_surface_rejected") blocks.push(`rejected_status_bad_${slug}`);
    if (slug === "lva.2" && row.identityStatus !== "route_identity_rejected") blocks.push("lva2_identity_not_rejected");
    if ((slug === "mne.1" || slug === "mne.2") && row.surfaceStatus !== "no_parseable_surface_detected") blocks.push(`mne_surface_not_no_parseable_${slug}`);
  }
}

for (const row of rows) {
  if (!(row.fetchStatus >= 200 && row.fetchStatus < 400)) blocks.push(`fetch_status_bad_${row.slug}`);
  if (!(row.bodyLength >= 500)) blocks.push(`body_too_short_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${row.slug}`);
  if (row.routeClaimMadeNow !== false) blocks.push(`route_claim_${row.slug}`);
  if (row.familyClaimMadeNow !== false) blocks.push(`family_claim_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_${row.slug}`);
}

const guardrails = probe.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 7) blocks.push("fetch_executed_not_7");
if (guardrails.controlledRouteCandidateIdentitySurfaceFetchExecutedNowCount !== 7) blocks.push("controlled_identity_surface_fetch_not_7");
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
  runner: "verify_bulk_batch_route_candidate_identity_surface_probe",
  contractVersion: 1,
  batchIndex,
  probePath: rel(probePath),
  probeRowsPath: rel(probeRowsPath),
  discoveryVerificationPath: rel(discoveryVerificationPath),
  verificationPath: rel(verificationPath),
  probeSha256: await sha256(probePath),
  probeRowsSha256: await sha256(probeRowsPath),
  discoveryVerificationSha256: await sha256(discoveryVerificationPath),
  verified: {
    batchIndex,
    targetCount: probe.summary.targetCount,
    attemptedFetchCount: probe.summary.attemptedFetchCount,
    parserPlanningAllowedCount: probe.summary.parserPlanningAllowedCount,
    renderedOrApiRequiredCount: probe.summary.renderedOrApiRequiredCount,
    identityReviewRequiredCount: probe.summary.identityReviewRequiredCount,
    rejectedCount: probe.summary.rejectedCount,
    parserPlanningAllowedSlugs: probe.summary.parserPlanningAllowedSlugs,
    renderedOrApiRequiredSlugs: probe.summary.renderedOrApiRequiredSlugs,
    identityReviewRequiredSlugs: probe.summary.identityReviewRequiredSlugs,
    rejectedSlugs: probe.summary.rejectedSlugs,
    identityStatusCounts: probe.summary.identityStatusCounts,
    surfaceStatusCounts: probe.summary.surfaceStatusCounts,
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
  conclusion: "Bulk batch 2 route-candidate identity/surface probe is verified. Only srb.1 may enter HTML-table parser planning; lva.1 requires rendered/API planning; mda.1 and mda.2 require identity review; lva.2, mne.1, and mne.2 are rejected for this lane. No route/family truth claim, canonical write, lifecycle write, production write, truth assertion, or raw payload commit was executed.",
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
