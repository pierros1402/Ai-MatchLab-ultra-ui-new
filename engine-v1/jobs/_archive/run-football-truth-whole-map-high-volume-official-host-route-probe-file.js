import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");

const maxTargetsArg = Number(process.argv.find((arg) => arg.startsWith("--max-targets="))?.split("=")[1] ?? 78);
const maxRoutesPerTargetArg = Number(process.argv.find((arg) => arg.startsWith("--max-routes-per-target="))?.split("=")[1] ?? 3);
const concurrencyArg = Number(process.argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] ?? 8);

const allTargetsPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-search-runner-adapter-2026-06-16",
  "whole-map-official-host-search-all-adapted-targets-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-high-volume-official-host-route-probe-2026-06-16"
);

const responseDir = path.join(outputDir, "responses");

const outputPath = path.join(
  outputDir,
  "whole-map-high-volume-official-host-route-probe-2026-06-16.json"
);

const maxFetchBytes = 1600000;
const connectTimeoutSeconds = 4;
const maxTimeSeconds = 10;

const alreadyCanonicalCovered = new Set(["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2", "ger.1", "ger.2"]);

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
  "irl.2": 10,
  "por.1": 18,
  "por.2": 18,
  "sco.1": 12,
  "sco.2": 10,
  "usa.1": 30,
  "usa.2": 24,
  "mex.1": 18,
  "mex.2": 15,
  "arg.1": 30,
  "arg.2": 20,
  "aus.1": 12,
  "aus.2": 12
};

const specificRouteProfiles = {
  "ger.3": [
    "https://www.dfb.de/3-liga/tabelle",
    "https://www.dfb.de/3-liga/spieltagtabelle",
    "https://www.3-liga.com/tabelle"
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
    "https://www.ligue1.com/standings",
    "https://www.ligue1.fr/classement"
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
  ],
  "por.1": [
    "https://www.ligaportugal.pt/pt/liga/classificacao/",
    "https://www.ligaportugal.pt/en/liga/classificacao/"
  ],
  "por.2": [
    "https://www.ligaportugal.pt/pt/liga/classificacao/20252026/ligaportugal2",
    "https://www.ligaportugal.pt/en/liga/classificacao/20252026/ligaportugal2"
  ],
  "sco.1": [
    "https://spfl.co.uk/league/premiership/table",
    "https://spfl.co.uk/league/premiership/fixtures"
  ],
  "sco.2": [
    "https://spfl.co.uk/league/championship/table",
    "https://spfl.co.uk/league/championship/fixtures"
  ],
  "usa.1": [
    "https://www.mlssoccer.com/standings/2026/overall",
    "https://www.mlssoccer.com/standings"
  ],
  "usa.2": [
    "https://www.uslchampionship.com/league-standings",
    "https://www.uslchampionship.com/standings"
  ],
  "mex.1": [
    "https://ligamx.net/cancha/tablaGeneral",
    "https://ligamx.net/cancha/estadistica"
  ],
  "arg.1": [
    "https://www.ligaprofesional.ar/estadisticas/posiciones/",
    "https://www.ligaprofesional.ar/posiciones/"
  ],
  "aus.1": [
    "https://aleagues.com.au/a-league-men/ladder/",
    "https://aleagues.com.au/ladder/"
  ],
  "aus.2": [
    "https://aleagues.com.au/a-league-men/ladder/",
    "https://aleagues.com.au/ladder/"
  ]
};

const possibleOfficialHostsByCountry = {
  aia: ["anguillafa.com", "www.anguillafa.com"],
  alb: ["fshf.org", "www.fshf.org"],
  alg: ["faf.dz", "www.faf.dz", "lnfa.dz"],
  and: ["faf.ad", "www.faf.ad"],
  ang: ["faf.co.ao", "www.faf.co.ao"],
  arg: ["www.ligaprofesional.ar", "ligaprofesional.ar", "www.afa.com.ar"],
  arm: ["www.ffa.am", "ffa.am"],
  aru: ["www.avbaruba.aw", "avbaruba.aw"],
  asa: ["ffas.as", "www.ffas.as"],
  atg: ["antiguafootball.com", "www.antiguafootball.com"],
  aus: ["aleagues.com.au", "www.footballaustralia.com.au"],
  aut: ["www.bundesliga.at"],
  aze: ["www.affa.az", "affa.az"],
  bel: ["www.proleague.be"],
  den: ["superliga.dk", "www.division.dk"],
  eng: ["www.premierleague.com", "www.efl.com", "www.thenationalleague.org.uk"],
  fin: ["www.veikkausliiga.com", "www.ykkosliiga.fi"],
  fra: ["www.ligue1.com", "www.ligue2.fr", "www.lfp.fr"],
  ger: ["www.dfb.de", "www.3-liga.com"],
  irl: ["www.leagueofireland.ie"],
  ita: ["www.legaseriea.it", "www.legab.it"],
  mex: ["ligamx.net"],
  ned: ["eredivisie.nl", "keukenkampioendivisie.nl"],
  por: ["www.ligaportugal.pt"],
  sco: ["spfl.co.uk"],
  sui: ["www.sfl.ch"],
  usa: ["www.mlssoccer.com", "www.uslchampionship.com"]
};

const genericStandingPaths = [
  "/standings",
  "/standings/",
  "/table",
  "/table/",
  "/tables",
  "/tables/",
  "/ranking",
  "/ranking/",
  "/tabelle",
  "/tabelle/",
  "/classement",
  "/classement/",
  "/klassement",
  "/klassement/",
  "/stand",
  "/stand/",
  "/ladder",
  "/ladder/"
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
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 160);
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

function inspectRoute(text, expectedRows) {
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
    ladder: lower.includes("ladder"),
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
    keywordSignals.ladder,
    keywordSignals.teams,
    keywordSignals.points,
    tableRows.length >= Math.max(6, Math.floor((expectedRows ?? 10) / 2))
  ].filter(Boolean).length;

  let classification = "fetched_unclassified";
  if (routeSignalScore >= 4) classification = "accepted_route_candidate_strong_signal_requires_parser";
  else if (routeSignalScore >= 2) classification = "review_route_candidate_weak_signal";
  else if (String(text).length > 0) classification = "fetched_2xx_no_standings_signal";

  return {
    title,
    contentLength: String(text).length,
    tableRowCount: tableRows.length,
    routeSignalScore,
    keywordSignals,
    classification,
    first400: String(text).slice(0, 400).replace(/\s+/g, " ")
  };
}

function targetSortScore(row) {
  const highValueCountries = ["ger", "eng", "fra", "ita", "ned", "bel", "den", "sui", "aut", "fin", "irl", "por", "sco", "usa", "mex", "arg", "aus"];
  const idx = highValueCountries.indexOf(row.countryCode);
  const countryScore = idx >= 0 ? idx : 500;
  const divisionScore = String(row.competitionSlug).endsWith(".1") ? 1 : String(row.competitionSlug).endsWith(".2") ? 2 : String(row.competitionSlug).endsWith(".3") ? 3 : 9;
  return countryScore * 10 + divisionScore;
}

function routeCandidatesForTarget(target, maxRoutesPerTarget) {
  const slug = target.competitionSlug;
  const country = target.countryCode;
  const routes = [];

  for (const url of specificRouteProfiles[slug] ?? []) {
    routes.push({
      url,
      routeSource: "specific_route_profile",
      routeConfidence: "medium_high"
    });
  }

  const hintHosts = unique([
    ...(Array.isArray(target.officialHostHints) ? target.officialHostHints : []),
    ...(Array.isArray(target.preferredOfficialHostHints) ? target.preferredOfficialHostHints : []),
    ...(possibleOfficialHostsByCountry[country] ?? [])
  ]).map((host) => host.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));

  for (const host of hintHosts.slice(0, 4)) {
    for (const routePath of genericStandingPaths) {
      routes.push({
        url: `https://${host}${routePath}`,
        routeSource: "host_hint_generic_standings_path",
        routeConfidence: "low_to_medium_requires_validation"
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const route of routes) {
    if (seen.has(route.url)) continue;
    seen.add(route.url);
    deduped.push(route);
  }

  return deduped.slice(0, maxRoutesPerTarget).map((route, index) => ({
    routeCandidateId: `${slug}_bulk_route_${String(index + 1).padStart(2, "0")}`,
    competitionSlug: slug,
    competitionLabel: target.competitionLabel,
    countryCode: target.countryCode,
    providerSignalClass: target.providerSignalClass,
    expectedStandingRowCount: expectedRowsBySlug[slug] ?? target.expectedStandingRowCount ?? null,
    routePriority: index + 1,
    ...route
  }));
}

function runCurlGet(candidate) {
  return new Promise((resolve) => {
    const host = new URL(candidate.url).hostname;
    const responsePath = path.join(
      responseDir,
      `${safeName(candidate.competitionSlug)}-${String(candidate.routePriority).padStart(2, "0")}-${safeName(host)}.html`
    );

    const curlArgs = [
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
      "--header", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36 controlled-football-truth-high-volume-route-probe",
      "--output", responsePath,
      "--write-out", "HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
      candidate.url
    ];

    const startedAt = new Date().toISOString();
    const child = spawn("curl.exe", curlArgs, { windowsHide: true });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });

    child.on("error", (error) => {
      resolve({
        ...candidate,
        startedAt,
        finishedAt: new Date().toISOString(),
        resultStatus: "curl_spawn_error",
        httpStatus: null,
        finalUrl: null,
        contentType: null,
        outputFile: responsePath,
        outputSize: 0,
        outputSha256: null,
        curlExitCode: null,
        curlErrorCode: error.code ?? null,
        curlStderr: String(error.message ?? error),
        inspection: null
      });
    });

    child.on("close", (code, signal) => {
      const parsed = parseWriteOut(stdout);
      const exists = fs.existsSync(responsePath);
      const buffer = exists ? fs.readFileSync(responsePath) : Buffer.from("");
      const text = buffer.toString("utf8");
      const httpStatus = parsed.httpStatus;
      const httpOk = httpStatus >= 200 && httpStatus < 300;
      const inspection = httpOk ? inspectRoute(text, candidate.expectedStandingRowCount) : null;

      let resultStatus = "route_fetch_not_2xx";
      if (httpOk && inspection.routeSignalScore >= 4) resultStatus = "accepted_route_candidate_strong_signal_requires_parser";
      else if (httpOk && inspection.routeSignalScore >= 2) resultStatus = "review_route_candidate_weak_signal";
      else if (httpOk) resultStatus = "fetched_2xx_no_standings_signal";
      else if (httpStatus === 403 || httpStatus === 401) resultStatus = "blocked_or_requires_browser_runtime";
      else if (httpStatus === 404) resultStatus = "route_not_found";
      else if (code !== 0) resultStatus = "curl_nonzero_or_timeout";

      resolve({
        ...candidate,
        startedAt,
        finishedAt: new Date().toISOString(),
        resultStatus,
        httpStatus,
        finalUrl: parsed.finalUrl,
        contentType: parsed.contentType,
        outputFile: responsePath,
        outputSize: buffer.length,
        outputSha256: buffer.length > 0 ? sha256Buffer(buffer) : null,
        curlExitCode: code,
        curlSignal: signal,
        curlStderr: stderr,
        inspection,
        nextAllowedAction: {
          mayBuildParserExtractionBoard: resultStatus === "accepted_route_candidate_strong_signal_requires_parser" || resultStatus === "review_route_candidate_weak_signal",
          mayBuildRouteRepairPlan: resultStatus === "route_not_found" || resultStatus === "route_fetch_not_2xx" || resultStatus === "curl_nonzero_or_timeout",
          mayBuildBrowserRuntimePlan: resultStatus === "blocked_or_requires_browser_runtime",
          mayWriteCanonicalNow: false,
          mayWriteProductionNow: false,
          mayAssertTruthNow: false
        }
      });
    });
  });
}

async function runPool(items, concurrency, worker) {
  const results = [];
  let nextIndex = 0;

  async function oneWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => oneWorker()));
  return results;
}

function bestRowsByCompetition(rows) {
  const slugs = unique(rows.map((row) => row.competitionSlug)).sort();
  return slugs.map((slug) => {
    const compRows = rows.filter((row) => row.competitionSlug === slug);
    const sorted = compRows.slice().sort((a, b) => {
      const scoreA = a.inspection?.routeSignalScore ?? -1;
      const scoreB = b.inspection?.routeSignalScore ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
      const okA = a.httpStatus >= 200 && a.httpStatus < 300 ? 1 : 0;
      const okB = b.httpStatus >= 200 && b.httpStatus < 300 ? 1 : 0;
      if (okB !== okA) return okB - okA;
      return a.routePriority - b.routePriority;
    });
    const best = sorted[0];
    return {
      competitionSlug: slug,
      countryCode: best.countryCode,
      providerSignalClass: best.providerSignalClass,
      bestResultStatus: best.resultStatus,
      httpStatus: best.httpStatus,
      routeSignalScore: best.inspection?.routeSignalScore ?? null,
      tableRowCount: best.inspection?.tableRowCount ?? null,
      title: best.inspection?.title ?? null,
      sourceUrl: best.url,
      finalUrl: best.finalUrl,
      routeSource: best.routeSource,
      routeConfidence: best.routeConfidence,
      outputFile: best.outputFile,
      nextAllowedAction: best.nextAllowedAction
    };
  });
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

async function main() {
  if (!fs.existsSync(allTargetsPath)) throw new Error(`Missing all adapted targets: ${allTargetsPath}`);

  const targetText = fs.readFileSync(allTargetsPath, "utf8");
  const targetPayload = JSON.parse(targetText);
  const allTargets = Array.isArray(targetPayload.targets) ? targetPayload.targets : [];

  const selectedTargets = allTargets
    .filter((target) => !alreadyCanonicalCovered.has(target.competitionSlug))
    .sort((a, b) => targetSortScore(a) - targetSortScore(b) || a.competitionSlug.localeCompare(b.competitionSlug))
    .slice(0, maxTargetsArg);

  const routeCandidates = selectedTargets.flatMap((target) => routeCandidatesForTarget(target, maxRoutesPerTargetArg));

  const checks = [];
  check(checks, "allowExecuteFlagPresent", allowExecute);
  check(checks, "allowFetchFlagPresent", allowFetch);
  check(checks, "sourceAllTargetsSeventyEight", allTargets.length === 78, { actual: allTargets.length, expected: 78 });
  check(checks, "selectedTargetCountAtLeastFifty", selectedTargets.length >= 50, { actual: selectedTargets.length });
  check(checks, "ger3Included", selectedTargets.some((target) => target.competitionSlug === "ger.3"));
  check(checks, "routeCandidateCountAtLeastEighty", routeCandidates.length >= 80, { actual: routeCandidates.length });
  check(checks, "allRoutesHttps", routeCandidates.every((row) => String(row.url).startsWith("https://")));
  check(checks, "noSearchNoWriteInThisRunner", true);
  check(checks, "productionAndTruthLocked", true);

  const preflightBlockedCount = checks.filter((entry) => !entry.passed).length;

  if (preflightBlockedCount !== 0 || !allowExecute || !allowFetch) {
    const output = {
      output: outputPath,
      job: "run-football-truth-whole-map-high-volume-official-host-route-probe-file",
      generatedAtUtc: new Date().toISOString(),
      status: "blocked_preflight",
      sourceAllTargetsPath: allTargetsPath,
      sourceAllTargetsSha256: sha256Text(targetText),
      checks,
      resultRows: [],
      bestRouteRows: [],
      summary: {
        status: "blocked_preflight",
        sourceAllTargetCount: allTargets.length,
        selectedTargetCount: selectedTargets.length,
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
    return;
  }

  fs.mkdirSync(responseDir, { recursive: true });

  console.log(JSON.stringify({
    phase: "fetch_start",
    selectedTargetCount: selectedTargets.length,
    routeCandidateCount: routeCandidates.length,
    concurrency: concurrencyArg,
    maxRoutesPerTarget: maxRoutesPerTargetArg,
    noSearch: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  }));

  const resultRows = await runPool(routeCandidates, concurrencyArg, runCurlGet);
  const bestRouteRows = bestRowsByCompetition(resultRows);

  const resultRowsByStatus = countBy(resultRows, "resultStatus");
  const bestRouteRowsByStatus = countBy(bestRouteRows, "bestResultStatus");

  const strongRows = resultRows.filter((row) => row.resultStatus === "accepted_route_candidate_strong_signal_requires_parser");
  const weakRows = resultRows.filter((row) => row.resultStatus === "review_route_candidate_weak_signal");
  const strongBestRows = bestRouteRows.filter((row) => row.bestResultStatus === "accepted_route_candidate_strong_signal_requires_parser");
  const weakBestRows = bestRouteRows.filter((row) => row.bestResultStatus === "review_route_candidate_weak_signal");

  const output = {
    output: outputPath,
    job: "run-football-truth-whole-map-high-volume-official-host-route-probe-file",
    generatedAtUtc: new Date().toISOString(),
    sourceAllTargetsPath: allTargetsPath,
    sourceAllTargetsSha256: sha256Text(targetText),
    policy: {
      highVolumeOfficialHostRouteProbe: true,
      maxTargets: maxTargetsArg,
      maxRoutesPerTarget: maxRoutesPerTargetArg,
      concurrency: concurrencyArg,
      noSearchInThisJob: true,
      noBroadSearchInThisJob: true,
      noCanonicalWriteInThisJob: true,
      noProductionWriteInThisJob: true,
      noTruthAssertionInThisJob: true
    },
    checks,
    selectedTargets: selectedTargets.map((target) => ({
      competitionSlug: target.competitionSlug,
      competitionLabel: target.competitionLabel,
      countryCode: target.countryCode,
      providerSignalClass: target.providerSignalClass,
      expectedStandingRowCount: expectedRowsBySlug[target.competitionSlug] ?? target.expectedStandingRowCount ?? null
    })),
    routeCandidates,
    resultRows,
    bestRouteRows,
    summary: {
      status: "passed",
      sourceAllTargetCount: allTargets.length,
      selectedTargetCount: selectedTargets.length,
      selectedCountryCount: unique(selectedTargets.map((target) => target.countryCode)).length,
      routeCandidateCount: routeCandidates.length,
      routeCandidateCountBySource: countBy(routeCandidates, "routeSource"),
      fetched2xxRouteCandidateCount: resultRows.filter((row) => row.httpStatus >= 200 && row.httpStatus < 300).length,
      strongRouteCandidateCount: strongRows.length,
      weakRouteCandidateCount: weakRows.length,
      bestRouteCompetitionCount: bestRouteRows.length,
      bestRouteStrongCompetitionCount: strongBestRows.length,
      bestRouteWeakCompetitionCount: weakBestRows.length,
      bestRouteRowsByStatus,
      resultRowsByStatus,
      fetchExecutedNowCount: resultRows.length,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      mayBuildHighVolumeParserExtractionBoardCount: strongBestRows.length + weakBestRows.length > 0 ? 1 : 0,
      mayBuildHighVolumeRouteRepairPlanCount: bestRouteRows.some((row) => row.nextAllowedAction?.mayBuildRouteRepairPlan) ? 1 : 0,
      mayBuildCanonicalCandidateNowCount: 0,
      preflightBlockedCount
    }
  };

  writeJson(outputPath, output);

  console.log(JSON.stringify({
    output: output.output,
    status: output.summary.status,
    sourceAllTargetCount: output.summary.sourceAllTargetCount,
    selectedTargetCount: output.summary.selectedTargetCount,
    selectedCountryCount: output.summary.selectedCountryCount,
    routeCandidateCount: output.summary.routeCandidateCount,
    fetched2xxRouteCandidateCount: output.summary.fetched2xxRouteCandidateCount,
    strongRouteCandidateCount: output.summary.strongRouteCandidateCount,
    weakRouteCandidateCount: output.summary.weakRouteCandidateCount,
    bestRouteCompetitionCount: output.summary.bestRouteCompetitionCount,
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
    mayBuildHighVolumeParserExtractionBoardCount: output.summary.mayBuildHighVolumeParserExtractionBoardCount,
    mayBuildHighVolumeRouteRepairPlanCount: output.summary.mayBuildHighVolumeRouteRepairPlanCount,
    mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
    preflightBlockedCount: output.summary.preflightBlockedCount
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
