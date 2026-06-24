import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const fetchPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-controlled-fetch-verification-${today}`, `bulk-batch-route-controlled-fetch-verification-batch-${pad}-${today}.json`);
const fetchRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-controlled-fetch-verification-${today}`, `bulk-batch-route-controlled-fetch-verification-batch-${pad}-rows-${today}.jsonl`);
const qualityVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-quality-board-verification-${today}`, `bulk-batch-route-quality-board-batch-${pad}-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-controlled-fetch-verification-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-route-controlled-fetch-verification-batch-${pad}-verification-${today}.json`);

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
const fetchReport = JSON.parse(await fs.readFile(fetchPath, "utf8"));
const rows = parseJsonl(await fs.readFile(fetchRowsPath, "utf8"));
const qualityVerification = JSON.parse(await fs.readFile(qualityVerificationPath, "utf8"));

const expectedPassed = ["eng.2", "eng.3", "eng.4", "aut.1", "pol.1", "usa.1", "usa.2", "arg.1", "aus.1"].sort();
const expectedFailed = [
  "fra.1", "fra.2", "por.1", "por.2", "bel.1", "bel.2", "aut.2", "sui.1", "sui.2", "pol.2",
  "cze.1", "tur.1", "tur.2", "gre.1", "gre.2", "mex.1", "mex.2", "bra.1", "bra.2", "arg.2",
  "kor.1", "kor.2", "chn.1", "chn.2", "jpn.2"
].sort();

if (qualityVerification.status !== "passed") blocks.push("quality_verification_not_passed");
if (fetchReport.status !== "passed") blocks.push("fetch_report_not_passed");
if (fetchReport.runner !== "bulk_batch_route_controlled_fetch_verification") blocks.push("runner_mismatch");
if (fetchReport.batchIndex !== 1) blocks.push("batch_index_not_1");
if (fetchReport.summary?.attemptedFetchCount !== 34) blocks.push("attempted_fetch_count_not_34");
if (fetchReport.summary?.passedFetchVerificationCount !== 9) blocks.push("passed_count_not_9");
if (fetchReport.summary?.failedFetchVerificationCount !== 25) blocks.push("failed_count_not_25");
if (fetchReport.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");
if (fetchReport.summary?.productionWriteAllowedNow !== false) blocks.push("production_write_allowed");
if (fetchReport.summary?.truthAssertionAllowedNow !== false) blocks.push("truth_assertion_allowed");

const actualPassed = [...(fetchReport.summary?.passedSlugs || [])].sort();
const actualFailed = [...(fetchReport.summary?.failedSlugs || [])].sort();

if (JSON.stringify(actualPassed) !== JSON.stringify(expectedPassed)) blocks.push("passed_slug_set_mismatch");
if (JSON.stringify(actualFailed) !== JSON.stringify(expectedFailed)) blocks.push("failed_slug_set_mismatch");

if (rows.length !== 34) blocks.push("rows_length_not_34");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (row.rawPayloadWritten !== false) blocks.push(`raw_payload_written_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);

  if (expectedPassed.includes(row.slug)) {
    if (row.validationPassed !== true) blocks.push(`expected_passed_row_failed_${row.slug}`);
    if ((row.validationBlocks || []).length !== 0) blocks.push(`expected_passed_row_has_blocks_${row.slug}`);
    if (!(row.fetchStatus >= 200 && row.fetchStatus < 400)) blocks.push(`expected_passed_status_bad_${row.slug}`);
    if (row.hostMatched !== true) blocks.push(`expected_passed_host_not_matched_${row.slug}`);
    if (row.routeTermMatched !== true) blocks.push(`expected_passed_route_terms_missing_${row.slug}`);
    if (row.competitionTermMatched !== true) blocks.push(`expected_passed_competition_terms_missing_${row.slug}`);
    if (!(row.bodyLength >= 500)) blocks.push(`expected_passed_body_too_short_${row.slug}`);
  }

  if (expectedFailed.includes(row.slug)) {
    if (row.validationPassed !== false) blocks.push(`expected_failed_row_passed_${row.slug}`);
    if (!Array.isArray(row.validationBlocks) || row.validationBlocks.length === 0) blocks.push(`expected_failed_row_missing_blocks_${row.slug}`);
  }
}

const guardrails = fetchReport.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 34) blocks.push("fetch_executed_not_34");
if (guardrails.controlledRouteFetchExecutedNowCount !== 34) blocks.push("controlled_route_fetch_not_34");
if (guardrails.providerFetchExecutedNowCount !== 0) blocks.push("provider_fetch_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_guardrail_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_guardrail_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_route_controlled_fetch_verification",
  contractVersion: 1,
  batchIndex,
  fetchPath: rel(fetchPath),
  fetchRowsPath: rel(fetchRowsPath),
  qualityVerificationPath: rel(qualityVerificationPath),
  verificationPath: rel(verificationPath),
  fetchSha256: await sha256(fetchPath),
  fetchRowsSha256: await sha256(fetchRowsPath),
  qualityVerificationSha256: await sha256(qualityVerificationPath),
  verified: {
    batchIndex,
    attemptedFetchCount: fetchReport.summary.attemptedFetchCount,
    passedFetchVerificationCount: fetchReport.summary.passedFetchVerificationCount,
    failedFetchVerificationCount: fetchReport.summary.failedFetchVerificationCount,
    passedSlugs: fetchReport.summary.passedSlugs,
    failedSlugs: fetchReport.summary.failedSlugs,
    expectedPassedSlugs: expectedPassed,
    expectedFailedSlugs: expectedFailed,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    controlledRouteFetchExecutedNowCount: guardrails.controlledRouteFetchExecutedNowCount,
    searchExecutedNowCount: guardrails.searchExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Bulk batch 1 controlled fetch verification is verified. 9 routes passed live bounded fetch checks; 25 routes failed and should move to controlled route discovery or rendered/API handling. No raw payload, production write, or truth assertion was executed.",
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
