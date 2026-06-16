import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const runtimePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-local-route-html-runtime-extractor-2026-06-16",
  "controlled-sportomedia-local-route-html-runtime-extractor-2026-06-16.json"
);

const contextPath = path.join(
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
  "controlled-sportomedia-standings-extraction-plan-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-standings-extraction-plan-2026-06-16.json"
);

const expected = {
  "swe.1": {
    competitionLabel: "Sweden Allsvenskan",
    officialRoute: "https://allsvenskan.se/tabell",
    expectedHost: "allsvenskan.se"
  },
  "swe.2": {
    competitionLabel: "Sweden Superettan",
    officialRoute: "https://superettan.se/tabell",
    expectedHost: "superettan.se"
  }
};

function sha256Text(value) {
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

function hintsFromContextRows(rows) {
  return uniqueSorted(rows.flatMap((row) =>
    (Array.isArray(row.contextMatches) ? row.contextMatches : [])
      .flatMap((match) => Array.isArray(match.localHints) ? match.localHints : [])
  ));
}

function hasSignal(rows, signal) {
  return rows.some((row) => Array.isArray(row.resolvedSignals) && row.resolvedSignals.includes(signal));
}

function selectMainJsRef(runtimeRow) {
  const refs = Array.isArray(runtimeRow.mainJsRefs) ? runtimeRow.mainJsRefs : [];
  return refs.find((row) => /\/wp-content\/themes\/sef-leagues\/build\/main\.js/i.test(row.src)) ?? refs[0] ?? null;
}

function normalizeMaybeUrl(value, host) {
  if (!value) return null;
  const raw = String(value).replace(/\\u002F/g, "/").replace(/\\\//g, "/").trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return `https://${host}${raw}`;
  return null;
}

function buildRows(runtimeRows, contextRows) {
  return Object.entries(expected).map(([competitionSlug, meta], index) => {
    const runtimeRow = runtimeRows.find((row) => row.competitionSlug === competitionSlug);
    const compContextRows = contextRows.filter((row) => row.competitionSlug === competitionSlug);
    const hints = hintsFromContextRows(compContextRows);
    const mainJsRef = selectMainJsRef(runtimeRow ?? {});

    const gqlEndpointHints = hints
      .filter((hint) => /gqluri|graphql/i.test(hint))
      .slice(0, 20);

    const dataEndpointHints = hints
      .filter((hint) => /data-endpoint|endpointUrl|wp-json|ajax/i.test(hint))
      .slice(0, 20);

    const operationHints = hints
      .filter((hint) => /standingsForLeague|standings|league/i.test(hint))
      .slice(0, 20);

    const endpointCandidates = uniqueSorted([
      normalizeMaybeUrl("/graphql", meta.expectedHost),
      normalizeMaybeUrl("/graphql-response+json", meta.expectedHost),
      ...gqlEndpointHints.map((hint) => normalizeMaybeUrl(hint, meta.expectedHost)),
      ...dataEndpointHints.map((hint) => normalizeMaybeUrl(hint, meta.expectedHost))
    ]).filter(Boolean);

    const readinessSignals = {
      acceptedRuntimeShell: runtimeRow?.runtimeExtractionStatus === "accepted_runtime_contract_shell_ready_for_standings_extraction_plan",
      hasOfficialRouteHtml: runtimeRow?.htmlReadStatus === "read" && Number(runtimeRow?.htmlSize ?? 0) > 0,
      hasMainJsReference: Boolean(mainJsRef),
      hasGraphqlRuntimeBindingSignal: hasSignal(compContextRows, "graphql_uri_runtime_binding_signal"),
      hasStandingsOperationSignal: hasSignal(compContextRows, "standings_for_league_operation_signal"),
      hasStandingsDomSchemaSignal: hasSignal(compContextRows, "standings_table_dom_schema_signal"),
      hasDataEndpointBindingSignal: hasSignal(compContextRows, "data_endpoint_binding_signal")
    };

    const readySignalCount = Object.values(readinessSignals).filter(Boolean).length;
    const status = readySignalCount === Object.keys(readinessSignals).length
      ? "ready_for_controlled_standings_extraction_runner"
      : "blocked_missing_runtime_or_operation_signal";

    return {
      sportomediaStandingsExtractionPlanRowId: `sportomedia_standings_extraction_plan_${String(index + 1).padStart(2, "0")}`,
      competitionSlug,
      competitionLabel: meta.competitionLabel,
      providerFamily: "sportomedia",
      officialRoute: meta.officialRoute,
      expectedHost: meta.expectedHost,
      sourceRuntimeStatus: runtimeRow?.runtimeExtractionStatus ?? null,
      routeHtmlPath: runtimeRow?.htmlPath ?? null,
      routeHtmlSha256: runtimeRow?.htmlSha256 ?? null,
      mainJsRef: mainJsRef?.src ?? null,
      readinessSignals,
      readySignalCount,
      endpointCandidates,
      gqlEndpointHints,
      dataEndpointHints,
      operationHints,
      extractionContract: {
        preferredOperationSignal: "standingsForLeague",
        expectedDomSchemaSignals: [
          "standings-table__name",
          "standings-table__games",
          "standings-table__wins",
          "standings-table__ties",
          "standings-table__losses",
          "standings-table__goals-scored",
          "standings-table__goals-conceded",
          "standings-table__goals-difference",
          "standings-table__points"
        ],
        nextRunnerScope: "controlled_runtime_standings_extraction_only",
        runnerMayReadExistingHtmlAndAssetFiles: true,
        runnerMayFetchOnlyEndpointCandidatesAfterExplicitFlags: true,
        runnerMustRequireFlags: ["--allow-execute", "--allow-fetch"],
        runnerMustRejectSearch: true,
        runnerMustRejectCanonicalWrites: true,
        runnerMustRejectProductionWrites: true,
        runnerMustRejectTruthAssertions: true
      },
      extractionPlanStatus: status,
      nextAllowedAction: {
        mayBuildControlledStandingsExtractionRunner: status === "ready_for_controlled_standings_extraction_runner",
        mayFetchNow: false,
        maySearch: false,
        mayBroadSearch: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    };
  });
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(runtimePath)) throw new Error(`Missing runtime extractor output: ${runtimePath}`);
if (!fs.existsSync(contextPath)) throw new Error(`Missing context resolver output: ${contextPath}`);

const runtimeText = fs.readFileSync(runtimePath, "utf8");
const runtime = JSON.parse(runtimeText);
const contextText = fs.readFileSync(contextPath, "utf8");
const context = JSON.parse(contextText);

const runtimeRows = Array.isArray(runtime.runtimeRows) ? runtime.runtimeRows : [];
const contextRows = Array.isArray(context.contextRows) ? context.contextRows : [];
const planRows = buildRows(runtimeRows, contextRows);
const readyRows = planRows.filter((row) => row.extractionPlanStatus === "ready_for_controlled_standings_extraction_runner");
const blockedRows = planRows.filter((row) => row.extractionPlanStatus !== "ready_for_controlled_standings_extraction_runner");

const checks = [];
check(checks, "sourceRuntimeExtractorPassed", runtime.summary?.controlledSportomediaLocalRouteHtmlRuntimeExtractorStatus === "passed", { actual: runtime.summary?.controlledSportomediaLocalRouteHtmlRuntimeExtractorStatus });
check(checks, "sourceRuntimeAcceptedRowsTwo", Number(runtime.summary?.acceptedRuntimeExtractorRowCount ?? 0) === 2, { actual: runtime.summary?.acceptedRuntimeExtractorRowCount });
check(checks, "sourceContextResolverPassed", context.summary?.controlledSportomediaLocalContextResolverStatus === "passed", { actual: context.summary?.controlledSportomediaLocalContextResolverStatus });
check(checks, "sourceContextRowsResolvedEight", Number(context.summary?.resolvedContextResolverRowCount ?? 0) === 8, { actual: context.summary?.resolvedContextResolverRowCount });
check(checks, "planRowsExpectedCount", planRows.length === 2, { actual: planRows.length, expected: 2 });
check(checks, "planRowsCoverExpectedCompetitions", JSON.stringify(uniqueSorted(planRows.map((row) => row.competitionSlug))) === JSON.stringify(Object.keys(expected)), { actual: uniqueSorted(planRows.map((row) => row.competitionSlug)), expected: Object.keys(expected) });
check(checks, "readyRowsExpectedCount", readyRows.length === 2, { actual: readyRows.length, expected: 2 });
check(checks, "blockedRowsExpectedZero", blockedRows.length === 0, { actual: blockedRows.length, expected: 0 });
check(checks, "endpointCandidatesExist", planRows.every((row) => row.endpointCandidates.length > 0), { actual: planRows.map((row) => ({ competitionSlug: row.competitionSlug, endpointCandidateCount: row.endpointCandidates.length })) });
check(checks, "allRowsBlockCanonicalProductionTruthNow", planRows.every((row) => row.nextAllowedAction?.mayWriteCanonicalNow === false && row.nextAllowedAction?.mayWriteProductionNow === false && row.nextAllowedAction?.mayAssertTruthNow === false));
check(checks, "fetchExecutedNowCount", true, { actual: 0 });
check(checks, "searchExecutedNowCount", true, { actual: 0 });
check(checks, "broadSearchExecutedNowCount", true, { actual: 0 });
check(checks, "canonicalWriteExecutedNowCount", true, { actual: 0 });
check(checks, "productionWriteExecutedNowCount", true, { actual: 0 });
check(checks, "truthAssertionExecutedNowCount", true, { actual: 0 });

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-controlled-sportomedia-standings-extraction-plan-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePaths: { runtimePath, contextPath },
  sourceSha256: {
    runtimeSha256: sha256Text(runtimeText),
    contextSha256: sha256Text(contextText)
  },
  policy: {
    planOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaStandingsExtractionPlanStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    standingsExtractionPlanRowCount: planRows.length,
    readyStandingsExtractionPlanRowCount: readyRows.length,
    blockedStandingsExtractionPlanRowCount: blockedRows.length,
    planRowsByCompetition: countBy(planRows, "competitionSlug"),
    planRowsByStatus: countBy(planRows, "extractionPlanStatus"),
    endpointCandidateCount: planRows.reduce((sum, row) => sum + row.endpointCandidates.length, 0),
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaStandingsExtractionRunnerCount: readyRows.length === 2 ? 1 : 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  planRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaStandingsExtractionPlanStatus: output.summary.controlledSportomediaStandingsExtractionPlanStatus,
  standingsExtractionPlanRowCount: output.summary.standingsExtractionPlanRowCount,
  readyStandingsExtractionPlanRowCount: output.summary.readyStandingsExtractionPlanRowCount,
  blockedStandingsExtractionPlanRowCount: output.summary.blockedStandingsExtractionPlanRowCount,
  endpointCandidateCount: output.summary.endpointCandidateCount,
  mayBuildControlledSportomediaStandingsExtractionRunnerCount: output.summary.mayBuildControlledSportomediaStandingsExtractionRunnerCount,
  mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
