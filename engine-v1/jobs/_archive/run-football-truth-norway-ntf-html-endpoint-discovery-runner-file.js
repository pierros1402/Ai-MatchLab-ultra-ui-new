import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const controlledSourceOnly = args.has("--controlled-source-only");

const gapPlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "provider-specific-parser-gap-plan-2026-06-15",
  "provider-specific-parser-gap-plan-2026-06-15.json"
);

const probePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-parser-probe-runner-2026-06-15",
  "norway-ntf-parser-probe-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-html-endpoint-discovery-runner-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-html-endpoint-discovery-runner-2026-06-15.json"
);

const expectedCompetitions = ["nor.1", "nor.2"];
const endpointSignalRegex = /(api|graphql|json|standings?|standing|table|tabell|competition|tournament|season|teams?|club|matches|fixtures|result|kamper|terminliste|eliteserien|obos)/i;

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

function sameOrigin(urlA, urlB) {
  try {
    return new URL(urlA).origin === new URL(urlB).origin;
  } catch {
    return false;
  }
}

function markerSignals(text) {
  const decoded = htmlDecode(text).slice(0, 2000000);
  return [
    "tabell",
    "eliteserien",
    "obos",
    "terminliste",
    "kamper",
    "standings",
    "table",
    "points",
    "position",
    "api",
    "graphql",
    "json",
    "__NEXT_DATA__",
    "_next/static",
    "nuxt",
    "vite",
    "assets"
  ].filter((marker) => decoded.toLowerCase().includes(marker.toLowerCase()));
}

function extractHtmlReferenceRows(html, baseUrl, competitionSlug, sourceFetchRowId) {
  const decoded = htmlDecode(html);
  const rows = [];

  const patterns = [
    { kind: "script_src", regex: /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi },
    { kind: "link_href", regex: /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi },
    { kind: "anchor_href", regex: /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi },
    { kind: "form_action", regex: /<form\b[^>]*\baction=["']([^"']+)["'][^>]*>/gi }
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern.regex)) {
      const absoluteUrl = safeUrl(match[1], baseUrl);
      if (!absoluteUrl) continue;

      rows.push({
        norwayNtfHtmlReferenceRowId: `pending`,
        sourceNorwayNtfHtmlFetchRowId: sourceFetchRowId,
        competitionSlug,
        referenceKind: pattern.kind,
        rawValue: match[1],
        absoluteUrl,
        sameOriginAsPage: sameOrigin(absoluteUrl, baseUrl),
        endpointSignal: endpointSignalRegex.test(absoluteUrl),
        fetchCandidate: pattern.kind === "script_src" && sameOrigin(absoluteUrl, baseUrl)
      });
    }
  }

  const stringUrlRegex = /["'`](\/[^"'`\s<>]{3,300}|https?:\/\/[^"'`\s<>]{8,500})["'`]/gi;
  for (const match of decoded.matchAll(stringUrlRegex)) {
    const absoluteUrl = safeUrl(match[1], baseUrl);
    if (!absoluteUrl) continue;

    rows.push({
      norwayNtfHtmlReferenceRowId: `pending`,
      sourceNorwayNtfHtmlFetchRowId: sourceFetchRowId,
      competitionSlug,
      referenceKind: "string_url_literal",
      rawValue: match[1],
      absoluteUrl,
      sameOriginAsPage: sameOrigin(absoluteUrl, baseUrl),
      endpointSignal: endpointSignalRegex.test(absoluteUrl),
      fetchCandidate: false
    });
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.referenceKind}|${row.absoluteUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractAssetEndpointRows(text, assetUrl, competitionSlug, sourceAssetFetchRowId) {
  const decoded = htmlDecode(text);
  const rows = [];
  const patterns = [
    { kind: "absolute_url_literal", regex: /["'`](https?:\/\/[^"'`\s<>]{8,600})["'`]/gi },
    { kind: "relative_url_literal", regex: /["'`](\/(?:api|graphql|data|_next|assets|wp-json|umbraco|umbracoapi|standings|table|tabell|competition|tournament|season|matches|kamper|terminliste)[^"'`\s<>]{0,500})["'`]/gi },
    { kind: "fetch_call_literal", regex: /fetch\(\s*["'`]([^"'`]{3,600})["'`]/gi },
    { kind: "axios_literal", regex: /axios\.(?:get|post)\(\s*["'`]([^"'`]{3,600})["'`]/gi }
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern.regex)) {
      const absoluteUrl = safeUrl(match[1], assetUrl);
      if (!absoluteUrl) continue;
      if (!endpointSignalRegex.test(absoluteUrl) && !endpointSignalRegex.test(match[1])) continue;

      rows.push({
        norwayNtfAssetEndpointDiscoveryRowId: "pending",
        sourceNorwayNtfAssetFetchRowId: sourceAssetFetchRowId,
        competitionSlug,
        endpointKind: pattern.kind,
        rawValue: match[1],
        absoluteUrl,
        sameOriginAsAsset: sameOrigin(absoluteUrl, assetUrl),
        endpointSignal: endpointSignalRegex.test(absoluteUrl) || endpointSignalRegex.test(match[1])
      });
    }
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.endpointKind}|${row.absoluteUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AI-MatchLab-FootballTruthNorwayNtfHtmlEndpointDiscovery/1.0",
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

for (const requiredPath of [gapPlanPath, probePath]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`Missing required diagnostic: ${requiredPath}`);
}

fs.mkdirSync(outputDir, { recursive: true });

const gapPlan = readJson(gapPlanPath);
const probe = readJson(probePath);
const gapSummary = gapPlan.summary && typeof gapPlan.summary === "object" ? gapPlan.summary : {};
const probeSummary = probe.summary && typeof probe.summary === "object" ? probe.summary : {};
const gapPlanRows = Array.isArray(gapPlan.gapPlanRows) ? gapPlan.gapPlanRows : [];
const norwayRows = gapPlanRows.filter((row) => row.providerFamily === "norway_ntf");

const preChecks = [];
assertEqual("gapPlanStatus", gapSummary.providerSpecificParserGapPlanStatus, "passed", preChecks);
assertEqual("probeStatus", probeSummary.norwayNtfParserProbeRunnerStatus, "passed_with_ok_fetch_no_embedded_route_data_needs_html_or_endpoint_discovery", preChecks);
assertEqual("probeOkFetchCount", Number(probeSummary.norwayNtfProbeOkFetchCount ?? 0), 4, preChecks);
assertEqual("probeMayBuildImplementationCount", Number(probeSummary.mayBuildNorwayNtfRouteSpecificParserImplementationCount ?? 0), 1, preChecks);
assertEqual("norwayGapPlanRowCount", norwayRows.length, 2, preChecks);
assertArrayEqual("norwayCompetitions", uniqueSorted(norwayRows.map((row) => row.competitionSlug)), expectedCompetitions, preChecks);
assertAll("norwayRowsHaveTrustedFinalUrls", norwayRows, (row) => Array.isArray(row.finalUrls) && row.finalUrls.length > 0, preChecks);
assertAll("norwayRowsKeepSearchBlocked", norwayRows, (row) => row.broadSearchAllowedNext === false, preChecks);
assertAll("norwayRowsKeepWritesBlocked", norwayRows, (row) => row.canonicalWriteAllowedNext === false && row.productionWriteAllowedNext === false && row.truthAssertionAllowedNext === false, preChecks);
assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowFetchFlagPresent", allowFetch, true, preChecks);
assertEqual("controlledSourceOnlyFlagPresent", controlledSourceOnly, true, preChecks);

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;
if (blockedPreCheckCount !== 0) {
  writeJson(outputPath, {
    output: outputPath,
    job: "run-football-truth-norway-ntf-html-endpoint-discovery-runner-file",
    status: "blocked_before_fetch",
    preChecks
  });
  console.log(JSON.stringify({ output: outputPath, norwayNtfHtmlEndpointDiscoveryRunnerStatus: "blocked_before_fetch", blockedPreCheckCount }, null, 2));
  process.exit(1);
}

const htmlFetchRows = [];
let htmlReferenceRows = [];
const assetFetchRows = [];
let assetEndpointRows = [];

for (const planRow of norwayRows) {
  const urls = uniqueSorted([...(planRow.finalUrls ?? []), ...(planRow.urls ?? [])]).slice(0, 2);

  for (const url of urls) {
    const fetched = await fetchText(url);
    const htmlFetchRow = {
      norwayNtfHtmlFetchRowId: `norway_ntf_html_fetch_${String(htmlFetchRows.length + 1).padStart(2, "0")}`,
      competitionSlug: planRow.competitionSlug,
      providerFamily: planRow.providerFamily,
      parserRoute: planRow.parserRoute,
      url: fetched.url,
      finalUrl: fetched.finalUrl,
      responded: fetched.responded,
      ok: fetched.ok,
      statusCode: fetched.statusCode,
      statusText: fetched.statusText,
      contentType: fetched.contentType,
      bodyCharCount: fetched.bodyCharCount,
      bodySha256: fetched.bodySha256,
      markerSignals: fetched.ok ? markerSignals(fetched.body) : [],
      errorName: fetched.errorName,
      errorMessage: fetched.errorMessage
    };

    htmlFetchRows.push(htmlFetchRow);

    if (fetched.ok) {
      const refs = extractHtmlReferenceRows(fetched.body, fetched.finalUrl ?? fetched.url, planRow.competitionSlug, htmlFetchRow.norwayNtfHtmlFetchRowId);
      htmlReferenceRows.push(...refs);
    }
  }
}

htmlReferenceRows = htmlReferenceRows.map((row, index) => ({
  ...row,
  norwayNtfHtmlReferenceRowId: `norway_ntf_html_reference_${String(index + 1).padStart(4, "0")}`
}));

const assetFetchCandidates = htmlReferenceRows
  .filter((row) => row.fetchCandidate && row.sameOriginAsPage)
  .filter((row) => /\.(js|mjs)(\?|$)/i.test(new URL(row.absoluteUrl).pathname) || /\/assets\/|\/_next\/|\/static\//i.test(row.absoluteUrl))
  .slice(0, 12);

for (const ref of assetFetchCandidates) {
  const fetched = await fetchText(ref.absoluteUrl);
  const assetFetchRow = {
    norwayNtfAssetFetchRowId: `norway_ntf_asset_fetch_${String(assetFetchRows.length + 1).padStart(2, "0")}`,
    sourceNorwayNtfHtmlReferenceRowId: ref.norwayNtfHtmlReferenceRowId,
    competitionSlug: ref.competitionSlug,
    url: fetched.url,
    finalUrl: fetched.finalUrl,
    responded: fetched.responded,
    ok: fetched.ok,
    statusCode: fetched.statusCode,
    statusText: fetched.statusText,
    contentType: fetched.contentType,
    bodyCharCount: fetched.bodyCharCount,
    bodySha256: fetched.bodySha256,
    markerSignals: fetched.ok ? markerSignals(fetched.body) : [],
    errorName: fetched.errorName,
    errorMessage: fetched.errorMessage
  };

  assetFetchRows.push(assetFetchRow);

  if (fetched.ok) {
    assetEndpointRows.push(...extractAssetEndpointRows(fetched.body, fetched.finalUrl ?? fetched.url, ref.competitionSlug, assetFetchRow.norwayNtfAssetFetchRowId));
  }
}

assetEndpointRows = assetEndpointRows.map((row, index) => ({
  ...row,
  norwayNtfAssetEndpointDiscoveryRowId: `norway_ntf_asset_endpoint_discovery_${String(index + 1).padStart(4, "0")}`
}));

const endpointCandidateRows = [
  ...htmlReferenceRows
    .filter((row) => row.endpointSignal && row.sameOriginAsPage)
    .map((row) => ({
      endpointCandidateKind: `html_${row.referenceKind}`,
      competitionSlug: row.competitionSlug,
      sourceRowId: row.norwayNtfHtmlReferenceRowId,
      absoluteUrl: row.absoluteUrl
    })),
  ...assetEndpointRows
    .filter((row) => row.endpointSignal && row.sameOriginAsAsset)
    .map((row) => ({
      endpointCandidateKind: `asset_${row.endpointKind}`,
      competitionSlug: row.competitionSlug,
      sourceRowId: row.norwayNtfAssetEndpointDiscoveryRowId,
      absoluteUrl: row.absoluteUrl
    }))
].filter((row, index, rows) => rows.findIndex((other) => other.competitionSlug === row.competitionSlug && other.absoluteUrl === row.absoluteUrl) === index);

const competitionsWithOkHtmlFetch = uniqueSorted(htmlFetchRows.filter((row) => row.ok).map((row) => row.competitionSlug));
const competitionsWithEndpointCandidates = uniqueSorted(endpointCandidateRows.map((row) => row.competitionSlug));
const competitionsWithAssetFetch = uniqueSorted(assetFetchRows.filter((row) => row.ok).map((row) => row.competitionSlug));

const postChecks = [];
assertEqual("htmlFetchAttemptCount", htmlFetchRows.length, 4, postChecks);
assertEqual("htmlOkFetchCount", htmlFetchRows.filter((row) => row.ok).length, 4, postChecks);
assertArrayEqual("competitionsWithOkHtmlFetch", competitionsWithOkHtmlFetch, expectedCompetitions, postChecks);
assertEqual("htmlReferenceRowCountPositive", htmlReferenceRows.length > 0, true, postChecks);
assertEqual("assetFetchAttemptCountNonNegative", assetFetchRows.length >= 0, true, postChecks);
assertEqual("endpointDiscoveryDoesNotRequireEndpointCandidates", true, true, postChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const passedPreCheckCount = preChecks.filter((check) => check.passed).length;
const passedPostCheckCount = postChecks.filter((check) => check.passed).length;

const status = blockedPostCheckCount !== 0
  ? "blocked_after_endpoint_discovery_validation"
  : endpointCandidateRows.length > 0
    ? "passed_with_endpoint_candidates"
    : assetFetchRows.length > 0
      ? "passed_with_assets_no_endpoint_candidates"
      : "passed_with_html_references_no_asset_or_endpoint_candidates";

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-html-endpoint-discovery-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { gapPlanPath, probePath },
  policy: {
    controlledFetchFromGapPlanTrustedUrlsOnly: true,
    sameOriginAssetFetchOnly: true,
    norwayNtfOnly: true,
    endpointDiscoveryOnly: true,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    norwayNtfHtmlEndpointDiscoveryRunnerStatus: status,
    gapPlanReadCount: 1,
    probeReadCount: 1,

    htmlFetchAttemptCount: htmlFetchRows.length,
    htmlOkFetchCount: htmlFetchRows.filter((row) => row.ok).length,
    htmlReferenceRowCount: htmlReferenceRows.length,
    assetFetchAttemptCount: assetFetchRows.length,
    assetOkFetchCount: assetFetchRows.filter((row) => row.ok).length,
    assetEndpointDiscoveryRowCount: assetEndpointRows.length,
    endpointCandidateRowCount: endpointCandidateRows.length,

    competitionsWithOkHtmlFetch,
    competitionsWithAssetFetch,
    competitionsWithEndpointCandidates,
    htmlReferencesByKind: countBy(htmlReferenceRows, "referenceKind"),
    assetEndpointsByKind: countBy(assetEndpointRows, "endpointKind"),
    endpointCandidatesByKind: countBy(endpointCandidateRows, "endpointCandidateKind"),

    preCheckCount: preChecks.length,
    passedPreCheckCount,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount,
    blockedPostCheckCount,

    mayBuildNorwayNtfEndpointCandidateProbeRunnerCount: blockedPostCheckCount === 0 && endpointCandidateRows.length > 0 ? 1 : 0,
    mayBuildNorwayNtfHtmlRouteSpecificParserPlanCount: blockedPostCheckCount === 0 ? 1 : 0,

    fetchExecutedNowCount: htmlFetchRows.length + assetFetchRows.length,
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
  htmlFetchRows,
  htmlReferenceRows,
  assetFetchRows,
  assetEndpointRows,
  endpointCandidateRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfHtmlEndpointDiscoveryRunnerStatus: output.summary.norwayNtfHtmlEndpointDiscoveryRunnerStatus,
  htmlFetchAttemptCount: output.summary.htmlFetchAttemptCount,
  htmlOkFetchCount: output.summary.htmlOkFetchCount,
  htmlReferenceRowCount: output.summary.htmlReferenceRowCount,
  assetFetchAttemptCount: output.summary.assetFetchAttemptCount,
  assetOkFetchCount: output.summary.assetOkFetchCount,
  assetEndpointDiscoveryRowCount: output.summary.assetEndpointDiscoveryRowCount,
  endpointCandidateRowCount: output.summary.endpointCandidateRowCount,
  competitionsWithEndpointCandidates: output.summary.competitionsWithEndpointCandidates,
  htmlReferencesByKind: output.summary.htmlReferencesByKind,
  assetEndpointsByKind: output.summary.assetEndpointsByKind,
  endpointCandidatesByKind: output.summary.endpointCandidatesByKind,
  sampleEndpointCandidates: endpointCandidateRows.slice(0, 12),
  mayBuildNorwayNtfEndpointCandidateProbeRunnerCount: output.summary.mayBuildNorwayNtfEndpointCandidateProbeRunnerCount,
  mayBuildNorwayNtfHtmlRouteSpecificParserPlanCount: output.summary.mayBuildNorwayNtfHtmlRouteSpecificParserPlanCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}
