import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-availability-board-${today}`, `provider-api-season-availability-board-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-availability-board-${today}`, `provider-api-season-availability-board-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-season-availability-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `provider-api-season-availability-board-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (board.status !== "passed") blocks.push("board_status_not_passed");
if (board.contractVersion !== 1) blocks.push("contract_version_not_1");
if (board.runner !== "provider_api_season_availability_board") blocks.push("wrong_runner");

if (board.summary?.strongMappingCount !== 5) blocks.push("strong_mapping_count_not_5");
if (rows.length !== 5) blocks.push("rows_length_not_5");

if (board.summary?.targetContractSeasonAvailableAndValidatedCount !== 0) blocks.push("target_contract_available_count_not_zero");
if (board.summary?.providerCapableButTargetSeasonUnavailableOrWrongCount !== 3) blocks.push("provider_capable_wrong_count_not_3");
if (board.summary?.providerRowsButScopeOrPhaseMismatchCount !== 2) blocks.push("scope_phase_mismatch_count_not_2");
if (board.summary?.providerNoRowsForSweptParamsCount !== 0) blocks.push("no_rows_for_swept_count_not_zero");
if (board.summary?.targetProviderSeasonAvailableInHintsCount !== 4) blocks.push("target_provider_season_hint_count_not_4");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

const expectedStatuses = new Map([
  ["eng.1|api_football|39", "provider_capable_but_target_contract_season_unavailable_or_wrong"],
  ["ger.1|api_football|78", "provider_capable_but_target_contract_season_unavailable_or_wrong"],
  ["swe.1|api_football|113", "provider_capable_but_target_contract_season_unavailable_or_wrong"],
  ["fin.1|api_football|244", "provider_has_rows_but_scope_or_phase_mismatch"],
  ["fin.1|thesportsdb|4636", "provider_has_rows_but_scope_or_phase_mismatch"]
]);

for (const [key, expectedStatus] of expectedStatuses.entries()) {
  const row = rows.find(item => `${item.slug}|${item.providerFamily}|${item.providerLeagueId}` === key);
  if (!row) {
    blocks.push(`missing_availability_row_${key}`);
    continue;
  }

  if (row.availabilityStatus !== expectedStatus) blocks.push(`availability_status_mismatch_${key}`);
  if ((row.targetEligibleSeasonParams || []).length !== 0) blocks.push(`target_eligible_params_not_empty_${key}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_not_false_${key}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_${key}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${key}`);
}

const eng = rows.find(row => row.slug === "eng.1" && row.providerFamily === "api_football");
if (!eng?.providerSeasonHints?.includes("2025")) blocks.push("eng_target_season_hint_missing_2025");
if (!eng?.validationPassedSeasonParams?.includes("2024")) blocks.push("eng_validation_passed_param_2024_missing");

const ger = rows.find(row => row.slug === "ger.1" && row.providerFamily === "api_football");
if (!ger?.validationPassedSeasonParams?.includes("2023")) blocks.push("ger_validation_passed_param_2023_missing");
if (!ger?.validationPassedSeasonParams?.includes("2024")) blocks.push("ger_validation_passed_param_2024_missing");

const swe = rows.find(row => row.slug === "swe.1" && row.providerFamily === "api_football");
if (!swe?.providerSeasonHints?.includes("2025")) blocks.push("swe_target_season_hint_missing_2025");
if (!swe?.validationPassedSeasonParams?.includes("2023")) blocks.push("swe_validation_passed_param_2023_missing");
if (!swe?.validationPassedSeasonParams?.includes("2024")) blocks.push("swe_validation_passed_param_2024_missing");

const finApi = rows.find(row => row.slug === "fin.1" && row.providerFamily === "api_football");
if (!finApi?.phaseMismatchSeasonParams?.includes("2023")) blocks.push("fin_api_phase_mismatch_2023_missing");
if (!finApi?.phaseMismatchSeasonParams?.includes("2024")) blocks.push("fin_api_phase_mismatch_2024_missing");

const finSportsDb = rows.find(row => row.slug === "fin.1" && row.providerFamily === "thesportsdb");
if (!finSportsDb?.phaseMismatchSeasonParams?.includes("2024")) blocks.push("fin_sportsdb_phase_mismatch_2024_missing");
if (!finSportsDb?.phaseMismatchSeasonParams?.includes("2025")) blocks.push("fin_sportsdb_phase_mismatch_2025_missing");

const guardrails = board.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_provider_api_season_availability_board",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    strongMappingCount: board.summary.strongMappingCount,
    targetContractSeasonAvailableAndValidatedCount: board.summary.targetContractSeasonAvailableAndValidatedCount,
    providerCapableButTargetSeasonUnavailableOrWrongCount: board.summary.providerCapableButTargetSeasonUnavailableOrWrongCount,
    providerRowsButScopeOrPhaseMismatchCount: board.summary.providerRowsButScopeOrPhaseMismatchCount,
    providerNoRowsForSweptParamsCount: board.summary.providerNoRowsForSweptParamsCount,
    targetProviderSeasonAvailableInHintsCount: board.summary.targetProviderSeasonAvailableInHintsCount,
    availabilityRows: board.summary.availabilityRows,
    acceptedNowCount: board.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.providerFetchExecutedNowCount === 0 &&
      guardrails.standingsFetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Provider season availability board is verified. Strong mappings exist and providers can return valid older-season standings, but zero rows are validated for the current target season contracts; no provider canonicalization is allowed from this state.",
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
