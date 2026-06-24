import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    includeIdentityOnly: true,
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg === "--strong-only") args.includeIdentityOnly = false;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asText(value) {
  return String(value ?? "").trim();
}

function normalizeHost(value) {
  return asText(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .toLowerCase();
}

function candidateUrlFor(row) {
  const bestUrl = asText(row.bestUrl);
  if (bestUrl) return bestUrl;

  const host = normalizeHost(row.bestHost);
  if (host) return `https://${host}/`;

  return "";
}

function probeModeFor(row) {
  if (row.taskType === "official_route_probe_from_strong_search_candidate") {
    return "probe_known_official_standings_route";
  }

  if (row.taskType === "official_identity_route_probe") {
    return "probe_official_identity_for_standings_route";
  }

  return "unsupported";
}

function buildProbeTarget(row, index) {
  const url = candidateUrlFor(row);
  const probeMode = probeModeFor(row);

  return {
    probeTargetId: `provider-discovery-route-probe:${row.leagueSlug}:${String(index + 1).padStart(3, "0")}`,
    targetType: "provider_discovery_route_probe",
    probeMode,
    leagueSlug: row.leagueSlug,
    competitionSlug: row.competitionSlug || row.leagueSlug,
    name: row.name || "",
    registryName: row.registryName || "",
    country: row.country || "",
    region: row.region || "",
    priority: row.priority ?? 0,
    sourceActionTaskType: row.taskType || "",
    sourceReviewBucket: row.reviewBucket || "",
    bestHost: row.bestHost || "",
    bestTitle: row.bestTitle || "",
    candidateUrl: url,
    sourceQuery: row.sourceQuery || "",
    expectedEvidence: [
      "official source identity",
      "competition identity match",
      "season/current-state marker",
      "standings/table availability or explicit official no-standings state"
    ],
    rejectIf: [
      "aggregator-only source",
      "social/reference/travel/account/help-site result",
      "national-team-only result",
      "fixture-only result without standings/table evidence",
      "stale season without season marker",
      "wrong competition/country identity"
    ],
    routeProbeContract: {
      fetchAllowedOnlyInNextRunner: true,
      promotionAllowed: false,
      confidenceFloorForPromotionCandidate: 0.8,
      requiredConvergence: [
        "official host or official federation/association identity",
        "target competition identity",
        "current/season-specific standings route",
        "non-aggregator source"
      ],
      outputMustCarry: [
        "value",
        "confidence",
        "source convergence",
        "metadata",
        "provider/source route",
        "rejection reason if no valid official route found"
      ]
    },
    sourceFetch: false,
    noFetch: true,
    noSearch: true,
    noUrlFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildRouteProbeTargets(plan, options = {}) {
  const includeIdentityOnly = options.includeIdentityOnly !== false;

  const officialRouteProbeRows = asArray(plan.officialRouteProbeTargets);
  const identityRouteProbeRows = includeIdentityOnly ? asArray(plan.identityRouteProbeTargets) : [];

  const selectedRows = [
    ...officialRouteProbeRows,
    ...identityRouteProbeRows
  ];

  const probeTargets = selectedRows.map(buildProbeTarget);

  const missingUrlTargets = probeTargets.filter((row) => !row.candidateUrl);
  const byProbeMode = {};
  const byPriority = {};

  for (const row of probeTargets) {
    byProbeMode[row.probeMode] = (byProbeMode[row.probeMode] || 0) + 1;
    byPriority[String(row.priority)] = (byPriority[String(row.priority)] || 0) + 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceActionPlanSummary: plan.summary || {},
    summary: {
      sourceActionRowCount: plan.summary?.actionRowCount ?? null,
      routeProbeTargetCount: probeTargets.length,
      officialRouteProbeTargetCount: officialRouteProbeRows.length,
      identityRouteProbeTargetCount: identityRouteProbeRows.length,
      missingCandidateUrlCount: missingUrlTargets.length,
      byProbeMode,
      byPriority,
      sourceFetch: false,
      noFetch: true,
      noSearch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    nextRecommendedAction: {
      type: "provider_discovery_route_probe_runner",
      targetCount: probeTargets.length,
      firstTargets: probeTargets.slice(0, 10).map((row) => ({
        leagueSlug: row.leagueSlug,
        probeMode: row.probeMode,
        candidateUrl: row.candidateUrl,
        bestHost: row.bestHost
      })),
      note: "Targets are ready for a controlled fetch/probe runner. Do not promote; only validate official routes."
    },
    probeTargets,
    missingUrlTargets,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noSearch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      promotionBlockedUntilValidated: true
    }
  };
}

function validateReport(report) {
  if (!report.ok) throw new Error("Route probe target report is not ok");

  if (report.summary.routeProbeTargetCount !== report.probeTargets.length) {
    throw new Error("Route probe target count mismatch");
  }

  if (report.summary.missingCandidateUrlCount !== 0) {
    throw new Error(`Route probe targets missing candidate URLs: ${report.summary.missingCandidateUrlCount}`);
  }

  if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
    throw new Error("Read-only guarantees failed");
  }

  if (report.guarantees.noFetch !== true || report.guarantees.noSearch !== true || report.guarantees.noUrlFetch !== true) {
    throw new Error("No-fetch/no-search/no-url-fetch guarantees failed");
  }

  const slugs = new Set();
  for (const row of report.probeTargets) {
    if (!row.leagueSlug) throw new Error("Probe target missing leagueSlug");
    if (!row.candidateUrl) throw new Error(`Probe target missing candidateUrl for ${row.leagueSlug}`);
    if (slugs.has(row.leagueSlug)) throw new Error(`Duplicate probe target for ${row.leagueSlug}`);
    slugs.add(row.leagueSlug);
  }

  return true;
}

function runSelfTest() {
  const plan = {
    summary: {
      actionRowCount: 6
    },
    officialRouteProbeTargets: [
      {
        taskType: "official_route_probe_from_strong_search_candidate",
        priority: 100,
        leagueSlug: "nor.2",
        competitionSlug: "nor.2",
        name: "OBOS-ligaen",
        country: "Norway",
        bestHost: "fotball.no",
        bestUrl: "https://www.fotball.no/fotballdata/turnering/hjem/?fiksId=199422&underside=tabellen"
      }
    ],
    identityRouteProbeTargets: [
      {
        taskType: "official_identity_route_probe",
        priority: 90,
        leagueSlug: "alg.1",
        competitionSlug: "alg.1",
        name: "alg.1",
        country: "Algeria",
        bestHost: "faf.dz",
        bestUrl: "https://www.faf.dz/"
      }
    ]
  };

  const report = buildRouteProbeTargets(plan);
  validateReport(report);

  if (report.summary.routeProbeTargetCount !== 2) {
    throw new Error(`Self-test expected 2 probe targets, got ${report.summary.routeProbeTargetCount}`);
  }

  if (report.probeTargets[0].probeMode !== "probe_known_official_standings_route") {
    throw new Error("Self-test expected known official standings route probe first");
  }

  if (report.probeTargets[1].probeMode !== "probe_official_identity_for_standings_route") {
    throw new Error("Self-test expected official identity route probe second");
  }

  return {
    ok: true,
    selfTest: true,
    summary: report.summary,
    guarantees: report.guarantees
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const plan = readJson(args.input);
  const report = buildRouteProbeTargets(plan, { includeIdentityOnly: args.includeIdentityOnly });
  validateReport(report);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    nextRecommendedAction: report.nextRecommendedAction,
    guarantees: report.guarantees
  }, null, 2));
}

main();
