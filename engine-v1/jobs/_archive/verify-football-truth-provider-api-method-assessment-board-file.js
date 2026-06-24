import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-method-assessment-board-${today}`, `provider-api-method-assessment-board-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-method-assessment-board-${today}`, `provider-api-method-assessment-board-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `provider-api-method-assessment-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `provider-api-method-assessment-board-verification-${today}.json`);

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
if (board.runner !== "provider_api_method_assessment_board") blocks.push("wrong_runner");
if (rows.length !== 3) blocks.push("rows_count_not_3");

if (board.assessment?.viableDirection !== true) blocks.push("viable_direction_not_true");
if (board.assessment?.directImportRecommended !== false) blocks.push("direct_import_not_false");
if (board.assessment?.primaryUse !== "provider_api_source_family_contracts") blocks.push("primary_use_not_provider_contracts");
if (board.assessment?.notUse !== "generic_ai_crawler_or_unvalidated_provider_truth") blocks.push("not_use_not_crawler_rejection");

if (board.summary?.providerFamilyCount !== 3) blocks.push("provider_family_count_not_3");
if (board.summary?.recommendedFirstAction !== "build_provider_league_id_mapping_board") blocks.push("recommended_first_action_mismatch");
if (board.summary?.candidatePrimaryProvider !== "api_football") blocks.push("primary_provider_not_api_football");
if (board.summary?.candidateFallbackProvider !== "thesportsdb") blocks.push("fallback_provider_not_thesportsdb");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

const expectedFamilies = new Set(["api_football", "thesportsdb", "bet_historian_architecture"]);
for (const row of rows) {
  if (!expectedFamilies.has(row.providerFamily)) blocks.push(`unexpected_provider_family_${row.providerFamily}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_not_false_${row.providerFamily}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_${row.providerFamily}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${row.providerFamily}`);
}

const apiFootball = rows.find(row => row.providerFamily === "api_football");
if (!apiFootball) blocks.push("missing_api_football_row");
else {
  if (!apiFootball.usableFor?.includes("previous_completed_standings")) blocks.push("api_football_missing_previous_completed_use");
  if (!apiFootball.requiredContractFields?.includes("providerLeagueId")) blocks.push("api_football_missing_provider_league_id_contract");
  if (!apiFootball.validationGates?.includes("expected row count")) blocks.push("api_football_missing_expected_row_gate");
}

const thesportsdb = rows.find(row => row.providerFamily === "thesportsdb");
if (!thesportsdb) blocks.push("missing_thesportsdb_row");
else {
  if (thesportsdb.proposedRole !== "secondary_provider_or_demo_fallback") blocks.push("thesportsdb_role_mismatch");
}

const betHistorian = rows.find(row => row.providerFamily === "bet_historian_architecture");
if (!betHistorian) blocks.push("missing_bet_historian_architecture_row");
else {
  if (betHistorian.directImportRecommended === true) blocks.push("bet_historian_direct_import_wrongly_true");
  if (!betHistorian.requiredAdaptations?.includes("translate provider abstraction to Node family adapter contract")) blocks.push("bet_historian_missing_node_adapter_adaptation");
}

const guardrails = board.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_provider_api_method_assessment_board",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    viableDirection: board.assessment.viableDirection,
    directImportRecommended: board.assessment.directImportRecommended,
    primaryUse: board.assessment.primaryUse,
    notUse: board.assessment.notUse,
    providerFamilyCount: board.summary.providerFamilyCount,
    recommendedFirstAction: board.summary.recommendedFirstAction,
    candidatePrimaryProvider: board.summary.candidatePrimaryProvider,
    candidateFallbackProvider: board.summary.candidateFallbackProvider,
    acceptedNowCount: board.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Provider API method assessment is verified. BetHistorian-style provider abstraction is viable as a source-acquisition family contract pattern, not as a direct import and not as unvalidated truth.",
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
