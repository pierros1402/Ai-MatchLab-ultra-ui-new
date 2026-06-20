import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-diagnostic-proof-${today}`, `sportomedia-sef-current-active-restart-diagnostic-proof-${today}.json`);
const proofVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-diagnostic-proof-verification-${today}`, `sportomedia-sef-current-active-restart-diagnostic-proof-verification-${today}.json`);
const approvalBoardPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-approval-board-${today}`, `sportomedia-sef-current-active-restart-approval-board-${today}.json`);
const approvalVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-approval-board-verification-${today}`, `sportomedia-sef-current-active-restart-approval-board-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-candidate-files-${today}`);
const candidateDir = path.join(outDir, "candidates");
const outPath = path.join(outDir, `sportomedia-sef-current-active-restart-candidate-files-${today}.json`);
const rowsPath = path.join(outDir, `sportomedia-sef-current-active-restart-candidate-files-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

await fs.mkdir(candidateDir, { recursive: true });

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const proofVerification = JSON.parse(await fs.readFile(proofVerificationPath, "utf8"));
const board = JSON.parse(await fs.readFile(approvalBoardPath, "utf8"));
const boardVerification = JSON.parse(await fs.readFile(approvalVerificationPath, "utf8"));

const blocks = [];

if (proof.status !== "passed") blocks.push("proof_status_not_passed");
if (proofVerification.status !== "passed") blocks.push("proof_verification_status_not_passed");
if (board.status !== "passed") blocks.push("approval_board_status_not_passed");
if (boardVerification.status !== "passed") blocks.push("approval_verification_status_not_passed");
if (board.summary?.eligibleAfterExplicitApprovalCount !== 2) blocks.push("approval_eligible_count_not_2");
if (board.summary?.explicitUserApprovalRequiredBeforeCandidateWrite !== true) blocks.push("approval_gate_not_present");

const expected = new Map([
  ["swe.1", { league: "Allsvenskan", restartDate: "2026-07-03", nextFixturePollNotBefore: "2026-06-26" }],
  ["swe.2", { league: "Superettan", restartDate: "2026-06-21", nextFixturePollNotBefore: "2026-06-14" }]
]);

const rows = [];
const files = [];

for (const [slug, meta] of expected.entries()) {
  const boardRow = (board.rows || []).find(row => row.slug === slug);
  const proofRow = (proof.rows || []).find(row => row.slug === slug);
  const rowBlocks = [];

  if (!boardRow) rowBlocks.push("missing_board_row");
  if (!proofRow) rowBlocks.push("missing_proof_row");

  if (boardRow) {
    if (boardRow.currentActiveRestartCandidateStatus !== "eligible_after_explicit_user_approval") rowBlocks.push("board_row_not_eligible");
    if (boardRow.reviewOnly !== true) rowBlocks.push("board_row_not_review_only");
    if (boardRow.mayWriteProductionNow !== false) rowBlocks.push("board_row_production_allowed");
    if (boardRow.mayAssertTruthNow !== false) rowBlocks.push("board_row_truth_allowed");
  }

  if (proofRow) {
    if (proofRow.league !== meta.league) rowBlocks.push("league_mismatch");
    if (proofRow.seasonScope !== "current_active") rowBlocks.push("season_scope_mismatch");
    if (proofRow.seasonLabel !== "2026") rowBlocks.push("season_label_mismatch");
    if (proofRow.standings?.extractedRowCount !== 16) rowBlocks.push("standings_row_count_not_16");
    if (proofRow.fixtures?.extractedRowCount !== 240) rowBlocks.push("fixture_row_count_not_240");
    if (proofRow.restartDate !== meta.restartDate) rowBlocks.push("restart_date_mismatch");
    if (proofRow.nextFixturePollNotBefore !== meta.nextFixturePollNotBefore) rowBlocks.push("next_fixture_poll_not_before_mismatch");
    if (!validDate(proofRow.restartDate)) rowBlocks.push("invalid_restart_date");
    if (!validDate(proofRow.nextFixturePollNotBefore)) rowBlocks.push("invalid_next_fixture_poll_not_before");
    if (proofRow.lifecycleSchedulerCandidate?.fixturePollingMode !== "suppress_daily_fixture_search_until_not_before_date") rowBlocks.push("fixture_polling_mode_mismatch");
  }

  if (rowBlocks.length === 0) {
    const candidatePath = path.join(candidateDir, `${slug}-current-active-2026-sportomedia-sef-restart-scheduler-candidate.json`);

    const candidate = {
      status: "review_only_candidate",
      candidateType: "sportomedia_sef_current_active_restart_scheduler_candidate",
      contractVersion: 1,
      slug,
      league: meta.league,
      sourceFamily: "sportomedia_sef",
      sourceUrls: [proofRow.sourceUrl],
      seasonScope: "current_active",
      seasonLabel: "2026",
      currentActiveEvidence: {
        standings: {
          extractedRowCount: proofRow.standings.extractedRowCount,
          rows: proofRow.standings.rows,
          validation: proofRow.standings.validation
        },
        fixtures: {
          extractedRowCount: proofRow.fixtures.extractedRowCount,
          firstFixtures: proofRow.fixtures.firstFixtures,
          lastFixtures: proofRow.fixtures.lastFixtures,
          futureFixtureCount: proofRow.futureFixtureCount,
          firstFutureFixtures: proofRow.firstFutureFixtures,
          validation: proofRow.fixtures.validation,
          fullFixtureRowsWritten: false,
          fullFixtureRowsOmittedReason: "diagnostic_candidate_keeps_bounded_structured_fixture_evidence_and_scheduler_dates_without_writing_full_fixture_payload"
        },
        restartDate: proofRow.restartDate,
        nextFixturePollNotBefore: proofRow.nextFixturePollNotBefore,
        lifecycleSchedulerCandidate: proofRow.lifecycleSchedulerCandidate
      },
      schedulerPolicy: {
        lifecycleState: "current_active_in_scheduled_break",
        requiredDateField: "restartDate",
        restartDate: proofRow.restartDate,
        nextFixturePollNotBefore: proofRow.nextFixturePollNotBefore,
        fixturePollingMode: "suppress_daily_fixture_search_until_not_before_date",
        dailyFixtureSearchSuppressionRequired: true
      },
      provenance: {
        proofPath: rel(proofPath),
        proofVerificationPath: rel(proofVerificationPath),
        approvalBoardPath: rel(approvalBoardPath),
        approvalVerificationPath: rel(approvalVerificationPath),
        proofSha256: await sha256(proofPath),
        proofVerificationSha256: await sha256(proofVerificationPath),
        approvalBoardSha256: await sha256(approvalBoardPath),
        approvalVerificationSha256: await sha256(approvalVerificationPath),
        explicitUserApprovalObservedInConversation: true
      },
      guardrails: {
        reviewOnly: true,
        acceptedNow: false,
        acceptanceAllowedNow: false,
        canonicalWriteExecutedNow: false,
        productionWriteExecutedNow: false,
        truthAssertionExecutedNow: false,
        rawPayloadCommitted: false,
        fullRawPayloadWritten: false
      }
    };

    await fs.writeFile(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`, "utf8");
    files.push(rel(candidatePath));
  }

  rows.push({
    slug,
    league: meta.league,
    sourceFamily: "sportomedia_sef",
    seasonScope: "current_active",
    seasonLabel: "2026",
    restartDate: proofRow?.restartDate ?? null,
    nextFixturePollNotBefore: proofRow?.nextFixturePollNotBefore ?? null,
    standingsRows: proofRow?.standings?.extractedRowCount ?? 0,
    fixtureRows: proofRow?.fixtures?.extractedRowCount ?? 0,
    candidateStatus: rowBlocks.length === 0 ? "written_review_only_candidate" : "blocked",
    candidateBlocks: rowBlocks,
    reviewOnly: true,
    acceptedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false
  });
}

if (rows.some(row => row.candidateStatus !== "written_review_only_candidate")) blocks.push("some_candidates_blocked");
if (files.length !== 2) blocks.push("candidate_file_count_not_2");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "write_sportomedia_sef_current_active_restart_candidate_files",
  contractVersion: 1,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  candidateDir: rel(candidateDir),
  candidateFiles: files,
  proofPath: rel(proofPath),
  proofVerificationPath: rel(proofVerificationPath),
  approvalBoardPath: rel(approvalBoardPath),
  approvalVerificationPath: rel(approvalVerificationPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    providerFetchExecutedNowCount: 0,
    standingsFetchExecutedNowCount: 0,
    fixtureFetchExecutedNowCount: 0,
    restartDateFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    canonicalCandidateWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    lifecycleCandidateWriteExecutedNowCount: 2,
    schedulerWriteExecutedNowCount: 0,
    schedulerCandidateWriteExecutedNowCount: 2,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    candidateFileCount: files.length,
    targetCount: rows.length,
    targetSlugs: rows.map(row => row.slug),
    seasonScope: "current_active",
    seasonLabel: "2026",
    restartDates: Object.fromEntries(rows.map(row => [row.slug, row.restartDate])),
    nextFixturePollNotBefore: Object.fromEntries(rows.map(row => [row.slug, row.nextFixturePollNotBefore])),
    writtenReviewOnlyCandidateCount: rows.filter(row => row.candidateStatus === "written_review_only_candidate").length,
    blockedCount: rows.filter(row => row.candidateStatus !== "written_review_only_candidate").length,
    acceptedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    nextRecommendedLane: "bulk_volume_league_expansion_after_this_commit"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  candidateFiles: report.candidateFiles,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
