import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const boardPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-candidate-files-${today}`, `sportomedia-sef-previous-completed-candidate-files-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-candidate-files-${today}`, `sportomedia-sef-previous-completed-candidate-files-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-previous-completed-candidate-files-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-previous-completed-candidate-files-verification-${today}.json`);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

const blocks = [];
const board = JSON.parse(await fs.readFile(boardPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (board.status !== "passed") blocks.push("board_status_not_passed");
if (board.runner !== "write_sportomedia_sef_previous_completed_candidate_files") blocks.push("wrong_runner");
if (board.contractVersion !== 1) blocks.push("contract_version_not_1");

if (board.summary?.candidateFileCount !== 2) blocks.push("candidate_file_count_not_2");
if (JSON.stringify(board.summary?.targetSlugs || []) !== JSON.stringify(["swe.1", "swe.2"])) blocks.push("target_slugs_mismatch");
if (board.summary?.seasonScope !== "previous_completed") blocks.push("season_scope_not_previous_completed");
if (board.summary?.seasonLabel !== "2024") blocks.push("season_label_not_2024");
if (board.summary?.canonicalCandidateWriteExecutedNowCount !== 2) blocks.push("canonical_candidate_write_count_not_2");
if (board.summary?.lifecycleCandidateWriteExecutedNowCount !== 2) blocks.push("lifecycle_candidate_write_count_not_2");
if (board.summary?.productionWriteExecutedNowCount !== 0) blocks.push("production_write_count_not_0");
if (board.summary?.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_count_not_0");
if (board.summary?.currentActiveFollowupRequired !== true) blocks.push("current_active_followup_required_not_true");
if (board.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");

for (const lane of ["current_active_season_standings", "current_active_season_fixtures_or_matchdays", "restart_date_after_world_cup_break"]) {
  if (!(board.summary?.nextRequiredProofLanes || []).includes(lane)) blocks.push(`missing_next_required_lane_${lane}`);
}

if (rows.length !== 2) blocks.push("rows_length_not_2");

const expected = new Map([
  ["swe.1", { league: "Allsvenskan" }],
  ["swe.2", { league: "Superettan" }]
]);

for (const [slug, meta] of expected.entries()) {
  const row = rows.find(item => item.slug === slug);
  if (!row) {
    blocks.push(`missing_row_${slug}`);
    continue;
  }

  if (row.league !== meta.league) blocks.push(`league_mismatch_${slug}`);
  if (row.seasonScope !== "previous_completed") blocks.push(`season_scope_mismatch_${slug}`);
  if (row.seasonLabel !== "2024") blocks.push(`season_label_mismatch_${slug}`);
  if (row.extractedRowCount !== 16) blocks.push(`extracted_row_count_mismatch_${slug}`);
  if (row.validationPassed !== true) blocks.push(`validation_not_passed_${slug}`);
  if (row.currentActiveFollowupRequired !== true) blocks.push(`current_active_followup_not_true_${slug}`);
  if (row.productionWriteAllowed !== false) blocks.push(`production_write_allowed_${slug}`);
  if (row.truthAssertionAllowed !== false) blocks.push(`truth_assertion_allowed_${slug}`);
  if (row.acceptedNow !== false) blocks.push(`accepted_now_${slug}`);
  if (row.acceptanceAllowedNow !== false) blocks.push(`acceptance_allowed_now_${slug}`);
  if (row.reviewOnly !== true) blocks.push(`not_review_only_${slug}`);

  for (const lane of ["current_active_season_standings", "current_active_season_fixtures_or_matchdays", "restart_date_after_world_cup_break"]) {
    if (!(row.nextRequiredProofLanes || []).includes(lane)) blocks.push(`row_${slug}_missing_lane_${lane}`);
  }

  const candidatePath = path.join(root, row.candidateFile);
  if (!(await exists(candidatePath))) {
    blocks.push(`missing_candidate_file_${slug}`);
    continue;
  }

  const candidate = JSON.parse(await fs.readFile(candidatePath, "utf8"));
  const actualSha = await sha256(candidatePath);
  if (row.candidateFileSha256 !== actualSha) blocks.push(`candidate_sha_mismatch_${slug}`);

  if (candidate.status !== "candidate_ready_for_review") blocks.push(`candidate_status_mismatch_${slug}`);
  if (candidate.candidateType !== "football_truth_previous_completed_standings_candidate") blocks.push(`candidate_type_mismatch_${slug}`);
  if (candidate.slug !== slug) blocks.push(`candidate_slug_mismatch_${slug}`);
  if (candidate.league !== meta.league) blocks.push(`candidate_league_mismatch_${slug}`);
  if (candidate.seasonScope !== "previous_completed") blocks.push(`candidate_scope_mismatch_${slug}`);
  if (candidate.seasonLabel !== "2024") blocks.push(`candidate_season_mismatch_${slug}`);
  if (candidate.sourceFamily !== "sportomedia_sef") blocks.push(`candidate_family_mismatch_${slug}`);
  if (candidate.expectedRows !== 16) blocks.push(`candidate_expected_rows_mismatch_${slug}`);
  if (candidate.extractedRowCount !== 16) blocks.push(`candidate_extracted_rows_mismatch_${slug}`);
  if (!Array.isArray(candidate.standingsRows) || candidate.standingsRows.length !== 16) blocks.push(`candidate_standings_rows_length_mismatch_${slug}`);
  if (candidate.validation?.validationPassed !== true) blocks.push(`candidate_validation_not_passed_${slug}`);

  if (candidate.lifecycleCandidate?.maySatisfyLane !== "previous_completed") blocks.push(`candidate_lifecycle_lane_mismatch_${slug}`);
  if (candidate.lifecycleCandidate?.previousCompletedSeasonLabel !== "2024") blocks.push(`candidate_lifecycle_previous_completed_label_mismatch_${slug}`);
  if (candidate.lifecycleCandidate?.currentActiveFollowupRequired !== true) blocks.push(`candidate_current_active_followup_not_true_${slug}`);

  for (const lane of ["current_active_season_standings", "current_active_season_fixtures_or_matchdays", "restart_date_after_world_cup_break"]) {
    if (!(candidate.lifecycleCandidate?.nextRequiredProofLanes || []).includes(lane)) blocks.push(`candidate_${slug}_missing_next_lane_${lane}`);
  }

  if (candidate.writePolicy?.explicitUserApprovalObserved !== true) blocks.push(`candidate_approval_not_observed_${slug}`);
  if (candidate.writePolicy?.canonicalCandidateWriteOnly !== true) blocks.push(`candidate_canonical_candidate_only_not_true_${slug}`);
  if (candidate.writePolicy?.lifecycleCandidateWriteOnly !== true) blocks.push(`candidate_lifecycle_candidate_only_not_true_${slug}`);
  if (candidate.writePolicy?.productionWriteAllowed !== false) blocks.push(`candidate_production_write_allowed_${slug}`);
  if (candidate.writePolicy?.truthAssertionAllowed !== false) blocks.push(`candidate_truth_assertion_allowed_${slug}`);
  if (candidate.writePolicy?.rawPayloadCommitted !== false) blocks.push(`candidate_raw_payload_committed_${slug}`);
  if (candidate.acceptedNow !== false) blocks.push(`candidate_accepted_now_${slug}`);
  if (candidate.acceptanceAllowedNow !== false) blocks.push(`candidate_acceptance_allowed_now_${slug}`);
  if (candidate.reviewOnly !== true) blocks.push(`candidate_not_review_only_${slug}`);
}

const guardrails = board.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.providerFetchExecutedNowCount !== 0) blocks.push("provider_fetch_executed_not_zero");
if (guardrails.standingsFetchExecutedNowCount !== 0) blocks.push("standings_fetch_executed_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_executed_not_zero");
if (guardrails.canonicalCandidateWriteExecutedNowCount !== 2) blocks.push("canonical_candidate_write_executed_not_2");
if (guardrails.lifecycleWriteExecutedNowCount !== 0) blocks.push("lifecycle_write_executed_not_zero");
if (guardrails.lifecycleCandidateWriteExecutedNowCount !== 2) blocks.push("lifecycle_candidate_write_executed_not_2");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_executed_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_executed_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_previous_completed_candidate_files",
  contractVersion: 1,
  boardPath: path.relative(root, boardPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  boardSha256: await sha256(boardPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    candidateFileCount: board.summary.candidateFileCount,
    targetSlugs: board.summary.targetSlugs,
    seasonScope: board.summary.seasonScope,
    seasonLabel: board.summary.seasonLabel,
    canonicalCandidateWriteExecutedNowCount: board.summary.canonicalCandidateWriteExecutedNowCount,
    lifecycleCandidateWriteExecutedNowCount: board.summary.lifecycleCandidateWriteExecutedNowCount,
    productionWriteExecutedNowCount: board.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: board.summary.truthAssertionExecutedNowCount,
    currentActiveFollowupRequired: board.summary.currentActiveFollowupRequired,
    nextRequiredProofLanes: board.summary.nextRequiredProofLanes,
    acceptedNowCount: board.summary.acceptedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.providerFetchExecutedNowCount === 0 &&
      guardrails.standingsFetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.canonicalCandidateWriteExecutedNowCount === 2 &&
      guardrails.lifecycleWriteExecutedNowCount === 0 &&
      guardrails.lifecycleCandidateWriteExecutedNowCount === 2 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Sportomedia/SEF previous_completed candidate files are verified for swe.1 and swe.2 2024. They are review-only candidate files and explicitly require current active standings/fixtures/restart-date follow-up.",
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
