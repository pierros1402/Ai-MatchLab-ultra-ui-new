import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");

const routeValidationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-official-route-validation-runner-2026-06-16",
  "controlled-sportomedia-official-route-validation-runner-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-exact-graphql-standings-extraction-runner-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-exact-graphql-standings-extraction-runner-2026-06-16.json"
);

const expected = {
  "swe.1": {
    expectedLeague: "allsvenskan",
    expectedSeason: "2026",
    expectedRouteHost: "allsvenskan.se",
    expectedRowCount: 16
  },
  "swe.2": {
    expectedLeague: "superettan",
    expectedSeason: "2026",
    expectedRouteHost: "superettan.se",
    expectedRowCount: 16
  }
};

const standingsQuery = `
query StandingsForLeague(
  $configLeagueName: String!
  $configSeasonStartYear: Int!
  $type: String!
) {
  standingsForLeague(
    configLeagueName: $configLeagueName
    configSeasonStartYear: $configSeasonStartYear
    type: $type
  ) {
    standings {
      teamAbbrv
      borderType
      teamName
      position
      previousPosition
      stats {
        value
        name
      }
      teamId
      form {
        configLeagueName
        configSeasonStartYear
        homeTeamAbbrv
        homeTeamDisplayName
        homeTeamName
        homeTeamScore
        id
        matchResult
        round
        startDate
        visitingTeamAbbrv
        visitingTeamDisplayName
        visitingTeamName
        visitingTeamScore
      }
    }
  }
}
`;

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

function extractRuntimeGlobals(html) {
  const gqlUri = html.match(/window\.gqlURI\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
  const currentSeason = html.match(/window\.currentSeason\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
  const currentLeague = html.match(/window\.currentLeague\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
  const leagueAbbrv = html.match(/window\.leagueAbbrv\s*=\s*["']([^"']+)["']/)?.[1] ?? null;
  const pageDataLeague = html.match(/"league"\s*:\s*"([^"]+)"/)?.[1] ?? null;
  const pageDataSeason = html.match(/"season"\s*:\s*"([^"]+)"/)?.[1] ?? null;

  return {
    gqlUri,
    currentSeason,
    currentLeague,
    leagueAbbrv,
    pageDataLeague,
    pageDataSeason,
    configLeagueName: pageDataLeague ?? currentLeague?.toLowerCase() ?? null,
    configSeasonStartYear: Number(pageDataSeason ?? currentSeason ?? NaN)
  };
}

function sameExactAllowedGraphqlEndpoint(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "gql.sportomedia.se" && parsed.pathname === "/graphql";
  } catch {
    return false;
  }
}

function routeOrigin(route) {
  const parsed = new URL(route);
  return `${parsed.protocol}//${parsed.hostname}`;
}

function runCurlPost({ url, body, referer, origin, outputFile }) {
  const result = spawnSync("curl.exe", [
    "--location",
    "--ipv4",
    "--http1.1",
    "--connect-timeout", "5",
    "--max-time", "18",
    "--max-filesize", "4000000",
    "--silent",
    "--show-error",
    "--request", "POST",
    "--header", "Content-Type: application/json",
    "--header", "Accept: application/json",
    "--header", `Origin: ${origin}`,
    "--header", `Referer: ${referer}`,
    "--data", body,
    "--output", outputFile,
    "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
    url
  ], {
    encoding: "utf8",
    timeout: 22000,
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
    first500: buffer.toString("utf8").slice(0, 500).replace(/\s+/g, " ")
  };
}

function statsMap(stats) {
  const map = {};
  for (const stat of Array.isArray(stats) ? stats : []) {
    if (stat && typeof stat === "object" && stat.name) {
      map[String(stat.name)] = stat.value;
    }
  }
  return map;
}

function normalizeStandingRow(row) {
  const s = statsMap(row.stats);
  const gf = Number(s.gf ?? 0);
  const ga = Number(s.ga ?? 0);
  return {
    teamId: row.teamId ?? null,
    teamName: row.teamName ?? null,
    teamAbbrv: row.teamAbbrv ?? null,
    position: Number(row.position ?? 0),
    previousPosition: row.previousPosition ?? null,
    played: Number(s.gp ?? 0),
    wins: Number(s.w ?? 0),
    draws: Number(s.t ?? 0),
    losses: Number(s.l ?? 0),
    goalsFor: gf,
    goalsAgainst: ga,
    goalDifference: gf - ga,
    points: Number(s.pts ?? 0),
    borderType: row.borderType ?? null
  };
}

function extractStandingsFromResponse(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      parseStatus: "missing_response_file",
      graphQlErrors: [],
      rawStandingRows: [],
      normalizedRows: []
    };
  }

  const text = fs.readFileSync(filePath, "utf8");
  try {
    const json = JSON.parse(text);
    const graphQlErrors = Array.isArray(json.errors) ? json.errors : [];
    const rawStandingRows = json?.data?.standingsForLeague?.standings;
    const rows = Array.isArray(rawStandingRows) ? rawStandingRows : [];
    return {
      parseStatus: "parsed_json",
      graphQlErrors,
      rawStandingRows: rows,
      normalizedRows: rows.map(normalizeStandingRow)
    };
  } catch (error) {
    return {
      parseStatus: "json_parse_failed",
      parseError: String(error?.message ?? error),
      graphQlErrors: [],
      rawStandingRows: [],
      normalizedRows: []
    };
  }
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(routeValidationPath)) {
  throw new Error(`Missing route validation output: ${routeValidationPath}`);
}

const routeText = fs.readFileSync(routeValidationPath, "utf8");
const routeValidation = JSON.parse(routeText);
const routeRows = Array.isArray(routeValidation.routeValidationRows) ? routeValidation.routeValidationRows : [];

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowFetchFlagPresent", allowFetch);
check(checks, "sourceRouteValidationPassed", routeValidation.summary?.status === "passed", { actual: routeValidation.summary?.status });
check(checks, "sourceValidOfficialRouteCountTwo", Number(routeValidation.summary?.validOfficialRouteCount ?? 0) === 2, { actual: routeValidation.summary?.validOfficialRouteCount });
check(checks, "routeRowsExpectedCount", routeRows.length === 2, { actual: routeRows.length, expected: 2 });

const preflightRows = routeRows.map((routeRow) => {
  const htmlPath = routeRow.htmlPath;
  const html = htmlPath && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  const globals = extractRuntimeGlobals(html);
  const meta = expected[routeRow.competitionSlug] ?? {};
  return {
    competitionSlug: routeRow.competitionSlug,
    officialRoute: routeRow.officialStandingsRoute,
    expectedRouteHost: meta.expectedRouteHost,
    htmlPath,
    htmlPresent: Boolean(html),
    runtimeGlobals: globals,
    expected: meta
  };
});

check(checks, "runtimeGlobalsFoundForBothRows", preflightRows.every((row) => row.htmlPresent && row.runtimeGlobals.gqlUri && row.runtimeGlobals.configLeagueName && row.runtimeGlobals.configSeasonStartYear), {
  actual: preflightRows.map((row) => ({ competitionSlug: row.competitionSlug, runtimeGlobals: row.runtimeGlobals }))
});
check(checks, "gqlEndpointExactlyAllowed", preflightRows.every((row) => sameExactAllowedGraphqlEndpoint(row.runtimeGlobals.gqlUri)), {
  actual: preflightRows.map((row) => ({ competitionSlug: row.competitionSlug, gqlUri: row.runtimeGlobals.gqlUri }))
});
check(checks, "variablesMatchExpectedCompetitions", preflightRows.every((row) => {
  const meta = expected[row.competitionSlug];
  return meta &&
    row.runtimeGlobals.configLeagueName === meta.expectedLeague &&
    String(row.runtimeGlobals.configSeasonStartYear) === String(meta.expectedSeason);
}), {
  actual: preflightRows.map((row) => ({ competitionSlug: row.competitionSlug, configLeagueName: row.runtimeGlobals.configLeagueName, configSeasonStartYear: row.runtimeGlobals.configSeasonStartYear }))
});

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowFetch) {
  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: "blocked_preflight",
    routeValidationPath,
    routeValidationSha256: sha256Text(routeText),
    checks,
    preflightRows,
    extractionRows: [],
    summary: {
      status: "blocked_preflight",
      extractionRowCount: 0,
      acceptedStandingsExtractionRowCount: 0,
      blockedStandingsExtractionRowCount: 0,
      totalExtractedStandingRowCount: 0,
      mayBuildStandingsExtractionQualityGateCount: 0,
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

  const extractionRows = preflightRows
    .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)))
    .map((row) => {
      const body = JSON.stringify({
        operationName: "StandingsForLeague",
        query: standingsQuery,
        variables: {
          configLeagueName: row.runtimeGlobals.configLeagueName,
          configSeasonStartYear: row.runtimeGlobals.configSeasonStartYear,
          type: "total"
        }
      });

      const responseFile = path.join(outputDir, `${row.competitionSlug}-standingsForLeague-total-response.json`);
      const origin = routeOrigin(row.officialRoute);
      const attempt = runCurlPost({
        url: row.runtimeGlobals.gqlUri,
        body,
        referer: row.officialRoute,
        origin,
        outputFile: responseFile
      });

      const parsed = extractStandingsFromResponse(responseFile);
      const expectedRowCount = row.expected.expectedRowCount;
      const extractedRowCount = parsed.normalizedRows.length;

      const accepted =
        attempt.parsedWriteOut.httpStatus === 200 &&
        parsed.parseStatus === "parsed_json" &&
        parsed.graphQlErrors.length === 0 &&
        extractedRowCount === expectedRowCount &&
        parsed.normalizedRows.every((standingRow) => standingRow.teamName && Number.isFinite(standingRow.position) && Number.isFinite(standingRow.points));

      return {
        competitionSlug: row.competitionSlug,
        competitionLabel: row.expected.expectedLeague,
        providerFamily: "sportomedia",
        officialRoute: row.officialRoute,
        runtimeGlobals: row.runtimeGlobals,
        request: {
          method: "POST",
          url: row.runtimeGlobals.gqlUri,
          operationName: "StandingsForLeague",
          variables: {
            configLeagueName: row.runtimeGlobals.configLeagueName,
            configSeasonStartYear: row.runtimeGlobals.configSeasonStartYear,
            type: "total"
          },
          bodySha256: sha256Text(body),
          origin,
          referer: row.officialRoute
        },
        attempt: {
          status: attempt.status,
          exitCode: attempt.exitCode,
          errorCode: attempt.errorCode,
          stderr: attempt.stderr,
          httpStatus: attempt.parsedWriteOut.httpStatus,
          finalUrl: attempt.parsedWriteOut.finalUrl,
          contentType: attempt.parsedWriteOut.contentType,
          outputSize: attempt.outputSize,
          outputSha256: attempt.outputSha256,
          first500: attempt.first500,
          outputFile: attempt.outputFile
        },
        parseStatus: parsed.parseStatus,
        parseError: parsed.parseError ?? null,
        graphQlErrorCount: parsed.graphQlErrors.length,
        graphQlErrors: parsed.graphQlErrors.slice(0, 5),
        expectedStandingRowCount: expectedRowCount,
        extractedStandingRowCount: extractedRowCount,
        normalizedStandingRows: parsed.normalizedRows,
        sampleNormalizedStandingRows: parsed.normalizedRows.slice(0, 5),
        extractionStatus: accepted
          ? "accepted_exact_graphql_standings_rows_requires_quality_gate"
          : "blocked_exact_graphql_response_not_accepted",
        nextAllowedAction: {
          mayBuildStandingsExtractionQualityGate: accepted,
          mayBuildCanonicalCandidateNow: false,
          mayFetchNow: false,
          maySearch: false,
          mayBroadSearch: false,
          mayWriteCanonicalNow: false,
          mayWriteProductionNow: false,
          mayAssertTruthNow: false
        }
      };
    });

  const acceptedRows = extractionRows.filter((row) => row.extractionStatus === "accepted_exact_graphql_standings_rows_requires_quality_gate");
  const blockedRows = extractionRows.filter((row) => row.extractionStatus !== "accepted_exact_graphql_standings_rows_requires_quality_gate");

  const output = {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-exact-graphql-standings-extraction-runner-file",
    generatedAtUtc: new Date().toISOString(),
    status: acceptedRows.length === 2 ? "passed" : "passed_with_exact_graphql_extraction_gaps",
    routeValidationPath,
    routeValidationSha256: sha256Text(routeText),
    policy: {
      controlledFetchOnly: true,
      endpointFromFetchedOfficialHtmlWindowGqlUriOnly: true,
      allowedGraphqlEndpoint: "https://gql.sportomedia.se/graphql",
      variablesFromFetchedOfficialHtmlPageDataOnly: true,
      noSearch: true,
      noBroadSearch: true,
      noCanonicalWrite: true,
      noProductionWrite: true,
      noTruthAssertion: true
    },
    checks,
    preflightRows,
    extractionRows,
    summary: {
      status: acceptedRows.length === 2 ? "passed" : "passed_with_exact_graphql_extraction_gaps",
      extractionRowCount: extractionRows.length,
      acceptedStandingsExtractionRowCount: acceptedRows.length,
      blockedStandingsExtractionRowCount: blockedRows.length,
      totalExtractedStandingRowCount: extractionRows.reduce((sum, row) => sum + row.extractedStandingRowCount, 0),
      extractionRowsByCompetition: Object.fromEntries(extractionRows.map((row) => [row.competitionSlug, 1])),
      extractionRowsByStatus: extractionRows.reduce((acc, row) => {
        acc[row.extractionStatus] = (acc[row.extractionStatus] ?? 0) + 1;
        return acc;
      }, {}),
      mayBuildStandingsExtractionQualityGateCount: acceptedRows.length === 2 ? 1 : 0,
      mayBuildCanonicalCandidateNowCount: 0,
      fetchExecutedNowCount: extractionRows.length,
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
    acceptedStandingsExtractionRowCount: output.summary.acceptedStandingsExtractionRowCount,
    blockedStandingsExtractionRowCount: output.summary.blockedStandingsExtractionRowCount,
    totalExtractedStandingRowCount: output.summary.totalExtractedStandingRowCount,
    extractionRowsByStatus: output.summary.extractionRowsByStatus,
    mayBuildStandingsExtractionQualityGateCount: output.summary.mayBuildStandingsExtractionQualityGateCount,
    mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
  }, null, 2));
}
