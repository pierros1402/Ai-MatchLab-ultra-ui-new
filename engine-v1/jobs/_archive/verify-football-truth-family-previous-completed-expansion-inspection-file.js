import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `family-previous-completed-expansion-inspection-${today}`, `family-previous-completed-expansion-inspection-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `family-previous-completed-expansion-inspection-${today}`, `family-previous-completed-expansion-inspection-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `family-previous-completed-expansion-inspection-verification-${today}`);
const verificationPath = path.join(verificationDir, `family-previous-completed-expansion-inspection-verification-${today}.json`);

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
if (board.runner !== "family_previous_completed_expansion_inspection") blocks.push("wrong_runner");
if (board.contractVersion !== 2) blocks.push("contract_version_not_2");

if (board.summary?.inspectedFamilyCount !== 6) blocks.push("inspected_family_count_not_6");
if (rows.length !== 6) blocks.push("rows_length_not_6");
if (board.summary?.selectedNextFamily !== "sportomedia_sef") blocks.push("selected_family_not_sportomedia_sef");
if (JSON.stringify(board.summary?.selectedNextSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("selected_slugs_not_swe_1_swe_2");
if (board.summary?.selectedRecommendedNextAction !== "build_family_specific_previous_completed_proof_harness") blocks.push("selected_next_action_mismatch");
if (board.summary?.providerTargetContractEligibleCount !== 0) blocks.push("provider_target_contract_eligible_not_zero");
if (board.summary?.providerCanonicalizationAllowedFromCurrentState !== false) blocks.push("provider_canonicalization_allowed");
if (board.summary?.currentNewOnlyFamilyCount !== 5) blocks.push("current_new_only_family_count_not_5");

const selected = rows.find(row => row.family === "sportomedia_sef");
if (!selected) {
  blocks.push("missing_sportomedia_row");
} else {
  if (selected.expansionReadinessScore !== 200) blocks.push("sportomedia_score_not_200");
  for (const reason of [
    "has_runnable_jobs",
    "has_verifier_jobs",
    "has_config_files",
    "has_exact_signal",
    "has_controlled_signal",
    "has_graphql_or_ajax_signal",
    "has_season_or_year_signal",
    "has_previous_completed_signal",
    "current_new_only_gap",
    "preferred_first_reusable_family_after_provider_block"
  ]) {
    if (!(selected.expansionReadinessReasons || []).includes(reason)) blocks.push(`sportomedia_missing_reason_${reason}`);
  }
  if (selected.acceptedNow !== false) blocks.push("sportomedia_accepted_now_not_false");
  if (selected.acceptanceAllowedNow !== false) blocks.push("sportomedia_acceptance_allowed");
  if (selected.reviewOnly !== true) blocks.push("sportomedia_not_review_only");
}

for (const row of rows) {
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_not_false_${row.family}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_${row.family}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${row.family}`);
}

const requiredFamilies = new Set([
  "sportomedia_sef",
  "torneopal_veikkausliiga",
  "ksi_iceland",
  "norway_ntf",
  "cfa_cyprus_html",
  "loi_ajax"
]);

for (const family of requiredFamilies) {
  if (!rows.some(row => row.family === family)) blocks.push(`missing_family_${family}`);
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
  runner: "verify_family_previous_completed_expansion_inspection",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    inspectedFamilyCount: board.summary.inspectedFamilyCount,
    selectedNextFamily: board.summary.selectedNextFamily,
    selectedNextSlugs: board.summary.selectedNextSlugs,
    selectedExpansionReadinessScore: board.summary.selectedExpansionReadinessScore,
    selectedExpansionReadinessReasons: board.summary.selectedExpansionReadinessReasons,
    selectedRecommendedNextAction: board.summary.selectedRecommendedNextAction,
    providerTargetContractEligibleCount: board.summary.providerTargetContractEligibleCount,
    providerCanonicalizationAllowedFromCurrentState: board.summary.providerCanonicalizationAllowedFromCurrentState,
    currentNewOnlyFamilyCount: board.summary.currentNewOnlyFamilyCount,
    familiesWithRunnableJobs: board.summary.familiesWithRunnableJobs,
    familiesWithVerifierJobs: board.summary.familiesWithVerifierJobs,
    familiesWithSeasonOrYearSignal: board.summary.familiesWithSeasonOrYearSignal,
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
  conclusion: "Family previous-completed expansion inspection is verified. Provider canonicalization remains blocked, and sportomedia_sef is the selected deterministic family for the next plan-only previous_completed proof harness.",
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
