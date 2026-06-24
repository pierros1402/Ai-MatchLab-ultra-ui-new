#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_ROUTING_PLAN =
  "data/football-truth/_diagnostics/scoped-active-today-extraction-routing-plan-2026-06-13/scoped-active-today-extraction-routing-plan-2026-06-13.json";

const ADAPTER_BATCH_ORDER = [
  "sportomedia",
  "bundesliga",
  "laliga",
  "norway_ntf",
  "loi_ajax",
  "spfl_opta",
  "torneopal"
];

const ADAPTER_REVIEW_CONTRACTS = {
  sportomedia: {
    reviewStrategy: "graphql_widget_or_embedded_state_snapshot_review",
    expectedSignals: ["competition", "fixtures", "matches", "date", "team"],
    extractionRisk: "medium",
    nextJobRecommendation: "build_sportomedia_fixture_extraction_review_no_canonical_write"
  },
  bundesliga: {
    reviewStrategy: "bundesliga_official_page_or_embedded_data_review",
    expectedSignals: ["fixtures", "matchday", "teams", "date"],
    extractionRisk: "medium",
    nextJobRecommendation: "build_bundesliga_fixture_extraction_review_no_canonical_write"
  },
  laliga: {
    reviewStrategy: "laliga_results_page_review",
    expectedSignals: ["results", "fixtures", "match", "date", "competition"],
    extractionRisk: "medium",
    nextJobRecommendation: "build_laliga_fixture_extraction_review_no_canonical_write"
  },
  norway_ntf: {
    reviewStrategy: "ntf_league_landing_or_embedded_data_review",
    expectedSignals: ["fixtures", "matches", "date", "teams"],
    extractionRisk: "medium",
    nextJobRecommendation: "build_norway_ntf_fixture_extraction_review_no_canonical_write"
  },
  loi_ajax: {
    reviewStrategy: "league_of_ireland_ajax_adapter_review",
    expectedSignals: ["fixtures", "results", "matches", "date", "competition"],
    extractionRisk: "low",
    nextJobRecommendation: "build_loi_ajax_fixture_extraction_review_no_canonical_write"
  },
  spfl_opta: {
    reviewStrategy: "spfl_opta_widget_adapter_review",
    expectedSignals: ["opta", "fixtures", "match", "date"],
    extractionRisk: "low",
    nextJobRecommendation: "build_spfl_opta_fixture_extraction_review_no_canonical_write"
  },
  torneopal: {
    reviewStrategy: "palloliitto_torneopal_adapter_review",
    expectedSignals: ["tournament", "fixtures", "matches", "date"],
    extractionRisk: "low",
    nextJobRecommendation: "build_torneopal_fixture_extraction_review_no_canonical_write"
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    routingPlan: DEFAULT_ROUTING_PLAN,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--routing-plan") args.routingPlan = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-adapter-extraction-review-input-${args.date}`,
      `scoped-active-today-adapter-extraction-review-input-${args.date}.json`
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

function adapterSortIndex(family) {
  const index = ADAPTER_BATCH_ORDER.indexOf(family);
  return index === -1 ? 999 : index;
}

function buildReviewInputRow(row, index) {
  const contract = ADAPTER_REVIEW_CONTRACTS[row.adapterFamily] || {
    reviewStrategy: "unknown_adapter_family_manual_review",
    expectedSignals: [],
    extractionRisk: "high",
    nextJobRecommendation: "manual_adapter_contract_required_before_extraction"
  };

  return {
    adapterReviewInputId: `adapter_review_input_${String(index + 1).padStart(3, "0")}`,
    routeId: row.routeId,
    competitionSlug: row.competitionSlug,
    competitionName: row.competitionName || "",
    providerHint: row.providerHint,
    adapterFamily: row.adapterFamily,
    adapterHint: row.adapterHint || "",
    reviewStrategy: contract.reviewStrategy,
    expectedSignals: contract.expectedSignals,
    extractionRisk: contract.extractionRisk,
    nextJobRecommendation: contract.nextJobRecommendation,
    presentInAthensOracle: Boolean(row.presentInAthensOracle),
    oracleExpectedActiveToday: Boolean(row.oracleExpectedActiveToday),
    fetchUrl: row.fetchUrl,
    finalUrl: row.finalUrl,
    status: row.status,
    fetchOk: Boolean(row.fetchOk),
    rawTextLength: Number(row.rawTextLength || 0),
    rawSnapshotPath: row.rawSnapshotPath,
    metaSnapshotPath: row.metaSnapshotPath,
    routeClass: row.routeClass,
    snapshotReviewStatus: row.snapshotReviewStatus,
    extractionReadiness: row.extractionReadiness,
    fixtureKeywordHitCount: Number(row.fixtureKeywordHitCount || 0),
    concreteDatePatternCount: Number(row.concreteDatePatternCount || 0),
    hasSpaMarkers: Boolean(row.hasSpaMarkers),
    adapterReviewAllowedNow: false,
    extractionRun: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const routingPlan = readJson(args.routingPlan);
  const routingRows = Array.isArray(routingPlan.routingRows) ? routingPlan.routingRows : [];

  const adapterRoutingRows = routingRows
    .filter((row) => row.extractionLane === "adapter_specific_extraction_review")
    .sort((a, b) => {
      if (adapterSortIndex(a.adapterFamily) !== adapterSortIndex(b.adapterFamily)) {
        return adapterSortIndex(a.adapterFamily) - adapterSortIndex(b.adapterFamily);
      }

      return `${a.adapterFamily}:${a.competitionSlug}:${a.fetchUrl}`.localeCompare(
        `${b.adapterFamily}:${b.competitionSlug}:${b.fetchUrl}`
      );
    });

  const adapterReviewInputRows = adapterRoutingRows.map(buildReviewInputRow);

  const adapterBatches = {};
  for (const family of ADAPTER_BATCH_ORDER) {
    const rows = adapterReviewInputRows.filter((row) => row.adapterFamily === family);
    if (!rows.length) continue;

    adapterBatches[family] = {
      adapterFamily: family,
      rowCount: rows.length,
      competitions: [...new Set(rows.map((row) => row.competitionSlug))].sort(),
      providers: [...new Set(rows.map((row) => row.providerHint))].sort(),
      reviewStrategy: ADAPTER_REVIEW_CONTRACTS[family].reviewStrategy,
      extractionRisk: ADAPTER_REVIEW_CONTRACTS[family].extractionRisk,
      nextJobRecommendation: ADAPTER_REVIEW_CONTRACTS[family].nextJobRecommendation,
      adapterReviewAllowedNow: false,
      rows
    };
  }

  const unknownAdapterRows = adapterReviewInputRows.filter((row) => !ADAPTER_REVIEW_CONTRACTS[row.adapterFamily]);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-scoped-active-today-adapter-extraction-review-input-file",
    mode: "source_only_adapter_extraction_review_input_no_extraction_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    extractionRun: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      routingPlan: args.routingPlan,
      routingRowCount: routingRows.length,
      adapterSpecificExtractionRoutingRowCount: adapterRoutingRows.length
    },
    summary: {
      adapterReviewInputRowCount: adapterReviewInputRows.length,
      adapterBatchCount: Object.keys(adapterBatches).length,
      unknownAdapterFamilyCount: unknownAdapterRows.length,
      athensOracleAdapterReviewInputCount: adapterReviewInputRows.filter((row) => row.presentInAthensOracle).length,
      lowRiskAdapterRowCount: adapterReviewInputRows.filter((row) => row.extractionRisk === "low").length,
      mediumRiskAdapterRowCount: adapterReviewInputRows.filter((row) => row.extractionRisk === "medium").length,
      highRiskAdapterRowCount: adapterReviewInputRows.filter((row) => row.extractionRisk === "high").length,
      adapterReviewAllowedNowCount: 0,
      extractionRunCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      extractionRun: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_adapter_family_batch_extraction_review_jobs_starting_with_low_risk_known_adapters"
    },
    counts: {
      byAdapterFamily: countBy(adapterReviewInputRows, "adapterFamily"),
      byExtractionRisk: countBy(adapterReviewInputRows, "extractionRisk"),
      byProviderHint: countBy(adapterReviewInputRows, "providerHint"),
      byStatus: countBy(adapterReviewInputRows, "status")
    },
    adapterBatches,
    guardrails: [
      "This is adapter extraction review input only; it does not run extraction.",
      "This job does not fetch.",
      "This job does not search.",
      "This job does not write canonical files.",
      "This job does not write production files.",
      "adapterReviewAllowedNow remains false.",
      "canonicalWriteEligibleNow remains false.",
      "Downstream adapter family jobs must produce review outputs before truth acceptance."
    ],
    adapterReviewInputRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    adapterReviewInputRowCount: output.summary.adapterReviewInputRowCount,
    adapterBatchCount: output.summary.adapterBatchCount,
    unknownAdapterFamilyCount: output.summary.unknownAdapterFamilyCount,
    athensOracleAdapterReviewInputCount: output.summary.athensOracleAdapterReviewInputCount,
    lowRiskAdapterRowCount: output.summary.lowRiskAdapterRowCount,
    mediumRiskAdapterRowCount: output.summary.mediumRiskAdapterRowCount,
    highRiskAdapterRowCount: output.summary.highRiskAdapterRowCount,
    adapterReviewAllowedNowCount: 0,
    extractionRunCount: 0,
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
