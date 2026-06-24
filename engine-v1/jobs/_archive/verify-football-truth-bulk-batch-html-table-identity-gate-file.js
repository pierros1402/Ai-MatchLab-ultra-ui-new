import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const batchIndex = 1;
const pad = String(batchIndex).padStart(3, "0");

const extractionPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-extraction-diagnostic-${today}`, `bulk-batch-html-table-extraction-diagnostic-batch-${pad}-${today}.json`);
const extractionRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-extraction-diagnostic-${today}`, `bulk-batch-html-table-extraction-diagnostic-batch-${pad}-rows-${today}.jsonl`);
const gatePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-identity-gate-${today}`, `bulk-batch-html-table-identity-gate-batch-${pad}-${today}.json`);
const gateRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-identity-gate-${today}`, `bulk-batch-html-table-identity-gate-batch-${pad}-rows-${today}.jsonl`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-identity-gate-verification-${today}`);
const verificationPath = path.join(verificationDir, `bulk-batch-html-table-identity-gate-batch-${pad}-verification-${today}.json`);

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
const extraction = JSON.parse(await fs.readFile(extractionPath, "utf8"));
const extractionRows = parseJsonl(await fs.readFile(extractionRowsPath, "utf8"));
const gate = JSON.parse(await fs.readFile(gatePath, "utf8"));
const gateRows = parseJsonl(await fs.readFile(gateRowsPath, "utf8"));

const expectedPassed = ["aut.2", "jpn.2", "ksa.1"].sort();
const expectedCustom = ["cze.2", "rou.1"].sort();
const expectedRejected = ["aut.1", "ita.2"].sort();

if (extraction.status !== "passed") blocks.push("extraction_status_not_passed");
if (gate.status !== "passed") blocks.push("gate_status_not_passed");
if (gate.contractVersion !== 2) blocks.push("gate_contract_version_not_2");
if (extraction.summary?.targetCount !== 7) blocks.push("extraction_target_count_not_7");
if (extraction.summary?.attemptedFetchCount !== 7) blocks.push("extraction_fetch_count_not_7");
if (extractionRows.length !== 7) blocks.push("extraction_rows_not_7");
if (gateRows.length !== 7) blocks.push("gate_rows_not_7");

if (gate.summary?.extractionProofPlanningAllowedCount !== 3) blocks.push("proof_planning_allowed_count_not_3");
if (gate.summary?.customParserPlanningRequiredCount !== 2) blocks.push("custom_parser_count_not_2");
if (gate.summary?.rejectedForProofPlanningCount !== 2) blocks.push("rejected_count_not_2");

const actualPassed = [...(gate.summary?.extractionProofPlanningAllowedSlugs || [])].sort();
const actualCustom = [...(gate.summary?.customParserPlanningRequiredSlugs || [])].sort();
const actualRejected = [...(gate.summary?.rejectedForProofPlanningSlugs || [])].sort();

if (JSON.stringify(actualPassed) !== JSON.stringify(expectedPassed)) blocks.push("passed_slug_set_mismatch");
if (JSON.stringify(actualCustom) !== JSON.stringify(expectedCustom)) blocks.push("custom_slug_set_mismatch");
if (JSON.stringify(actualRejected) !== JSON.stringify(expectedRejected)) blocks.push("rejected_slug_set_mismatch");

for (const row of gateRows) {
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${row.slug}`);
  if (row.canonicalWriteExecutedNow !== false) blocks.push(`canonical_write_${row.slug}`);
  if (row.lifecycleWriteExecutedNow !== false) blocks.push(`lifecycle_write_${row.slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`production_write_${row.slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`truth_assertion_${row.slug}`);
  if (row.rawPayloadCommitted !== false) blocks.push(`raw_payload_committed_${row.slug}`);
  if (row.fullRawPayloadWritten !== false) blocks.push(`full_raw_payload_written_${row.slug}`);

  if (expectedPassed.includes(row.slug)) {
    if (row.extractionProofPlanningAllowedNow !== true) blocks.push(`expected_passed_not_allowed_${row.slug}`);
    if (row.tableIdentityStatus !== "standings_table_identity_passed") blocks.push(`expected_passed_status_bad_${row.slug}`);
  }

  if (expectedCustom.includes(row.slug)) {
    if (row.customParserPlanningRequired !== true) blocks.push(`expected_custom_not_marked_${row.slug}`);
    if (!["custom_standings_parser_required", "custom_fixture_parser_required"].includes(row.tableIdentityStatus)) blocks.push(`expected_custom_status_bad_${row.slug}`);
  }

  if (expectedRejected.includes(row.slug)) {
    if (row.rejectedForProofPlanning !== true) blocks.push(`expected_rejected_not_marked_${row.slug}`);
    if (row.extractionProofPlanningAllowedNow !== false) blocks.push(`expected_rejected_allowed_${row.slug}`);
  }
}

for (const key of ["searchExecutedNowCount", "providerFetchExecutedNowCount", "extractionWriteExecutedNowCount", "canonicalWriteExecutedNowCount", "lifecycleWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if ((gate.guardrails || {})[key] !== 0) blocks.push(`gate_guardrail_${key}_not_zero`);
}
if (gate.guardrails?.fetchExecutedNowCount !== 0) blocks.push("gate_fetch_not_zero");
if (gate.guardrails?.rawPayloadCommitted !== false) blocks.push("gate_raw_payload_committed");
if (gate.guardrails?.fullRawPayloadWritten !== false) blocks.push("gate_full_raw_payload_written");

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_bulk_batch_html_table_identity_gate",
  contractVersion: 2,
  batchIndex,
  extractionPath: rel(extractionPath),
  extractionRowsPath: rel(extractionRowsPath),
  gatePath: rel(gatePath),
  gateRowsPath: rel(gateRowsPath),
  verificationPath: rel(verificationPath),
  extractionSha256: await sha256(extractionPath),
  extractionRowsSha256: await sha256(extractionRowsPath),
  gateSha256: await sha256(gatePath),
  gateRowsSha256: await sha256(gateRowsPath),
  verified: {
    batchIndex,
    extractionDiagnosticTargetCount: extraction.summary.targetCount,
    extractionDiagnosticFetchCount: extraction.summary.attemptedFetchCount,
    extractionProofPlanningAllowedCount: gate.summary.extractionProofPlanningAllowedCount,
    customParserPlanningRequiredCount: gate.summary.customParserPlanningRequiredCount,
    rejectedForProofPlanningCount: gate.summary.rejectedForProofPlanningCount,
    extractionProofPlanningAllowedSlugs: gate.summary.extractionProofPlanningAllowedSlugs,
    customParserPlanningRequiredSlugs: gate.summary.customParserPlanningRequiredSlugs,
    rejectedForProofPlanningSlugs: gate.summary.rejectedForProofPlanningSlugs,
    tableIdentityStatusCounts: gate.summary.tableIdentityStatusCounts,
    fetchExecutedNowCount: gate.guardrails.fetchExecutedNowCount,
    productionWriteExecutedNowCount: gate.guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: gate.guardrails.truthAssertionExecutedNowCount,
    rawPayloadCommitted: gate.guardrails.rawPayloadCommitted,
    fullRawPayloadWritten: gate.guardrails.fullRawPayloadWritten,
    guardrailsHeld: blocks.length === 0
  },
  conclusion: "HTML table extraction diagnostic and table identity gate v2 are verified. aut.2, jpn.2, and ksa.1 are eligible for generic standings-table extraction proof planning; cze.2 and rou.1 require custom parsers; aut.1 and ita.2 are rejected for proof planning because the selected table is weak or the wrong table type.",
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
