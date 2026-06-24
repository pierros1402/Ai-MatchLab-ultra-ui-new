import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-safety-scan-${today}`, `sportomedia-sef-exact-runner-safety-scan-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-safety-scan-${today}`, `sportomedia-sef-exact-runner-safety-scan-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-safety-scan-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-exact-runner-safety-scan-verification-${today}.json`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

const blocks = [];
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (board.status !== "passed") blocks.push("board_status_not_passed");
if (board.runner !== "sportomedia_sef_exact_runner_safety_scan") blocks.push("wrong_runner");
if (board.contractVersion !== 1) blocks.push("contract_version_not_1");

if (board.summary?.selectedRunner !== "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js") blocks.push("selected_runner_mismatch");
if (!(board.summary?.discoveredCliFlags || []).includes("--allow-fetch")) blocks.push("allow_fetch_flag_missing");
if (!(board.summary?.discoveredCliFlags || []).includes("--allow-execute")) blocks.push("allow_execute_flag_missing");

if (board.summary?.hasAllowFetchFlag !== true) blocks.push("has_allow_fetch_not_true");
if (board.summary?.hasCanonicalFlag !== true) blocks.push("has_canonical_flag_not_true");
if (board.summary?.hasTruthFlag !== true) blocks.push("has_truth_flag_not_true");
if (board.summary?.hasDiagnosticOutput !== true) blocks.push("has_diagnostic_output_not_true");
if (board.summary?.hasRawPayloadSignal !== false) blocks.push("has_raw_payload_signal_not_false");
if (board.summary?.hasGraphqlSignal !== true) blocks.push("has_graphql_signal_not_true");
if (board.summary?.hasSeasonSignal !== true) blocks.push("has_season_signal_not_true");
if (board.summary?.hasValidationSignal !== true) blocks.push("has_validation_signal_not_true");

if (board.summary?.directExecutionSafeForProof !== false) blocks.push("direct_execution_safe_should_be_false");
if (board.summary?.wrapperRequired !== true) blocks.push("wrapper_required_not_true");
if (board.summary?.canonicalWriteSignalLineCount < 1) blocks.push("canonical_signal_line_count_too_low");
if (board.summary?.truthSignalLineCount < 1) blocks.push("truth_signal_line_count_too_low");
if (board.summary?.diagnosticOutputLineCount < 1) blocks.push("diagnostic_output_line_count_too_low");
if (board.summary?.fetchAndGraphqlLineCount < 1) blocks.push("fetch_graphql_line_count_too_low");
if (board.summary?.seasonSignalLineCount < 1) blocks.push("season_signal_line_count_too_low");
if (board.summary?.validationSignalLineCount < 1) blocks.push("validation_signal_line_count_too_low");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

if (rows.length === 0) blocks.push("rows_empty");
if (!rows.some(row => row.label === "canonical_write_signal")) blocks.push("missing_canonical_signal_rows");
if (!rows.some(row => row.label === "truth_signal")) blocks.push("missing_truth_signal_rows");
if (!rows.some(row => row.label === "diagnostic_output")) blocks.push("missing_diagnostic_output_rows");
if (!rows.some(row => row.label === "fetch_and_graphql")) blocks.push("missing_fetch_graphql_rows");
if (!rows.some(row => row.label === "season_signal")) blocks.push("missing_season_signal_rows");
if (!rows.some(row => row.label === "validation_signal")) blocks.push("missing_validation_signal_rows");

const guardrails = board.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_exact_runner_safety_scan",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    selectedRunner: board.summary.selectedRunner,
    discoveredCliFlags: board.summary.discoveredCliFlags,
    hasAllowFetchFlag: board.summary.hasAllowFetchFlag,
    hasCanonicalFlag: board.summary.hasCanonicalFlag,
    hasTruthFlag: board.summary.hasTruthFlag,
    hasDiagnosticOutput: board.summary.hasDiagnosticOutput,
    hasRawPayloadSignal: board.summary.hasRawPayloadSignal,
    hasGraphqlSignal: board.summary.hasGraphqlSignal,
    hasSeasonSignal: board.summary.hasSeasonSignal,
    hasValidationSignal: board.summary.hasValidationSignal,
    directExecutionSafeForProof: board.summary.directExecutionSafeForProof,
    wrapperRequired: board.summary.wrapperRequired,
    canonicalWriteSignalLineCount: board.summary.canonicalWriteSignalLineCount,
    truthSignalLineCount: board.summary.truthSignalLineCount,
    rawPayloadSignalLineCount: board.summary.rawPayloadSignalLineCount,
    diagnosticOutputLineCount: board.summary.diagnosticOutputLineCount,
    fetchAndGraphqlLineCount: board.summary.fetchAndGraphqlLineCount,
    seasonSignalLineCount: board.summary.seasonSignalLineCount,
    validationSignalLineCount: board.summary.validationSignalLineCount,
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
  conclusion: "Sportomedia/SEF exact runner safety scan is verified. The existing exact GraphQL runner is not safe for direct previous_completed proof execution because canonical/truth write signals are present; a diagnostic-only wrapper/verifier is required.",
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
