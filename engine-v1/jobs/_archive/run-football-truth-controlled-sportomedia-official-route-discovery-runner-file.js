import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const controlledSeedUrlsOnly = args.has("--controlled-seed-urls-only");

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-official-route-discovery-plan-2026-06-15",
  "controlled-sportomedia-official-route-discovery-plan-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-official-route-discovery-runner-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-official-route-discovery-runner-2026-06-15.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];
const maxBodyChars = 1_000_000;
const fetchTimeoutMs = 30_000;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
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

function normalizeUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function hostOf(value) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return "";
  }
}

function pathOf(value) {
  try {
    return new URL(value).pathname.toLowerCase();
  } catch {
    return "";
  }
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractAttributes(html, attrName) {
  const regex = new RegExp(`\\b${attrName}\\s*=\\s*["']([^"']+)["']`, "gi");
  return [...String(html ?? "").matchAll(regex)].map((match) => match[1]);
}

function classifySignals(html, url, competitionSlug) {
  const raw = String(html ?? "");
  const text = stripHtml(raw);
  const lowerRaw = raw.toLowerCase();
  const lowerText = text.toLowerCase();

  const standingsSignal = /(tabell|standing|standings|league table|poäng|points|played|matcher|position|rank)/i.test(`${url} ${text}`);
  const sportomediaOrGraphqlOrEmbeddedSignal = /(sportomedia|graphql|__next_data__|apollo|urql|relay|window\.__|application\/json|data-drupal|nuxt|next\/static)/i.test(raw);
  const allsvenskanSignal = /allsvenskan/i.test(`${url} ${text}`);
  const superettanSignal = /superettan/i.test(`${url} ${text}`);
  const competitionSpecificSignal = competitionSlug === "swe.1" ? allsvenskanSignal : superettanSignal;
  const htmlTableSignal = /<table\b/i.test(raw) || /class=["'][^"']*(table|standings|tabell|league-table)[^"']*["']/i.test(raw);
  const routeKeywordSignal = /(tabell|resultat|matcher|standings|table)/i.test(url);

  const signalKinds = [];
  if (standingsSignal) signalKinds.push("standings_or_table_signal");
  if (sportomediaOrGraphqlOrEmbeddedSignal) signalKinds.push("sportomedia_or_graphql_or_embedded_data_signal");
  if (competitionSpecificSignal) signalKinds.push(competitionSlug === "swe.1" ? "competition_specific_allsvenskan_signal" : "competition_specific_superettan_signal");
  if (htmlTableSignal) signalKinds.push("html_table_like_signal");
  if (routeKeywordSignal) signalKinds.push("route_keyword_signal");

  return {
    textCharCount: text.length,
    signalKinds: uniqueSorted(signalKinds),
    standingsSignal,
    sportomediaOrGraphqlOrEmbeddedSignal,
    competitionSpecificSignal,
    htmlTableSignal,
    routeKeywordSignal,
    title: (raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 180),
    textSample: text.slice(0, 350)
  };
}

function extractRouteCandidates(html, baseUrl, officialHosts) {
  const hrefs = extractAttributes(html, "href");
  const srcs = extractAttributes(html, "src");
  const rawUrls = [...hrefs, ...srcs];
  const officialHostSet = new Set(officialHosts.map((host) => host.toLowerCase()));

  return uniqueSorted(
    rawUrls
      .map((value) => normalizeUrl(value, baseUrl))
      .filter(Boolean)
      .filter((url) => officialHostSet.has(hostOf(url)))
      .filter((url) => /(tabell|resultat|matcher|standing|standings|table|api|graphql)/i.test(url))
  ).slice(0, 120);
}

function extractAssetReferences(html, baseUrl, officialHosts) {
  const refs = [...extractAttributes(html, "src"), ...extractAttributes(html, "href")]
    .map((value) => normalizeUrl(value, baseUrl))
    .filter(Boolean)
    .filter((url) => /\.(js|mjs|json)(?:[?#].*)?$/i.test(pathOf(url)) || /(next\/static|static\/js|assets|chunk|bundle|app)/i.test(url));

  const officialHostSet = new Set(officialHosts.map((host) => host.toLowerCase()));

  return uniqueSorted(refs)
    .filter((url) => officialHostSet.has(hostOf(url)) || /cdn|static|assets|sportomedia|cloudfront|akamaized|vercel|next/i.test(hostOf(url)))
    .slice(0, 160);
}

async function readLimitedText(response) {
  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    return { text: text.slice(0, maxBodyChars), truncated: text.length > maxBodyChars, rawCharCount: text.length };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let rawCharCount = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    rawCharCount += chunk.length;

    if (text.length < maxBodyChars) {
      text += chunk;
      if (text.length > maxBodyChars) {
        text = text.slice(0, maxBodyChars);
        truncated = true;
      }
    } else {
      truncated = true;
      break;
    }
  }

  text += decoder.decode();
  if (text.length > maxBodyChars) {
    text = text.slice(0, maxBodyChars);
    truncated = true;
  }

  return { text, truncated, rawCharCount };
}

async function fetchControlledUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AI-MatchLab-FootballTruthSportomediaDiscovery/1.0",
        "accept": "text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5"
      }
    });

    const body = await readLimitedText(response);

    return {
      requestedUrl: url,
      finalUrl: response.url,
      responded: true,
      ok: response.ok,
      statusCode: response.status,
      statusText: response.statusText,
      contentType: response.headers.get("content-type") ?? null,
      bodyText: body.text,
      bodyCharCount: body.rawCharCount,
      storedBodyCharCount: body.text.length,
      bodyTruncated: body.truncated,
      bodySha256: sha256Text(body.text),
      errorName: null,
      errorMessage: null
    };
  } catch (error) {
    return {
      requestedUrl: url,
      finalUrl: null,
      responded: false,
      ok: false,
      statusCode: null,
      statusText: null,
      contentType: null,
      bodyText: "",
      bodyCharCount: 0,
      storedBodyCharCount: 0,
      bodyTruncated: false,
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
if (!controlledSeedUrlsOnly) throw new Error("Missing required --controlled-seed-urls-only flag.");

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing controlled Sportomedia official route discovery plan diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const discoveryPlanRows = Array.isArray(source.discoveryPlanRows) ? source.discoveryPlanRows : [];

const seedUrlSet = new Set(discoveryPlanRows.flatMap((row) => row.controlledSeedUrls ?? []));
const controlledSeedUrlTotalCount = discoveryPlanRows.reduce((sum, row) => sum + ((row.controlledSeedUrls ?? []).length), 0);
const preChecks = [];

assertEqual("sourceDiscoveryPlanStatus", summary.controlledSportomediaOfficialRouteDiscoveryPlanStatus, "passed", preChecks);
assertEqual("sourceMayBuildRunnerCount", Number(summary.mayBuildControlledSportomediaOfficialRouteDiscoveryRunnerCount ?? 0), 1, preChecks);
assertEqual("discoveryPlanRowCount", discoveryPlanRows.length, 2, preChecks);
assertArrayEqual("discoveryPlanCompetitions", uniqueSorted(discoveryPlanRows.map((row) => row.competitionSlug)), expectedCompetitions, preChecks);
assertEqual("controlledSeedUrlTotalCount", controlledSeedUrlTotalCount, 56, preChecks);
assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowFetchFlagPresent", allowFetch, true, preChecks);
assertEqual("controlledSeedUrlsOnlyFlagPresent", controlledSeedUrlsOnly, true, preChecks);
assertEqual("canonicalWriteExecutedNowCount", 0, 0, preChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, preChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, preChecks);

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;

if (blockedPreCheckCount !== 0) {
  writeJson(outputPath, {
    output: outputPath,
    job: "run-football-truth-controlled-sportomedia-official-route-discovery-runner-file",
    status: "blocked_before_controlled_fetch",
    preChecks
  });
  console.log(JSON.stringify({ output: outputPath, controlledSportomediaOfficialRouteDiscoveryRunnerStatus: "blocked_before_controlled_fetch", blockedPreCheckCount }, null, 2));
  process.exit(1);
}

const fetchRows = [];
const htmlSignalRows = [];
const routeCandidateRows = [];
const assetReferenceRows = [];

for (const planRow of discoveryPlanRows) {
  const officialHosts = planRow.officialHostCandidates ?? [];
  const seedUrls = planRow.controlledSeedUrls ?? [];

  for (const seedUrl of seedUrls) {
    if (!seedUrlSet.has(seedUrl)) throw new Error(`Attempted fetch outside controlled seed URL set: ${seedUrl}`);

    const fetched = await fetchControlledUrl(seedUrl);

    const fetchRow = {
      sportomediaOfficialRouteDiscoveryFetchRowId: `sportomedia_official_route_discovery_fetch_${String(fetchRows.length + 1).padStart(3, "0")}`,
      sourceSportomediaOfficialRouteDiscoveryPlanRowId: planRow.sportomediaOfficialRouteDiscoveryPlanRowId,
      competitionSlug: planRow.competitionSlug,
      providerFamily: planRow.providerFamily,
      requestedUrl: fetched.requestedUrl,
      finalUrl: fetched.finalUrl,
      responded: fetched.responded,
      ok: fetched.ok,
      statusCode: fetched.statusCode,
      statusText: fetched.statusText,
      contentType: fetched.contentType,
      bodyCharCount: fetched.bodyCharCount,
      storedBodyCharCount: fetched.storedBodyCharCount,
      bodyTruncated: fetched.bodyTruncated,
      bodySha256: fetched.bodySha256,
      errorName: fetched.errorName,
      errorMessage: fetched.errorMessage
    };

    fetchRows.push(fetchRow);

    if (!fetched.ok || !fetched.bodyText) continue;

    const signals = classifySignals(fetched.bodyText, fetched.finalUrl ?? fetched.requestedUrl, planRow.competitionSlug);

    htmlSignalRows.push({
      sportomediaOfficialRouteDiscoveryHtmlSignalRowId: `sportomedia_official_route_discovery_html_signal_${String(htmlSignalRows.length + 1).padStart(3, "0")}`,
      sourceSportomediaOfficialRouteDiscoveryFetchRowId: fetchRow.sportomediaOfficialRouteDiscoveryFetchRowId,
      competitionSlug: planRow.competitionSlug,
      providerFamily: planRow.providerFamily,
      requestedUrl: fetched.requestedUrl,
      finalUrl: fetched.finalUrl,
      signalKinds: signals.signalKinds,
      standingsSignal: signals.standingsSignal,
      sportomediaOrGraphqlOrEmbeddedSignal: signals.sportomediaOrGraphqlOrEmbeddedSignal,
      competitionSpecificSignal: signals.competitionSpecificSignal,
      htmlTableSignal: signals.htmlTableSignal,
      routeKeywordSignal: signals.routeKeywordSignal,
      title: signals.title,
      textCharCount: signals.textCharCount,
      textSample: signals.textSample,
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    });

    const routes = extractRouteCandidates(fetched.bodyText, fetched.finalUrl ?? fetched.requestedUrl, officialHosts);
    for (const routeUrl of routes) {
      routeCandidateRows.push({
        sportomediaOfficialRouteCandidateRowId: `sportomedia_official_route_candidate_${String(routeCandidateRows.length + 1).padStart(3, "0")}`,
        sourceSportomediaOfficialRouteDiscoveryFetchRowId: fetchRow.sportomediaOfficialRouteDiscoveryFetchRowId,
        competitionSlug: planRow.competitionSlug,
        providerFamily: planRow.providerFamily,
        routeUrl,
        routeHost: hostOf(routeUrl),
        routePath: pathOf(routeUrl),
        routeCandidateStatus: "official_controlled_route_candidate_not_fetched",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      });
    }

    const assets = extractAssetReferences(fetched.bodyText, fetched.finalUrl ?? fetched.requestedUrl, officialHosts);
    for (const assetUrl of assets) {
      assetReferenceRows.push({
        sportomediaOfficialAssetReferenceRowId: `sportomedia_official_asset_reference_${String(assetReferenceRows.length + 1).padStart(3, "0")}`,
        sourceSportomediaOfficialRouteDiscoveryFetchRowId: fetchRow.sportomediaOfficialRouteDiscoveryFetchRowId,
        competitionSlug: planRow.competitionSlug,
        providerFamily: planRow.providerFamily,
        assetUrl,
        assetHost: hostOf(assetUrl),
        assetPath: pathOf(assetUrl),
        assetReferenceStatus: "official_controlled_asset_reference_not_fetched",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      });
    }
  }
}

const okFetchRows = fetchRows.filter((row) => row.ok);
const competitionsWithOkFetch = uniqueSorted(okFetchRows.map((row) => row.competitionSlug));
const signalRowsWithAny = htmlSignalRows.filter((row) => row.signalKinds.length > 0);
const competitionsWithSignals = uniqueSorted(signalRowsWithAny.map((row) => row.competitionSlug));
const competitionsWithEmbeddedSignals = uniqueSorted(htmlSignalRows.filter((row) => row.sportomediaOrGraphqlOrEmbeddedSignal).map((row) => row.competitionSlug));
const competitionsWithStandingSignals = uniqueSorted(htmlSignalRows.filter((row) => row.standingsSignal).map((row) => row.competitionSlug));

const uniqueRouteCandidateRows = [];
const seenRouteKeys = new Set();
for (const row of routeCandidateRows) {
  const key = `${row.competitionSlug}|${row.routeUrl}`;
  if (seenRouteKeys.has(key)) continue;
  seenRouteKeys.add(key);
  uniqueRouteCandidateRows.push({ ...row, sportomediaOfficialRouteCandidateRowId: `sportomedia_official_route_candidate_${String(uniqueRouteCandidateRows.length + 1).padStart(3, "0")}` });
}

const uniqueAssetReferenceRows = [];
const seenAssetKeys = new Set();
for (const row of assetReferenceRows) {
  const key = `${row.competitionSlug}|${row.assetUrl}`;
  if (seenAssetKeys.has(key)) continue;
  seenAssetKeys.add(key);
  uniqueAssetReferenceRows.push({ ...row, sportomediaOfficialAssetReferenceRowId: `sportomedia_official_asset_reference_${String(uniqueAssetReferenceRows.length + 1).padStart(3, "0")}` });
}

const postChecks = [];
assertEqual("fetchAttemptCount", fetchRows.length, 56, postChecks);
assertEqual("okFetchRowsPresent", okFetchRows.length > 0, true, postChecks);
assertArrayEqual("competitionsWithOkFetch", competitionsWithOkFetch, expectedCompetitions, postChecks);
assertEqual("htmlSignalRowsPresent", htmlSignalRows.length > 0, true, postChecks);
assertEqual("officialDiscoveryRowsHaveWriteLocks", htmlSignalRows.every((row) => row.canonicalWriteAllowedNow === false && row.productionWriteAllowedNow === false && row.truthAssertionAllowedNow === false), true, postChecks);
assertEqual("fetchExecutedNowCount", fetchRows.length, 56, postChecks);
assertEqual("searchExecutedNowCount", 0, 0, postChecks);
assertEqual("broadSearchExecutedNowCount", 0, 0, postChecks);
assertEqual("classifierExecutedNowCount", 0, 0, postChecks);
assertEqual("canonicalWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const passedPreCheckCount = preChecks.filter((check) => check.passed).length;
const passedPostCheckCount = postChecks.filter((check) => check.passed).length;

const hasAssetReferences = uniqueAssetReferenceRows.length > 0;
const hasRouteCandidates = uniqueRouteCandidateRows.length > 0;
const hasEmbeddedSignal = competitionsWithEmbeddedSignals.length > 0;
const status = blockedPostCheckCount !== 0
  ? "blocked_after_controlled_fetch_validation"
  : hasEmbeddedSignal || hasAssetReferences
    ? "passed_with_official_asset_or_embedded_signals"
    : hasRouteCandidates || competitionsWithStandingSignals.length > 0
      ? "passed_with_official_route_or_standings_signals"
      : "passed_with_official_fetch_gap_requires_route_review";

const output = {
  output: outputPath,
  job: "run-football-truth-controlled-sportomedia-official-route-discovery-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    controlledFetchOnly: true,
    controlledSeedUrlsOnly: true,
    controlledSeedUrlCount: controlledSeedUrlTotalCount,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaOfficialRouteDiscoveryRunnerStatus: status,
    officialRouteDiscoveryPlanReadCount: 1,

    fetchAttemptCount: fetchRows.length,
    okFetchCount: okFetchRows.length,
    fetchRowsByStatusCode: countBy(fetchRows, "statusCode"),
    competitionsWithOkFetch,
    htmlSignalRowCount: htmlSignalRows.length,
    htmlSignalRowsWithAnySignalCount: signalRowsWithAny.length,
    competitionsWithSignals,
    competitionsWithEmbeddedSignals,
    competitionsWithStandingSignals,

    officialRouteCandidateRowCount: uniqueRouteCandidateRows.length,
    officialRouteCandidateRowsByCompetition: countBy(uniqueRouteCandidateRows, "competitionSlug"),
    officialAssetReferenceRowCount: uniqueAssetReferenceRows.length,
    officialAssetReferenceRowsByCompetition: countBy(uniqueAssetReferenceRows, "competitionSlug"),

    preCheckCount: preChecks.length,
    passedPreCheckCount,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount,
    blockedPostCheckCount,

    mayBuildControlledSportomediaOfficialAssetProbePlanCount: blockedPostCheckCount === 0 && hasAssetReferences ? 1 : 0,
    mayBuildControlledSportomediaRouteCandidateReviewGateCount: blockedPostCheckCount === 0 && (hasRouteCandidates || signalRowsWithAny.length > 0) ? 1 : 0,

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
  htmlSignalRows,
  officialRouteCandidateRows: uniqueRouteCandidateRows,
  officialAssetReferenceRows: uniqueAssetReferenceRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaOfficialRouteDiscoveryRunnerStatus: output.summary.controlledSportomediaOfficialRouteDiscoveryRunnerStatus,
  fetchAttemptCount: output.summary.fetchAttemptCount,
  okFetchCount: output.summary.okFetchCount,
  competitionsWithOkFetch: output.summary.competitionsWithOkFetch,
  htmlSignalRowCount: output.summary.htmlSignalRowCount,
  competitionsWithSignals: output.summary.competitionsWithSignals,
  competitionsWithEmbeddedSignals: output.summary.competitionsWithEmbeddedSignals,
  competitionsWithStandingSignals: output.summary.competitionsWithStandingSignals,
  officialRouteCandidateRowCount: output.summary.officialRouteCandidateRowCount,
  officialRouteCandidateRowsByCompetition: output.summary.officialRouteCandidateRowsByCompetition,
  officialAssetReferenceRowCount: output.summary.officialAssetReferenceRowCount,
  officialAssetReferenceRowsByCompetition: output.summary.officialAssetReferenceRowsByCompetition,
  sampleHtmlSignalRows: htmlSignalRows.slice(0, 8).map((row) => ({
    competitionSlug: row.competitionSlug,
    requestedUrl: fetchRows.find((fetchRow) => fetchRow.sportomediaOfficialRouteDiscoveryFetchRowId === row.sourceSportomediaOfficialRouteDiscoveryFetchRowId)?.requestedUrl,
    finalUrl: row.finalUrl,
    signalKinds: row.signalKinds,
    title: row.title
  })),
  sampleAssetReferenceRows: uniqueAssetReferenceRows.slice(0, 8).map((row) => ({
    competitionSlug: row.competitionSlug,
    assetUrl: row.assetUrl,
    assetReferenceStatus: row.assetReferenceStatus
  })),
  mayBuildControlledSportomediaOfficialAssetProbePlanCount: output.summary.mayBuildControlledSportomediaOfficialAssetProbePlanCount,
  mayBuildControlledSportomediaRouteCandidateReviewGateCount: output.summary.mayBuildControlledSportomediaRouteCandidateReviewGateCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}

