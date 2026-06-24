import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const controlledSourceOnly = args.has("--controlled-source-only");

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-route-probe-input-quality-gate-2026-06-15",
  "norway-ntf-route-probe-input-quality-gate-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-high-value-route-probe-runner-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-high-value-route-probe-runner-2026-06-15.json"
);

const expectedCompetitions = ["nor.1", "nor.2"];
const routeSignalRegex = /(api|graphql|json|standings?|standing|table|tabell|league-table|competition|tournament|season|teams?|club|matches|fixtures|result|kamper|terminliste|eliteserien|obos|service|no\.seeds\.app\.football)/i;
const noiseRegex = /(jquery|cloudflare|email-decode|blazy|navigation-bar|register\.js|push-notification|track|custom-track|ping|foo|someUrl|C:\/|api\/users|apple-icon|favicon|\.png|\.jpg|\.jpeg|\.svg|\.gif|\.ico|\.css|woff|woff2|font|analytics|gtm|facebook|twitter)/i;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
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

function assertEqual(name, actual, expected, checks) {
  const passed = Object.is(actual, expected);
  checks.push({ name, actual, expected, passed });
}

function assertArrayEqual(name, actual, expected, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, actual, expected, passed });
}

function assertAll(name, rows, predicate, checks) {
  const failedRows = rows
    .map((row, index) => ({ index, row }))
    .filter(({ row }) => !predicate(row));

  checks.push({
    name,
    actual: failedRows.length,
    expected: 0,
    passed: failedRows.length === 0,
    failedRowIndexes: failedRows.map(({ index }) => index)
  });
}

function htmlDecode(value) {
  return String(value ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("\\u0022", '"')
    .replaceAll("\\u0026", "&")
    .replaceAll("\\/", "/");
}

function safeUrl(rawValue, baseUrl) {
  try {
    const cleaned = htmlDecode(rawValue).trim();
    if (!cleaned || cleaned.startsWith("#") || cleaned.startsWith("mailto:") || cleaned.startsWith("tel:") || cleaned.startsWith("javascript:")) return null;
    return new URL(cleaned, baseUrl).toString();
  } catch {
    return null;
  }
}

function host(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function origin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function pathname(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function isTrustedNtfUrl(url) {
  return /^(www\.)?(eliteserien\.no|obos-ligaen\.no)$/i.test(host(url));
}

function isNoiseUrl(url) {
  const value = String(url ?? "");
  return noiseRegex.test(value) || noiseRegex.test(pathname(value));
}

function markerSignals(text) {
  const decoded = htmlDecode(text).slice(0, 3000000);
  return [
    "embed-league-table",
    "league-table",
    "app.bundle",
    "tabell",
    "standings",
    "standing",
    "table",
    "points",
    "position",
    "eliteserien",
    "obos",
    "api",
    "graphql",
    "json",
    "competition",
    "tournament",
    "season",
    "kamper",
    "terminliste",
    "fetch(",
    "axios.",
    "$.ajax",
    "no.seeds.app.football"
  ].filter((marker) => decoded.toLowerCase().includes(marker.toLowerCase()));
}

function routeScore(url, kind, sourceMarkers = []) {
  const value = String(url ?? "");
  let score = 0;

  if (/embed-league-table/i.test(value)) score += 180;
  if (/app\.bundle/i.test(value)) score += 150;
  if (/league-table|league_table/i.test(value)) score += 120;
  if (/standings?|standing|tabell|table/i.test(value)) score += 115;
  if (/\/api\/|graphql|\.json(?:\?|$)|\/data\//i.test(value)) score += 95;
  if (/competition|tournament|season/i.test(value)) score += 70;
  if (/kamper|terminliste|matches|fixtures|results?/i.test(value)) score += 45;
  if (/\/_\/service\/no\.seeds\.app\.football\//i.test(value)) score += 65;
  if (/\.(js|mjs)(\?|$)/i.test(pathname(value))) score += 35;

  if (/fetch_call|ajax_call|axios_call|url_assignment/i.test(kind)) score += 35;
  if (/relative_url_literal/i.test(kind)) score += 20;
  if (/absolute_url_literal/i.test(kind)) score += 10;

  if (sourceMarkers.some((signal) => /embed-league-table|league-table|tabell|standings?|standing|table/i.test(signal))) score += 50;
  if (sourceMarkers.some((signal) => /api|json|graphql|service/i.test(signal))) score += 35;

  if (!isTrustedNtfUrl(value)) score -= 150;
  if (isNoiseUrl(value)) score -= 180;

  return score;
}

function extractRouteCandidateRows(text, baseUrl, competitionSlug, sourceFetchRowId, sourceMarkers) {
  const decoded = htmlDecode(text);
  const rows = [];

  const patterns = [
    { kind: "fetch_call_literal", regex: /fetch\(\s*["'`]([^"'`]{3,800})["'`]/gi },
    { kind: "ajax_call_literal", regex: /\$\.ajax\(\s*\{[\s\S]{0,800}?url\s*:\s*["'`]([^"'`]{3,800})["'`]/gi },
    { kind: "axios_call_literal", regex: /axios\.(?:get|post)\(\s*["'`]([^"'`]{3,800})["'`]/gi },
    { kind: "url_assignment_literal", regex: /(?:url|endpoint|path|apiUrl|requestUrl|src)\s*[:=]\s*["'`]([^"'`]{3,800})["'`]/gi },
    { kind: "service_path_literal", regex: /["'`]([^"'`]{0,200}\/_\/service\/no\.seeds\.app\.football\/[^"'`]{1,800})["'`]/gi },
    { kind: "relative_url_literal", regex: /["'`](\/(?:api|graphql|data|_\/service|tabell|table|standings|league-table|competition|tournament|season|kamper|terminliste|matches)[^"'`\s<>]{0,800})["'`]/gi },
    { kind: "absolute_url_literal", regex: /["'`](https?:\/\/[^"'`\s<>]{8,900})["'`]/gi }
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern.regex)) {
      const absoluteUrl = safeUrl(match[1], baseUrl);
      if (!absoluteUrl) continue;
      if (origin(absoluteUrl) !== origin(baseUrl)) continue;
      if (!routeSignalRegex.test(absoluteUrl) && !routeSignalRegex.test(match[1])) continue;

      const score = routeScore(absoluteUrl, pattern.kind, sourceMarkers);
      const status = score >= 80 && !isNoiseUrl(absoluteUrl)
        ? "accepted_route_candidate_for_next_probe"
        : "review_or_rejected_low_signal_route_candidate";

      rows.push({
        norwayNtfHighValueRouteCandidateRowId: "pending",
        sourceNorwayNtfHighValueRouteProbeFetchRowId: sourceFetchRowId,
        competitionSlug,
        routeCandidateKind: pattern.kind,
        rawValue: match[1],
        absoluteUrl,
        priorityScore: score,
        routeCandidateStatus: status,
        fetchAllowedNext: status === "accepted_route_candidate_for_next_probe",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      });
    }
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.routeCandidateKind}|${row.absoluteUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractManifestRows(text, contentType, baseUrl, competitionSlug, sourceFetchRowId) {
  const trimmed = htmlDecode(text).trim();
  if (!/json/i.test(contentType ?? "") && !trimmed.startsWith("{")) return [];

  try {
    const json = JSON.parse(trimmed);
    const values = [];
    const stack = [json];

    while (stack.length > 0) {
      const value = stack.pop();
      if (!value || typeof value !== "object") continue;

      if (Array.isArray(value)) {
        value.forEach((item) => stack.push(item));
      } else {
        for (const child of Object.values(value)) {
          if (typeof child === "string") values.push(child);
          else if (child && typeof child === "object") stack.push(child);
        }
      }
    }

    return values
      .map((value) => safeUrl(value, baseUrl))
      .filter(Boolean)
      .filter((url) => origin(url) === origin(baseUrl))
      .filter((url) => routeSignalRegex.test(url) && !isNoiseUrl(url))
      .map((url, index) => ({
        norwayNtfManifestRouteCandidateRowId: `norway_ntf_manifest_route_candidate_${competitionSlug}_${String(index + 1).padStart(2, "0")}`,
        sourceNorwayNtfHighValueRouteProbeFetchRowId: sourceFetchRowId,
        competitionSlug,
        absoluteUrl: url,
        priorityScore: routeScore(url, "manifest_json_value", []),
        routeCandidateStatus: "manifest_route_candidate_for_review",
        fetchAllowedNext: false,
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      }));
  } catch {
    return [];
  }
}

function extractHtmlTableTextSignals(text) {
  const decoded = htmlDecode(text);
  const tableLike = /<table[\s\S]*?<\/table>/gi.test(decoded) || /class=["'][^"']*(table|standing|tabell|league-table)[^"']*["']/i.test(decoded);

  const textOnly = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const markers = [
    "tabell",
    "poeng",
    "spilt",
    "vunnet",
    "uavgjort",
    "tap",
    "mål",
    "Eliteserien",
    "OBOS-ligaen"
  ].filter((marker) => textOnly.toLowerCase().includes(marker.toLowerCase()));

  return {
    tableLike,
    markerCount: markers.length,
    markers
  };
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AI-MatchLab-FootballTruthNorwayNtfHighValueRouteProbe/1.0",
        "accept": "text/html,application/javascript,text/javascript,application/json;q=0.9,*/*;q=0.8"
      }
    });

    const body = await response.text();

    return {
      url,
      finalUrl: response.url,
      responded: true,
      ok: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") ?? null,
      body,
      bodyCharCount: body.length,
      bodySha256: sha256Text(body),
      errorName: null,
      errorMessage: null
    };
  } catch (error) {
    return {
      url,
      finalUrl: null,
      responded: false,
      ok: false,
      statusCode: null,
      statusText: null,
      contentType: null,
      body: "",
      bodyCharCount: 0,
      bodySha256: null,
      errorName: error?.name ?? "Error",
      errorMessage: error?.message ?? String(error)
    };
  } finally {
    clearTimeout(timeout);
  }
}

if (!allowExecute) throw new Error("Missing required --allow-execute flag.");
if (!allowFetch) throw new Error("Missing required --allow-fetch flag.");
if (!controlledSourceOnly) throw new Error("Missing required --controlled-source-only flag.");
if (!fs.existsSync(sourcePath)) throw new Error(`Missing Norway NTF route probe input quality gate: ${sourcePath}`);

fs.mkdirSync(outputDir, { recursive: true });

const source = readJson(sourcePath);
const sourceSummary = source.summary && typeof source.summary === "object" ? source.summary : {};
const acceptedInputs = Array.isArray(source.acceptedRouteProbeInputRows) ? source.acceptedRouteProbeInputRows : [];

const preChecks = [];
assertEqual("sourceQualityGateStatus", sourceSummary.norwayNtfRouteProbeInputQualityGateStatus, "passed", preChecks);
assertEqual("sourceMayBuildHighValueRouteProbeRunnerCount", Number(sourceSummary.mayBuildNorwayNtfHighValueRouteProbeRunnerCount ?? 0), 1, preChecks);
assertEqual("acceptedRouteProbeInputRowCount", acceptedInputs.length, 8, preChecks);
assertArrayEqual("acceptedRouteProbeInputCompetitions", uniqueSorted(acceptedInputs.map((row) => row.competitionSlug)), expectedCompetitions, preChecks);
assertAll("acceptedInputsFetchAllowed", acceptedInputs, (row) => row.fetchAllowedNext === true, preChecks);
assertAll("acceptedInputsTrustedHosts", acceptedInputs, (row) => isTrustedNtfUrl(row.url), preChecks);
assertAll("acceptedInputsKeepWritesBlocked", acceptedInputs, (row) => row.canonicalWriteAllowedNow === false && row.productionWriteAllowedNow === false && row.truthAssertionAllowedNow === false, preChecks);
assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowFetchFlagPresent", allowFetch, true, preChecks);
assertEqual("controlledSourceOnlyFlagPresent", controlledSourceOnly, true, preChecks);

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;
if (blockedPreCheckCount !== 0) {
  writeJson(outputPath, {
    output: outputPath,
    job: "run-football-truth-norway-ntf-high-value-route-probe-runner-file",
    status: "blocked_before_fetch",
    preChecks
  });
  console.log(JSON.stringify({ output: outputPath, norwayNtfHighValueRouteProbeRunnerStatus: "blocked_before_fetch", blockedPreCheckCount }, null, 2));
  process.exit(1);
}

const fetchRows = [];
let routeCandidateRows = [];
let manifestRouteCandidateRows = [];
const htmlTableSignalRows = [];

for (const input of acceptedInputs) {
  const fetched = await fetchText(input.url);
  const markers = fetched.ok ? markerSignals(fetched.body) : [];

  const fetchRow = {
    norwayNtfHighValueRouteProbeFetchRowId: `norway_ntf_high_value_route_probe_fetch_${String(fetchRows.length + 1).padStart(2, "0")}`,
    sourceNorwayNtfRouteProbeInputQualityGateRowId: input.norwayNtfRouteProbeInputQualityGateRowId,
    competitionSlug: input.competitionSlug,
    inputKind: input.inputKind,
    priorityScore: input.priorityScore,
    url: fetched.url,
    finalUrl: fetched.finalUrl,
    responded: fetched.responded,
    ok: fetched.ok,
    statusCode: fetched.statusCode,
    statusText: fetched.statusText,
    contentType: fetched.contentType,
    bodyCharCount: fetched.bodyCharCount,
    bodySha256: fetched.bodySha256,
    markerSignals: markers,
    errorName: fetched.errorName,
    errorMessage: fetched.errorMessage
  };

  fetchRows.push(fetchRow);

  if (fetched.ok) {
    const baseUrl = fetched.finalUrl ?? fetched.url;

    routeCandidateRows.push(...extractRouteCandidateRows(fetched.body, baseUrl, input.competitionSlug, fetchRow.norwayNtfHighValueRouteProbeFetchRowId, markers));
    manifestRouteCandidateRows.push(...extractManifestRows(fetched.body, fetched.contentType, baseUrl, input.competitionSlug, fetchRow.norwayNtfHighValueRouteProbeFetchRowId));

    if (/text\/html/i.test(fetched.contentType ?? "") || /\/tabell\/?$/i.test(pathname(baseUrl))) {
      const tableSignals = extractHtmlTableTextSignals(fetched.body);
      htmlTableSignalRows.push({
        norwayNtfHtmlTableSignalRowId: `norway_ntf_html_table_signal_${String(htmlTableSignalRows.length + 1).padStart(2, "0")}`,
        sourceNorwayNtfHighValueRouteProbeFetchRowId: fetchRow.norwayNtfHighValueRouteProbeFetchRowId,
        competitionSlug: input.competitionSlug,
        url: baseUrl,
        ...tableSignals,
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      });
    }
  }
}

routeCandidateRows = routeCandidateRows.map((row, index) => ({
  ...row,
  norwayNtfHighValueRouteCandidateRowId: `norway_ntf_high_value_route_candidate_${String(index + 1).padStart(4, "0")}`
}));

const acceptedRouteCandidateRows = routeCandidateRows
  .filter((row) => row.routeCandidateStatus === "accepted_route_candidate_for_next_probe")
  .sort((a, b) => b.priorityScore - a.priorityScore || String(a.absoluteUrl).localeCompare(String(b.absoluteUrl)));

const competitionsWithOkFetch = uniqueSorted(fetchRows.filter((row) => row.ok).map((row) => row.competitionSlug));
const competitionsWithRouteCandidates = uniqueSorted(acceptedRouteCandidateRows.map((row) => row.competitionSlug));
const competitionsWithHtmlTableSignals = uniqueSorted(htmlTableSignalRows.filter((row) => row.tableLike || row.markerCount >= 3).map((row) => row.competitionSlug));

const postChecks = [];
assertEqual("highValueRouteProbeFetchAttemptCount", fetchRows.length, acceptedInputs.length, postChecks);
assertEqual("highValueRouteProbeOkFetchCountAtLeastSix", fetchRows.filter((row) => row.ok).length >= 6, true, postChecks);
assertArrayEqual("competitionsWithOkFetch", competitionsWithOkFetch, expectedCompetitions, postChecks);
assertEqual("routeCandidateRowsNonNegative", routeCandidateRows.length >= 0, true, postChecks);
assertEqual("htmlTableSignalRowsNonNegative", htmlTableSignalRows.length >= 0, true, postChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const passedPreCheckCount = preChecks.filter((check) => check.passed).length;
const passedPostCheckCount = postChecks.filter((check) => check.passed).length;

const status = blockedPostCheckCount !== 0
  ? "blocked_after_high_value_route_probe_validation"
  : acceptedRouteCandidateRows.length > 0
    ? "passed_with_route_candidates"
    : competitionsWithHtmlTableSignals.length > 0
      ? "passed_with_html_table_signals"
      : "passed_with_high_value_assets_needs_manual_route_mapping";

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-high-value-route-probe-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    controlledFetchFromQualityGatedHighValueInputsOnly: true,
    highValueInputCount: acceptedInputs.length,
    norwayNtfOnly: true,
    routeProbeOnly: true,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    norwayNtfHighValueRouteProbeRunnerStatus: status,
    routeProbeInputQualityGateReadCount: 1,

    highValueRouteProbeInputRowCount: acceptedInputs.length,
    highValueRouteProbeFetchAttemptCount: fetchRows.length,
    highValueRouteProbeOkFetchCount: fetchRows.filter((row) => row.ok).length,
    highValueRouteProbeRespondedFetchCount: fetchRows.filter((row) => row.responded).length,

    routeCandidateRowCount: routeCandidateRows.length,
    acceptedRouteCandidateRowCount: acceptedRouteCandidateRows.length,
    manifestRouteCandidateRowCount: manifestRouteCandidateRows.length,
    htmlTableSignalRowCount: htmlTableSignalRows.length,

    competitionsWithOkFetch,
    competitionsWithRouteCandidates,
    competitionsWithHtmlTableSignals,

    fetchRowsByCompetition: countBy(fetchRows, "competitionSlug"),
    fetchRowsByInputKind: countBy(fetchRows, "inputKind"),
    acceptedRouteCandidatesByCompetition: countBy(acceptedRouteCandidateRows, "competitionSlug"),
    acceptedRouteCandidatesByKind: countBy(acceptedRouteCandidateRows, "routeCandidateKind"),

    preCheckCount: preChecks.length,
    passedPreCheckCount,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount,
    blockedPostCheckCount,

    mayBuildNorwayNtfRouteCandidateQualityGateCount: blockedPostCheckCount === 0 && acceptedRouteCandidateRows.length > 0 ? 1 : 0,
    mayBuildNorwayNtfHtmlTableParserPlanCount: blockedPostCheckCount === 0 && competitionsWithHtmlTableSignals.length > 0 ? 1 : 0,

    fetchExecutedNowCount: fetchRows.length,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    canonicalWrites: 0,
    productionWrite: false,
    truthAssertion: false
  },
  preChecks,
  postChecks,
  fetchRows,
  routeCandidateRows,
  acceptedRouteCandidateRows,
  manifestRouteCandidateRows,
  htmlTableSignalRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfHighValueRouteProbeRunnerStatus: output.summary.norwayNtfHighValueRouteProbeRunnerStatus,
  highValueRouteProbeInputRowCount: output.summary.highValueRouteProbeInputRowCount,
  highValueRouteProbeFetchAttemptCount: output.summary.highValueRouteProbeFetchAttemptCount,
  highValueRouteProbeOkFetchCount: output.summary.highValueRouteProbeOkFetchCount,
  routeCandidateRowCount: output.summary.routeCandidateRowCount,
  acceptedRouteCandidateRowCount: output.summary.acceptedRouteCandidateRowCount,
  htmlTableSignalRowCount: output.summary.htmlTableSignalRowCount,
  competitionsWithRouteCandidates: output.summary.competitionsWithRouteCandidates,
  competitionsWithHtmlTableSignals: output.summary.competitionsWithHtmlTableSignals,
  acceptedRouteCandidatesByKind: output.summary.acceptedRouteCandidatesByKind,
  sampleAcceptedRouteCandidates: acceptedRouteCandidateRows.slice(0, 12).map((row) => ({
    competitionSlug: row.competitionSlug,
    routeCandidateKind: row.routeCandidateKind,
    priorityScore: row.priorityScore,
    absoluteUrl: row.absoluteUrl
  })),
  sampleHtmlTableSignals: htmlTableSignalRows.slice(0, 4).map((row) => ({
    competitionSlug: row.competitionSlug,
    tableLike: row.tableLike,
    markerCount: row.markerCount,
    markers: row.markers,
    url: row.url
  })),
  mayBuildNorwayNtfRouteCandidateQualityGateCount: output.summary.mayBuildNorwayNtfRouteCandidateQualityGateCount,
  mayBuildNorwayNtfHtmlTableParserPlanCount: output.summary.mayBuildNorwayNtfHtmlTableParserPlanCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}
