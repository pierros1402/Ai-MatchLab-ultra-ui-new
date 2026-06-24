import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const validationPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-extraction-validation-${today}`, `official-host-extraction-validation-${today}.json`);
const validationRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `official-host-extraction-validation-${today}`, `official-host-extraction-validation-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `official-host-extraction-validation-verification-${today}`);
const verificationPath = path.join(verificationDir, `official-host-extraction-validation-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];

const validation = JSON.parse(await fs.readFile(validationPath, "utf8"));
const rows = parseJsonl(await fs.readFile(validationRowsPath, "utf8"));

if (validation.status !== "passed") blocks.push("validation_status_not_passed");
if (validation.contractVersion !== 1) blocks.push("validation_contract_version_not_1");

if (validation.summary?.inputExtractionTargetCount !== 9) blocks.push("input_extraction_target_count_not_9");
if (validation.summary?.inspectedTargetCount !== 9) blocks.push("inspected_target_count_not_9");
if (validation.summary?.inspectedSlugCount !== 6) blocks.push("inspected_slug_count_not_6");
if (rows.length !== validation.summary?.inspectedTargetCount) blocks.push("validation_rows_count_mismatch");

if (validation.summary?.fetched2xxCount !== 9) blocks.push("fetched2xx_count_not_9");
if (validation.summary?.fetchFailedCount !== 0) blocks.push("fetch_failed_count_not_zero");
if (validation.summary?.htmlTargetCount !== 8) blocks.push("html_target_count_not_8");
if (validation.summary?.jsonTargetCount !== 1) blocks.push("json_target_count_not_1");
if (validation.summary?.validationPassedTargetCount !== 2) blocks.push("validation_passed_target_count_not_2");
if (validation.summary?.validationPassedSlugCount !== 1) blocks.push("validation_passed_slug_count_not_1");
if (validation.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_count_not_zero");

const guardrails = validation.guardrails || {};
if (guardrails.allowFetch !== true) blocks.push("allow_fetch_not_true");
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 9) blocks.push("fetch_executed_not_9");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

const expectedPassed = [
  {
    slug: "aut.2",
    sourceLeague: "2. Liga Austria",
    candidateUrl: "https://www.2liga.at/de/tabelle/saison-2024-2025",
    seasonLabel: "2024-2025",
    expectedRows: 16,
    extractedRowCount: 16,
    teamSignalCount: 5,
    playedArithmeticPassCount: 16,
    pointsArithmeticPassCount: 16,
    gdArithmeticPassCount: 16
  },
  {
    slug: "aut.2",
    sourceLeague: "2. Liga Austria",
    candidateUrl: "https://www.2liga.at/de/tabelle/saison-2025-2026",
    seasonLabel: "2025-2026",
    expectedRows: 16,
    extractedRowCount: 16,
    teamSignalCount: 4,
    playedArithmeticPassCount: 16,
    pointsArithmeticPassCount: 16,
    gdArithmeticPassCount: 16
  }
];

const passed = validation.summary?.validationPassedTargets || [];
if (passed.length !== expectedPassed.length) blocks.push("validation_passed_targets_length_mismatch");

for (const expected of expectedPassed) {
  const found = passed.find(row =>
    row.slug === expected.slug &&
    row.sourceLeague === expected.sourceLeague &&
    row.candidateUrl === expected.candidateUrl &&
    row.seasonLabel === expected.seasonLabel
  );

  if (!found) {
    blocks.push(`missing_expected_passed_target_${expected.candidateUrl}`);
    continue;
  }

  for (const key of ["expectedRows", "extractedRowCount", "playedArithmeticPassCount", "pointsArithmeticPassCount", "gdArithmeticPassCount"]) {
    if (found[key] !== expected[key]) blocks.push(`passed_target_${key}_mismatch_${expected.seasonLabel}`);
  }

  if (found.teamSignalCount < expected.teamSignalCount) blocks.push(`passed_target_team_signal_too_low_${expected.seasonLabel}`);
}

const forbiddenPassedSlugs = passed.filter(row => row.slug !== "aut.2").map(row => row.slug);
if (forbiddenPassedSlugs.length > 0) blocks.push(`unexpected_passed_slugs_${[...new Set(forbiddenPassedSlugs)].join(",")}`);

const rawPayloadFields = ["body", "rawBody", "html", "rawHtml", "script", "rawPayload", "fullRawPayload"];

for (const row of rows) {
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_${row.slug}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${row.slug}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_not_false_${row.slug}`);

  for (const field of rawPayloadFields) {
    if (Object.prototype.hasOwnProperty.call(row, field)) blocks.push(`raw_payload_field_present_${field}_${row.slug}`);
  }

  if (row.bestValidationPassed === true) {
    if (row.slug !== "aut.2") blocks.push(`unexpected_row_validation_passed_${row.slug}`);
    if (row.bestExtractedRowCount !== 16) blocks.push(`passed_row_extracted_count_not_16_${row.bestSeasonLabel}`);
    if (!Array.isArray(row.bestRows) || row.bestRows.length !== 16) blocks.push(`passed_row_best_rows_not_16_${row.bestSeasonLabel}`);
    if (row.bestRowCountPass !== true) blocks.push(`passed_row_count_gate_not_true_${row.bestSeasonLabel}`);
    if (row.bestTeamSignalPass !== true) blocks.push(`passed_team_signal_gate_not_true_${row.bestSeasonLabel}`);
    if (row.bestPlayedArithmeticPassCount !== 16) blocks.push(`played_arithmetic_not_16_${row.bestSeasonLabel}`);
    if (row.bestPointsArithmeticPassCount !== 16) blocks.push(`points_arithmetic_not_16_${row.bestSeasonLabel}`);
    if (row.bestGdArithmeticPassCount !== 16) blocks.push(`gd_arithmetic_not_16_${row.bestSeasonLabel}`);
  }
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_official_host_extraction_validation",
  contractVersion: 1,
  validationPath: path.relative(root, validationPath).replaceAll("\\", "/"),
  validationRowsPath: path.relative(root, validationRowsPath).replaceAll("\\", "/"),
  validationSha256: await sha256(validationPath),
  validationRowsSha256: await sha256(validationRowsPath),
  verified: {
    inputExtractionTargetCount: validation.summary.inputExtractionTargetCount,
    inspectedTargetCount: validation.summary.inspectedTargetCount,
    inspectedSlugCount: validation.summary.inspectedSlugCount,
    fetched2xxCount: validation.summary.fetched2xxCount,
    fetchFailedCount: validation.summary.fetchFailedCount,
    validationPassedTargetCount: validation.summary.validationPassedTargetCount,
    validationPassedSlugCount: validation.summary.validationPassedSlugCount,
    validationPassedTargets: passed,
    acceptedNowCount: validation.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 9 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Exact extraction validation passed only aut.2 for seasons 2024-2025 and 2025-2026. No rows accepted or written. Next step is a proof-candidate board for explicit approval before any canonical candidate write.",
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
