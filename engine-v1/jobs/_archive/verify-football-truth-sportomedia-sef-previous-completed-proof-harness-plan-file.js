import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const planPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-harness-plan-${today}`, `sportomedia-sef-previous-completed-proof-harness-plan-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-harness-plan-${today}`, `sportomedia-sef-previous-completed-proof-harness-plan-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-proof-harness-plan-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-previous-completed-proof-harness-plan-verification-${today}.json`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

const blocks = [];
const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (plan.status !== "passed") blocks.push("plan_status_not_passed");
if (plan.runner !== "sportomedia_sef_previous_completed_proof_harness_plan") blocks.push("wrong_runner");
if (plan.contractVersion !== 3) blocks.push("contract_version_not_3");

if (plan.summary?.family !== "sportomedia_sef") blocks.push("family_not_sportomedia_sef");
if (plan.summary?.targetCount !== 2) blocks.push("target_count_not_2");
if (JSON.stringify(plan.summary?.targetSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("target_slugs_mismatch");
if (plan.summary?.targetSeasonScope !== "previous_completed") blocks.push("target_scope_not_previous_completed");
if (plan.summary?.targetSeasonLabel !== "2024") blocks.push("target_season_label_not_2024");
if (plan.summary?.selectedExistingRunner !== "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js") blocks.push("selected_existing_runner_mismatch");
if (plan.summary?.preferredExactFileCount !== 1) blocks.push("preferred_exact_file_count_not_1");
if (plan.summary?.configCandidateCount !== 1) blocks.push("config_candidate_count_not_1");
if (plan.summary?.verifierCandidateCount !== 0) blocks.push("verifier_candidate_count_not_0");
if (plan.summary?.verifierStatus !== "path_strict_missing_verifier_must_create_before_fetch") blocks.push("verifier_status_mismatch");
if (plan.summary?.verifierRequiredBeforeFetch !== true) blocks.push("verifier_required_before_fetch_not_true");
if (plan.summary?.planAllowsFetchNow !== false) blocks.push("plan_allows_fetch_now_not_false");
if (plan.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_count_not_zero");

if (rows.length !== 2) blocks.push("rows_length_not_2");

const expectedTargets = new Map([
  ["swe.1", { league: "Allsvenskan", expectedRows: 16, expectedMaxPlayed: 30 }],
  ["swe.2", { league: "Superettan", expectedRows: 16, expectedMaxPlayed: 30 }]
]);

for (const [slug, expected] of expectedTargets.entries()) {
  const row = rows.find(item => item.slug === slug);
  if (!row) {
    blocks.push(`missing_row_${slug}`);
    continue;
  }

  if (row.family !== "sportomedia_sef") blocks.push(`row_family_mismatch_${slug}`);
  if (row.league !== expected.league) blocks.push(`row_league_mismatch_${slug}`);
  if (row.seasonScope !== "previous_completed") blocks.push(`row_scope_mismatch_${slug}`);
  if (row.seasonLabel !== "2024") blocks.push(`row_season_label_mismatch_${slug}`);
  if (row.expectedRows !== expected.expectedRows) blocks.push(`row_expected_rows_mismatch_${slug}`);
  if (row.expectedMaxPlayed !== expected.expectedMaxPlayed) blocks.push(`row_expected_max_played_mismatch_${slug}`);
  if (row.planAllowsFetchNow !== false) blocks.push(`row_plan_allows_fetch_${slug}`);
  if (row.fetchExecutionBlockedUntilVerifierExists !== true) blocks.push(`row_fetch_not_blocked_until_verifier_${slug}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_${slug}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_${slug}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${slug}`);

  for (const gate of [
    "source_family_identity_must_be_sportomedia_sef",
    "slug_must_match_target",
    "seasonScope_must_equal_previous_completed",
    "seasonLabel_must_equal_2024",
    "expected_rows_must_match_16",
    "max_played_must_equal_30",
    "team_signal_minimum_must_pass",
    "played_equals_wins_plus_draws_plus_losses_for_all_rows",
    "points_equals_3wins_plus_draws_for_all_rows",
    "goal_difference_equals_for_minus_against_for_all_rows",
    "non_trivial_completed_table_required",
    "duplicate_team_guard_required",
    "no_canonical_write_without_explicit_approval",
    "no_truth_assertion"
  ]) {
    if (!(row.requiredValidationGates || []).includes(gate)) blocks.push(`missing_gate_${slug}_${gate}`);
  }
}

const selectedFiles = plan.selectedFiles || [];
if (!selectedFiles.some(file => file.path === "engine-v1/jobs/run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file.js")) {
  blocks.push("selected_files_missing_exact_graphql_runner");
}
if (!selectedFiles.some(file => file.role === "family_config")) blocks.push("selected_files_missing_family_config");
if (selectedFiles.some(file => file.signals?.verifier === true)) blocks.push("unexpected_path_strict_verifier_file_found");

const guardrails = plan.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_previous_completed_proof_harness_plan",
  contractVersion: 1,
  planPath: path.relative(root, planPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  planSha256: await sha256(planPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    family: plan.summary.family,
    targetCount: plan.summary.targetCount,
    targetSlugs: plan.summary.targetSlugs,
    targetSeasonScope: plan.summary.targetSeasonScope,
    targetSeasonLabel: plan.summary.targetSeasonLabel,
    selectedExistingRunner: plan.summary.selectedExistingRunner,
    pathStrictSportomediaFileCount: plan.summary.pathStrictSportomediaFileCount,
    fallbackExistingRunnerCount: plan.summary.fallbackExistingRunnerCount,
    verifierCandidateCount: plan.summary.verifierCandidateCount,
    verifierStatus: plan.summary.verifierStatus,
    verifierRequiredBeforeFetch: plan.summary.verifierRequiredBeforeFetch,
    configCandidateCount: plan.summary.configCandidateCount,
    preferredExactFileCount: plan.summary.preferredExactFileCount,
    planAllowsFetchNow: plan.summary.planAllowsFetchNow,
    acceptedNowCount: plan.summary.acceptedNowCount,
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
  conclusion: "Sportomedia/SEF previous_completed proof harness plan is verified. The exact GraphQL standings runner is selected, but execution remains blocked until a dedicated path-strict verifier exists.",
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
