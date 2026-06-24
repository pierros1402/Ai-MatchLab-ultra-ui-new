import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-endpoint-candidate-probe-runner-2026-06-15",
  "norway-ntf-endpoint-candidate-probe-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-second-order-endpoint-triage-board-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-second-order-endpoint-triage-board-2026-06-15.json"
);

const expectedCompetitions = ["nor.1", "nor.2"];

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

function assertAll(name, rows, predicate, checks) {
  const failedRows = rows
    .map((row, index) => ({ index, row }))
    .filter(({ row }) => !predicate(row));

  checks.push({
    name,
    actual: failedRows.length,
    expected: 0,
    passed: failedRows.length === 0,
    failedRowIndexes: failedRows.map(({ index }) => index)
  });
}

function urlPath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function urlSearch(url) {
  try {
    return new URL(url).search;
  } catch {
    return "";
  }
}

function host(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function isDemoNoise(url) {
  const value = String(url ?? "");
  const pathname = urlPath(value);

  return [
    /\/(?:track|custom-track|ping|foo|someUrl)(?:\/|\?|$)/i,
    /\/C:\/|C%3A/i,
    /\/some\/path/i,
    /\/api\/users\/?$/i,
    /\/path(?:\?|$)/i,
    /\/\^|%5E|\/\/d\+\$|%24/i,
    /xoxo|baz=xoxo/i,
    /jquery|jquery-ui|jquery\.cookie|cloudflare|email-decode|blazy|navigation-bar|register\.js|push-notification/i,
    /\.(png|jpg|jpeg|gif|svg|ico|css|woff|woff2|ttf)(\?|$)/i
  ].some((regex) => regex.test(value) || regex.test(pathname));
}

function endpointScore(url, sourceKind, markerSignals = []) {
  const value = String(url ?? "");
  let score = 0;

  if (/embed-league-table/i.test(value)) score += 180;
  if (/app\.bundle/i.test(value)) score += 140;
  if (/manifest\.json/i.test(value)) score += 90;
  if (/league-table|league_table/i.test(value)) score += 120;
  if (/standings?|standing|tabell|table/i.test(value)) score += 110;
  if (/competition|tournament|season/i.test(value)) score += 70;
  if (/kamper|terminliste|matches|fixtures|results?/i.test(value)) score += 45;
  if (/\/api\/|graphql|\/data\/|\.json(\?|$)/i.test(value)) score += 85;
  if (/\/_\/service\/no\.seeds\.app\.football\/asset\//i.test(value)) score += 55;
  if (/\/_\/asset\/ntfpwa:/i.test(value)) score += 35;
  if (/\.(js|mjs)(\?|$)/i.test(urlPath(value))) score += 35;

  if (sourceKind === "asset_relative_url_literal") score += 45;
  if (sourceKind === "url_assignment_literal") score += 35;
  if (sourceKind === "fetch_call_literal") score += 40;
  if (sourceKind === "absolute_url_literal") score += 10;
  if (sourceKind === "relative_url_literal") score += 5;

  if (markerSignals.some((signal) => /embed-league-table|league-table|tabell|standings?|standing|table/i.test(signal))) score += 60;
  if (markerSignals.some((signal) => /api|json|graphql/i.test(signal))) score += 35;

  if (isDemoNoise(value)) score -= 220;
  if (!/(eliteserien\.no|obos-ligaen\.no)/i.test(host(value))) score -= 100;

  return score;
}

function classifyTriageStatus(score, url) {
  if (isDemoNoise(url)) return "rejected_demo_or_generic_noise";
  if (score >= 160) return "accepted_high_confidence_route_or_asset_candidate";
  if (score >= 90) return "review_medium_confidence_route_candidate";
  return "rejected_low_signal_candidate";
}

function buildSecondOrderTriageRows(secondOrderRows, fetchRows) {
  const fetchById = new Map(fetchRows.map((row) => [row.norwayNtfEndpointProbeFetchRowId, row]));

  return secondOrderRows.map((row, index) => {
    const sourceFetch = fetchById.get(row.sourceNorwayNtfEndpointProbeFetchRowId);
    const score = endpointScore(row.absoluteUrl, row.secondOrderEndpointKind, sourceFetch?.markerSignals ?? []);
    const triageStatus = classifyTriageStatus(score, row.absoluteUrl);

    return {
      norwayNtfSecondOrderEndpointTriageRowId: `norway_ntf_second_order_endpoint_triage_${String(index + 1).padStart(4, "0")}`,
      sourceNorwayNtfSecondOrderEndpointCandidateRowId: row.norwayNtfSecondOrderEndpointCandidateRowId,
      sourceNorwayNtfEndpointProbeFetchRowId: row.sourceNorwayNtfEndpointProbeFetchRowId,
      competitionSlug: row.competitionSlug,
      secondOrderEndpointKind: row.secondOrderEndpointKind,
      absoluteUrl: row.absoluteUrl,
      urlHost: host(row.absoluteUrl),
      urlPath: urlPath(row.absoluteUrl),
      urlSearch: urlSearch(row.absoluteUrl),
      sourceFetchUrl: sourceFetch?.url ?? null,
      sourceFetchMarkerSignals: sourceFetch?.markerSignals ?? [],
      priorityScore: score,
      triageStatus,
      fetchAllowedInNextRunner: triageStatus === "accepted_high_confidence_route_or_asset_candidate",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    };
  });
}

function buildHighValueSourceAssetRows(fetchRows) {
  return fetchRows
    .filter((row) => row.ok)
    .map((row) => {
      const score = endpointScore(row.finalUrl ?? row.url, row.endpointCandidateKind, row.markerSignals ?? []);
      const status = score >= 140 && !isDemoNoise(row.finalUrl ?? row.url)
        ? "accepted_high_value_asset_route_source"
        : "review_or_low_priority_asset_route_source";

      return {
        norwayNtfHighValueAssetRouteSourceRowId: `asset_route_source_pending`,
        sourceNorwayNtfEndpointProbeFetchRowId: row.norwayNtfEndpointProbeFetchRowId,
        competitionSlug: row.competitionSlug,
        endpointCandidateKind: row.endpointCandidateKind,
        url: row.url,
        finalUrl: row.finalUrl,
        ok: row.ok,
        statusCode: row.statusCode,
        contentType: row.contentType,
        bodyCharCount: row.bodyCharCount,
        bodySha256: row.bodySha256,
        markerSignals: row.markerSignals ?? [],
        priorityScore: score,
        triageStatus: status,
        refetchAllowedInNextRunner: status === "accepted_high_value_asset_route_source",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      };
    })
    .filter((row) => row.triageStatus === "accepted_high_value_asset_route_source")
    .sort((a, b) => b.priorityScore - a.priorityScore || String(a.finalUrl ?? a.url).localeCompare(String(b.finalUrl ?? b.url)))
    .map((row, index) => ({
      ...row,
      norwayNtfHighValueAssetRouteSourceRowId: `norway_ntf_high_value_asset_route_source_${String(index + 1).padStart(3, "0")}`
    }));
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Norway NTF endpoint candidate probe diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const secondOrderRows = Array.isArray(source.secondOrderEndpointCandidateRows) ? source.secondOrderEndpointCandidateRows : [];
const endpointProbeFetchRows = Array.isArray(source.endpointProbeFetchRows) ? source.endpointProbeFetchRows : [];

const secondOrderTriageRows = buildSecondOrderTriageRows(secondOrderRows, endpointProbeFetchRows);
const acceptedSecondOrderRows = secondOrderTriageRows.filter((row) => row.triageStatus === "accepted_high_confidence_route_or_asset_candidate");
const reviewSecondOrderRows = secondOrderTriageRows.filter((row) => row.triageStatus === "review_medium_confidence_route_candidate");
const rejectedSecondOrderRows = secondOrderTriageRows.filter((row) => row.triageStatus.startsWith("rejected_"));
const highValueAssetRouteSourceRows = buildHighValueSourceAssetRows(endpointProbeFetchRows);

const combinedNextProbeRows = [
  ...highValueAssetRouteSourceRows.map((row) => ({
    norwayNtfNextRouteProbeInputRowId: `pending`,
    inputKind: "high_value_asset_route_source",
    competitionSlug: row.competitionSlug,
    sourceRowId: row.norwayNtfHighValueAssetRouteSourceRowId,
    url: row.finalUrl ?? row.url,
    priorityScore: row.priorityScore
  })),
  ...acceptedSecondOrderRows.map((row) => ({
    norwayNtfNextRouteProbeInputRowId: `pending`,
    inputKind: "accepted_second_order_endpoint",
    competitionSlug: row.competitionSlug,
    sourceRowId: row.norwayNtfSecondOrderEndpointTriageRowId,
    url: row.absoluteUrl,
    priorityScore: row.priorityScore
  }))
]
  .filter((row, index, rows) => rows.findIndex((other) => other.competitionSlug === row.competitionSlug && other.url === row.url) === index)
  .sort((a, b) => b.priorityScore - a.priorityScore || String(a.url).localeCompare(String(b.url)))
  .map((row, index) => ({
    ...row,
    norwayNtfNextRouteProbeInputRowId: `norway_ntf_next_route_probe_input_${String(index + 1).padStart(3, "0")}`,
    fetchAllowedNext: true,
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false
  }));

const checks = [];

assertEqual("sourceProbeStatus", summary.norwayNtfEndpointCandidateProbeRunnerStatus, "passed_with_second_order_endpoint_candidates", checks);
assertEqual("sourceMayBuildSecondOrderProbeRunnerCount", Number(summary.mayBuildNorwayNtfSecondOrderEndpointProbeRunnerCount ?? 0), 1, checks);
assertEqual("sourceSecondOrderEndpointCandidateRowCount", Number(summary.secondOrderEndpointCandidateRowCount ?? 0), 195, checks);
assertEqual("secondOrderRowsPresent", secondOrderRows.length > 0, true, checks);
assertEqual("endpointProbeFetchRowsPresent", endpointProbeFetchRows.length > 0, true, checks);
assertArrayEqual("secondOrderCompetitions", uniqueSorted(secondOrderRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertArrayEqual("fetchRowCompetitions", uniqueSorted(endpointProbeFetchRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);

assertEqual("secondOrderTriageRowCount", secondOrderTriageRows.length, secondOrderRows.length, checks);
assertEqual("highValueAssetRouteSourceRowsPositive", highValueAssetRouteSourceRows.length > 0, true, checks);
assertEqual("combinedNextProbeRowsPositive", combinedNextProbeRows.length > 0, true, checks);
assertArrayEqual("combinedNextProbeCompetitions", uniqueSorted(combinedNextProbeRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);

assertAll("nextProbeRowsFetchAllowed", combinedNextProbeRows, (row) => row.fetchAllowedNext === true, checks);
assertAll("nextProbeRowsKeepCanonicalWriteBlocked", combinedNextProbeRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("nextProbeRowsKeepProductionWriteBlocked", combinedNextProbeRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("nextProbeRowsKeepTruthAssertionBlocked", combinedNextProbeRows, (row) => row.truthAssertionAllowedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 20, checks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);

const blockedTriageCheckCount = checks.filter((check) => !check.passed).length;
const passedTriageCheckCount = checks.filter((check) => check.passed).length;

const board = {
  output: outputPath,
  job: "build-football-truth-norway-ntf-second-order-endpoint-triage-board-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    triageOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    norwayNtfSecondOrderEndpointTriageBoardReadCount: 1,
    sourceProbeStatus: summary.norwayNtfEndpointCandidateProbeRunnerStatus,

    secondOrderEndpointCandidateRowCount: secondOrderRows.length,
    secondOrderEndpointTriageRowCount: secondOrderTriageRows.length,
    acceptedSecondOrderEndpointRowCount: acceptedSecondOrderRows.length,
    reviewSecondOrderEndpointRowCount: reviewSecondOrderRows.length,
    rejectedSecondOrderEndpointRowCount: rejectedSecondOrderRows.length,
    highValueAssetRouteSourceRowCount: highValueAssetRouteSourceRows.length,
    nextRouteProbeInputRowCount: combinedNextProbeRows.length,

    nextRouteProbeInputCompetitions: uniqueSorted(combinedNextProbeRows.map((row) => row.competitionSlug)),
    nextRouteProbeInputsByCompetition: countBy(combinedNextProbeRows, "competitionSlug"),
    secondOrderTriageRowsByStatus: countBy(secondOrderTriageRows, "triageStatus"),
    nextRouteProbeInputsByKind: countBy(combinedNextProbeRows, "inputKind"),

    triageCheckCount: checks.length,
    passedTriageCheckCount,
    blockedTriageCheckCount,
    norwayNtfSecondOrderEndpointTriageBoardStatus: blockedTriageCheckCount === 0 ? "passed" : "blocked",
    norwayNtfSecondOrderEndpointTriageBoardPassedCount: blockedTriageCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfHighValueRouteProbeRunnerCount: blockedTriageCheckCount === 0 && combinedNextProbeRows.length > 0 ? 1 : 0,

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
  highValueAssetRouteSourceRows,
  secondOrderTriageRows,
  nextRouteProbeInputRows: combinedNextProbeRows
};

writeJson(outputPath, board);

console.log(JSON.stringify({
  output: board.output,
  norwayNtfSecondOrderEndpointTriageBoardStatus: board.summary.norwayNtfSecondOrderEndpointTriageBoardStatus,
  secondOrderEndpointCandidateRowCount: board.summary.secondOrderEndpointCandidateRowCount,
  acceptedSecondOrderEndpointRowCount: board.summary.acceptedSecondOrderEndpointRowCount,
  reviewSecondOrderEndpointRowCount: board.summary.reviewSecondOrderEndpointRowCount,
  rejectedSecondOrderEndpointRowCount: board.summary.rejectedSecondOrderEndpointRowCount,
  highValueAssetRouteSourceRowCount: board.summary.highValueAssetRouteSourceRowCount,
  nextRouteProbeInputRowCount: board.summary.nextRouteProbeInputRowCount,
  nextRouteProbeInputsByCompetition: board.summary.nextRouteProbeInputsByCompetition,
  nextRouteProbeInputsByKind: board.summary.nextRouteProbeInputsByKind,
  sampleNextRouteProbeInputs: combinedNextProbeRows.slice(0, 12).map((row) => ({
    competitionSlug: row.competitionSlug,
    inputKind: row.inputKind,
    priorityScore: row.priorityScore,
    url: row.url
  })),
  mayBuildNorwayNtfHighValueRouteProbeRunnerCount: board.summary.mayBuildNorwayNtfHighValueRouteProbeRunnerCount,
  productionWriteExecutedNowCount: board.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: board.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedTriageCheckCount !== 0) {
  process.exitCode = 1;
}
