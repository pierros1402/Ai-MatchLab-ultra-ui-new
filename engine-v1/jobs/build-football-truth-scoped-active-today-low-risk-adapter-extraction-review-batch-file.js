#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_BATCH_PLAN =
  "data/football-truth/_diagnostics/scoped-active-today-adapter-family-batch-plan-2026-06-13/scoped-active-today-adapter-family-batch-plan-2026-06-13.json";

const LOW_RISK_FAMILIES = new Set(["loi_ajax", "spfl_opta", "torneopal"]);

const FAMILY_SIGNAL_RULES = {
  loi_ajax: {
    requiredAny: ["fixture", "fixtures", "match", "matches", "results"],
    usefulAny: ["league of ireland", "premier division", "first division", "clubs", "standings"],
    adapterReviewType: "loi_ajax_snapshot_signal_review",
    nextCandidateLane: "loi_ajax_adapter_extraction_candidate_builder"
  },
  spfl_opta: {
    requiredAny: ["opta", "fixture", "fixtures", "match", "matches", "cinch", "premiership", "championship"],
    usefulAny: ["spfl", "table", "standings", "results", "club"],
    adapterReviewType: "spfl_opta_snapshot_signal_review",
    nextCandidateLane: "spfl_opta_adapter_extraction_candidate_builder"
  },
  torneopal: {
    requiredAny: ["tournament", "ottelu", "ottelut", "match", "matches", "palloliitto", "tulospalvelu"],
    usefulAny: ["veikkausliiga", "ykkösliiga", "sarja", "joukkue", "fixtures", "results"],
    adapterReviewType: "torneopal_snapshot_signal_review",
    nextCandidateLane: "torneopal_adapter_extraction_candidate_builder"
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    batchPlan: DEFAULT_BATCH_PLAN,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--batch-plan") args.batchPlan = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-low-risk-adapter-extraction-review-batch-${args.date}`,
      `scoped-active-today-low-risk-adapter-extraction-review-batch-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
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

function keywordHits(text, keywords) {
  const lower = String(text || "").toLowerCase();
  return keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function countRegex(text, regex) {
  const matches = String(text || "").match(regex);
  return matches ? matches.length : 0;
}

function classifyLowRiskAdapterRow(row, rawText) {
  const rules = FAMILY_SIGNAL_RULES[row.adapterFamily] || {
    requiredAny: [],
    usefulAny: [],
    adapterReviewType: "unknown_low_risk_adapter_review",
    nextCandidateLane: "manual_adapter_candidate_review"
  };

  const requiredHits = keywordHits(rawText, rules.requiredAny);
  const usefulHits = keywordHits(rawText, rules.usefulAny);
  const urlCount = countRegex(rawText, /https?:\/\/|href=|data-|api|ajax|graphql|opta|json/gi);
  const datePatternCount = countRegex(rawText, /\b2026-\d{2}-\d{2}\b|\b\d{1,2}[./-]\d{1,2}[./-]2026\b|\b2026[./-]\d{1,2}[./-]\d{1,2}\b/g);
  const teamLikeCount = countRegex(rawText, /\b[A-ZΑ-Ω][A-Za-zΑ-Ωα-ω'’.-]{2,}(?:\s+[A-ZΑ-Ω][A-Za-zΑ-Ωα-ω'’.-]{2,}){0,3}\b/g);

  if (!row.fetchOk || row.status !== 200) {
    return {
      adapterReviewStatus: "blocked_snapshot_fetch_not_ok",
      adapterReviewReason: `fetch_not_ok_or_non_200:${row.status || "__missing__"}`,
      adapterExtractionCandidateReadiness: "not_ready",
      requiredHits,
      usefulHits,
      urlCount,
      datePatternCount,
      teamLikeCount
    };
  }

  if (row.rawTextLength < 1000) {
    return {
      adapterReviewStatus: "blocked_snapshot_too_small",
      adapterReviewReason: "snapshot_too_small_for_adapter_signal_review",
      adapterExtractionCandidateReadiness: "not_ready",
      requiredHits,
      usefulHits,
      urlCount,
      datePatternCount,
      teamLikeCount
    };
  }

  if (requiredHits.length > 0 && (usefulHits.length > 0 || urlCount > 0 || datePatternCount > 0)) {
    return {
      adapterReviewStatus: "adapter_signal_candidate",
      adapterReviewReason: "required_adapter_terms_present_with_supporting_link_date_or_useful_signals",
      adapterExtractionCandidateReadiness: "candidate",
      requiredHits,
      usefulHits,
      urlCount,
      datePatternCount,
      teamLikeCount
    };
  }

  if (requiredHits.length > 0) {
    return {
      adapterReviewStatus: "weak_adapter_signal_needs_specific_candidate_builder",
      adapterReviewReason: "required_adapter_terms_present_without_enough_supporting_signals",
      adapterExtractionCandidateReadiness: "weak_candidate",
      requiredHits,
      usefulHits,
      urlCount,
      datePatternCount,
      teamLikeCount
    };
  }

  return {
    adapterReviewStatus: "no_adapter_signal_in_snapshot",
    adapterReviewReason: "snapshot_lacks_required_adapter_terms",
    adapterExtractionCandidateReadiness: "not_ready",
    requiredHits,
    usefulHits,
    urlCount,
    datePatternCount,
    teamLikeCount
  };
}

function flattenLowRiskRows(batchPlan) {
  const lowRiskBatches = batchPlan?.batchGroups?.lowRiskKnownAdapters || [];
  const rows = [];

  for (const batch of lowRiskBatches) {
    if (!LOW_RISK_FAMILIES.has(batch.adapterFamily)) continue;

    for (const row of batch.rows || []) {
      rows.push({
        batchId: batch.batchId,
        batchSequence: batch.batchSequence,
        batchGroup: batch.batchGroup,
        adapterFamily: batch.adapterFamily,
        extractionRisk: batch.extractionRisk,
        nextJobRecommendation: batch.nextJobRecommendation,
        ...row
      });
    }
  }

  return rows.sort((a, b) => {
    return `${a.adapterFamily}:${a.competitionSlug}:${a.fetchUrl}`.localeCompare(
      `${b.adapterFamily}:${b.competitionSlug}:${b.fetchUrl}`
    );
  });
}

function main() {
  const args = parseArgs(process.argv);
  const batchPlan = readJson(args.batchPlan);
  const lowRiskRows = flattenLowRiskRows(batchPlan);

  const reviewRows = lowRiskRows.map((row, index) => {
    const rawText = readTextIfExists(row.rawSnapshotPath);
    const rules = FAMILY_SIGNAL_RULES[row.adapterFamily] || {};
    const review = classifyLowRiskAdapterRow(row, rawText);

    return {
      adapterExtractionReviewId: `low_risk_adapter_review_${String(index + 1).padStart(3, "0")}`,
      batchId: row.batchId,
      batchSequence: row.batchSequence,
      competitionSlug: row.competitionSlug,
      competitionName: row.competitionName || "",
      providerHint: row.providerHint,
      adapterFamily: row.adapterFamily,
      adapterHint: row.adapterHint || "",
      adapterReviewType: rules.adapterReviewType || "unknown_low_risk_adapter_review",
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
      extractionRisk: row.extractionRisk,
      reviewStrategy: row.reviewStrategy || "",
      expectedSignals: row.expectedSignals || [],
      requiredSignalHits: review.requiredHits,
      usefulSignalHits: review.usefulHits,
      urlOrApiSignalCount: review.urlCount,
      concreteDatePatternCount: review.datePatternCount,
      teamLikeTokenCount: review.teamLikeCount,
      adapterReviewStatus: review.adapterReviewStatus,
      adapterReviewReason: review.adapterReviewReason,
      adapterExtractionCandidateReadiness: review.adapterExtractionCandidateReadiness,
      nextCandidateLane: rules.nextCandidateLane || "manual_adapter_candidate_review",
      extractionRun: false,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      nextAction:
        review.adapterExtractionCandidateReadiness === "candidate"
          ? "build_adapter_specific_extraction_candidate_review_no_canonical_write"
          : review.adapterExtractionCandidateReadiness === "weak_candidate"
            ? "build_family_specific_candidate_builder_or_manual_signal_review"
            : "repair_adapter_snapshot_or_route_before_extraction_candidate_build"
    };
  });

  const candidateRows = reviewRows.filter((row) => row.adapterExtractionCandidateReadiness === "candidate");
  const weakRows = reviewRows.filter((row) => row.adapterExtractionCandidateReadiness === "weak_candidate");
  const blockedRows = reviewRows.filter((row) => row.adapterExtractionCandidateReadiness === "not_ready");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-scoped-active-today-low-risk-adapter-extraction-review-batch-file",
    mode: "source_only_low_risk_adapter_extraction_review_batch_no_extraction_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    extractionRun: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      batchPlan: args.batchPlan,
      lowRiskFamilies: [...LOW_RISK_FAMILIES].sort(),
      lowRiskInputRowCount: lowRiskRows.length
    },
    summary: {
      lowRiskAdapterReviewRowCount: reviewRows.length,
      adapterSignalCandidateCount: candidateRows.length,
      weakAdapterSignalNeedsSpecificCandidateBuilderCount: weakRows.length,
      blockedOrNoAdapterSignalCount: blockedRows.length,
      athensOracleLowRiskReviewRowCount: reviewRows.filter((row) => row.presentInAthensOracle).length,
      athensOracleCandidateOrWeakCount: reviewRows.filter((row) =>
        row.presentInAthensOracle &&
        ["candidate", "weak_candidate"].includes(row.adapterExtractionCandidateReadiness)
      ).length,
      extractionRunCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      extractionRun: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        candidateRows.length > 0
          ? "build_low_risk_adapter_extraction_candidate_review_no_canonical_write"
          : weakRows.length > 0
            ? "build_family_specific_candidate_builder_or_manual_signal_review"
            : "repair_low_risk_adapter_snapshots_or_routes_before_extraction"
    },
    counts: {
      byAdapterFamily: countBy(reviewRows, "adapterFamily"),
      byAdapterReviewStatus: countBy(reviewRows, "adapterReviewStatus"),
      byCandidateReadiness: countBy(reviewRows, "adapterExtractionCandidateReadiness"),
      byProviderHint: countBy(reviewRows, "providerHint"),
      byStatus: countBy(reviewRows, "status")
    },
    guardrails: [
      "This is low-risk adapter extraction review only; it does not extract canonical fixtures.",
      "This job reads already-fetched snapshots only.",
      "This job does not fetch.",
      "This job does not search.",
      "This job does not write canonical files.",
      "This job does not write production files.",
      "canonicalWriteEligibleNow remains false.",
      "Candidate rows require a separate extraction-candidate review before truth acceptance."
    ],
    candidateRows,
    weakRows,
    blockedRows,
    reviewRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    lowRiskAdapterReviewRowCount: output.summary.lowRiskAdapterReviewRowCount,
    adapterSignalCandidateCount: output.summary.adapterSignalCandidateCount,
    weakAdapterSignalNeedsSpecificCandidateBuilderCount: output.summary.weakAdapterSignalNeedsSpecificCandidateBuilderCount,
    blockedOrNoAdapterSignalCount: output.summary.blockedOrNoAdapterSignalCount,
    athensOracleLowRiskReviewRowCount: output.summary.athensOracleLowRiskReviewRowCount,
    athensOracleCandidateOrWeakCount: output.summary.athensOracleCandidateOrWeakCount,
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
