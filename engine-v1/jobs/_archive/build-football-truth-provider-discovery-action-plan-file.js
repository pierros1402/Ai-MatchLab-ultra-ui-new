import fs from "fs";
import path from "path";

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
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

function baseTask(row, taskType, priority, reason) {
  return {
    taskType,
    priority,
    leagueSlug: row.leagueSlug,
    competitionSlug: row.leagueSlug,
    name: row.name || "",
    registryName: row.registryName || "",
    country: row.country || "",
    region: row.region || "",
    reviewBucket: row.reviewBucket || "",
    bestHost: row.bestHost || "",
    bestTitle: row.bestTitle || "",
    bestUrl: row.bestUrl || "",
    bestClassification: row.bestClassification || "",
    sourceQuery: row.query || "",
    resultCount: row.resultCount ?? 0,
    reason,
    requiredEvidence: [
      "official source identity",
      "competition identity match",
      "season/current-state marker",
      "standings/table route or explicit official no-standings state"
    ],
    rejectIf: [
      "aggregator-only source",
      "social/reference/travel/account/help-site result",
      "national-team-only result",
      "stale season without season marker",
      "wrong competition/country identity"
    ],
    promotionBlockedUntil: [
      "official URL/provider route is fetched and validated",
      "season/current-state identity is confirmed",
      "canonical standings write contract exists",
      "source convergence policy is satisfied"
    ],
    outputMustCarry: [
      "value",
      "confidence",
      "source convergence",
      "metadata",
      "provider/source route",
      "rejection reason if no valid official source found"
    ],
    sourceFetch: false,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildActionPlan(board) {
  const strong = asArray(board.strongOfficialCandidates);
  const needsIdentityProbe = asArray(board.needsIdentityProbe);
  const needsRouteProbe = asArray(board.needsRouteProbe);
  const thirdPartyOnly = asArray(board.thirdPartyOnly);
  const problematic = asArray(board.problematic);

  const officialRouteProbeTargets = strong.map((row) => baseTask(
    row,
    "official_route_probe_from_strong_search_candidate",
    100,
    "Strict review found official-looking standings route; fetch/probe is required before any promotion."
  ));

  const identityRouteProbeTargets = [...needsIdentityProbe, ...needsRouteProbe].map((row) => baseTask(
    row,
    "official_identity_route_probe",
    90,
    "Strict review found official identity signal but no validated standings route."
  ));

  const officialRediscoveryTargets = thirdPartyOnly.map((row) => baseTask(
    row,
    "official_source_rediscovery_from_third_party_standings",
    80,
    "Search found standings evidence only through third-party/aggregator; official source must be rediscovered."
  ));

  const problematicRecoveryTargets = problematic.map((row) => baseTask(
    row,
    row.reviewBucket === "problematic_no_results"
      ? "problematic_recovery_no_results"
      : "problematic_recovery_no_usable_signal",
    60,
    "Strict review found no usable official/provider route signal; needs alternate query/provider strategy."
  ));

  const actionRows = [
    ...officialRouteProbeTargets,
    ...identityRouteProbeTargets,
    ...officialRediscoveryTargets,
    ...problematicRecoveryTargets
  ];

  const byTaskType = {};
  for (const row of actionRows) {
    byTaskType[row.taskType] = (byTaskType[row.taskType] || 0) + 1;
  }

  const byPriority = {};
  for (const row of actionRows) {
    byPriority[String(row.priority)] = (byPriority[String(row.priority)] || 0) + 1;
  }

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceBoardSummary: board.summary || {},
    summary: {
      sourceBoardTargetCount: board.summary?.targetCount ?? null,
      sourceBoardSearchResultRowCount: board.summary?.searchResultRowCount ?? null,
      actionRowCount: actionRows.length,
      officialRouteProbeCount: officialRouteProbeTargets.length,
      identityRouteProbeCount: identityRouteProbeTargets.length,
      officialRediscoveryCount: officialRediscoveryTargets.length,
      problematicRecoveryCount: problematicRecoveryTargets.length,
      byTaskType,
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
      type: "official_route_probe_planning",
      firstBucket: "official_route_probe_from_strong_search_candidate",
      firstBucketCount: officialRouteProbeTargets.length,
      firstTargets: officialRouteProbeTargets.slice(0, 10).map((row) => ({
        leagueSlug: row.leagueSlug,
        country: row.country,
        name: row.name,
        bestHost: row.bestHost,
        bestUrl: row.bestUrl
      })),
      note: "Do not promote. Use this plan to build route-probe/fetch validation batches with explicit official-source evidence contracts."
    },
    officialRouteProbeTargets,
    identityRouteProbeTargets,
    officialRediscoveryTargets,
    problematicRecoveryTargets,
    actionRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noSearch: true,
      noUrlFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      batchBased: true,
      promotionBlockedUntilValidated: true
    }
  };
}

function validatePlan(plan) {
  if (!plan.ok) throw new Error("Action plan is not ok");
  if (plan.summary.actionRowCount !== plan.actionRows.length) {
    throw new Error("Action row count mismatch");
  }
  if (plan.summary.canonicalWrites !== 0 || plan.summary.productionWrite !== false) {
    throw new Error("Read-only guarantees failed");
  }
  if (plan.guarantees.noFetch !== true || plan.guarantees.noSearch !== true) {
    throw new Error("No-fetch/no-search guarantees failed");
  }

  const slugs = new Set();
  for (const row of plan.actionRows) {
    if (!row.leagueSlug) throw new Error("Action row missing leagueSlug");
    if (slugs.has(row.leagueSlug)) throw new Error(`Duplicate action row for ${row.leagueSlug}`);
    slugs.add(row.leagueSlug);
  }

  return true;
}

function runSelfTest() {
  const board = {
    summary: {
      targetCount: 5,
      searchResultRowCount: 50
    },
    strongOfficialCandidates: [
      { leagueSlug: "nor.2", country: "Norway", name: "OBOS-ligaen", bestHost: "fotball.no", bestUrl: "https://www.fotball.no/fotballdata/turnering/hjem/?underside=tabellen" }
    ],
    needsIdentityProbe: [],
    needsRouteProbe: [
      { leagueSlug: "alg.1", country: "Algeria", name: "alg.1", bestHost: "faf.dz", bestTitle: "FAF - Fédération algérienne de football" }
    ],
    thirdPartyOnly: [
      { leagueSlug: "alb.2", country: "Albania", name: "Albanian First Division", bestHost: "scorepulse.org" }
    ],
    problematic: [
      { leagueSlug: "and.1", country: "Andorra", name: "Andorran Primera Divisió", reviewBucket: "problematic_no_usable_signal" },
      { leagueSlug: "xyz.1", country: "Example", name: "Example League", reviewBucket: "problematic_no_results" }
    ]
  };

  const plan = buildActionPlan(board);
  validatePlan(plan);

  if (plan.summary.actionRowCount !== 5) {
    throw new Error(`Self-test expected 5 action rows, got ${plan.summary.actionRowCount}`);
  }

  if (plan.summary.officialRouteProbeCount !== 1) {
    throw new Error("Self-test expected one official route probe target");
  }

  if (plan.summary.identityRouteProbeCount !== 1) {
    throw new Error("Self-test expected one identity route probe target");
  }

  if (plan.summary.officialRediscoveryCount !== 1) {
    throw new Error("Self-test expected one official rediscovery target");
  }

  if (plan.summary.problematicRecoveryCount !== 2) {
    throw new Error("Self-test expected two problematic recovery targets");
  }

  return {
    ok: true,
    selfTest: true,
    summary: plan.summary,
    guarantees: plan.guarantees
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

  const board = readJson(args.input);
  const plan = buildActionPlan(board);
  validatePlan(plan);
  writeJson(args.output, plan);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: plan.summary,
    nextRecommendedAction: plan.nextRecommendedAction,
    guarantees: plan.guarantees
  }, null, 2));
}

main();
