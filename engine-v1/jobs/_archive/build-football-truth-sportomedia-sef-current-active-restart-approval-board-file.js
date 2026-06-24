import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const proofPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-diagnostic-proof-${today}`, `sportomedia-sef-current-active-restart-diagnostic-proof-${today}.json`);
const verificationPath = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-diagnostic-proof-verification-${today}`, `sportomedia-sef-current-active-restart-diagnostic-proof-verification-${today}.json`);

const outputDir = path.join(root, "data", "football-truth", "_diagnostics", `sportomedia-sef-current-active-restart-approval-board-${today}`);
const outputPath = path.join(outputDir, `sportomedia-sef-current-active-restart-approval-board-${today}.json`);
const rowsPath = path.join(outputDir, `sportomedia-sef-current-active-restart-approval-board-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

await fs.mkdir(outputDir, { recursive: true });

const blocks = [];
const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const verification = JSON.parse(await fs.readFile(verificationPath, "utf8"));

if (proof.status !== "passed") blocks.push("proof_status_not_passed");
if (verification.status !== "passed") blocks.push("verification_status_not_passed");
if (verification.verified?.seasonScope !== "current_active") blocks.push("verified_scope_not_current_active");
if (verification.verified?.seasonLabel !== "2026") blocks.push("verified_season_not_2026");
if (verification.verified?.passedRowCount !== 2) blocks.push("verified_passed_row_count_not_2");
if (verification.verified?.guardrailsHeld !== true) blocks.push("verified_guardrails_not_held");

const expected = new Map([
  ["swe.1", { league: "Allsvenskan", restartDate: "2026-07-03", nextFixturePollNotBefore: "2026-06-26" }],
  ["swe.2", { league: "Superettan", restartDate: "2026-06-21", nextFixturePollNotBefore: "2026-06-14" }]
]);

const rows = [];

for (const [slug, meta] of expected.entries()) {
  const proofRow = (proof.rows || []).find(row => row.slug === slug);
  const rowBlocks = [];

  if (!proofRow) {
    rowBlocks.push("missing_proof_row");
  } else {
    if (proofRow.league !== meta.league) rowBlocks.push("league_mismatch");
    if (proofRow.seasonScope !== "current_active") rowBlocks.push("season_scope_mismatch");
    if (proofRow.seasonLabel !== "2026") rowBlocks.push("season_label_mismatch");
    if (proofRow.standings?.extractedRowCount !== 16) rowBlocks.push("standings_row_count_mismatch");
    if (proofRow.fixtures?.extractedRowCount !== 240) rowBlocks.push("fixture_row_count_mismatch");
    if (proofRow.restartDate !== meta.restartDate) rowBlocks.push("restart_date_mismatch");
    if (proofRow.nextFixturePollNotBefore !== meta.nextFixturePollNotBefore) rowBlocks.push("next_fixture_poll_not_before_mismatch");
    if (!validDate(proofRow.restartDate)) rowBlocks.push("invalid_restart_date");
    if (!validDate(proofRow.nextFixturePollNotBefore)) rowBlocks.push("invalid_next_fixture_poll_not_before");
    if (proofRow.lifecycleSchedulerCandidate?.lifecycleState !== "current_active_in_scheduled_break") rowBlocks.push("lifecycle_state_mismatch");
    if (proofRow.lifecycleSchedulerCandidate?.fixturePollingMode !== "suppress_daily_fixture_search_until_not_before_date") rowBlocks.push("fixture_polling_mode_mismatch");
  }

  rows.push({
    slug,
    league: meta.league,
    sourceFamily: "sportomedia_sef",
    seasonScope: "current_active",
    seasonLabel: "2026",
    standingsRows: proofRow?.standings?.extractedRowCount ?? 0,
    fixtureRows: proofRow?.fixtures?.extractedRowCount ?? 0,
    restartDate: proofRow?.restartDate ?? null,
    nextFixturePollNotBefore: proofRow?.nextFixturePollNotBefore ?? null,
    lifecycleState: proofRow?.lifecycleSchedulerCandidate?.lifecycleState ?? null,
    fixturePollingMode: proofRow?.lifecycleSchedulerCandidate?.fixturePollingMode ?? null,
    currentActiveRestartCandidateStatus: rowBlocks.length === 0 ? "eligible_after_explicit_user_approval" : "blocked",
    currentActiveRestartCandidateBlocks: rowBlocks,
    explicitUserApprovalRequiredBeforeCandidateWrite: true,
    mayWriteCanonicalCandidateNow: false,
    mayWriteLifecycleCandidateNow: false,
    mayWriteSchedulerCandidateNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false,
    acceptedNow: false,
    acceptanceAllowedNow: false,
    reviewOnly: true
  });
}

if (rows.length !== 2) blocks.push("row_count_not_2");
if (rows.some(row => row.currentActiveRestartCandidateStatus !== "eligible_after_explicit_user_approval")) blocks.push("some_rows_blocked");

const guardrails = proof.guardrails || {};
if (guardrails.productionWriteExecutedNowCount !== 0) blocks.push("proof_production_write_not_zero");
if (guardrails.truthAssertionExecutedNowCount !== 0) blocks.push("proof_truth_assertion_not_zero");
if (guardrails.rawPayloadCommitted !== false) blocks.push("proof_raw_payload_committed_not_false");
if (guardrails.fullRawPayloadWritten !== false) blocks.push("proof_full_raw_payload_written_not_false");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "sportomedia_sef_current_active_restart_approval_board",
  contractVersion: 1,
  purpose: "Approval-gate board for writing review-only current-active restart/scheduler candidate files for swe.1/swe.2. No canonical, lifecycle, scheduler, production, or truth write is performed by this board.",
  proofPath: rel(proofPath),
  proofSha256: await sha256(proofPath),
  verificationPath: rel(verificationPath),
  verificationSha256: await sha256(verificationPath),
  output: rel(outputPath),
  rowsOutput: rel(rowsPath),
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
    lifecycleCandidateWriteExecutedNowCount: 0,
    schedulerWriteExecutedNowCount: 0,
    schedulerCandidateWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: rows.length,
    targetSlugs: rows.map(row => row.slug),
    seasonScope: "current_active",
    seasonLabel: "2026",
    eligibleAfterExplicitApprovalCount: rows.filter(row => row.currentActiveRestartCandidateStatus === "eligible_after_explicit_user_approval").length,
    blockedCount: rows.filter(row => row.currentActiveRestartCandidateStatus !== "eligible_after_explicit_user_approval").length,
    restartDates: Object.fromEntries(rows.map(row => [row.slug, row.restartDate])),
    nextFixturePollNotBefore: Object.fromEntries(rows.map(row => [row.slug, row.nextFixturePollNotBefore])),
    explicitUserApprovalRequiredBeforeCandidateWrite: true,
    canonicalCandidateWriteAllowedNow: false,
    lifecycleCandidateWriteAllowedNow: false,
    schedulerCandidateWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    acceptedNowCount: 0,
    recommendedNextLane: "ask explicit user approval before writing review-only current-active restart/scheduler candidate files for swe.1/swe.2"
  },
  rows,
  blocks
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
