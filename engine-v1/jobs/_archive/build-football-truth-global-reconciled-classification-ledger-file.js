import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

const globalRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-${today}`, `football-truth-global-factory-classification-ledger-rows-${today}.jsonl`);
const globalPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-factory-classification-ledger-${today}`, `football-truth-global-factory-classification-ledger-${today}.json`);

const batchPlanPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-no-current-discovery-batches-${today}`, `football-truth-global-no-current-discovery-batches-${today}.json`);
const strictAuditPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-${today}`, `football-truth-global-batch001-strict-precision-audit-${today}.json`);
const strictAuditRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-precision-audit-${today}`, `football-truth-global-batch001-strict-precision-audit-rows-${today}.jsonl`);
const surfaceRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-identity-surface-gate-${today}`, `football-truth-global-batch001-strict-identity-surface-gate-rows-${today}.jsonl`);
const htmlRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-html-table-extraction-probe-${today}`, `football-truth-global-batch001-strict-html-table-extraction-probe-rows-${today}.jsonl`);
const cypRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-cyp1-split-table-extraction-diagnostic-${today}`, `football-truth-global-batch001-cyp1-split-table-extraction-diagnostic-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-reconciled-classification-ledger-${today}`);
const outPath = path.join(outDir, `football-truth-global-reconciled-classification-ledger-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-reconciled-classification-ledger-rows-${today}.jsonl`);
const groupsPath = path.join(outDir, `football-truth-global-reconciled-classification-ledger-groups-${today}.json`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
async function readJson(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
async function readJsonl(file) { return parseJsonl(await fs.readFile(file, "utf8")); }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }
function sorted(values) { return uniq(values).sort((a,b) => a.localeCompare(b)); }

await fs.mkdir(outDir, { recursive: true });

const blocks = [];

const global = await readJson(globalPath);
const globalRows = await readJsonl(globalRowsPath);
const batchPlan = await readJson(batchPlanPath);
const strictAudit = await readJson(strictAuditPath);
const strictRows = await readJsonl(strictAuditRowsPath);
const surfaceRows = await readJsonl(surfaceRowsPath);
const htmlRows = await readJsonl(htmlRowsPath);
const cypRows = await readJsonl(cypRowsPath);

if (global.status !== "passed") blocks.push("global_ledger_not_passed");
if (globalRows.length < 400) blocks.push("global_rows_too_low");
if (strictAudit.summary?.strictAcceptedForNextGateCount !== 7) blocks.push("strict_accept_count_not_7");

const previousCompletedVerifiedProof = new Set([
  "esp.1","esp.2","ger.1","ger.2","ger.3","cro.1","sco.1","sco.2","ned.1","den.1","jpn.1","eng.1","swe.1","swe.2"
]);

const knownCurrentOrNewSeasonMaterialized = new Set([
  "cyp.1","fin.1","fin.2","isl.1","isl.2","nor.1","swe.1","swe.2"
]);

const knownBaselineOutsideMaterialized = new Set(["geo.1"]);
const currentRestartSchedulerCandidate = new Set(["swe.1","swe.2"]);
const explicitApprovalCandidate = new Set(["ksa.1"]);
const knownBlockedOrAvoidBlindRetry = new Set(["ita.1","nor.2","cyp.2"]);

const batch001Slugs = new Set(batchPlan.batches?.find(batch => batch.batchId === "global-no-current-discovery-001")?.slugs || []);
const strictBySlug = new Map(strictRows.map(row => [row.slug, row]));
const surfaceBySlug = new Map(surfaceRows.map(row => [row.slug, row]));
const htmlBySlug = new Map(htmlRows.map(row => [row.slug, row]));
const cypBySlug = new Map(cypRows.map(row => [row.slug, row]));

function decide(row) {
  const slug = row.slug;
  const tags = [];

  if (knownCurrentOrNewSeasonMaterialized.has(slug)) tags.push("known_current_or_new_season_materialized");
  if (knownBaselineOutsideMaterialized.has(slug)) tags.push("known_baseline_outside_materialized");
  if (currentRestartSchedulerCandidate.has(slug)) tags.push("current_restart_scheduler_candidate");

  let lane = row.classificationLane || "unknown";
  let countableCoverageNow = row.countableCoverageNow === true;
  let reason = "kept_from_global_factory_classification";

  if (previousCompletedVerifiedProof.has(slug)) {
    lane = "countable_verified_previous_completed_proof";
    countableCoverageNow = true;
    reason = "verified_previous_completed_baseline";
    tags.push("previous_completed_verified_proof");
  } else if (explicitApprovalCandidate.has(slug)) {
    lane = "candidate_after_explicit_approval_only";
    countableCoverageNow = false;
    reason = "review_only_candidate_needs_explicit_approval";
    tags.push("explicit_approval_required");
  } else if (knownBlockedOrAvoidBlindRetry.has(slug)) {
    lane = "known_blocked_or_avoid_blind_retry";
    countableCoverageNow = false;
    reason = "known_blocked_or_low_yield_retry_guard";
  }

  if (batch001Slugs.has(slug)) {
    const strict = strictBySlug.get(slug);
    const surface = surfaceBySlug.get(slug);
    const html = htmlBySlug.get(slug);
    const cyp = cypBySlug.get(slug);

    tags.push("batch001_processed");

    if (strict && strict.strictAcceptedForNextGate !== true) {
      lane = `batch001_${strict.strictPrecisionLane}`;
      countableCoverageNow = false;
      reason = "batch001_strict_precision_rejected_or_review";
    }

    if (surface) {
      lane = `batch001_${surface.identitySurfaceLane}`;
      countableCoverageNow = false;
      reason = "batch001_identity_surface_gated";
    }

    if (html) {
      lane = `batch001_${html.extractionProbeStatus}`;
      countableCoverageNow = false;
      reason = "batch001_html_extraction_probe_gated";
    }

    if (cyp) {
      lane = `batch001_${cyp.customExtractionStatus}`;
      countableCoverageNow = false;
      reason = "batch001_cyp1_split_phase_not_full_standings";
    }
  }

  if (knownCurrentOrNewSeasonMaterialized.has(slug) && lane === "no_current_factory_evidence") {
    lane = "known_current_or_new_season_materialized_not_in_previous_completed_count";
    countableCoverageNow = false;
    reason = "removed_from_no_current_discovery_due_known_current_materialized_lane";
  }

  if (knownBaselineOutsideMaterialized.has(slug) && lane === "no_current_factory_evidence") {
    lane = "known_baseline_outside_materialized_not_no_current";
    countableCoverageNow = false;
    reason = "removed_from_no_current_discovery_due_known_baseline_source";
  }

  return { lane, countableCoverageNow, reason, tags: sorted(tags) };
}

const reconciledRows = globalRows.map(row => {
  const decision = decide(row);
  return {
    slug: row.slug,
    displayName: row.displayName,
    baseClassificationLane: row.classificationLane,
    reconciledClassificationLane: decision.lane,
    countableCoverageNow: decision.countableCoverageNow,
    reconciliationReason: decision.reason,
    reconciliationTags: decision.tags,
    evidenceHitCount: row.evidenceHitCount,
    sampleEvidenceFiles: row.sampleEvidenceFiles,
    nextAction: decision.countableCoverageNow
      ? "covered; no immediate discovery"
      : decision.lane.includes("partial_phase")
        ? "park as partial phase evidence unless full table route is found"
        : decision.lane.includes("rendered_or_api") || decision.lane.includes("template")
          ? "rendered/API planning only"
          : decision.lane.includes("fixture_or_schedule")
            ? "fixture/schedule lane only; not standings"
            : decision.lane.includes("strict_rejected")
              ? "needs clean official-host discovery; do not reuse contaminated local evidence"
              : row.nextAction,
    acceptedNow: false,
    canonicalWriteExecutedNow: false,
    lifecycleWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false
  };
});

const groups = {};
for (const row of reconciledRows) {
  groups[row.reconciledClassificationLane] ||= [];
  groups[row.reconciledClassificationLane].push(row.slug);
}
for (const key of Object.keys(groups)) groups[key] = sorted(groups[key]);

const groupCounts = Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length]));

const summary = {
  allKnownSlugCount: reconciledRows.length,
  countableCoverageNow: reconciledRows.filter(row => row.countableCoverageNow).length,
  batch001ProcessedCount: reconciledRows.filter(row => row.reconciliationTags.includes("batch001_processed")).length,
  batch001StrictAcceptedForNextGateCount: strictAudit.summary?.strictAcceptedForNextGateCount,
  batch001StrictRejectedOrReviewCount: strictAudit.summary?.strictRejectedOrReviewCount,
  batch001RenderedOrApiCount: reconciledRows.filter(row => row.reconciledClassificationLane.includes("rendered_or_api") || row.reconciledClassificationLane.includes("template")).length,
  batch001FixtureOrScheduleOnlyCount: reconciledRows.filter(row => row.reconciledClassificationLane.includes("fixture_or_schedule")).length,
  batch001PartialPhaseCount: reconciledRows.filter(row => row.reconciledClassificationLane.includes("partial_phase")).length,
  noCurrentUnprocessedCount: reconciledRows.filter(row => row.reconciledClassificationLane === "no_current_factory_evidence").length,
  knownCurrentOrNewSeasonMaterializedCount: reconciledRows.filter(row => row.reconciliationTags.includes("known_current_or_new_season_materialized")).length,
  knownBaselineOutsideMaterializedCount: reconciledRows.filter(row => row.reconciliationTags.includes("known_baseline_outside_materialized")).length
};

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "football_truth_global_reconciled_classification_ledger",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  groupsOutput: rel(groupsPath),
  inputs: {
    globalPath: rel(globalPath),
    globalRowsPath: rel(globalRowsPath),
    batchPlanPath: rel(batchPlanPath),
    strictAuditPath: rel(strictAuditPath),
    strictAuditRowsPath: rel(strictAuditRowsPath),
    surfaceRowsPath: rel(surfaceRowsPath),
    htmlRowsPath: rel(htmlRowsPath),
    cypRowsPath: rel(cypRowsPath)
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
  summary,
  groupCounts,
  groups,
  priorityOrder: [
    {
      lane: "batch001_custom_split_table_partial_phase_review_required",
      slugs: groups.batch001_custom_split_table_partial_phase_review_required || [],
      action: "partial phase only; not countable"
    },
    {
      lane: "rendered_or_api_required_from_batch001",
      slugs: sorted([
        ...(groups.batch001_rendered_or_api_surface_required || []),
        ...(groups.batch001_no_extractable_standings_table_found || [])
      ]),
      action: "rendered/API planning only"
    },
    {
      lane: "fixture_or_schedule_only_from_batch001",
      slugs: groups.batch001_fixture_or_schedule_surface_only || [],
      action: "fixture/schedule lane only"
    },
    {
      lane: "strict_rejected_batch001",
      slugCount: reconciledRows.filter(row => row.reconciledClassificationLane.startsWith("batch001_strict_rejected") || row.reconciledClassificationLane.startsWith("batch001_input_")).length,
      action: "needs clean official-host discovery; do not reuse contaminated local-evidence pass list"
    },
    {
      lane: "no_current_unprocessed",
      slugCount: summary.noCurrentUnprocessedCount,
      action: "future clean global discovery batches"
    }
  ],
  rows: reconciledRows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(groupsPath, `${JSON.stringify({ summary, groupCounts, groups, priorityOrder: report.priorityOrder }, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, reconciledRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  groupsOutput: report.groupsOutput,
  summary: report.summary,
  priorityOrder: report.priorityOrder,
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
