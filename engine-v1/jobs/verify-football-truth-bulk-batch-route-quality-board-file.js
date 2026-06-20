import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
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

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const reuse = JSON.parse(await fs.readFile(reusePath, "utf8"));
const reuseRows = parseJsonl(await fs.readFile(reuseRowsPath, "utf8"));
const quality = JSON.parse(await fs.readFile(qualityPath, "utf8"));
const qualityRows = parseJsonl(await fs.readFile(qualityRowsPath, "utf8"));
const hygiene = JSON.parse(await fs.readFile(hygienePath, "utf8"));

const expectedRejected = ["ita.2", "cze.2", "den.2", "ksa.1", "aus.2", "rou.1"].sort();

if (reuse.status !== "passed") blocks.push("reuse_board_not_passed");
if (quality.status !== "passed") blocks.push("quality_board_not_passed");
if (reuse.summary?.targetCount !== 40) blocks.push("reuse_target_count_not_40");
if (quality.summary?.targetCount !== 40) blocks.push("quality_target_count_not_40");
if (reuseRows.length !== 40) blocks.push("reuse_rows_not_40");
if (qualityRows.length !== 40) blocks.push("quality_rows_not_40");

if (reuse.summary?.cooccurrenceOnlyEvidenceAcceptedCount !== 0) blocks.push("reuse_cooccurrence_evidence_accepted");
if (reuse.summary?.familyClaimMadeNowCount !== 0) blocks.push("reuse_family_claim_made");
if (reuse.summary?.routeClaimMadeNowCount !== 0) blocks.push("reuse_route_claim_made");

if (quality.summary?.readyForControlledFetchVerificationCount !== 34) blocks.push("ready_count_not_34");
if (quality.summary?.needsControlledOfficialRouteDiscoveryCount !== 6) blocks.push("needs_discovery_count_not_6");
if (quality.summary?.cooccurrenceOnlyEvidenceAcceptedCount !== 0) blocks.push("quality_cooccurrence_evidence_accepted");
if (quality.summary?.familyClaimMadeNowCount !== 0) blocks.push("quality_family_claim_made");
if (quality.summary?.routeClaimMadeNowCount !== 0) blocks.push("quality_route_claim_made");

const actualRejected = [...(quality.summary?.rejectedOrNeedsDiscoverySlugs || [])].sort();
if (JSON.stringify(actualRejected) !== JSON.stringify(expectedRejected)) blocks.push("rejected_slug_set_mismatch");

if (hygiene.status !== "passed") blocks.push("hygiene_not_passed");
if (hygiene.ruleSet?.aggregateDiagnosticsCannotAssignSourceFamily !== true) blocks.push("hygiene_no_family_rule_missing");
if (hygiene.ruleSet?.familyAssignmentRequiresPerSlugRouteEvidence !== true) blocks.push("hygiene_per_slug_rule_missing");
if (hygiene.ruleSet?.routeUrlMustBeExplicitFieldNotTextCooccurrence !== true) blocks.push("hygiene_route_explicit_rule_missing");

const badUrlPatterns = [/bbc\.co\.uk/i, /wikipedia\.org/i, /\/news\/?$/i, /__cf_chl/i, /%3c|%3e|<|>/i, /spanish-la-liga/i];

for (const row of qualityRows) {
  if (!["ready_for_controlled_fetch_verification", "needs_controlled_official_route_discovery"].includes(row.routeQualityStatus)) {
    blocks.push(`invalid_status_${row.slug}`);
  }

  if (row.cooccurrenceOnlyEvidenceAccepted !== false) blocks.push(`cooccurrence_accepted_${row.slug}`);
  if (row.familyClaimMadeNow !== false) blocks.push(`family_claim_made_${row.slug}`);
  if (row.routeClaimMadeNow !== false) blocks.push(`route_claim_made_${row.slug}`);
  if (row.fetchAllowedByThisBoard !== false) blocks.push(`fetch_allowed_${row.slug}`);
  if (row.productionWriteAllowedByThisBoard !== false) blocks.push(`production_allowed_${row.slug}`);
  if (row.truthAssertionAllowedByThisBoard !== false) blocks.push(`truth_allowed_${row.slug}`);
  if (row.fetchVerificationRequiredBeforeCandidateWrite !== true) blocks.push(`fetch_verification_not_required_${row.slug}`);

  if (row.routeQualityStatus === "ready_for_controlled_fetch_verification") {
    if (!row.selectedUrl) blocks.push(`ready_missing_url_${row.slug}`);
    if (!row.selectedHost) blocks.push(`ready_missing_host_${row.slug}`);
    if (!row.selectedEvidenceFile) blocks.push(`ready_missing_evidence_file_${row.slug}`);
    if (!row.selectedRouteKind) blocks.push(`ready_missing_route_kind_${row.slug}`);

    for (const pattern of badUrlPatterns) {
      if (pattern.test(row.selectedUrl || "")) blocks.push(`bad_selected_url_${row.slug}`);
    }
  } else {
    if (row.selectedUrl !== null) blocks.push(`discovery_row_has_url_${row.slug}`);
    if (row.selectedHost !== null) blocks.push(`discovery_row_has_host_${row.slug}`);
    if (row.selectedEvidenceFile !== null) blocks.push(`discovery_row_has_evidence_${row.slug}`);
    if (!expectedRejected.includes(row.slug)) blocks.push(`unexpected_discovery_slug_${row.slug}`);
  }
}

for (const key of ["searchExecutedNowCount","fetchExecutedNowCount","providerFetchExecutedNowCount","canonicalWriteExecutedNowCount","lifecycleWriteExecutedNowCount","productionWriteExecutedNowCount","truthAssertionExecutedNowCount"]) {
  if ((reuse.guardrails || {})[key] !== 0) blocks.push(`reuse_guardrail_${key}_not_zero`);
  if ((quality.guardrails || {})[key] !== 0) blocks.push(`quality_guardrail_${key}_not_zero`);
}
if (reuse.guardrails?.rawPayloadCommitted !== false) blocks.push("reuse_raw_payload_committed");
if (reuse.guardrails?.fullRawPayloadWritten !== false) blocks.push("reuse_full_raw_payload_written");
if (quality.guardrails?.rawPayloadCommitted !== false) blocks.push("quality_raw_payload_committed");
if (quality.guardrails?.fullRawPayloadWritten !== false) blocks.push("quality_full_raw_payload_written");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_route_quality_board",
  contractVersion: 1,
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
    readyForControlledFetchVerificationCount: quality.summary.readyForControlledFetchVerificationCount,
    needsControlledOfficialRouteDiscoveryCount: quality.summary.needsControlledOfficialRouteDiscoveryCount,
    rejectedOrNeedsDiscoverySlugs: quality.summary.rejectedOrNeedsDiscoverySlugs,
    expectedRejectedSlugs: expectedRejected,
    cooccurrenceOnlyEvidenceAcceptedCount: quality.summary.cooccurrenceOnlyEvidenceAcceptedCount,
    familyClaimMadeNowCount: quality.summary.familyClaimMadeNowCount,
    routeClaimMadeNowCount: quality.summary.routeClaimMadeNowCount,
    fetchExecutedNowCount: quality.guardrails.fetchExecutedNowCount,
    productionWriteExecutedNowCount: quality.guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: quality.guardrails.truthAssertionExecutedNowCount,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Bulk batch 1 route-quality board is verified. 34 routes are ready only for controlled fetch verification; 6 slugs require controlled official route discovery. No family/route truth claim was made from diagnostics.",
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
