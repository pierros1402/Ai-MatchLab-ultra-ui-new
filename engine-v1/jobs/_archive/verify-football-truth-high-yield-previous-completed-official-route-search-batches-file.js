import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const planPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-batches-${today}`,
  `high-yield-previous-completed-official-route-search-batches-${today}.json`
);

const rowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-batches-${today}`,
  `high-yield-previous-completed-official-route-search-batch-rows-${today}.jsonl`
);

const verificationDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-batches-verification-${today}`
);

const verificationPath = path.join(
  verificationDir,
  `high-yield-previous-completed-official-route-search-batches-verification-${today}.json`
);

const suppressed = new Set(["ita.1", "nor.2", "cyp.2", "eng.1"]);

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

const blocks = [];
const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const rows = parseJsonl(await fs.readFile(rowsPath, "utf8"));

if (plan.status !== "passed") blocks.push("plan_status_not_passed");
if (plan.summary.selectedTargetCount !== 40) blocks.push("selected_target_count_not_40");
if (plan.summary.queryRowCount !== 240) blocks.push("query_row_count_not_240");
if (plan.summary.batchCount !== 7) blocks.push("batch_count_not_7");
if (rows.length !== 240) blocks.push("rows_jsonl_count_not_240");

const guardrails = plan.guardrails || {};
for (const key of [
  "searchExecutedNowCount",
  "fetchExecutedNowCount",
  "canonicalWriteExecutedNowCount",
  "productionWriteExecutedNowCount",
  "truthAssertionExecutedNowCount"
]) {
  if (guardrails[key] !== 0) blocks.push(`guardrail_${key}_not_zero`);
}
if (guardrails.rawPayloadCommitted !== false) blocks.push("raw_payload_committed_not_false");

const approvalGate = plan.approvalGate || {};
if (approvalGate.searchExecutionRequiresSeparateCommand !== true) blocks.push("search_execution_not_gated");
if (approvalGate.fetchExecutionRequiresSeparateCommand !== true) blocks.push("fetch_execution_not_gated");
if (approvalGate.canonicalWriteRequiresExplicitUserApproval !== true) blocks.push("canonical_write_not_user_approval_gated");
if (approvalGate.productionWriteAllowed !== false) blocks.push("production_write_allowed");
if (approvalGate.truthAssertionAllowed !== false) blocks.push("truth_assertion_allowed");

const selectedTargets = plan.selectedTargets || [];
const selectedSlugs = selectedTargets.map(row => row.slug);
const uniqueSelectedSlugs = new Set(selectedSlugs);
if (selectedTargets.length !== 40) blocks.push("selected_targets_array_not_40");
if (uniqueSelectedSlugs.size !== selectedSlugs.length) blocks.push("duplicate_selected_targets");

for (const slug of selectedSlugs) {
  if (suppressed.has(slug)) blocks.push(`suppressed_slug_selected_${slug}`);
}

const batchSlugs = [];
for (const batch of plan.batches || []) {
  if (!Number.isInteger(batch.startTargetIndex)) blocks.push(`batch_missing_start_target_index_${batch.batchId}`);
  if (!Number.isInteger(batch.targetCount)) blocks.push(`batch_missing_target_count_${batch.batchId}`);
  if (!Array.isArray(batch.targetSlugs)) blocks.push(`batch_missing_target_slugs_${batch.batchId}`);

  const expectedSlice = selectedSlugs.slice(batch.startTargetIndex, batch.startTargetIndex + batch.targetCount);
  if (JSON.stringify(expectedSlice) !== JSON.stringify(batch.targetSlugs)) {
    blocks.push(`batch_target_slice_mismatch_${batch.batchId}`);
  }

  if (batch.queryCount !== rows.filter(row => batch.targetSlugs.includes(row.slug)).length) {
    blocks.push(`batch_query_count_mismatch_${batch.batchId}`);
  }

  batchSlugs.push(...batch.targetSlugs);
}

const uniqueBatchSlugs = new Set(batchSlugs);
if (batchSlugs.length !== 40) blocks.push("batch_slug_total_not_40");
if (uniqueBatchSlugs.size !== batchSlugs.length) blocks.push("target_split_or_duplicate_across_batches");
if (JSON.stringify(batchSlugs) !== JSON.stringify(selectedSlugs)) blocks.push("batch_slug_order_does_not_match_selected_targets");

for (const row of rows) {
  if (!uniqueSelectedSlugs.has(row.slug)) blocks.push(`query_row_slug_not_selected_${row.slug}`);
  if (row.lane !== "previous_completed_standings") blocks.push(`query_row_wrong_lane_${row.slug}`);
  if (typeof row.query !== "string" || row.query.trim().length < 10) blocks.push(`query_row_empty_or_too_short_${row.slug}`);
  if (row.expectedSourceType !== "official_or_league_operator") blocks.push(`wrong_expected_source_type_${row.slug}`);

  const gate = row.acceptanceGate || {};
  if (gate.requireExactCompetitionIdentity !== true) blocks.push(`missing_exact_identity_gate_${row.slug}`);
  if (gate.requireSeasonScope !== "previous_completed") blocks.push(`missing_previous_completed_scope_gate_${row.slug}`);
  if (gate.requireSeasonLabel !== "2025-2026_or_equivalent") blocks.push(`missing_season_label_gate_${row.slug}`);
  if (gate.requireNonZeroRows !== true) blocks.push(`missing_non_zero_gate_${row.slug}`);
  if (gate.requireExpectedRowsBeforeAcceptance !== true) blocks.push(`missing_expected_rows_gate_${row.slug}`);
  if (gate.requireTeamSignalsBeforeAcceptance !== true) blocks.push(`missing_team_signals_gate_${row.slug}`);
  if (gate.requireArithmeticBeforeAcceptance !== true) blocks.push(`missing_arithmetic_gate_${row.slug}`);
  if (gate.canonicalWriteAllowed !== false) blocks.push(`canonical_write_allowed_in_query_row_${row.slug}`);
  if (gate.productionWriteAllowed !== false) blocks.push(`production_write_allowed_in_query_row_${row.slug}`);
  if (gate.truthAssertionAllowed !== false) blocks.push(`truth_assertion_allowed_in_query_row_${row.slug}`);
}

await fs.mkdir(verificationDir, { recursive: true });

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "verify_high_yield_previous_completed_official_route_search_batches",
  contractVersion: 1,
  planPath: path.relative(root, planPath).replaceAll("\\", "/"),
  rowsPath: path.relative(root, rowsPath).replaceAll("\\", "/"),
  planSha256: await sha256(planPath),
  rowsSha256: await sha256(rowsPath),
  verified: {
    selectedTargetCount: selectedTargets.length,
    queryRowCount: rows.length,
    batchCount: (plan.batches || []).length,
    noTargetSplitAcrossBatches: uniqueBatchSlugs.size === batchSlugs.length && batchSlugs.length === selectedSlugs.length,
    suppressedSlugsAbsent: selectedSlugs.every(slug => !suppressed.has(slug)),
    guardrailsZero: blocks.filter(block => block.startsWith("guardrail_")).length === 0,
    planOnlyApprovalGatesPresent: approvalGate.searchExecutionRequiresSeparateCommand === true &&
      approvalGate.fetchExecutionRequiresSeparateCommand === true &&
      approvalGate.canonicalWriteRequiresExplicitUserApproval === true &&
      approvalGate.productionWriteAllowed === false &&
      approvalGate.truthAssertionAllowed === false
  },
  firstTwentyTargets: selectedSlugs.slice(0, 20),
  batchIds: (plan.batches || []).map(batch => batch.batchId),
  blocks
};

await fs.writeFile(verificationPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log(JSON.stringify({
  status: report.status,
  verificationPath: path.relative(root, verificationPath).replaceAll("\\", "/"),
  verified: report.verified,
  firstTwentyTargets: report.firstTwentyTargets,
  batchIds: report.batchIds,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) {
  process.exitCode = 1;
}
