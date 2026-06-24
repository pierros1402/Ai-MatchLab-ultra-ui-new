import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-${today}`, `provider-api-standings-proof-${today}.json`);
const proofRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-${today}`, `provider-api-standings-proof-rows-${today}.jsonl`);

const failurePath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-failure-review-${today}`, `provider-api-standings-proof-failure-review-${today}.json`);
const failureRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-standings-proof-failure-review-${today}`, `provider-api-standings-proof-failure-review-rows-${today}.jsonl`);

const sweepPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-param-sweep-${today}`, `provider-api-season-param-sweep-${today}.json`);
const sweepRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-param-sweep-${today}`, `provider-api-season-param-sweep-rows-${today}.jsonl`);

const adjudicationPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-scope-adjudication-board-${today}`, `provider-api-season-scope-adjudication-board-${today}.json`);
const adjudicationRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-scope-adjudication-board-${today}`, `provider-api-season-scope-adjudication-board-rows-${today}.jsonl`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-scope-adjudication-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `provider-api-season-scope-adjudication-board-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofRows = parseJsonl(await fs.readFile(proofRowsPath, "utf8"));

const failure = JSON.parse(await fs.readFile(failurePath, "utf8"));
const failureRows = parseJsonl(await fs.readFile(failureRowsPath, "utf8"));

const sweep = JSON.parse(await fs.readFile(sweepPath, "utf8"));
const sweepRows = parseJsonl(await fs.readFile(sweepRowsPath, "utf8"));

const adjudication = JSON.parse(await fs.readFile(adjudicationPath, "utf8"));
const adjudicationRows = parseJsonl(await fs.readFile(adjudicationRowsPath, "utf8"));

if (proof.status !== "passed") blocks.push("proof_status_not_passed");
if (proof.summary?.strongMappingInputCount !== 5) blocks.push("proof_strong_mapping_input_count_not_5");
if (proof.summary?.proofRowCount !== 5) blocks.push("proof_row_count_not_5");
if (proofRows.length !== 5) blocks.push("proof_rows_length_not_5");
if (proof.summary?.providerFetchExecutedNowCount !== 5) blocks.push("proof_provider_fetch_not_5");
if (proof.summary?.standingsFetchExecutedNowCount !== 5) blocks.push("proof_standings_fetch_not_5");
if (proof.summary?.failedFetchCount !== 0) blocks.push("proof_failed_fetch_not_zero");
if (proof.summary?.validationPassedRowCount !== 0) blocks.push("proof_validation_passed_not_zero");
if (proof.summary?.acceptedNowCount !== 0) blocks.push("proof_accepted_now_not_zero");

if (failure.status !== "passed") blocks.push("failure_status_not_passed");
if (failure.summary?.proofRowCount !== 5) blocks.push("failure_proof_row_count_not_5");
if (failureRows.length !== 5) blocks.push("failure_rows_length_not_5");
if (failure.summary?.validationPassedRowCount !== 0) blocks.push("failure_validation_passed_not_zero");
if (failure.summary?.failedValidationRowCount !== 5) blocks.push("failure_failed_validation_not_5");
if (failure.summary?.rootCauseCounts?.provider_returned_no_standings_rows !== 4) blocks.push("failure_no_rows_root_cause_not_4");
if (failure.summary?.rootCauseCounts?.expected_rows_or_competition_scope_mismatch !== 1) blocks.push("failure_scope_root_cause_not_1");
if (failure.summary?.acceptedNowCount !== 0) blocks.push("failure_accepted_now_not_zero");

if (sweep.status !== "passed") blocks.push("sweep_status_not_passed");
if (sweep.summary?.strongMappingInputCount !== 5) blocks.push("sweep_strong_mapping_input_count_not_5");
if (sweep.summary?.seasonSweepRowCount !== 20) blocks.push("sweep_row_count_not_20");
if (sweepRows.length !== 20) blocks.push("sweep_rows_length_not_20");
if (sweep.summary?.providerFetchExecutedNowCount !== 20) blocks.push("sweep_provider_fetch_not_20");
if (sweep.summary?.standingsFetchExecutedNowCount !== 20) blocks.push("sweep_standings_fetch_not_20");
if (sweep.summary?.failedFetchCount !== 2) blocks.push("sweep_failed_fetch_not_2");
if (sweep.summary?.fetchedAndValidatedRowCount !== 18) blocks.push("sweep_fetched_validated_not_18");
if (sweep.summary?.validationPassedRowCount !== 5) blocks.push("sweep_validation_passed_not_5_before_adjudication");
if (sweep.summary?.acceptedNowCount !== 0) blocks.push("sweep_accepted_now_not_zero");

if (adjudication.status !== "passed") blocks.push("adjudication_status_not_passed");
if (adjudication.contractVersion !== 1) blocks.push("adjudication_contract_version_not_1");
if (adjudication.summary?.sweepRowCount !== 20) blocks.push("adjudication_sweep_row_count_not_20");
if (adjudicationRows.length !== 20) blocks.push("adjudication_rows_length_not_20");
if (adjudication.summary?.validationPassedBeforeSeasonAdjudicationCount !== 5) blocks.push("adjudication_preseason_validation_pass_count_not_5");
if (adjudication.summary?.targetContractValidationPassedCount !== 0) blocks.push("adjudication_target_contract_pass_not_zero");
if (adjudication.summary?.wrongOrOlderSeasonValidationPassedCount !== 5) blocks.push("adjudication_wrong_or_older_pass_count_not_5");
if (adjudication.summary?.competitionScopeOrPhaseMismatchCount !== 4) blocks.push("adjudication_scope_mismatch_not_4");
if (adjudication.summary?.noRowsCount !== 10) blocks.push("adjudication_no_rows_not_10");
if ((adjudication.summary?.targetContractEligibleRows || []).length !== 0) blocks.push("adjudication_target_contract_eligible_not_empty");
if (adjudication.summary?.acceptedNowCount !== 0) blocks.push("adjudication_accepted_now_not_zero");

const expectedWrongOlder = new Set([
  "eng.1|api_football|39|2024",
  "ger.1|api_football|78|2023",
  "ger.1|api_football|78|2024",
  "swe.1|api_football|113|2023",
  "swe.1|api_football|113|2024"
]);

const actualWrongOlder = new Set((adjudication.summary?.wrongOrOlderSeasonCapabilityRows || []).map(row =>
  `${row.slug}|${row.providerFamily}|${row.providerLeagueId}|${row.providerSeasonParam}`
));

for (const expected of expectedWrongOlder) {
  if (!actualWrongOlder.has(expected)) blocks.push(`missing_wrong_or_older_capability_${expected}`);
}

const expectedPhaseMismatch = new Set([
  "fin.1|api_football|244|2023",
  "fin.1|api_football|244|2024",
  "fin.1|thesportsdb|4636|2024",
  "fin.1|thesportsdb|4636|2025"
]);

const actualPhaseMismatch = new Set((adjudication.summary?.phaseOrScopeMismatchRows || []).map(row =>
  `${row.slug}|${row.providerFamily}|${row.providerLeagueId}|${row.providerSeasonParam}`
));

for (const expected of expectedPhaseMismatch) {
  if (!actualPhaseMismatch.has(expected)) blocks.push(`missing_phase_mismatch_${expected}`);
}

for (const row of adjudicationRows) {
  if (row.acceptedNow !== false) blocks.push(`adjudication_row_accepted_now_${row.slug}_${row.providerFamily}_${row.providerSeasonParam}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`adjudication_row_acceptance_allowed_${row.slug}_${row.providerFamily}_${row.providerSeasonParam}`);
  if (row.reviewOnly !== true) blocks.push(`adjudication_row_not_review_only_${row.slug}_${row.providerFamily}_${row.providerSeasonParam}`);
  if (row.targetContractEligible === true) blocks.push(`unexpected_target_contract_eligible_${row.slug}_${row.providerFamily}_${row.providerSeasonParam}`);
}

const guardrailSets = [
  ["proof", proof.guardrails || {}],
  ["failure", failure.guardrails || {}],
  ["sweep", sweep.guardrails || {}],
  ["adjudication", adjudication.guardrails || {}]
];

for (const [name, guardrails] of guardrailSets) {
  if (guardrails.searchExecutedNowCount !== 0) blocks.push(`${name}_search_not_zero`);
  if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push(`${name}_canonical_not_zero`);
  if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push(`${name}_production_not_zero`);
  if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push(`${name}_truth_not_zero`);
  if (guardrails.rawPayloadCommitted !== false) blocks.push(`${name}_raw_payload_not_false`);
  if (guardrails.fullRawPayloadWritten !== false) blocks.push(`${name}_full_raw_payload_not_false`);
}

if ((proof.guardrails || {}).standingsFetchExecutedNowCount !== 5) blocks.push("proof_standings_guardrail_not_5");
if ((sweep.guardrails || {}).standingsFetchExecutedNowCount !== 20) blocks.push("sweep_standings_guardrail_not_20");
if ((failure.guardrails || {}).standingsFetchExecutedNowCount !== 0) blocks.push("failure_standings_guardrail_not_zero");
if ((adjudication.guardrails || {}).standingsFetchExecutedNowCount !== 0) blocks.push("adjudication_standings_guardrail_not_zero");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_provider_api_season_scope_adjudication_board",
  contractVersion: 1,
  proofPath: path.relative(root, proofPath).replaceAll("\\", "/"),
  failurePath: path.relative(root, failurePath).replaceAll("\\", "/"),
  sweepPath: path.relative(root, sweepPath).replaceAll("\\", "/"),
  adjudicationPath: path.relative(root, adjudicationPath).replaceAll("\\", "/"),
  proofSha256: await sha256(proofPath),
  proofRowsSha256: await sha256(proofRowsPath),
  failureSha256: await sha256(failurePath),
  failureRowsSha256: await sha256(failureRowsPath),
  sweepSha256: await sha256(sweepPath),
  sweepRowsSha256: await sha256(sweepRowsPath),
  adjudicationSha256: await sha256(adjudicationPath),
  adjudicationRowsSha256: await sha256(adjudicationRowsPath),
  verified: {
    proofRowCount: proof.summary.proofRowCount,
    proofValidationPassedRowCount: proof.summary.validationPassedRowCount,
    failureRootCauseCounts: failure.summary.rootCauseCounts,
    sweepRowCount: sweep.summary.seasonSweepRowCount,
    sweepValidationPassedBeforeAdjudicationCount: sweep.summary.validationPassedRowCount,
    targetContractValidationPassedCount: adjudication.summary.targetContractValidationPassedCount,
    wrongOrOlderSeasonValidationPassedCount: adjudication.summary.wrongOrOlderSeasonValidationPassedCount,
    competitionScopeOrPhaseMismatchCount: adjudication.summary.competitionScopeOrPhaseMismatchCount,
    noRowsCount: adjudication.summary.noRowsCount,
    targetContractEligibleRows: adjudication.summary.targetContractEligibleRows,
    wrongOrOlderSeasonCapabilityRows: adjudication.summary.wrongOrOlderSeasonCapabilityRows,
    phaseOrScopeMismatchRows: adjudication.summary.phaseOrScopeMismatchRows,
    acceptedNowCount: adjudication.summary.acceptedNowCount,
    guardrailsHeld: blocks.filter(block =>
      block.includes("_search_") ||
      block.includes("_canonical_") ||
      block.includes("_production_") ||
      block.includes("_truth_") ||
      block.includes("_raw_payload") ||
      block.includes("_full_raw_payload") ||
      block.includes("_standings_guardrail")
    ).length === 0
  },
  conclusion: "Provider standings proof and season sweep are verified as capability evidence only. Five rows passed arithmetic before adjudication, but zero rows matched the target season contract, so no provider standings rows are eligible for coverage or canonical candidate write.",
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

if (blocks.length > 0) process.exitCode = 1;
