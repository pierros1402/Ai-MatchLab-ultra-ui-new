import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-high-value-route-probe-runner-2026-06-15",
  "norway-ntf-high-value-route-probe-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-html-table-parser-plan-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-html-table-parser-plan-2026-06-15.json"
);

const expected = {
  "nor.1": {
    providerFamily: "norway_ntf",
    expectedUrlHost: "www.eliteserien.no",
    expectedTableUrl: "https://www.eliteserien.no/tabell"
  },
  "nor.2": {
    providerFamily: "norway_ntf",
    expectedUrlHost: "www.obos-ligaen.no",
    expectedTableUrl: "https://www.obos-ligaen.no/tabell"
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

function host(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function assertEqual(name, actual, expectedValue, checks) {
  const passed = Object.is(actual, expectedValue);
  checks.push({ name, actual, expected: expectedValue, passed });
}

function assertArrayEqual(name, actual, expectedValue, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expectedValue);
  checks.push({ name, actual, expected: expectedValue, passed });
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

function buildParserPlanRows(htmlTableSignalRows, acceptedRouteCandidateRows) {
  return Object.entries(expected).map(([competitionSlug, expectation], index) => {
    const htmlSignal = htmlTableSignalRows.find((row) => row.competitionSlug === competitionSlug && row.url === expectation.expectedTableUrl);
    const routeCandidate = acceptedRouteCandidateRows.find((row) => row.competitionSlug === competitionSlug && row.absoluteUrl === expectation.expectedTableUrl);

    return {
      norwayNtfHtmlTableParserPlanRowId: `norway_ntf_html_table_parser_plan_${String(index + 1).padStart(2, "0")}`,
      competitionSlug,
      providerFamily: expectation.providerFamily,
      parserInputUrl: expectation.expectedTableUrl,
      parserInputHost: expectation.expectedUrlHost,
      sourceNorwayNtfHtmlTableSignalRowId: htmlSignal?.norwayNtfHtmlTableSignalRowId ?? null,
      sourceNorwayNtfHighValueRouteCandidateRowId: routeCandidate?.norwayNtfHighValueRouteCandidateRowId ?? null,
      sourceTableLike: Boolean(htmlSignal?.tableLike),
      sourceMarkerCount: Number(htmlSignal?.markerCount ?? 0),
      sourceMarkers: Array.isArray(htmlSignal?.markers) ? htmlSignal.markers : [],
      sourceRouteCandidatePriorityScore: Number(routeCandidate?.priorityScore ?? 0),
      parserStrategy: "norway_ntf_html_table_text_or_dom_table_parser",
      expectedHeaderMarkers: ["tabell", "poeng", "spilt", "vunnet", "uavgjort", "tap"],
      expectedOutputKind: "standings_candidate_rows_not_truth_asserted",
      controlledFetchAllowedNext: true,
      canonicalWriteAllowedNext: false,
      productionWriteAllowedNext: false,
      truthAssertionAllowedNext: false,
      planStatus: htmlSignal?.tableLike === true && Number(htmlSignal?.markerCount ?? 0) >= 6
        ? "ready_for_controlled_html_table_parser_runner"
        : "blocked_missing_table_signal"
    };
  });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Norway NTF high-value route probe diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const htmlTableSignalRows = Array.isArray(source.htmlTableSignalRows) ? source.htmlTableSignalRows : [];
const acceptedRouteCandidateRows = Array.isArray(source.acceptedRouteCandidateRows) ? source.acceptedRouteCandidateRows : [];
const parserPlanRows = buildParserPlanRows(htmlTableSignalRows, acceptedRouteCandidateRows);

const checks = [];

assertEqual("sourceHighValueRouteProbeStatus", summary.norwayNtfHighValueRouteProbeRunnerStatus, "passed_with_route_candidates", checks);
assertEqual("sourceHighValueRouteProbeOkFetchCount", Number(summary.highValueRouteProbeOkFetchCount ?? 0), 8, checks);
assertEqual("sourceHtmlTableSignalRowCount", Number(summary.htmlTableSignalRowCount ?? 0), 2, checks);
assertArrayEqual("sourceCompetitionsWithHtmlTableSignals", summary.competitionsWithHtmlTableSignals, ["nor.1", "nor.2"], checks);
assertEqual("sourceMayBuildHtmlTableParserPlanCount", Number(summary.mayBuildNorwayNtfHtmlTableParserPlanCount ?? 0), 1, checks);

assertEqual("htmlTableSignalRowsPresent", htmlTableSignalRows.length, 2, checks);
assertEqual("parserPlanRowCount", parserPlanRows.length, 2, checks);
assertArrayEqual("parserPlanCompetitions", uniqueSorted(parserPlanRows.map((row) => row.competitionSlug)), ["nor.1", "nor.2"], checks);
assertArrayEqual("parserPlanHosts", uniqueSorted(parserPlanRows.map((row) => row.parserInputHost)), ["www.eliteserien.no", "www.obos-ligaen.no"], checks);

for (const [competitionSlug, expectation] of Object.entries(expected)) {
  const row = parserPlanRows.find((candidate) => candidate.competitionSlug === competitionSlug);
  assertEqual(`${competitionSlug}.planRowPresent`, Boolean(row), true, checks);
  assertEqual(`${competitionSlug}.parserInputUrl`, row?.parserInputUrl, expectation.expectedTableUrl, checks);
  assertEqual(`${competitionSlug}.parserInputHost`, host(row?.parserInputUrl), expectation.expectedUrlHost, checks);
  assertEqual(`${competitionSlug}.sourceTableLike`, Boolean(row?.sourceTableLike), true, checks);
  assertEqual(`${competitionSlug}.sourceMarkerCountAtLeastSix`, Number(row?.sourceMarkerCount ?? 0) >= 6, true, checks);
  assertEqual(`${competitionSlug}.planStatus`, row?.planStatus, "ready_for_controlled_html_table_parser_runner", checks);
}

assertAll("parserPlanRowsAllowOnlyControlledFetchNext", parserPlanRows, (row) => row.controlledFetchAllowedNext === true, checks);
assertAll("parserPlanRowsKeepCanonicalWriteBlocked", parserPlanRows, (row) => row.canonicalWriteAllowedNext === false, checks);
assertAll("parserPlanRowsKeepProductionWriteBlocked", parserPlanRows, (row) => row.productionWriteAllowedNext === false, checks);
assertAll("parserPlanRowsKeepTruthAssertionBlocked", parserPlanRows, (row) => row.truthAssertionAllowedNext === false, checks);

assertEqual("sourceFetchExecutedNowCount", Number(summary.fetchExecutedNowCount ?? 0), 8, checks);
assertEqual("sourceSearchExecutedNowCount", Number(summary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceBroadSearchExecutedNowCount", Number(summary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceClassifierExecutedNowCount", Number(summary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceCanonicalWriteExecutedNowCount", Number(summary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceProductionWriteExecutedNowCount", Number(summary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("sourceTruthAssertionExecutedNowCount", Number(summary.truthAssertionExecutedNowCount ?? 0), 0, checks);

const blockedParserPlanCheckCount = checks.filter((check) => !check.passed).length;
const passedParserPlanCheckCount = checks.filter((check) => check.passed).length;

const plan = {
  output: outputPath,
  job: "build-football-truth-norway-ntf-html-table-parser-plan-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    planOnly: true,
    noFetchInThisJob: true,
    controlledFetchAllowedNextOnlyForParserInputUrls: true,
    noSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    norwayNtfHtmlTableParserPlanReadCount: 1,
    sourceHighValueRouteProbeStatus: summary.norwayNtfHighValueRouteProbeRunnerStatus,

    parserPlanRowCount: parserPlanRows.length,
    parserPlanCompetitionCount: uniqueSorted(parserPlanRows.map((row) => row.competitionSlug)).length,
    parserPlanProviderFamilyCount: uniqueSorted(parserPlanRows.map((row) => row.providerFamily)).length,
    parserPlanRowsByStatus: countBy(parserPlanRows, "planStatus"),
    parserPlanCompetitions: uniqueSorted(parserPlanRows.map((row) => row.competitionSlug)),
    parserInputUrls: parserPlanRows.map((row) => row.parserInputUrl),

    parserPlanCheckCount: checks.length,
    passedParserPlanCheckCount,
    blockedParserPlanCheckCount,
    norwayNtfHtmlTableParserPlanStatus: blockedParserPlanCheckCount === 0 ? "passed" : "blocked",
    norwayNtfHtmlTableParserPlanPassedCount: blockedParserPlanCheckCount === 0 ? 1 : 0,

    mayBuildNorwayNtfControlledHtmlTableParserRunnerCount: blockedParserPlanCheckCount === 0 ? 1 : 0,

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
  parserPlanRows
};

writeJson(outputPath, plan);

console.log(JSON.stringify({
  output: plan.output,
  norwayNtfHtmlTableParserPlanStatus: plan.summary.norwayNtfHtmlTableParserPlanStatus,
  parserPlanRowCount: plan.summary.parserPlanRowCount,
  parserPlanCompetitions: plan.summary.parserPlanCompetitions,
  parserInputUrls: plan.summary.parserInputUrls,
  parserPlanRowsByStatus: plan.summary.parserPlanRowsByStatus,
  mayBuildNorwayNtfControlledHtmlTableParserRunnerCount: plan.summary.mayBuildNorwayNtfControlledHtmlTableParserRunnerCount,
  productionWriteExecutedNowCount: plan.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: plan.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedParserPlanCheckCount !== 0) {
  process.exitCode = 1;
}
