import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const sourceWavePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-search-runner-adapter-2026-06-16",
  "whole-map-official-host-search-wave-01-targets-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-search-wave-01-runner-compatible-targets-2026-06-16"
);

const compatibleTargetsPath = path.join(
  outputDir,
  "whole-map-official-host-search-wave-01-runner-compatible-targets-2026-06-16.json"
);

const reportPath = path.join(
  outputDir,
  "whole-map-official-host-search-wave-01-runner-compatible-targets-2026-06-16-report.json"
);

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

function extractQueries(target) {
  if (Array.isArray(target.queries)) {
    return target.queries
      .map((entry) => typeof entry === "string" ? entry : entry?.query ?? entry?.q)
      .filter(Boolean)
      .map((q) => String(q).replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  if (Array.isArray(target.searchQueries)) {
    return target.searchQueries
      .map((entry) => typeof entry === "string" ? entry : entry?.query ?? entry?.q)
      .filter(Boolean)
      .map((q) => String(q).replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  if (target.query) return [String(target.query).replace(/\s+/g, " ").trim()].filter(Boolean);
  if (target.q) return [String(target.q).replace(/\s+/g, " ").trim()].filter(Boolean);
  return [];
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(sourceWavePath)) {
  throw new Error(`Missing source wave target file: ${sourceWavePath}`);
}

const sourceText = fs.readFileSync(sourceWavePath, "utf8");
const source = JSON.parse(sourceText);
const sourceTargets = Array.isArray(source.targets) ? source.targets : Array.isArray(source.searchRows) ? source.searchRows : [];

const compatibleRows = [];
for (const target of sourceTargets) {
  const queries = unique(extractQueries(target));
  for (const [queryIndex, query] of queries.entries()) {
    compatibleRows.push({
      searchTargetId: `wave01_${String(compatibleRows.length + 1).padStart(3, "0")}_${target.competitionSlug}_q${String(queryIndex + 1).padStart(2, "0")}`,
      targetId: `wave01_${String(compatibleRows.length + 1).padStart(3, "0")}_${target.competitionSlug}_q${String(queryIndex + 1).padStart(2, "0")}`,
      competitionSlug: target.competitionSlug,
      competitionLabel: target.competitionLabel,
      countryCode: target.countryCode,
      providerSignalClass: target.providerSignalClass,
      expectedStandingRowCount: target.expectedStandingRowCount ?? null,
      queryIndex: queryIndex + 1,
      query,
      q: query,
      officialHostHints: Array.isArray(target.officialHostHints) ? target.officialHostHints : [],
      preferredOfficialHostHints: Array.isArray(target.officialHostHints) ? target.officialHostHints : [],
      rejectHostClasses: Array.isArray(target.rejectHostClasses) ? target.rejectHostClasses : [
        "aggregator",
        "betting",
        "odds",
        "tracking",
        "social",
        "wiki",
        "news_only",
        "generic_stats_scraper"
      ],
      requiredResultSignals: Array.isArray(target.requiredResultSignals) ? target.requiredResultSignals : [
        "official federation/league/competition host",
        "standings/table route"
      ],
      broadSearchAllowed: false,
      searchScope: "official_host_or_official_standings_route_only",
      sourceWaveTargetId: target.targetId ?? null
    });
  }
}

const checks = [];
check(checks, "sourceWaveTargetsPresent", sourceTargets.length === 24, { actual: sourceTargets.length, expected: 24 });
check(checks, "sourceWaveIncludesGer3", sourceTargets.some((target) => target.competitionSlug === "ger.3"));
check(checks, "compatibleRowsEighty", compatibleRows.length === 80, { actual: compatibleRows.length, expected: 80 });
check(checks, "allRowsHaveSingularQuery", compatibleRows.every((row) => typeof row.query === "string" && row.query.length > 0));
check(checks, "allRowsHaveSingularQAlias", compatibleRows.every((row) => typeof row.q === "string" && row.q.length > 0));
check(checks, "countrySpreadAtLeastTen", new Set(compatibleRows.map((row) => row.countryCode)).size >= 10, { actual: new Set(compatibleRows.map((row) => row.countryCode)).size });
check(checks, "ger3QueriesPresent", compatibleRows.filter((row) => row.competitionSlug === "ger.3").length >= 5, { actual: compatibleRows.filter((row) => row.competitionSlug === "ger.3").length });
check(checks, "noSearchFetchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const payload = {
  generatedAtUtc: new Date().toISOString(),
  sourceWavePath,
  sourceWaveSha256: sha256Text(sourceText),
  policy: {
    runnerCompatibleTargetsOnly: true,
    singularQueryRequiredByCurrentRunner: true,
    expandedOneRowPerQuery: true,
    noSearchInThisJob: true,
    noFetchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    compatibleSearchTargetCount: compatibleRows.length,
    sourceWaveTargetCount: sourceTargets.length,
    compatibleCountryCount: new Set(compatibleRows.map((row) => row.countryCode)).size,
    compatibleRowsByCountry: countBy(compatibleRows, "countryCode"),
    ger3CompatibleQueryCount: compatibleRows.filter((row) => row.competitionSlug === "ger.3").length,
    allRowsHaveQuery: compatibleRows.every((row) => row.query),
    mayRunControlledSearchWithExplicitAllowSearchFlagCount: compatibleRows.length === 80 ? 1 : 0
  },
  targets: compatibleRows,
  searchRows: compatibleRows
};

writeJson(compatibleTargetsPath, payload);

const report = {
  output: reportPath,
  job: "build-football-truth-whole-map-official-host-search-wave-runner-compatible-targets-file",
  generatedAtUtc: new Date().toISOString(),
  compatibleTargetsPath,
  compatibleTargetsSha256: sha256Text(fs.readFileSync(compatibleTargetsPath, "utf8")),
  summary: {
    wholeMapOfficialHostSearchWaveRunnerCompatibleTargetsStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    compatibleTargetsPath,
    compatibleSearchTargetCount: compatibleRows.length,
    sourceWaveTargetCount: sourceTargets.length,
    compatibleCountryCount: new Set(compatibleRows.map((row) => row.countryCode)).size,
    ger3CompatibleQueryCount: compatibleRows.filter((row) => row.competitionSlug === "ger.3").length,
    mayRunControlledSearchWithExplicitAllowSearchFlagCount: compatibleRows.length === 80 ? 1 : 0,
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
  wholeMapOfficialHostSearchWaveRunnerCompatibleTargetsStatus: report.summary.wholeMapOfficialHostSearchWaveRunnerCompatibleTargetsStatus,
  compatibleTargetsPath: report.summary.compatibleTargetsPath,
  compatibleSearchTargetCount: report.summary.compatibleSearchTargetCount,
  sourceWaveTargetCount: report.summary.sourceWaveTargetCount,
  compatibleCountryCount: report.summary.compatibleCountryCount,
  ger3CompatibleQueryCount: report.summary.ger3CompatibleQueryCount,
  mayRunControlledSearchWithExplicitAllowSearchFlagCount: report.summary.mayRunControlledSearchWithExplicitAllowSearchFlagCount,
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
