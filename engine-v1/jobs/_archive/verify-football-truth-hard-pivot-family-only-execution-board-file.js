import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const rootCausePath = path.join(root, "data", "football-truth", "_diagnostics", `extraction-validation-failure-root-cause-board-${today}`, `extraction-validation-failure-root-cause-board-${today}.json`);
const rootCauseRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `extraction-validation-failure-root-cause-board-${today}`, `extraction-validation-failure-root-cause-board-rows-${today}.jsonl`);

const pivotPath = path.join(root, "data", "football-truth", "_diagnostics", `hard-pivot-family-only-execution-board-${today}`, `hard-pivot-family-only-execution-board-${today}.json`);
const pivotRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `hard-pivot-family-only-execution-board-${today}`, `hard-pivot-family-only-execution-board-rows-${today}.jsonl`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `hard-pivot-family-only-execution-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `hard-pivot-family-only-execution-board-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];

const rootCause = JSON.parse(await fs.readFile(rootCausePath, "utf8"));
const rootCauseRows = parseJsonl(await fs.readFile(rootCauseRowsPath, "utf8"));
const pivot = JSON.parse(await fs.readFile(pivotPath, "utf8"));
const pivotRows = parseJsonl(await fs.readFile(pivotRowsPath, "utf8"));

if (rootCause.status !== "passed") blocks.push("root_cause_status_not_passed");
if (rootCause.contractVersion !== 1) blocks.push("root_cause_contract_version_not_1");
if (rootCause.summary?.inputValidationRowCount !== 9) blocks.push("root_cause_input_validation_row_count_not_9");
if (rootCause.summary?.boardRowCount !== 9) blocks.push("root_cause_board_row_count_not_9");
if (rootCauseRows.length !== 9) blocks.push("root_cause_rows_count_not_9");
if (rootCause.summary?.validatedRowCount !== 2) blocks.push("root_cause_validated_row_count_not_2");
if (rootCause.summary?.validatedSlugCount !== 1) blocks.push("root_cause_validated_slug_count_not_1");
if (rootCause.summary?.reusableFamilyCandidateRowCount !== 8) blocks.push("root_cause_reusable_candidate_row_count_not_8");
if (rootCause.summary?.reusableRepairFamilyCount !== 4) blocks.push("root_cause_reusable_repair_family_count_not_4");
if (rootCause.summary?.acceptedNowCount !== 0) blocks.push("root_cause_accepted_now_not_zero");

const rootGuardrails = rootCause.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (rootGuardrails[key] !== 0) blocks.push(`root_cause_guardrail_${key}_not_zero`);
}
if (rootGuardrails.rawPayloadCommitted !== false) blocks.push("root_cause_raw_payload_committed_not_false");
if (rootGuardrails.fullRawPayloadWritten !== false) blocks.push("root_cause_full_raw_payload_written_not_false");

if (pivot.status !== "passed") blocks.push("pivot_status_not_passed");
if (pivot.contractVersion !== 1) blocks.push("pivot_contract_version_not_1");
if (pivot.decision?.genericOfficialCrawlerViableAsPrimaryStrategy !== false) blocks.push("generic_crawler_not_marked_false");
if (pivot.decision?.primaryStrategyFromNow !== "family_only_deterministic_source_contracts") blocks.push("primary_strategy_not_family_only");
if (!Array.isArray(pivot.decision?.stopRules) || pivot.decision.stopRules.length < 5) blocks.push("stop_rules_missing_or_too_short");
if (!Array.isArray(pivot.decision?.nextExecutionRules) || pivot.decision.nextExecutionRules.length < 4) blocks.push("next_execution_rules_missing_or_too_short");

if (pivot.summary?.reusableFamilyCount !== 9) blocks.push("pivot_reusable_family_count_not_9");
if (pivot.summary?.targetSlugCountFromKnownFamilies !== 16) blocks.push("pivot_target_slug_count_not_16");
if (pivot.summary?.acceptedNowCount !== 0) blocks.push("pivot_accepted_now_not_zero");
if (pivotRows.length !== 9) blocks.push("pivot_rows_count_not_9");

const expectedOrder = [
  "laliga_official",
  "bundesliga_dfb_rendered",
  "spfl_official_rendered",
  "norway_ntf",
  "torneopal_veikkausliiga",
  "ksi_iceland",
  "sportomedia_sef",
  "loi_ajax",
  "cfa_cyprus_html"
];

const order = pivot.summary?.firstExecutionFamilyOrder || [];
if (JSON.stringify(order) !== JSON.stringify(expectedOrder)) blocks.push("pivot_family_order_mismatch");

const pivotGuardrails = pivot.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (pivotGuardrails[key] !== 0) blocks.push(`pivot_guardrail_${key}_not_zero`);
}
if (pivotGuardrails.rawPayloadCommitted !== false) blocks.push("pivot_raw_payload_committed_not_false");
if (pivotGuardrails.fullRawPayloadWritten !== false) blocks.push("pivot_full_raw_payload_written_not_false");

for (const row of pivotRows) {
  if (row.acceptanceAllowedNow !== false) blocks.push(`pivot_row_acceptance_allowed_${row.familyKey}`);
  if (row.reviewOnly !== true) blocks.push(`pivot_row_not_review_only_${row.familyKey}`);
  if (row.canonicalWriteExecutedNowCount !== 0) blocks.push(`pivot_row_canonical_write_not_zero_${row.familyKey}`);
  if (row.truthAssertionExecutedNowCount !== 0) blocks.push(`pivot_row_truth_not_zero_${row.familyKey}`);
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_hard_pivot_family_only_execution_board",
  contractVersion: 1,
  rootCausePath: path.relative(root, rootCausePath).replaceAll("\\", "/"),
  rootCauseRowsPath: path.relative(root, rootCauseRowsPath).replaceAll("\\", "/"),
  pivotPath: path.relative(root, pivotPath).replaceAll("\\", "/"),
  pivotRowsPath: path.relative(root, pivotRowsPath).replaceAll("\\", "/"),
  rootCauseSha256: await sha256(rootCausePath),
  rootCauseRowsSha256: await sha256(rootCauseRowsPath),
  pivotSha256: await sha256(pivotPath),
  pivotRowsSha256: await sha256(pivotRowsPath),
  verified: {
    genericOfficialCrawlerViableAsPrimaryStrategy: pivot.decision.genericOfficialCrawlerViableAsPrimaryStrategy,
    primaryStrategyFromNow: pivot.decision.primaryStrategyFromNow,
    rootCauseValidatedRowCount: rootCause.summary.validatedRowCount,
    rootCauseValidatedSlugCount: rootCause.summary.validatedSlugCount,
    reusableFamilyCount: pivot.summary.reusableFamilyCount,
    targetSlugCountFromKnownFamilies: pivot.summary.targetSlugCountFromKnownFamilies,
    firstExecutionFamilyOrder: order,
    acceptedNowCount: pivot.summary.acceptedNowCount,
    guardrailsHeld: blocks.filter(block => block.includes("guardrail") || block.includes("raw_payload")).length === 0
  },
  conclusion: "Generic official crawler/probing is formally rejected as the primary strategy. Continue only family-only deterministic source contracts, and classify unsupported leagues as provider/source-acquisition needed.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  verificationPath: path.relative(root, verificationPath).replaceAll("\\", "/"),
  verified: report.verified,
  conclusion: report.conclusion,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) {
  process.exitCode = 1;
}
