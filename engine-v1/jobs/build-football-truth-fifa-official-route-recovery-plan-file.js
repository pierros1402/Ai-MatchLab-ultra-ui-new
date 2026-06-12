#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg === "--date") args.date = argv[++i] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function slugOf(row) {
  return asText(row?.competitionSlug || row?.leagueSlug || row?.slug);
}

function expectedTournamentKind(slug) {
  if (slug === "fifa.world_cup") return "mens_world_cup";
  if (slug === "fifa.club_world_cup") return "mens_club_world_cup";
  return "unknown_fifa_tournament";
}

function routeFamilyHintsFor(slug) {
  if (slug === "fifa.world_cup") {
    return [
      "official_tournament_home",
      "official_tournament_matches",
      "official_tournament_groups_or_standings",
      "official_tournament_dates_or_schedule",
      "official_qualifiers_or_final_tournament_context"
    ];
  }

  if (slug === "fifa.club_world_cup") {
    return [
      "official_tournament_home",
      "official_tournament_matches",
      "official_tournament_groups_or_standings",
      "official_tournament_dates_or_schedule"
    ];
  }

  return [
    "official_tournament_home",
    "official_tournament_matches",
    "official_tournament_dates_or_schedule"
  ];
}

function buildRouteRecoveryRows(fifaRows) {
  return fifaRows.map((row, index) => {
    const slug = slugOf(row);
    const tournamentKind = expectedTournamentKind(slug);

    return {
      routeRecoveryRowId: `fifa-official-route:${String(index + 1).padStart(3, "0")}`,
      competitionSlug: slug,
      leagueSlug: slug,
      competitionName: asText(row.competitionName),
      competitionType: asText(row.competitionType) || "continental_or_international",
      sourceLane: "fifa_official_lane",
      tournamentKind,
      officialHostCandidates: [
        "www.fifa.com",
        "inside.fifa.com"
      ],
      preferredOfficialHost: "www.fifa.com",
      routeFamilyHints: routeFamilyHintsFor(slug),
      requiredEvidence: {
        fifaOfficialCompetitionUrl: true,
        officialScheduleOrMatchCentre: true,
        tournamentDateWindow: true,
        qualifierOrFinalTournamentStartDate: slug === "fifa.world_cup",
        groupOrStandingsStructure: true,
        secondaryReferenceAllowedForComparisonOnly: true
      },
      recoveryPolicy: {
        noGenericSearchRetry: true,
        officialHostScopedOnly: true,
        routeProbeRequiredBeforeTruth: true,
        routeProbeDoesNotEqualTruth: true,
        zeroSearchResultDoesNotImplyAbsence: true,
        noCanonicalWriteFromThisPlan: true
      },
      nextRequiredAction: "build_fifa_official_route_probe_fetch_input_after_explicit_allow_fetch",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  });
}

function buildPlan(input, options = {}) {
  const batchRows = asArray(input.batchRows);
  const fifaRows = batchRows.filter((row) => asText(row.lane) === "fifa_official_lane");

  const invalidRows = fifaRows.filter((row) => {
    const slug = slugOf(row);
    return !["fifa.world_cup", "fifa.club_world_cup"].includes(slug);
  });

  if (invalidRows.length) {
    throw new Error(`Unsupported FIFA lane slugs: ${invalidRows.map(slugOf).join(", ")}`);
  }

  const routeRecoveryRows = buildRouteRecoveryRows(fifaRows);

  return {
    ok: true,
    job: "build-football-truth-fifa-official-route-recovery-plan-file",
    mode: "read_only_fifa_official_route_recovery_plan",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    sourceBatchId: asText(input.batchId),
    summary: {
      sourceBatchRowCount: batchRows.length,
      fifaOfficialLaneInputRowCount: fifaRows.length,
      routeRecoveryRowCount: routeRecoveryRows.length,
      officialHostCandidateCount: [...new Set(routeRecoveryRows.flatMap((row) => row.officialHostCandidates))].length,
      worldCupRouteRecoveryRows: routeRecoveryRows.filter((row) => row.competitionSlug === "fifa.world_cup").length,
      clubWorldCupRouteRecoveryRows: routeRecoveryRows.filter((row) => row.competitionSlug === "fifa.club_world_cup").length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    routeRecoveryRows,
    officialHostPolicy: {
      preferredOfficialHost: "www.fifa.com",
      fallbackOfficialHost: "inside.fifa.com",
      insideFifaIsContextOnlyUnlessRouteValidatesCompetition: true,
      secondaryReferencesCannotPromoteCanonical: true,
      noSearchProviderRetryFromThisPlan: true
    },
    nextStagePlan: {
      routeProbeFetchInput: "build scoped FIFA official route probe fetch input with explicit allow-fetch only",
      truthReview: "require normalized official schedule/date/group evidence before activity or restart canonical state",
      dailyFixtureGate: "blocked until FIFA official route truth review passes"
    },
    policy: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromThisPlan: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true,
      productionWrite: false,
      dryRun: true
    },
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
  const report = buildPlan({
    batchId: "self",
    batchRows: [
      {
        lane: "fifa_official_lane",
        competitionSlug: "fifa.world_cup",
        competitionName: "FIFA World Cup",
        competitionType: "continental_or_international"
      },
      {
        lane: "fifa_official_lane",
        competitionSlug: "fifa.club_world_cup",
        competitionName: "FIFA Club World Cup",
        competitionType: "continental_or_international"
      }
    ]
  }, { date: "2026-06-12" });

  if (report.summary.routeRecoveryRowCount !== 2) throw new Error("expected two FIFA recovery rows");
  if (report.summary.worldCupRouteRecoveryRows !== 1) throw new Error("expected one World Cup row");
  if (report.summary.clubWorldCupRouteRecoveryRows !== 1) throw new Error("expected one Club World Cup row");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-official-route-recovery-plan-file",
      summary: report.summary,
      routeRecoveryRows: report.routeRecoveryRows,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildPlan(readJson(args.input), { date: args.date });
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
    job: "build-football-truth-fifa-official-route-recovery-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}