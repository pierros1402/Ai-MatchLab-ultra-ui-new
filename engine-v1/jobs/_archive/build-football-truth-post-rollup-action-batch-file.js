import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const rollupPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-rollup-${today}`, `football-truth-global-macro-official-host-wave-rollup-${today}.json`);
const rollupRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-rollup-${today}`, `football-truth-global-macro-official-host-wave-rollup-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-post-rollup-action-batch-${today}`);
const outPath = path.join(outDir, `football-truth-post-rollup-action-batch-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-post-rollup-action-batch-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function sorted(values) { return [...new Set(values || [])].sort((a,b) => a.localeCompare(b)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
const rollup = JSON.parse(await fs.readFile(rollupPath, "utf8"));
const rollupRows = parseJsonl(await fs.readFile(rollupRowsPath, "utf8"));

if (rollup.status !== "passed") blocks.push("rollup_not_passed");

const queue = {
  proofShapeNeedsSeasonLeagueReview: rollup.summary?.macroProofShapeNonzeroNeedsReviewSlugs || [],
  zeroPlayedStartDateLane: rollup.summary?.zeroPlayedStartDateLaneSlugs || [],
  renderedOrApiRequired: rollup.summary?.macroRenderedOrApiRequiredSlugs || [],
  extractionReviewRequired: rollup.summary?.macroExtractionReviewRequiredSlugs || []
};

const expected = {
  proofShapeNeedsSeasonLeagueReview: ["bih.2", "mne.2"],
  zeroPlayedStartDateLane: ["ned.2"],
  renderedOrApiRequired: ["eng.4", "eng.5", "gha.2", "irl.2"],
  extractionReviewRequired: ["arm.2", "egy.2", "qat.2"]
};

for (const key of Object.keys(expected)) {
  if (JSON.stringify(sorted(queue[key])) !== JSON.stringify(expected[key])) blocks.push(`queue_mismatch_${key}`);
}

const rows = [];

for (const slug of sorted(queue.proofShapeNeedsSeasonLeagueReview)) {
  rows.push({
    slug,
    actionLane: "proof_shape_needs_season_league_review",
    executionClass: "review_board_only",
    immediateAction: "eligible for future review-only candidate write only after season/league identity review",
    sourceRollupLane: "macro_proof_shape_nonzero_needs_season_league_review",
    priority: 1,
    writeNowAllowed: false
  });
}

for (const slug of sorted(queue.zeroPlayedStartDateLane)) {
  rows.push({
    slug,
    actionLane: "zero_played_start_date_lane",
    executionClass: "start_date_evidence_required",
    immediateAction: "needs governed start-date evidence before lifecycle/current-season handling",
    sourceRollupLane: "zero_played_start_date_lane",
    priority: 2,
    writeNowAllowed: false
  });
}

for (const slug of sorted(queue.renderedOrApiRequired)) {
  rows.push({
    slug,
    actionLane: "rendered_or_api_required",
    executionClass: "rendered_api_route_planning",
    immediateAction: "requires browser/API extraction path, not static HTML",
    sourceRollupLane: "macro_rendered_or_api_required",
    priority: 3,
    writeNowAllowed: false
  });
}

for (const slug of sorted(queue.extractionReviewRequired)) {
  rows.push({
    slug,
    actionLane: "extraction_review_required",
    executionClass: "parser_improvement_backlog",
    immediateAction: "park for later parser improvement; not immediate production lane",
    sourceRollupLane: "macro_extraction_review_required",
    priority: 4,
    writeNowAllowed: false
  });
}

const actionLaneCounts = rows.reduce((acc, row) => {
  acc[row.actionLane] = (acc[row.actionLane] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_post_rollup_action_batch",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputs: {
    rollupPath: rel(rollupPath),
    rollupRowsPath: rel(rollupRowsPath)
  },
  summary: {
    actionTargetCount: rows.length,
    actionLaneCounts,
    proofShapeNeedsSeasonLeagueReviewSlugs: sorted(queue.proofShapeNeedsSeasonLeagueReview),
    zeroPlayedStartDateLaneSlugs: sorted(queue.zeroPlayedStartDateLane),
    renderedOrApiRequiredSlugs: sorted(queue.renderedOrApiRequired),
    extractionReviewRequiredSlugs: sorted(queue.extractionReviewRequired),
    suppressedLongTailCount: rollup.summary?.suppressedMissingOfficialHostAllowlistLongTailCount,
    candidateAlreadyWrittenReviewOnlySlugs: rollup.summary?.priorCandidateAfterExplicitApprovalSlugs || [],
    acceptedNowCount: 0,
    nextRecommendedLane: "run rendered/API extraction for renderedOrApiRequiredSlugs or start-date evidence for zeroPlayedStartDateLane; no more blind long-tail fetches"
  },
  decision: {
    blindLongTailFetchesStopped: true,
    immediateNextBestLane: "rendered_or_api_required",
    immediateNextBestSlugs: sorted(queue.renderedOrApiRequired),
    reason: "proof-shape review candidates require human approval/review; rendered/API queue may produce additional proof-shape rows without expanding long-tail allowlists"
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    reviewOnlyCandidateWriteExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  rows,
  rowSetSha256: shaText(rows.map(row => JSON.stringify(row)).join("\n")),
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  summary: report.summary,
  decision: report.decision,
  guardrails: report.guardrails,
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
