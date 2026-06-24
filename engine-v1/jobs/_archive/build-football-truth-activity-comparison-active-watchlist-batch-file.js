import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    output: "",
    date: "",
    selfTest: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++index] || "";
      continue;
    }

    if (arg === "--date") {
      args.date = argv[++index] || "";
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

const WATCHLIST = [
  {
    competitionSlug: "irl.1",
    displayName: "League of Ireland Premier Division",
    countryCode: "irl",
    countryName: "Ireland",
    region: "europe",
    competitionType: "league",
    tier: 2,
    trust: 0.80,
    seedReason: "user_active_watchlist_league_of_ireland"
  },
  {
    competitionSlug: "irl.2",
    displayName: "League of Ireland First Division",
    countryCode: "irl",
    countryName: "Ireland",
    region: "europe",
    competitionType: "league",
    tier: 3,
    trust: 0.68,
    seedReason: "user_active_watchlist_league_of_ireland"
  },
  {
    competitionSlug: "isl.1",
    displayName: "Icelandic Besta deild karla",
    countryCode: "isl",
    countryName: "Iceland",
    region: "europe",
    competitionType: "league",
    tier: 2,
    trust: 0.80,
    seedReason: "user_active_watchlist_iceland_ksi"
  },
  {
    competitionSlug: "isl.2",
    displayName: "Icelandic 1. deild karla",
    countryCode: "isl",
    countryName: "Iceland",
    region: "europe",
    competitionType: "league",
    tier: 3,
    trust: 0.68,
    seedReason: "user_active_watchlist_iceland_ksi"
  },
  {
    competitionSlug: "fin.1",
    displayName: "Veikkausliiga",
    countryCode: "fin",
    countryName: "Finland",
    region: "europe",
    competitionType: "league",
    tier: 1,
    trust: 0.86,
    seedReason: "user_active_watchlist_finland"
  },
  {
    competitionSlug: "fin.2",
    displayName: "Ykkosliiga",
    countryCode: "fin",
    countryName: "Finland",
    region: "europe",
    competitionType: "league",
    tier: 2,
    trust: 0.76,
    seedReason: "user_active_watchlist_ykkosliiga"
  },
  {
    competitionSlug: "per.1",
    displayName: "Peru Primera División",
    countryCode: "per",
    countryName: "Peru",
    region: "americas",
    competitionType: "league",
    tier: 3,
    trust: 0.70,
    seedReason: "user_active_watchlist_peru"
  },
  {
    competitionSlug: "per.2",
    displayName: "Peru Liga 2",
    countryCode: "per",
    countryName: "Peru",
    region: "americas",
    competitionType: "league",
    tier: 3,
    trust: 0.62,
    seedReason: "user_active_watchlist_peru"
  },
  {
    competitionSlug: "fifa.club_world_cup",
    displayName: "FIFA Club World Cup",
    countryCode: "int",
    countryName: "International",
    region: "world",
    competitionType: "global",
    tier: 1,
    trust: 0.90,
    seedReason: "user_active_watchlist_fifa_world_competition"
  },
  {
    competitionSlug: "fifa.world_cup",
    displayName: "FIFA World Cup",
    countryCode: "int",
    countryName: "International",
    region: "world",
    competitionType: "global",
    tier: 1,
    trust: 0.90,
    seedReason: "user_active_watchlist_fifa_world_cup_custom_unmapped"
  }
];

function buildTargetRows({ date }) {
  const rows = [];

  for (const item of WATCHLIST) {
    for (const layer of ["primary_official_truth", "secondary_reference_comparison"]) {
      rows.push({
        competitionSlug: item.competitionSlug,
        countryCode: item.countryCode,
        countryName: item.countryName,
        region: item.region,
        competitionType: item.competitionType,
        displayName: item.displayName,
        tier: item.tier,
        trust: item.trust,
        dayKey: date,
        comparisonLayer: layer,
        expectedSourceFamily: layer === "primary_official_truth"
          ? "official_league_federation_or_competition_operator"
          : "reliable_sports_reference_site",
        query: layer === "primary_official_truth"
          ? `"${item.displayName}" ${item.countryName} football official fixtures standings results schedule season status`
          : `"${item.displayName}" ${item.countryName} football fixtures standings results schedule Soccerway Flashscore Sofascore FotMob Transfermarkt`,
        sourceUse: layer === "primary_official_truth"
          ? "truth_required_before_daily_fixture_fetch"
          : "comparison_only_not_canonical_truth",
        seedReason: item.seedReason,
        activeWatchlistCandidate: true,
        mayPromoteCanonical: false,
        canonicalWrites: 0,
        productionWrite: false,
        dryRun: true
      });
    }
  }

  return rows;
}

function buildBatch({ date }) {
  const selectedCompetitionRows = WATCHLIST.map((item) => ({
    ...item,
    activeWatchlistCandidate: true,
    selectedBy: "forced_active_watchlist_batch_002",
    selectionTruthStatus: "candidate_requires_official_and_secondary_verification",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  }));

  const selectedTargetRows = buildTargetRows({ date });
  const byRegion = {};
  const byType = {};
  const byCountry = {};

  for (const row of selectedCompetitionRows) {
    byRegion[row.region] = (byRegion[row.region] || 0) + 1;
    byType[row.competitionType] = (byType[row.competitionType] || 0) + 1;
    byCountry[row.countryName] = (byCountry[row.countryName] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-activity-comparison-active-watchlist-batch-file",
    mode: "read_only_active_watchlist_activity_comparison_batch",
    generatedAt: new Date().toISOString(),
    date,
    summary: {
      selectedCompetitionCount: selectedCompetitionRows.length,
      selectedTargetRowCount: selectedTargetRows.length,
      officialTruthTargetCount: selectedTargetRows.filter((row) => row.comparisonLayer === "primary_official_truth").length,
      secondaryReferenceComparisonTargetCount: selectedTargetRows.filter((row) => row.comparisonLayer === "secondary_reference_comparison").length,
      activeWatchlistCandidateCount: selectedCompetitionRows.length,
      customUnmappedCompetitionCount: selectedCompetitionRows.filter((row) => row.competitionSlug === "fifa.world_cup").length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    byRegion,
    byType,
    byCountry,
    policy: {
      forcedWatchlistDoesNotEqualTruth: true,
      userKnownActivityIsPriorForSearchOnly: true,
      officialAndSecondaryVerificationRequired: true,
      secondaryReferenceMayNotPromoteCanonical: true,
      noFetch: true,
      noCanonicalPromotion: true,
      zeroResultDoesNotImplyAbsence: true
    },
    selectedCompetitionRows,
    selectedTargetRows,
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
  const report = buildBatch({ date: "2026-06-12" });

  if (report.summary.selectedCompetitionCount !== 10) throw new Error("expected ten watchlist competitions");
  if (report.summary.selectedTargetRowCount !== 20) throw new Error("expected paired targets");
  if (report.summary.customUnmappedCompetitionCount !== 1) throw new Error("expected one custom unmapped competition");
  if (report.guarantees.noSearch !== true || report.guarantees.noFetch !== true) throw new Error("expected read-only guarantees");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-activity-comparison-active-watchlist-batch-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.output) throw new Error("--output is required");

  const report = buildBatch({ date: args.date });
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
    job: "build-football-truth-activity-comparison-active-watchlist-batch-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}