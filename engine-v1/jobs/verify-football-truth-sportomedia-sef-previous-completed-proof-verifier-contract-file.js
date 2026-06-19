import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const contractPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-verifier-contract-${today}`, `sportomedia-sef-previous-completed-proof-verifier-contract-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-verifier-contract-${today}`, `sportomedia-sef-previous-completed-proof-verifier-contract-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-verifier-contract-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-previous-completed-proof-verifier-contract-verification-${today}.json`);

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
if (contract.runner !== "sportomedia_sef_previous_completed_proof_verifier_contract") blocks.push("wrong_runner");
if (contract.contractVersion !== 1) blocks.push("contract_version_not_1");

if (contract.summary?.family !== "sportomedia_sef") blocks.push("family_not_sportomedia_sef");
if (contract.summary?.targetCount !== 2) blocks.push("target_count_not_2");
if (JSON.stringify(contract.summary?.targetSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("target_slugs_mismatch");
if (contract.summary?.targetSeasonScope !== "previous_completed") blocks.push("target_scope_not_previous_completed");
if (contract.summary?.targetSeasonLabel !== "2024") blocks.push("target_season_label_not_2024");
if (contract.summary?.expectedRowsPerTarget !== 16) blocks.push("expected_rows_per_target_not_16");
if (contract.summary?.expectedMaxPlayed !== 30) blocks.push("expected_max_played_not_30");

if (contract.summary?.requiredProofOutputFieldCount !== 6) blocks.push("required_proof_output_field_count_not_6");
if (contract.summary?.requiredRowFieldCount !== 16) blocks.push("required_row_field_count_not_16");
if (contract.summary?.requiredStandingRowFieldCount !== 10) blocks.push("required_standing_row_field_count_not_10");
if (contract.summary?.requiredValidationGateCount !== 15) blocks.push("required_validation_gate_count_not_15");
if (contract.summary?.forbiddenProofOutputSignalCount !== 9) blocks.push("forbidden_signal_count_not_9");

if (contract.summary?.verifierAllowsCanonicalWrite !== false) blocks.push("verifier_allows_canonical_write");
if (contract.summary?.verifierAllowsTruthAssertion !== false) blocks.push("verifier_allows_truth_assertion");
if (contract.summary?.verifierAllowsProductionWrite !== false) blocks.push("verifier_allows_production_write");
if (contract.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

if (rows.length !== 2) blocks.push("rows_length_not_2");

const expectedTargets = new Map([
  ["swe.1", { league: "Allsvenskan", expectedRows: 16, expectedMaxPlayed: 30, signalMin: 4 }],
  ["swe.2", { league: "Superettan", expectedRows: 16, expectedMaxPlayed: 30, signalMin: 4 }]
]);

const requiredProofOutputFields = ["status", "runner", "contractVersion", "guardrails", "summary", "rows"];
const requiredRowFields = ["slug", "league", "country", "sourceFamily", "seasonScope", "seasonLabel", "sourceUrl", "fetchedAt", "expectedRows", "extractedRowCount", "teamSignalHits", "standingsRows", "validation", "acceptedNow", "acceptanceAllowedNow", "reviewOnly"];
const requiredStandingRowFields = ["rank", "team", "played", "wins", "draws", "losses", "goalsFor", "goalsAgainst", "goalDifference", "points"];
const requiredGates = [
  "source_family_identity",
  "target_slug_identity",
  "season_scope",
  "season_label",
  "expected_rows",
  "max_played",
  "played_arithmetic",
  "points_arithmetic",
  "goal_difference_arithmetic",
  "team_signals",
  "duplicate_team_guard",
  "non_trivial_completed_table",
  "write_guardrails",
  "raw_payload_guardrails",
  "review_only_guard"
];

for (const [slug, expected] of expectedTargets.entries()) {
  const row = rows.find(item => item.slug === slug);
  if (!row) {
    blocks.push(`missing_row_${slug}`);
    continue;
  }

  if (row.league !== expected.league) blocks.push(`league_mismatch_${slug}`);
  if (row.sourceFamily !== "sportomedia_sef") blocks.push(`source_family_mismatch_${slug}`);
  if (row.seasonScope !== "previous_completed") blocks.push(`season_scope_mismatch_${slug}`);
  if (row.seasonLabel !== "2024") blocks.push(`season_label_mismatch_${slug}`);
  if (row.expectedRows !== expected.expectedRows) blocks.push(`expected_rows_mismatch_${slug}`);
  if (row.expectedMaxPlayed !== expected.expectedMaxPlayed) blocks.push(`expected_max_played_mismatch_${slug}`);
  if (row.validationMinimumTeamSignals !== expected.signalMin) blocks.push(`signal_min_mismatch_${slug}`);
  if (!Array.isArray(row.teamSignalTerms) || row.teamSignalTerms.length < 6) blocks.push(`team_signals_too_few_${slug}`);

  for (const field of requiredProofOutputFields) {
    if (!(row.requiredProofOutputFields || []).includes(field)) blocks.push(`missing_proof_output_field_${slug}_${field}`);
  }

  for (const field of requiredRowFields) {
    if (!(row.requiredRowFields || []).includes(field)) blocks.push(`missing_row_field_${slug}_${field}`);
  }

  for (const field of requiredStandingRowFields) {
    if (!(row.requiredStandingRowFields || []).includes(field)) blocks.push(`missing_standing_row_field_${slug}_${field}`);
  }

  const gates = (row.requiredValidationGates || []).map(gate => gate.gate);
  for (const gate of requiredGates) {
    if (!gates.includes(gate)) blocks.push(`missing_gate_${slug}_${gate}`);
  }

  for (const forbidden of [
    "canonicalWriteExecutedNowCount > 0",
    "productionWriteExecutedNowCount > 0",
    "truthAssertionExecutedNowCount > 0",
    "rawPayloadCommitted === true",
    "fullRawPayloadWritten === true",
    "acceptedNow === true",
    "acceptanceAllowedNow === true",
    "seasonScope !== previous_completed",
    "seasonLabel !== 2024"
  ]) {
    if (!(row.forbiddenProofOutputSignals || []).includes(forbidden)) blocks.push(`missing_forbidden_signal_${slug}_${forbidden}`);
  }

  if (row.verifierMustFailIfAnyGateFails !== true) blocks.push(`verifier_must_fail_not_true_${slug}`);
  if (row.verifierAllowsCanonicalWrite !== false) blocks.push(`row_allows_canonical_${slug}`);
  if (row.verifierAllowsTruthAssertion !== false) blocks.push(`row_allows_truth_${slug}`);
  if (row.verifierAllowsProductionWrite !== false) blocks.push(`row_allows_production_${slug}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_${slug}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_${slug}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${slug}`);
}

const guardrails = contract.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_previous_completed_proof_verifier_contract",
  contractVersion: 1,
  contractPath: path.relative(root, contractPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  contractSha256: await sha256(contractPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    family: contract.summary.family,
    targetCount: contract.summary.targetCount,
    targetSlugs: contract.summary.targetSlugs,
    targetSeasonScope: contract.summary.targetSeasonScope,
    targetSeasonLabel: contract.summary.targetSeasonLabel,
    expectedRowsPerTarget: contract.summary.expectedRowsPerTarget,
    expectedMaxPlayed: contract.summary.expectedMaxPlayed,
    requiredProofOutputFieldCount: contract.summary.requiredProofOutputFieldCount,
    requiredRowFieldCount: contract.summary.requiredRowFieldCount,
    requiredStandingRowFieldCount: contract.summary.requiredStandingRowFieldCount,
    requiredValidationGateCount: contract.summary.requiredValidationGateCount,
    forbiddenProofOutputSignalCount: contract.summary.forbiddenProofOutputSignalCount,
    verifierAllowsCanonicalWrite: contract.summary.verifierAllowsCanonicalWrite,
    verifierAllowsTruthAssertion: contract.summary.verifierAllowsTruthAssertion,
    verifierAllowsProductionWrite: contract.summary.verifierAllowsProductionWrite,
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
  conclusion: "Sportomedia/SEF previous_completed proof verifier contract is verified. The executable verifier can now be implemented against fixed 2024 swe.1/swe.2 gates before any diagnostic-only fetch runner is allowed.",
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
