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
  "controlled-sportomedia-standings-extraction-plan-2026-06-16",
  "controlled-sportomedia-standings-extraction-plan-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-standings-extraction-runner-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-standings-extraction-runner-2026-06-16.json"
);

const expectedCounts = { "swe.1": 16, "swe.2": 16 };

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

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLocalHtmlTable(html) {
  const rows = [];
  const trRe = /<tr\b[\s\S]*?<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html)) !== null && rows.length < 80) {
    const trText = tr[0];
    const cells = [];
    const cellRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let cell;
    while ((cell = cellRe.exec(trText)) !== null && cells.length < 20) {
      const value = stripHtml(cell[2]);
      if (value) cells.push(value);
    }
    if (cells.length >= 4) rows.push({ cells });
  }
  return rows;
}

function findArrays(value, pathParts = [], rows = []) {
  if (Array.isArray(value)) {
    if (value.length >= 8 && value.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      rows.push({ path: pathParts.join("."), length: value.length, sample: value.slice(0, 3), value });
    }
    value.forEach((item, index) => findArrays(item, [...pathParts, String(index)], rows));
    return rows;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      findArrays(child, [...pathParts, key], rows);
    }
  }
  return rows;
}

function rowLooksLikeStanding(row) {
  const text = JSON.stringify(row).toLowerCase();
  const hasTeam = /team|club|name|shortname|displayname|competitor/.test(text);
  const hasPoints = /point|points|pts|poäng|poang/.test(text);
  const hasPlayed = /played|matches|games|playedgames|matcher|spelar|p\b/.test(text);
  return hasTeam && (hasPoints || hasPlayed);
}

function extractStandingLikeArraysFromJson(json) {
  return findArrays(json)
    .filter((arr) => arr.value.length >= 8 && arr.value.slice(0, Math.min(arr.value.length, 8)).some(rowLooksLikeStanding))
    .map((arr) => ({
      jsonPath: arr.path,
      rowCount: arr.length,
      sampleRows: arr.sample,
      confidence: arr.value.slice(0, Math.min(arr.value.length, 12)).filter(rowLooksLikeStanding).length
    }))
    .sort((a, b) => b.confidence - a.confidence || b.rowCount - a.rowCount);
}

function parseWriteOut(stdout) {
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

function runCurl(args, outputFile) {
  const result = spawnSync("curl.exe", args, {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
  const exists = outputFile && fs.existsSync(outputFile);
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
    first500: buffer.toString("utf8").slice(0, 500).replace(/\s+/g, " ")
  };
}

function sameAllowedHost(url, expectedHost) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === expectedHost;
  } catch {
    return false;
  }
}

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
}

function buildGraphqlPayloads() {
  return [
    {
      label: "standingsForLeague_minimal",
      body: JSON.stringify({
        query: "query StandingsForLeague { standingsForLeague { __typename } }"
      })
    },
    {
      label: "standingsForLeague_common_fields",
      body: JSON.stringify({
        query: "query StandingsForLeague { standingsForLeague { team { name shortName } played wins draws losses goalsFor goalsAgainst goalDifference points position } }"
      })
    },
    {
      label: "introspection_query_type_names",
      body: JSON.stringify({
        query: "query IntrospectionQuery { __schema { queryType { fields { name } } } }"
      })
    }
  ];
}

function attemptEndpointFetches(planRow) {
  const attempts = [];
  const candidates = uniqueSorted(planRow.endpointCandidates || [])
    .filter((url) => sameAllowedHost(url, planRow.expectedHost))
    .slice(0, 6);

  for (const [index, url] of candidates.entries()) {
    const getFile = path.join(outputDir, `${planRow.competitionSlug}-${safeName(planRow.sportomediaStandingsExtractionPlanRowId)}-endpoint-${index + 1}-get.txt`);
    const getAttempt = runCurl([
      "--location",
      "--ipv4",
      "--http1.1",
      "--connect-timeout", "4",
      "--max-time", "12",
      "--max-filesize", "2000000",
      "--silent",
      "--show-error",
      "--header", "Accept: application/json,text/plain,*/*",
      "--output", getFile,
      "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
      url
    ], getFile);

    attempts.push({
      method: "GET",
      url,
      label: "endpoint_get",
      ...getAttempt
    });

    if (/graphql/i.test(url)) {
      for (const payload of buildGraphqlPayloads()) {
        const postFile = path.join(outputDir, `${planRow.competitionSlug}-${safeName(planRow.sportomediaStandingsExtractionPlanRowId)}-${payload.label}.json`);
        const postAttempt = runCurl([
          "--location",
          "--ipv4",
          "--http1.1",
          "--connect-timeout", "4",
          "--max-time", "12",
          "--max-filesize", "2000000",
          "--silent",
          "--show-error",
          "--request", "POST",
          "--header", "Content-Type: application/json",
          "--header", "Accept: application/json",
          "--data", payload.body,
          "--output", postFile,
          "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
          url
        ], postFile);

        attempts.push({
          method: "POST",
          url,
          label: payload.label,
          requestBodySha256: sha256Text(payload.body),
          ...postAttempt
        });
      }
    }
  }

  return attempts;
}

function parseAttemptForStandingArrays(attempt) {
  if (!attempt.outputFile || !fs.existsSync(attempt.outputFile) || attempt.outputSize <= 0) return [];
  const text = fs.readFileSync(attempt.outputFile, "utf8");
  try {
    const json = JSON.parse(text);
    return extractStandingLikeArraysFromJson(json).map((candidate) => ({
      ...candidate,
      sourceAttemptLabel: attempt.label,
      sourceAttemptMethod: attempt.method,
      sourceAttemptUrl: attempt.url,
      sourceAttemptHttpStatus: attempt.parsedWriteOut?.httpStatus ?? null
    }));
  } catch {
    return [];
  }
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing Sportomedia standings extraction plan: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const planRows = Array.isArray(input.planRows) ? input.planRows : [];
const readyRows = planRows.filter((row) => row.extractionPlanStatus === "ready_for_controlled_standings_extraction_runner");

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowFetchFlagPresent", allowFetch);
check(checks, "sourcePlanPassed", input.summary?.controlledSportomediaStandingsExtractionPlanStatus === "passed", { actual: input.summary?.controlledSportomediaStandingsExtractionPlanStatus });
check(checks, "sourceReadyRowsTwo", readyRows.length === 2, { actual: readyRows.length, expected: 2 });
check(checks, "sourceMayBuildRunner", Number(input.summary?.mayBuildControlledSportomediaStandingsExtractionRunnerCount ?? 0) === 1, { actual: input.summary?.mayBuildControlledSportomediaStandingsExtractionRunnerCount });
check(checks, "sourceCanonicalCandidateStillClosed", Number(input.summary?.mayBuildCanonicalCandidateNowCount ?? -1) === 0, { actual: input.summary?.mayBuildCanonicalCandidateNowCount });
check(checks, "readyRowsHaveEndpointCandidates", readyRows.every((row) => Array.isArray(row.endpointCandidates) && row.endpointCandidates.length > 0));
check(checks, "readyRowsHostsAreExpected", readyRows.every((row) => ["allsvenskan.se", "superettan.se"].includes(row.expectedHost)));

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowFetch) {
  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-standings-extraction-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: "blocked_preflight",
    inputPath,
    inputSha256: sha256Text(inputText),
    checks,
    extractionRows: [],
    summary: {
      status: "blocked_preflight",
      extractionRowCount: 0,
      extractedStandingCandidateRowCount: 0,
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

  const extractionRows = [];

  for (const planRow of readyRows.sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))) {
    const localHtmlTableRows = planRow.routeHtmlPath && fs.existsSync(planRow.routeHtmlPath)
      ? parseLocalHtmlTable(fs.readFileSync(planRow.routeHtmlPath, "utf8"))
      : [];

    const endpointAttempts = attemptEndpointFetches(planRow);
    const standingArrayCandidates = endpointAttempts.flatMap(parseAttemptForStandingArrays);
    const expectedCount = expectedCounts[planRow.competitionSlug] ?? null;

    const acceptedStandingCandidates = standingArrayCandidates.filter((candidate) =>
      expectedCount === null
        ? candidate.rowCount >= 8
        : candidate.rowCount === expectedCount
    );

    const extractionStatus =
      acceptedStandingCandidates.length > 0
        ? "extracted_standing_array_candidate_requires_quality_gate"
        : localHtmlTableRows.length >= 8
          ? "local_html_table_candidate_requires_quality_gate"
          : "blocked_no_standings_rows_extracted_endpoint_body_gap";

    extractionRows.push({
      sourcePlanRowId: planRow.sportomediaStandingsExtractionPlanRowId,
      competitionSlug: planRow.competitionSlug,
      competitionLabel: planRow.competitionLabel,
      providerFamily: "sportomedia",
      officialRoute: planRow.officialRoute,
      expectedHost: planRow.expectedHost,
      expectedStandingRowCount: expectedCount,
      localHtmlTableRowCount: localHtmlTableRows.length,
      localHtmlTableRows: localHtmlTableRows.slice(0, 20),
      endpointAttemptCount: endpointAttempts.length,
      endpointAttempts: endpointAttempts.map((attempt) => ({
        method: attempt.method,
        url: attempt.url,
        label: attempt.label,
        status: attempt.status,
        exitCode: attempt.exitCode,
        httpStatus: attempt.parsedWriteOut?.httpStatus ?? null,
        finalUrl: attempt.parsedWriteOut?.finalUrl ?? null,
        contentType: attempt.parsedWriteOut?.contentType ?? null,
        outputSize: attempt.outputSize,
        outputSha256: attempt.outputSha256,
        first500: attempt.first500,
        stderr: attempt.stderr
      })),
      standingArrayCandidateCount: standingArrayCandidates.length,
      acceptedStandingCandidateCount: acceptedStandingCandidates.length,
      standingArrayCandidates: standingArrayCandidates.slice(0, 20),
      acceptedStandingCandidates: acceptedStandingCandidates.slice(0, 10),
      extractionStatus,
      nextAllowedAction: {
        mayBuildStandingsExtractionQualityGate: acceptedStandingCandidates.length > 0 || localHtmlTableRows.length >= 8,
        mayBuildEndpointBodyResolverPlan: acceptedStandingCandidates.length === 0 && localHtmlTableRows.length < 8,
        mayBuildCanonicalCandidateNow: false,
        mayFetchNow: false,
        maySearch: false,
        mayBroadSearch: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    });
  }

  const extractedRows = extractionRows.filter((row) => row.extractionStatus === "extracted_standing_array_candidate_requires_quality_gate" || row.extractionStatus === "local_html_table_candidate_requires_quality_gate");
  const gapRows = extractionRows.filter((row) => row.extractionStatus === "blocked_no_standings_rows_extracted_endpoint_body_gap");

  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-standings-extraction-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: extractedRows.length === 2 ? "passed" : "passed_with_endpoint_body_gaps",
    inputPath,
    inputSha256: sha256Text(inputText),
    policy: {
      controlledFetchOnly: true,
      endpointCandidatesFromPlanOnly: true,
      noSearch: true,
      noBroadSearch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noTruthAssertion: true
    },
    checks,
    extractionRows,
    summary: {
      status: extractedRows.length === 2 ? "passed" : "passed_with_endpoint_body_gaps",
      extractionRowCount: extractionRows.length,
      extractedStandingCandidateRowCount: extractedRows.length,
      endpointBodyGapRowCount: gapRows.length,
      extractionRowsByCompetition: Object.fromEntries(extractionRows.map((row) => [row.competitionSlug, 1])),
      extractionRowsByStatus: extractionRows.reduce((acc, row) => {
        acc[row.extractionStatus] = (acc[row.extractionStatus] ?? 0) + 1;
        return acc;
      }, {}),
      totalEndpointAttemptCount: extractionRows.reduce((sum, row) => sum + row.endpointAttemptCount, 0),
      totalAcceptedStandingCandidateCount: extractionRows.reduce((sum, row) => sum + row.acceptedStandingCandidateCount, 0),
      mayBuildStandingsExtractionQualityGateCount: extractedRows.length > 0 ? 1 : 0,
      mayBuildEndpointBodyResolverPlanCount: gapRows.length > 0 ? 1 : 0,
      mayBuildCanonicalCandidateNowCount: 0,
      fetchExecutedNowCount: extractionRows.reduce((sum, row) => sum + row.endpointAttemptCount, 0),
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
    extractionRowCount: output.summary.extractionRowCount,
    extractedStandingCandidateRowCount: output.summary.extractedStandingCandidateRowCount,
    endpointBodyGapRowCount: output.summary.endpointBodyGapRowCount,
    extractionRowsByStatus: output.summary.extractionRowsByStatus,
    totalEndpointAttemptCount: output.summary.totalEndpointAttemptCount,
    totalAcceptedStandingCandidateCount: output.summary.totalAcceptedStandingCandidateCount,
    mayBuildStandingsExtractionQualityGateCount: output.summary.mayBuildStandingsExtractionQualityGateCount,
    mayBuildEndpointBodyResolverPlanCount: output.summary.mayBuildEndpointBodyResolverPlanCount,
    mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
  }, null, 2));
}
