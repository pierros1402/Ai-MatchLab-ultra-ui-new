import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const reportPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-candidate-files-${today}`, `sportomedia-sef-current-active-restart-candidate-files-${today}.json`);
const rowsPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-candidate-files-${today}`, `sportomedia-sef-current-active-restart-candidate-files-rows-${today}.jsonl`);
const verificationDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-candidate-files-verification-${today}`);
const verificationPath = path.join(verificationDir, `sportomedia-sef-current-active-restart-candidate-files-verification-${today}.json`);

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
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (report.status !== "passed") blocks.push("report_status_not_passed");
if (report.summary?.candidateFileCount !== 2) blocks.push("candidate_file_count_not_2");
if (report.summary?.writtenReviewOnlyCandidateCount !== 2) blocks.push("written_review_only_count_not_2");
if (report.summary?.blockedCount !== 0) blocks.push("blocked_count_not_0");
if (report.summary?.acceptedNowCount !== 0) blocks.push("accepted_now_not_zero");
if (report.summary?.productionWriteExecutedNowCount !== 0) blocks.push("production_write_not_zero");
if (report.summary?.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_not_zero");

const guardrails = report.guardrails || {};
if (guardrails.searchExecutedNowCount !== 0) blocks.push("search_executed_not_zero");
if (guardrails.fetchExecutedNowCount !== 0) blocks.push("fetch_executed_not_zero");
if (guardrails.canonicalWriteExecutedNowCount !== 0) blocks.push("canonical_write_not_zero");
if (guardrails.canonicalCandidateWriteExecutedNowCount !== 0) blocks.push("canonical_candidate_write_not_zero");
if (guardrails.lifecycleCandidateWriteExecutedNowCount !== 2) blocks.push("lifecycle_candidate_write_count_not_2");
if (guardrails.schedulerCandidateWriteExecutedNowCount !== 2) blocks.push("scheduler_candidate_write_count_not_2");
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("production_write_guardrail_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("truth_assertion_guardrail_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("full_raw_payload_written_not_false");

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

  if (row.candidateStatus !== "written_review_only_candidate") blocks.push(`row_candidate_not_written_${slug}`);
  if (row.restartDate !== meta.restartDate) blocks.push(`row_restart_mismatch_${slug}`);
  if (row.nextFixturePollNotBefore !== meta.nextFixturePollNotBefore) blocks.push(`row_not_before_mismatch_${slug}`);
  if (row.standingsRows !== 16) blocks.push(`row_standings_not_16_${slug}`);
  if (row.fixtureRows !== 240) blocks.push(`row_fixtures_not_240_${slug}`);
  if (row.productionWriteExecutedNow !== false) blocks.push(`row_production_not_false_${slug}`);
  if (row.truthAssertionExecutedNow !== false) blocks.push(`row_truth_not_false_${slug}`);

  const file = (report.candidateFiles || []).find(item => item.includes(`${slug}-current-active-2026`));
  if (!file) {
    blocks.push(`missing_candidate_file_ref_${slug}`);
    continue;
  }

  const fullPath = path.join(root, file);
  const candidate = JSON.parse(await fs.readFile(fullPath, "utf8"));

  if (candidate.status !== "review_only_candidate") blocks.push(`candidate_status_mismatch_${slug}`);
  if (candidate.candidateType !== "sportomedia_sef_current_active_restart_scheduler_candidate") blocks.push(`candidate_type_mismatch_${slug}`);
  if (candidate.slug !== slug) blocks.push(`candidate_slug_mismatch_${slug}`);
  if (candidate.league !== meta.league) blocks.push(`candidate_league_mismatch_${slug}`);
  if (candidate.seasonScope !== "current_active") blocks.push(`candidate_scope_mismatch_${slug}`);
  if (candidate.seasonLabel !== "2026") blocks.push(`candidate_season_mismatch_${slug}`);
  if (candidate.currentActiveEvidence?.standings?.extractedRowCount !== 16) blocks.push(`candidate_standings_not_16_${slug}`);
  if ((candidate.currentActiveEvidence?.standings?.rows || []).length !== 16) blocks.push(`candidate_standings_rows_missing_${slug}`);
  if (candidate.currentActiveEvidence?.fixtures?.extractedRowCount !== 240) blocks.push(`candidate_fixtures_not_240_${slug}`);
  if (candidate.currentActiveEvidence?.fixtures?.fullFixtureRowsWritten !== false) blocks.push(`candidate_full_fixture_rows_flag_mismatch_${slug}`);
  if (candidate.currentActiveEvidence?.restartDate !== meta.restartDate) blocks.push(`candidate_restart_mismatch_${slug}`);
  if (candidate.currentActiveEvidence?.nextFixturePollNotBefore !== meta.nextFixturePollNotBefore) blocks.push(`candidate_not_before_mismatch_${slug}`);
  if (candidate.schedulerPolicy?.fixturePollingMode !== "suppress_daily_fixture_search_until_not_before_date") blocks.push(`candidate_polling_mode_mismatch_${slug}`);
  if (candidate.schedulerPolicy?.dailyFixtureSearchSuppressionRequired !== true) blocks.push(`candidate_daily_suppression_not_true_${slug}`);
  if (candidate.provenance?.explicitUserApprovalObservedInConversation !== true) blocks.push(`candidate_approval_not_recorded_${slug}`);
  if (candidate.guardrails?.reviewOnly !== true) blocks.push(`candidate_review_only_not_true_${slug}`);
  if (candidate.guardrails?.acceptedNow !== false) blocks.push(`candidate_accepted_not_false_${slug}`);
  if (candidate.guardrails?.productionWriteExecutedNow !== false) blocks.push(`candidate_production_not_false_${slug}`);
  if (candidate.guardrails?.truthAssertionExecutedNow !== false) blocks.push(`candidate_truth_not_false_${slug}`);
}

const verification = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_sportomedia_sef_current_active_restart_candidate_files",
  contractVersion: 1,
  reportPath: rel(reportPath),
  rowsPath: rel(rowsPath),
  reportSha256: await sha256(reportPath),
  rowsSha256: await sha256(rowsPath),
  verificationPath: rel(verificationPath),
  verified: {
    candidateFileCount: report.summary.candidateFileCount,
    targetSlugs: report.summary.targetSlugs,
    seasonScope: report.summary.seasonScope,
    seasonLabel: report.summary.seasonLabel,
    restartDates: report.summary.restartDates,
    nextFixturePollNotBefore: report.summary.nextFixturePollNotBefore,
    writtenReviewOnlyCandidateCount: report.summary.writtenReviewOnlyCandidateCount,
    blockedCount: report.summary.blockedCount,
    lifecycleCandidateWriteExecutedNowCount: guardrails.lifecycleCandidateWriteExecutedNowCount,
    schedulerCandidateWriteExecutedNowCount: guardrails.schedulerCandidateWriteExecutedNowCount,
    productionWriteExecutedNowCount: guardrails.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: guardrails.truthAssertionExecutedNowCount,
    guardrailsHeld: guardrails.searchExecutedNowCount === 0 &&
      guardrails.fetchExecutedNowCount === 0 &&
      guardrails.canonicalWriteExecutedNowCount === 0 &&
      guardrails.canonicalCandidateWriteExecutedNowCount === 0 &&
      guardrails.lifecycleCandidateWriteExecutedNowCount === 2 &&
      guardrails.schedulerCandidateWriteExecutedNowCount === 2 &&
      guardrails.productionWriteExecutedNowCount === 0 &&
      guardrails.truthAssertionExecutedNowCount === 0 &&
      guardrails.rawPayloadCommitted === false &&
      guardrails.fullRawPayloadWritten === false
  },
  conclusion: "Review-only Sportomedia/SEF current-active restart/scheduler candidate files are verified for swe.1 and swe.2. Next lane should move to bulk league expansion.",
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(verification, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: verification.status,
  verificationPath: verification.verificationPath,
  verified: verification.verified,
  conclusion: verification.conclusion,
  blocks: verification.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
