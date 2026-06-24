#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/full-map-reusable-family-expansion-plan-2026-06-14/full-map-reusable-family-expansion-plan-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/configured-reusable-family-batch-review-board-2026-06-14/configured-reusable-family-batch-review-board-2026-06-14.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function normalizeKey(value) {
  return String(value || "missing")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "missing";
}

function prefixOf(slug) {
  const match = String(slug || "").match(/^([a-z]{2,3})\./i);
  return match ? match[1].toLowerCase() : "__missing_prefix__";
}

function rankOf(slug) {
  const match = String(slug || "").match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : "__missing_rank__";
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = String(value || "__missing__").trim() || "__missing__";
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error(`Missing expansion summary guardrail key: ${key}`);
  if (summary[key] !== expected) {
    throw new Error(`Expansion guardrail failed: ${key} expected ${expected}, got ${summary[key]}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const expansion = readJson(args.input);
  const summary = expansion.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", 689);
  assertSummary(summary, "competitionCount", 689);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  if (summary.configuredReusableFamilyApplyCompetitionCount !== 31) {
    throw new Error(`Expected 31 configured reusable family apply competitions, got ${summary.configuredReusableFamilyApplyCompetitionCount}`);
  }

  const inputBatches = Array.isArray(expansion.configuredReusableFamilyApplyBatches)
    ? expansion.configuredReusableFamilyApplyBatches
    : [];

  if (inputBatches.length === 0) {
    throw new Error("No configuredReusableFamilyApplyBatches found in expansion plan");
  }

  const reviewRows = inputBatches
    .map((batch, index) => {
      const slugs = uniqueSorted(batch.competitionSlugs || []);
      const prefixes = uniqueSorted(slugs.map(prefixOf));
      const ranks = uniqueSorted(slugs.map(rankOf));

      return {
        reviewOrder: index + 1,
        reviewBatchId: `configured_reusable_family_review_${String(index + 1).padStart(3, "0")}_${normalizeKey(batch.reusableFamily || batch.groupingKey || batch.batchId)}`,
        sourceExpansionBatchId: batch.batchId,
        reusableFamily: batch.reusableFamily || batch.groupingKey || "__missing_reusable_family__",
        groupingKey: batch.groupingKey || null,
        competitionCount: Number(batch.competitionCount || slugs.length),
        competitionSlugs: slugs,
        slugPrefixes: prefixes,
        competitionRanks: ranks,
        lane: "configured_reusable_family_apply_review_no_fetch_no_search_no_write",
        requiredReview: "confirm this reusable family can be applied as a family batch using existing configured adapters/selectors and local/diagnostic evidence only",
        forbiddenInThisLane: [
          "broad_search",
          "live_fetch",
          "canonical_write",
          "production_write",
          "zero_result_as_absence",
          "match_status_as_season_state",
          "no_match_today_as_inactive"
        ],
        allowedNow: {
          sourceOnlyBoard: true,
          localDiagnosticInspection: true,
          existingAdapterSelectorReview: true,
          fetch: false,
          search: false,
          broadSearch: false,
          canonicalWrite: false,
          productionWrite: false
        },
        promotionPreconditionsLater: [
          "full fixture contract evidence",
          "full standings contract evidence",
          "trusted season-state evidence independent from match status",
          "explicit active/completed/inactive evidence where relevant",
          "restart/start-date evidence for completed/inactive/near-season-end competitions when available",
          "separate scoped canonical plan with hard gates"
        ],
        sampleRows: Array.isArray(batch.sampleRows) ? batch.sampleRows : []
      };
    })
    .sort((a, b) => {
      if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
      return a.reusableFamily.localeCompare(b.reusableFamily);
    })
    .map((row, index) => ({ ...row, reviewOrder: index + 1 }));

  const competitionSlugs = uniqueSorted(reviewRows.flatMap((row) => row.competitionSlugs));
  const firstRecommendedBatch = reviewRows[0] || null;

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-configured-reusable-family-batch-review-board-file",
    mode: "source_only_configured_reusable_family_batch_review_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      expansionPlan: args.input,
      expansionJob: expansion.job || null,
      expansionMode: expansion.mode || null
    },
    summary: {
      retainedRawMapCompetitionCount: summary.retainedRawMapCompetitionCount,
      competitionCount: summary.competitionCount,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      configuredReusableFamilyApplyCompetitionCount: competitionSlugs.length,
      configuredReusableFamilyApplyBatchCount: reviewRows.length,
      largestConfiguredReusableFamilyBatchCompetitionCount: firstRecommendedBatch ? firstRecommendedBatch.competitionCount : 0,
      firstRecommendedReviewBatchId: firstRecommendedBatch ? firstRecommendedBatch.reviewBatchId : null,
      firstRecommendedReusableFamily: firstRecommendedBatch ? firstRecommendedBatch.reusableFamily : null,
      firstRecommendedCompetitionSlugs: firstRecommendedBatch ? firstRecommendedBatch.competitionSlugs : [],

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "build_first_configured_reusable_family_local_contract_review_from_firstRecommendedReviewBatch"
    },
    counts: {
      byReusableFamily: countBy(reviewRows.map((row) => row.reusableFamily)),
      bySlugPrefix: countBy(competitionSlugs.map(prefixOf)),
      byCompetitionRank: countBy(competitionSlugs.map(rankOf))
    },
    guardrails: [
      "This board only reviews configured reusable family batches from the expansion plan.",
      "It does not apply validators against live sources.",
      "It does not run search or fetch.",
      "It does not write canonical or production data.",
      "It does not assert active, inactive, completed, or actionable status.",
      "It keeps 689 as retained raw map, not actionable map count.",
      "The first recommended batch is only the next source-only/local-review target."
    ],
    firstRecommendedBatch,
    reviewRows
  };

  if (output.summary.configuredReusableFamilyApplyCompetitionCount !== 31) {
    throw new Error(`Expected 31 configured reusable family competition slugs after review build, got ${output.summary.configuredReusableFamilyApplyCompetitionCount}`);
  }

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    configuredReusableFamilyApplyCompetitionCount: output.summary.configuredReusableFamilyApplyCompetitionCount,
    configuredReusableFamilyApplyBatchCount: output.summary.configuredReusableFamilyApplyBatchCount,
    largestConfiguredReusableFamilyBatchCompetitionCount: output.summary.largestConfiguredReusableFamilyBatchCompetitionCount,
    firstRecommendedReviewBatchId: output.summary.firstRecommendedReviewBatchId,
    firstRecommendedReusableFamily: output.summary.firstRecommendedReusableFamily,
    firstRecommendedCompetitionSlugs: output.summary.firstRecommendedCompetitionSlugs,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    zeroResultMayImplyAbsenceCount: output.summary.zeroResultMayImplyAbsenceCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
