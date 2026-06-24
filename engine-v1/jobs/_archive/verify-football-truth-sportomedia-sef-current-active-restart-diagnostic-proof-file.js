import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const smallIntroPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-small-graphql-introspection-${today}`, `sportomedia-sef-small-graphql-introspection-${today}.json`);
const typeIntroPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-matches-type-introspection-${today}`, `sportomedia-sef-matches-type-introspection-${today}.json`);
const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-diagnostic-proof-${today}`, `sportomedia-sef-current-active-restart-diagnostic-proof-${today}.json`);
const proofRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-diagnostic-proof-${today}`, `sportomedia-sef-current-active-restart-diagnostic-proof-rows-${today}.jsonl`);

const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-diagnostic-proof-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-current-active-restart-diagnostic-proof-verification-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function beforeOrEqual(a, b) {
  return String(a) <= String(b);
}

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];

const smallIntro = JSON.parse(await fs.readFile(smallIntroPath, "utf8"));
const typeIntro = JSON.parse(await fs.readFile(typeIntroPath, "utf8"));
const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofRows = parseJsonl(await fs.readFile(proofRowsPath, "utf8"));

if (smallIntro.status !== "passed") blocks.push("small_introspection_status_not_passed");
if (smallIntro.summary?.readyForFixtureProbe !== true) blocks.push("small_introspection_not_ready_for_fixture_probe");
if (!Array.isArray(smallIntro.rows) || !smallIntro.rows.some(row => row.fieldName === "matchesForLeague")) blocks.push("small_introspection_missing_matchesForLeague");
if (!Array.isArray(smallIntro.rows) || !smallIntro.rows.some(row => row.fieldName === "standingsForLeague")) blocks.push("small_introspection_missing_standingsForLeague");

if (typeIntro.status !== "passed") blocks.push("matches_type_introspection_status_not_passed");
if (typeIntro.summary?.readyToPatchMatchesForLeagueQuery !== true) blocks.push("matches_type_not_ready_to_patch_query");
if (!Array.isArray(typeIntro.rows) || !typeIntro.rows.some(row => row.typeName === "Matches" && row.fieldName === "matches" && row.fieldTypeLeaf === "MinimizedMatch")) blocks.push("matches_wrapper_shape_missing");
if (!Array.isArray(typeIntro.rows) || !typeIntro.rows.some(row => row.typeName === "MinimizedMatch" && row.fieldName === "startDate")) blocks.push("minimized_match_missing_startDate");
if (!Array.isArray(typeIntro.rows) || !typeIntro.rows.some(row => row.typeName === "MinimizedMatch" && row.fieldName === "homeTeamName")) blocks.push("minimized_match_missing_homeTeamName");
if (!Array.isArray(typeIntro.rows) || !typeIntro.rows.some(row => row.typeName === "MinimizedMatch" && row.fieldName === "visitingTeamName")) blocks.push("minimized_match_missing_visitingTeamName");

if (proof.status !== "passed") blocks.push("proof_status_not_passed");
if (proof.runner !== "sportomedia_sef_current_active_restart_diagnostic_proof") blocks.push("proof_runner_mismatch");
if (proof.summary?.targetCount !== 2) blocks.push("proof_target_count_not_2");
if (JSON.stringify(proof.summary?.targetSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("proof_target_slugs_mismatch");
if (proof.summary?.seasonScope !== "current_active") blocks.push("proof_scope_not_current_active");
if (proof.summary?.seasonLabel !== "2026") blocks.push("proof_season_label_not_2026");
if (proof.summary?.passedRowCount !== 2) blocks.push("proof_passed_row_count_not_2");
if (proof.summary?.failedRowCount !== 0) blocks.push("proof_failed_row_count_not_0");
if (proof.summary?.requestAttemptCount !== 4) blocks.push("proof_request_attempt_count_not_4");
if (proof.summary?.acceptedNowCount !== 0) blocks.push("proof_accepted_now_not_0");
if (proof.summary?.productionWriteAllowedNow !== false) blocks.push("proof_production_write_allowed");
if (proof.summary?.truthAssertionAllowedNow !== false) blocks.push("proof_truth_assertion_allowed");

const guardrails = proof.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 4) blocks.push("fetch_executed_not_4");
if (guardrails.standingsFetchExecutedNowCount !== 2) blocks.push("standings_fetch_count_not_2");
if (guardrails.fixtureFetchExecutedNowCount !== 2) blocks.push("fixture_fetch_count_not_2");
if (guardrails.restartDateFetchExecutedNowCount !== 2) blocks.push("restart_date_fetch_count_not_2");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_executed_not_zero");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_executed_not_zero");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_executed_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_executed_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

const expected = new Map([
  ["swe.1", { league: "Allsvenskan", restartDate: "2026-07-03", nextFixturePollNotBefore: "2026-06-26" }],
  ["swe.2", { league: "Superettan", restartDate: "2026-06-21", nextFixturePollNotBefore: "2026-06-14" }]
]);

for (const [slug, meta] of expected.entries()) {
  const row = (proof.rows || []).find(item => item.slug === slug);
  const jsonlRow = proofRows.find(item => item.slug === slug);

  if (!row) {
    blocks.push(`missing_proof_row_${slug}`);
    continue;
  }

  if (!jsonlRow) blocks.push(`missing_jsonl_row_${slug}`);
  if (row.league !== meta.league) blocks.push(`league_mismatch_${slug}`);
  if (row.sourceFamily !== "sportomedia_sef") blocks.push(`source_family_mismatch_${slug}`);
  if (row.seasonScope !== "current_active") blocks.push(`season_scope_mismatch_${slug}`);
  if (row.seasonLabel !== "2026") blocks.push(`season_label_mismatch_${slug}`);

  if (row.standings?.extractedRowCount !== 16) blocks.push(`standings_row_count_not_16_${slug}`);
  if (row.standings?.validation?.passed !== true) blocks.push(`standings_validation_not_passed_${slug}`);
  if (row.fixtures?.extractedRowCount !== 240) blocks.push(`fixture_row_count_not_240_${slug}`);
  if (row.fixtures?.validation?.passed !== true) blocks.push(`fixture_validation_not_passed_${slug}`);

  if (row.restartDate !== meta.restartDate) blocks.push(`restart_date_mismatch_${slug}`);
  if (row.nextFixturePollNotBefore !== meta.nextFixturePollNotBefore) blocks.push(`next_fixture_poll_not_before_mismatch_${slug}`);
  if (!validDate(row.restartDate)) blocks.push(`restart_date_invalid_${slug}`);
  if (!validDate(row.nextFixturePollNotBefore)) blocks.push(`next_fixture_poll_not_before_invalid_${slug}`);
  if (!beforeOrEqual(row.nextFixturePollNotBefore, row.restartDate)) blocks.push(`not_before_after_restart_${slug}`);

  if (!Array.isArray(row.firstFutureFixtures) || row.firstFutureFixtures.length === 0) blocks.push(`first_future_fixtures_empty_${slug}`);
  if ((row.futureFixtureCount || 0) <= 0) blocks.push(`future_fixture_count_not_positive_${slug}`);

  const firstFuture = row.firstFutureFixtures?.[0] || null;
  if (!firstFuture?.startDate || String(firstFuture.startDate).slice(0, 10) !== row.restartDate) blocks.push(`first_future_fixture_not_restart_date_${slug}`);
  if (firstFuture?.status !== "UPCOMING") blocks.push(`first_future_fixture_status_not_upcoming_${slug}`);

  if (row.lifecycleSchedulerCandidate?.lifecycleState !== "current_active_in_scheduled_break") blocks.push(`lifecycle_state_mismatch_${slug}`);
  if (row.lifecycleSchedulerCandidate?.requiredDateField !== "restartDate") blocks.push(`required_date_field_mismatch_${slug}`);
  if (row.lifecycleSchedulerCandidate?.restartDate !== row.restartDate) blocks.push(`lifecycle_restart_date_mismatch_${slug}`);
  if (row.lifecycleSchedulerCandidate?.nextFixturePollNotBefore !== row.nextFixturePollNotBefore) blocks.push(`lifecycle_not_before_mismatch_${slug}`);
  if (row.lifecycleSchedulerCandidate?.fixturePollingMode !== "suppress_daily_fixture_search_until_not_before_date") blocks.push(`fixture_polling_mode_mismatch_${slug}`);

  if (row.acceptedNow !== false) blocks.push(`accepted_now_not_false_${slug}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`acceptance_allowed_now_not_false_${slug}`);
  if (row.reviewOnly !== true) blocks.push(`review_only_not_true_${slug}`);
}

const attempts = proof.attempts || [];
for (const slug of expected.keys()) {
  const standingsAttempt = attempts.find(item => item.slug === slug && item.operationName === "StandingsForLeague");
  const fixturesAttempt = attempts.find(item => item.slug === slug && item.operationName === "MatchesForLeague");

  if (!standingsAttempt) blocks.push(`missing_standings_attempt_${slug}`);
  if (!fixturesAttempt) blocks.push(`missing_fixtures_attempt_${slug}`);

  if (standingsAttempt) {
    if (standingsAttempt.status !== 0) blocks.push(`standings_attempt_status_not_zero_${slug}`);
    if (standingsAttempt.graphQlErrorCount !== 0) blocks.push(`standings_graphql_errors_${slug}`);
    if (standingsAttempt.rowCount !== 16) blocks.push(`standings_attempt_row_count_not_16_${slug}`);
    if (standingsAttempt.validationPassed !== true) blocks.push(`standings_attempt_validation_not_passed_${slug}`);
  }

  if (fixturesAttempt) {
    if (fixturesAttempt.status !== 0) blocks.push(`fixtures_attempt_status_not_zero_${slug}`);
    if (fixturesAttempt.graphQlErrorCount !== 0) blocks.push(`fixtures_graphql_errors_${slug}`);
    if (fixturesAttempt.rowCount !== 240) blocks.push(`fixtures_attempt_row_count_not_240_${slug}`);
    if (fixturesAttempt.validationPassed !== true) blocks.push(`fixtures_attempt_validation_not_passed_${slug}`);
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_current_active_restart_diagnostic_proof",
  contractVersion: 1,
  smallIntrospectionPath: rel(smallIntroPath),
  smallIntrospectionSha256: await sha256(smallIntroPath),
  matchesTypeIntrospectionPath: rel(typeIntroPath),
  matchesTypeIntrospectionSha256: await sha256(typeIntroPath),
  proofPath: rel(proofPath),
  proofSha256: await sha256(proofPath),
  proofRowsPath: rel(proofRowsPath),
  proofRowsSha256: await sha256(proofRowsPath),
  verificationPath: rel(verificationPath),
  verified: {
    targetCount: proof.summary.targetCount,
    targetSlugs: proof.summary.targetSlugs,
    seasonScope: proof.summary.seasonScope,
    seasonLabel: proof.summary.seasonLabel,
    passedRowCount: proof.summary.passedRowCount,
    failedRowCount: proof.summary.failedRowCount,
    requestAttemptCount: proof.summary.requestAttemptCount,
    restartDates: proof.summary.restartDates,
    nextFixturePollNotBefore: proof.summary.nextFixturePollNotBefore,
    standingsFetchExecutedNowCount: guardrails.standingsFetchExecutedNowCount,
    fixtureFetchExecutedNowCount: guardrails.fixtureFetchExecutedNowCount,
    restartDateFetchExecutedNowCount: guardrails.restartDateFetchExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 4 &&
      guardrails.standingsFetchExecutedNowCount === 2 &&
      guardrails.fixtureFetchExecutedNowCount === 2 &&
      guardrails.restartDateFetchExecutedNowCount === 2 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.lifecycleWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Sportomedia/SEF current-active 2026 proof is verified for swe.1 and swe.2: standings, fixtures, restartDate, and nextFixturePollNotBefore are present. Daily fixture polling can be suppressed until the not-before dates.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  verificationPath: report.verificationPath,
  verified: report.verified,
  conclusion: report.conclusion,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
