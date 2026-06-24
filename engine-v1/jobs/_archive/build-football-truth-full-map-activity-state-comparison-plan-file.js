import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    fullMap: "",
    currentBoard: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--full-map") {
      args.fullMap = argv[++i] || "";
      continue;
    }

    if (arg === "--current-board") {
      args.currentBoard = argv[++i] || "";
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++i] || "";
      continue;
    }

    if (arg === "--date") {
      args.date = argv[++i] || "";
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function selectRows(obj, names) {
  for (const name of names) {
    if (Array.isArray(obj?.[name])) return obj[name];
  }
  return [];
}

function competitionSlugOf(row) {
  return asText(row.competitionSlug || row.leagueSlug || row.slug);
}

function competitionTypeOf(row) {
  return asText(row.competitionType || row.type);
}

function isSuppressed(row) {
  return asText(row.inventoryBucket) === "suppressed_low_value_no_active_work";
}

function isLeagueOrCup(row) {
  const type = competitionTypeOf(row);
  return type === "league" || type === "cup";
}

function countryCodeFromSlug(slug) {
  const text = asText(slug);
  const idx = text.indexOf(".");
  return idx > 0 ? text.slice(0, idx) : text;
}

function estimatePriority(row) {
  const type = competitionTypeOf(row);
  const bucket = asText(row.inventoryBucket);
  const fixtureSignals = Number(row.fixtureSignals || 0);
  const standingSignals = Number(row.standingSignals || 0);
  const canonicalFixtureRows = Number(row.canonicalFixtureRows || 0);
  const canonicalStandingRows = Number(row.canonicalStandingRows || 0);
  const providerCount = Number(row.providerCount || 0);

  let score = 0;

  if (type === "league") score += 1000;
  if (type === "cup") score += 500;

  if (bucket === "signals_available_needs_truth_review") score += 500;
  if (bucket === "full_map_missing_required_data") score += 250;
  if (bucket === "discovered_no_actionable_signal") score += 50;

  score += Math.min(fixtureSignals, 500);
  score += Math.min(standingSignals, 300);
  score += Math.min(canonicalFixtureRows, 300);
  score += Math.min(canonicalStandingRows, 200);
  score += Math.min(providerCount, 100);

  return score;
}

function internalStateFromCurrentBoard(row) {
  const seasonState = asText(row.seasonState);

  if (seasonState === "active") {
    return "internal_known_active";
  }

  if (seasonState === "completed_cup" || seasonState === "completed_or_results_only") {
    return "internal_known_completed_or_results_only";
  }

  if (seasonState === "blocked") {
    return "internal_blocked_provider_contract";
  }

  if (seasonState === "unknown_or_partial") {
    return "internal_known_partial_needs_review";
  }

  return "internal_known_other";
}

function nextActionForKnown(row) {
  const seasonState = asText(row.seasonState);

  if (seasonState === "active") {
    return "compare_active_state_against_official_and_reliable_reference_before_daily_fixture_fetch";
  }

  if (seasonState === "completed_cup" || seasonState === "completed_or_results_only") {
    return "compare_completed_or_offseason_state_for_restart_watch";
  }

  if (seasonState === "blocked") {
    return "provider_contract_repair_before_activity_comparison";
  }

  return "manual_truth_review_before_daily_fixture_fetch";
}

function buildKnownRow(row, date) {
  const slug = competitionSlugOf(row);
  return {
    competitionSlug: slug,
    countryCode: countryCodeFromSlug(slug),
    competitionType: "",
    providerId: asText(row.providerId),
    seasonState: asText(row.seasonState),
    internalActivityState: internalStateFromCurrentBoard(row),
    hasCanonicalFixtures: row.hasCanonicalFixtures === true,
    canonicalFixtureRows: Number(row.canonicalFixtureRows || 0),
    canonicalFixtureFinishedRows: Number(row.canonicalFixtureFinishedRows || 0),
    canonicalFixtureScheduledRows: Number(row.canonicalFixtureScheduledRows || 0),
    hasCanonicalStandings: row.hasCanonicalStandings === true,
    canonicalStandingsRows: Number(row.canonicalStandingsRows || 0),
    hasCupWinnerFinalState: row.hasCupWinnerFinalState === true,
    providerCapabilityStatus: asText(row.providerCapabilityStatus),
    providerPromotionStatus: asText(row.providerPromotionStatus),
    nextAllowedAction: asText(row.nextAllowedAction),
    comparisonNeed: "verify_internal_state_against_official_or_reliable_reference",
    nextAction: nextActionForKnown(row),
    dayKey: date,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildUnknownRow(row, date) {
  const slug = competitionSlugOf(row);
  const type = competitionTypeOf(row);
  const bucket = asText(row.inventoryBucket);
  const priorityScore = estimatePriority(row);

  const comparisonClass = type === "league"
    ? "league_activity_or_season_status_unknown"
    : "cup_activity_or_winner_status_unknown";

  return {
    competitionSlug: slug,
    countryCode: countryCodeFromSlug(slug),
    competitionType: type,
    inventoryBucket: bucket,
    fixtureSignals: Number(row.fixtureSignals || 0),
    standingSignals: Number(row.standingSignals || 0),
    cupWinnerSignals: Number(row.cupWinnerSignals || 0),
    canonicalFixtureRows: Number(row.canonicalFixtureRows || 0),
    canonicalStandingRows: Number(row.canonicalStandingRows || 0),
    providerCount: Number(row.providerCount || 0),
    internalActivityState: "internal_unknown",
    comparisonClass,
    priorityScore,
    officialTruthRequired: true,
    reliableReferenceComparisonAllowed: true,
    reliableReferenceMayNotPromoteCanonical: true,
    zeroResultDoesNotImplyAbsence: true,
    dayKey: date,
    nextAction: "build_official_and_reliable_reference_comparison_targets",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildComparisonTargets(row) {
  const slug = asText(row.competitionSlug);
  const countryCode = asText(row.countryCode);
  const type = asText(row.competitionType);
  const isCup = type === "cup";

  const targetBase = {
    competitionSlug: slug,
    countryCode,
    competitionType: type,
    dayKey: asText(row.dayKey),
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };

  const topic = isCup
    ? "football cup fixtures results winner final season status"
    : "football league fixtures standings season status active";

  return [
    {
      ...targetBase,
      comparisonLayer: "primary_official_truth",
      expectedSourceFamily: "official_league_federation_or_competition_operator",
      query: `${slug} ${topic} official site`,
      sourceUse: "truth_required_before_daily_fixture_fetch",
      mayPromoteCanonical: false
    },
    {
      ...targetBase,
      comparisonLayer: "secondary_reference_comparison",
      expectedSourceFamily: "reliable_sports_reference_site",
      query: `${slug} ${topic} Soccerway Flashscore Sofascore FotMob Transfermarkt`,
      sourceUse: "comparison_only_not_canonical_truth",
      mayPromoteCanonical: false
    }
  ];
}

function buildPlan({ fullMap, currentBoard, date }) {
  const fullRows = selectRows(fullMap, ["rows"]);
  const stateRows = selectRows(currentBoard, ["competitionStateBoard"]);

  const currentBySlug = new Map();
  for (const row of stateRows) {
    const slug = competitionSlugOf(row);
    if (slug) currentBySlug.set(slug, row);
  }

  const knownRows = [];
  const knownActiveRows = [];
  const knownNonActiveRows = [];
  const unknownRows = [];

  for (const row of stateRows) {
    const known = buildKnownRow(row, date);
    knownRows.push(known);

    if (asText(row.seasonState) === "active") {
      knownActiveRows.push(known);
    } else {
      knownNonActiveRows.push(known);
    }
  }

  for (const row of fullRows) {
    const slug = competitionSlugOf(row);
    if (!slug) continue;
    if (currentBySlug.has(slug)) continue;
    if (isSuppressed(row)) continue;
    if (!isLeagueOrCup(row)) continue;

    unknownRows.push(buildUnknownRow(row, date));
  }

  unknownRows.sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const comparisonTargetRows = [];
  for (const row of unknownRows) {
    comparisonTargetRows.push(...buildComparisonTargets(row));
  }

  const byKnownSeasonState = {};
  for (const row of stateRows) {
    const key = asText(row.seasonState) || "unknown";
    byKnownSeasonState[key] = (byKnownSeasonState[key] || 0) + 1;
  }

  const byUnknownCompetitionType = {};
  const byUnknownInventoryBucket = {};
  for (const row of unknownRows) {
    byUnknownCompetitionType[row.competitionType] = (byUnknownCompetitionType[row.competitionType] || 0) + 1;
    byUnknownInventoryBucket[row.inventoryBucket] = (byUnknownInventoryBucket[row.inventoryBucket] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-full-map-activity-state-comparison-plan-file",
    mode: "read_only_full_map_activity_state_comparison_plan",
    generatedAt: new Date().toISOString(),
    date,
    summary: {
      fullMapCompetitionCount: fullRows.length,
      currentBoardCompetitionCount: stateRows.length,
      knownCurrentStateCount: knownRows.length,
      knownActiveCount: knownActiveRows.length,
      knownNonActiveOrBlockedCount: knownNonActiveRows.length,
      unknownLeagueOrCupNotSuppressedCount: unknownRows.length,
      unknownLeagueCount: unknownRows.filter((row) => row.competitionType === "league").length,
      unknownCupCount: unknownRows.filter((row) => row.competitionType === "cup").length,
      comparisonTargetRowCount: comparisonTargetRows.length,
      officialTruthTargetCount: comparisonTargetRows.filter((row) => row.comparisonLayer === "primary_official_truth").length,
      secondaryReferenceComparisonTargetCount: comparisonTargetRows.filter((row) => row.comparisonLayer === "secondary_reference_comparison").length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byKnownSeasonState,
    byUnknownCompetitionType,
    byUnknownInventoryBucket,
    policy: {
      primaryTruth: "official league/federation/competition-operator source",
      secondaryReferenceComparisonOnly: "Soccerway/Flashscore/Sofascore/FotMob/Transfermarkt or similar reliable reference may be used only as comparison",
      secondaryMayNotPromoteCanonical: true,
      zeroResultDoesNotImplyAbsence: true,
      noDailyFixtureFetchUntilActivityStateKnown: true,
      noCanonicalPromotionFromComparisonPlan: true
    },
    knownRows,
    knownActiveRows,
    knownNonActiveRows,
    unknownRows,
    comparisonTargetRows,
    guarantees: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const fullMap = {
    rows: [
      { competitionSlug: "a.1", competitionType: "league", inventoryBucket: "signals_available_needs_truth_review", fixtureSignals: 5, standingSignals: 20, providerCount: 3 },
      { competitionSlug: "a.cup", competitionType: "cup", inventoryBucket: "full_map_missing_required_data", providerCount: 2 },
      { competitionSlug: "b.1", competitionType: "league", inventoryBucket: "suppressed_low_value_no_active_work" },
      { competitionSlug: "known.1", competitionType: "league", inventoryBucket: "signals_available_needs_truth_review" }
    ]
  };

  const currentBoard = {
    competitionStateBoard: [
      { competitionSlug: "known.1", seasonState: "active", providerId: "known_official", hasCanonicalFixtures: true, canonicalFixtureRows: 10 }
    ]
  };

  const report = buildPlan({ fullMap, currentBoard, date: "2026-06-12" });

  if (report.summary.knownActiveCount !== 1) throw new Error("expected one known active");
  if (report.summary.unknownLeagueOrCupNotSuppressedCount !== 2) throw new Error("expected two unknown unsuppressed");
  if (report.summary.comparisonTargetRowCount !== 4) throw new Error("expected two comparison targets per unknown row");
  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true) throw new Error("expected read-only guarantees");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-full-map-activity-state-comparison-plan-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.fullMap) throw new Error("--full-map is required");
  if (!args.currentBoard) throw new Error("--current-board is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildPlan({
    fullMap: readJson(args.fullMap),
    currentBoard: readJson(args.currentBoard),
    date: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-full-map-activity-state-comparison-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}