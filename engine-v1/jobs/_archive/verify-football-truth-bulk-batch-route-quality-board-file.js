import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 1);
const pad = String(batchIndex).padStart(3, "0");

const reusePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-explicit-route-reuse-board-${today}`, `bulk-batch-explicit-route-reuse-board-batch-${pad}-${today}.json`);
const reuseRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-explicit-route-reuse-board-${today}`, `bulk-batch-explicit-route-reuse-board-batch-${pad}-rows-${today}.jsonl`);
const qualityPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-${today}`, `bulk-batch-route-quality-board-batch-${pad}-${today}.json`);
const qualityRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-${today}`, `bulk-batch-route-quality-board-batch-${pad}-rows-${today}.jsonl`);
const hygienePath = path.join(root, "data", "football-truth", "_diagnostics", `diagnostic-cooccurrence-hygiene-policy-${today}`, `diagnostic-cooccurrence-hygiene-policy-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-route-quality-board-batch-${pad}-verification-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function badSelectedUrl(url) {
  const s = String(url || "").toLowerCase();
  return [
    "wikipedia.org",
    "bbc.com",
    "bbc.co.uk",
    "/news/",
    "facebook.com",
    "twitter.com",
    "x.com/",
    "instagram.com",
    "youtube.com",
    "linkedin.com",
    "spanish-la-liga",
    "cloudflare"
  ].some(pattern => s.includes(pattern));
}

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const reuse = JSON.parse(await fs.readFile(reusePath, "utf8"));
const reuseRows = parseJsonl(await fs.readFile(reuseRowsPath, "utf8"));
const quality = JSON.parse(await fs.readFile(qualityPath, "utf8"));
const qualityRows = parseJsonl(await fs.readFile(qualityRowsPath, "utf8"));
const hygiene = JSON.parse(await fs.readFile(hygienePath, "utf8"));

if (reuse.status !== "passed") blocks.push("reuse_board_not_passed");
if (quality.status !== "passed") blocks.push("quality_board_not_passed");
if (reuse.batchIndex !== batchIndex) blocks.push("reuse_batch_index_mismatch");
if (quality.batchIndex !== batchIndex) blocks.push("quality_batch_index_mismatch");
if (reuse.summary?.targetCount !== 40) blocks.push("reuse_target_count_not_40");
if (quality.summary?.targetCount !== 40) blocks.push("quality_target_count_not_40");
if (reuseRows.length !== 40) blocks.push("reuse_rows_not_40");
if (qualityRows.length !== 40) blocks.push("quality_rows_not_40");
if (new Set(qualityRows.map(row => row.slug)).size !== qualityRows.length) blocks.push("duplicate_quality_slugs");

const readyRows = qualityRows.filter(row => row.routeQualityStatus === "ready_for_controlled_fetch_verification");
const discoveryRows = qualityRows.filter(row => row.routeQualityStatus === "needs_controlled_official_route_discovery");
const invalidRows = qualityRows.filter(row => !["ready_for_controlled_fetch_verification", "needs_controlled_official_route_discovery"].includes(row.routeQualityStatus));

if (invalidRows.length > 0) blocks.push("invalid_route_quality_status_rows");
if (readyRows.length + discoveryRows.length !== qualityRows.length) blocks.push("ready_discovery_sum_mismatch");
if (quality.summary?.readyForControlledFetchVerificationCount !== readyRows.length) blocks.push("ready_count_summary_mismatch");
if (quality.summary?.needsControlledOfficialRouteDiscoveryCount !== discoveryRows.length) blocks.push("discovery_count_summary_mismatch");
if (quality.summary?.rejectedOrNeedsDiscoverySlugs?.length !== discoveryRows.length) blocks.push("rejected_slug_count_mismatch");

if (reuse.summary?.cooccurrenceOnlyEvidenceAcceptedCount !== 0) blocks.push("reuse_cooccurrence_evidence_accepted");
if (reuse.summary?.familyClaimMadeNowCount !== 0) blocks.push("reuse_family_claim_made");
if (reuse.summary?.routeClaimMadeNowCount !== 0) blocks.push("reuse_route_claim_made");
if (quality.summary?.cooccurrenceOnlyEvidenceAcceptedCount !== 0) blocks.push("quality_cooccurrence_evidence_accepted");
if (quality.summary?.familyClaimMadeNowCount !== 0) blocks.push("quality_family_claim_made");
if (quality.summary?.routeClaimMadeNowCount !== 0) blocks.push("quality_route_claim_made");

if (hygiene.status !== "passed") blocks.push("hygiene_not_passed");
if (hygiene.ruleSet?.historicalDiagnosticsAreAuditOnly !== true) blocks.push("hygiene_historical_not_audit_only");
if (hygiene.ruleSet?.aggregateDiagnosticsCannotAssignSourceFamily !== true) blocks.push("hygiene_allows_family_assignment");
if (hygiene.ruleSet?.aggregateDiagnosticsCannotAssignOfficialRoute !== true) blocks.push("hygiene_allows_route_assignment");
if (hygiene.ruleSet?.familyAssignmentRequiresPerSlugRouteEvidence !== true) blocks.push("hygiene_missing_per_slug_route_rule");

for (const row of readyRows) {
  if (!row.selectedUrl) blocks.push(`ready_missing_selected_url_${row.slug}`);
  if (!row.selectedHost) blocks.push(`ready_missing_selected_host_${row.slug}`);
  if (!row.selectedEvidenceFile) blocks.push(`ready_missing_evidence_${row.slug}`);
  if (!row.selectedRouteKind) blocks.push(`ready_missing_route_kind_${row.slug}`);
  if (badSelectedUrl(row.selectedUrl)) blocks.push(`ready_bad_selected_url_${row.slug}`);
  if ((row.rejectionReasons || []).includes("cooccurrence_only")) blocks.push(`ready_cooccurrence_rejection_reason_${row.slug}`);
}

for (const row of discoveryRows) {
  if (row.selectedUrl !== null) blocks.push(`discovery_has_selected_url_${row.slug}`);
  if (row.selectedHost !== null) blocks.push(`discovery_has_host_${row.slug}`);
  if (row.selectedEvidenceFile !== null) blocks.push(`discovery_has_evidence_${row.slug}`);
}

for (const source of [reuse, quality]) {
  const guardrails = source.guardrails || {};
  for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "lifecycleWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
    if (guardrails[key] !== 0) blocks.push(`${source.runner}_${key}_not_zero`);
  }
  if (guardrails.rawPayloadCommitted !== false) blocks.push(`${source.runner}_raw_payload_committed`);
  if (guardrails.fullRawPayloadWritten !== false) blocks.push(`${source.runner}_full_raw_payload_written`);
}

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_route_quality_board",
  contractVersion: 2,
  batchIndex,
  reusePath: rel(reusePath),
  reuseRowsPath: rel(reuseRowsPath),
  qualityPath: rel(qualityPath),
  qualityRowsPath: rel(qualityRowsPath),
  hygienePath: rel(hygienePath),
  verificationPath: rel(verificationPath),
  reuseSha256: await sha256(reusePath),
  reuseRowsSha256: await sha256(reuseRowsPath),
  qualitySha256: await sha256(qualityPath),
  qualityRowsSha256: await sha256(qualityRowsPath),
  hygieneSha256: await sha256(hygienePath),
  verified: {
    batchIndex,
    targetCount: quality.summary.targetCount,
    readyForControlledFetchVerificationCount: readyRows.length,
    needsControlledOfficialRouteDiscoveryCount: discoveryRows.length,
    rejectedOrNeedsDiscoverySlugs: discoveryRows.map(row => row.slug),
    readyForControlledFetchVerificationSlugs: readyRows.map(row => row.slug),
    cooccurrenceOnlyEvidenceAcceptedCount: quality.summary.cooccurrenceOnlyEvidenceAcceptedCount,
    familyClaimMadeNowCount: quality.summary.familyClaimMadeNowCount,
    routeClaimMadeNowCount: quality.summary.routeClaimMadeNowCount,
    fetchExecutedNowCount: quality.guardrails.fetchExecutedNowCount,
    productionWriteExecutedNowCount: quality.guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: quality.guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: quality.guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: quality.guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: `Bulk batch ${batchIndex} route-quality board is verified. ${readyRows.length} routes are ready only for controlled fetch verification; ${discoveryRows.length} slugs require controlled official route discovery. No family/route truth claim was made from diagnostics.`,
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
