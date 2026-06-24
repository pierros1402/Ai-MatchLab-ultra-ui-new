#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_ADAPTER_INPUT =
  "data/football-truth/_diagnostics/scoped-active-today-adapter-extraction-review-input-2026-06-13/scoped-active-today-adapter-extraction-review-input-2026-06-13.json";

const FAMILY_ORDER = [
  "loi_ajax",
  "spfl_opta",
  "torneopal",
  "sportomedia",
  "bundesliga",
  "laliga",
  "norway_ntf"
];

const BATCH_POLICY = {
  low: {
    batchGroup: "batch_1_low_risk_known_adapters",
    batchPriority: 10,
    maxRowsPerFamilyBatch: 10,
    extractionRunAllowedNow: false,
    nextApprovalRequired: "explicit_adapter_family_extraction_review_approval"
  },
  medium: {
    batchGroup: "batch_2_medium_risk_known_adapters",
    batchPriority: 20,
    maxRowsPerFamilyBatch: 10,
    extractionRunAllowedNow: false,
    nextApprovalRequired: "explicit_adapter_family_extraction_review_approval"
  },
  high: {
    batchGroup: "batch_3_high_risk_or_unknown_adapters",
    batchPriority: 30,
    maxRowsPerFamilyBatch: 5,
    extractionRunAllowedNow: false,
    nextApprovalRequired: "manual_adapter_contract_review_before_approval"
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    adapterInput: DEFAULT_ADAPTER_INPUT,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--adapter-input") args.adapterInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-adapter-family-batch-plan-${args.date}`,
      `scoped-active-today-adapter-family-batch-plan-${args.date}.json`
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

function familyOrderIndex(family) {
  const index = FAMILY_ORDER.indexOf(family);
  return index === -1 ? 999 : index;
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function groupBy(rows, key) {
  const grouped = new Map();

  for (const row of rows) {
    const value = String(row[key] || "__missing__");
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }

  return grouped;
}

function buildBatchRows(adapterRows) {
  const grouped = groupBy(adapterRows, "adapterFamily");
  const batchRows = [];

  for (const [family, rows] of grouped.entries()) {
    const sortedRows = rows.slice().sort((a, b) => {
      return `${a.competitionSlug}:${a.fetchUrl}`.localeCompare(`${b.competitionSlug}:${b.fetchUrl}`);
    });

    const risk = sortedRows[0]?.extractionRisk || "high";
    const policy = BATCH_POLICY[risk] || BATCH_POLICY.high;

    batchRows.push({
      batchId: `adapter_family_batch_${String(batchRows.length + 1).padStart(3, "0")}`,
      adapterFamily: family,
      batchGroup: policy.batchGroup,
      batchPriority: policy.batchPriority,
      familyPriority: familyOrderIndex(family),
      extractionRisk: risk,
      rowCount: sortedRows.length,
      competitionCount: uniqueSorted(sortedRows.map((row) => row.competitionSlug)).length,
      competitions: uniqueSorted(sortedRows.map((row) => row.competitionSlug)),
      providers: uniqueSorted(sortedRows.map((row) => row.providerHint)),
      adapterHints: uniqueSorted(sortedRows.map((row) => row.adapterHint)),
      statuses: uniqueSorted(sortedRows.map((row) => row.status)),
      presentInAthensOracleCount: sortedRows.filter((row) => row.presentInAthensOracle).length,
      maxRowsPerFamilyBatch: policy.maxRowsPerFamilyBatch,
      extractionRunAllowedNow: false,
      adapterReviewAllowedNow: false,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      nextApprovalRequired: policy.nextApprovalRequired,
      nextJobRecommendation: sortedRows[0]?.nextJobRecommendation || "manual_adapter_review_required",
      batchExecutionMode: "review_output_only_no_canonical_write",
      rows: sortedRows
    });
  }

  return batchRows.sort((a, b) => {
    if (a.batchPriority !== b.batchPriority) return a.batchPriority - b.batchPriority;
    if (a.familyPriority !== b.familyPriority) return a.familyPriority - b.familyPriority;
    return a.adapterFamily.localeCompare(b.adapterFamily);
  }).map((row, index) => ({
    ...row,
    batchId: `adapter_family_batch_${String(index + 1).padStart(3, "0")}`,
    batchSequence: index + 1
  }));
}

function main() {
  const args = parseArgs(process.argv);
  const adapterInput = readJson(args.adapterInput);
  const adapterRows = Array.isArray(adapterInput.adapterReviewInputRows)
    ? adapterInput.adapterReviewInputRows
    : [];

  const batchRows = buildBatchRows(adapterRows);

  const lowRiskBatches = batchRows.filter((row) => row.extractionRisk === "low");
  const mediumRiskBatches = batchRows.filter((row) => row.extractionRisk === "medium");
  const highRiskBatches = batchRows.filter((row) => row.extractionRisk === "high");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-scoped-active-today-adapter-family-batch-plan-file",
    mode: "source_only_adapter_family_batch_plan_no_extraction_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    extractionRun: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      adapterInput: args.adapterInput,
      adapterReviewInputRowCount: adapterRows.length
    },
    summary: {
      adapterReviewInputRowCount: adapterRows.length,
      adapterFamilyBatchCount: batchRows.length,
      lowRiskBatchCount: lowRiskBatches.length,
      lowRiskRowCount: lowRiskBatches.reduce((sum, batch) => sum + batch.rowCount, 0),
      mediumRiskBatchCount: mediumRiskBatches.length,
      mediumRiskRowCount: mediumRiskBatches.reduce((sum, batch) => sum + batch.rowCount, 0),
      highRiskBatchCount: highRiskBatches.length,
      highRiskRowCount: highRiskBatches.reduce((sum, batch) => sum + batch.rowCount, 0),
      athensOracleBatchRowCount: batchRows.reduce((sum, batch) => sum + batch.presentInAthensOracleCount, 0),
      extractionRunAllowedNowCount: 0,
      adapterReviewAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      extractionRun: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "run_low_risk_adapter_family_extraction_review_batch_only_after_explicit_approval"
    },
    counts: {
      byAdapterFamily: countBy(adapterRows, "adapterFamily"),
      byExtractionRisk: countBy(adapterRows, "extractionRisk"),
      byBatchGroup: countBy(batchRows, "batchGroup"),
      byNextJobRecommendation: countBy(batchRows, "nextJobRecommendation")
    },
    batchGroups: {
      lowRiskKnownAdapters: lowRiskBatches,
      mediumRiskKnownAdapters: mediumRiskBatches,
      highRiskOrUnknownAdapters: highRiskBatches
    },
    guardrails: [
      "This is a batch plan only; it does not run extraction.",
      "This job does not fetch.",
      "This job does not search.",
      "This job does not write canonical files.",
      "This job does not write production files.",
      "extractionRunAllowedNow remains false.",
      "adapterReviewAllowedNow remains false.",
      "canonicalWriteEligibleNow remains false.",
      "Each adapter-family extraction run requires explicit approval and must output review diagnostics before truth acceptance."
    ],
    batchRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    adapterReviewInputRowCount: output.summary.adapterReviewInputRowCount,
    adapterFamilyBatchCount: output.summary.adapterFamilyBatchCount,
    lowRiskBatchCount: output.summary.lowRiskBatchCount,
    lowRiskRowCount: output.summary.lowRiskRowCount,
    mediumRiskBatchCount: output.summary.mediumRiskBatchCount,
    mediumRiskRowCount: output.summary.mediumRiskRowCount,
    highRiskBatchCount: output.summary.highRiskBatchCount,
    highRiskRowCount: output.summary.highRiskRowCount,
    athensOracleBatchRowCount: output.summary.athensOracleBatchRowCount,
    extractionRunAllowedNowCount: 0,
    adapterReviewAllowedNowCount: 0,
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
