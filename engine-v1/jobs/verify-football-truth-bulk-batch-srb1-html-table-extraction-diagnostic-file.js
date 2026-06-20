import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchArg = process.argv.find(arg => arg.startsWith("--batch="));
const batchIndex = Number(batchArg ? batchArg.split("=")[1] : 2);
const pad = String(batchIndex).padStart(3, "0");

const diagnosticPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-srb1-html-table-extraction-diagnostic-${today}`, `bulk-batch-srb1-html-table-extraction-diagnostic-batch-${pad}-${today}.json`);
const diagnosticRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-srb1-html-table-extraction-diagnostic-${today}`, `bulk-batch-srb1-html-table-extraction-diagnostic-batch-${pad}-rows-${today}.jsonl`);
const surfaceProbeVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-route-candidate-identity-surface-probe-verification-${today}`, `bulk-batch-route-candidate-identity-surface-probe-batch-${pad}-verification-${today}.json`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-srb1-html-table-extraction-diagnostic-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-srb1-html-table-extraction-diagnostic-batch-${pad}-verification-${today}.json`);

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
const surfaceProbeVerification = JSON.parse(await fs.readFile(surfaceProbeVerificationPath, "utf8"));

if (surfaceProbeVerification.status !== "passed") blocks.push("surface_probe_verification_not_passed");
if (diagnostic.status !== "passed") blocks.push("diagnostic_not_passed");
if (diagnostic.runner !== "bulk_batch_srb1_html_table_extraction_diagnostic") blocks.push("runner_mismatch");
if (diagnostic.batchIndex !== batchIndex) blocks.push("batch_index_mismatch");
if (diagnostic.summary?.targetCount !== 1) blocks.push("target_count_not_1");
if (diagnostic.summary?.attemptedFetchCount !== 1) blocks.push("attempted_fetch_count_not_1");
if (diagnostic.summary?.proofShapePassedNonzeroCount !== 0) blocks.push("nonzero_count_not_0");
if (diagnostic.summary?.proofShapePassedZeroPlayedCount !== 1) blocks.push("zero_played_count_not_1");
if (diagnostic.summary?.parserReviewRequiredCount !== 0) blocks.push("parser_review_count_not_0");
if (JSON.stringify(diagnostic.summary?.proofShapePassedZeroPlayedSlugs || []) !== JSON.stringify(["srb.1"])) blocks.push("zero_played_slug_set_bad");
if (rows.length !== 1) blocks.push("rows_not_1");

const row = rows[0];
if (!row || row.slug !== "srb.1") blocks.push("missing_srb1_row");
else {
  if (!(row.fetchStatus >= 200 && row.fetchStatus < 400)) blocks.push("fetch_status_bad");
  if (row.tableCount !== 1) blocks.push("table_count_not_1");
  if (row.selectedTableRowCount !== 15) blocks.push("selected_table_row_count_not_15");
  if (row.extractedStandingRowCount !== 14) blocks.push("extracted_row_count_not_14");
  if (row.minPlayed !== 0 || row.maxPlayed !== 0) blocks.push("played_bounds_not_zero");
  if (row.arithmeticPassedRowCount !== 14) blocks.push("arithmetic_passed_count_not_14");
  if (row.arithmeticFailedRowCount !== 0) blocks.push("arithmetic_failed_not_0");
  if (row.duplicateTeamNameCount !== 0) blocks.push("duplicate_team_count_not_0");
  if (row.extractionDiagnosticStatus !== "proof_shape_passed_zero_played_table_needs_start_date_lane") blocks.push("zero_played_status_bad");
  if (!Array.isArray(row.validationBlocks) || !row.validationBlocks.includes("all_rows_zero_played") || !row.validationBlocks.includes("all_rows_zero_points")) blocks.push("zero_played_blocks_missing");
  if (!Array.isArray(row.standingsRows) || row.standingsRows.length !== 14) blocks.push("standings_rows_not_14");

  for (const standingRow of row.standingsRows || []) {
    if (standingRow.arithmeticPassed !== true) blocks.push(`standing_arithmetic_bad_${standingRow.position}`);
    if (standingRow.played !== 0 || standingRow.points !== 0) blocks.push(`standing_not_zero_${standingRow.position}`);
  }

  if (row.acceptedNow !== false) blocks.push("accepted_now_true");
  if (row.canonicalWriteExecutedNow !== false) blocks.push("canonical_write_true");
  if (row.lifecycleWriteExecutedNow !== false) blocks.push("lifecycle_write_true");
  if (row.productionWriteExecutedNow !== false) blocks.push("production_write_true");
  if (row.truthAssertionExecutedNow !== false) blocks.push("truth_assertion_true");
  if (row.rawPayloadWritten !== false) blocks.push("raw_payload_written_true");
  if (row.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_true");
}

const guardrails = diagnostic.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 1) blocks.push("fetch_executed_not_1");
if (guardrails.controlledHtmlTableExtractionFetchExecutedNowCount !== 1) blocks.push("controlled_fetch_not_1");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_count_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_count_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_count_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_count_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_guardrail_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_guardrail_not_false");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_srb1_html_table_extraction_diagnostic",
  contractVersion: 1,
  batchIndex,
  diagnosticPath: rel(diagnosticPath),
  diagnosticRowsPath: rel(diagnosticRowsPath),
  surfaceProbeVerificationPath: rel(surfaceProbeVerificationPath),
  verificationPath: rel(verificationPath),
  diagnosticSha256: await sha256(diagnosticPath),
  diagnosticRowsSha256: await sha256(diagnosticRowsPath),
  surfaceProbeVerificationSha256: await sha256(surfaceProbeVerificationPath),
  verified: {
    batchIndex,
    targetCount: diagnostic.summary.targetCount,
    attemptedFetchCount: diagnostic.summary.attemptedFetchCount,
    proofShapePassedNonzeroCount: diagnostic.summary.proofShapePassedNonzeroCount,
    proofShapePassedZeroPlayedCount: diagnostic.summary.proofShapePassedZeroPlayedCount,
    parserReviewRequiredCount: diagnostic.summary.parserReviewRequiredCount,
    proofShapePassedZeroPlayedSlugs: diagnostic.summary.proofShapePassedZeroPlayedSlugs,
    extractedStandingRowCount: row?.extractedStandingRowCount ?? null,
    selectedTableRowCount: row?.selectedTableRowCount ?? null,
    minPlayed: row?.minPlayed ?? null,
    maxPlayed: row?.maxPlayed ?? null,
    validationBlocksBySlug: diagnostic.summary.validationBlocksBySlug,
    fetchExecutedNowCount: guardrails.fetchExecutedNowCount,
    searchExecutedNowCount: guardrails.searchExecutedNowCount,
    canonicalWriteExecutedNowCount: guardrails.canonicalWriteExecutedNowCount,
    lifecycleWriteExecutedNowCount: guardrails.lifecycleWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "srb.1 HTML-table extraction diagnostic is verified as a valid zero-played standings table. It must enter the start-date/lifecycle lane before any candidate acceptance. No canonical, lifecycle, production, truth, or raw-payload write was executed.",
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
