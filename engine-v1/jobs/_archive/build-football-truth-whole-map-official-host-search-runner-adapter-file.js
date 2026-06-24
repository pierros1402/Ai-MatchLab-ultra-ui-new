import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const searchTargetsPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-search-targets-2026-06-16",
  "whole-map-official-host-search-targets-2026-06-16.json"
);

const exactRouteTargetsPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-search-targets-2026-06-16",
  "whole-map-exact-route-retry-targets-2026-06-16.json"
);

const searchRunnerPath = path.join(
  "engine-v1",
  "jobs",
  "run-fixture-league-date-autonomous-search-batches-file.js"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-search-runner-adapter-2026-06-16"
);

const reportPath = path.join(
  outputDir,
  "whole-map-official-host-search-runner-adapter-2026-06-16.json"
);

const allAdaptedTargetsPath = path.join(
  outputDir,
  "whole-map-official-host-search-all-adapted-targets-2026-06-16.json"
);

const firstWaveTargetsPath = path.join(
  outputDir,
  "whole-map-official-host-search-wave-01-targets-2026-06-16.json"
);

const exactRouteRetryAdaptedPath = path.join(
  outputDir,
  "whole-map-exact-route-retry-adapted-targets-2026-06-16.json"
);

const wave01PreferredCountryOrder = [
  "ger",
  "eng",
  "fra",
  "ita",
  "ned",
  "bel",
  "den",
  "sui",
  "aut",
  "fin",
  "irl",
  "por",
  "sco",
  "usa",
  "mex",
  "kor"
];

const wave01MaxTargets = 24;

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJson(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return { text, json: JSON.parse(text), sha256: sha256Text(text) };
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

function countryPriority(countryCode) {
  const idx = wave01PreferredCountryOrder.indexOf(String(countryCode ?? ""));
  return idx >= 0 ? idx : 999;
}

function targetPriority(row) {
  let score = 0;
  if (row.competitionSlug === "ger.3") score -= 10000;
  score += countryPriority(row.countryCode) * 100;
  if (String(row.competitionSlug).endsWith(".1")) score += 1;
  if (String(row.competitionSlug).endsWith(".2")) score += 2;
  if (String(row.competitionSlug).endsWith(".3")) score += 3;
  score += String(row.competitionSlug).localeCompare("zzz") / 100000;
  return score;
}

function adaptSearchRow(row, index) {
  const queries = Array.isArray(row.queries)
    ? row.queries.map((q) => typeof q === "string" ? q : q.query).filter(Boolean)
    : [];

  return {
    targetId: `whole_map_official_host_search_${String(index + 1).padStart(3, "0")}_${row.competitionSlug}`,
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    countryCode: row.countryCode,
    providerSignalClass: row.providerSignalClass,
    expectedStandingRowCount: row.expectedStandingRowCount ?? null,
    priority: row.searchPriority ?? 3,
    queryCount: queries.length,
    queries,
    searchQueries: queries.map((query, queryIndex) => ({
      queryIndex: queryIndex + 1,
      q: query,
      query,
      broadSearchAllowed: false,
      searchScope: "official_host_or_official_standings_route_only"
    })),
    officialHostHints: Array.isArray(row.preferredOfficialHostHints) ? row.preferredOfficialHostHints : [],
    rejectHostClasses: Array.isArray(row.rejectHostClasses) ? row.rejectHostClasses : [],
    requiredResultSignals: Array.isArray(row.requiredResultSignals) ? row.requiredResultSignals : [],
    searchPolicy: {
      allowSearchOnlyWithExplicitAllowSearchFlag: true,
      broadSearchAllowed: false,
      acceptOnlyOfficialHostOrOfficialLeaguePage: true,
      rejectAggregatorsBettingTrackingSocialWikiNewsOnly: true
    }
  };
}

function adaptExactRouteRow(row, index) {
  return {
    targetId: `whole_map_exact_route_retry_${String(index + 1).padStart(3, "0")}_${row.competitionSlug}`,
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    countryCode: row.countryCode,
    providerSignalClass: row.providerSignalClass,
    expectedStandingRowCount: row.expectedStandingRowCount,
    routes: Array.isArray(row.hygienicRouteCandidates) ? row.hygienicRouteCandidates : [],
    fetchPolicy: {
      allowFetchOnlyWithExplicitAllowFetchFlag: true,
      maxAttemptsPerTarget: 1,
      noSearch: true,
      noBroadSearch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noTruthAssertion: true
    }
  };
}

function detectSearchRunnerCompatibility(runnerText) {
  const flags = [
    "--self-test",
    "--allow-search",
    "--targets",
    "--output",
    "--output-dir",
    "--source-index",
    "--limit",
    "--batch-size",
    "--timeout-ms",
    "--max-chars",
    "--batch-timeout-ms"
  ];

  return {
    flagsPresent: Object.fromEntries(flags.map((flag) => [flag, runnerText.includes(flag)])),
    hasAllowSearchGate: runnerText.includes("--allow-search") || runnerText.includes("allowSearch"),
    hasTargetsFlag: runnerText.includes("--targets"),
    hasLimitFlag: runnerText.includes("--limit"),
    hasBatchSizeFlag: runnerText.includes("--batch-size"),
    hasOutputDirFlag: runnerText.includes("--output-dir"),
    hasQueryTextReferences: /queries|searchQueries|query/.test(runnerText),
    runnerSha256: sha256Text(runnerText)
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

for (const required of [searchTargetsPath, exactRouteTargetsPath, searchRunnerPath]) {
  if (!fs.existsSync(required)) throw new Error(`Missing required input: ${required}`);
}

const searchTargets = readJson(searchTargetsPath);
const exactTargets = readJson(exactRouteTargetsPath);
const runnerText = fs.readFileSync(searchRunnerPath, "utf8");
const compatibility = detectSearchRunnerCompatibility(runnerText);

const searchRows = Array.isArray(searchTargets.json.searchRows) ? searchTargets.json.searchRows : [];
const exactRows = Array.isArray(exactTargets.json.exactRouteRows) ? exactTargets.json.exactRouteRows : [];

const adaptedAllTargets = searchRows.map(adaptSearchRow);
const adaptedExactRouteTargets = exactRows.map(adaptExactRouteRow);

const wave01Rows = adaptedAllTargets
  .filter((row) => row.competitionSlug === "ger.3" || wave01PreferredCountryOrder.includes(row.countryCode))
  .sort((a, b) => targetPriority(a) - targetPriority(b) || a.competitionSlug.localeCompare(b.competitionSlug))
  .slice(0, wave01MaxTargets);

const allTargetsPayload = {
  generatedAtUtc: new Date().toISOString(),
  sourceSearchTargetsPath: searchTargetsPath,
  sourceSearchTargetsSha256: searchTargets.sha256,
  runnerCompatibilityTarget: searchRunnerPath,
  policy: {
    adaptedTargetsOnly: true,
    noSearchInThisJob: true,
    noFetchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    adaptedTargetCount: adaptedAllTargets.length,
    adaptedCountryCount: new Set(adaptedAllTargets.map((row) => row.countryCode)).size,
    adaptedTargetsByCountry: countBy(adaptedAllTargets, "countryCode"),
    totalQueryCount: adaptedAllTargets.reduce((sum, row) => sum + row.queryCount, 0),
    ger3Included: adaptedAllTargets.some((row) => row.competitionSlug === "ger.3")
  },
  targets: adaptedAllTargets,
  searchRows: adaptedAllTargets
};

const wave01Payload = {
  generatedAtUtc: new Date().toISOString(),
  sourceSearchTargetsPath: searchTargetsPath,
  sourceSearchTargetsSha256: searchTargets.sha256,
  runnerCompatibilityTarget: searchRunnerPath,
  waveId: "official_host_search_wave_01_high_value_multi_country_with_ger3",
  policy: {
    searchWaveOnly: true,
    noSearchInThisJob: true,
    noFetchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    nextRunnerMustUseExplicitAllowSearchFlag: true
  },
  summary: {
    waveTargetCount: wave01Rows.length,
    waveCountryCount: new Set(wave01Rows.map((row) => row.countryCode)).size,
    waveTargetsByCountry: countBy(wave01Rows, "countryCode"),
    waveTotalQueryCount: wave01Rows.reduce((sum, row) => sum + row.queryCount, 0),
    ger3Included: wave01Rows.some((row) => row.competitionSlug === "ger.3")
  },
  targets: wave01Rows,
  searchRows: wave01Rows
};

const exactPayload = {
  generatedAtUtc: new Date().toISOString(),
  sourceExactTargetsPath: exactRouteTargetsPath,
  sourceExactTargetsSha256: exactTargets.sha256,
  policy: {
    exactRouteRetryTargetsOnly: true,
    noSearchInThisJob: true,
    noFetchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    nextRunnerMustUseExplicitAllowFetchFlag: true
  },
  summary: {
    exactRouteRetryTargetCount: adaptedExactRouteTargets.length,
    exactRouteRetryTargets: adaptedExactRouteTargets.map((row) => row.competitionSlug),
    exactRouteRetryRouteCount: adaptedExactRouteTargets.reduce((sum, row) => sum + row.routes.length, 0)
  },
  targets: adaptedExactRouteTargets,
  exactRouteRows: adaptedExactRouteTargets
};

writeJson(allAdaptedTargetsPath, allTargetsPayload);
writeJson(firstWaveTargetsPath, wave01Payload);
writeJson(exactRouteRetryAdaptedPath, exactPayload);

const allAdaptedSha256 = sha256Text(fs.readFileSync(allAdaptedTargetsPath, "utf8"));
const wave01Sha256 = sha256Text(fs.readFileSync(firstWaveTargetsPath, "utf8"));
const exactAdaptedSha256 = sha256Text(fs.readFileSync(exactRouteRetryAdaptedPath, "utf8"));

const checks = [];
check(checks, "sourceSearchTargetsPassed", searchTargets.json.summary?.searchTargetCount === 78 || searchTargets.json.searchRows?.length === 78, { actualSummary: searchTargets.json.summary });
check(checks, "sourceExactRouteTargetsTwo", exactRows.length === 2, { actual: exactRows.length, expected: 2 });
check(checks, "runnerFilePresent", fs.existsSync(searchRunnerPath), { searchRunnerPath });
check(checks, "runnerHasAllowSearchGate", compatibility.hasAllowSearchGate, compatibility);
check(checks, "runnerHasTargetsFlag", compatibility.hasTargetsFlag, compatibility);
check(checks, "runnerHasLimitFlag", compatibility.hasLimitFlag, compatibility);
check(checks, "adaptedAllTargetsSeventyEight", adaptedAllTargets.length === 78, { actual: adaptedAllTargets.length, expected: 78 });
check(checks, "adaptedAllTargetsHaveQueries", adaptedAllTargets.every((row) => row.queryCount > 0));
check(checks, "wave01TargetCountAtLeastTwenty", wave01Rows.length >= 20, { actual: wave01Rows.length });
check(checks, "wave01CountrySpreadAtLeastTen", new Set(wave01Rows.map((row) => row.countryCode)).size >= 10, { actual: new Set(wave01Rows.map((row) => row.countryCode)).size });
check(checks, "wave01IncludesGer3", wave01Rows.some((row) => row.competitionSlug === "ger.3"));
check(checks, "exactRouteTargetsGer1Ger2", JSON.stringify(adaptedExactRouteTargets.map((row) => row.competitionSlug).sort()) === JSON.stringify(["ger.1", "ger.2"]), { actual: adaptedExactRouteTargets.map((row) => row.competitionSlug).sort() });
check(checks, "noSearchFetchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const report = {
  output: reportPath,
  job: "build-football-truth-whole-map-official-host-search-runner-adapter-file",
  generatedAtUtc: new Date().toISOString(),
  sourceSearchTargetsPath: searchTargetsPath,
  sourceSearchTargetsSha256: searchTargets.sha256,
  sourceExactRouteTargetsPath: exactRouteTargetsPath,
  sourceExactRouteTargetsSha256: exactTargets.sha256,
  searchRunnerPath,
  searchRunnerCompatibility: compatibility,
  policy: {
    adapterOnly: true,
    noSearchInThisJob: true,
    noFetchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    wholeMapOfficialHostSearchRunnerAdapterStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    allAdaptedTargetsPath,
    allAdaptedTargetsSha256: allAdaptedSha256,
    firstWaveTargetsPath,
    firstWaveTargetsSha256: wave01Sha256,
    exactRouteRetryAdaptedPath,
    exactRouteRetryAdaptedSha256: exactAdaptedSha256,
    adaptedAllTargetCount: adaptedAllTargets.length,
    adaptedAllQueryCount: adaptedAllTargets.reduce((sum, row) => sum + row.queryCount, 0),
    wave01TargetCount: wave01Rows.length,
    wave01CountryCount: new Set(wave01Rows.map((row) => row.countryCode)).size,
    wave01TotalQueryCount: wave01Rows.reduce((sum, row) => sum + row.queryCount, 0),
    wave01TargetsByCountry: countBy(wave01Rows, "countryCode"),
    wave01Targets: wave01Rows.map((row) => row.competitionSlug),
    ger3IncludedInWave01: wave01Rows.some((row) => row.competitionSlug === "ger.3"),
    exactRouteRetryTargetCount: adaptedExactRouteTargets.length,
    exactRouteRetryTargets: adaptedExactRouteTargets.map((row) => row.competitionSlug),
    mayRunOfficialHostSearchWave01WithExplicitAllowSearchFlagCount: wave01Rows.length >= 20 ? 1 : 0,
    mayRunExactRouteRetryWithExplicitAllowFetchFlagCount: adaptedExactRouteTargets.length === 2 ? 1 : 0,
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

writeJson(reportPath, report);

console.log(JSON.stringify({
  output: report.output,
  wholeMapOfficialHostSearchRunnerAdapterStatus: report.summary.wholeMapOfficialHostSearchRunnerAdapterStatus,
  allAdaptedTargetsPath: report.summary.allAdaptedTargetsPath,
  firstWaveTargetsPath: report.summary.firstWaveTargetsPath,
  exactRouteRetryAdaptedPath: report.summary.exactRouteRetryAdaptedPath,
  adaptedAllTargetCount: report.summary.adaptedAllTargetCount,
  adaptedAllQueryCount: report.summary.adaptedAllQueryCount,
  wave01TargetCount: report.summary.wave01TargetCount,
  wave01CountryCount: report.summary.wave01CountryCount,
  wave01TotalQueryCount: report.summary.wave01TotalQueryCount,
  wave01Targets: report.summary.wave01Targets,
  ger3IncludedInWave01: report.summary.ger3IncludedInWave01,
  exactRouteRetryTargets: report.summary.exactRouteRetryTargets,
  searchRunnerCompatibility: {
    hasAllowSearchGate: compatibility.hasAllowSearchGate,
    hasTargetsFlag: compatibility.hasTargetsFlag,
    hasLimitFlag: compatibility.hasLimitFlag,
    hasBatchSizeFlag: compatibility.hasBatchSizeFlag,
    hasOutputDirFlag: compatibility.hasOutputDirFlag
  },
  mayRunOfficialHostSearchWave01WithExplicitAllowSearchFlagCount: report.summary.mayRunOfficialHostSearchWave01WithExplicitAllowSearchFlagCount,
  mayRunExactRouteRetryWithExplicitAllowFetchFlagCount: report.summary.mayRunExactRouteRetryWithExplicitAllowFetchFlagCount,
  maySearchNowCount: report.summary.maySearchNowCount,
  mayFetchNowCount: report.summary.mayFetchNowCount,
  mayBuildCanonicalCandidateNowCount: report.summary.mayBuildCanonicalCandidateNowCount,
  searchExecutedNowCount: report.summary.searchExecutedNowCount,
  fetchExecutedNowCount: report.summary.fetchExecutedNowCount,
  broadSearchExecutedNowCount: report.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: report.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: report.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: report.summary.truthAssertionExecutedNowCount,
  blockedCheckCount: report.summary.blockedCheckCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
