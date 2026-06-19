import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const policyPath = path.join(root, "data", "football-truth", "_diagnostics", `lifecycle-restart-date-governance-policy-${today}`, `lifecycle-restart-date-governance-policy-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `lifecycle-restart-date-governance-policy-${today}`, `lifecycle-restart-date-governance-policy-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `lifecycle-restart-date-governance-policy-verification-${today}`);
const verificationPath = path.join(verificationDir, `lifecycle-restart-date-governance-policy-verification-${today}.json`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const policy = JSON.parse(await fs.readFile(policyPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (policy.status !== "passed") blocks.push("policy_status_not_passed");
if (policy.runner !== "lifecycle_restart_date_governance_policy") blocks.push("wrong_runner");
if (policy.contractVersion !== 1) blocks.push("contract_version_not_1");
if (policy.scope !== "global_all_competitions_all_source_families") blocks.push("scope_not_global");
if (policy.summary?.appliesToAllLeagues !== true) blocks.push("not_applies_to_all_leagues");
if (policy.summary?.appliesToAllSourceFamilies !== true) blocks.push("not_applies_to_all_source_families");
if (policy.summary?.dailyFixtureSearchSuppressionRequired !== true) blocks.push("daily_suppression_not_required");
if (policy.summary?.knownFutureStartOrRestartSuppressesDailyFixtureSearch !== true) blocks.push("known_future_date_does_not_suppress");
if (policy.summary?.unknownStartOrRestartAllowsOnlyBoundedEvidenceRefresh !== true) blocks.push("unknown_date_not_bounded_evidence_only");
if (policy.summary?.currentActiveBreakRequiresRestartDate !== true) blocks.push("current_active_break_not_requiring_restart_date");

const requiredStates = [
  "previous_completed_or_offseason",
  "current_active_in_scheduled_break",
  "current_active_suspended_or_postponed",
  "current_active_playing",
  "season_completed",
  "unknown_or_unclassified"
];

for (const state of requiredStates) {
  const row = policy.lifecyclePolicyRows?.find(item => item.lifecycleState === state);
  if (!row) {
    blocks.push(`missing_lifecycle_policy_${state}`);
    continue;
  }

  if (row.appliesTo !== "all_competitions_all_source_families") blocks.push(`state_not_global_${state}`);
  if (!row.requiredDateField) blocks.push(`missing_required_date_field_${state}`);
  if (!row.requiredEvidenceLane) blocks.push(`missing_required_evidence_lane_${state}`);
  if (!row.fixturePollingMode) blocks.push(`missing_fixture_polling_mode_${state}`);
  if (!row.notBeforeDatePolicy) blocks.push(`missing_not_before_policy_${state}`);

  if (state !== "current_active_playing" && state !== "unknown_or_unclassified") {
    if (!String(row.fixturePollingMode).includes("suppress") && !String(row.fixturePollingMode).includes("block")) {
      blocks.push(`non_playing_state_does_not_suppress_or_block_${state}`);
    }
  }
}

const requiredInvariants = [
  "no_daily_fixture_search_when_known_future_start_or_restart_is_outside_lookahead_window",
  "if_restart_or_start_date_unknown_do_not_run_general_daily_fixture_search",
  "current_active_break_requires_restart_date_even_if_previous_completed_candidate_exists"
];

for (const invariant of requiredInvariants) {
  const row = policy.invariantRows?.find(item => item.invariant === invariant);
  if (!row) {
    blocks.push(`missing_invariant_${invariant}`);
    continue;
  }

  if (row.appliesTo !== "all_competitions_all_source_families") blocks.push(`invariant_not_global_${invariant}`);
  if (row.severity !== "hard_block") blocks.push(`invariant_not_hard_block_${invariant}`);
  if (row.productionWriteAllowedNow !== false) blocks.push(`invariant_production_write_allowed_${invariant}`);
  if (row.truthAssertionAllowedNow !== false) blocks.push(`invariant_truth_assertion_allowed_${invariant}`);
}

const examples = policy.sportomediaExampleRows || [];
if (examples.length !== 2) blocks.push("sportomedia_example_count_not_2");
for (const slug of ["swe.1", "swe.2"]) {
  const row = examples.find(item => item.slug === slug);
  if (!row) {
    blocks.push(`missing_sportomedia_example_${slug}`);
    continue;
  }

  if (row.currentSeasonScope !== "current_active") blocks.push(`sportomedia_example_scope_mismatch_${slug}`);
  if (row.currentSeasonLabel !== "2026") blocks.push(`sportomedia_example_season_mismatch_${slug}`);
  if (row.restartDateRequired !== true) blocks.push(`sportomedia_example_restart_not_required_${slug}`);
  if (row.globalPolicyMapping?.lifecycleState !== "current_active_in_scheduled_break") blocks.push(`sportomedia_example_mapping_mismatch_${slug}`);

  for (const lane of ["current_active_season_standings", "current_active_season_fixtures_or_matchdays", "restart_date_after_world_cup_break"]) {
    if (!(row.requiredProofLanes || []).includes(lane)) blocks.push(`sportomedia_example_${slug}_missing_lane_${lane}`);
  }
}

const guardrails = policy.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "fixtureFetchExecutedNowCount", "restartDateFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "lifecycleWriteExecutedNowCount", "schedulerWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_lifecycle_restart_date_governance_policy",
  contractVersion: 1,
  policyPath: path.relative(root, policyPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  policySha256: await sha256(policyPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    scope: policy.scope,
    appliesToAllLeagues: policy.summary.appliesToAllLeagues,
    appliesToAllSourceFamilies: policy.summary.appliesToAllSourceFamilies,
    lifecyclePolicyRowCount: policy.summary.lifecyclePolicyRowCount,
    invariantRowCount: policy.summary.invariantRowCount,
    rowFileRowCount: rows.length,
    defaultLookaheadDaysBeforeStartOrRestart: policy.summary.defaultLookaheadDaysBeforeStartOrRestart,
    dailyFixtureSearchSuppressionRequired: policy.summary.dailyFixtureSearchSuppressionRequired,
    knownFutureStartOrRestartSuppressesDailyFixtureSearch: policy.summary.knownFutureStartOrRestartSuppressesDailyFixtureSearch,
    unknownStartOrRestartAllowsOnlyBoundedEvidenceRefresh: policy.summary.unknownStartOrRestartAllowsOnlyBoundedEvidenceRefresh,
    currentActiveBreakRequiresRestartDate: policy.summary.currentActiveBreakRequiresRestartDate,
    sportomediaExampleTargetSlugs: policy.summary.sportomediaExampleTargetSlugs,
    productionWriteAllowedNow: policy.summary.productionWriteAllowedNow,
    truthAssertionAllowedNow: policy.summary.truthAssertionAllowedNow,
    acceptedNowCount: policy.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.providerFetchExecutedNowCount === 0 &&
      guardrails.standingsFetchExecutedNowCount === 0 &&
      guardrails.fixtureFetchExecutedNowCount === 0 &&
      guardrails.restartDateFetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.lifecycleWriteExecutedNowCount === 0 &&
      guardrails.schedulerWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Global restart/start-date governance policy verified: all leagues require next start or restart evidence before daily fixture polling is allowed outside the active window.",
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
