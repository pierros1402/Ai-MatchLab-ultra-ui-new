import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join(
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
  "controlled-sportomedia-route-contract-review-board-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-route-contract-review-board-2026-06-16.json"
);

const competitions = {
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

const requiredKinds = [
  "local_graphql_runtime_binding_context_resolution",
  "local_standings_operation_context_resolution",
  "local_standings_dom_schema_confirmation",
  "local_data_endpoint_binding_context_resolution"
];

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

function rowForKind(rows, kind) {
  return rows.find((row) => row.validationKind === kind) ?? null;
}

function signalNames(row) {
  return Array.isArray(row?.resolvedSignals) ? row.resolvedSignals : [];
}

function hintsForRow(row, limit = 20) {
  const matches = Array.isArray(row?.contextMatches) ? row.contextMatches : [];
  return uniqueSorted(matches.flatMap((match) => Array.isArray(match.localHints) ? match.localHints : [])).slice(0, limit);
}

function buildReviewRows(contextRows) {
  return Object.entries(competitions).map(([competitionSlug, meta], index) => {
    const rows = contextRows.filter((row) => row.competitionSlug === competitionSlug);
    const byKind = Object.fromEntries(requiredKinds.map((kind) => [kind, rowForKind(rows, kind)]));

    const graphqlRow = byKind.local_graphql_runtime_binding_context_resolution;
    const standingsOperationRow = byKind.local_standings_operation_context_resolution;
    const domSchemaRow = byKind.local_standings_dom_schema_confirmation;
    const endpointRow = byKind.local_data_endpoint_binding_context_resolution;

    const graphqlSignals = signalNames(graphqlRow);
    const standingsOperationSignals = signalNames(standingsOperationRow);
    const domSchemaSignals = signalNames(domSchemaRow);
    const endpointSignals = signalNames(endpointRow);

    const reviewSignals = {
      hasResolvedGraphqlRuntimeBinding:
        graphqlRow?.resolverStatus === "resolved_local_context_candidates" &&
        (graphqlSignals.includes("graphql_uri_runtime_binding_signal") || graphqlSignals.includes("graphql_general_signal")),
      hasResolvedStandingsOperation:
        standingsOperationRow?.resolverStatus === "resolved_local_context_candidates" &&
        standingsOperationSignals.includes("standings_for_league_operation_signal"),
      hasResolvedStandingsDomSchema:
        domSchemaRow?.resolverStatus === "resolved_local_context_candidates" &&
        domSchemaSignals.includes("standings_table_dom_schema_signal"),
      hasResolvedDataEndpointBinding:
        endpointRow?.resolverStatus === "resolved_local_context_candidates" &&
        endpointSignals.includes("data_endpoint_binding_signal")
    };

    const acceptedSignalCount = Object.values(reviewSignals).filter(Boolean).length;
    const missingSignals = Object.entries(reviewSignals)
      .filter(([, value]) => !value)
      .map(([key]) => key);

    const status = acceptedSignalCount === 4
      ? "accepted_local_route_contract_requires_controlled_official_route_validation"
      : "blocked_local_route_contract_missing_required_signals";

    return {
      sportomediaRouteContractReviewBoardRowId: `sportomedia_route_contract_review_board_${String(index + 1).padStart(2, "0")}`,
      competitionSlug,
      competitionLabel: meta.competitionLabel,
      providerFamily: "sportomedia",
      officialHost: meta.officialHost,
      officialStandingsRoute: meta.officialStandingsRoute,
      reviewStatus: status,
      acceptedSignalCount,
      requiredSignalCount: 4,
      missingSignals,
      reviewSignals,
      evidence: {
        graphqlRuntimeBinding: {
          sourceResolverRowId: graphqlRow?.sportomediaLocalContextResolverRowId ?? null,
          matchedNeedles: graphqlRow?.matchedNeedles ?? [],
          resolvedSignals: graphqlSignals,
          localHints: hintsForRow(graphqlRow)
        },
        standingsOperation: {
          sourceResolverRowId: standingsOperationRow?.sportomediaLocalContextResolverRowId ?? null,
          matchedNeedles: standingsOperationRow?.matchedNeedles ?? [],
          resolvedSignals: standingsOperationSignals,
          localHints: hintsForRow(standingsOperationRow)
        },
        standingsDomSchema: {
          sourceResolverRowId: domSchemaRow?.sportomediaLocalContextResolverRowId ?? null,
          matchedNeedles: domSchemaRow?.matchedNeedles ?? [],
          resolvedSignals: domSchemaSignals,
          localHints: hintsForRow(domSchemaRow)
        },
        dataEndpointBinding: {
          sourceResolverRowId: endpointRow?.sportomediaLocalContextResolverRowId ?? null,
          matchedNeedles: endpointRow?.matchedNeedles ?? [],
          resolvedSignals: endpointSignals,
          localHints: hintsForRow(endpointRow)
        }
      },
      nextAllowedAction: {
        mayBuildControlledOfficialRouteValidationRunner: acceptedSignalCount === 4,
        mayFetchNow: false,
        mayFetchOnlyOfficialStandingsRouteAfterExplicitApproval: acceptedSignalCount === 4,
        maySearch: false,
        mayBroadSearch: false,
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

function assertCheck(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing local context resolver output: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const contextRows = Array.isArray(input.contextRows) ? input.contextRows : [];
const reviewRows = buildReviewRows(contextRows);
const acceptedRows = reviewRows.filter((row) => row.reviewStatus === "accepted_local_route_contract_requires_controlled_official_route_validation");
const blockedRows = reviewRows.filter((row) => row.reviewStatus !== "accepted_local_route_contract_requires_controlled_official_route_validation");

const checks = [];
assertCheck(checks, "sourceContextResolverPassed", input.summary?.controlledSportomediaLocalContextResolverStatus === "passed", { actual: input.summary?.controlledSportomediaLocalContextResolverStatus });
assertCheck(checks, "sourceContextResolverRowsEight", Number(input.summary?.contextResolverRowCount ?? 0) === 8, { actual: input.summary?.contextResolverRowCount });
assertCheck(checks, "sourceResolvedRowsEight", Number(input.summary?.resolvedContextResolverRowCount ?? 0) === 8, { actual: input.summary?.resolvedContextResolverRowCount });
assertCheck(checks, "sourceNoFetchSearchCanonicalProductionTruth", Number(input.summary?.fetchExecutedNowCount ?? -1) === 0 && Number(input.summary?.searchExecutedNowCount ?? -1) === 0 && Number(input.summary?.broadSearchExecutedNowCount ?? -1) === 0 && Number(input.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
assertCheck(checks, "reviewRowsExpectedCount", reviewRows.length === 2, { actual: reviewRows.length, expected: 2 });
assertCheck(checks, "reviewRowsCoverExpectedCompetitions", JSON.stringify(uniqueSorted(reviewRows.map((row) => row.competitionSlug))) === JSON.stringify(Object.keys(competitions)), { actual: uniqueSorted(reviewRows.map((row) => row.competitionSlug)), expected: Object.keys(competitions) });
assertCheck(checks, "acceptedRowsExpectedCount", acceptedRows.length === 2, { actual: acceptedRows.length, expected: 2 });
assertCheck(checks, "blockedRowsExpectedZero", blockedRows.length === 0, { actual: blockedRows.length, expected: 0 });
assertCheck(checks, "allAcceptedRowsStillRequireControlledOfficialRouteValidation", acceptedRows.every((row) => row.nextAllowedAction?.mayFetchOnlyOfficialStandingsRouteAfterExplicitApproval === true && row.nextAllowedAction?.mayFetchNow === false));
assertCheck(checks, "allRowsBlockSearchCanonicalProductionTruth", reviewRows.every((row) => row.nextAllowedAction?.maySearch === false && row.nextAllowedAction?.mayBroadSearch === false && row.nextAllowedAction?.mayWriteCanonical === false && row.nextAllowedAction?.mayWriteProduction === false && row.nextAllowedAction?.mayAssertTruth === false));
assertCheck(checks, "canonicalWriteAllowedNowFalse", reviewRows.every((row) => row.canonicalWriteAllowedNow === false));
assertCheck(checks, "productionWriteAllowedNowFalse", reviewRows.every((row) => row.productionWriteAllowedNow === false));
assertCheck(checks, "truthAssertionAllowedNowFalse", reviewRows.every((row) => row.truthAssertionAllowedNow === false));
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
  job: "build-football-truth-controlled-sportomedia-route-contract-review-board-file",
  generatedAtUtc: new Date().toISOString(),
  inputPath,
  inputSha256: sha256Text(inputText),
  policy: {
    localOnly: true,
    reviewBoardOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaRouteContractReviewBoardStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    sourceContextResolverRowCount: contextRows.length,
    routeContractReviewRowCount: reviewRows.length,
    acceptedRouteContractReviewRowCount: acceptedRows.length,
    blockedRouteContractReviewRowCount: blockedRows.length,
    reviewRowsByCompetition: countBy(reviewRows, "competitionSlug"),
    reviewRowsByStatus: countBy(reviewRows, "reviewStatus"),
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaOfficialRouteValidationRunnerCount: acceptedRows.length === 2 ? 1 : 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  reviewRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaRouteContractReviewBoardStatus: output.summary.controlledSportomediaRouteContractReviewBoardStatus,
  routeContractReviewRowCount: output.summary.routeContractReviewRowCount,
  acceptedRouteContractReviewRowCount: output.summary.acceptedRouteContractReviewRowCount,
  blockedRouteContractReviewRowCount: output.summary.blockedRouteContractReviewRowCount,
  reviewRowsByCompetition: output.summary.reviewRowsByCompetition,
  reviewRowsByStatus: output.summary.reviewRowsByStatus,
  mayBuildControlledSportomediaOfficialRouteValidationRunnerCount: output.summary.mayBuildControlledSportomediaOfficialRouteValidationRunnerCount,
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
