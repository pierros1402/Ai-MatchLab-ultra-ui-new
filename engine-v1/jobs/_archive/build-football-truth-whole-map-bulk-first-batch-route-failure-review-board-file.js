import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-first-batch-standings-runner-2026-06-16",
  "whole-map-bulk-first-batch-standings-runner-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-first-batch-route-failure-review-board-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-bulk-first-batch-route-failure-review-board-2026-06-16.json"
);

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function countBy(rows, getter) {
  return rows.reduce((acc, row) => {
    const value = String(typeof getter === "function" ? getter(row) : row[getter] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function routeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "invalid_url";
  }
}

function routePath(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url ?? "");
  }
}

function classifyHttp(httpStatus) {
  const code = Number(httpStatus ?? 0);
  if (code === 403 || code === 401) return "blocked_or_requires_browser_headers";
  if (code === 404) return "route_not_found";
  if (code === 405) return "wrong_method";
  if (code >= 300 && code < 400) return "redirect_not_resolved";
  if (code >= 500) return "server_error";
  if (code === 0 || !Number.isFinite(code)) return "no_http_status";
  if (code >= 200 && code < 300) return "http_ok_unexpectedly_classified_failed";
  return "other_non_2xx";
}

function classifyRouteQuality(url, row) {
  const host = routeHost(url).toLowerCase();
  const p = routePath(url).toLowerCase();
  const slug = String(row.competitionSlug ?? "");
  const country = String(row.countryCode ?? "");
  const label = String(row.competitionLabel ?? "").toLowerCase();

  if (slug === "ger.1" && host.includes("bundesliga.com") && p.includes("/bundesliga/table")) return "exact_expected_official_route";
  if (slug === "ger.2" && host.includes("bundesliga.com") && p.includes("/2bundesliga/table")) return "exact_expected_official_route";
  if (host.includes("bundesliga.com") && country !== "ger" && country !== "aut") return "cross_country_host_leak";
  if (host.includes("fifa.com") && row.providerSignalClass !== "fifa") return "confederation_or_profile_host_noise";
  if (p === "/" || p.length <= 1) return "homepage_only_not_standings_route";
  if (!/(table|standings|standing|tabell|tabelle|league|competition|results|fixtures)/i.test(p)) return "weak_path_no_standings_token";
  if (label && label !== slug && !host.includes(country) && !p.includes(country)) return "weak_country_alignment";
  return "route_candidate_needs_review";
}

function bestNextActionForRow(row) {
  const attempts = Array.isArray(row.attempts) ? row.attempts : [];
  const exactExpectedAttempt = attempts.find((a) => classifyRouteQuality(a.url, row) === "exact_expected_official_route");
  const httpClasses = attempts.map((a) => classifyHttp(a.httpStatus));

  if (exactExpectedAttempt) {
    const cls = classifyHttp(exactExpectedAttempt.httpStatus);
    if (cls === "blocked_or_requires_browser_headers") return "build_browser_header_retry_for_exact_route";
    if (cls === "route_not_found") return "build_official_route_discovery_for_exact_provider";
    return "inspect_exact_route_response_and_headers";
  }

  if (row.competitionSlug === "ger.3") return "build_ger3_official_route_discovery_search_plan";
  if (httpClasses.every((cls) => cls === "route_not_found")) return "discard_local_route_candidates_and_rebuild_host_scoped_search_plan";
  if (httpClasses.some((cls) => cls === "blocked_or_requires_browser_headers")) return "build_header_retry_or_provider_specific_runner";
  return "build_route_candidate_hygiene_filter_before_next_fetch";
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing bulk first-batch runner output: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const resultRows = Array.isArray(input.resultRows) ? input.resultRows : [];

const attemptRows = resultRows.flatMap((row) => (Array.isArray(row.attempts) ? row.attempts : []).map((attempt) => ({
  competitionSlug: row.competitionSlug,
  competitionLabel: row.competitionLabel,
  countryCode: row.countryCode,
  providerSignalClass: row.providerSignalClass,
  executionStatus: row.executionStatus,
  resultStatus: row.resultStatus,
  url: attempt.url,
  host: routeHost(attempt.url),
  path: routePath(attempt.url),
  httpStatus: attempt.httpStatus,
  httpClass: classifyHttp(attempt.httpStatus),
  routeQualityClass: classifyRouteQuality(attempt.url, row),
  contentType: attempt.contentType ?? null,
  outputSize: attempt.outputSize ?? null,
  stderr: attempt.stderr ?? "",
  first500: attempt.inspection?.first500 ?? ""
})));

const reviewRows = resultRows.map((row) => {
  const attempts = attemptRows.filter((attempt) => attempt.competitionSlug === row.competitionSlug);
  const httpClassCounts = countBy(attempts, "httpClass");
  const routeQualityCounts = countBy(attempts, "routeQualityClass");
  const nextAction = bestNextActionForRow(row);

  return {
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    countryCode: row.countryCode,
    providerSignalClass: row.providerSignalClass,
    executionStatus: row.executionStatus,
    originalResultStatus: row.resultStatus,
    attemptedRouteCount: row.attemptedRouteCount,
    httpClassCounts,
    routeQualityCounts,
    attempts,
    routeFailureReviewStatus: nextAction,
    nextAllowedAction: {
      mayBuildBrowserHeaderRetry: nextAction.includes("browser_header"),
      mayBuildOfficialRouteDiscoveryPlan: nextAction.includes("route_discovery") || nextAction.includes("host_scoped_search"),
      mayBuildRouteCandidateHygieneFilter: nextAction.includes("hygiene"),
      mayFetchNow: false,
      maySearchNow: false,
      mayBroadSearchNow: false,
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  };
});

const germanyRows = reviewRows.filter((row) => row.countryCode === "ger");
const exactRouteBlockedRows = reviewRows.filter((row) => row.routeFailureReviewStatus === "build_browser_header_retry_for_exact_route");
const routeDiscoveryRows = reviewRows.filter((row) => row.nextAllowedAction.mayBuildOfficialRouteDiscoveryPlan);
const hygieneRows = reviewRows.filter((row) => row.nextAllowedAction.mayBuildRouteCandidateHygieneFilter);

const checks = [];
check(checks, "sourceRunnerPassed", input.summary?.status === "passed", { actual: input.summary?.status });
check(checks, "sourceAllRoutesNon2xx", Number(input.summary?.routeDiscoveryFollowupTargetCount ?? 0) === Number(input.summary?.batchTargetCount ?? -1), { routeDiscoveryFollowupTargetCount: input.summary?.routeDiscoveryFollowupTargetCount, batchTargetCount: input.summary?.batchTargetCount });
check(checks, "resultRowsTwentyFive", resultRows.length === 25, { actual: resultRows.length, expected: 25 });
check(checks, "attemptRowsFifty", attemptRows.length === 50, { actual: attemptRows.length, expected: 50 });
check(checks, "germanyRowsIncludeGer123", ["ger.1", "ger.2", "ger.3"].every((slug) => germanyRows.some((row) => row.competitionSlug === slug)), { germanyRows: germanyRows.map((row) => row.competitionSlug) });
check(checks, "reviewRowsBuilt", reviewRows.length === resultRows.length, { actual: reviewRows.length });
check(checks, "nextActionAvailable", reviewRows.every((row) => row.routeFailureReviewStatus), { missing: reviewRows.filter((row) => !row.routeFailureReviewStatus).map((row) => row.competitionSlug) });
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-bulk-first-batch-route-failure-review-board-file",
  generatedAtUtc: new Date().toISOString(),
  sourceRunnerPath: inputPath,
  sourceRunnerSha256: sha256Text(inputText),
  policy: {
    reviewOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    failedFetchesMustBeClassifiedBeforeNextNetworkRunner: true
  },
  summary: {
    wholeMapBulkFirstBatchRouteFailureReviewStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    reviewedTargetCount: reviewRows.length,
    reviewedAttemptCount: attemptRows.length,
    attemptsByHttpStatus: countBy(attemptRows, "httpStatus"),
    attemptsByHttpClass: countBy(attemptRows, "httpClass"),
    attemptsByRouteQualityClass: countBy(attemptRows, "routeQualityClass"),
    reviewRowsByNextAction: countBy(reviewRows, "routeFailureReviewStatus"),
    germanyReviewRows: germanyRows.map((row) => ({
      competitionSlug: row.competitionSlug,
      routeFailureReviewStatus: row.routeFailureReviewStatus,
      httpClassCounts: row.httpClassCounts,
      routeQualityCounts: row.routeQualityCounts
    })),
    exactRouteBlockedRowCount: exactRouteBlockedRows.length,
    routeDiscoveryPlanRowCount: routeDiscoveryRows.length,
    hygieneFilterPlanRowCount: hygieneRows.length,
    mayBuildBrowserHeaderRetryRunnerCount: exactRouteBlockedRows.length > 0 ? 1 : 0,
    mayBuildRouteDiscoveryPlanCount: routeDiscoveryRows.length > 0 ? 1 : 0,
    mayBuildRouteCandidateHygieneFilterCount: hygieneRows.length > 0 ? 1 : 0,
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
  reviewRows,
  attemptRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  wholeMapBulkFirstBatchRouteFailureReviewStatus: output.summary.wholeMapBulkFirstBatchRouteFailureReviewStatus,
  reviewedTargetCount: output.summary.reviewedTargetCount,
  reviewedAttemptCount: output.summary.reviewedAttemptCount,
  attemptsByHttpStatus: output.summary.attemptsByHttpStatus,
  attemptsByHttpClass: output.summary.attemptsByHttpClass,
  attemptsByRouteQualityClass: output.summary.attemptsByRouteQualityClass,
  reviewRowsByNextAction: output.summary.reviewRowsByNextAction,
  germanyReviewRows: output.summary.germanyReviewRows,
  mayBuildBrowserHeaderRetryRunnerCount: output.summary.mayBuildBrowserHeaderRetryRunnerCount,
  mayBuildRouteDiscoveryPlanCount: output.summary.mayBuildRouteDiscoveryPlanCount,
  mayBuildRouteCandidateHygieneFilterCount: output.summary.mayBuildRouteCandidateHygieneFilterCount,
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
