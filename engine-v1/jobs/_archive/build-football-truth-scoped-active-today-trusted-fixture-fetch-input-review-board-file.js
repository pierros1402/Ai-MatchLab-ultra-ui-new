#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_FETCH_INPUT =
  "data/football-truth/_diagnostics/scoped-active-today-trusted-fixture-fetch-input-2026-06-13/scoped-active-today-trusted-fixture-fetch-input-2026-06-13.json";

const HIGH_CONFIDENCE_ROUTE_CLASSES = new Set([
  "known_adapter_provider_contract",
  "global_competition_fifa_fixture_lane"
]);

const HOMEPAGE_ONLY_ROUTE_CLASSES = new Set([
  "trusted_provider_homepage_seed"
]);

const HOMEPAGE_ONLY_ALLOWLIST = new Set([
  "afa.com.ar",
  "anfp.cl",
  "cfa.com.cy",
  "superliga.dk",
  "premierleague.com",
  "efl.com",
  "slgr.gr",
  "legaseriea.it",
  "spl.com.sa",
  "eredivisie.nl",
  "mlssoccer.com",
  "legab.it",
  "ligabbvaexpansion.mx",
  "lpf.ro",
  "sfl.ch",
  "bundesliga.at",
  "proleague.be",
  "nationalleague.org.uk",
  "dfb.de",
  "keukenkampioendivisie.nl"
]);

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    fetchInput: DEFAULT_FETCH_INPUT,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--fetch-input") args.fetchInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-trusted-fixture-fetch-input-review-board-${args.date}`,
      `scoped-active-today-trusted-fixture-fetch-input-review-board-${args.date}.json`
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

function reviewCandidate(row, candidate) {
  if (!candidate?.fetchUrl) {
    return {
      reviewStatus: "rejected_missing_fetch_url",
      reviewReason: "candidate_has_no_fetch_url",
      approvalReadiness: "not_ready"
    };
  }

  if (HIGH_CONFIDENCE_ROUTE_CLASSES.has(candidate.routeClass)) {
    return {
      reviewStatus: "ready_for_scoped_fetch_approval",
      reviewReason: "high_confidence_route_class_or_known_adapter_contract",
      approvalReadiness: "ready"
    };
  }

  if (HOMEPAGE_ONLY_ROUTE_CLASSES.has(candidate.routeClass)) {
    if (HOMEPAGE_ONLY_ALLOWLIST.has(row.providerHint)) {
      return {
        reviewStatus: "homepage_seed_ready_for_scoped_landing_fetch_only",
        reviewReason: "homepage_seed_allowlisted_but_must_not_be_treated_as_fixture_truth_without_followup_extraction",
        approvalReadiness: "landing_fetch_only"
      };
    }

    return {
      reviewStatus: "homepage_seed_needs_route_template_before_fetch",
      reviewReason: "homepage_only_provider_not_allowlisted_for_fetch_input",
      approvalReadiness: "not_ready"
    };
  }

  return {
    reviewStatus: "unknown_route_class_needs_review",
    reviewReason: `unrecognized_route_class:${candidate.routeClass || "__missing__"}`,
    approvalReadiness: "not_ready"
  };
}

function reviewRow(row) {
  const candidateReviews = (row.fetchCandidates || []).map((candidate) => {
    const review = reviewCandidate(row, candidate);
    return {
      ...candidate,
      ...review
    };
  });

  const readyCandidateCount = candidateReviews.filter((candidate) =>
    candidate.approvalReadiness === "ready" ||
    candidate.approvalReadiness === "landing_fetch_only"
  ).length;

  let rowReviewStatus = "not_ready_for_fetch_approval";
  let rowApprovalScope = "none";

  if (candidateReviews.length > 0 && readyCandidateCount === candidateReviews.length) {
    if (candidateReviews.every((candidate) => candidate.approvalReadiness === "ready")) {
      rowReviewStatus = "ready_for_scoped_fetch_approval";
      rowApprovalScope = "full_candidate_fetch";
    } else {
      rowReviewStatus = "ready_for_landing_fetch_only";
      rowApprovalScope = "landing_fetch_only";
    }
  } else if (readyCandidateCount > 0) {
    rowReviewStatus = "partially_ready_needs_candidate_filter";
    rowApprovalScope = "ready_candidates_only";
  }

  return {
    competitionSlug: row.competitionSlug,
    competitionName: row.competitionName || "",
    providerHint: row.providerHint,
    refreshClass: row.refreshClass,
    priority: row.priority,
    presentInAthensOracle: Boolean(row.presentInAthensOracle),
    oracleExpectedActiveToday: Boolean(row.oracleExpectedActiveToday),
    fetchCandidateCount: candidateReviews.length,
    readyCandidateCount,
    rowReviewStatus,
    rowApprovalScope,
    fetchAllowedNow: false,
    requiresExplicitFetchApproval: true,
    searchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false,
    candidateReviews,
    nextAction:
      rowReviewStatus === "ready_for_scoped_fetch_approval"
        ? "eligible_for_explicit_scoped_fetch_approval_after_human_review"
        : rowReviewStatus === "ready_for_landing_fetch_only"
          ? "eligible_for_explicit_landing_fetch_only_approval_after_human_review"
          : rowReviewStatus === "partially_ready_needs_candidate_filter"
            ? "filter_to_ready_candidates_before_fetch_approval"
            : "repair_route_template_before_fetch"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const fetchInput = readJson(args.fetchInput);

  const fetchInputRows = Array.isArray(fetchInput.fetchInputRows) ? fetchInput.fetchInputRows : [];
  const reviewRows = fetchInputRows.map(reviewRow);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-scoped-active-today-trusted-fixture-fetch-input-review-board-file",
    mode: "source_only_scoped_fetch_input_review_board_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    requiresExplicitFetchApproval: true,
    inputs: {
      fetchInput: args.fetchInput,
      fetchInputRowCount: fetchInputRows.length
    },
    summary: {
      reviewRowCount: reviewRows.length,
      reviewedFetchCandidateCount: reviewRows.reduce((sum, row) => sum + row.fetchCandidateCount, 0),
      readyForScopedFetchApprovalRowCount: reviewRows.filter((row) => row.rowReviewStatus === "ready_for_scoped_fetch_approval").length,
      readyForLandingFetchOnlyRowCount: reviewRows.filter((row) => row.rowReviewStatus === "ready_for_landing_fetch_only").length,
      partiallyReadyNeedsCandidateFilterRowCount: reviewRows.filter((row) => row.rowReviewStatus === "partially_ready_needs_candidate_filter").length,
      notReadyForFetchApprovalRowCount: reviewRows.filter((row) => row.rowReviewStatus === "not_ready_for_fetch_approval").length,
      athensOracleReviewRowCount: reviewRows.filter((row) => row.presentInAthensOracle).length,
      athensOracleReadyOrLandingOnlyCount: reviewRows.filter((row) =>
        row.presentInAthensOracle &&
        ["ready_for_scoped_fetch_approval", "ready_for_landing_fetch_only"].includes(row.rowReviewStatus)
      ).length,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "if_approved_build_or_run_scoped_fetch_only_for_ready_or_landing_only_rows"
    },
    counts: {
      byRowReviewStatus: countBy(reviewRows, "rowReviewStatus"),
      byRowApprovalScope: countBy(reviewRows, "rowApprovalScope"),
      byProviderHint: countBy(reviewRows, "providerHint"),
      byRefreshClass: countBy(reviewRows, "refreshClass")
    },
    guardrails: [
      "This is review only; it does not fetch.",
      "ready_for_landing_fetch_only is not fixture truth and must only inspect landing content/links.",
      "homepage seeds are not accepted as fixture truth without follow-up extraction and validation.",
      "fetchAllowedNow remains false for every row.",
      "canonicalWriteEligibleNow remains false for every row.",
      "Any fetch requires explicit approval after this board is reviewed."
    ],
    reviewRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    reviewRowCount: output.summary.reviewRowCount,
    reviewedFetchCandidateCount: output.summary.reviewedFetchCandidateCount,
    readyForScopedFetchApprovalRowCount: output.summary.readyForScopedFetchApprovalRowCount,
    readyForLandingFetchOnlyRowCount: output.summary.readyForLandingFetchOnlyRowCount,
    partiallyReadyNeedsCandidateFilterRowCount: output.summary.partiallyReadyNeedsCandidateFilterRowCount,
    notReadyForFetchApprovalRowCount: output.summary.notReadyForFetchApprovalRowCount,
    athensOracleReviewRowCount: output.summary.athensOracleReviewRowCount,
    athensOracleReadyOrLandingOnlyCount: output.summary.athensOracleReadyOrLandingOnlyCount,
    fetchAllowedNowCount: 0,
    searchAllowedNowCount: 0,
    canonicalWriteEligibleNowCount: 0,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
