import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");

const targetsPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-search-runner-adapter-2026-06-16",
  "whole-map-exact-route-retry-adapted-targets-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-exact-route-retry-runner-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-exact-route-retry-runner-2026-06-16.json"
);

const maxFetchBytes = 5000000;
const connectTimeoutSeconds = 5;
const maxTimeSeconds = 20;

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

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

function parseWriteOut(stdout) {
  const text = String(stdout ?? "");
  const http = text.match(/HTTP=(\d{3})/);
  const final = text.match(/FINAL=([^\s]+)/);
  const type = text.match(/TYPE=([^\n\r]+?) SIZE=/);
  const size = text.match(/SIZE=([0-9.]+)/);
  const time = text.match(/TIME=([0-9.]+)/);
  return {
    httpStatus: http ? Number(http[1]) : null,
    finalUrl: final ? final[1] : null,
    contentType: type ? type[1].trim() : null,
    sizeDownload: size ? Number(size[1]) : null,
    timeTotal: time ? Number(time[1]) : null,
    raw: text
  };
}

function assertAllowedExactRoute(url, competitionSlug) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`Exact route must be HTTPS: ${url}`);
  if (!parsed.hostname.endsWith("bundesliga.com")) throw new Error(`Exact route host is not bundesliga.com: ${url}`);
  if (competitionSlug === "ger.1" && !parsed.pathname.includes("/bundesliga/table")) {
    throw new Error(`ger.1 route is not Bundesliga table route: ${url}`);
  }
  if (competitionSlug === "ger.2" && !parsed.pathname.includes("/2bundesliga/table")) {
    throw new Error(`ger.2 route is not 2. Bundesliga table route: ${url}`);
  }
}

function runCurlGet(url, outputFile) {
  const result = spawnSync("curl.exe", [
    "--location",
    "--ipv4",
    "--http1.1",
    "--connect-timeout", String(connectTimeoutSeconds),
    "--max-time", String(maxTimeSeconds),
    "--max-filesize", String(maxFetchBytes),
    "--silent",
    "--show-error",
    "--request", "GET",
    "--header", "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
    "--header", "Accept-Language: en-US,en;q=0.9,de;q=0.8",
    "--header", "Cache-Control: no-cache",
    "--header", "Pragma: no-cache",
    "--header", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 controlled-football-truth-exact-route-retry",
    "--output", outputFile,
    "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
    url
  ], {
    encoding: "utf8",
    timeout: (maxTimeSeconds + 5) * 1000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });

  const exists = fs.existsSync(outputFile);
  const buffer = exists ? fs.readFileSync(outputFile) : Buffer.from("");

  return {
    curlStatus: result.error?.code === "ETIMEDOUT" ? "timeout_killed" : "exited",
    exitCode: result.status,
    signal: result.signal,
    errorCode: result.error?.code ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    parsedWriteOut: parseWriteOut(result.stdout),
    outputFile,
    outputSize: buffer.length,
    outputSha256: buffer.length > 0 ? sha256Buffer(buffer) : null,
    text: buffer.toString("utf8")
  };
}

function stripTags(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function numberFromText(value) {
  const text = String(value ?? "").replace(/[^\d-]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseHtmlTables(text) {
  const rows = [];
  const trMatches = [...String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const tr of trMatches) {
    const cells = [...tr[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((match) => stripTags(match[1]));
    if (cells.length < 4) continue;
    rows.push({ cells });
  }

  return rows;
}

function parseGenericStandingRows(text) {
  const tableRows = parseHtmlTables(text);
  const rows = [];

  for (const row of tableRows) {
    const cells = row.cells;
    const numericCells = cells.map(numberFromText).filter((value) => value !== null);
    if (numericCells.length < 5) continue;

    const positionCandidate = numberFromText(cells[0]);
    const position = positionCandidate !== null ? positionCandidate : numericCells[0];

    const teamName = cells.find((cell, index) =>
      index > 0 &&
      /[A-Za-zÀ-ÿ]/.test(cell) &&
      !/^\d+$/.test(cell.replace(/\s+/g, "")) &&
      cell.length >= 2
    );

    if (!teamName || position === null) continue;

    rows.push({
      position,
      teamName,
      rawCells: cells,
      numericCells
    });
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.position}:${row.teamName}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 40);
}

function scriptJsonSignalCounts(text) {
  const lower = text.toLowerCase();
  return {
    nextData: lower.includes("__next_data__"),
    nuxt: lower.includes("__nuxt__"),
    apollo: lower.includes("apollo"),
    graphql: lower.includes("graphql"),
    standings: lower.includes("standings"),
    table: lower.includes("table"),
    bundesliga: lower.includes("bundesliga"),
    clubOrTeam: lower.includes("club") || lower.includes("team")
  };
}

function inspectResponse(text, expectedRows) {
  const genericStandingRows = parseGenericStandingRows(text);
  const tableRows = parseHtmlTables(text);
  const signals = scriptJsonSignalCounts(text);
  const lower = text.toLowerCase();

  const routeShellValidated =
    signals.bundesliga &&
    (signals.table || signals.standings || lower.includes("ranking") || lower.includes("tabelle"));

  const acceptedGeneric = genericStandingRows.length === expectedRows;

  let extractionStatus = "fetched_no_relevant_shell";
  if (acceptedGeneric) extractionStatus = "accepted_generic_html_rows_requires_quality_gate";
  else if (genericStandingRows.length > 0) extractionStatus = "partial_generic_rows_requires_parser_review";
  else if (routeShellValidated) extractionStatus = "validated_official_route_shell_requires_specific_parser";
  else if (signals.bundesliga) extractionStatus = "validated_official_host_shell_no_table_parser_signal";
  else if (text.length > 0) extractionStatus = "fetched_unclassified_response";

  return {
    extractionStatus,
    routeShellValidated,
    tableRowCount: tableRows.length,
    genericStandingRowCount: genericStandingRows.length,
    genericStandingRows,
    signals,
    title: (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim(),
    first800: text.slice(0, 800).replace(/\s+/g, " ")
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(targetsPath)) {
  throw new Error(`Missing exact route retry targets: ${targetsPath}`);
}

const targetsText = fs.readFileSync(targetsPath, "utf8");
const targetsPayload = JSON.parse(targetsText);
const targets = Array.isArray(targetsPayload.targets) ? targetsPayload.targets : [];

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowFetchFlagPresent", allowFetch);
check(checks, "targetCountTwo", targets.length === 2, { actual: targets.length, expected: 2 });
check(checks, "targetsAreGer1Ger2", JSON.stringify(targets.map((row) => row.competitionSlug).sort()) === JSON.stringify(["ger.1", "ger.2"]), { actual: targets.map((row) => row.competitionSlug).sort() });
check(checks, "allTargetsHaveRoutes", targets.every((row) => Array.isArray(row.routes) && row.routes.length > 0));

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowFetch) {
  const output = {
    output: outputPath,
    job: "run-football-truth-whole-map-exact-route-retry-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: "blocked_preflight",
    sourceTargetsPath: targetsPath,
    sourceTargetsSha256: sha256Text(targetsText),
    checks,
    resultRows: [],
    summary: {
      status: "blocked_preflight",
      targetCount: targets.length,
      fetchedTargetCount: 0,
      routeShellValidatedTargetCount: 0,
      acceptedGenericRowsTargetCount: 0,
      parserReviewTargetCount: 0,
      totalFetchAttemptCount: 0,
      totalGenericStandingRowCount: 0,
      mayBuildExactRouteQualityGateCount: 0,
      mayBuildBundesligaSpecificParserPlanCount: 0,
      mayBuildCanonicalCandidateNowCount: 0,
      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount
    }
  };
  writeJson(outputPath, output);
  console.log(JSON.stringify(output.summary, null, 2));
  process.exitCode = 1;
} else {
  fs.mkdirSync(outputDir, { recursive: true });

  const resultRows = [];

  for (const target of targets) {
    const route = target.routes[0];
    assertAllowedExactRoute(route, target.competitionSlug);

    const responsePath = path.join(outputDir, `${safeName(target.competitionSlug)}-exact-route.html`);
    const response = runCurlGet(route, responsePath);
    const httpStatus = response.parsedWriteOut.httpStatus;
    const httpOk = httpStatus >= 200 && httpStatus < 300;
    const inspection = inspectResponse(response.text, Number(target.expectedStandingRowCount));

    let resultStatus = "route_fetch_not_2xx";
    if (httpOk) resultStatus = inspection.extractionStatus;
    if (!httpOk && (httpStatus === 403 || httpStatus === 401)) resultStatus = "official_route_blocked_or_requires_browser_runtime";
    if (!httpOk && httpStatus === 404) resultStatus = "official_route_not_found_requires_route_contract_review";

    resultRows.push({
      competitionSlug: target.competitionSlug,
      competitionLabel: target.competitionLabel,
      countryCode: target.countryCode,
      providerSignalClass: target.providerSignalClass,
      expectedStandingRowCount: target.expectedStandingRowCount,
      route,
      resultStatus,
      httpStatus,
      finalUrl: response.parsedWriteOut.finalUrl,
      contentType: response.parsedWriteOut.contentType,
      outputFile: response.outputFile,
      outputSize: response.outputSize,
      outputSha256: response.outputSha256,
      curlExitCode: response.exitCode,
      curlErrorCode: response.errorCode,
      curlStderr: response.stderr,
      inspection,
      nextAllowedAction: {
        mayBuildQualityGate: resultStatus === "accepted_generic_html_rows_requires_quality_gate",
        mayBuildSpecificParserPlan: resultStatus === "validated_official_route_shell_requires_specific_parser" || resultStatus === "partial_generic_rows_requires_parser_review" || resultStatus === "validated_official_host_shell_no_table_parser_signal",
        mayBuildRouteContractReview: resultStatus === "official_route_not_found_requires_route_contract_review" || resultStatus === "official_route_blocked_or_requires_browser_runtime",
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    });
  }

  const fetchedTargetCount = resultRows.filter((row) => row.httpStatus >= 200 && row.httpStatus < 300).length;
  const routeShellValidatedTargetCount = resultRows.filter((row) => row.inspection?.routeShellValidated).length;
  const acceptedGenericRowsTargetCount = resultRows.filter((row) => row.resultStatus === "accepted_generic_html_rows_requires_quality_gate").length;
  const parserReviewTargetCount = resultRows.filter((row) => row.nextAllowedAction.mayBuildSpecificParserPlan).length;
  const routeContractReviewTargetCount = resultRows.filter((row) => row.nextAllowedAction.mayBuildRouteContractReview).length;
  const totalGenericStandingRowCount = resultRows.reduce((sum, row) => sum + Number(row.inspection?.genericStandingRowCount ?? 0), 0);

  const resultRowsByStatus = resultRows.reduce((acc, row) => {
    acc[row.resultStatus] = (acc[row.resultStatus] ?? 0) + 1;
    return acc;
  }, {});

  const output = {
    output: outputPath,
    job: "run-football-truth-whole-map-exact-route-retry-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: "passed",
    sourceTargetsPath: targetsPath,
    sourceTargetsSha256: sha256Text(targetsText),
    policy: {
      controlledExactRouteFetchOnly: true,
      exactRouteTargetsOnly: ["ger.1", "ger.2"],
      noSearchInThisJob: true,
      noBroadSearchInThisJob: true,
      noCanonicalWriteInThisJob: true,
      noProductionWriteInThisJob: true,
      noTruthAssertionInThisJob: true
    },
    checks,
    resultRows,
    summary: {
      status: "passed",
      targetCount: targets.length,
      fetchedTargetCount,
      routeShellValidatedTargetCount,
      acceptedGenericRowsTargetCount,
      parserReviewTargetCount,
      routeContractReviewTargetCount,
      resultRowsByStatus,
      totalFetchAttemptCount: resultRows.length,
      totalGenericStandingRowCount,
      mayBuildExactRouteQualityGateCount: acceptedGenericRowsTargetCount > 0 ? 1 : 0,
      mayBuildBundesligaSpecificParserPlanCount: parserReviewTargetCount > 0 ? 1 : 0,
      mayBuildRouteContractReviewCount: routeContractReviewTargetCount > 0 ? 1 : 0,
      mayBuildCanonicalCandidateNowCount: 0,
      fetchExecutedNowCount: resultRows.length,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount
    }
  };

  writeJson(outputPath, output);

  console.log(JSON.stringify({
    output: output.output,
    status: output.summary.status,
    targetCount: output.summary.targetCount,
    fetchedTargetCount: output.summary.fetchedTargetCount,
    routeShellValidatedTargetCount: output.summary.routeShellValidatedTargetCount,
    acceptedGenericRowsTargetCount: output.summary.acceptedGenericRowsTargetCount,
    parserReviewTargetCount: output.summary.parserReviewTargetCount,
    routeContractReviewTargetCount: output.summary.routeContractReviewTargetCount,
    resultRowsByStatus: output.summary.resultRowsByStatus,
    totalFetchAttemptCount: output.summary.totalFetchAttemptCount,
    totalGenericStandingRowCount: output.summary.totalGenericStandingRowCount,
    mayBuildExactRouteQualityGateCount: output.summary.mayBuildExactRouteQualityGateCount,
    mayBuildBundesligaSpecificParserPlanCount: output.summary.mayBuildBundesligaSpecificParserPlanCount,
    mayBuildRouteContractReviewCount: output.summary.mayBuildRouteContractReviewCount,
    mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
    preflightBlockedCount: output.summary.preflightBlockedCount
  }, null, 2));
}
