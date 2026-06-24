import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-promotion-approval-board-${today}`, `sportomedia-sef-previous-completed-promotion-approval-board-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-promotion-approval-board-${today}`, `sportomedia-sef-previous-completed-promotion-approval-board-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-promotion-approval-board-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-previous-completed-promotion-approval-board-verification-${today}.json`);

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
if (board.runner !== "sportomedia_sef_previous_completed_promotion_approval_board") blocks.push("wrong_runner");
if (board.contractVersion !== 1) blocks.push("contract_version_not_1");

if (board.summary?.targetCount !== 2) blocks.push("target_count_not_2");
if (JSON.stringify(board.summary?.targetSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("target_slugs_mismatch");
if (board.summary?.targetSeasonScope !== "previous_completed") blocks.push("target_scope_not_previous_completed");
if (board.summary?.targetSeasonLabel !== "2024") blocks.push("target_season_label_not_2024");
if (board.summary?.eligibleAfterExplicitApprovalCount !== 2) blocks.push("eligible_after_approval_count_not_2");
if (board.summary?.blockedCount !== 0) blocks.push("blocked_count_not_0");
if (board.summary?.canonicalCandidateWriteAllowedNow !== false) blocks.push("canonical_write_allowed_now");
if (board.summary?.lifecycleWriteAllowedNow !== false) blocks.push("lifecycle_write_allowed_now");
if (board.summary?.productionWriteAllowedNow !== false) blocks.push("production_write_allowed_now");
if (board.summary?.truthAssertionAllowedNow !== false) blocks.push("truth_assertion_allowed_now");
if (board.summary?.explicitUserApprovalRequiredBeforeCanonicalCandidateWrite !== true) blocks.push("explicit_approval_not_required");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

if (rows.length !== 2) blocks.push("rows_length_not_2");

const expected = new Map([
  ["swe.1", { league: "Allsvenskan", configLeagueName: "allsvenskan" }],
  ["swe.2", { league: "Superettan", configLeagueName: "superettan" }]
]);

for (const [slug, meta] of expected.entries()) {
  const row = rows.find(item => item.slug === slug);
  if (!row) {
    blocks.push(`missing_row_${slug}`);
    continue;
  }

  if (row.league !== meta.league) blocks.push(`league_mismatch_${slug}`);
  if (row.sourceFamily !== "sportomedia_sef") blocks.push(`source_family_mismatch_${slug}`);
  if (row.seasonScope !== "previous_completed") blocks.push(`season_scope_mismatch_${slug}`);
  if (row.seasonLabel !== "2024") blocks.push(`season_label_mismatch_${slug}`);
  if (row.endpoint !== "https://gql.sportomedia.se/graphql") blocks.push(`endpoint_mismatch_${slug}`);
  if (row.operationName !== "StandingsForLeague") blocks.push(`operation_name_mismatch_${slug}`);
  if (row.variables?.configLeagueName !== meta.configLeagueName) blocks.push(`config_league_name_mismatch_${slug}`);
  if (row.variables?.configSeasonStartYear !== 2024) blocks.push(`config_season_start_year_mismatch_${slug}`);
  if (row.variables?.type !== "total") blocks.push(`type_mismatch_${slug}`);
  if (row.expectedRows !== 16) blocks.push(`expected_rows_mismatch_${slug}`);
  if (row.extractedRowCount !== 16) blocks.push(`extracted_row_count_mismatch_${slug}`);
  if (row.maxPlayed !== 30) blocks.push(`max_played_mismatch_${slug}`);
  if (row.playedPassCount !== 16) blocks.push(`played_pass_count_mismatch_${slug}`);
  if (row.pointsPassCount !== 16) blocks.push(`points_pass_count_mismatch_${slug}`);
  if (row.gdPassCount !== 16) blocks.push(`gd_pass_count_mismatch_${slug}`);
  if (row.nonTrivialCount !== 16) blocks.push(`non_trivial_count_mismatch_${slug}`);
  if (!Array.isArray(row.teamSignalHits) || row.teamSignalHits.length < 4) blocks.push(`team_signal_count_too_low_${slug}`);
  if (row.promotionEligibilityStatus !== "eligible_after_explicit_user_approval") blocks.push(`promotion_status_mismatch_${slug}`);
  if ((row.promotionEligibilityBlocks || []).length !== 0) blocks.push(`promotion_blocks_not_empty_${slug}`);
  if (row.explicitUserApprovalRequiredBeforeCanonicalCandidateWrite !== true) blocks.push(`row_explicit_approval_not_required_${slug}`);
  if (row.mayWriteCanonicalCandidateNow !== false) blocks.push(`row_may_write_canonical_now_${slug}`);
  if (row.mayWriteLifecycleNow !== false) blocks.push(`row_may_write_lifecycle_now_${slug}`);
  if (row.mayWriteProductionNow !== false) blocks.push(`row_may_write_production_now_${slug}`);
  if (row.mayAssertTruthNow !== false) blocks.push(`row_may_assert_truth_now_${slug}`);
  if (row.acceptedNow !== false) blocks.push(`row_accepted_now_${slug}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`row_acceptance_allowed_now_${slug}`);
  if (row.reviewOnly !== true) blocks.push(`row_not_review_only_${slug}`);
}

const guardrails = board.guardrails || {};
for (const key of ["searchExecutedNowCount", "fetchExecutedNowCount", "providerFetchExecutedNowCount", "standingsFetchExecutedNowCount", "canonicalWriteExecutedNowCount", "lifecycleWriteExecutedNowCount", "productionWriteExecutedNowCount", "truthAssertionExecutedNowCount"]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_previous_completed_promotion_approval_board",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    targetCount: board.summary.targetCount,
    targetSlugs: board.summary.targetSlugs,
    targetSeasonScope: board.summary.targetSeasonScope,
    targetSeasonLabel: board.summary.targetSeasonLabel,
    eligibleAfterExplicitApprovalCount: board.summary.eligibleAfterExplicitApprovalCount,
    blockedCount: board.summary.blockedCount,
    canonicalCandidateWriteAllowedNow: board.summary.canonicalCandidateWriteAllowedNow,
    lifecycleWriteAllowedNow: board.summary.lifecycleWriteAllowedNow,
    productionWriteAllowedNow: board.summary.productionWriteAllowedNow,
    truthAssertionAllowedNow: board.summary.truthAssertionAllowedNow,
    explicitUserApprovalRequiredBeforeCanonicalCandidateWrite: board.summary.explicitUserApprovalRequiredBeforeCanonicalCandidateWrite,
    acceptedNowCount: board.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.providerFetchExecutedNowCount === 0 &&
      guardrails.standingsFetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.lifecycleWriteExecutedNowCount === 0 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Sportomedia/SEF previous_completed promotion approval board is verified. The two Swedish leagues are eligible only after explicit user approval; no canonical, lifecycle, production, or truth write has been performed.",
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
