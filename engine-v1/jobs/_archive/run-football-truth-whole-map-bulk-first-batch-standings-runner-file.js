import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");

const manifestPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-standings-execution-manifest-2026-06-16",
  "whole-map-bulk-standings-execution-manifest-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-bulk-first-batch-standings-runner-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-bulk-first-batch-standings-runner-2026-06-16.json"
);

const maxTargets = 25;
const maxAttemptsPerTarget = 2;
const maxFetchBytes = 2500000;
const connectTimeoutSeconds = 4;
const maxTimeSeconds = 12;

const blockedHostFragments = [
  "github.com",
  "localhost",
  "127.0.0.1",
  "example.com",
  "wikipedia.org",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "google.com"
];

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

function isAllowedHttpUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const host = parsed.hostname.toLowerCase();
    if (blockedHostFragments.some((fragment) => host.includes(fragment))) return false;
    return true;
  } catch {
    return false;
  }
}

function hostToOrigin(host) {
  const cleaned = String(host ?? "").trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!cleaned || blockedHostFragments.some((fragment) => cleaned.toLowerCase().includes(fragment))) return null;
  return `https://${cleaned}`;
}

function expandRouteCandidates(row) {
  const routes = Array.isArray(row.routeCandidates) ? row.routeCandidates : [];
  const hosts = Array.isArray(row.hostCandidates) ? row.hostCandidates : [];
  const candidates = [];

  for (const route of routes) {
    const value = String(route ?? "").trim();
    if (!value) continue;

    if (value.startsWith("https://") || value.startsWith("http://")) {
      if (isAllowedHttpUrl(value)) candidates.push(value);
      continue;
    }

    if (value.startsWith("/")) {
      for (const host of hosts.slice(0, 3)) {
        const origin = hostToOrigin(host);
        if (!origin) continue;
        const absolute = `${origin}${value}`;
        if (isAllowedHttpUrl(absolute)) candidates.push(absolute);
      }
    }
  }

  return [...new Set(candidates)].slice(0, maxAttemptsPerTarget);
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
    "--header", "Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "--header", "User-Agent: Mozilla/5.0 controlled-football-truth-bulk-first-batch",
    "--output", outputFile,
    "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
    url
  ], {
    encoding: "utf8",
    timeout: (maxTimeSeconds + 4) * 1000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });

  const exists = fs.existsSync(outputFile);
  const buffer = exists ? fs.readFileSync(outputFile) : Buffer.from("");
  return {
    status: result.error?.code === "ETIMEDOUT" ? "timeout_killed" : "exited",
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

function numberFromCell(value) {
  const text = String(value ?? "").replace(/[^\d-]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseHtmlTableRows(text) {
  const rows = [];
  const trMatches = [...text.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const tr of trMatches) {
    const cells = [...tr[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map((match) => stripTags(match[1]));
    if (cells.length < 5) continue;

    const numericCount = cells.filter((cell) => /^-?\d+$/.test(cell.replace(/\s+/g, ""))).length;
    if (numericCount < 3) continue;

    rows.push({ cells });
  }

  return rows.slice(0, 80);
}

function parseGenericStandingsFromHtml(text) {
  const tableRows = parseHtmlTableRows(text);
  const candidateRows = [];

  for (const row of tableRows) {
    const cells = row.cells;
    const positionIndex = cells.findIndex((cell) => numberFromCell(cell) !== null);
    if (positionIndex < 0) continue;

    const position = numberFromCell(cells[positionIndex]);
    const teamNameCell = cells.slice(positionIndex + 1).find((cell) => cell && /[A-Za-zÀ-ÿ]/.test(cell) && !/^\d+$/.test(cell.replace(/\s+/g, "")));
    if (!teamNameCell) continue;

    const nums = cells.map(numberFromCell).filter((value) => value !== null);
    if (nums.length < 5) continue;

    candidateRows.push({
      position,
      teamName: teamNameCell,
      rawCells: cells,
      numericCells: nums
    });
  }

  const uniqueByPositionTeam = [];
  const seen = new Set();
  for (const row of candidateRows) {
    const key = `${row.position}:${row.teamName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueByPositionTeam.push(row);
  }

  return uniqueByPositionTeam.slice(0, 40);
}

function inspectPayload(text, row) {
  const lower = text.toLowerCase();
  const tableRows = parseHtmlTableRows(text);
  const genericRows = parseGenericStandingsFromHtml(text);
  const hasNextData = lower.includes("__next_data__");
  const hasJsonLd = lower.includes("application/ld+json");
  const hasStandingsSignal =
    lower.includes("standings") ||
    lower.includes("standing") ||
    lower.includes("table") ||
    lower.includes("tabell") ||
    lower.includes("tabelle") ||
    lower.includes("league-table") ||
    lower.includes("rank");

  const labelBits = String(row.competitionLabel ?? row.competitionSlug).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const labelSignalCount = labelBits.filter((bit) => bit.length >= 3 && lower.includes(bit)).length;

  return {
    hasStandingsSignal,
    hasNextData,
    hasJsonLd,
    tableRowCount: tableRows.length,
    genericStandingCandidateRowCount: genericRows.length,
    labelSignalCount,
    genericStandingCandidateRows: genericRows.slice(0, 25),
    first500: text.slice(0, 500).replace(/\s+/g, " ")
  };
}

function classifyAttempt(attempt, inspection, expectedRows) {
  const httpOk = attempt.parsedWriteOut.httpStatus >= 200 && attempt.parsedWriteOut.httpStatus < 300;
  if (!httpOk) return "route_fetch_not_2xx";
  if (inspection.genericStandingCandidateRowCount === expectedRows) return "accepted_generic_html_standings_rows_requires_quality_gate";
  if (inspection.genericStandingCandidateRowCount > 0) return "partial_generic_html_standings_rows_requires_parser_review";
  if (inspection.hasStandingsSignal || inspection.hasNextData || inspection.tableRowCount > 0) return "validated_route_shell_requires_specific_parser";
  return "fetched_no_standings_signal";
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing bulk execution manifest: ${manifestPath}`);
}

const manifestText = fs.readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestText);
const firstBatchRows = (Array.isArray(manifest.firstBatchRows) ? manifest.firstBatchRows : []).slice(0, maxTargets);

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowFetchFlagPresent", allowFetch);
check(checks, "sourceManifestPassed", manifest.summary?.wholeMapBulkStandingsExecutionManifestStatus === "passed", { actual: manifest.summary?.wholeMapBulkStandingsExecutionManifestStatus });
check(checks, "firstBatchRowsPresent", firstBatchRows.length >= 20, { actual: firstBatchRows.length });
check(checks, "firstBatchIncludesGer3", firstBatchRows.some((row) => row.competitionSlug === "ger.3"));
check(checks, "firstBatchNotOneCountryOnly", new Set(firstBatchRows.map((row) => row.countryCode)).size >= 5, { actual: new Set(firstBatchRows.map((row) => row.countryCode)).size });

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowFetch) {
  const output = {
    output: outputPath,
    job: "run-football-truth-whole-map-bulk-first-batch-standings-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: "blocked_preflight",
    manifestPath,
    manifestSha256: sha256Text(manifestText),
    checks,
    targetRows: firstBatchRows,
    resultRows: [],
    summary: {
      status: "blocked_preflight",
      batchTargetCount: firstBatchRows.length,
      attemptedTargetCount: 0,
      routeValidatedTargetCount: 0,
      acceptedGenericRowsTargetCount: 0,
      partialGenericRowsTargetCount: 0,
      parserReviewTargetCount: 0,
      blockedNoRouteCandidateTargetCount: 0,
      fetchedNoStandingsSignalTargetCount: 0,
      totalFetchAttemptCount: 0,
      totalGenericStandingCandidateRowCount: 0,
      mayBuildBulkFirstBatchQualityGateCount: 0,
      mayBuildSpecificParserPlanCount: 0,
      mayBuildRouteDiscoveryFollowupCount: 0,
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

  for (const target of firstBatchRows) {
    const routeCandidates = expandRouteCandidates(target);
    const attempts = [];
    let bestStatus = routeCandidates.length === 0 ? "blocked_no_route_candidate" : "route_fetch_not_attempted";
    let bestInspection = null;

    for (const [attemptIndex, url] of routeCandidates.entries()) {
      const responsePath = path.join(outputDir, `${safeName(target.competitionSlug)}-attempt-${attemptIndex + 1}.html`);
      const attempt = runCurlGet(url, responsePath);
      const inspection = inspectPayload(attempt.text, target);
      const status = classifyAttempt(attempt, inspection, target.expectedStandingRowCount ?? null);

      attempts.push({
        attemptIndex: attemptIndex + 1,
        url,
        status,
        curlStatus: attempt.status,
        exitCode: attempt.exitCode,
        errorCode: attempt.errorCode,
        stderr: attempt.stderr,
        httpStatus: attempt.parsedWriteOut.httpStatus,
        finalUrl: attempt.parsedWriteOut.finalUrl,
        contentType: attempt.parsedWriteOut.contentType,
        outputFile: attempt.outputFile,
        outputSize: attempt.outputSize,
        outputSha256: attempt.outputSha256,
        inspection: {
          hasStandingsSignal: inspection.hasStandingsSignal,
          hasNextData: inspection.hasNextData,
          hasJsonLd: inspection.hasJsonLd,
          tableRowCount: inspection.tableRowCount,
          genericStandingCandidateRowCount: inspection.genericStandingCandidateRowCount,
          labelSignalCount: inspection.labelSignalCount,
          first500: inspection.first500
        },
        genericStandingCandidateRows: inspection.genericStandingCandidateRows
      });

      const rank = {
        accepted_generic_html_standings_rows_requires_quality_gate: 5,
        partial_generic_html_standings_rows_requires_parser_review: 4,
        validated_route_shell_requires_specific_parser: 3,
        fetched_no_standings_signal: 2,
        route_fetch_not_2xx: 1,
        blocked_no_route_candidate: 0
      };

      if ((rank[status] ?? -1) > (rank[bestStatus] ?? -1)) {
        bestStatus = status;
        bestInspection = inspection;
      }

      if (status === "accepted_generic_html_standings_rows_requires_quality_gate") break;
    }

    resultRows.push({
      competitionSlug: target.competitionSlug,
      competitionLabel: target.competitionLabel,
      countryCode: target.countryCode,
      providerSignalClass: target.providerSignalClass,
      executionStatus: target.executionStatus,
      executionLane: target.executionLane,
      expectedStandingRowCount: target.expectedStandingRowCount,
      routeCandidateCount: routeCandidates.length,
      attemptedRouteCount: attempts.length,
      resultStatus: bestStatus,
      bestGenericStandingCandidateRowCount: bestInspection?.genericStandingCandidateRowCount ?? 0,
      bestTableRowCount: bestInspection?.tableRowCount ?? 0,
      attempts,
      nextAllowedAction: {
        mayBuildQualityGate: bestStatus === "accepted_generic_html_standings_rows_requires_quality_gate",
        mayBuildSpecificParserPlan: bestStatus === "partial_generic_html_standings_rows_requires_parser_review" || bestStatus === "validated_route_shell_requires_specific_parser",
        mayBuildRouteDiscoveryFollowup: bestStatus === "blocked_no_route_candidate" || bestStatus === "route_fetch_not_2xx" || bestStatus === "fetched_no_standings_signal",
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false,
        maySearchNow: false,
        mayBroadSearchNow: false
      }
    });
  }

  const countsByStatus = resultRows.reduce((acc, row) => {
    acc[row.resultStatus] = (acc[row.resultStatus] ?? 0) + 1;
    return acc;
  }, {});

  const totalFetchAttemptCount = resultRows.reduce((sum, row) => sum + row.attemptedRouteCount, 0);
  const totalGenericStandingCandidateRowCount = resultRows.reduce((sum, row) => sum + row.bestGenericStandingCandidateRowCount, 0);
  const routeValidatedTargetCount = resultRows.filter((row) =>
    row.resultStatus === "accepted_generic_html_standings_rows_requires_quality_gate" ||
    row.resultStatus === "partial_generic_html_standings_rows_requires_parser_review" ||
    row.resultStatus === "validated_route_shell_requires_specific_parser"
  ).length;
  const acceptedGenericRowsTargetCount = resultRows.filter((row) => row.resultStatus === "accepted_generic_html_standings_rows_requires_quality_gate").length;
  const parserReviewTargetCount = resultRows.filter((row) =>
    row.resultStatus === "partial_generic_html_standings_rows_requires_parser_review" ||
    row.resultStatus === "validated_route_shell_requires_specific_parser"
  ).length;
  const routeDiscoveryFollowupCount = resultRows.filter((row) =>
    row.resultStatus === "blocked_no_route_candidate" ||
    row.resultStatus === "route_fetch_not_2xx" ||
    row.resultStatus === "fetched_no_standings_signal"
  ).length;

  const output = {
    output: outputPath,
    job: "run-football-truth-whole-map-bulk-first-batch-standings-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: "passed",
    manifestPath,
    manifestSha256: sha256Text(manifestText),
    policy: {
      controlledFetchOnly: true,
      firstBatchOnly: true,
      maxTargets,
      maxAttemptsPerTarget,
      maxFetchBytes,
      connectTimeoutSeconds,
      maxTimeSeconds,
      noSearchInThisJob: true,
      noBroadSearchInThisJob: true,
      noCanonicalWriteInThisJob: true,
      noProductionWriteInThisJob: true,
      noTruthAssertionInThisJob: true
    },
    checks,
    targetRows: firstBatchRows,
    resultRows,
    summary: {
      status: "passed",
      batchTargetCount: firstBatchRows.length,
      attemptedTargetCount: resultRows.filter((row) => row.attemptedRouteCount > 0).length,
      routeValidatedTargetCount,
      acceptedGenericRowsTargetCount,
      partialGenericRowsTargetCount: resultRows.filter((row) => row.resultStatus === "partial_generic_html_standings_rows_requires_parser_review").length,
      parserReviewTargetCount,
      blockedNoRouteCandidateTargetCount: resultRows.filter((row) => row.resultStatus === "blocked_no_route_candidate").length,
      fetchedNoStandingsSignalTargetCount: resultRows.filter((row) => row.resultStatus === "fetched_no_standings_signal").length,
      routeDiscoveryFollowupTargetCount: routeDiscoveryFollowupCount,
      resultRowsByStatus: countsByStatus,
      totalFetchAttemptCount,
      totalGenericStandingCandidateRowCount,
      mayBuildBulkFirstBatchQualityGateCount: acceptedGenericRowsTargetCount > 0 ? 1 : 0,
      mayBuildSpecificParserPlanCount: parserReviewTargetCount > 0 ? 1 : 0,
      mayBuildRouteDiscoveryFollowupCount: routeDiscoveryFollowupCount > 0 ? 1 : 0,
      mayBuildCanonicalCandidateNowCount: 0,
      fetchExecutedNowCount: totalFetchAttemptCount,
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
    batchTargetCount: output.summary.batchTargetCount,
    attemptedTargetCount: output.summary.attemptedTargetCount,
    routeValidatedTargetCount: output.summary.routeValidatedTargetCount,
    acceptedGenericRowsTargetCount: output.summary.acceptedGenericRowsTargetCount,
    parserReviewTargetCount: output.summary.parserReviewTargetCount,
    routeDiscoveryFollowupTargetCount: output.summary.routeDiscoveryFollowupTargetCount,
    resultRowsByStatus: output.summary.resultRowsByStatus,
    totalFetchAttemptCount: output.summary.totalFetchAttemptCount,
    totalGenericStandingCandidateRowCount: output.summary.totalGenericStandingCandidateRowCount,
    mayBuildBulkFirstBatchQualityGateCount: output.summary.mayBuildBulkFirstBatchQualityGateCount,
    mayBuildSpecificParserPlanCount: output.summary.mayBuildSpecificParserPlanCount,
    mayBuildRouteDiscoveryFollowupCount: output.summary.mayBuildRouteDiscoveryFollowupCount,
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
