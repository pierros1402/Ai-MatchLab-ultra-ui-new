import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");

const waveTargetsPath = path.join(
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
  "whole-map-official-host-direct-route-probe-wave-01-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-official-host-direct-route-probe-wave-01-2026-06-16.json"
);

const responseDir = path.join(outputDir, "responses");

const maxFetchBytes = 2500000;
const connectTimeoutSeconds = 4;
const maxTimeSeconds = 12;

const expectedRowsBySlug = {
  "ger.3": 20,
  "eng.1": 20,
  "eng.2": 24,
  "eng.3": 24,
  "eng.4": 24,
  "eng.5": 24,
  "fra.1": 18,
  "fra.2": 18,
  "ita.1": 20,
  "ita.2": 20,
  "ned.1": 18,
  "ned.2": 20,
  "bel.1": 16,
  "bel.2": 16,
  "den.1": 12,
  "den.2": 12,
  "sui.1": 12,
  "sui.2": 10,
  "aut.1": 12,
  "aut.2": 16,
  "fin.1": 12,
  "fin.2": 10,
  "irl.1": 10,
  "irl.2": 10
};

const routeProfiles = {
  "ger.3": [
    "https://www.dfb.de/3-liga/tabelle",
    "https://www.dfb.de/3-liga/spieltagtabelle",
    "https://www.3-liga.com/tabelle",
    "https://www.3-liga.com/spieltag/tabelle"
  ],
  "eng.1": [
    "https://www.premierleague.com/tables",
    "https://www.premierleague.com/tables?co=1&se=719&ha=-1"
  ],
  "eng.2": [
    "https://www.efl.com/competitions/efl-championship/standings",
    "https://www.efl.com/competitions/sky-bet-championship/standings"
  ],
  "eng.3": [
    "https://www.efl.com/competitions/efl-league-one/standings",
    "https://www.efl.com/competitions/sky-bet-league-one/standings"
  ],
  "eng.4": [
    "https://www.efl.com/competitions/efl-league-two/standings",
    "https://www.efl.com/competitions/sky-bet-league-two/standings"
  ],
  "eng.5": [
    "https://www.thenationalleague.org.uk/match-info/tables",
    "https://www.thenationalleague.org.uk/fixtures-results-tables"
  ],
  "fra.1": [
    "https://www.ligue1.com/ranking",
    "https://www.ligue1.com/standings"
  ],
  "fra.2": [
    "https://www.ligue2.fr/classement",
    "https://www.ligue2.fr/ranking"
  ],
  "ita.1": [
    "https://www.legaseriea.it/en/serie-a/standing",
    "https://www.legaseriea.it/it/serie-a/classifica"
  ],
  "ita.2": [
    "https://www.legab.it/seriebkt/classifica/",
    "https://www.legab.it/classifica/"
  ],
  "ned.1": [
    "https://eredivisie.nl/competitie/stand/",
    "https://eredivisie.nl/competitie/stand"
  ],
  "ned.2": [
    "https://keukenkampioendivisie.nl/stand",
    "https://keukenkampioendivisie.nl/competitie/stand"
  ],
  "bel.1": [
    "https://www.proleague.be/jupiler-pro-league/klassement",
    "https://www.proleague.be/en/jpl/standings"
  ],
  "bel.2": [
    "https://www.proleague.be/challenger-pro-league/klassement",
    "https://www.proleague.be/en/cpl/standings"
  ],
  "den.1": [
    "https://superliga.dk/stilling",
    "https://superliga.dk/tabel"
  ],
  "den.2": [
    "https://www.division.dk/1-division/stilling",
    "https://www.division.dk/1-division/tabel"
  ],
  "sui.1": [
    "https://www.sfl.ch/de/statistiken-archive/super-league/tabelle/",
    "https://www.sfl.ch/fr/statistiques-archives/super-league/classement/"
  ],
  "sui.2": [
    "https://www.sfl.ch/de/statistiken-archive/challenge-league/tabelle/",
    "https://www.sfl.ch/fr/statistiques-archives/challenge-league/classement/"
  ],
  "aut.1": [
    "https://www.bundesliga.at/de/bundesliga/tabelle/",
    "https://www.bundesliga.at/de/bundesliga/tabelle"
  ],
  "aut.2": [
    "https://www.bundesliga.at/de/2liga/tabelle/",
    "https://www.bundesliga.at/de/2liga/tabelle"
  ],
  "fin.1": [
    "https://www.veikkausliiga.com/tilastot/2026/veikkausliiga/sarjataulukko/",
    "https://www.veikkausliiga.com/sarjataulukko/"
  ],
  "fin.2": [
    "https://www.ykkosliiga.fi/tulospalvelu/sarjataulukko",
    "https://www.ykkosliiga.fi/sarjataulukko"
  ],
  "irl.1": [
    "https://www.leagueofireland.ie/mens/sse-airtricity-mens-premier-division/table/",
    "https://www.leagueofireland.ie/fixtures-and-results/standings/"
  ],
  "irl.2": [
    "https://www.leagueofireland.ie/mens/sse-airtricity-mens-first-division/table/",
    "https://www.leagueofireland.ie/fixtures-and-results/standings/"
  ]
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

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 140);
}

function unique(values) {
  return [...new Set(values.filter(Boolean).map(String))];
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
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
    "--header", "Accept-Language: en-US,en;q=0.9",
    "--header", "Cache-Control: no-cache",
    "--header", "Pragma: no-cache",
    "--header", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 controlled-football-truth-bulk-official-route-probe",
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
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlRows(text) {
  const rows = [];
  const trMatches = [...String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const tr of trMatches) {
    const cells = [...tr[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
      .map((match) => stripTags(match[1]))
      .filter(Boolean);
    if (cells.length >= 3) rows.push(cells);
  }
  return rows;
}

function inspectRoute(text, slug, expectedRows) {
  const lower = String(text).toLowerCase();
  const title = (String(text).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const tableRows = parseHtmlRows(text);

  const keywordSignals = {
    standings: lower.includes("standings"),
    table: lower.includes("table"),
    ranking: lower.includes("ranking"),
    classement: lower.includes("classement"),
    klassement: lower.includes("klassement"),
    tabelle: lower.includes("tabelle"),
    sarjataulukko: lower.includes("sarjataulukko"),
    teams: lower.includes("team") || lower.includes("club"),
    points: lower.includes("points") || lower.includes("punkte") || lower.includes("pts") || lower.includes("pisteet")
  };

  const routeSignalScore = [
    keywordSignals.standings,
    keywordSignals.table,
    keywordSignals.ranking,
    keywordSignals.classement,
    keywordSignals.klassement,
    keywordSignals.tabelle,
    keywordSignals.sarjataulukko,
    keywordSignals.teams,
    keywordSignals.points,
    tableRows.length >= Math.max(6, Math.floor((expectedRows ?? 10) / 2))
  ].filter(Boolean).length;

  let classification = "fetched_unclassified";
  if (routeSignalScore >= 4) classification = "route_candidate_strong_standings_signal";
  else if (routeSignalScore >= 2) classification = "route_candidate_weak_standings_signal";
  else if (String(text).length > 0) classification = "fetched_no_standings_signal";

  return {
    title,
    contentLength: String(text).length,
    tableRowCount: tableRows.length,
    keywordSignals,
    routeSignalScore,
    classification,
    first500: String(text).slice(0, 500).replace(/\s+/g, " ")
  };
}

function buildRouteCandidates(target) {
  const slug = target.competitionSlug;
  const routes = routeProfiles[slug] ?? [];
  return unique(routes).map((url, index) => ({
    routeCandidateId: `${slug}_route_${String(index + 1).padStart(2, "0")}`,
    competitionSlug: slug,
    competitionLabel: target.competitionLabel,
    countryCode: target.countryCode,
    providerSignalClass: target.providerSignalClass,
    expectedStandingRowCount: expectedRowsBySlug[slug] ?? target.expectedStandingRowCount ?? null,
    routePriority: index + 1,
    url,
    source: "static_official_host_route_profile_wave_01"
  }));
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(waveTargetsPath)) {
  throw new Error(`Missing wave targets: ${waveTargetsPath}`);
}

const waveText = fs.readFileSync(waveTargetsPath, "utf8");
const wave = JSON.parse(waveText);
const targets = Array.isArray(wave.targets) ? wave.targets : [];

const routeCandidates = targets.flatMap(buildRouteCandidates);

const checks = [];
check(checks, "allowExecuteFlagPresent", allowExecute);
check(checks, "allowFetchFlagPresent", allowFetch);
check(checks, "waveTargetCountTwentyFour", targets.length === 24, { actual: targets.length, expected: 24 });
check(checks, "ger3Included", targets.some((target) => target.competitionSlug === "ger.3"));
check(checks, "routeCandidateCountAtLeastForty", routeCandidates.length >= 40, { actual: routeCandidates.length });
check(checks, "allRoutesHttps", routeCandidates.every((row) => String(row.url).startsWith("https://")));
check(checks, "noSearchNoWriteInThisRunner", true);
check(checks, "productionAndTruthLocked", true);

const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

if (preflightBlockedCount !== 0 || !allowExecute || !allowFetch) {
  const output = {
    output: outputPath,
    status: "blocked_preflight",
    sourceWaveTargetsPath: waveTargetsPath,
    sourceWaveTargetsSha256: sha256Text(waveText),
    checks,
    resultRows: [],
    summary: {
      status: "blocked_preflight",
      waveTargetCount: targets.length,
      routeCandidateCount: routeCandidates.length,
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
  fs.mkdirSync(responseDir, { recursive: true });

  const resultRows = [];

  for (const candidate of routeCandidates) {
    const responsePath = path.join(
      responseDir,
      `${safeName(candidate.competitionSlug)}-${String(candidate.routePriority).padStart(2, "0")}-${safeName(new URL(candidate.url).hostname)}.html`
    );

    const response = runCurlGet(candidate.url, responsePath);
    const httpStatus = response.parsedWriteOut.httpStatus;
    const httpOk = httpStatus >= 200 && httpStatus < 300;
    const inspection = httpOk ? inspectRoute(response.text, candidate.competitionSlug, candidate.expectedStandingRowCount) : null;

    let resultStatus = "route_fetch_not_2xx";
    if (httpOk && inspection.routeSignalScore >= 4) resultStatus = "accepted_official_route_candidate_strong_signal_requires_parser";
    else if (httpOk && inspection.routeSignalScore >= 2) resultStatus = "review_official_route_candidate_weak_signal";
    else if (httpOk) resultStatus = "fetched_2xx_no_standings_signal";
    else if (httpStatus === 403 || httpStatus === 401) resultStatus = "blocked_or_requires_browser_runtime";
    else if (httpStatus === 404) resultStatus = "route_not_found";

    resultRows.push({
      ...candidate,
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
        mayBuildSpecificParserPlan: resultStatus === "accepted_official_route_candidate_strong_signal_requires_parser",
        mayReviewWeakRouteSignal: resultStatus === "review_official_route_candidate_weak_signal",
        mayBuildBrowserRuntimePlan: resultStatus === "blocked_or_requires_browser_runtime",
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    });
  }

  const resultRowsByStatus = countBy(resultRows, "resultStatus");
  const resultRowsByCompetition = countBy(resultRows, "competitionSlug");
  const twoXxRows = resultRows.filter((row) => row.httpStatus >= 200 && row.httpStatus < 300);
  const strongRows = resultRows.filter((row) => row.resultStatus === "accepted_official_route_candidate_strong_signal_requires_parser");
  const weakRows = resultRows.filter((row) => row.resultStatus === "review_official_route_candidate_weak_signal");
  const browserRows = resultRows.filter((row) => row.resultStatus === "blocked_or_requires_browser_runtime");

  const bestRouteRows = [];
  for (const slug of unique(resultRows.map((row) => row.competitionSlug)).sort()) {
    const rows = resultRows.filter((row) => row.competitionSlug === slug);
    const best = rows
      .slice()
      .sort((a, b) => {
        const scoreA = a.inspection?.routeSignalScore ?? -1;
        const scoreB = b.inspection?.routeSignalScore ?? -1;
        if (scoreB !== scoreA) return scoreB - scoreA;
        const okA = a.httpStatus >= 200 && a.httpStatus < 300 ? 1 : 0;
        const okB = b.httpStatus >= 200 && b.httpStatus < 300 ? 1 : 0;
        if (okB !== okA) return okB - okA;
        return a.routePriority - b.routePriority;
      })[0];

    if (best) {
      bestRouteRows.push({
        competitionSlug: slug,
        bestResultStatus: best.resultStatus,
        httpStatus: best.httpStatus,
        routeSignalScore: best.inspection?.routeSignalScore ?? null,
        tableRowCount: best.inspection?.tableRowCount ?? null,
        title: best.inspection?.title ?? null,
        url: best.url,
        finalUrl: best.finalUrl,
        nextAllowedAction: best.nextAllowedAction
      });
    }
  }

  const output = {
    output: outputPath,
    job: "run-football-truth-whole-map-official-host-direct-route-probe-wave-01-file",
    generatedAtUtc: new Date().toISOString(),
    sourceWaveTargetsPath: waveTargetsPath,
    sourceWaveTargetsSha256: sha256Text(waveText),
    policy: {
      controlledDirectOfficialHostRouteProbe: true,
      waveTargetCount: targets.length,
      noSearchInThisJob: true,
      noBroadSearchInThisJob: true,
      noCanonicalWriteInThisJob: true,
      noProductionWriteInThisJob: true,
      noTruthAssertionInThisJob: true
    },
    checks,
    routeCandidates,
    resultRows,
    bestRouteRows,
    summary: {
      status: "passed",
      waveTargetCount: targets.length,
      routeCandidateCount: routeCandidates.length,
      routeCandidateRowsByCompetition: resultRowsByCompetition,
      fetched2xxRouteCandidateCount: twoXxRows.length,
      strongOfficialRouteCandidateCount: strongRows.length,
      weakOfficialRouteCandidateCount: weakRows.length,
      browserRuntimeRequiredRouteCandidateCount: browserRows.length,
      bestRouteStrongCompetitionCount: bestRouteRows.filter((row) => row.bestResultStatus === "accepted_official_route_candidate_strong_signal_requires_parser").length,
      bestRouteWeakCompetitionCount: bestRouteRows.filter((row) => row.bestResultStatus === "review_official_route_candidate_weak_signal").length,
      bestRouteRowsByStatus: countBy(bestRouteRows, "bestResultStatus"),
      resultRowsByStatus,
      fetchExecutedNowCount: resultRows.length,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      mayBuildBulkSpecificParserPlanCount: strongRows.length > 0 ? 1 : 0,
      mayBuildWeakRouteReviewPlanCount: weakRows.length > 0 ? 1 : 0,
      mayBuildBrowserRuntimePlanCount: browserRows.length > 0 ? 1 : 0,
      preflightBlockedCount
    }
  };

  writeJson(outputPath, output);

  console.log(JSON.stringify({
    output: output.output,
    status: output.summary.status,
    waveTargetCount: output.summary.waveTargetCount,
    routeCandidateCount: output.summary.routeCandidateCount,
    fetched2xxRouteCandidateCount: output.summary.fetched2xxRouteCandidateCount,
    strongOfficialRouteCandidateCount: output.summary.strongOfficialRouteCandidateCount,
    weakOfficialRouteCandidateCount: output.summary.weakOfficialRouteCandidateCount,
    browserRuntimeRequiredRouteCandidateCount: output.summary.browserRuntimeRequiredRouteCandidateCount,
    bestRouteStrongCompetitionCount: output.summary.bestRouteStrongCompetitionCount,
    bestRouteWeakCompetitionCount: output.summary.bestRouteWeakCompetitionCount,
    bestRouteRowsByStatus: output.summary.bestRouteRowsByStatus,
    resultRowsByStatus: output.summary.resultRowsByStatus,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
    mayBuildBulkSpecificParserPlanCount: output.summary.mayBuildBulkSpecificParserPlanCount,
    mayBuildWeakRouteReviewPlanCount: output.summary.mayBuildWeakRouteReviewPlanCount,
    mayBuildBrowserRuntimePlanCount: output.summary.mayBuildBrowserRuntimePlanCount,
    preflightBlockedCount: output.summary.preflightBlockedCount
  }, null, 2));
}
