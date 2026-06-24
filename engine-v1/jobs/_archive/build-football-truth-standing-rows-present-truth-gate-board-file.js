#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_TRUTH_REVIEW =
  "data/football-truth/_diagnostics/autonomous-truth-review-board-2026-06-13/autonomous-truth-review-board-2026-06-13.json";

const DEFAULT_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const EXPECTED_STANDING_ROW_COUNTS = {
  "arg.1": [30, 32],
  "arg.2": [36, 42],
  "aut.1": [12],
  "aut.2": [16],
  "bel.1": [16],
  "bel.2": [16],
  "bra.1": [20],
  "bra.2": [20],
  "chi.1": [16],
  "cyp.1": [14],
  "cyp.2": [14, 16],
  "den.1": [12],
  "eng.1": [20],
  "eng.2": [24],
  "eng.3": [24],
  "eng.4": [24],
  "eng.5": [24],
  "fra.1": [18],
  "fra.2": [18],
  "ger.3": [20],
  "gre.1": [14],
  "ita.1": [20],
  "ita.2": [20],
  "jpn.1": [20],
  "ksa.1": [18],
  "mex.2": [14, 15, 18],
  "ned.1": [18],
  "ned.2": [20],
  "nir.1": [12],
  "por.1": [18],
  "rou.1": [16],
  "sui.1": [12],
  "tur.1": [18, 19],
  "usa.1": [29, 30]
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    truthReview: DEFAULT_TRUTH_REVIEW,
    inventory: DEFAULT_INVENTORY,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--truth-review") args.truthReview = argv[++i];
    else if (arg === "--inventory") args.inventory = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `standing-rows-present-truth-gate-board-${args.date}`,
      `standing-rows-present-truth-gate-board-${args.date}.json`
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

function inferGate(row, inventoryRow) {
  const expectedCounts = EXPECTED_STANDING_ROW_COUNTS[row.competitionSlug] || [];
  const observedStandingRows = Number(row.canonicalStandingRows || 0);
  const observedFixtureRows = Number(row.canonicalFixtureRows || 0);
  const officialLikeProviderCount = Number(row.officialLikeProviderCount || 0);
  const aggregatorProviderCount = Number(row.aggregatorProviderCount || 0);
  const noiseProviderCount = Number(row.noiseProviderCount || 0);

  const rowCountMatchesExpected =
    expectedCounts.length > 0 && expectedCounts.includes(observedStandingRows);

  const rowCountUnknownButPlausible =
    expectedCounts.length === 0 && observedStandingRows >= 8 && observedStandingRows <= 42;

  const hasOfficialLikeProvider = officialLikeProviderCount > 0;
  const hasNoiseRisk = noiseProviderCount >= 5;
  const hasFixtureSupport = observedFixtureRows > 0;
  const hasProviderContract = Boolean(inventoryRow?.currentProviderContract?.providerId);

  if (rowCountMatchesExpected && hasOfficialLikeProvider && !hasNoiseRisk) {
    return {
      gateLane: "structurally_plausible_needs_evidence_link_check",
      gateStatus: "candidate_for_scoped_truth_gate",
      gatePriority: 10,
      gatePassNow: false,
      blockedReason: "",
      nextAction: "link_existing_standing_rows_to_concrete_provider_evidence_before_any_canonical_write"
    };
  }

  if (rowCountMatchesExpected && hasOfficialLikeProvider && hasNoiseRisk) {
    return {
      gateLane: "plausible_row_count_but_noise_risk",
      gateStatus: "needs_noise_isolation",
      gatePriority: 20,
      gatePassNow: false,
      blockedReason: "provider_set_contains_high_noise_count",
      nextAction: "isolate_official_provider_evidence_from_noisy_provider_set_before_truth_gate"
    };
  }

  if (rowCountMatchesExpected && !hasOfficialLikeProvider) {
    return {
      gateLane: "plausible_row_count_without_official_provider",
      gateStatus: "blocked",
      gatePriority: 40,
      gatePassNow: false,
      blockedReason: "no_official_like_provider",
      nextAction: "find_or_link_official_or_independent_source_before_truth_gate"
    };
  }

  if (!rowCountMatchesExpected && expectedCounts.length > 0) {
    return {
      gateLane: "standing_row_count_mismatch",
      gateStatus: "blocked",
      gatePriority: 50,
      gatePassNow: false,
      blockedReason: "canonical_standing_row_count_not_in_expected_count_set",
      nextAction: "inspect_competition_format_or_season_phase_before_truth_gate"
    };
  }

  if (rowCountUnknownButPlausible && hasOfficialLikeProvider && !hasNoiseRisk) {
    return {
      gateLane: "unknown_expected_count_but_structurally_plausible",
      gateStatus: "needs_expected_count_confirmation",
      gatePriority: 60,
      gatePassNow: false,
      blockedReason: "expected_standing_row_count_not_encoded",
      nextAction: "add_expected_count_or_format_evidence_before_truth_gate"
    };
  }

  return {
    gateLane: "insufficient_standing_truth_gate_support",
    gateStatus: "blocked",
    gatePriority: 90,
    gatePassNow: false,
    blockedReason: "insufficient_structural_or_provider_support",
    nextAction: "defer_until_better_provider_evidence_or_expected_count_exists"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const truthReview = readJson(args.truthReview);
  const inventory = readJson(args.inventory);

  if (!Array.isArray(truthReview.reviewRows)) throw new Error("Expected truthReview.reviewRows array.");
  if (!Array.isArray(inventory.rows)) throw new Error("Expected inventory.rows array.");

  const inventoryBySlug = new Map(inventory.rows.map((row) => [row.competitionSlug, row]));

  const sourceRows = truthReview.reviewRows.filter((row) =>
    row &&
    row.reviewLane === "standing_rows_present_needs_truth_gate" &&
    Number(row.canonicalStandingRows || 0) > 0
  );

  const gateRows = sourceRows.map((row) => {
    const inventoryRow = inventoryBySlug.get(row.competitionSlug) || {};
    const gate = inferGate(row, inventoryRow);

    return {
      competitionSlug: row.competitionSlug,
      competitionType: row.competitionType,
      inventoryBucket: row.inventoryBucket,
      canonicalStandingRows: Number(row.canonicalStandingRows || 0),
      canonicalFixtureRows: Number(row.canonicalFixtureRows || 0),
      expectedStandingRowCounts: EXPECTED_STANDING_ROW_COUNTS[row.competitionSlug] || [],
      rowCountMatchesExpected:
        (EXPECTED_STANDING_ROW_COUNTS[row.competitionSlug] || []).includes(Number(row.canonicalStandingRows || 0)),
      officialLikeProviderCount: Number(row.officialLikeProviderCount || 0),
      aggregatorProviderCount: Number(row.aggregatorProviderCount || 0),
      noiseProviderCount: Number(row.noiseProviderCount || 0),
      currentProviderId: inventoryRow?.currentProviderContract?.providerId || "",
      currentOverlayNextAllowedAction: inventoryRow?.currentCoverageOverlay?.nextAllowedAction || "",
      reviewScore: Number(row.reviewScore || 0),
      gateLane: gate.gateLane,
      gateStatus: gate.gateStatus,
      gatePriority: gate.gatePriority,
      gatePassNow: gate.gatePassNow,
      blockedReason: gate.blockedReason,
      nextAction: gate.nextAction,
      canonicalWriteEligibleNow: false,
      requiresConcreteProviderEvidenceLink: true,
      officialLikeProviders: row.officialLikeProviders || [],
      aggregatorProviders: row.aggregatorProviders || [],
      noiseProviders: row.noiseProviders || []
    };
  }).sort((a, b) => {
    if (a.gatePriority !== b.gatePriority) return a.gatePriority - b.gatePriority;
    if (b.reviewScore !== a.reviewScore) return b.reviewScore - a.reviewScore;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-standing-rows-present-truth-gate-board-file",
    mode: "source_only_standing_rows_present_truth_gate_board_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      truthReview: args.truthReview,
      inventory: args.inventory,
      sourceStandingRowsPresentCount: sourceRows.length
    },
    summary: {
      sourceStandingRowsPresentCount: sourceRows.length,
      gateRowCount: gateRows.length,
      gatePassNowCount: gateRows.filter((row) => row.gatePassNow).length,
      candidateForScopedTruthGateCount: gateRows.filter((row) => row.gateStatus === "candidate_for_scoped_truth_gate").length,
      blockedCount: gateRows.filter((row) => row.gateStatus === "blocked").length,
      needsNoiseIsolationCount: gateRows.filter((row) => row.gateStatus === "needs_noise_isolation").length,
      needsExpectedCountConfirmationCount: gateRows.filter((row) => row.gateStatus === "needs_expected_count_confirmation").length,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        gateRows.some((row) => row.gateStatus === "candidate_for_scoped_truth_gate")
          ? "build_concrete_provider_evidence_link_board_for_candidate_truth_gate_rows"
          : "repair_expected_counts_or_provider_evidence_before_truth_gate"
    },
    counts: {
      byGateLane: countBy(gateRows, "gateLane"),
      byGateStatus: countBy(gateRows, "gateStatus"),
      byCompetitionType: countBy(gateRows, "competitionType"),
      byBlockedReason: countBy(gateRows.filter((row) => row.blockedReason), "blockedReason")
    },
    guardrails: [
      "This board does not write canonical data.",
      "gatePassNow is false for every row until concrete provider evidence is linked.",
      "Expected row count match is necessary but not sufficient.",
      "Official-like provider presence is a pointer, not truth.",
      "No broad search or fetch is performed."
    ],
    gateRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    sourceStandingRowsPresentCount: output.summary.sourceStandingRowsPresentCount,
    gateRowCount: output.summary.gateRowCount,
    candidateForScopedTruthGateCount: output.summary.candidateForScopedTruthGateCount,
    blockedCount: output.summary.blockedCount,
    needsNoiseIsolationCount: output.summary.needsNoiseIsolationCount,
    needsExpectedCountConfirmationCount: output.summary.needsExpectedCountConfirmationCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
