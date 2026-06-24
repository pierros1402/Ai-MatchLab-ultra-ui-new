import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-contract-review-board-2026-06-16",
  "controlled-sportomedia-route-contract-review-board-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-official-route-validation-runner-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-official-route-validation-runner-2026-06-16.json"
);

const allowedRoutes = {
  "swe.1": "https://allsvenskan.se/tabell",
  "swe.2": "https://superettan.se/tabell"
};

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

function parseCurlWriteOut(stdout) {
  const text = String(stdout ?? "");
  const http = text.match(/HTTP=(\d{3})/);
  const final = text.match(/FINAL=([^\s]+)/);
  const type = text.match(/TYPE=([^\s]+)/);
  const size = text.match(/SIZE=([0-9.]+)/);
  const time = text.match(/TIME=([0-9.]+)/);
  return {
    httpStatus: http ? Number(http[1]) : null,
    finalUrl: final ? final[1] : null,
    contentType: type ? type[1] : null,
    sizeDownload: size ? Number(size[1]) : null,
    timeTotal: time ? Number(time[1]) : null,
    raw: text
  };
}

function runCurlGet(url, outputFile) {
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync("curl.exe", [
    "--location",
    "--ipv4",
    "--http1.1",
    "--connect-timeout", "4",
    "--max-time", "12",
    "--max-filesize", "2500000",
    "--silent",
    "--show-error",
    "--output", outputFile,
    "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
    url
  ], {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });

  return {
    startedAtUtc,
    finishedAtUtc: new Date().toISOString(),
    status: result.error?.code === "ETIMEDOUT" ? "timeout_killed" : "exited",
    exitCode: result.status,
    signal: result.signal,
    errorCode: result.error?.code ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    parsedWriteOut: parseCurlWriteOut(result.stdout)
  };
}

function htmlSignals(html, competitionSlug) {
  const lower = String(html ?? "").toLowerCase();
  const expectedHostToken = competitionSlug === "swe.1" ? "allsvenskan" : "superettan";
  return {
    htmlLikeSignal: /<html|<!doctype html|<script|<body/i.test(html),
    officialCompetitionTokenSignal: lower.includes(expectedHostToken),
    standingsRouteSignal: lower.includes("tabell") || lower.includes("standings") || lower.includes("league-table") || lower.includes("standings-table"),
    sportomediaAssetSignal: lower.includes("sef-leagues") || lower.includes("/wp-content/themes/sef-leagues/"),
    graphqlRuntimeSignal: lower.includes("gqluri") || lower.includes("graphql"),
    wordpressApiSignal: lower.includes("wp-json") || lower.includes("data-endpoint") || lower.includes("ajaxurl"),
    mainJsSignal: lower.includes("build/main.js") || lower.includes("main.js?ver=")
  };
}

function contextForNeedles(html) {
  const needles = ["gqlURI", "graphql", "sef-leagues", "build/main.js", "standings", "tabell", "wp-json", "data-endpoint"];
  const contexts = [];
  for (const needle of needles) {
    const idx = String(html).indexOf(needle);
    const lowerIdx = String(html).toLowerCase().indexOf(needle.toLowerCase());
    const offset = idx >= 0 ? idx : lowerIdx;
    if (offset < 0) continue;
    const start = Math.max(0, offset - 320);
    const end = Math.min(String(html).length, offset + 320);
    contexts.push({
      needle,
      offset,
      context: String(html).slice(start, end).replace(/\s+/g, " ").slice(0, 900)
    });
  }
  return contexts;
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing Sportomedia route contract review board output: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const reviewRows = Array.isArray(input.reviewRows) ? input.reviewRows : [];
const acceptedRows = reviewRows.filter((row) => row.reviewStatus === "accepted_local_route_contract_requires_controlled_official_route_validation");

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowFetchFlagPresent", allowFetch);
check(checks, "sourceReviewBoardPassed", input.summary?.controlledSportomediaRouteContractReviewBoardStatus === "passed", { actual: input.summary?.controlledSportomediaRouteContractReviewBoardStatus });
check(checks, "sourceAcceptedRowsTwo", acceptedRows.length === 2, { actual: acceptedRows.length, expected: 2 });
check(checks, "sourceMayBuildRunner", Number(input.summary?.mayBuildControlledSportomediaOfficialRouteValidationRunnerCount ?? 0) === 1, { actual: input.summary?.mayBuildControlledSportomediaOfficialRouteValidationRunnerCount });
check(checks, "sourceCanonicalCandidateStillClosed", Number(input.summary?.mayBuildCanonicalCandidateNowCount ?? -1) === 0, { actual: input.summary?.mayBuildCanonicalCandidateNowCount });
check(checks, "acceptedRowsUseOnlyAllowedRoutes", acceptedRows.every((row) => allowedRoutes[row.competitionSlug] === row.officialStandingsRoute), { actual: acceptedRows.map((row) => `${row.competitionSlug}:${row.officialStandingsRoute}`) });
check(checks, "sourceNoSearchCanonicalProductionTruth", Number(input.summary?.searchExecutedNowCount ?? -1) === 0 && Number(input.summary?.broadSearchExecutedNowCount ?? -1) === 0 && Number(input.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.truthAssertionExecutedNowCount ?? -1) === 0);

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowFetch) {
  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-official-route-validation-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: "blocked_preflight",
    inputPath,
    inputSha256: sha256Text(inputText),
    checks,
    routeValidationRows: [],
    summary: {
      status: "blocked_preflight",
      acceptedSourceRowCount: acceptedRows.length,
      routeValidationRowCount: 0,
      validOfficialRouteCount: 0,
      preflightBlockedCount,
      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0
    }
  };
  writeJson(outputPath, output);
  console.log(JSON.stringify(output.summary, null, 2));
  process.exitCode = 1;
} else {
  fs.mkdirSync(outputDir, { recursive: true });

  const routeValidationRows = [];

  for (const row of acceptedRows.sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))) {
    const safeSlug = String(row.competitionSlug).replace(/[^a-z0-9_-]+/gi, "_");
    const htmlPath = path.join(outputDir, `${safeSlug}-official-standings-route.html`);
    if (fs.existsSync(htmlPath)) fs.rmSync(htmlPath, { force: true });

    const curl = runCurlGet(row.officialStandingsRoute, htmlPath);
    const exists = fs.existsSync(htmlPath);
    const buffer = exists ? fs.readFileSync(htmlPath) : Buffer.from("");
    const html = buffer.toString("utf8");
    const signals = htmlSignals(html, row.competitionSlug);
    const signalCount = Object.values(signals).filter(Boolean).length;
    const httpStatus = curl.parsedWriteOut.httpStatus;

    const routeStatus =
      curl.status === "timeout_killed"
        ? "timeout_or_killed"
        : curl.exitCode === 0 && httpStatus >= 200 && httpStatus < 400 && buffer.length > 0 && signals.htmlLikeSignal && signals.officialCompetitionTokenSignal && (signals.sportomediaAssetSignal || signals.mainJsSignal || signals.graphqlRuntimeSignal)
          ? "validated_official_route_runtime_shell"
          : curl.exitCode === 0 && httpStatus >= 200 && httpStatus < 400 && buffer.length > 0
            ? "fetched_official_route_but_runtime_signals_incomplete"
            : "official_route_fetch_failed_or_empty";

    routeValidationRows.push({
      sourceReviewBoardRowId: row.sportomediaRouteContractReviewBoardRowId,
      competitionSlug: row.competitionSlug,
      competitionLabel: row.competitionLabel,
      providerFamily: "sportomedia",
      officialHost: row.officialHost,
      officialStandingsRoute: row.officialStandingsRoute,
      htmlPath,
      htmlSize: buffer.length,
      htmlSha256: buffer.length > 0 ? sha256Buffer(buffer) : null,
      curl,
      signals,
      signalCount,
      contexts: contextForNeedles(html),
      routeValidationStatus: routeStatus,
      nextAllowedAction: {
        mayBuildLocalRouteHtmlRuntimeExtractor: routeStatus === "validated_official_route_runtime_shell",
        mayBuildCanonicalCandidateNow: false,
        mayFetchNow: false,
        maySearch: false,
        mayBroadSearch: false,
        mayWriteCanonical: false,
        mayWriteProduction: false,
        mayAssertTruth: false
      }
    });
  }

  const validRouteCount = routeValidationRows.filter((row) => row.routeValidationStatus === "validated_official_route_runtime_shell").length;
  const incompleteRouteCount = routeValidationRows.filter((row) => row.routeValidationStatus === "fetched_official_route_but_runtime_signals_incomplete").length;
  const failedRouteCount = routeValidationRows.filter((row) => row.routeValidationStatus === "official_route_fetch_failed_or_empty" || row.routeValidationStatus === "timeout_or_killed").length;

  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-official-route-validation-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: validRouteCount === 2 ? "passed" : "passed_with_route_validation_gaps",
    inputPath,
    inputSha256: sha256Text(inputText),
    policy: {
      controlledFetchOnly: true,
      officialStandingsRoutesOnly: true,
      allowedRoutes,
      noSearch: true,
      noBroadSearch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noTruthAssertion: true
    },
    checks,
    routeValidationRows,
    summary: {
      status: validRouteCount === 2 ? "passed" : "passed_with_route_validation_gaps",
      acceptedSourceRowCount: acceptedRows.length,
      routeValidationRowCount: routeValidationRows.length,
      validOfficialRouteCount: validRouteCount,
      incompleteOfficialRouteCount: incompleteRouteCount,
      failedOfficialRouteCount: failedRouteCount,
      routeValidationRowsByCompetition: countBy(routeValidationRows, "competitionSlug"),
      routeValidationRowsByStatus: countBy(routeValidationRows, "routeValidationStatus"),
      mayBuildControlledSportomediaLocalRouteHtmlRuntimeExtractorCount: validRouteCount > 0 ? 1 : 0,
      mayBuildCanonicalCandidateNowCount: 0,
      fetchExecutedNowCount: routeValidationRows.length,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount: 0
    }
  };

  writeJson(outputPath, output);

  console.log(JSON.stringify({
    output: output.output,
    status: output.summary.status,
    routeValidationRowCount: output.summary.routeValidationRowCount,
    validOfficialRouteCount: output.summary.validOfficialRouteCount,
    incompleteOfficialRouteCount: output.summary.incompleteOfficialRouteCount,
    failedOfficialRouteCount: output.summary.failedOfficialRouteCount,
    routeValidationRowsByStatus: output.summary.routeValidationRowsByStatus,
    mayBuildControlledSportomediaLocalRouteHtmlRuntimeExtractorCount: output.summary.mayBuildControlledSportomediaLocalRouteHtmlRuntimeExtractorCount,
    mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
  }, null, 2));
}
