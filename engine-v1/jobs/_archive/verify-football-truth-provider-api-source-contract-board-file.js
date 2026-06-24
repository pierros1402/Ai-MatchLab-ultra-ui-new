import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const configPath = path.join(root, "engine-v1", "config", "football-truth-provider-api-source-contracts.json");
const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-source-contract-board-${today}`, `provider-api-source-contract-board-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-source-contract-board-${today}`, `provider-api-source-contract-board-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-source-contract-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `provider-api-source-contract-board-verification-${today}.json`);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];
const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (config.contractVersion !== 1) blocks.push("config_contract_version_not_1");
if (config.globalPolicy?.directImportFromBetHistorian !== false) blocks.push("direct_import_policy_not_false");
if (config.globalPolicy?.providerTruthWithoutValidationAllowed !== false) blocks.push("provider_truth_without_validation_not_false");
if (config.globalPolicy?.canonicalWriteAllowedByThisConfig !== false) blocks.push("canonical_write_allowed_by_config");
if (config.globalPolicy?.productionWriteAllowedByThisConfig !== false) blocks.push("production_write_allowed_by_config");
if (config.globalPolicy?.truthAssertionAllowedByThisConfig !== false) blocks.push("truth_assertion_allowed_by_config");
if (config.globalPolicy?.requiredApprovalBeforeCanonicalCandidateWrite !== true) blocks.push("approval_before_canonical_not_required");

const requiredProviders = new Set(["api_football", "thesportsdb"]);
const configuredProviders = new Set((config.providerFamilies || []).map(p => p.providerFamily));
for (const provider of requiredProviders) {
  if (!configuredProviders.has(provider)) blocks.push(`missing_provider_${provider}`);
}

if ((config.providerFamilies || []).length !== 2) blocks.push("provider_family_config_count_not_2");
if ((config.initialMappingTargets || []).length !== 6) blocks.push("initial_mapping_targets_not_6");

if (board.status !== "passed") blocks.push("board_status_not_passed");
if (board.contractVersion !== 1) blocks.push("board_contract_version_not_1");
if (board.runner !== "provider_api_source_contract_board") blocks.push("wrong_board_runner");

if (board.summary?.providerFamilyCount !== 2) blocks.push("provider_family_count_not_2");
if (board.summary?.initialMappingTargetCount !== 6) blocks.push("initial_mapping_target_count_not_6");
if (board.summary?.mappingBoardRowCount !== 12) blocks.push("mapping_board_row_count_not_12");
if (board.summary?.apiFootballRows !== 6) blocks.push("api_football_rows_not_6");
if (board.summary?.theSportsDbRows !== 6) blocks.push("thesportsdb_rows_not_6");
if (board.summary?.mappingNeededCount !== 12) blocks.push("mapping_needed_count_not_12");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");
if (rows.length !== 12) blocks.push("rows_count_not_12");

const expectedSlugs = new Set(["eng.1", "esp.1", "ger.1", "sco.1", "swe.1", "fin.1"]);
for (const slug of expectedSlugs) {
  const slugRows = rows.filter(row => row.slug === slug);
  if (slugRows.length !== 2) blocks.push(`slug_row_count_not_2_${slug}`);
}

for (const row of rows) {
  if (!requiredProviders.has(row.providerFamily)) blocks.push(`unexpected_provider_family_${row.providerFamily}`);
  if (!expectedSlugs.has(row.slug)) blocks.push(`unexpected_slug_${row.slug}`);
  if (row.providerLeagueId !== null) blocks.push(`provider_league_id_should_be_null_${row.slug}_${row.providerFamily}`);
  if (row.providerSeasonParam !== null) blocks.push(`provider_season_param_should_be_null_${row.slug}_${row.providerFamily}`);
  if (row.mappingStatus !== "needs_provider_league_id_mapping") blocks.push(`mapping_status_mismatch_${row.slug}_${row.providerFamily}`);
  if (row.proofStatus !== "not_executed") blocks.push(`proof_status_mismatch_${row.slug}_${row.providerFamily}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_not_false_${row.slug}_${row.providerFamily}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_${row.slug}_${row.providerFamily}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${row.slug}_${row.providerFamily}`);
  if (!Array.isArray(row.teamSignalTerms) || row.teamSignalTerms.length < 4) blocks.push(`team_signals_too_few_${row.slug}_${row.providerFamily}`);
  if (!row.expectedRows || row.expectedRows < 8) blocks.push(`expected_rows_invalid_${row.slug}_${row.providerFamily}`);
}

const guardrails = board.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_provider_api_source_contract_board",
  contractVersion: 1,
  configPath: path.relative(root, configPath).replaceAll("\\", "/"),
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  configSha256: await sha256(configPath),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    providerFamilyCount: board.summary.providerFamilyCount,
    initialMappingTargetCount: board.summary.initialMappingTargetCount,
    mappingBoardRowCount: board.summary.mappingBoardRowCount,
    envKeyPresentCount: board.summary.envKeyPresentCount,
    apiFootballRows: board.summary.apiFootballRows,
    theSportsDbRows: board.summary.theSportsDbRows,
    mappingNeededCount: board.summary.mappingNeededCount,
    acceptedNowCount: board.summary.acceptedNowCount,
    providerTruthWithoutValidationAllowed: config.globalPolicy.providerTruthWithoutValidationAllowed,
    canonicalWriteAllowedByThisConfig: config.globalPolicy.canonicalWriteAllowedByThisConfig,
    requiredApprovalBeforeCanonicalCandidateWrite: config.globalPolicy.requiredApprovalBeforeCanonicalCandidateWrite,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.providerFetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Provider API source contract scaffold is verified. It defines API-Football and TheSportsDB as controlled provider lanes with mapping required before any provider fetch, canonical candidate, or truth assertion.",
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
