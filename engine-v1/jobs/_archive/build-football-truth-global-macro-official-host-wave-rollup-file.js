import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const planPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-${today}`, `football-truth-global-macro-official-host-wave-plan-${today}.json`);
const proofReviewPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-proof-shape-season-league-review-${today}`, `football-truth-global-batch001-proof-shape-season-league-review-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-rollup-${today}`);
const outPath = path.join(outDir, `football-truth-global-macro-official-host-wave-rollup-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-macro-official-host-wave-rollup-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }
function sorted(values) { return uniq(values).sort((a,b) => a.localeCompare(b)); }
function addCounts(a, b) { for (const [k,v] of Object.entries(b || {})) a[k] = (a[k] || 0) + Number(v || 0); return a; }
async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
function wavePath(batchId) {
  return path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-${batchId}-${today}`, `football-truth-global-macro-official-host-wave-${batchId}-${today}.json`);
}
function waveRowsPath(batchId) {
  return path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-${batchId}-${today}`, `football-truth-global-macro-official-host-wave-${batchId}-rows-${today}.jsonl`);
}
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
const plan = await readJson(planPath);
const proofReview = await readJson(proofReviewPath);

if (plan.status !== "passed") blocks.push("plan_not_passed");
if (proofReview.status !== "passed") blocks.push("proof_review_not_passed");

const batchIds = (plan.batches || []).map(batch => batch.batchId);
const waveReports = [];
const waveRows = [];

for (const batchId of batchIds) {
  const report = await readJson(wavePath(batchId));
  const rows = parseJsonl(await fs.readFile(waveRowsPath(batchId), "utf8"));
  if (report.status !== "passed") blocks.push(`${batchId}_not_passed`);
  if (report.summary?.targetCount !== rows.length) blocks.push(`${batchId}_row_count_mismatch`);
  waveReports.push(report);
  waveRows.push(...rows);
}

const macroFinalLaneCounts = {};
const macroProofShapeNonzeroSlugs = [];
const macroZeroPlayedStartDateLaneSlugs = [];
const macroExtractionReviewRequiredSlugs = [];
const macroRenderedOrApiRequiredSlugs = [];
const macroSurfaceReviewRequiredSlugs = [];
const macroMissingOfficialHostAllowlistSlugs = [];
const macroBlockedOrNoRouteSlugs = [];

let attemptedFetchCount = 0;
let macroTargetCount = 0;

for (const report of waveReports) {
  macroTargetCount += report.summary?.targetCount || 0;
  attemptedFetchCount += report.summary?.attemptedFetchCount || 0;
  addCounts(macroFinalLaneCounts, report.summary?.macroFinalLaneCounts || {});
  macroProofShapeNonzeroSlugs.push(...(report.summary?.proofShapeNonzeroSlugs || []));
  macroZeroPlayedStartDateLaneSlugs.push(...(report.summary?.zeroPlayedStartDateLaneSlugs || []));
  macroExtractionReviewRequiredSlugs.push(...(report.summary?.extractionReviewRequiredSlugs || []));
  macroRenderedOrApiRequiredSlugs.push(...(report.summary?.renderedOrApiRequiredSlugs || []));
  macroSurfaceReviewRequiredSlugs.push(...(report.summary?.surfaceReviewRequiredSlugs || []));
  macroMissingOfficialHostAllowlistSlugs.push(...(report.summary?.missingOfficialHostAllowlistSlugs || []));
  macroBlockedOrNoRouteSlugs.push(...(report.summary?.blockedOrNoRouteSlugs || []));
}

const priorCandidateAfterApprovalSlugs = proofReview.summary?.candidateAfterExplicitApprovalSlugs || [];
const priorCollisionReviewRequiredSlugs = proofReview.summary?.collisionReviewRequiredSlugs || [];
const priorZeroPlayedStartDateLaneRequiredSlugs = proofReview.summary?.zeroPlayedStartDateLaneRequiredSlugs || [];

const rows = [];

for (const slug of sorted(priorCandidateAfterApprovalSlugs)) {
  rows.push({ slug, rollupLane: "candidate_after_explicit_approval_from_prior_review", source: "batch001_proof_shape_season_league_review", immediateAction: "eligible for review-only candidate write only after explicit approval" });
}
for (const slug of sorted(macroProofShapeNonzeroSlugs)) {
  rows.push({ slug, rollupLane: "macro_proof_shape_nonzero_needs_season_league_review", source: "macro_official_host_wave", immediateAction: "bulk season/league review later; no micro gate now" });
}
for (const slug of sorted([...priorZeroPlayedStartDateLaneRequiredSlugs, ...macroZeroPlayedStartDateLaneSlugs])) {
  rows.push({ slug, rollupLane: "zero_played_start_date_lane", source: "prior_or_macro", immediateAction: "needs governed start-date evidence, not standings write" });
}
for (const slug of sorted(priorCollisionReviewRequiredSlugs)) {
  rows.push({ slug, rollupLane: "league_identity_collision_review_required", source: "batch001_proof_shape_season_league_review", immediateAction: "park until identity collision resolved" });
}
for (const slug of sorted(macroExtractionReviewRequiredSlugs)) {
  rows.push({ slug, rollupLane: "macro_extraction_review_required", source: "macro_official_host_wave", immediateAction: "park for later parser improvement batch" });
}
for (const slug of sorted(macroRenderedOrApiRequiredSlugs)) {
  rows.push({ slug, rollupLane: "macro_rendered_or_api_required", source: "macro_official_host_wave", immediateAction: "rendered/API family planning, not static HTML" });
}
for (const slug of sorted(macroSurfaceReviewRequiredSlugs)) {
  rows.push({ slug, rollupLane: "macro_surface_review_required", source: "macro_official_host_wave", immediateAction: "park unless country becomes high-value" });
}
for (const slug of sorted(macroBlockedOrNoRouteSlugs)) {
  rows.push({ slug, rollupLane: "macro_blocked_or_no_route", source: "macro_official_host_wave", immediateAction: "park; do not blind retry" });
}
for (const slug of sorted(macroMissingOfficialHostAllowlistSlugs)) {
  rows.push({ slug, rollupLane: "suppressed_missing_official_host_allowlist_long_tail", source: "macro_official_host_wave", immediateAction: "suppress from fetch waves until allowlist is intentionally expanded" });
}

const rollupLaneCounts = rows.reduce((acc, row) => {
  acc[row.rollupLane] = (acc[row.rollupLane] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_global_macro_official_host_wave_rollup",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputs: {
    planPath: rel(planPath),
    proofReviewPath: rel(proofReviewPath),
    waveReportPaths: batchIds.map(batchId => rel(wavePath(batchId)))
  },
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    plannedTargetCount: plan.summary?.plannedTargetCount,
    macroBatchCount: batchIds.length,
    macroTargetCount,
    macroAttemptedFetchCount: attemptedFetchCount,
    macroFinalLaneCounts,
    priorCandidateAfterExplicitApprovalSlugs: sorted(priorCandidateAfterApprovalSlugs),
    macroProofShapeNonzeroNeedsReviewSlugs: sorted(macroProofShapeNonzeroSlugs),
    zeroPlayedStartDateLaneSlugs: sorted([...priorZeroPlayedStartDateLaneRequiredSlugs, ...macroZeroPlayedStartDateLaneSlugs]),
    collisionReviewRequiredSlugs: sorted(priorCollisionReviewRequiredSlugs),
    macroExtractionReviewRequiredSlugs: sorted(macroExtractionReviewRequiredSlugs),
    macroRenderedOrApiRequiredSlugs: sorted(macroRenderedOrApiRequiredSlugs),
    macroSurfaceReviewRequiredSlugs: sorted(macroSurfaceReviewRequiredSlugs),
    macroBlockedOrNoRouteSlugs: sorted(macroBlockedOrNoRouteSlugs),
    suppressedMissingOfficialHostAllowlistLongTailCount: sorted(macroMissingOfficialHostAllowlistSlugs).length,
    rollupLaneCounts,
    acceptedNowCount: 0,
    nextRecommendedLane: "stop blind global long-tail fetches; expand official-host allowlist only for selected high-value countries or write review-only candidates after explicit approval"
  },
  decision: {
    blindLongTailFetchesShouldStopNow: true,
    missingAllowlistSlugsAreSuppressedUntilIntentionalExpansion: true,
    immediateHumanValueQueue: {
      candidateAfterExplicitApproval: sorted(priorCandidateAfterApprovalSlugs),
      macroProofShapeNeedsSeasonLeagueReview: sorted(macroProofShapeNonzeroSlugs),
      zeroPlayedStartDateLane: sorted([...priorZeroPlayedStartDateLaneRequiredSlugs, ...macroZeroPlayedStartDateLaneSlugs]),
      renderedOrApiRequired: sorted(macroRenderedOrApiRequiredSlugs)
    }
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
  summary: report.summary,
  decision: report.decision,
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;
