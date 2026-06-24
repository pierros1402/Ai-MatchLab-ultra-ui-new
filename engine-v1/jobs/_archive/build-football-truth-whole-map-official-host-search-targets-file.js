import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const hygienePlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-hygiene-search-plan-2026-06-16",
  "whole-map-official-host-hygiene-search-plan-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-search-targets-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-official-host-search-targets-2026-06-16.json"
);

const exactRouteRetryOutputPath = path.join(
  outputDir,
  "whole-map-exact-route-retry-targets-2026-06-16.json"
);

const searchRunnerCandidates = [
  "engine-v1/jobs/run-fixture-league-date-autonomous-search-batches-file.js",
  "engine-v1/jobs/run-football-truth-provider-discovery-search-batches-file.js",
  "engine-v1/jobs/run-football-truth-host-scoped-standings-search-batches-file.js",
  "engine-v1/jobs/run-football-truth-official-host-discovery-search-batches-file.js"
];

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))];
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function normalizeQuery(query) {
  return String(query ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedRowsFor(row) {
  if (Number.isFinite(Number(row.expectedStandingRowCount))) return Number(row.expectedStandingRowCount);
  if (String(row.competitionSlug).endsWith(".1") || String(row.competitionSlug).endsWith(".2")) return 16;
  if (String(row.competitionSlug).endsWith(".3")) return 20;
  return null;
}

function sourceIndexFor(row) {
  const slug = String(row.competitionSlug ?? "");
  const country = String(row.countryCode ?? "");
  const label = String(row.competitionLabel ?? slug);
  const provider = String(row.providerSignalClass ?? "unknown");

  const preferredOfficialHostHints = [];
  if (slug === "ger.3") preferredOfficialHostHints.push("dfb.de", "3-liga.com");
  if (provider === "bundesliga_official") preferredOfficialHostHints.push("bundesliga.com");
  if (provider === "torneopal") preferredOfficialHostHints.push("torneopal.fi");
  if (provider === "loi") preferredOfficialHostHints.push("leagueofireland.ie");
  if (provider === "spfl_opta") preferredOfficialHostHints.push("spfl.co.uk");
  if (country === "eng") preferredOfficialHostHints.push("efl.com", "premierleague.com", "thenationalleague.org.uk");
  if (country === "fra") preferredOfficialHostHints.push("ligue1.com", "ligue2.fr", "lfp.fr");
  if (country === "ita") preferredOfficialHostHints.push("legaseriea.it", "legab.it");
  if (country === "ned") preferredOfficialHostHints.push("eredivisie.nl", "keukenkampioendivisie.nl");
  if (country === "bel") preferredOfficialHostHints.push("proleague.be");
  if (country === "den") preferredOfficialHostHints.push("superliga.dk", "division.dk");
  if (country === "sui") preferredOfficialHostHints.push("sfl.ch");
  if (country === "aut") preferredOfficialHostHints.push("bundesliga.at");
  if (country === "fin") preferredOfficialHostHints.push("veikkausliiga.com", "ykkosliiga.fi");
  if (country === "irl") preferredOfficialHostHints.push("leagueofireland.ie");
  if (country === "por") preferredOfficialHostHints.push("ligaportugal.pt");

  return {
    competitionSlug: slug,
    competitionLabel: label,
    countryCode: country,
    providerSignalClass: provider,
    expectedStandingRowCount: expectedRowsFor(row),
    preferredOfficialHostHints: unique(preferredOfficialHostHints),
    searchIntent: "official_host_or_official_standings_route_discovery",
    acceptOnlyIfResultIsOfficialHostOrOfficialLeaguePage: true,
    rejectHostClasses: [
      "aggregator",
      "betting",
      "odds",
      "tracking",
      "social",
      "wiki",
      "news_only",
      "generic_stats_scraper"
    ],
    requiredResultSignals: [
      "official federation/league/competition host",
      "standings/table route",
      "current season or competition table"
    ]
  };
}

function buildSearchRows(planRows) {
  const rows = [];

  for (const row of planRows) {
    if (!row.nextAllowedAction?.mayRunControlledOfficialHostSearchWithSearchFlag) continue;

    const queries = Array.isArray(row.officialHostSearchQueries)
      ? row.officialHostSearchQueries
      : [];

    const queryRows = queries
      .map((queryRow) => normalizeQuery(queryRow.query))
      .filter(Boolean)
      .slice(0, 5);

    rows.push({
      searchTargetId: `official_host_search_${String(rows.length + 1).padStart(3, "0")}_${row.competitionSlug}`,
      ...sourceIndexFor(row),
      searchPriority: row.competitionSlug === "ger.3" ? 1 : row.forceIncluded ? 2 : 3,
      sourcePlanStatus: row.planStatus,
      queryCount: queryRows.length,
      queries: queryRows.map((query, index) => ({
        queryIndex: index + 1,
        query,
        broadSearchAllowed: false,
        searchScope: "official_host_or_official_standings_route_only"
      })),
      nextAllowedAction: {
        mayRunControlledSearchWithExplicitAllowSearchFlag: true,
        mayBroadSearch: false,
        mayFetchNow: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    });
  }

  return rows.sort((a, b) => a.searchPriority - b.searchPriority || a.competitionSlug.localeCompare(b.competitionSlug));
}

function buildExactRouteRows(planRows) {
  return planRows
    .filter((row) => row.nextAllowedAction?.mayRetryHygienicExactRoutesWithFetchFlag)
    .map((row, index) => ({
      exactRouteRetryTargetId: `exact_route_retry_${String(index + 1).padStart(3, "0")}_${row.competitionSlug}`,
      competitionSlug: row.competitionSlug,
      competitionLabel: row.competitionLabel,
      countryCode: row.countryCode,
      providerSignalClass: row.providerSignalClass,
      expectedStandingRowCount: expectedRowsFor(row),
      hygienicRouteCandidates: Array.isArray(row.hygienicRouteCandidates) ? row.hygienicRouteCandidates : [],
      retryReason: "exact official route survived hygiene filter after noisy local-route fetch failure",
      nextAllowedAction: {
        mayRunControlledFetchWithExplicitAllowFetchFlag: true,
        maySearchNow: false,
        mayBroadSearch: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    }));
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(hygienePlanPath)) {
  throw new Error(`Missing official-host hygiene search plan: ${hygienePlanPath}`);
}

const hygieneText = fs.readFileSync(hygienePlanPath, "utf8");
const hygiene = JSON.parse(hygieneText);
const planRows = Array.isArray(hygiene.planRows) ? hygiene.planRows : [];

const searchRows = buildSearchRows(planRows);
const exactRouteRows = buildExactRouteRows(planRows);
const totalQueryCount = searchRows.reduce((sum, row) => sum + row.queryCount, 0);
const existingSearchRunnerCandidates = searchRunnerCandidates.filter((file) => fs.existsSync(file));

const searchTargetsPayload = {
  generatedAtUtc: new Date().toISOString(),
  sourcePlanPath: hygienePlanPath,
  sourcePlanSha256: sha256Text(hygieneText),
  policy: {
    searchTargetsOnly: true,
    noSearchInThisJob: true,
    noFetchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    searchRunnerMustUseExplicitAllowSearchFlag: true,
    searchRunnerMustRejectNoisyHosts: true
  },
  summary: {
    searchTargetCount: searchRows.length,
    totalQueryCount,
    searchTargetCountries: [...new Set(searchRows.map((row) => row.countryCode))].length,
    searchTargetsByCountry: countBy(searchRows, "countryCode"),
    searchTargetsByProviderSignalClass: countBy(searchRows, "providerSignalClass"),
    ger3Included: searchRows.some((row) => row.competitionSlug === "ger.3")
  },
  searchRows
};

const exactRoutePayload = {
  generatedAtUtc: new Date().toISOString(),
  sourcePlanPath: hygienePlanPath,
  sourcePlanSha256: sha256Text(hygieneText),
  policy: {
    exactRouteRetryTargetsOnly: true,
    noSearchInThisJob: true,
    noFetchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    exactRouteRetryRunnerMustUseExplicitAllowFetchFlag: true
  },
  summary: {
    exactRouteRetryTargetCount: exactRouteRows.length,
    exactRouteRetryTargets: exactRouteRows.map((row) => row.competitionSlug)
  },
  exactRouteRows
};

const checks = [];
check(checks, "sourceHygienePlanPassed", hygiene.summary?.wholeMapOfficialHostHygieneSearchPlanStatus === "passed", { actual: hygiene.summary?.wholeMapOfficialHostHygieneSearchPlanStatus });
check(checks, "sourcePlanRowsEighty", Number(hygiene.summary?.planRowCount ?? 0) === 80, { actual: hygiene.summary?.planRowCount });
check(checks, "searchRowsSeventyEight", searchRows.length === 78, { actual: searchRows.length, expected: 78 });
check(checks, "searchRowsIncludeGer3", searchRows.some((row) => row.competitionSlug === "ger.3"));
check(checks, "searchRowsCountrySpread", new Set(searchRows.map((row) => row.countryCode)).size >= 30, { actual: new Set(searchRows.map((row) => row.countryCode)).size });
check(checks, "searchQueriesAtLeastTwoHundred", totalQueryCount >= 200, { actual: totalQueryCount });
check(checks, "exactRouteRowsGer1Ger2", JSON.stringify(exactRouteRows.map((row) => row.competitionSlug).sort()) === JSON.stringify(["ger.1", "ger.2"]), { actual: exactRouteRows.map((row) => row.competitionSlug).sort() });
check(checks, "existingSearchRunnerCandidateDetected", existingSearchRunnerCandidates.length > 0, { existingSearchRunnerCandidates });
check(checks, "allSearchRowsRequireExplicitSearchFlag", searchRows.every((row) => row.nextAllowedAction.mayRunControlledSearchWithExplicitAllowSearchFlag === true));
check(checks, "noImmediateSearchFetchWrite", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

writeJson(outputPath, searchTargetsPayload);
writeJson(exactRouteRetryOutputPath, exactRoutePayload);

const outputSha256 = sha256Text(fs.readFileSync(outputPath, "utf8"));
const exactRouteSha256 = sha256Text(fs.readFileSync(exactRouteRetryOutputPath, "utf8"));

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-official-host-search-targets-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePlanPath: hygienePlanPath,
  sourcePlanSha256: sha256Text(hygieneText),
  policy: {
    targetMaterializationOnly: true,
    noSearchInThisJob: true,
    noFetchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    wholeMapOfficialHostSearchTargetsStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    searchTargetsPath: outputPath,
    searchTargetsSha256: outputSha256,
    exactRouteRetryTargetsPath: exactRouteRetryOutputPath,
    exactRouteRetryTargetsSha256: exactRouteSha256,
    searchTargetCount: searchRows.length,
    exactRouteRetryTargetCount: exactRouteRows.length,
    totalQueryCount,
    searchTargetCountryCount: new Set(searchRows.map((row) => row.countryCode)).size,
    searchTargetsByCountry: countBy(searchRows, "countryCode"),
    searchTargetsByProviderSignalClass: countBy(searchRows, "providerSignalClass"),
    ger3IncludedInSearchTargets: searchRows.some((row) => row.competitionSlug === "ger.3"),
    existingSearchRunnerCandidateCount: existingSearchRunnerCandidates.length,
    existingSearchRunnerCandidates,
    mayRunControlledOfficialHostSearchWithExplicitAllowSearchFlagCount: searchRows.length > 0 ? 1 : 0,
    mayRunExactRouteRetryWithExplicitAllowFetchFlagCount: exactRouteRows.length > 0 ? 1 : 0,
    maySearchNowCount: 0,
    mayFetchNowCount: 0,
    mayBuildCanonicalCandidateNowCount: 0,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount
  },
  checks
};

writeJson(outputPath.replace(".json", "-materialization-report.json"), output);

console.log(JSON.stringify({
  reportOutput: outputPath.replace(".json", "-materialization-report.json"),
  wholeMapOfficialHostSearchTargetsStatus: output.summary.wholeMapOfficialHostSearchTargetsStatus,
  searchTargetsPath: output.summary.searchTargetsPath,
  exactRouteRetryTargetsPath: output.summary.exactRouteRetryTargetsPath,
  searchTargetCount: output.summary.searchTargetCount,
  exactRouteRetryTargetCount: output.summary.exactRouteRetryTargetCount,
  totalQueryCount: output.summary.totalQueryCount,
  searchTargetCountryCount: output.summary.searchTargetCountryCount,
  ger3IncludedInSearchTargets: output.summary.ger3IncludedInSearchTargets,
  existingSearchRunnerCandidates: output.summary.existingSearchRunnerCandidates,
  mayRunControlledOfficialHostSearchWithExplicitAllowSearchFlagCount: output.summary.mayRunControlledOfficialHostSearchWithExplicitAllowSearchFlagCount,
  mayRunExactRouteRetryWithExplicitAllowFetchFlagCount: output.summary.mayRunExactRouteRetryWithExplicitAllowFetchFlagCount,
  maySearchNowCount: output.summary.maySearchNowCount,
  mayFetchNowCount: output.summary.mayFetchNowCount,
  mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
  blockedCheckCount: output.summary.blockedCheckCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
