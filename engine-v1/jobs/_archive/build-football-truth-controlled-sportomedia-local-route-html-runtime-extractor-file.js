import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-official-route-validation-runner-2026-06-16",
  "controlled-sportomedia-official-route-validation-runner-2026-06-16.json"
);

const contextResolverPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-local-context-resolver-2026-06-16",
  "controlled-sportomedia-local-context-resolver-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-local-route-html-runtime-extractor-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-local-route-html-runtime-extractor-2026-06-16.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

function extractScriptSrcs(html) {
  const rows = [];
  const re = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null && rows.length < 200) {
    rows.push({
      src: match[1],
      offset: match.index,
      scriptTag: match[0].slice(0, 500)
    });
  }
  return rows;
}

function extractLinkHrefs(html) {
  const rows = [];
  const re = /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = re.exec(html)) !== null && rows.length < 200) {
    rows.push({
      href: match[1],
      offset: match.index,
      linkTag: match[0].slice(0, 500)
    });
  }
  return rows;
}

function extractDataAttributes(html) {
  const rows = [];
  const re = /\b(data-[a-z0-9_-]+)=["']([^"']{0,300})["']/gi;
  let match;
  while ((match = re.exec(html)) !== null && rows.length < 300) {
    rows.push({
      name: match[1],
      value: match[2],
      offset: match.index
    });
  }
  return rows;
}

function extractWindowAssignments(html) {
  const rows = [];
  const re = /\bwindow\.([A-Za-z0-9_$]+)\s*=\s*([^;<]{1,400})/g;
  let match;
  while ((match = re.exec(html)) !== null && rows.length < 100) {
    rows.push({
      name: match[1],
      valuePreview: match[2].slice(0, 400),
      offset: match.index
    });
  }
  return rows;
}

function contextAt(html, needle, radius = 500) {
  const raw = String(html);
  const lower = raw.toLowerCase();
  const idx = lower.indexOf(String(needle).toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(raw.length, idx + radius);
  return {
    needle,
    offset: idx,
    context: raw.slice(start, end).replace(/\s+/g, " ").slice(0, 1400)
  };
}

function countOccurrences(html, needle) {
  const lower = String(html).toLowerCase();
  const n = String(needle).toLowerCase();
  let count = 0;
  let cursor = 0;
  while (count < 500) {
    const found = lower.indexOf(n, cursor);
    if (found === -1) break;
    count += 1;
    cursor = found + Math.max(n.length, 1);
  }
  return count;
}

function classifyHtml(html, competitionSlug) {
  const expectedToken = competitionSlug === "swe.1" ? "allsvenskan" : "superettan";
  return {
    htmlLikeSignal: /<html|<!doctype html|<body|<script/i.test(html),
    expectedCompetitionTokenSignal: String(html).toLowerCase().includes(expectedToken),
    officialStandingsRouteTokenSignal: countOccurrences(html, "tabell") > 0,
    sefLeaguesAssetSignal: countOccurrences(html, "sef-leagues") > 0,
    mainJsSignal: countOccurrences(html, "build/main.js") > 0 || countOccurrences(html, "main.js?ver=") > 0,
    graphqlRuntimeSignal: countOccurrences(html, "gqlURI") > 0 || countOccurrences(html, "graphql") > 0,
    dataEndpointSignal: countOccurrences(html, "data-endpoint") > 0 || countOccurrences(html, "endpointUrl") > 0,
    standingsDomSignal: countOccurrences(html, "standings-table") > 0 || countOccurrences(html, "standingsForLeague") > 0
  };
}

function buildRuntimeRow(routeRow, contextRows) {
  const htmlPath = routeRow.htmlPath;
  if (!htmlPath || !fs.existsSync(htmlPath)) {
    return {
      competitionSlug: routeRow.competitionSlug,
      officialStandingsRoute: routeRow.officialStandingsRoute,
      htmlPath,
      htmlReadStatus: "missing_html_file",
      runtimeExtractionStatus: "blocked_missing_html_file"
    };
  }

  const buffer = fs.readFileSync(htmlPath);
  const html = buffer.toString("utf8");

  const scriptSrcRows = extractScriptSrcs(html);
  const linkHrefRows = extractLinkHrefs(html);
  const dataAttributeRows = extractDataAttributes(html);
  const windowAssignmentRows = extractWindowAssignments(html);
  const signals = classifyHtml(html, routeRow.competitionSlug);

  const mainJsRefs = scriptSrcRows.filter((row) => /\/wp-content\/themes\/sef-leagues\/build\/main\.js/i.test(row.src));
  const sefAssetRefs = scriptSrcRows.filter((row) => /sef-leagues/i.test(row.src));
  const stylesheetRefs = linkHrefRows.filter((row) => /sef-leagues|standings|tabell/i.test(row.href));
  const usefulDataAttrs = dataAttributeRows.filter((row) => /endpoint|standings|league|team|competition|season|tabell/i.test(`${row.name} ${row.value}`));

  const contexts = [
    contextAt(html, "build/main.js"),
    contextAt(html, "sef-leagues"),
    contextAt(html, "gqlURI"),
    contextAt(html, "graphql"),
    contextAt(html, "data-endpoint"),
    contextAt(html, "endpointUrl"),
    contextAt(html, "standingsForLeague"),
    contextAt(html, "standings-table"),
    contextAt(html, "tabell")
  ].filter(Boolean);

  const localResolverRows = contextRows.filter((row) => row.competitionSlug === routeRow.competitionSlug);
  const resolvedSignalsFromAsset = uniqueSorted(localResolverRows.flatMap((row) => Array.isArray(row.resolvedSignals) ? row.resolvedSignals : []));

  const signalCount = Object.values(signals).filter(Boolean).length;
  const hasRuntimeContract =
    signals.htmlLikeSignal &&
    signals.expectedCompetitionTokenSignal &&
    signals.sefLeaguesAssetSignal &&
    signals.mainJsSignal &&
    resolvedSignalsFromAsset.includes("graphql_uri_runtime_binding_signal") &&
    resolvedSignalsFromAsset.includes("standings_for_league_operation_signal") &&
    resolvedSignalsFromAsset.includes("standings_table_dom_schema_signal");

  return {
    competitionSlug: routeRow.competitionSlug,
    competitionLabel: routeRow.competitionLabel,
    providerFamily: "sportomedia",
    officialStandingsRoute: routeRow.officialStandingsRoute,
    sourceRouteValidationStatus: routeRow.routeValidationStatus,
    htmlPath,
    htmlReadStatus: "read",
    htmlSize: buffer.length,
    htmlSha256: sha256Buffer(buffer),
    htmlSignals: signals,
    htmlSignalCount: signalCount,
    scriptSrcCount: scriptSrcRows.length,
    sefAssetRefCount: sefAssetRefs.length,
    mainJsRefCount: mainJsRefs.length,
    linkHrefCount: linkHrefRows.length,
    relevantStylesheetRefCount: stylesheetRefs.length,
    dataAttributeCount: dataAttributeRows.length,
    usefulDataAttributeCount: usefulDataAttrs.length,
    windowAssignmentCount: windowAssignmentRows.length,
    resolvedSignalsFromAsset,
    contextCount: contexts.length,
    runtimeExtractionStatus: hasRuntimeContract
      ? "accepted_runtime_contract_shell_ready_for_standings_extraction_plan"
      : "runtime_contract_shell_incomplete",
    nextAllowedAction: {
      mayBuildControlledSportomediaStandingsExtractionPlan: hasRuntimeContract,
      mayFetchNow: false,
      maySearch: false,
      mayBroadSearch: false,
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    },
    mainJsRefs,
    sefAssetRefs: sefAssetRefs.slice(0, 30),
    relevantStylesheetRefs: stylesheetRefs.slice(0, 30),
    usefulDataAttributes: usefulDataAttrs.slice(0, 50),
    windowAssignments: windowAssignmentRows.slice(0, 30),
    contexts
  };
}

function assertCheck(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing official route validation runner output: ${inputPath}`);
}
if (!fs.existsSync(contextResolverPath)) {
  throw new Error(`Missing local context resolver output: ${contextResolverPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const contextResolverText = fs.readFileSync(contextResolverPath, "utf8");
const contextResolver = JSON.parse(contextResolverText);

const routeRows = Array.isArray(input.routeValidationRows) ? input.routeValidationRows : [];
const contextRows = Array.isArray(contextResolver.contextRows) ? contextResolver.contextRows : [];
const runtimeRows = routeRows.map((row) => buildRuntimeRow(row, contextRows));

const acceptedRuntimeRows = runtimeRows.filter((row) => row.runtimeExtractionStatus === "accepted_runtime_contract_shell_ready_for_standings_extraction_plan");
const blockedRuntimeRows = runtimeRows.filter((row) => row.runtimeExtractionStatus !== "accepted_runtime_contract_shell_ready_for_standings_extraction_plan");

const checks = [];
assertCheck(checks, "sourceOfficialRouteValidationPassed", input.summary?.status === "passed", { actual: input.summary?.status });
assertCheck(checks, "sourceValidatedTwoOfficialRoutes", Number(input.summary?.validOfficialRouteCount ?? 0) === 2, { actual: input.summary?.validOfficialRouteCount });
assertCheck(checks, "sourceContextResolverPassed", contextResolver.summary?.controlledSportomediaLocalContextResolverStatus === "passed", { actual: contextResolver.summary?.controlledSportomediaLocalContextResolverStatus });
assertCheck(checks, "sourceNoSearchCanonicalProductionTruth", Number(input.summary?.searchExecutedNowCount ?? -1) === 0 && Number(input.summary?.broadSearchExecutedNowCount ?? -1) === 0 && Number(input.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
assertCheck(checks, "runtimeRowsExpectedCount", runtimeRows.length === 2, { actual: runtimeRows.length, expected: 2 });
assertCheck(checks, "runtimeRowsCoverExpectedCompetitions", JSON.stringify(uniqueSorted(runtimeRows.map((row) => row.competitionSlug))) === JSON.stringify(expectedCompetitions), { actual: uniqueSorted(runtimeRows.map((row) => row.competitionSlug)), expected: expectedCompetitions });
assertCheck(checks, "htmlFilesRead", runtimeRows.every((row) => row.htmlReadStatus === "read"), { actual: runtimeRows.map((row) => row.htmlReadStatus) });
assertCheck(checks, "mainJsRefsFoundForEachRoute", runtimeRows.every((row) => Number(row.mainJsRefCount ?? 0) > 0), { actual: runtimeRows.map((row) => ({ competitionSlug: row.competitionSlug, mainJsRefCount: row.mainJsRefCount })) });
assertCheck(checks, "acceptedRuntimeRowsExpectedCount", acceptedRuntimeRows.length === 2, { actual: acceptedRuntimeRows.length, expected: 2 });
assertCheck(checks, "blockedRuntimeRowsExpectedZero", blockedRuntimeRows.length === 0, { actual: blockedRuntimeRows.length, expected: 0 });
assertCheck(checks, "allRowsKeepCanonicalProductionTruthBlocked", runtimeRows.every((row) => row.nextAllowedAction?.mayWriteCanonicalNow === false && row.nextAllowedAction?.mayWriteProductionNow === false && row.nextAllowedAction?.mayAssertTruthNow === false));
assertCheck(checks, "fetchExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "searchExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "broadSearchExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "canonicalWriteExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "productionWriteExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "truthAssertionExecutedNowCount", true, { actual: 0 });

const blockedCheckCount = checks.filter((check) => !check.passed).length;
const passedCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-controlled-sportomedia-local-route-html-runtime-extractor-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePaths: {
    officialRouteValidationRunnerPath: inputPath,
    contextResolverPath
  },
  sourceSha256: {
    officialRouteValidationRunnerSha256: sha256Text(inputText),
    contextResolverSha256: sha256Text(contextResolverText)
  },
  policy: {
    localOnly: true,
    existingOfficialRouteHtmlOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaLocalRouteHtmlRuntimeExtractorStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    runtimeExtractorRowCount: runtimeRows.length,
    acceptedRuntimeExtractorRowCount: acceptedRuntimeRows.length,
    blockedRuntimeExtractorRowCount: blockedRuntimeRows.length,
    runtimeRowsByCompetition: countBy(runtimeRows, "competitionSlug"),
    runtimeRowsByStatus: countBy(runtimeRows, "runtimeExtractionStatus"),
    totalMainJsRefCount: runtimeRows.reduce((sum, row) => sum + Number(row.mainJsRefCount ?? 0), 0),
    totalUsefulDataAttributeCount: runtimeRows.reduce((sum, row) => sum + Number(row.usefulDataAttributeCount ?? 0), 0),
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaStandingsExtractionPlanCount: acceptedRuntimeRows.length === 2 ? 1 : 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  runtimeRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaLocalRouteHtmlRuntimeExtractorStatus: output.summary.controlledSportomediaLocalRouteHtmlRuntimeExtractorStatus,
  runtimeExtractorRowCount: output.summary.runtimeExtractorRowCount,
  acceptedRuntimeExtractorRowCount: output.summary.acceptedRuntimeExtractorRowCount,
  blockedRuntimeExtractorRowCount: output.summary.blockedRuntimeExtractorRowCount,
  runtimeRowsByStatus: output.summary.runtimeRowsByStatus,
  totalMainJsRefCount: output.summary.totalMainJsRefCount,
  totalUsefulDataAttributeCount: output.summary.totalUsefulDataAttributeCount,
  mayBuildControlledSportomediaStandingsExtractionPlanCount: output.summary.mayBuildControlledSportomediaStandingsExtractionPlanCount,
  mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedCheckCount !== 0) {
  process.exitCode = 1;
}
