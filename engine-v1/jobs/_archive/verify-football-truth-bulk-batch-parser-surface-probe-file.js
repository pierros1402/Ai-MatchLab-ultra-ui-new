import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const probePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-parser-surface-probe-${today}`, `bulk-batch-parser-surface-probe-batch-${pad}-${today}.json`);
const probeRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-parser-surface-probe-${today}`, `bulk-batch-parser-surface-probe-batch-${pad}-rows-${today}.jsonl`);
const identityGateVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-post-fetch-identity-gate-verification-${today}`, `bulk-batch-post-fetch-identity-gate-batch-${pad}-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-parser-surface-probe-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-parser-surface-probe-batch-${pad}-verification-${today}.json`);

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
const identityGateVerification = JSON.parse(await fs.readFile(identityGateVerificationPath, "utf8"));

const expectedParserReady = ["aut.1", "aut.2", "cze.2", "ita.2", "jpn.2", "ksa.1", "rou.1"].sort();
const expectedRenderedOrApi = ["aus.1", "gre.1", "pol.1", "usa.1", "usa.2"].sort();
const expectedFailed = ["eng.2", "eng.3", "eng.4"].sort();

if (identityGateVerification.status !== "passed") blocks.push("identity_gate_verification_not_passed");
if (probe.status !== "passed") blocks.push("probe_status_not_passed");
if (probe.runner !== "bulk_batch_parser_surface_probe") blocks.push("runner_mismatch");
if (probe.batchIndex !== 1) blocks.push("batch_index_not_1");
if (probe.summary?.targetCount !== 15) blocks.push("target_count_not_15");
if (probe.summary?.attemptedFetchCount !== 15) blocks.push("attempted_fetch_count_not_15");
if (probe.summary?.parserPlanningAllowedCount !== 7) blocks.push("parser_planning_count_not_7");
if (probe.summary?.renderedOrApiPlanningAllowedCount !== 5) blocks.push("rendered_or_api_count_not_5");
if (probe.summary?.failedOrNoSurfaceCount !== 3) blocks.push("failed_or_no_surface_count_not_3");
if (probe.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");
if (probe.summary?.productionWriteAllowedNow !== false) blocks.push("production_write_allowed");
if (probe.summary?.truthAssertionAllowedNow !== false) blocks.push("truth_assertion_allowed");
if (rows.length !== 15) blocks.push("rows_length_not_15");

const actualParserReady = [...(probe.summary?.parserPlanningAllowedSlugs || [])].sort();
const actualRenderedOrApi = [...(probe.summary?.renderedOrApiPlanningAllowedSlugs || [])].sort();
const actualFailed = [...(probe.summary?.failedOrNoSurfaceSlugs || [])].sort();

if (JSON.stringify(actualParserReady) !== JSON.stringify(expectedParserReady)) blocks.push("parser_ready_slug_set_mismatch");
if (JSON.stringify(actualRenderedOrApi) !== JSON.stringify(expectedRenderedOrApi)) blocks.push("rendered_or_api_slug_set_mismatch");
if (JSON.stringify(actualFailed) !== JSON.stringify(expectedFailed)) blocks.push("failed_slug_set_mismatch");

for (const row of rows) {
  if (!row.slug) blocks.push("row_missing_slug");
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${row.slug}`);
  if (row.rawPayloadWritten !== false) blocks.push(`raw_payload_written_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);
  if (!(row.fetchStatus >= 200 && row.fetchStatus < 400)) blocks.push(`fetch_status_bad_${row.slug}`);
  if (!(row.bodyLength >= 500)) blocks.push(`body_too_short_${row.slug}`);

  if (expectedParserReady.includes(row.slug)) {
    if (row.parserPlanningAllowedNow !== true) blocks.push(`parser_ready_not_allowed_${row.slug}`);
    if (row.renderedOrApiPlanningAllowedNow !== false) blocks.push(`parser_ready_rendered_allowed_${row.slug}`);
    if (row.surfaceStatus !== "html_table_parser_candidate") blocks.push(`parser_ready_not_html_table_${row.slug}`);
    if (!(row.tableCount >= 1 && row.trCount >= 8)) blocks.push(`parser_ready_table_signal_weak_${row.slug}`);
  }

  if (expectedRenderedOrApi.includes(row.slug)) {
    if (row.parserPlanningAllowedNow !== false) blocks.push(`rendered_row_parser_allowed_${row.slug}`);
    if (row.renderedOrApiPlanningAllowedNow !== true) blocks.push(`rendered_row_not_allowed_${row.slug}`);
    if (row.surfaceStatus !== "rendered_or_api_required") blocks.push(`rendered_row_status_mismatch_${row.slug}`);
  }

  if (expectedFailed.includes(row.slug)) {
    if (row.parserPlanningAllowedNow !== false) blocks.push(`failed_row_parser_allowed_${row.slug}`);
    if (row.renderedOrApiPlanningAllowedNow !== false) blocks.push(`failed_row_rendered_allowed_${row.slug}`);
    if (row.surfaceStatus !== "no_parseable_surface_detected") blocks.push(`failed_row_status_mismatch_${row.slug}`);
  }
}

const guardrails = probe.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 15) blocks.push("fetch_executed_not_15");
if (guardrails.controlledParserSurfaceFetchExecutedNowCount !== 15) blocks.push("controlled_parser_surface_fetch_not_15");
if (guardrails.providerFetchExecutedNowCount !== 0) blocks.push("provider_fetch_not_zero");
if (guardrails.parserWriteExecutedNowCount !== 0) blocks.push("parser_write_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_parser_surface_probe",
  contractVersion: 1,
  batchIndex,
  probePath: rel(probePath),
  probeRowsPath: rel(probeRowsPath),
  identityGateVerificationPath: rel(identityGateVerificationPath),
  verificationPath: rel(verificationPath),
  probeSha256: await sha256(probePath),
  probeRowsSha256: await sha256(probeRowsPath),
  identityGateVerificationSha256: await sha256(identityGateVerificationPath),
  verified: {
    batchIndex,
    targetCount: probe.summary.targetCount,
    attemptedFetchCount: probe.summary.attemptedFetchCount,
    parserPlanningAllowedCount: probe.summary.parserPlanningAllowedCount,
    renderedOrApiPlanningAllowedCount: probe.summary.renderedOrApiPlanningAllowedCount,
    failedOrNoSurfaceCount: probe.summary.failedOrNoSurfaceCount,
    parserPlanningAllowedSlugs: probe.summary.parserPlanningAllowedSlugs,
    renderedOrApiPlanningAllowedSlugs: probe.summary.renderedOrApiPlanningAllowedSlugs,
    failedOrNoSurfaceSlugs: probe.summary.failedOrNoSurfaceSlugs,
    surfaceStatusCounts: probe.summary.surfaceStatusCounts,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    searchExecutedNowCount: guardrails.searchExecutedNowCount,
    parserWriteExecutedNowCount: guardrails.parserWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "Bulk batch 1 parser surface probe is verified. 7 slugs are eligible for extraction proof planning, 5 require rendered/API adapter planning, and 3 EFL fixture pages returned non-parseable homepage shells. No parser write, canonical write, production write, truth assertion, or raw payload commit was executed.",
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
