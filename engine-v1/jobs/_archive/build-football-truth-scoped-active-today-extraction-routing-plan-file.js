#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_SNAPSHOT_REVIEW =
  "data/football-truth/_diagnostics/scoped-active-today-fetch-snapshot-review-board-2026-06-13/scoped-active-today-fetch-snapshot-review-board-2026-06-13.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    snapshotReview: DEFAULT_SNAPSHOT_REVIEW,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--snapshot-review") args.snapshotReview = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-extraction-routing-plan-${args.date}`,
      `scoped-active-today-extraction-routing-plan-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function laneForSnapshot(row) {
  switch (row.snapshotReviewStatus) {
    case "adapter_specific_extraction_required":
      return {
        extractionLane: "adapter_specific_extraction_review",
        extractionLanePriority: 10,
        extractionAllowedNow: false,
        nextJobRecommendation: "build_adapter_specific_fixture_extraction_review_input_no_canonical_write",
        laneReason: "known_adapter_or_adapter_hint_requires_adapter_specific_extraction_review"
      };

    case "landing_page_needs_link_extraction":
      return {
        extractionLane: "landing_page_fixture_link_extraction_plan",
        extractionLanePriority: 20,
        extractionAllowedNow: false,
        nextJobRecommendation: "build_landing_page_fixture_link_extraction_plan_no_fetch_no_canonical_write",
        laneReason: "landing_page_requires_fixture_or_schedule_link_extraction_before_content_extraction"
      };

    case "spa_shell_or_low_text_needs_component_or_api_discovery":
      return {
        extractionLane: "component_or_api_discovery_plan",
        extractionLanePriority: 30,
        extractionAllowedNow: false,
        nextJobRecommendation: "build_component_or_api_discovery_plan_no_fetch_no_canonical_write",
        laneReason: "spa_or_low_text_snapshot_needs_component_or_api_discovery_before_extraction"
      };

    case "failed_fetch_needs_retry_or_template_repair":
    case "non_200_fetch_needs_retry_or_redirect_template_repair":
      return {
        extractionLane: "fetch_retry_or_template_repair_plan",
        extractionLanePriority: 40,
        extractionAllowedNow: false,
        nextJobRecommendation: "build_scoped_fetch_retry_or_template_repair_plan_no_fetch_no_canonical_write",
        laneReason: "fetch_failed_or_non_200_needs_retry_or_template_repair"
      };

    case "fixture_content_candidate":
      return {
        extractionLane: "direct_fixture_candidate_extraction_review",
        extractionLanePriority: 5,
        extractionAllowedNow: false,
        nextJobRecommendation: "build_direct_fixture_candidate_extraction_review_no_canonical_write",
        laneReason: "strict_snapshot_review_found_direct_fixture_content_candidate"
      };

    default:
      return {
        extractionLane: "unknown_snapshot_review_status_needs_manual_review",
        extractionLanePriority: 99,
        extractionAllowedNow: false,
        nextJobRecommendation: "manual_review_required",
        laneReason: `unknown_snapshot_review_status:${row.snapshotReviewStatus || "__missing__"}`
      };
  }
}

function adapterFamily(row) {
  const adapter = String(row.adapterHint || "").trim();

  if (!adapter) return "__none__";
  if (adapter.includes("torneopal") || adapter.includes("palloliitto")) return "torneopal";
  if (adapter.includes("loi")) return "loi_ajax";
  if (adapter.includes("sportomedia")) return "sportomedia";
  if (adapter.includes("spfl")) return "spfl_opta";
  if (adapter.includes("bundesliga")) return "bundesliga";
  if (adapter.includes("laliga")) return "laliga";
  if (adapter.includes("fifa")) return "fifa_component_api";
  if (adapter.includes("norway_ntf")) return "norway_ntf";
  return adapter;
}

function routeRow(row, index) {
  const lane = laneForSnapshot(row);

  return {
    routeId: `active_today_route_${String(index + 1).padStart(3, "0")}`,
    competitionSlug: row.competitionSlug,
    competitionName: row.competitionName || "",
    providerHint: row.providerHint,
    presentInAthensOracle: Boolean(row.presentInAthensOracle),
    oracleExpectedActiveToday: Boolean(row.oracleExpectedActiveToday),
    snapshotReviewStatus: row.snapshotReviewStatus,
    extractionReadiness: row.extractionReadiness,
    extractionLane: lane.extractionLane,
    extractionLanePriority: lane.extractionLanePriority,
    laneReason: lane.laneReason,
    nextJobRecommendation: lane.nextJobRecommendation,
    fetchUrl: row.fetchUrl,
    finalUrl: row.finalUrl,
    status: row.status,
    fetchOk: Boolean(row.fetchOk),
    contentType: row.contentType || "",
    rawTextLength: Number(row.rawTextLength || 0),
    rawSnapshotPath: row.rawSnapshotPath,
    metaSnapshotPath: row.metaSnapshotPath,
    routeClass: row.routeClass,
    approvalReadiness: row.approvalReadiness,
    adapterHint: row.adapterHint || "",
    adapterFamily: adapterFamily(row),
    requiresAdapter: Boolean(row.requiresAdapter),
    fixtureKeywordHitCount: Array.isArray(row.fixtureKeywordHits) ? row.fixtureKeywordHits.length : 0,
    concreteDatePatternCount: Number(row.concreteDatePatternCount || 0),
    hasSpaMarkers: Boolean(row.hasSpaMarkers),
    extractionAllowedNow: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const snapshotReview = readJson(args.snapshotReview);
  const snapshotRows = Array.isArray(snapshotReview.reviewRows) ? snapshotReview.reviewRows : [];
  const routingRows = snapshotRows.map(routeRow).sort((a, b) => {
    if (a.extractionLanePriority !== b.extractionLanePriority) {
      return a.extractionLanePriority - b.extractionLanePriority;
    }
    return `${a.competitionSlug}:${a.fetchUrl}`.localeCompare(`${b.competitionSlug}:${b.fetchUrl}`);
  });

  const adapterRows = routingRows.filter((row) => row.extractionLane === "adapter_specific_extraction_review");
  const landingRows = routingRows.filter((row) => row.extractionLane === "landing_page_fixture_link_extraction_plan");
  const componentRows = routingRows.filter((row) => row.extractionLane === "component_or_api_discovery_plan");
  const retryRows = routingRows.filter((row) => row.extractionLane === "fetch_retry_or_template_repair_plan");
  const directRows = routingRows.filter((row) => row.extractionLane === "direct_fixture_candidate_extraction_review");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-scoped-active-today-extraction-routing-plan-file",
    mode: "source_only_extraction_routing_plan_no_extraction_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    extractionRun: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      snapshotReview: args.snapshotReview,
      snapshotReviewRowCount: snapshotRows.length
    },
    summary: {
      routingRowCount: routingRows.length,
      directFixtureCandidateExtractionReviewCount: directRows.length,
      adapterSpecificExtractionReviewCount: adapterRows.length,
      landingPageFixtureLinkExtractionPlanCount: landingRows.length,
      componentOrApiDiscoveryPlanCount: componentRows.length,
      fetchRetryOrTemplateRepairPlanCount: retryRows.length,
      athensOracleRoutingRowCount: routingRows.filter((row) => row.presentInAthensOracle).length,
      athensOracleAdapterOrLinkOrComponentCount: routingRows.filter((row) =>
        row.presentInAthensOracle &&
        [
          "adapter_specific_extraction_review",
          "landing_page_fixture_link_extraction_plan",
          "component_or_api_discovery_plan"
        ].includes(row.extractionLane)
      ).length,
      extractionAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      extractionRun: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        adapterRows.length > 0
          ? "build_adapter_specific_fixture_extraction_review_input_no_canonical_write"
          : landingRows.length > 0
            ? "build_landing_page_fixture_link_extraction_plan_no_fetch_no_canonical_write"
            : componentRows.length > 0
              ? "build_component_or_api_discovery_plan_no_fetch_no_canonical_write"
              : retryRows.length > 0
                ? "build_scoped_fetch_retry_or_template_repair_plan_no_fetch_no_canonical_write"
                : "no_extraction_routes_available"
    },
    counts: {
      byExtractionLane: countBy(routingRows, "extractionLane"),
      byAdapterFamily: countBy(routingRows, "adapterFamily"),
      byProviderHint: countBy(routingRows, "providerHint"),
      bySnapshotReviewStatus: countBy(routingRows, "snapshotReviewStatus"),
      byStatus: countBy(routingRows, "status")
    },
    lanes: {
      directFixtureCandidateExtractionReviewRows: directRows,
      adapterSpecificExtractionReviewRows: adapterRows,
      landingPageFixtureLinkExtractionPlanRows: landingRows,
      componentOrApiDiscoveryPlanRows: componentRows,
      fetchRetryOrTemplateRepairPlanRows: retryRows
    },
    guardrails: [
      "This is a routing plan only; it does not run extraction.",
      "This job does not fetch.",
      "This job does not search.",
      "This job does not write canonical files.",
      "This job does not write production files.",
      "canonicalWriteEligibleNow remains false.",
      "Each downstream lane requires its own review output before truth acceptance."
    ],
    routingRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    routingRowCount: output.summary.routingRowCount,
    directFixtureCandidateExtractionReviewCount: output.summary.directFixtureCandidateExtractionReviewCount,
    adapterSpecificExtractionReviewCount: output.summary.adapterSpecificExtractionReviewCount,
    landingPageFixtureLinkExtractionPlanCount: output.summary.landingPageFixtureLinkExtractionPlanCount,
    componentOrApiDiscoveryPlanCount: output.summary.componentOrApiDiscoveryPlanCount,
    fetchRetryOrTemplateRepairPlanCount: output.summary.fetchRetryOrTemplateRepairPlanCount,
    athensOracleRoutingRowCount: output.summary.athensOracleRoutingRowCount,
    athensOracleAdapterOrLinkOrComponentCount: output.summary.athensOracleAdapterOrLinkOrComponentCount,
    extractionAllowedNowCount: 0,
    fetchAllowedNowCount: 0,
    searchAllowedNowCount: 0,
    canonicalWriteEligibleNowCount: 0,
    sourceFetch: false,
    extractionRun: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
