#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_LOOP =
  "data/football-truth/_diagnostics/autonomous-competition-resolution-loop-2026-06-13/autonomous-competition-resolution-loop-2026-06-13.json";

const DEFAULT_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const OFFICIAL_HINTS = [
  "official",
  "league",
  "federation",
  "association",
  "bundesliga",
  "laliga",
  "proleague",
  "rbfa",
  "afa.com.ar",
  "the-afc.com",
  "uefa.com",
  "fifa.com",
  "cafonline.com",
  "concacaf.com",
  "conmebol.com",
  "ofcfootball.com",
  "palloliitto",
  "ksi.is",
  "loi",
  "spfl",
  "hnl.hr",
  "hns",
  "semafor"
];

const NOISE_HINTS = [
  "porn",
  "xhamster",
  "xnxx",
  "xvideos",
  "bokep",
  "jav",
  "missav",
  "reddit.com",
  "wikihow.com",
  "support.microsoft.com",
  "microsoft.com",
  "office.com",
  "google.com",
  "accounts.google.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "amazon.",
  "ebay.",
  "booking.com",
  "tripadvisor",
  "expedia",
  "hotels.com",
  "stackoverflow.com",
  "zhihu.com"
];

const AGGREGATOR_HINTS = [
  "flashscore",
  "sofascore",
  "soccerway",
  "globalsportsarchive",
  "espn",
  "fbref",
  "livesport",
  "futbol24",
  "365scores",
  "aiscore",
  "scorebat",
  "footystats",
  "transfermarkt"
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    loop: DEFAULT_LOOP,
    inventory: DEFAULT_INVENTORY,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--loop") args.loop = argv[++i];
    else if (arg === "--inventory") args.inventory = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `autonomous-truth-review-board-${args.date}`,
      `autonomous-truth-review-board-${args.date}.json`
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

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function hasAnyHint(value, hints) {
  const text = normalize(value);
  return hints.some((hint) => text.includes(hint));
}

function classifyProvider(provider) {
  const p = normalize(provider);

  if (!p || p === "unknown") return "unknown";
  if (hasAnyHint(p, NOISE_HINTS)) return "noise";
  if (hasAnyHint(p, OFFICIAL_HINTS)) return "official_like";
  if (hasAnyHint(p, AGGREGATOR_HINTS)) return "aggregator";
  return "other";
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    const key = value || "__missing__";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function scoreRow(row, inventoryRow) {
  const providerClasses = (inventoryRow.providers || []).map(classifyProvider);

  const officialLikeCount = providerClasses.filter((x) => x === "official_like").length;
  const aggregatorCount = providerClasses.filter((x) => x === "aggregator").length;
  const noiseCount = providerClasses.filter((x) => x === "noise").length;
  const unknownCount = providerClasses.filter((x) => x === "unknown").length;

  const signalScore =
    Number(row.standingSignals || 0) +
    Number(row.fixtureSignals || 0) +
    Number(row.cupWinnerSignals || 0) * 25;

  const canonicalScore =
    Number(row.canonicalStandingRows || 0) * 20 +
    Number(row.canonicalFixtureRows || 0) * 5 +
    (row.cupWinnerState ? 100 : 0);

  const providerScore =
    officialLikeCount * 60 +
    aggregatorCount * 15 -
    noiseCount * 25 -
    unknownCount * 5;

  return signalScore + canonicalScore + providerScore;
}

function inferReviewLane(row, inventoryRow, score) {
  const type = row.competitionType;
  const officialLikeProviders = (inventoryRow.providers || []).filter((p) => classifyProvider(p) === "official_like");
  const aggregatorProviders = (inventoryRow.providers || []).filter((p) => classifyProvider(p) === "aggregator");
  const noiseProviders = (inventoryRow.providers || []).filter((p) => classifyProvider(p) === "noise");

  if (type === "league" && row.canonicalStandingRows > 0) {
    return {
      reviewLane: "standing_rows_present_needs_truth_gate",
      reviewPriority: 10,
      nextAction: "inspect_existing_canonical_standing_rows_against_provider_evidence_before_write_gate"
    };
  }

  if (type === "league" && officialLikeProviders.length > 0 && row.standingSignals > 0) {
    return {
      reviewLane: "official_like_provider_standing_signal",
      reviewPriority: 20,
      nextAction: "build_scoped_truth_evidence_review_for_official_like_provider"
    };
  }

  if (type === "cup" && (row.cupWinnerSignals > 0 || row.cupWinnerState)) {
    return {
      reviewLane: "cup_winner_signal_review",
      reviewPriority: 30,
      nextAction: "build_cup_winner_truth_gate_review"
    };
  }

  if (officialLikeProviders.length > 0) {
    return {
      reviewLane: "official_like_provider_needs_evidence_review",
      reviewPriority: 40,
      nextAction: "review_official_like_provider_signals_before_new_discovery"
    };
  }

  if (aggregatorProviders.length > 0 && noiseProviders.length === 0) {
    return {
      reviewLane: "aggregator_only_signal_review",
      reviewPriority: 60,
      nextAction: "use_aggregator_only_as_pointer_not_truth_find_independent_or_official_evidence"
    };
  }

  if (score > 300) {
    return {
      reviewLane: "high_signal_mixed_quality_review",
      reviewPriority: 70,
      nextAction: "separate_noise_from_possible_truth_signals_before_any_fetch_or_write"
    };
  }

  return {
    reviewLane: "low_quality_signal_review",
    reviewPriority: 90,
    nextAction: "deprioritize_until_better_source_index_or_official_host_strategy_exists"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const loop = readJson(args.loop);
  const inventory = readJson(args.inventory);

  if (!Array.isArray(loop.resolutionRows)) throw new Error("Expected loop.resolutionRows array.");
  if (!Array.isArray(inventory.rows)) throw new Error("Expected inventory.rows array.");

  const inventoryBySlug = new Map(inventory.rows.map((row) => [row.competitionSlug, row]));

  const sourceRows = loop.resolutionRows.filter((row) =>
    row &&
    row.lane === "truth_review_batch" &&
    row.status === "needs_truth_review"
  );

  const reviewRows = sourceRows.map((row) => {
    const inventoryRow = inventoryBySlug.get(row.competitionSlug) || {};
    const providers = Array.isArray(inventoryRow.providers) ? inventoryRow.providers : [];
    const providerClasses = providers.map((provider) => ({
      provider,
      providerClass: classifyProvider(provider)
    }));

    const score = scoreRow(row, inventoryRow);
    const lane = inferReviewLane(row, inventoryRow, score);

    const officialLikeProviders = providerClasses
      .filter((x) => x.providerClass === "official_like")
      .map((x) => x.provider);

    const aggregatorProviders = providerClasses
      .filter((x) => x.providerClass === "aggregator")
      .map((x) => x.provider);

    const noiseProviders = providerClasses
      .filter((x) => x.providerClass === "noise")
      .map((x) => x.provider);

    return {
      competitionSlug: row.competitionSlug,
      competitionType: row.competitionType,
      inventoryBucket: row.inventoryBucket,
      providerCount: providers.length,
      officialLikeProviderCount: officialLikeProviders.length,
      aggregatorProviderCount: aggregatorProviders.length,
      noiseProviderCount: noiseProviders.length,
      standingSignals: row.standingSignals,
      fixtureSignals: row.fixtureSignals,
      cupWinnerSignals: row.cupWinnerSignals,
      canonicalStandingRows: row.canonicalStandingRows,
      canonicalFixtureRows: row.canonicalFixtureRows,
      cupWinnerState: row.cupWinnerState,
      promoted: row.promoted,
      reviewScore: score,
      reviewLane: lane.reviewLane,
      reviewPriority: lane.reviewPriority,
      nextAction: lane.nextAction,
      writeEligibleNow: false,
      requiresDedicatedTruthGate: true,
      officialLikeProviders: officialLikeProviders.slice(0, 20),
      aggregatorProviders: aggregatorProviders.slice(0, 20),
      noiseProviders: noiseProviders.slice(0, 20),
      sampleProviders: providers.slice(0, 30)
    };
  }).sort((a, b) => {
    if (a.reviewPriority !== b.reviewPriority) return a.reviewPriority - b.reviewPriority;
    if (b.reviewScore !== a.reviewScore) return b.reviewScore - a.reviewScore;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-autonomous-truth-review-board-file",
    mode: "source_only_truth_review_board_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      loop: args.loop,
      inventory: args.inventory,
      sourceTruthReviewRowCount: sourceRows.length
    },
    summary: {
      sourceTruthReviewRowCount: sourceRows.length,
      reviewRowCount: reviewRows.length,
      writeEligibleNowCount: 0,
      dedicatedTruthGateRequiredCount: reviewRows.length,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane:
        reviewRows.some((row) => row.reviewLane === "standing_rows_present_needs_truth_gate")
          ? "build_standing_rows_present_truth_gate_for_highest_priority_review_rows"
          : "review_official_like_provider_signal_rows_first"
    },
    counts: {
      byReviewLane: countBy(reviewRows.map((row) => row.reviewLane)),
      byCompetitionType: countBy(reviewRows.map((row) => row.competitionType))
    },
    guardrails: [
      "This board reviews existing signals only.",
      "It does not fetch or search.",
      "Aggregator providers are pointers, not truth.",
      "Noise providers are explicitly counted to avoid false confidence.",
      "writeEligibleNow is always false until a dedicated truth gate job validates concrete evidence."
    ],
    reviewRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    sourceTruthReviewRowCount: output.summary.sourceTruthReviewRowCount,
    reviewRowCount: output.summary.reviewRowCount,
    writeEligibleNowCount: output.summary.writeEligibleNowCount,
    dedicatedTruthGateRequiredCount: output.summary.dedicatedTruthGateRequiredCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
