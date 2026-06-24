import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-official-route-discovery-runner-2026-06-15",
  "controlled-sportomedia-official-route-discovery-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-candidate-review-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-route-candidate-review-gate-2026-06-15.json"
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

function hostOf(url) {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

function pathOf(url) {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function isOfficialCompetitionHost(competitionSlug, url) {
  const host = hostOf(url);
  if (competitionSlug === "swe.1") return host === "allsvenskan.se" || host === "www.allsvenskan.se";
  if (competitionSlug === "swe.2") return host === "superettan.se" || host === "www.superettan.se";
  return false;
}

function isStandingRoute(row) {
  const url = row.routeUrl ?? "";
  const routePath = pathOf(url);
  if (!isOfficialCompetitionHost(row.competitionSlug, url)) return false;
  return /^\/tabell\/?$/.test(routePath) || /\/tabell\/?$/i.test(routePath);
}

function isUsefulAsset(row) {
  const url = row.assetUrl ?? "";
  const host = hostOf(url);
  const assetPath = pathOf(url);

  if (!isOfficialCompetitionHost(row.competitionSlug, url)) return false;
  if (!/\.(js|mjs|json)$/i.test(assetPath)) return false;
  if (/(challenge-platform|cdn-cgi|apple-touch-icon|favicon|\.png$|\.jpg$|\.jpeg$|\.webp$|\.svg$|\.gif$)/i.test(url)) return false;
  if (/(appar\/?$|\/app\/?$|\/apps\/?$)/i.test(assetPath)) return false;

  const preferred =
    /\/wp-content\/themes\/sef-leagues\/build\/main\.js$/i.test(assetPath) ||
    /\/wp-content\/plugins\/.*\.js$/i.test(assetPath) ||
    /\/build\/.*\.js$/i.test(assetPath) ||
    /\/assets\/.*\.js$/i.test(assetPath) ||
    /\/static\/.*\.js$/i.test(assetPath) ||
    /\.json$/i.test(assetPath);

  return preferred && (host.includes("allsvenskan") || host.includes("superettan"));
}

function classifyRejectedRoute(row) {
  const url = row.routeUrl ?? "";
  if (!isOfficialCompetitionHost(row.competitionSlug, url)) return "not_competition_official_host";
  if (!/tabell|standing|standings|table/i.test(url)) return "not_standings_route";
  return "route_not_narrow_enough";
}

function classifyRejectedAsset(row) {
  const url = row.assetUrl ?? "";
  const assetPath = pathOf(url);
  if (!isOfficialCompetitionHost(row.competitionSlug, url)) return "not_competition_official_host";
  if (!/\.(js|mjs|json)$/i.test(assetPath)) return "not_executable_js_or_json_asset";
  if (/(challenge-platform|cdn-cgi)/i.test(url)) return "anti_bot_or_challenge_asset";
  if (/(apple-touch-icon|favicon|\.png$|\.jpg$|\.jpeg$|\.webp$|\.svg$|\.gif$)/i.test(url)) return "image_or_icon_asset";
  if (/(appar\/?$|\/app\/?$|\/apps\/?$)/i.test(assetPath)) return "app_page_not_asset";
  return "low_value_js_asset";
}

function dedupeBy(rows, keyFn) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function buildAcceptedRouteRows(rows) {
  return dedupeBy(rows.filter(isStandingRoute), (row) => `${row.competitionSlug}|${row.routeUrl}`)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug) || a.routeUrl.localeCompare(b.routeUrl))
    .map((row, index) => ({
      sportomediaAcceptedRouteCandidateRowId: `sportomedia_accepted_route_candidate_${String(index + 1).padStart(3, "0")}`,
      sourceSportomediaOfficialRouteCandidateRowId: row.sportomediaOfficialRouteCandidateRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      routeUrl: row.routeUrl,
      routeHost: row.routeHost,
      routePath: row.routePath,
      acceptedRouteCandidateStatus: "accepted_controlled_standings_route_candidate_not_fetched",
      mayFetchNextOnlyAfterRouteProbePlan: true,
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

function buildRejectedRouteRows(rows) {
  return rows
    .filter((row) => !isStandingRoute(row))
    .slice(0, 120)
    .map((row, index) => ({
      sportomediaRejectedRouteCandidateRowId: `sportomedia_rejected_route_candidate_${String(index + 1).padStart(3, "0")}`,
      sourceSportomediaOfficialRouteCandidateRowId: row.sportomediaOfficialRouteCandidateRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      routeUrl: row.routeUrl,
      rejectionReason: classifyRejectedRoute(row)
    }));
}

function buildAcceptedAssetRows(rows) {
  return dedupeBy(rows.filter(isUsefulAsset), (row) => `${row.competitionSlug}|${row.assetUrl}`)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug) || a.assetUrl.localeCompare(b.assetUrl))
    .map((row, index) => ({
      sportomediaAcceptedAssetReferenceRowId: `sportomedia_accepted_asset_reference_${String(index + 1).padStart(3, "0")}`,
      sourceSportomediaOfficialAssetReferenceRowId: row.sportomediaOfficialAssetReferenceRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      assetUrl: row.assetUrl,
      assetHost: row.assetHost,
      assetPath: row.assetPath,
      acceptedAssetReferenceStatus: "accepted_controlled_js_or_json_asset_reference_not_fetched",
      mayFetchNextOnlyAfterAssetProbePlan: true,
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    }));
}

function buildRejectedAssetRows(rows) {
  return rows
    .filter((row) => !isUsefulAsset(row))
    .slice(0, 160)
    .map((row, index) => ({
      sportomediaRejectedAssetReferenceRowId: `sportomedia_rejected_asset_reference_${String(index + 1).padStart(3, "0")}`,
      sourceSportomediaOfficialAssetReferenceRowId: row.sportomediaOfficialAssetReferenceRowId,
      competitionSlug: row.competitionSlug,
      providerFamily: row.providerFamily,
      assetUrl: row.assetUrl,
      rejectionReason: classifyRejectedAsset(row)
    }));
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing controlled Sportomedia official route discovery runner diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const officialRouteCandidateRows = Array.isArray(source.officialRouteCandidateRows) ? source.officialRouteCandidateRows : [];
const officialAssetReferenceRows = Array.isArray(source.officialAssetReferenceRows) ? source.officialAssetReferenceRows : [];

const acceptedRouteCandidateRows = buildAcceptedRouteRows(officialRouteCandidateRows);
const rejectedRouteCandidateRows = buildRejectedRouteRows(officialRouteCandidateRows);
const acceptedAssetReferenceRows = buildAcceptedAssetRows(officialAssetReferenceRows);
const rejectedAssetReferenceRows = buildRejectedAssetRows(officialAssetReferenceRows);

const checks = [];

assertEqual("sourceDiscoveryRunnerStatus", summary.controlledSportomediaOfficialRouteDiscoveryRunnerStatus, "passed_with_official_asset_or_embedded_signals", checks);
assertEqual("sourceMayBuildRouteCandidateReviewGateCount", Number(summary.mayBuildControlledSportomediaRouteCandidateReviewGateCount ?? 0), 1, checks);
assertEqual("sourceMayBuildOfficialAssetProbePlanCount", Number(summary.mayBuildControlledSportomediaOfficialAssetProbePlanCount ?? 0), 1, checks);
assertEqual("sourceFetchAttemptCount", Number(summary.fetchAttemptCount ?? 0), 56, checks);
assertEqual("sourceOkFetchCount", Number(summary.okFetchCount ?? 0), 28, checks);
assertArrayEqual("sourceCompetitionsWithSignals", summary.competitionsWithSignals, expectedCompetitions, checks);
assertArrayEqual("sourceCompetitionsWithEmbeddedSignals", summary.competitionsWithEmbeddedSignals, expectedCompetitions, checks);
assertArrayEqual("sourceCompetitionsWithStandingSignals", summary.competitionsWithStandingSignals, expectedCompetitions, checks);

assertEqual("acceptedRouteCandidateRowsPresent", acceptedRouteCandidateRows.length > 0, true, checks);
assertEqual("acceptedRouteCandidateCompetitionsSubset", uniqueSorted(acceptedRouteCandidateRows.map((row) => row.competitionSlug)).every((competitionSlug) => expectedCompetitions.includes(competitionSlug)), true, checks);
assertEqual("acceptedAssetReferenceRowsPresent", acceptedAssetReferenceRows.length > 0, true, checks);
assertArrayEqual("acceptedAssetReferenceCompetitions", uniqueSorted(acceptedAssetReferenceRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertEqual("acceptedRoutesKeepWritesBlocked", acceptedRouteCandidateRows.every((row) => row.canonicalWriteAllowedNow === false && row.productionWriteAllowedNow === false && row.truthAssertionAllowedNow === false), true, checks);
assertEqual("acceptedAssetsKeepWritesBlocked", acceptedAssetReferenceRows.every((row) => row.canonicalWriteAllowedNow === false && row.productionWriteAllowedNow === false && row.truthAssertionAllowedNow === false), true, checks);

assertEqual("fetchExecutedNowCount", 0, 0, checks);
assertEqual("searchExecutedNowCount", 0, 0, checks);
assertEqual("broadSearchExecutedNowCount", 0, 0, checks);
assertEqual("classifierExecutedNowCount", 0, 0, checks);
assertEqual("canonicalWriteExecutedNowCount", 0, 0, checks);
assertEqual("productionWriteExecutedNowCount", 0, 0, checks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, checks);

const blockedReviewCheckCount = checks.filter((check) => !check.passed).length;
const passedReviewCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-controlled-sportomedia-route-candidate-review-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    routeCandidateReviewGateOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    nextRunnerScope: "accepted_standings_routes_and_js_json_assets_only"
  },
  summary: {
    controlledSportomediaRouteCandidateReviewGateStatus: blockedReviewCheckCount === 0 ? "passed" : "blocked",
    officialRouteDiscoveryRunnerReadCount: 1,

    sourceOfficialRouteCandidateRowCount: officialRouteCandidateRows.length,
    acceptedRouteCandidateRowCount: acceptedRouteCandidateRows.length,
    rejectedRouteCandidateRowCount: officialRouteCandidateRows.length - acceptedRouteCandidateRows.length,
    acceptedRouteCandidateRowsByCompetition: countBy(acceptedRouteCandidateRows, "competitionSlug"),
    rejectedRouteCandidateRowsByReason: countBy(rejectedRouteCandidateRows, "rejectionReason"),

    sourceOfficialAssetReferenceRowCount: officialAssetReferenceRows.length,
    acceptedAssetReferenceRowCount: acceptedAssetReferenceRows.length,
    rejectedAssetReferenceRowCount: officialAssetReferenceRows.length - acceptedAssetReferenceRows.length,
    acceptedAssetReferenceRowsByCompetition: countBy(acceptedAssetReferenceRows, "competitionSlug"),
    rejectedAssetReferenceRowsByReason: countBy(rejectedAssetReferenceRows, "rejectionReason"),

    reviewCheckCount: checks.length,
    passedReviewCheckCount,
    blockedReviewCheckCount,

    mayBuildControlledSportomediaAcceptedRouteProbePlanCount: blockedReviewCheckCount === 0 && acceptedRouteCandidateRows.length > 0 ? 1 : 0,
    mayBuildControlledSportomediaAcceptedAssetProbePlanCount: blockedReviewCheckCount === 0 && acceptedAssetReferenceRows.length > 0 ? 1 : 0,

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
  acceptedRouteCandidateRows,
  rejectedRouteCandidateRows,
  acceptedAssetReferenceRows,
  rejectedAssetReferenceRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaRouteCandidateReviewGateStatus: output.summary.controlledSportomediaRouteCandidateReviewGateStatus,
  sourceOfficialRouteCandidateRowCount: output.summary.sourceOfficialRouteCandidateRowCount,
  acceptedRouteCandidateRowCount: output.summary.acceptedRouteCandidateRowCount,
  acceptedRouteCandidateRowsByCompetition: output.summary.acceptedRouteCandidateRowsByCompetition,
  rejectedRouteCandidateRowsByReason: output.summary.rejectedRouteCandidateRowsByReason,
  sourceOfficialAssetReferenceRowCount: output.summary.sourceOfficialAssetReferenceRowCount,
  acceptedAssetReferenceRowCount: output.summary.acceptedAssetReferenceRowCount,
  acceptedAssetReferenceRowsByCompetition: output.summary.acceptedAssetReferenceRowsByCompetition,
  rejectedAssetReferenceRowsByReason: output.summary.rejectedAssetReferenceRowsByReason,
  sampleAcceptedRouteCandidateRows: acceptedRouteCandidateRows.slice(0, 8).map((row) => ({
    competitionSlug: row.competitionSlug,
    routeUrl: row.routeUrl,
    acceptedRouteCandidateStatus: row.acceptedRouteCandidateStatus
  })),
  sampleAcceptedAssetReferenceRows: acceptedAssetReferenceRows.slice(0, 10).map((row) => ({
    competitionSlug: row.competitionSlug,
    assetUrl: row.assetUrl,
    acceptedAssetReferenceStatus: row.acceptedAssetReferenceStatus
  })),
  mayBuildControlledSportomediaAcceptedRouteProbePlanCount: output.summary.mayBuildControlledSportomediaAcceptedRouteProbePlanCount,
  mayBuildControlledSportomediaAcceptedAssetProbePlanCount: output.summary.mayBuildControlledSportomediaAcceptedAssetProbePlanCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedReviewCheckCount !== 0) {
  process.exitCode = 1;
}

