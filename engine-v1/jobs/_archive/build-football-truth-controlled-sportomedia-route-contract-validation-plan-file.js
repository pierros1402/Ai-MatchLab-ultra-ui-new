import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-contract-candidate-extractor-2026-06-16",
  "controlled-sportomedia-route-contract-candidate-extractor-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-contract-validation-plan-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-route-contract-validation-plan-2026-06-16.json"
);

const competitionHosts = {
  "swe.1": {
    competitionLabel: "Sweden Allsvenskan",
    officialHost: "allsvenskan.se",
    officialStandingsRoute: "https://allsvenskan.se/tabell"
  },
  "swe.2": {
    competitionLabel: "Sweden Superettan",
    officialHost: "superettan.se",
    officialStandingsRoute: "https://superettan.se/tabell"
  }
};

const expectedCompetitions = Object.keys(competitionHosts);

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

function candidateIncludes(row, needle) {
  return String(row.candidateValue ?? "").toLowerCase().includes(String(needle).toLowerCase());
}

function classesInclude(row, className) {
  return Array.isArray(row.candidateClasses) && row.candidateClasses.includes(className);
}

function selectEvidence(rows, predicate, limit = 12) {
  return rows
    .filter(predicate)
    .sort((a, b) => Number(b.candidateScore ?? 0) - Number(a.candidateScore ?? 0) || Number(b.sourceMarkerCount ?? 0) - Number(a.sourceMarkerCount ?? 0))
    .slice(0, limit)
    .map((row) => ({
      candidateRowId: row.sportomediaRouteContractCandidateRowId,
      candidateValue: row.candidateValue,
      candidateScore: row.candidateScore,
      candidateClasses: row.candidateClasses,
      sourceMarkerCount: row.sourceMarkerCount,
      sourceMarkers: row.sourceMarkers
    }));
}

function buildPlanRows(inputRows) {
  const rows = [];

  for (const competitionSlug of expectedCompetitions) {
    const host = competitionHosts[competitionSlug];
    const compRows = inputRows.filter((row) => row.competitionSlug === competitionSlug);

    const graphqlEvidence = selectEvidence(compRows, (row) =>
      classesInclude(row, "graphql_candidate") ||
      candidateIncludes(row, "gqlUri") ||
      candidateIncludes(row, "window.gqlURI") ||
      candidateIncludes(row, "graphql")
    );

    const standingsOperationEvidence = selectEvidence(compRows, (row) =>
      candidateIncludes(row, "standingsForLeague") ||
      classesInclude(row, "standings_candidate")
    );

    const standingsDomSchemaEvidence = selectEvidence(compRows, (row) =>
      candidateIncludes(row, "standings-table__") ||
      candidateIncludes(row, "standings-table--")
    );

    const routeEvidence = selectEvidence(compRows, (row) =>
      candidateIncludes(row, "/tabell") ||
      candidateIncludes(row, "/data-endpoint") ||
      classesInclude(row, "relative_route_candidate") ||
      classesInclude(row, "absolute_url_candidate")
    );

    const apiEvidence = selectEvidence(compRows, (row) =>
      classesInclude(row, "api_candidate") ||
      candidateIncludes(row, "data-endpoint") ||
      candidateIncludes(row, "endpointUrl")
    );

    rows.push({
      sportomediaRouteContractValidationPlanRowId: `sportomedia_route_contract_validation_plan_${competitionSlug.replace(".", "_")}_01`,
      competitionSlug,
      competitionLabel: host.competitionLabel,
      providerFamily: "sportomedia",
      validationKind: "local_graphql_runtime_binding_context_resolution",
      validationStatus: graphqlEvidence.length > 0 ? "ready_for_local_context_resolver" : "blocked_missing_graphql_runtime_candidate",
      evidenceCandidateCount: graphqlEvidence.length,
      evidenceCandidates: graphqlEvidence,
      nextAllowedAction: {
        mayReadExistingAssetFilesOnly: true,
        mayFetch: false,
        maySearch: false,
        mayWriteCanonical: false,
        mayWriteProduction: false,
        mayAssertTruth: false
      }
    });

    rows.push({
      sportomediaRouteContractValidationPlanRowId: `sportomedia_route_contract_validation_plan_${competitionSlug.replace(".", "_")}_02`,
      competitionSlug,
      competitionLabel: host.competitionLabel,
      providerFamily: "sportomedia",
      validationKind: "local_standings_operation_context_resolution",
      validationStatus: standingsOperationEvidence.length > 0 ? "ready_for_local_context_resolver" : "blocked_missing_standings_operation_candidate",
      evidenceCandidateCount: standingsOperationEvidence.length,
      evidenceCandidates: standingsOperationEvidence,
      nextAllowedAction: {
        mayReadExistingAssetFilesOnly: true,
        mayFetch: false,
        maySearch: false,
        mayWriteCanonical: false,
        mayWriteProduction: false,
        mayAssertTruth: false
      }
    });

    rows.push({
      sportomediaRouteContractValidationPlanRowId: `sportomedia_route_contract_validation_plan_${competitionSlug.replace(".", "_")}_03`,
      competitionSlug,
      competitionLabel: host.competitionLabel,
      providerFamily: "sportomedia",
      validationKind: "local_standings_dom_schema_confirmation",
      validationStatus: standingsDomSchemaEvidence.length > 0 ? "ready_for_local_context_resolver" : "blocked_missing_standings_dom_schema_candidate",
      evidenceCandidateCount: standingsDomSchemaEvidence.length,
      evidenceCandidates: standingsDomSchemaEvidence,
      nextAllowedAction: {
        mayReadExistingAssetFilesOnly: true,
        mayFetch: false,
        maySearch: false,
        mayWriteCanonical: false,
        mayWriteProduction: false,
        mayAssertTruth: false
      }
    });

    rows.push({
      sportomediaRouteContractValidationPlanRowId: `sportomedia_route_contract_validation_plan_${competitionSlug.replace(".", "_")}_04`,
      competitionSlug,
      competitionLabel: host.competitionLabel,
      providerFamily: "sportomedia",
      validationKind: "controlled_official_standings_route_validation_candidate",
      validationStatus: routeEvidence.length > 0 ? "ready_for_future_controlled_route_validation_after_user_approval" : "blocked_missing_route_candidate",
      officialStandingsRoute: host.officialStandingsRoute,
      officialHost: host.officialHost,
      evidenceCandidateCount: routeEvidence.length,
      evidenceCandidates: routeEvidence,
      nextAllowedAction: {
        mayReadExistingAssetFilesOnly: false,
        mayFetchOnlyThisOfficialStandingsRouteAfterExplicitApproval: true,
        mayFetchNow: false,
        maySearch: false,
        mayWriteCanonical: false,
        mayWriteProduction: false,
        mayAssertTruth: false
      }
    });

    rows.push({
      sportomediaRouteContractValidationPlanRowId: `sportomedia_route_contract_validation_plan_${competitionSlug.replace(".", "_")}_05`,
      competitionSlug,
      competitionLabel: host.competitionLabel,
      providerFamily: "sportomedia",
      validationKind: "local_data_endpoint_binding_context_resolution",
      validationStatus: apiEvidence.length > 0 ? "ready_for_local_context_resolver" : "blocked_missing_data_endpoint_candidate",
      evidenceCandidateCount: apiEvidence.length,
      evidenceCandidates: apiEvidence,
      nextAllowedAction: {
        mayReadExistingAssetFilesOnly: true,
        mayFetch: false,
        maySearch: false,
        mayWriteCanonical: false,
        mayWriteProduction: false,
        mayAssertTruth: false
      }
    });
  }

  return rows;
}

function assertCheck(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing route contract candidate extractor output: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const candidateRows = Array.isArray(input.candidateRows) ? input.candidateRows : [];
const highPriorityCandidateRows = Array.isArray(input.highPriorityCandidateRows) ? input.highPriorityCandidateRows : [];
const planRows = buildPlanRows(candidateRows);

const readyPlanRows = planRows.filter((row) => String(row.validationStatus).startsWith("ready_"));
const blockedPlanRows = planRows.filter((row) => String(row.validationStatus).startsWith("blocked_"));
const localContextRows = planRows.filter((row) => row.nextAllowedAction?.mayReadExistingAssetFilesOnly === true);
const futureFetchRows = planRows.filter((row) => row.nextAllowedAction?.mayFetchOnlyThisOfficialStandingsRouteAfterExplicitApproval === true);

const checks = [];
assertCheck(checks, "sourceExtractorPassed", input.summary?.controlledSportomediaRouteContractCandidateExtractorStatus === "passed", { actual: input.summary?.controlledSportomediaRouteContractCandidateExtractorStatus });
assertCheck(checks, "sourceHighPriorityCandidatesExist", Number(input.summary?.highPriorityRouteContractCandidateRowCount ?? 0) > 0, { actual: input.summary?.highPriorityRouteContractCandidateRowCount });
assertCheck(checks, "sourceNoFetchSearchCanonicalProductionTruth", Number(input.summary?.fetchExecutedNowCount ?? -1) === 0 && Number(input.summary?.searchExecutedNowCount ?? -1) === 0 && Number(input.summary?.broadSearchExecutedNowCount ?? -1) === 0 && Number(input.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
assertCheck(checks, "validationPlanRowsExpectedCount", planRows.length === 10, { actual: planRows.length, expected: 10 });
assertCheck(checks, "validationPlanCoversExpectedCompetitions", JSON.stringify(uniqueSorted(planRows.map((row) => row.competitionSlug))) === JSON.stringify(expectedCompetitions), { actual: uniqueSorted(planRows.map((row) => row.competitionSlug)), expected: expectedCompetitions });
assertCheck(checks, "readyPlanRowsExist", readyPlanRows.length > 0, { actual: readyPlanRows.length });
assertCheck(checks, "localContextRowsExist", localContextRows.length === 8, { actual: localContextRows.length, expected: 8 });
assertCheck(checks, "futureFetchRowsAreRouteOnly", futureFetchRows.length === 2 && futureFetchRows.every((row) => row.validationKind === "controlled_official_standings_route_validation_candidate"), { actual: futureFetchRows.length, expected: 2 });
assertCheck(checks, "futureFetchRowsStillBlockFetchNow", futureFetchRows.every((row) => row.nextAllowedAction?.mayFetchNow === false));
assertCheck(checks, "allRowsBlockSearchCanonicalProductionTruth", planRows.every((row) => row.nextAllowedAction?.maySearch === false && row.nextAllowedAction?.mayWriteCanonical === false && row.nextAllowedAction?.mayWriteProduction === false && row.nextAllowedAction?.mayAssertTruth === false));
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
  job: "build-football-truth-controlled-sportomedia-route-contract-validation-plan-file",
  generatedAtUtc: new Date().toISOString(),
  inputPath,
  inputSha256: sha256Text(inputText),
  policy: {
    planOnly: true,
    localOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaRouteContractValidationPlanStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    sourceCandidateRowCount: candidateRows.length,
    sourceHighPriorityCandidateRowCount: highPriorityCandidateRows.length,
    validationPlanRowCount: planRows.length,
    readyValidationPlanRowCount: readyPlanRows.length,
    blockedValidationPlanRowCount: blockedPlanRows.length,
    localContextValidationRowCount: localContextRows.length,
    futureControlledFetchValidationRowCount: futureFetchRows.length,
    validationPlanRowsByCompetition: countBy(planRows, "competitionSlug"),
    validationPlanRowsByStatus: countBy(planRows, "validationStatus"),
    validationPlanRowsByKind: countBy(planRows, "validationKind"),
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaLocalContextResolverCount: localContextRows.length > 0 ? 1 : 0,
    mayBuildControlledSportomediaOfficialRouteValidationRunnerCount: futureFetchRows.length === 2 ? 1 : 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  validationPlanRows: planRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaRouteContractValidationPlanStatus: output.summary.controlledSportomediaRouteContractValidationPlanStatus,
  sourceCandidateRowCount: output.summary.sourceCandidateRowCount,
  sourceHighPriorityCandidateRowCount: output.summary.sourceHighPriorityCandidateRowCount,
  validationPlanRowCount: output.summary.validationPlanRowCount,
  readyValidationPlanRowCount: output.summary.readyValidationPlanRowCount,
  blockedValidationPlanRowCount: output.summary.blockedValidationPlanRowCount,
  localContextValidationRowCount: output.summary.localContextValidationRowCount,
  futureControlledFetchValidationRowCount: output.summary.futureControlledFetchValidationRowCount,
  mayBuildControlledSportomediaLocalContextResolverCount: output.summary.mayBuildControlledSportomediaLocalContextResolverCount,
  mayBuildControlledSportomediaOfficialRouteValidationRunnerCount: output.summary.mayBuildControlledSportomediaOfficialRouteValidationRunnerCount,
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
