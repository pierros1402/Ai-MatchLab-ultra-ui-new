#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_FETCH_SNAPSHOTS =
  "data/football-truth/_diagnostics/scoped-active-today-trusted-fixture-fetch-snapshots-2026-06-13/scoped-active-today-trusted-fixture-fetch-snapshots-2026-06-13.json";

const FIXTURE_KEYWORDS = [
  "fixture",
  "fixtures",
  "schedule",
  "match",
  "matches",
  "results",
  "scores",
  "partidos",
  "ottelu",
  "ottelut",
  "kamp",
  "kampe"
];

const DATE_PATTERNS = [
  /\b2026-\d{2}-\d{2}\b/g,
  /\b\d{1,2}[./-]\d{1,2}[./-]2026\b/g,
  /\b2026[./-]\d{1,2}[./-]\d{1,2}\b/g
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    fetchSnapshots: DEFAULT_FETCH_SNAPSHOTS,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--fetch-snapshots") args.fetchSnapshots = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-fetch-snapshot-review-board-${args.date}`,
      `scoped-active-today-fetch-snapshot-review-board-${args.date}.json`
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

function countPatternSet(text, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    const matches = String(text || "").match(pattern);
    count += matches ? matches.length : 0;
  }
  return count;
}

function hasSpaMarkers(rawText) {
  const lower = String(rawText || "").toLowerCase();
  return (
    lower.includes("__next_data__") ||
    lower.includes("self.__next_f.push") ||
    lower.includes("next/static") ||
    lower.includes("webpack") ||
    lower.includes("static/chunks")
  );
}

function isJsonLike(row, rawText) {
  return (
    String(row.contentType || "").toLowerCase().includes("json") ||
    /^\s*[{[]/.test(String(rawText || ""))
  );
}

function classifySnapshot(row, rawText) {
  if (!row.fetchOk) {
    return {
      snapshotReviewStatus: "failed_fetch_needs_retry_or_template_repair",
      reviewReason: row.error || `http_status_${row.status || "missing"}`,
      extractionReadiness: "not_ready"
    };
  }

  if (row.status !== 200) {
    return {
      snapshotReviewStatus: "non_200_fetch_needs_retry_or_redirect_template_repair",
      reviewReason: `http_status_${row.status}`,
      extractionReadiness: "not_ready"
    };
  }

  const text = rawText || "";
  const fixtureHits = keywordHits(text, FIXTURE_KEYWORDS);
  const concreteDateCount = countPatternSet(text, DATE_PATTERNS);
  const jsonLike = isJsonLike(row, text);
  const spaMarkers = hasSpaMarkers(text);
  const lowText = Number(row.rawTextLength || 0) < 9000;

  if (row.routeClass === "global_competition_fifa_fixture_lane") {
    return {
      snapshotReviewStatus: "spa_shell_or_low_text_needs_component_or_api_discovery",
      reviewReason: "fifa_global_page_snapshot_is_spa_shell_or_component_lane_and_not_direct_fixture_truth",
      extractionReadiness: "component_or_api_discovery_required"
    };
  }

  if (row.approvalReadiness === "landing_fetch_only") {
    return {
      snapshotReviewStatus: "landing_page_needs_link_extraction",
      reviewReason: "landing_only_approval_scope_cannot_be_promoted_to_fixture_content_candidate_by_keyword_hits",
      extractionReadiness: "link_extraction_required"
    };
  }

  if (row.requiresAdapter || row.adapterHint) {
    return {
      snapshotReviewStatus: "adapter_specific_extraction_required",
      reviewReason: "known_adapter_or_adapter_hint_snapshot_requires_adapter_specific_extraction_review",
      extractionReadiness: "adapter_required"
    };
  }

  if (jsonLike && fixtureHits.length > 0 && concreteDateCount > 0) {
    return {
      snapshotReviewStatus: "fixture_content_candidate",
      reviewReason: "json_or_api_like_response_with_fixture_terms_and_concrete_date_patterns",
      extractionReadiness: "candidate"
    };
  }

  if (fixtureHits.length >= 2 && concreteDateCount > 0 && !spaMarkers && !lowText) {
    return {
      snapshotReviewStatus: "fixture_content_candidate",
      reviewReason: "non_landing_page_contains_fixture_terms_and_concrete_date_patterns",
      extractionReadiness: "candidate"
    };
  }

  if (spaMarkers || lowText) {
    return {
      snapshotReviewStatus: "spa_shell_or_low_text_needs_component_or_api_discovery",
      reviewReason: "spa_or_low_text_snapshot_without_direct_fixture_truth",
      extractionReadiness: "component_or_api_discovery_required"
    };
  }

  return {
    snapshotReviewStatus: "landing_page_needs_link_extraction",
    reviewReason: "http_200_page_without_strict_direct_fixture_evidence",
    extractionReadiness: "link_extraction_required"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const fetchSnapshots = readJson(args.fetchSnapshots);
  const fetchRows = Array.isArray(fetchSnapshots.fetchRows) ? fetchSnapshots.fetchRows : [];

  const reviewRows = fetchRows.map((row) => {
    const rawText = readTextIfExists(row.rawSnapshotPath);
    const fixtureHits = keywordHits(rawText, FIXTURE_KEYWORDS);
    const concreteDatePatternCount = countPatternSet(rawText, DATE_PATTERNS);
    const classification = classifySnapshot(row, rawText);

    return {
      competitionSlug: row.competitionSlug,
      competitionName: row.competitionName || "",
      providerHint: row.providerHint,
      presentInAthensOracle: Boolean(row.presentInAthensOracle),
      oracleExpectedActiveToday: Boolean(row.oracleExpectedActiveToday),
      fetchUrl: row.fetchUrl,
      finalUrl: row.finalUrl,
      status: row.status,
      fetchOk: Boolean(row.fetchOk),
      contentType: row.contentType || "",
      rawTextLength: Number(row.rawTextLength || 0),
      rawTextSha256: row.rawTextSha256 || "",
      rawSnapshotPath: row.rawSnapshotPath,
      metaSnapshotPath: row.metaSnapshotPath,
      approvalReadiness: row.approvalReadiness,
      routeClass: row.routeClass,
      adapterHint: row.adapterHint || "",
      requiresAdapter: Boolean(row.requiresAdapter),
      fixtureKeywordHits: fixtureHits,
      concreteDatePatternCount,
      hasSpaMarkers: hasSpaMarkers(rawText),
      isJsonLike: isJsonLike(row, rawText),
      ...classification,
      sourceFetch: true,
      searchProviderUsed: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      nextAction:
        classification.snapshotReviewStatus === "adapter_specific_extraction_required"
          ? "run_adapter_specific_extraction_review_no_canonical_write"
          : classification.snapshotReviewStatus === "fixture_content_candidate"
            ? "build_fixture_candidate_extraction_review_no_canonical_write"
            : classification.snapshotReviewStatus === "landing_page_needs_link_extraction"
              ? "build_link_extraction_plan_for_fixture_or_schedule_links"
              : "repair_fetch_or_discover_component_api_before_extraction"
    };
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-scoped-active-today-fetch-snapshot-review-board-file",
    mode: "source_only_strict_fetch_snapshot_review_board_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      fetchSnapshots: args.fetchSnapshots,
      fetchRowCount: fetchRows.length
    },
    summary: {
      reviewRowCount: reviewRows.length,
      fetchOkCount: reviewRows.filter((row) => row.fetchOk).length,
      fetchFailedOrNon200Count: reviewRows.filter((row) => !row.fetchOk || row.status !== 200).length,
      fixtureContentCandidateCount: reviewRows.filter((row) => row.snapshotReviewStatus === "fixture_content_candidate").length,
      adapterSpecificExtractionRequiredCount: reviewRows.filter((row) => row.snapshotReviewStatus === "adapter_specific_extraction_required").length,
      landingPageNeedsLinkExtractionCount: reviewRows.filter((row) => row.snapshotReviewStatus === "landing_page_needs_link_extraction").length,
      spaShellOrLowTextCount: reviewRows.filter((row) => row.snapshotReviewStatus === "spa_shell_or_low_text_needs_component_or_api_discovery").length,
      failedFetchNeedsRetryOrRepairCount: reviewRows.filter((row) =>
        row.snapshotReviewStatus === "failed_fetch_needs_retry_or_template_repair" ||
        row.snapshotReviewStatus === "non_200_fetch_needs_retry_or_redirect_template_repair"
      ).length,
      athensOracleReviewRowCount: reviewRows.filter((row) => row.presentInAthensOracle).length,
      athensOracleCandidateOrAdapterCount: reviewRows.filter((row) =>
        row.presentInAthensOracle &&
        ["fixture_content_candidate", "adapter_specific_extraction_required"].includes(row.snapshotReviewStatus)
      ).length,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_adapter_link_or_component_extraction_review_plan_no_canonical_write"
    },
    counts: {
      bySnapshotReviewStatus: countBy(reviewRows, "snapshotReviewStatus"),
      byExtractionReadiness: countBy(reviewRows, "extractionReadiness"),
      byProviderHint: countBy(reviewRows, "providerHint"),
      byStatus: countBy(reviewRows, "status")
    },
    guardrails: [
      "This is snapshot review only; it does not fetch.",
      "No search provider was used.",
      "No canonical file was written.",
      "No production file was written.",
      "HTTP 200 does not imply fixture truth.",
      "Landing-only rows cannot become fixture truth candidates from keyword hits alone.",
      "FIFA/global SPA shell snapshots require component/API discovery and are not direct fixture truth.",
      "Fixture content candidates require extraction review before truth acceptance.",
      "Adapter-specific rows require adapter review before truth acceptance.",
      "canonicalWriteEligibleNow remains false."
    ],
    reviewRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    reviewRowCount: output.summary.reviewRowCount,
    fetchOkCount: output.summary.fetchOkCount,
    fetchFailedOrNon200Count: output.summary.fetchFailedOrNon200Count,
    fixtureContentCandidateCount: output.summary.fixtureContentCandidateCount,
    adapterSpecificExtractionRequiredCount: output.summary.adapterSpecificExtractionRequiredCount,
    landingPageNeedsLinkExtractionCount: output.summary.landingPageNeedsLinkExtractionCount,
    spaShellOrLowTextCount: output.summary.spaShellOrLowTextCount,
    failedFetchNeedsRetryOrRepairCount: output.summary.failedFetchNeedsRetryOrRepairCount,
    athensOracleReviewRowCount: output.summary.athensOracleReviewRowCount,
    athensOracleCandidateOrAdapterCount: output.summary.athensOracleCandidateOrAdapterCount,
    canonicalWriteEligibleNowCount: 0,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
