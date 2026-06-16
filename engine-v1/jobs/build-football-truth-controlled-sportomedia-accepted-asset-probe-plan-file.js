import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-candidate-review-gate-2026-06-15",
  "controlled-sportomedia-route-candidate-review-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-accepted-asset-probe-plan-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-accepted-asset-probe-plan-2026-06-15.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];

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

function assetPriority(assetUrl) {
  const url = String(assetUrl ?? "").toLowerCase();
  if (/\/wp-content\/themes\/sef-leagues\/build\/main\.js/.test(url)) return 1;
  if (/\/wp-content\/plugins\/editorplus\/assets\/scripts\/frontend\.js/.test(url)) return 2;
  if (/\/wp-content\/plugins\/genesis-blocks\/dist\/assets\/js\/dismiss\.js/.test(url)) return 3;
  if (/\.json(?:[?#].*)?$/.test(url)) return 4;
  return 9;
}

function buildAssetProbePlanRows(acceptedAssetRows) {
  return [...acceptedAssetRows]
    .sort((a, b) => {
      if (a.competitionSlug !== b.competitionSlug) return String(a.competitionSlug).localeCompare(String(b.competitionSlug));
      return assetPriority(a.assetUrl) - assetPriority(b.assetUrl) || String(a.assetUrl).localeCompare(String(b.assetUrl));
    })
    .map((row, index) => ({
      sportomediaAcceptedAssetProbePlanRowId: `sportomedia_accepted_asset_probe_plan_${String(index + 1).padStart(3, "0")}`,
      sourceSportomediaAcceptedAssetReferenceRowId: row.sportomediaAcceptedAssetReferenceRowId,
      sourceSportomediaOfficialAssetReferenceRowId: row.sourceSportomediaOfficialAssetReferenceRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      assetUrl: row.assetUrl,
      assetHost: row.assetHost,
      assetPath: row.assetPath,
      assetPriority: assetPriority(row.assetUrl),
      preferredForRouteContractDiscovery: assetPriority(row.assetUrl) === 1,
      probePlanStatus: "ready_for_controlled_sportomedia_accepted_asset_probe_runner",
      expectedProbeSignals: [
        "sportomedia_or_graphql_or_api_endpoint_literal",
        "standings_or_table_or_stats_route_literal",
        "competition_or_season_id_parameter_literal",
        "allsvenskan_or_superettan_context_literal"
      ],
      nextRunnerAllowedActions: {
        mayFetchOnlyThisAcceptedAssetUrl: true,
        mayExtractEndpointLiterals: true,
        mayExtractGraphqlOperationNames: true,
        mayExtractCompetitionOrSeasonIds: true,
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
    }));
}

function buildCompetitionProbePlanRows(assetProbePlanRows) {
  return expectedCompetitions.map((competitionSlug, index) => {
    const rows = assetProbePlanRows.filter((row) => row.competitionSlug === competitionSlug);
    const preferredRows = rows.filter((row) => row.preferredForRouteContractDiscovery);

    return {
      sportomediaAcceptedAssetCompetitionProbePlanRowId: `sportomedia_accepted_asset_competition_probe_plan_${String(index + 1).padStart(2, "0")}`,
      competitionSlug,
      providerFamily: "sportomedia",
      acceptedAssetProbePlanRowCount: rows.length,
      preferredAssetProbePlanRowCount: preferredRows.length,
      acceptedAssetProbePlanRowIds: rows.map((row) => row.sportomediaAcceptedAssetProbePlanRowId),
      preferredAssetProbePlanRowIds: preferredRows.map((row) => row.sportomediaAcceptedAssetProbePlanRowId),
      competitionProbePlanStatus: rows.length > 0 && preferredRows.length > 0
        ? "ready_for_controlled_sportomedia_accepted_asset_probe_runner"
        : "blocked_missing_preferred_main_js_asset",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    };
  });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing controlled Sportomedia route candidate review gate diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const acceptedAssetReferenceRows = Array.isArray(source.acceptedAssetReferenceRows) ? source.acceptedAssetReferenceRows : [];
const acceptedRouteCandidateRows = Array.isArray(source.acceptedRouteCandidateRows) ? source.acceptedRouteCandidateRows : [];

const assetProbePlanRows = buildAssetProbePlanRows(acceptedAssetReferenceRows);
const competitionProbePlanRows = buildCompetitionProbePlanRows(assetProbePlanRows);

const checks = [];

assertEqual("sourceRouteCandidateReviewGateStatus", summary.controlledSportomediaRouteCandidateReviewGateStatus, "passed", checks);
assertEqual("sourceMayBuildAcceptedAssetProbePlanCount", Number(summary.mayBuildControlledSportomediaAcceptedAssetProbePlanCount ?? 0), 1, checks);
assertEqual("sourceAcceptedAssetReferenceRowCount", Number(summary.acceptedAssetReferenceRowCount ?? 0), 4, checks);
assertArrayEqual("sourceAcceptedAssetReferenceCompetitions", uniqueSorted(acceptedAssetReferenceRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);

assertEqual("assetProbePlanRowCount", assetProbePlanRows.length, 4, checks);
assertArrayEqual("assetProbePlanCompetitions", uniqueSorted(assetProbePlanRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertEqual("assetProbePlanRowsReady", assetProbePlanRows.every((row) => row.probePlanStatus === "ready_for_controlled_sportomedia_accepted_asset_probe_runner"), true, checks);
assertEqual("competitionProbePlanRowCount", competitionProbePlanRows.length, 2, checks);
assertArrayEqual("competitionProbePlanCompetitions", uniqueSorted(competitionProbePlanRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertEqual("competitionProbePlanRowsReady", competitionProbePlanRows.every((row) => row.competitionProbePlanStatus === "ready_for_controlled_sportomedia_accepted_asset_probe_runner"), true, checks);
assertEqual("preferredMainJsAssetsByCompetitionReady", expectedCompetitions.every((competitionSlug) => assetProbePlanRows.some((row) => row.competitionSlug === competitionSlug && row.preferredForRouteContractDiscovery)), true, checks);

assertEqual("acceptedRouteCandidateRowCountCarriedForward", acceptedRouteCandidateRows.length, Number(summary.acceptedRouteCandidateRowCount ?? 0), checks);
assertEqual("assetProbePlanRowsKeepCanonicalWriteBlocked", assetProbePlanRows.every((row) => row.canonicalWriteAllowedNow === false), true, checks);
assertEqual("assetProbePlanRowsKeepProductionWriteBlocked", assetProbePlanRows.every((row) => row.productionWriteAllowedNow === false), true, checks);
assertEqual("assetProbePlanRowsKeepTruthAssertionBlocked", assetProbePlanRows.every((row) => row.truthAssertionAllowedNow === false), true, checks);

assertEqual("fetchExecutedNowCount", 0, 0, checks);
assertEqual("searchExecutedNowCount", 0, 0, checks);
assertEqual("broadSearchExecutedNowCount", 0, 0, checks);
assertEqual("classifierExecutedNowCount", 0, 0, checks);
assertEqual("canonicalWriteExecutedNowCount", 0, 0, checks);
assertEqual("productionWriteExecutedNowCount", 0, 0, checks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, checks);

const blockedPlanCheckCount = checks.filter((check) => !check.passed).length;
const passedPlanCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-controlled-sportomedia-accepted-asset-probe-plan-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    acceptedAssetProbePlanOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    nextRunnerScope: "accepted_js_assets_only_with_main_js_priority"
  },
  summary: {
    controlledSportomediaAcceptedAssetProbePlanStatus: blockedPlanCheckCount === 0 ? "passed" : "blocked",
    routeCandidateReviewGateReadCount: 1,

    acceptedAssetProbePlanRowCount: assetProbePlanRows.length,
    acceptedAssetProbePlanRowsByCompetition: countBy(assetProbePlanRows, "competitionSlug"),
    acceptedAssetProbePlanRowsByPriority: countBy(assetProbePlanRows, "assetPriority"),
    preferredMainJsAssetProbePlanRowCount: assetProbePlanRows.filter((row) => row.preferredForRouteContractDiscovery).length,
    preferredMainJsAssetProbePlanRowsByCompetition: countBy(assetProbePlanRows.filter((row) => row.preferredForRouteContractDiscovery), "competitionSlug"),

    competitionProbePlanRowCount: competitionProbePlanRows.length,
    competitionProbePlanRowsByStatus: countBy(competitionProbePlanRows, "competitionProbePlanStatus"),

    planCheckCount: checks.length,
    passedPlanCheckCount,
    blockedPlanCheckCount,

    mayBuildControlledSportomediaAcceptedAssetProbeRunnerCount: blockedPlanCheckCount === 0 ? 1 : 0,

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
  competitionProbePlanRows,
  assetProbePlanRows,
  carriedForwardAcceptedRouteCandidateRows: acceptedRouteCandidateRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaAcceptedAssetProbePlanStatus: output.summary.controlledSportomediaAcceptedAssetProbePlanStatus,
  acceptedAssetProbePlanRowCount: output.summary.acceptedAssetProbePlanRowCount,
  acceptedAssetProbePlanRowsByCompetition: output.summary.acceptedAssetProbePlanRowsByCompetition,
  acceptedAssetProbePlanRowsByPriority: output.summary.acceptedAssetProbePlanRowsByPriority,
  preferredMainJsAssetProbePlanRowCount: output.summary.preferredMainJsAssetProbePlanRowCount,
  preferredMainJsAssetProbePlanRowsByCompetition: output.summary.preferredMainJsAssetProbePlanRowsByCompetition,
  competitionProbePlanRowsByStatus: output.summary.competitionProbePlanRowsByStatus,
  sampleAssetProbePlanRows: assetProbePlanRows.map((row) => ({
    competitionSlug: row.competitionSlug,
    assetPriority: row.assetPriority,
    preferredForRouteContractDiscovery: row.preferredForRouteContractDiscovery,
    assetUrl: row.assetUrl,
    probePlanStatus: row.probePlanStatus
  })),
  mayBuildControlledSportomediaAcceptedAssetProbeRunnerCount: output.summary.mayBuildControlledSportomediaAcceptedAssetProbeRunnerCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPlanCheckCount !== 0) {
  process.exitCode = 1;
}
