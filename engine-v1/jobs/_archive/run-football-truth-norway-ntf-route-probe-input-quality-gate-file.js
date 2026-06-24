import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-second-order-endpoint-triage-board-2026-06-15",
  "norway-ntf-second-order-endpoint-triage-board-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-route-probe-input-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-route-probe-input-quality-gate-2026-06-15.json"
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

function host(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function pathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function isSameTrustedNtfHost(url) {
  return /^(www\.)?(eliteserien\.no|obos-ligaen\.no)$/i.test(host(url));
}

function isHardNoise(url) {
  const value = String(url ?? "");
  const p = pathname(value);

  return [
    /\/(?:track|custom-track|ping|foo|someUrl)(?:\/|\?|$)/i,
    /\/C:\/|C%3A/i,
    /\/some\/path/i,
    /\/api\/users\/?$/i,
    /\/get-login-links(?:\?|$)/i,
    /\/path(?:\?|$)/i,
    /\/\^|%5E|\/\/d\+\$|%24/i,
    /xoxo|baz=xoxo/i,
    /\/_\/image\//i,
    /apple-icon|favicon|logo|sponsor|banner|placeholder/i,
    /jquery|jquery-ui|jquery\.cookie|cloudflare|email-decode|blazy|navigation-bar|register\.js|push-notification/i,
    /\.(png|jpg|jpeg|gif|svg|ico|css|woff|woff2|ttf)(\?|$)/i
  ].some((regex) => regex.test(value) || regex.test(p));
}

function isHighValueInput(row) {
  const url = String(row.url ?? "");
  if (!isSameTrustedNtfHost(url)) return false;
  if (isHardNoise(url)) return false;

  if (row.inputKind === "high_value_asset_route_source" && /\/js\/embed-league-table\.js(?:\?|$)|\/compiled\/js\/app\.bundle\.js(?:\?|$)/i.test(url)) {
    return true;
  }

  if (/\/api\/|graphql|\.json(?:\?|$)|\/data\/|league-table|standings?|standing|tabell|competition|tournament|season/i.test(url)) {
    return true;
  }

  return false;
}

function qualityReason(row) {
  const url = String(row.url ?? "");
  if (!isSameTrustedNtfHost(url)) return "rejected_non_trusted_host";
  if (isHardNoise(url)) return "rejected_static_login_image_tracking_or_demo_noise";
  if (isHighValueInput(row)) return "accepted_high_value_ntf_route_probe_input";
  return "rejected_low_route_signal";
}

function buildQualityRows(inputRows) {
  return inputRows.map((row, index) => {
    const reason = qualityReason(row);
    return {
      norwayNtfRouteProbeInputQualityGateRowId: `norway_ntf_route_probe_input_quality_gate_${String(index + 1).padStart(3, "0")}`,
      sourceNorwayNtfNextRouteProbeInputRowId: row.norwayNtfNextRouteProbeInputRowId,
      inputKind: row.inputKind,
      competitionSlug: row.competitionSlug,
      sourceRowId: row.sourceRowId,
      url: row.url,
      priorityScore: Number(row.priorityScore ?? 0),
      qualityGateStatus: reason,
      fetchAllowedNext: reason === "accepted_high_value_ntf_route_probe_input",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    };
  });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Norway NTF second-order endpoint triage board: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const nextRouteProbeInputRows = Array.isArray(source.nextRouteProbeInputRows) ? source.nextRouteProbeInputRows : [];
const qualityGateRows = buildQualityRows(nextRouteProbeInputRows);
const acceptedRows = qualityGateRows
  .filter((row) => row.qualityGateStatus === "accepted_high_value_ntf_route_probe_input")
  .sort((a, b) => b.priorityScore - a.priorityScore || String(a.url).localeCompare(String(b.url)));

const rejectedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "accepted_high_value_ntf_route_probe_input");

const checks = [];

assertEqual("sourceTriageStatus", summary.norwayNtfSecondOrderEndpointTriageBoardStatus, "passed", checks);
assertEqual("sourceMayBuildHighValueRouteProbeRunnerCount", Number(summary.mayBuildNorwayNtfHighValueRouteProbeRunnerCount ?? 0), 1, checks);
assertEqual("sourceNextRouteProbeInputRowCount", Number(summary.nextRouteProbeInputRowCount ?? 0), 64, checks);
assertEqual("nextRouteProbeInputRowsPresent", nextRouteProbeInputRows.length > 0, true, checks);
assertEqual("qualityGateRowCount", qualityGateRows.length, nextRouteProbeInputRows.length, checks);
assertEqual("acceptedRowsPositive", acceptedRows.length > 0, true, checks);
assertArrayEqual("acceptedCompetitions", uniqueSorted(acceptedRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertAll("acceptedRowsAreTrustedHosts", acceptedRows, (row) => isSameTrustedNtfHost(row.url), checks);
assertAll("acceptedRowsAreNotHardNoise", acceptedRows, (row) => !isHardNoise(row.url), checks);
assertAll("acceptedRowsAreHighValue", acceptedRows, (row) => isHighValueInput(row), checks);
assertAll("acceptedRowsAllowOnlyFetchNext", acceptedRows, (row) => row.fetchAllowedNext === true, checks);
assertAll("acceptedRowsKeepCanonicalWriteBlocked", acceptedRows, (row) => row.canonicalWriteAllowedNow === false, checks);
assertAll("acceptedRowsKeepProductionWriteBlocked", acceptedRows, (row) => row.productionWriteAllowedNow === false, checks);
assertAll("acceptedRowsKeepTruthAssertionBlocked", acceptedRows, (row) => row.truthAssertionAllowedNow === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);

const blockedQualityGateCheckCount = checks.filter((check) => !check.passed).length;
const passedQualityGateCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-route-probe-input-quality-gate-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    qualityGateOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    norwayNtfRouteProbeInputQualityGateReadCount: 1,
    sourceTriageStatus: summary.norwayNtfSecondOrderEndpointTriageBoardStatus,

    sourceNextRouteProbeInputRowCount: nextRouteProbeInputRows.length,
    qualityGateRowCount: qualityGateRows.length,
    acceptedRouteProbeInputRowCount: acceptedRows.length,
    rejectedRouteProbeInputRowCount: rejectedRows.length,
    acceptedRouteProbeInputCompetitions: uniqueSorted(acceptedRows.map((row) => row.competitionSlug)),
    acceptedRouteProbeInputsByCompetition: countBy(acceptedRows, "competitionSlug"),
    acceptedRouteProbeInputsByKind: countBy(acceptedRows, "inputKind"),
    rejectedRouteProbeInputsByStatus: countBy(rejectedRows, "qualityGateStatus"),

    qualityGateCheckCount: checks.length,
    passedQualityGateCheckCount,
    blockedQualityGateCheckCount,
    norwayNtfRouteProbeInputQualityGateStatus: blockedQualityGateCheckCount === 0 ? "passed" : "blocked",
    norwayNtfRouteProbeInputQualityGatePassedCount: blockedQualityGateCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfHighValueRouteProbeRunnerCount: blockedQualityGateCheckCount === 0 && acceptedRows.length > 0 ? 1 : 0,

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
  qualityGateRows,
  acceptedRouteProbeInputRows: acceptedRows,
  rejectedRouteProbeInputRows: rejectedRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfRouteProbeInputQualityGateStatus: output.summary.norwayNtfRouteProbeInputQualityGateStatus,
  sourceNextRouteProbeInputRowCount: output.summary.sourceNextRouteProbeInputRowCount,
  acceptedRouteProbeInputRowCount: output.summary.acceptedRouteProbeInputRowCount,
  rejectedRouteProbeInputRowCount: output.summary.rejectedRouteProbeInputRowCount,
  acceptedRouteProbeInputsByCompetition: output.summary.acceptedRouteProbeInputsByCompetition,
  acceptedRouteProbeInputsByKind: output.summary.acceptedRouteProbeInputsByKind,
  rejectedRouteProbeInputsByStatus: output.summary.rejectedRouteProbeInputsByStatus,
  sampleAcceptedRouteProbeInputs: acceptedRows.slice(0, 12).map((row) => ({
    competitionSlug: row.competitionSlug,
    inputKind: row.inputKind,
    priorityScore: row.priorityScore,
    url: row.url
  })),
  mayBuildNorwayNtfHighValueRouteProbeRunnerCount: output.summary.mayBuildNorwayNtfHighValueRouteProbeRunnerCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedQualityGateCheckCount !== 0) {
  process.exitCode = 1;
}
