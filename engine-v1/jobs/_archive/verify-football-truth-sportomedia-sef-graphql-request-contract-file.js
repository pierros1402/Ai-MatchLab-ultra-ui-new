import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const contractPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-graphql-request-contract-${today}`, `sportomedia-sef-graphql-request-contract-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-graphql-request-contract-${today}`, `sportomedia-sef-graphql-request-contract-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-graphql-request-contract-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-graphql-request-contract-verification-${today}.json`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

const blocks = [];
const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (contract.status !== "passed") blocks.push("contract_status_not_passed");
if (contract.runner !== "sportomedia_sef_graphql_request_contract_extraction") blocks.push("wrong_runner");
if (contract.contractVersion !== 1) blocks.push("contract_version_not_1");

if (JSON.stringify(contract.summary?.targetSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("target_slugs_mismatch");
if (contract.summary?.targetSeasonScope !== "previous_completed") blocks.push("target_scope_not_previous_completed");
if (contract.summary?.targetSeasonLabel !== "2024") blocks.push("target_season_label_not_2024");
if (contract.summary?.targetCount !== 2) blocks.push("target_count_not_2");
if (contract.summary?.graphqlEndpointCandidateCount !== 3) blocks.push("graphql_endpoint_candidate_count_not_3");
if (contract.summary?.hasGraphqlLines !== true) blocks.push("has_graphql_lines_not_true");
if (contract.summary?.hasFetchRequestLines !== true) blocks.push("has_fetch_request_lines_not_true");
if (contract.summary?.hasTargetSeasonLines !== true) blocks.push("has_target_season_lines_not_true");
if (contract.summary?.hasVerifier !== true) blocks.push("has_verifier_not_true");
if (contract.summary?.readyToImplementDiagnosticOnlyWrapper !== true) blocks.push("not_ready_to_implement_wrapper");
if (contract.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

const expectedEndpoints = [
  "https://allsvenskan.se/tabell",
  "https://gql.sportomedia.se/graphql",
  "https://superettan.se/tabell"
];

for (const endpoint of expectedEndpoints) {
  if (!(contract.graphqlEndpointCandidates || []).includes(endpoint)) blocks.push(`missing_endpoint_${endpoint}`);
}

if (contract.selectedRunner !== "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js") blocks.push("selected_runner_mismatch");
if (contract.selectedConfig !== "engine-v1/config/football-truth-modern-sportomedia-sef-current-or-new-proof-contract.json") blocks.push("selected_config_mismatch");
if (contract.selectedVerifier !== "engine-v1/jobs/verify-football-truth-sportomedia-sef-previous-completed-proof-output-file.js") blocks.push("selected_verifier_mismatch");

if (!Array.isArray(contract.targetRows) || contract.targetRows.length !== 2) blocks.push("target_rows_length_not_2");

const targetBySlug = new Map((contract.targetRows || []).map(row => [row.slug, row]));
for (const [slug, league] of [["swe.1", "Allsvenskan"], ["swe.2", "Superettan"]]) {
  const row = targetBySlug.get(slug);
  if (!row) {
    blocks.push(`missing_target_row_${slug}`);
    continue;
  }
  if (row.league !== league) blocks.push(`target_league_mismatch_${slug}`);
  if (row.seasonScope !== "previous_completed") blocks.push(`target_scope_mismatch_${slug}`);
  if (row.seasonLabel !== "2024") blocks.push(`target_season_label_mismatch_${slug}`);
  if (row.expectedRows !== 16) blocks.push(`target_expected_rows_mismatch_${slug}`);
  if (row.expectedMaxPlayed !== 30) blocks.push(`target_expected_max_played_mismatch_${slug}`);
  if (!Array.isArray(row.signalTerms) || row.signalTerms.length < 6) blocks.push(`target_signal_terms_too_few_${slug}`);
}

if (rows.length < 20) blocks.push("extracted_rows_too_few");
if (!rows.some(row => row.label === "runner_graphql_or_standings_line")) blocks.push("missing_runner_graphql_rows");
if (!rows.some(row => row.label === "runner_fetch_request_line")) blocks.push("missing_runner_fetch_rows");
if (!rows.some(row => row.label === "runner_target_or_season_line")) blocks.push("missing_runner_target_season_rows");
if (!rows.some(row => row.label === "config_signal_line")) blocks.push("missing_config_signal_rows");

const guardrails = contract.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_graphql_request_contract",
  contractVersion: 1,
  contractPath: path.relative(root, contractPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  contractSha256: await sha256(contractPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    targetCount: contract.summary.targetCount,
    targetSlugs: contract.summary.targetSlugs,
    targetSeasonScope: contract.summary.targetSeasonScope,
    targetSeasonLabel: contract.summary.targetSeasonLabel,
    graphqlEndpointCandidates: contract.graphqlEndpointCandidates,
    extractedLineRowCount: contract.summary.extractedLineRowCount,
    configSignalCount: contract.summary.configSignalCount,
    hasGraphqlLines: contract.summary.hasGraphqlLines,
    hasFetchRequestLines: contract.summary.hasFetchRequestLines,
    hasTargetSeasonLines: contract.summary.hasTargetSeasonLines,
    hasVerifier: contract.summary.hasVerifier,
    readyToImplementDiagnosticOnlyWrapper: contract.summary.readyToImplementDiagnosticOnlyWrapper,
    acceptedNowCount: contract.summary.acceptedNowCount,
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
  conclusion: "Sportomedia/SEF GraphQL request contract is verified. Endpoint and table-page hints are fixed enough to implement the diagnostic-only previous_completed proof wrapper for swe.1/swe.2 2024.",
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
