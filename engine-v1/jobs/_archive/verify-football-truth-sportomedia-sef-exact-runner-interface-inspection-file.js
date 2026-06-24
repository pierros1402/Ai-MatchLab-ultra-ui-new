import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-interface-inspection-${today}`, `sportomedia-sef-exact-runner-interface-inspection-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-interface-inspection-${today}`, `sportomedia-sef-exact-runner-interface-inspection-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-exact-runner-interface-inspection-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-exact-runner-interface-inspection-verification-${today}.json`);

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
if (board.runner !== "sportomedia_sef_exact_runner_interface_inspection") blocks.push("wrong_runner");
if (board.contractVersion !== 1) blocks.push("contract_version_not_1");

if (board.summary?.inspectedFileCount !== 2) blocks.push("inspected_file_count_not_2");
if (rows.length !== 2) blocks.push("rows_length_not_2");

if (board.summary?.selectedRunner !== "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js") blocks.push("selected_runner_mismatch");
if (JSON.stringify(board.summary?.configCandidates || []) !== JSON.stringify(["engine-v1/config/football-truth-modern-sportomedia-sef-current-or-new-proof-contract.json"])) blocks.push("config_candidates_mismatch");

if (board.summary?.runnerUsesAllowFetch !== true) blocks.push("runner_uses_allow_fetch_not_true");
if (board.summary?.runnerHasGraphqlSignal !== true) blocks.push("runner_graphql_signal_not_true");
if (board.summary?.runnerHasSeasonSignal !== true) blocks.push("runner_season_signal_not_true");
if (board.summary?.runnerHasSlugSignal !== true) blocks.push("runner_slug_signal_not_true");
if (board.summary?.runnerHasStandingsSignal !== true) blocks.push("runner_standings_signal_not_true");
if (board.summary?.runnerHasArithmeticSignal !== true) blocks.push("runner_arithmetic_signal_not_true");
if (board.summary?.runnerCanonicalWriteSignal !== true) blocks.push("runner_canonical_write_signal_expected_true_boundary_missing");
if (board.summary?.runnerTruthSignal !== true) blocks.push("runner_truth_signal_expected_true_boundary_missing");
if (board.summary?.runnerRawPayloadSignal !== false) blocks.push("runner_raw_payload_signal_not_false");

if (JSON.stringify(board.summary?.planTargetSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("plan_target_slugs_mismatch");
if (board.summary?.planTargetSeasonScope !== "previous_completed") blocks.push("plan_target_scope_not_previous_completed");
if (board.summary?.planTargetSeasonLabel !== "2024") blocks.push("plan_target_season_label_not_2024");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

const runnerRow = rows.find(row => row.fileRole === "selected_exact_runner");
const configRow = rows.find(row => row.fileRole === "family_config");

if (!runnerRow) blocks.push("missing_runner_row");
if (!configRow) blocks.push("missing_config_row");

if (runnerRow) {
  if (runnerRow.path !== "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js") blocks.push("runner_row_path_mismatch");
  if (runnerRow.signals?.usesAllowFetch !== true) blocks.push("runner_row_allow_fetch_not_true");
  if (runnerRow.signals?.hasGraphqlSignal !== true) blocks.push("runner_row_graphql_not_true");
  if (runnerRow.signals?.hasSeasonSignal !== true) blocks.push("runner_row_season_not_true");
  if (runnerRow.signals?.hasStandingsSignal !== true) blocks.push("runner_row_standings_not_true");
  if (runnerRow.signals?.hasArithmeticSignal !== true) blocks.push("runner_row_arithmetic_not_true");
  if (runnerRow.signals?.hasCanonicalWriteSignal !== true) blocks.push("runner_row_canonical_signal_expected_true_missing");
  if (runnerRow.signals?.hasTruthSignal !== true) blocks.push("runner_row_truth_signal_expected_true_missing");
  if (runnerRow.acceptedNow !== false) blocks.push("runner_row_accepted_now_not_false");
  if (runnerRow.acceptanceAllowedNow !== false) blocks.push("runner_row_acceptance_allowed");
  if (runnerRow.reviewOnly !== true) blocks.push("runner_row_not_review_only");
}

if (configRow) {
  if (configRow.path !== "engine-v1/config/football-truth-modern-sportomedia-sef-current-or-new-proof-contract.json") blocks.push("config_row_path_mismatch");
  if (configRow.acceptedNow !== false) blocks.push("config_row_accepted_now_not_false");
  if (configRow.acceptanceAllowedNow !== false) blocks.push("config_row_acceptance_allowed");
  if (configRow.reviewOnly !== true) blocks.push("config_row_not_review_only");
}

const guardrails = board.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_exact_runner_interface_inspection",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    inspectedFileCount: board.summary.inspectedFileCount,
    selectedRunner: board.summary.selectedRunner,
    configCandidates: board.summary.configCandidates,
    runnerUsesAllowFetch: board.summary.runnerUsesAllowFetch,
    runnerHasGraphqlSignal: board.summary.runnerHasGraphqlSignal,
    runnerHasSeasonSignal: board.summary.runnerHasSeasonSignal,
    runnerHasSlugSignal: board.summary.runnerHasSlugSignal,
    runnerHasStandingsSignal: board.summary.runnerHasStandingsSignal,
    runnerHasArithmeticSignal: board.summary.runnerHasArithmeticSignal,
    runnerCanonicalWriteSignal: board.summary.runnerCanonicalWriteSignal,
    runnerTruthSignal: board.summary.runnerTruthSignal,
    runnerRawPayloadSignal: board.summary.runnerRawPayloadSignal,
    planTargetSlugs: board.summary.planTargetSlugs,
    planTargetSeasonScope: board.summary.planTargetSeasonScope,
    planTargetSeasonLabel: board.summary.planTargetSeasonLabel,
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
  conclusion: "Sportomedia/SEF exact runner interface inspection is verified. The selected runner has the required GraphQL/season/standings/arithmetic signals, but also canonical/truth write signals, so the next proof runner must enforce diagnostic-only execution and cannot call any write path.",
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
