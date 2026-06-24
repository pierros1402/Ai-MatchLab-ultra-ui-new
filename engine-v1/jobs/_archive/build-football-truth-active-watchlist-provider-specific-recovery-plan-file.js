import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    routeBoard: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = asText(argv[i]);

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--input") {
      args.input = asText(argv[++i]);
      continue;
    }

    if (arg === "--route-board") {
      args.routeBoard = asText(argv[++i]);
      continue;
    }

    if (arg === "--output") {
      args.output = asText(argv[++i]);
      continue;
    }

    if (arg === "--date") {
      args.date = asText(argv[++i]);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

const PROVIDER_LANES = {
  "fin.1": {
    providerRecoveryLane: "existing_finnish_palloliitto_torneopal_normalized_lane",
    knownJobs: [
      "engine-v1/jobs/build-uefa-torneopal-normalized-rows-file.js"
    ],
    reason: "generic official probe pages are accessible but JS/shell-like and no structured date evidence was extracted"
  },
  "fin.2": {
    providerRecoveryLane: "existing_finnish_palloliitto_torneopal_normalized_lane",
    knownJobs: [
      "engine-v1/jobs/build-uefa-torneopal-normalized-rows-file.js"
    ],
    reason: "generic official probe pages are accessible but JS/shell-like and no structured date evidence was extracted"
  },
  "irl.1": {
    providerRecoveryLane: "existing_loi_fai_ajax_normalized_lane",
    knownJobs: [
      "engine-v1/jobs/build-uefa-loi-ajax-normalized-rows-file.js"
    ],
    reason: "FAI matches page is accessible but generic HTML text has no structured date evidence; use known LOI lane"
  },
  "irl.2": {
    providerRecoveryLane: "existing_loi_fai_ajax_normalized_lane",
    knownJobs: [
      "engine-v1/jobs/build-uefa-loi-ajax-normalized-rows-file.js"
    ],
    reason: "FAI matches page is accessible but generic HTML text has no structured date evidence; use known LOI lane"
  },
  "isl.1": {
    providerRecoveryLane: "existing_ksi_tournament_normalized_lane",
    knownJobs: [
      "engine-v1/jobs/build-uefa-ksi-tournament-normalized-season-state-file.js"
    ],
    reason: "generic KSI /matches/fixtures/schedule/results routes returned no accessible official route; use known KSI tournament route lane"
  },
  "isl.2": {
    providerRecoveryLane: "specific_ksi_tournament_route_discovery_needed",
    knownJobs: [
      "engine-v1/jobs/build-uefa-ksi-tournament-normalized-season-state-file.js"
    ],
    reason: "no strict evidence-derived candidate host/route selected yet for isl.2; recover KSI tournament id before extraction"
  },
  "per.1": {
    providerRecoveryLane: "specific_liga1_official_route_or_adapter_repair_needed",
    knownJobs: [],
    reason: "Liga1 generic route probes returned 404; needs source-level official route repair, not generic search"
  },
  "per.2": {
    providerRecoveryLane: "official_host_and_route_discovery_needed",
    knownJobs: [],
    reason: "no strict evidence-derived candidate official host selected yet for Peru Liga 2"
  }
};

function stateFromStructured(row) {
  const state = asText(row?.structuredActivityState);
  if (!state) return "not_in_structured_board";
  return state;
}

function buildPlan(structuredReport, routeBoardReport, date) {
  const structuredRows = asArray(structuredReport?.leagueStructuredRows);
  const structuredBySlug = new Map(structuredRows.map((row) => [asText(row.leagueSlug || row.competitionSlug), row]));

  const routeRows = asArray(routeBoardReport?.leagueEvidenceRows);
  const routeBySlug = new Map(routeRows.map((row) => [asText(row.leagueSlug || row.competitionSlug), row]));

  const targetSlugs = Object.keys(PROVIDER_LANES).sort();

  const recoveryRows = targetSlugs.map((slug) => {
    const lane = PROVIDER_LANES[slug];
    const structured = structuredBySlug.get(slug) || null;
    const route = routeBySlug.get(slug) || null;

    let recoveryPriority = "medium";
    if (["fin.1", "fin.2", "irl.1", "irl.2"].includes(slug)) recoveryPriority = "high";
    if (["isl.1", "per.1"].includes(slug)) recoveryPriority = "high";
    if (["isl.2", "per.2"].includes(slug)) recoveryPriority = "medium";

    return {
      competitionSlug: slug,
      leagueSlug: slug,
      providerRecoveryLane: lane.providerRecoveryLane,
      knownJobs: lane.knownJobs,
      recoveryPriority,
      routeProbeState: asText(route?.routeProbeState || "not_in_route_probe_board"),
      activityEvidenceState: asText(route?.activityEvidenceState || "not_in_route_probe_board"),
      structuredActivityState: stateFromStructured(structured),
      eventCandidateCount: Number(structured?.eventCandidateCount || 0),
      http200Count: Number(structured?.http200Count || route?.http200Count || 0),
      accessibleHosts: asArray(route?.accessibleHosts),
      accessibleUrls: asArray(route?.accessibleUrls),
      reason: lane.reason,
      recommendedNextAction: lane.knownJobs.length > 0
        ? "run_existing_provider_normalized_lane_read_only_or_build_lane_input_selector"
        : "build_specific_official_route_repair_plan_read_only",
      allowedNextStepType: "read_only_provider_specific_recovery",
      blockedNextSteps: [
        "generic_search_retry",
        "canonical_promotion",
        "daily_fixture_acquisition",
        "production_write"
      ],
      mayPromoteCanonical: false,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const byProviderRecoveryLane = {};
  const byRecommendedNextAction = {};

  for (const row of recoveryRows) {
    byProviderRecoveryLane[row.providerRecoveryLane] = (byProviderRecoveryLane[row.providerRecoveryLane] || 0) + 1;
    byRecommendedNextAction[row.recommendedNextAction] = (byRecommendedNextAction[row.recommendedNextAction] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-provider-specific-recovery-plan-file",
    mode: "read_only_provider_specific_activity_recovery_plan",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummaries: {
      structuredActivityEvidence: structuredReport?.summary || {},
      routeProbeActivityEvidence: routeBoardReport?.summary || {}
    },
    summary: {
      recoveryCompetitionCount: recoveryRows.length,
      existingProviderLaneCount: recoveryRows.filter((row) => row.knownJobs.length > 0).length,
      specificRouteRepairNeededCount: recoveryRows.filter((row) => row.knownJobs.length === 0).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byProviderRecoveryLane,
      byRecommendedNextAction
    },
    recoveryRows,
    policy: {
      noGenericSearchRetry: true,
      searchProviderAlreadyFailedGate: true,
      routeProbeDoesNotEqualTruth: true,
      providerLaneOutputStillRequiresValidation: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromRecoveryPlan: true,
      noFetchInThisJob: true
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
  const report = buildPlan(
    {
      summary: {},
      leagueStructuredRows: [
        { leagueSlug: "fin.1", structuredActivityState: "activity_terms_found_but_no_date_structure", eventCandidateCount: 0, http200Count: 4 }
      ]
    },
    {
      summary: {},
      leagueEvidenceRows: [
        { leagueSlug: "fin.1", routeProbeState: "official_route_accessible", activityEvidenceState: "official_route_accessible_but_activity_not_yet_proven", accessibleHosts: ["x"], accessibleUrls: ["https://x.test"] }
      ]
    },
    "2026-06-12"
  );

  if (report.summary.recoveryCompetitionCount !== 8) throw new Error("expected 8 recovery competitions");
  if (report.recoveryRows.find((row) => row.competitionSlug === "fin.1")?.knownJobs.length < 1) throw new Error("fin.1 should use existing lane");
  if (report.guarantees.noFetch !== true) throw new Error("plan builder must not fetch");
  if (report.summary.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-provider-specific-recovery-plan-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.routeBoard) throw new Error("--route-board is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildPlan(readJson(args.input), readJson(args.routeBoard), args.date);
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
    job: "build-football-truth-active-watchlist-provider-specific-recovery-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}