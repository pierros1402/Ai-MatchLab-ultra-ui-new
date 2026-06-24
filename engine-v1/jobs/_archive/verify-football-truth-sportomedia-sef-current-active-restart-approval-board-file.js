import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-approval-board-${today}`, `sportomedia-sef-current-active-restart-approval-board-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-approval-board-${today}`, `sportomedia-sef-current-active-restart-approval-board-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-approval-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-current-active-restart-approval-board-verification-${today}.json`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

await fs.mkdir(verificationDir, { recursive: true });

const blocks = [];
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (board.status !== "passed") blocks.push("board_status_not_passed");
if (board.runner !== "sportomedia_sef_current_active_restart_approval_board") blocks.push("runner_mismatch");
if (board.summary?.targetCount !== 2) blocks.push("target_count_not_2");
if (JSON.stringify(board.summary?.targetSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("target_slugs_mismatch");
if (board.summary?.seasonScope !== "current_active") blocks.push("scope_not_current_active");
if (board.summary?.seasonLabel !== "2026") blocks.push("season_not_2026");
if (board.summary?.eligibleAfterExplicitApprovalCount !== 2) blocks.push("eligible_count_not_2");
if (board.summary?.blockedCount !== 0) blocks.push("blocked_count_not_0");
if (board.summary?.explicitUserApprovalRequiredBeforeCandidateWrite !== true) blocks.push("explicit_approval_not_required");
if (board.summary?.canonicalCandidateWriteAllowedNow !== false) blocks.push("canonical_candidate_allowed_now");
if (board.summary?.lifecycleCandidateWriteAllowedNow !== false) blocks.push("lifecycle_candidate_allowed_now");
if (board.summary?.schedulerCandidateWriteAllowedNow !== false) blocks.push("scheduler_candidate_allowed_now");
if (board.summary?.productionWriteAllowedNow !== false) blocks.push("production_write_allowed_now");
if (board.summary?.truthAssertionAllowedNow !== false) blocks.push("truth_assertion_allowed_now");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

const expected = new Map([
  ["swe.1", { league: "Allsvenskan", restartDate: "2026-07-03", nextFixturePollNotBefore: "2026-06-26" }],
  ["swe.2", { league: "Superettan", restartDate: "2026-06-21", nextFixturePollNotBefore: "2026-06-14" }]
]);

if (rows.length !== 2) blocks.push("rows_length_not_2");

for (const [slug, meta] of expected.entries()) {
  const row = rows.find(item => item.slug === slug);
  if (!row) {
    blocks.push(`missing_row_${slug}`);
    continue;
  }

  if (row.league !== meta.league) blocks.push(`league_mismatch_${slug}`);
  if (row.sourceFamily !== "sportomedia_sef") blocks.push(`source_family_mismatch_${slug}`);
  if (row.seasonScope !== "current_active") blocks.push(`season_scope_mismatch_${slug}`);
  if (row.seasonLabel !== "2026") blocks.push(`season_label_mismatch_${slug}`);
  if (row.standingsRows !== 16) blocks.push(`standings_rows_not_16_${slug}`);
  if (row.fixtureRows !== 240) blocks.push(`fixture_rows_not_240_${slug}`);
  if (row.restartDate !== meta.restartDate) blocks.push(`restart_date_mismatch_${slug}`);
  if (row.nextFixturePollNotBefore !== meta.nextFixturePollNotBefore) blocks.push(`next_fixture_poll_not_before_mismatch_${slug}`);
  if (row.lifecycleState !== "current_active_in_scheduled_break") blocks.push(`lifecycle_state_mismatch_${slug}`);
  if (row.fixturePollingMode !== "suppress_daily_fixture_search_until_not_before_date") blocks.push(`fixture_polling_mode_mismatch_${slug}`);
  if (row.currentActiveRestartCandidateStatus !== "eligible_after_explicit_user_approval") blocks.push(`candidate_status_mismatch_${slug}`);
  if ((row.currentActiveRestartCandidateBlocks || []).length !== 0) blocks.push(`candidate_blocks_not_empty_${slug}`);
  if (row.explicitUserApprovalRequiredBeforeCandidateWrite !== true) blocks.push(`row_explicit_approval_not_required_${slug}`);
  if (row.mayWriteCanonicalCandidateNow !== false) blocks.push(`row_may_write_canonical_now_${slug}`);
  if (row.mayWriteLifecycleCandidateNow !== false) blocks.push(`row_may_write_lifecycle_now_${slug}`);
  if (row.mayWriteSchedulerCandidateNow !== false) blocks.push(`row_may_write_scheduler_now_${slug}`);
  if (row.mayWriteProductionNow !== false) blocks.push(`row_may_write_production_now_${slug}`);
  if (row.mayAssertTruthNow !== false) blocks.push(`row_may_assert_truth_now_${slug}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_${slug}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_now_${slug}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${slug}`);
}

const guardrails = board.guardrails || {};
for (const key of [
  "searchExecutedNowCount",
  "fetchExecutedNowCount",
  "providerFetchExecutedNowCount",
  "standingsFetchExecutedNowCount",
  "fixtureFetchExecutedNowCount",
  "restartDateFetchExecutedNowCount",
  "canonicalWriteExecutedNowCount",
  "canonicalCandidateWriteExecutedNowCount",
  "lifecycleWriteExecutedNowCount",
  "lifecycleCandidateWriteExecutedNowCount",
  "schedulerWriteExecutedNowCount",
  "schedulerCandidateWriteExecutedNowCount",
  "productionWriteExecutedNowCount",
  "truthAssertionExecutedNowCount"
]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_current_active_restart_approval_board",
  contractVersion: 1,
  boardPath: rel(boardPath),
  rowsPath: rel(rowsPath),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verificationPath: rel(verificationPath),
  verified: {
    targetCount: board.summary.targetCount,
    targetSlugs: board.summary.targetSlugs,
    seasonScope: board.summary.seasonScope,
    seasonLabel: board.summary.seasonLabel,
    eligibleAfterExplicitApprovalCount: board.summary.eligibleAfterExplicitApprovalCount,
    blockedCount: board.summary.blockedCount,
    restartDates: board.summary.restartDates,
    nextFixturePollNotBefore: board.summary.nextFixturePollNotBefore,
    explicitUserApprovalRequiredBeforeCandidateWrite: board.summary.explicitUserApprovalRequiredBeforeCandidateWrite,
    canonicalCandidateWriteAllowedNow: board.summary.canonicalCandidateWriteAllowedNow,
    lifecycleCandidateWriteAllowedNow: board.summary.lifecycleCandidateWriteAllowedNow,
    schedulerCandidateWriteAllowedNow: board.summary.schedulerCandidateWriteAllowedNow,
    productionWriteAllowedNow: board.summary.productionWriteAllowedNow,
    truthAssertionAllowedNow: board.summary.truthAssertionAllowedNow,
    acceptedNowCount: board.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.providerFetchExecutedNowCount === 0 &&
      guardrails.standingsFetchExecutedNowCount === 0 &&
      guardrails.fixtureFetchExecutedNowCount === 0 &&
      guardrails.restartDateFetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.canonicalCandidateWriteExecutedNowCount === 0 &&
      guardrails.lifecycleWriteExecutedNowCount === 0 &&
      guardrails.lifecycleCandidateWriteExecutedNowCount === 0 &&
      guardrails.schedulerWriteExecutedNowCount === 0 &&
      guardrails.schedulerCandidateWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Sportomedia/SEF current-active restart approval board is verified. swe.1 and swe.2 are eligible for review-only current-active restart/scheduler candidate files only after explicit user approval.",
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
