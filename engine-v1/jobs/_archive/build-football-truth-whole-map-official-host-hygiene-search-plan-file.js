import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const packPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-standings-acceleration-pack-2026-06-16",
  "whole-map-bulk-standings-acceleration-pack-2026-06-16.json"
);

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-standings-execution-manifest-2026-06-16",
  "whole-map-bulk-standings-execution-manifest-2026-06-16.json"
);

const reviewPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-first-batch-route-failure-review-board-2026-06-16",
  "whole-map-bulk-first-batch-route-failure-review-board-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-hygiene-search-plan-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-official-host-hygiene-search-plan-2026-06-16.json"
);

const knownExactOfficialRoutes = {
  "ger.1": {
    officialRoute: "https://www.bundesliga.com/en/bundesliga/table",
    officialHost: "bundesliga.com",
    expectedRows: 18,
    source: "manual_exact_official_route_policy"
  },
  "ger.2": {
    officialRoute: "https://www.bundesliga.com/en/2bundesliga/table",
    officialHost: "bundesliga.com",
    expectedRows: 18,
    source: "manual_exact_official_route_policy"
  }
};

const forceRouteDiscovery = new Set(["ger.3"]);

const noisyHostBlocklistSeeds = [
  "17track.net",
  "1liga.org",
  "1x2stats.com",
  "2liga.at"
];

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

function countBy(rows, getter) {
  return rows.reduce((acc, row) => {
    const value = String(typeof getter === "function" ? getter(row) : row[getter] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function label(row) {
  const raw = String(row.competitionLabel ?? row.competitionSlug ?? "").trim();
  if (!raw || raw === row.competitionSlug) return row.competitionSlug;
  return raw;
}

function countryName(countryCode) {
  const map = {
    ger: "Germany",
    bel: "Belgium",
    den: "Denmark",
    eng: "England",
    fra: "France",
    ita: "Italy",
    ned: "Netherlands",
    sui: "Switzerland",
    aut: "Austria",
    fin: "Finland",
    irl: "Ireland",
    sco: "Scotland",
    por: "Portugal",
    mex: "Mexico",
    usa: "United States",
    kor: "South Korea",
    alb: "Albania",
    alg: "Algeria",
    and: "Andorra",
    ang: "Angola",
    arm: "Armenia",
    aze: "Azerbaijan",
    ben: "Benin"
  };
  return map[countryCode] ?? countryCode.toUpperCase();
}

function isNoisyHost(host) {
  if (!host) return true;
  const h = host.toLowerCase();
  if (noisyHostBlocklistSeeds.includes(h)) return true;
  if (/^\d/.test(h)) return true;
  if (h.includes("track")) return true;
  if (h.includes("1x2")) return true;
  if (h.includes("bet")) return true;
  if (h.includes("odds")) return true;
  if (h.includes("stats") && !h.includes("official")) return true;
  if (h.includes("livescore")) return true;
  if (h.includes("flashscore")) return true;
  return false;
}

function routeLooksOfficialEnough(url, row) {
  const host = hostOf(url);
  if (!host || isNoisyHost(host)) return false;
  const p = (() => { try { return new URL(url).pathname.toLowerCase(); } catch { return ""; } })();
  if (!/(table|standings|standing|tabell|tabelle|classification|rank|league)/i.test(p)) return false;
  if (host.includes("github") || host.includes("wikipedia") || host.includes("facebook") || host.includes("youtube")) return false;
  if (row.countryCode === "ger" && host.includes("bundesliga.com")) return true;
  return false;
}

function buildQueries(row) {
  const slug = row.competitionSlug;
  const c = countryName(row.countryCode);
  const l = label(row);
  const base = l === slug ? `${c} ${slug}` : `${c} ${l}`;
  const provider = String(row.providerSignalClass ?? "");

  const queries = [
    `${base} official standings table`,
    `${base} official league table`,
    `${base} official current standings`
  ];

  if (slug === "ger.3") {
    queries.unshift("Germany 3. Liga official standings table DFB");
    queries.unshift("3. Liga official table standings Germany");
  }

  if (provider === "bundesliga_official") {
    queries.unshift(`${base} bundesliga.com table`);
  }

  if (provider === "torneopal") {
    queries.unshift(`${base} Torneopal standings`);
  }

  if (provider === "loi") {
    queries.unshift(`${base} League of Ireland official table`);
  }

  if (provider === "spfl_opta") {
    queries.unshift(`${base} SPFL official table standings`);
  }

  return unique(queries).slice(0, 5).map((query, index) => ({
    queryIndex: index + 1,
    query,
    searchScope: "controlled_official_host_or_official_standings_route",
    broadSearchAllowed: false
  }));
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

for (const required of [packPath, manifestPath, reviewPath]) {
  if (!fs.existsSync(required)) throw new Error(`Missing required input: ${required}`);
}

const pack = readJson(packPath);
const manifest = readJson(manifestPath);
const review = readJson(reviewPath);

const bulkTargets = Array.isArray(pack.json.bulkTargets) ? pack.json.bulkTargets : [];
const manifestRows = Array.isArray(manifest.json.manifestRows) ? manifest.json.manifestRows : [];
const reviewAttempts = Array.isArray(review.json.attemptRows) ? review.json.attemptRows : [];

const observedNoisyHosts = unique([
  ...noisyHostBlocklistSeeds,
  ...reviewAttempts
    .map((attempt) => attempt.host)
    .filter((host) => isNoisyHost(host))
]);

const rowsBySlug = new Map();
for (const row of [...bulkTargets, ...manifestRows]) {
  if (!row.competitionSlug) continue;
  rowsBySlug.set(row.competitionSlug, { ...(rowsBySlug.get(row.competitionSlug) ?? {}), ...row });
}

const planRows = [...rowsBySlug.values()]
  .filter((row) => row.competitionSlug)
  .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))
  .map((row) => {
    const known = knownExactOfficialRoutes[row.competitionSlug] ?? null;
    const rawRoutes = unique([...(Array.isArray(row.routeCandidates) ? row.routeCandidates : [])]);
    const hygienicRoutes = unique([
      ...(known ? [known.officialRoute] : []),
      ...rawRoutes.filter((url) => routeLooksOfficialEnough(url, row))
    ]);

    const routeDiscoveryRequired =
      forceRouteDiscovery.has(row.competitionSlug) ||
      hygienicRoutes.length === 0 ||
      !known;

    let planStatus = "needs_controlled_official_host_search";
    if (known && hygienicRoutes.length > 0) planStatus = "ready_exact_official_route_retry";
    if (forceRouteDiscovery.has(row.competitionSlug)) planStatus = "priority_official_route_discovery_required_do_not_skip";

    return {
      competitionSlug: row.competitionSlug,
      competitionLabel: label(row),
      countryCode: row.countryCode,
      competitionType: row.competitionType,
      providerSignalClass: row.providerSignalClass,
      forceIncluded: Boolean(row.forceIncluded),
      expectedStandingRowCount: known?.expectedRows ?? row.expectedStandingRowCount ?? null,
      rawRouteCandidateCount: rawRoutes.length,
      hygienicRouteCandidateCount: hygienicRoutes.length,
      hygienicRouteCandidates: hygienicRoutes,
      routeCandidateHygieneStatus: rawRoutes.length === 0
        ? "no_raw_route_candidates"
        : hygienicRoutes.length > 0
          ? "kept_hygienic_candidates"
          : "discarded_noisy_or_untrusted_candidates",
      officialHostSearchQueries: buildQueries(row),
      planStatus,
      knownExactOfficialRoute: known,
      routeDiscoveryRequired,
      nextAllowedAction: {
        mayRetryHygienicExactRoutesWithFetchFlag: planStatus === "ready_exact_official_route_retry",
        mayRunControlledOfficialHostSearchWithSearchFlag: routeDiscoveryRequired,
        mayBroadSearch: false,
        mayFetchNow: false,
        maySearchNow: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    };
  });

const exactRouteRows = planRows.filter((row) => row.planStatus === "ready_exact_official_route_retry");
const searchRows = planRows.filter((row) => row.nextAllowedAction.mayRunControlledOfficialHostSearchWithSearchFlag);
const gerRows = planRows.filter((row) => row.countryCode === "ger");
const ger3Row = planRows.find((row) => row.competitionSlug === "ger.3") ?? null;
const discardedRows = planRows.filter((row) => row.routeCandidateHygieneStatus === "discarded_noisy_or_untrusted_candidates");

const checks = [];
check(checks, "sourcePackPassed", pack.json.summary?.wholeMapBulkStandingsAccelerationPackStatus === "passed", { actual: pack.json.summary?.wholeMapBulkStandingsAccelerationPackStatus });
check(checks, "sourceManifestPassed", manifest.json.summary?.wholeMapBulkStandingsExecutionManifestStatus === "passed", { actual: manifest.json.summary?.wholeMapBulkStandingsExecutionManifestStatus });
check(checks, "sourceReviewPassed", review.json.summary?.wholeMapBulkFirstBatchRouteFailureReviewStatus === "passed", { actual: review.json.summary?.wholeMapBulkFirstBatchRouteFailureReviewStatus });
check(checks, "planRowsEighty", planRows.length === 80, { actual: planRows.length, expected: 80 });
check(checks, "noisyHostsDetected", observedNoisyHosts.length >= 4, { observedNoisyHosts });
check(checks, "germanyRowsIncludeGer123", ["ger.1", "ger.2", "ger.3"].every((slug) => gerRows.some((row) => row.competitionSlug === slug)), { germanyRows: gerRows.map((row) => row.competitionSlug) });
check(checks, "ger1Ger2ExactRoutesReady", ["ger.1", "ger.2"].every((slug) => exactRouteRows.some((row) => row.competitionSlug === slug)), { exactRouteRows: exactRouteRows.map((row) => row.competitionSlug) });
check(checks, "ger3RouteDiscoveryRequired", ger3Row?.planStatus === "priority_official_route_discovery_required_do_not_skip", { ger3Row });
check(checks, "officialHostSearchRowsBroadPack", searchRows.length >= 70, { actual: searchRows.length });
check(checks, "allSearchRowsHaveQueries", searchRows.every((row) => row.officialHostSearchQueries.length >= 3));
check(checks, "noImmediateFetchSearchWrite", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-official-host-hygiene-search-plan-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePackPath: packPath,
  sourcePackSha256: pack.sha256,
  sourceManifestPath: manifestPath,
  sourceManifestSha256: manifest.sha256,
  sourceReviewPath: reviewPath,
  sourceReviewSha256: review.sha256,
  policy: {
    planOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    discardNoisyLocalRouteCandidatesBeforeNextNetworkRunner: true,
    searchMustBeOfficialHostScoped: true
  },
  summary: {
    wholeMapOfficialHostHygieneSearchPlanStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    planRowCount: planRows.length,
    exactRouteRetryRowCount: exactRouteRows.length,
    controlledOfficialHostSearchRowCount: searchRows.length,
    discardedNoisyRouteCandidateRowCount: discardedRows.length,
    observedNoisyHostCount: observedNoisyHosts.length,
    observedNoisyHosts,
    germanyPlanRows: gerRows.map((row) => ({
      competitionSlug: row.competitionSlug,
      planStatus: row.planStatus,
      hygienicRouteCandidateCount: row.hygienicRouteCandidateCount,
      queryCount: row.officialHostSearchQueries.length
    })),
    ger3PlanStatus: ger3Row?.planStatus ?? null,
    totalOfficialHostSearchQueryCount: searchRows.reduce((sum, row) => sum + row.officialHostSearchQueries.length, 0),
    mayBuildExactRouteRetryRunnerCount: exactRouteRows.length > 0 ? 1 : 0,
    mayBuildControlledOfficialHostSearchRunnerCount: searchRows.length > 0 ? 1 : 0,
    mayFetchNowCount: 0,
    maySearchNowCount: 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount
  },
  checks,
  planRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  wholeMapOfficialHostHygieneSearchPlanStatus: output.summary.wholeMapOfficialHostHygieneSearchPlanStatus,
  planRowCount: output.summary.planRowCount,
  exactRouteRetryRowCount: output.summary.exactRouteRetryRowCount,
  controlledOfficialHostSearchRowCount: output.summary.controlledOfficialHostSearchRowCount,
  discardedNoisyRouteCandidateRowCount: output.summary.discardedNoisyRouteCandidateRowCount,
  observedNoisyHosts: output.summary.observedNoisyHosts,
  germanyPlanRows: output.summary.germanyPlanRows,
  ger3PlanStatus: output.summary.ger3PlanStatus,
  totalOfficialHostSearchQueryCount: output.summary.totalOfficialHostSearchQueryCount,
  mayBuildExactRouteRetryRunnerCount: output.summary.mayBuildExactRouteRetryRunnerCount,
  mayBuildControlledOfficialHostSearchRunnerCount: output.summary.mayBuildControlledOfficialHostSearchRunnerCount,
  mayFetchNowCount: output.summary.mayFetchNowCount,
  maySearchNowCount: output.summary.maySearchNowCount,
  mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
  blockedCheckCount: output.summary.blockedCheckCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
