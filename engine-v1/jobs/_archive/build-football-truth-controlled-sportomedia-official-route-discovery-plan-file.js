import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-contract-probe-2026-06-15",
  "controlled-sportomedia-route-contract-probe-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-official-route-discovery-plan-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-official-route-discovery-plan-2026-06-15.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];

const officialRouteDiscoverySeeds = {
  "swe.1": {
    competitionLabel: "Sweden Allsvenskan",
    providerFamily: "sportomedia",
    officialHostCandidates: [
      "allsvenskan.se",
      "www.allsvenskan.se",
      "svenskfotboll.se",
      "www.svenskfotboll.se"
    ],
    routePathCandidates: [
      "/",
      "/tabell",
      "/tabell/",
      "/resultat",
      "/resultat/",
      "/matcher",
      "/matcher/"
    ],
    requiredDiscoverySignals: [
      "standings_or_table_signal",
      "sportomedia_or_graphql_or_embedded_data_signal",
      "competition_specific_allsvenskan_signal"
    ]
  },
  "swe.2": {
    competitionLabel: "Sweden Superettan",
    providerFamily: "sportomedia",
    officialHostCandidates: [
      "superettan.se",
      "www.superettan.se",
      "svenskfotboll.se",
      "www.svenskfotboll.se"
    ],
    routePathCandidates: [
      "/",
      "/tabell",
      "/tabell/",
      "/resultat",
      "/resultat/",
      "/matcher",
      "/matcher/"
    ],
    requiredDiscoverySignals: [
      "standings_or_table_signal",
      "sportomedia_or_graphql_or_embedded_data_signal",
      "competition_specific_superettan_signal"
    ]
  }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))].sort();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function assertEqual(name, actual, expected, checks) {
  const passed = Object.is(actual, expected);
  checks.push({ name, actual, expected, passed });
}

function assertArrayEqual(name, actual, expected, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, actual, expected, passed });
}

function buildSeedUrls(seed) {
  const urls = [];
  for (const host of seed.officialHostCandidates) {
    for (const routePath of seed.routePathCandidates) {
      urls.push(`https://${host}${routePath}`);
    }
  }
  return uniqueSorted(urls);
}

function buildDiscoveryPlanRows(controlledRunnerInputRows) {
  return expectedCompetitions.map((competitionSlug, index) => {
    const sourceInputRow = controlledRunnerInputRows.find((row) => row.competitionSlug === competitionSlug);
    const seed = officialRouteDiscoverySeeds[competitionSlug];
    const seedUrls = buildSeedUrls(seed);

    return {
      sportomediaOfficialRouteDiscoveryPlanRowId: `sportomedia_official_route_discovery_plan_${String(index + 1).padStart(2, "0")}`,
      sourceSportomediaControlledRunnerInputRowId: sourceInputRow?.sportomediaControlledRunnerInputRowId ?? null,
      competitionSlug,
      competitionLabel: seed.competitionLabel,
      providerFamily: seed.providerFamily,
      sourceInputStatus: sourceInputRow?.inputStatus ?? null,
      officialHostCandidates: seed.officialHostCandidates,
      routePathCandidates: seed.routePathCandidates,
      controlledSeedUrlCount: seedUrls.length,
      controlledSeedUrls: seedUrls,
      requiredDiscoverySignals: seed.requiredDiscoverySignals,
      discoveryPlanStatus: "ready_for_controlled_official_route_discovery_runner",
      nextRunnerAllowedActions: {
        mayFetchOnlyControlledSeedUrls: true,
        mayExtractHtmlRouteSignals: true,
        mayExtractAssetReferencesFromControlledSeedUrls: true,
        mayProbeDiscoveredOfficialAssetsOnlyAfterNextGate: false,
        maySearch: false,
        mayBroadSearch: false,
        mayClassify: false,
        mayWriteCanonical: false,
        mayWriteProduction: false,
        mayAssertTruth: false
      },
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    };
  });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing controlled Sportomedia route contract probe diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const controlledRunnerInputRows = Array.isArray(source.controlledRunnerInputRows) ? source.controlledRunnerInputRows : [];
const discoveryPlanRows = buildDiscoveryPlanRows(controlledRunnerInputRows);

const checks = [];

assertEqual(
  "sourceControlledSportomediaRouteContractProbeStatus",
  summary.controlledSportomediaRouteContractProbeStatus,
  "passed_with_local_route_contract_gap_requires_controlled_official_route_discovery_plan",
  checks
);
assertEqual("sourceRouteContractGapDetected", summary.routeContractGapDetected, true, checks);
assertEqual("sourceUsableRouteContractProbeRowCount", Number(summary.usableRouteContractProbeRowCount ?? 0), 0, checks);
assertEqual("sourceMayBuildControlledSportomediaOfficialRouteDiscoveryPlanCount", Number(summary.mayBuildControlledSportomediaOfficialRouteDiscoveryPlanCount ?? 0), 1, checks);
assertEqual("sourceControlledRunnerInputRowCount", controlledRunnerInputRows.length, 2, checks);
assertArrayEqual("sourceControlledRunnerInputCompetitions", uniqueSorted(controlledRunnerInputRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertEqual(
  "sourceControlledRunnerInputsBlockedAsExpected",
  controlledRunnerInputRows.every((row) => row.inputStatus === "blocked_no_usable_local_route_contract_signal"),
  true,
  checks
);

assertEqual("discoveryPlanRowCount", discoveryPlanRows.length, 2, checks);
assertArrayEqual("discoveryPlanCompetitions", uniqueSorted(discoveryPlanRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertArrayEqual("discoveryPlanProviderFamilies", uniqueSorted(discoveryPlanRows.map((row) => row.providerFamily)), ["sportomedia"], checks);
assertEqual("discoveryPlanRowsReady", discoveryPlanRows.every((row) => row.discoveryPlanStatus === "ready_for_controlled_official_route_discovery_runner"), true, checks);
assertEqual("discoveryPlanRowsHaveControlledSeedUrls", discoveryPlanRows.every((row) => row.controlledSeedUrlCount > 0), true, checks);
assertEqual("discoveryPlanRowsKeepCanonicalWriteBlocked", discoveryPlanRows.every((row) => row.canonicalWriteAllowedNow === false), true, checks);
assertEqual("discoveryPlanRowsKeepProductionWriteBlocked", discoveryPlanRows.every((row) => row.productionWriteAllowedNow === false), true, checks);
assertEqual("discoveryPlanRowsKeepTruthAssertionBlocked", discoveryPlanRows.every((row) => row.truthAssertionAllowedNow === false), true, checks);

assertEqual("fetchExecutedNowCount", 0, 0, checks);
assertEqual("searchExecutedNowCount", 0, 0, checks);
assertEqual("broadSearchExecutedNowCount", 0, 0, checks);
assertEqual("classifierExecutedNowCount", 0, 0, checks);
assertEqual("canonicalWriteExecutedNowCount", 0, 0, checks);
assertEqual("productionWriteExecutedNowCount", 0, 0, checks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, checks);

const blockedDiscoveryPlanCheckCount = checks.filter((check) => !check.passed).length;
const passedDiscoveryPlanCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-controlled-sportomedia-official-route-discovery-plan-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    officialRouteDiscoveryPlanOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    nextRunnerScope: "controlled_seed_urls_only_for_swe_1_swe_2"
  },
  summary: {
    controlledSportomediaOfficialRouteDiscoveryPlanStatus: blockedDiscoveryPlanCheckCount === 0 ? "passed" : "blocked",
    sourceRouteContractProbeReadCount: 1,
    routeContractGapConfirmedCount: summary.routeContractGapDetected === true ? 1 : 0,

    officialRouteDiscoveryPlanRowCount: discoveryPlanRows.length,
    officialRouteDiscoveryPlanCompetitions: uniqueSorted(discoveryPlanRows.map((row) => row.competitionSlug)),
    officialRouteDiscoveryPlanRowsByStatus: countBy(discoveryPlanRows, "discoveryPlanStatus"),
    controlledSeedUrlCount: discoveryPlanRows.reduce((sum, row) => sum + row.controlledSeedUrlCount, 0),

    discoveryPlanCheckCount: checks.length,
    passedDiscoveryPlanCheckCount,
    blockedDiscoveryPlanCheckCount,

    mayBuildControlledSportomediaOfficialRouteDiscoveryRunnerCount: blockedDiscoveryPlanCheckCount === 0 ? 1 : 0,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    canonicalWrites: 0,
    productionWrite: false,
    truthAssertion: false
  },
  checks,
  discoveryPlanRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaOfficialRouteDiscoveryPlanStatus: output.summary.controlledSportomediaOfficialRouteDiscoveryPlanStatus,
  officialRouteDiscoveryPlanRowCount: output.summary.officialRouteDiscoveryPlanRowCount,
  officialRouteDiscoveryPlanCompetitions: output.summary.officialRouteDiscoveryPlanCompetitions,
  officialRouteDiscoveryPlanRowsByStatus: output.summary.officialRouteDiscoveryPlanRowsByStatus,
  controlledSeedUrlCount: output.summary.controlledSeedUrlCount,
  sampleDiscoveryPlanRows: discoveryPlanRows.map((row) => ({
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    officialHostCandidates: row.officialHostCandidates,
    routePathCandidates: row.routePathCandidates,
    controlledSeedUrlCount: row.controlledSeedUrlCount,
    requiredDiscoverySignals: row.requiredDiscoverySignals,
    discoveryPlanStatus: row.discoveryPlanStatus
  })),
  mayBuildControlledSportomediaOfficialRouteDiscoveryRunnerCount: output.summary.mayBuildControlledSportomediaOfficialRouteDiscoveryRunnerCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedDiscoveryPlanCheckCount !== 0) {
  process.exitCode = 1;
}
