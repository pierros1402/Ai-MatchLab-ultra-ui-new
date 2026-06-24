import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const diagnosticPath = path.join(root, "data", "football-truth", "_diagnostics", `zero-played-start-date-evidence-diagnostic-${today}`, `zero-played-start-date-evidence-diagnostic-${today}.json`);
const diagnosticRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `zero-played-start-date-evidence-diagnostic-${today}`, `zero-played-start-date-evidence-diagnostic-rows-${today}.jsonl`);
const srbZeroPlayedVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-srb1-html-table-extraction-diagnostic-verification-${today}`, `bulk-batch-srb1-html-table-extraction-diagnostic-batch-002-verification-${today}.json`);
const genericProofVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-verification-${today}`, `bulk-batch-generic-standings-extraction-proof-batch-001-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `zero-played-start-date-evidence-diagnostic-verification-${today}`);
const verificationPath = path.join(verificationDir, `zero-played-start-date-evidence-diagnostic-verification-${today}.json`);

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
const diagnostic = JSON.parse(await fs.readFile(diagnosticPath, "utf8"));
const rows = parseJsonl(await fs.readFile(diagnosticRowsPath, "utf8"));
const srbVerification = JSON.parse(await fs.readFile(srbZeroPlayedVerificationPath, "utf8"));
const genericProofVerification = JSON.parse(await fs.readFile(genericProofVerificationPath, "utf8"));

if (srbVerification.status !== "passed") blocks.push("srb_zero_played_verification_not_passed");
if (genericProofVerification.status !== "passed") blocks.push("generic_proof_verification_not_passed");
if (!genericProofVerification.verified?.proofPassedZeroPlayedSlugs?.includes("jpn.2")) blocks.push("jpn2_zero_played_proof_not_verified");
if (!srbVerification.verified?.proofShapePassedZeroPlayedSlugs?.includes("srb.1")) blocks.push("srb1_zero_played_proof_not_verified");

if (diagnostic.status !== "passed") blocks.push("diagnostic_not_passed");
if (diagnostic.runner !== "zero_played_start_date_evidence_diagnostic") blocks.push("runner_mismatch");
if (diagnostic.summary?.targetCount !== 2) blocks.push("target_count_not_2");
if (diagnostic.summary?.attemptedFetchCount !== 10) blocks.push("attempted_fetch_count_not_10");
if (diagnostic.summary?.candidateFoundCount !== 0) blocks.push("candidate_found_count_not_0");
if (diagnostic.summary?.noCandidateCount !== 2) blocks.push("no_candidate_count_not_2");
if (JSON.stringify([...(diagnostic.summary?.noCandidateSlugs || [])].sort()) !== JSON.stringify(["jpn.2", "srb.1"].sort())) blocks.push("no_candidate_slug_set_bad");
if ((diagnostic.summary?.candidateFoundSlugs || []).length !== 0) blocks.push("candidate_found_slugs_not_empty");
if (rows.length !== 2) blocks.push("rows_not_2");

for (const row of rows) {
  if (!["jpn.2", "srb.1"].includes(row.slug)) blocks.push(`unexpected_slug_${row.slug}`);
  if (row.lifecycleEvidenceStatus !== "no_governed_start_date_candidate_found") blocks.push(`unexpected_lifecycle_status_${row.slug}`);
  if (row.selectedStartDateCandidate !== null) blocks.push(`selected_candidate_not_null_${row.slug}`);
  if (row.dateCandidateCount !== 0) blocks.push(`date_candidate_count_not_zero_${row.slug}`);
  if (!Array.isArray(row.topDateCandidates) || row.topDateCandidates.length !== 0) blocks.push(`top_candidates_not_empty_${row.slug}`);
  if (!Array.isArray(row.fetches) || row.fetches.length !== 5) blocks.push(`fetch_count_not_5_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_${row.slug}`);

  for (const fetch of row.fetches || []) {
    if (fetch.hostAllowed !== true) blocks.push(`host_not_allowed_${row.slug}`);
    if (fetch.hasChallenge !== false) blocks.push(`challenge_detected_${row.slug}`);
    if (fetch.dateCandidateCount !== 0) blocks.push(`fetch_date_candidate_count_not_zero_${row.slug}`);
  }
}

const guardrails = diagnostic.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 10) blocks.push("fetch_executed_not_10");
if (guardrails.controlledOfficialLifecycleEvidenceFetchExecutedNowCount !== 10) blocks.push("controlled_lifecycle_fetch_not_10");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_count_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_count_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_count_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_count_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_zero_played_start_date_evidence_diagnostic",
  contractVersion: 1,
  diagnosticPath: rel(diagnosticPath),
  diagnosticRowsPath: rel(diagnosticRowsPath),
  verificationPath: rel(verificationPath),
  srbZeroPlayedVerificationPath: rel(srbZeroPlayedVerificationPath),
  genericProofVerificationPath: rel(genericProofVerificationPath),
  diagnosticSha256: await sha256(diagnosticPath),
  diagnosticRowsSha256: await sha256(diagnosticRowsPath),
  srbZeroPlayedVerificationSha256: await sha256(srbZeroPlayedVerificationPath),
  genericProofVerificationSha256: await sha256(genericProofVerificationPath),
  verified: {
    targetCount: diagnostic.summary.targetCount,
    attemptedFetchCount: diagnostic.summary.attemptedFetchCount,
    candidateFoundCount: diagnostic.summary.candidateFoundCount,
    noCandidateCount: diagnostic.summary.noCandidateCount,
    candidateFoundSlugs: diagnostic.summary.candidateFoundSlugs,
    noCandidateSlugs: diagnostic.summary.noCandidateSlugs,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    searchExecutedNowCount: guardrails.searchExecutedNowCount,
    lifecycleWriteExecutedNowCount: guardrails.lifecycleWriteExecutedNowCount,
    canonicalWriteExecutedNowCount: guardrails.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Zero-played start-date evidence diagnostic is verified. jpn.2 and srb.1 have valid zero-played standings evidence, but no governed official start-date candidate was accepted from the controlled official pages. Both remain in bounded lifecycle-evidence refresh, with no lifecycle/canonical/production/truth write.",
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
