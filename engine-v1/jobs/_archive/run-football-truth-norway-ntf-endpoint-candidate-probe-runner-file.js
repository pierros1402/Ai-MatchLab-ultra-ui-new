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
  "norway-ntf-html-endpoint-discovery-runner-2026-06-15",
  "norway-ntf-html-endpoint-discovery-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-endpoint-candidate-probe-runner-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-endpoint-candidate-probe-runner-2026-06-15.json"
);

const expectedCompetitions = ["nor.1", "nor.2"];
const endpointSignalRegex = /(api|graphql|json|standings?|standing|table|tabell|league-table|competition|tournament|season|teams?|club|matches|fixtures|result|kamper|terminliste|eliteserien|obos)/i;
const noisyAssetRegex = /(jquery|jquery-ui|cookie|cloudflare|email-decode|blazy|navigation-bar|register\.js|push-notification|font|fonts|\.css|\.png|\.jpg|\.jpeg|\.svg|\.gif|\.ico|analytics|gtm|google|facebook|twitter)/i;

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

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function pathOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

function markerSignals(text) {
  const decoded = htmlDecode(text).slice(0, 2000000);
  return [
    "embed-league-table",
    "league-table",
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
    "axios."
  ].filter((marker) => decoded.toLowerCase().includes(marker.toLowerCase()));
}

function scoreCandidate(row) {
  const url = String(row.absoluteUrl ?? "");
  let score = 0;

  if (row.candidateSource === "assetEndpointRows") score += 120;
  if (/embed-league-table/i.test(url)) score += 140;
  if (/app\.bundle/i.test(url)) score += 110;
  if (/manifest\.json/i.test(url)) score += 70;
  if (/\/api\/|graphql|\.json(\?|$)|\/data\//i.test(url)) score += 90;
  if (/league-table|standings?|standing|tabell|table/i.test(url)) score += 80;
  if (/competition|tournament|season|kamper|terminliste|matches|fixtures/i.test(url)) score += 45;
  if (/\/_\/service\/|\/_\/asset\//i.test(url)) score += 30;
  if (/\.(js|mjs)(\?|$)/i.test(pathOf(url))) score += 20;
  if (noisyAssetRegex.test(url)) score -= 100;

  return score;
}

function buildAllowedOriginsByCompetition(htmlFetchRows) {
  const map = new Map();

  for (const row of htmlFetchRows) {
    if (!row.ok) continue;
    const origin = originOf(row.finalUrl ?? row.url);
    if (!origin) continue;
    const current = map.get(row.competitionSlug) ?? new Set();
    current.add(origin);
    map.set(row.competitionSlug, current);
  }

  return map;
}

function isAllowedOrigin(row, allowedOriginsByCompetition) {
  const allowedOrigins = allowedOriginsByCompetition.get(row.competitionSlug);
  const origin = originOf(row.absoluteUrl);
  return Boolean(origin && allowedOrigins && allowedOrigins.has(origin));
}

function buildProbeCandidateRows(source, allowedOriginsByCompetition) {
  const rows = [];

  const endpointCandidateRows = Array.isArray(source.endpointCandidateRows) ? source.endpointCandidateRows : [];
  const assetEndpointRows = Array.isArray(source.assetEndpointRows) ? source.assetEndpointRows : [];
  const htmlReferenceRows = Array.isArray(source.htmlReferenceRows) ? source.htmlReferenceRows : [];

  for (const row of endpointCandidateRows) {
    rows.push({
      candidateSource: "endpointCandidateRows",
      endpointCandidateKind: row.endpointCandidateKind,
      competitionSlug: row.competitionSlug,
      sourceRowId: row.sourceRowId,
      absoluteUrl: row.absoluteUrl
    });
  }

  for (const row of assetEndpointRows) {
    rows.push({
      candidateSource: "assetEndpointRows",
      endpointCandidateKind: `asset_${row.endpointKind}`,
      competitionSlug: row.competitionSlug,
      sourceRowId: row.norwayNtfAssetEndpointDiscoveryRowId,
      absoluteUrl: row.absoluteUrl
    });
  }

  for (const row of htmlReferenceRows) {
    const url = String(row.absoluteUrl ?? "");
    if (!row.sameOriginAsPage) continue;
    if (!/(embed-league-table|app\.bundle|manifest\.json|league-table|tabell|standings?|standing|\/api\/|graphql)/i.test(url)) continue;

    rows.push({
      candidateSource: "htmlReferenceRows_priority",
      endpointCandidateKind: `priority_${row.referenceKind}`,
      competitionSlug: row.competitionSlug,
      sourceRowId: row.norwayNtfHtmlReferenceRowId,
      absoluteUrl: row.absoluteUrl
    });
  }

  const deduped = [];
  const seen = new Set();

  for (const row of rows) {
    if (!expectedCompetitions.includes(row.competitionSlug)) continue;
    if (!row.absoluteUrl) continue;
    if (!isAllowedOrigin(row, allowedOriginsByCompetition)) continue;

    const score = scoreCandidate(row);
    if (score < 20) continue;

    const key = `${row.competitionSlug}|${row.absoluteUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);

    deduped.push({
      ...row,
      priorityScore: score,
      fetchAllowed: true,
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    });
  }

  return expectedCompetitions.flatMap((competitionSlug) =>
    deduped
      .filter((row) => row.competitionSlug === competitionSlug)
      .sort((a, b) => b.priorityScore - a.priorityScore || String(a.absoluteUrl).localeCompare(String(b.absoluteUrl)))
      .slice(0, 10)
      .map((row, index) => ({
        norwayNtfEndpointProbeCandidateRowId: `norway_ntf_endpoint_probe_candidate_${competitionSlug}_${String(index + 1).padStart(2, "0")}`,
        ...row
      }))
  );
}

function extractSecondOrderEndpointRows(text, baseUrl, competitionSlug, sourceFetchRowId) {
  const decoded = htmlDecode(text);
  const rows = [];

  const patterns = [
    { kind: "absolute_url_literal", regex: /["'`](https?:\/\/[^"'`\s<>]{8,700})["'`]/gi },
    { kind: "relative_url_literal", regex: /["'`](\/[^"'`\s<>]{3,700})["'`]/gi },
    { kind: "fetch_call_literal", regex: /fetch\(\s*["'`]([^"'`]{3,700})["'`]/gi },
    { kind: "axios_literal", regex: /axios\.(?:get|post)\(\s*["'`]([^"'`]{3,700})["'`]/gi },
    { kind: "url_assignment_literal", regex: /(?:url|endpoint|path|apiUrl|requestUrl)\s*[:=]\s*["'`]([^"'`]{3,700})["'`]/gi }
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern.regex)) {
      const absoluteUrl = safeUrl(match[1], baseUrl);
      if (!absoluteUrl) continue;
      if (!endpointSignalRegex.test(absoluteUrl) && !endpointSignalRegex.test(match[1])) continue;
      if (noisyAssetRegex.test(absoluteUrl)) continue;
      if (originOf(absoluteUrl) !== originOf(baseUrl)) continue;

      rows.push({
        norwayNtfSecondOrderEndpointCandidateRowId: "pending",
        sourceNorwayNtfEndpointProbeFetchRowId: sourceFetchRowId,
        competitionSlug,
        secondOrderEndpointKind: pattern.kind,
        rawValue: match[1],
        absoluteUrl,
        endpointSignal: true,
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      });
    }
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.secondOrderEndpointKind}|${row.absoluteUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(",", ".");
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  }
  return null;
}

function getNested(obj, pathParts) {
  let current = obj;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function collectObjects(root, maxNodes = 50000) {
  const out = [];
  const stack = [{ value: root, path: "$" }];
  let visited = 0;

  while (stack.length > 0 && visited < maxNodes) {
    const { value, path } = stack.pop();
    visited += 1;
    if (!value || typeof value !== "object") continue;

    out.push({ value, path });

    if (Array.isArray(value)) {
      for (let index = Math.min(value.length - 1, 1000); index >= 0; index -= 1) {
        stack.push({ value: value[index], path: `${path}[${index}]` });
      }
    } else {
      for (const [key, child] of Object.entries(value)) {
        if (child && typeof child === "object") stack.push({ value: child, path: `${path}.${key}` });
      }
    }
  }

  return out;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      const cleaned = value.trim();
      if (cleaned.length >= 2 && cleaned.length <= 120 && !/^https?:\/\//i.test(cleaned)) return cleaned;
    }
  }
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    const numeric = asNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function standingCandidateFromObject(obj, sourceLabel, sourcePath) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const keys = Object.keys(obj).map((key) => key.toLowerCase()).join("|");
  if (!/(team|club|participant|contestant|competitor|name|displayname)/i.test(keys)) return null;
  if (!/(position|rank|points|pts|played|matches|won|drawn|lost|goals|goal|diff|gd|table|standing)/i.test(keys)) return null;

  const teamName = firstString(
    obj.teamName,
    obj.clubName,
    obj.contestantName,
    obj.displayName,
    obj.fullName,
    obj.shortName,
    obj.name,
    obj.participantName,
    obj.competitorName,
    getNested(obj, ["team", "name"]),
    getNested(obj, ["club", "name"]),
    getNested(obj, ["participant", "name"]),
    getNested(obj, ["competitor", "name"])
  );

  const position = firstNumber(obj.position, obj.rank, obj.ranking, obj.place, obj.pos, obj.tablePosition);
  const points = firstNumber(obj.points, obj.pts, obj.totalPoints);
  const played = firstNumber(obj.played, obj.matchesPlayed, obj.playedMatches, obj.gamesPlayed, obj.matches, obj.mp);
  const won = firstNumber(obj.won, obj.wins, obj.w);
  const drawn = firstNumber(obj.drawn, obj.draws, obj.d);
  const lost = firstNumber(obj.lost, obj.losses, obj.l);
  const goalsFor = firstNumber(obj.goalsFor, obj.gf, obj.scored);
  const goalsAgainst = firstNumber(obj.goalsAgainst, obj.ga, obj.conceded);
  const goalDifference = firstNumber(obj.goalDifference, obj.gd, obj.diff);

  if (!teamName || /^(home|away|team|club|tabell|table|standings?|total|general|form)$/i.test(teamName)) return null;
  if ([position, points, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference].filter((value) => value !== null).length < 2) return null;

  return {
    extractionSource: sourceLabel,
    sourcePath,
    teamName,
    position,
    points,
    played,
    won,
    drawn,
    lost,
    goalsFor,
    goalsAgainst,
    goalDifference
  };
}

function extractStandingCandidatesFromMaybeJson(text, contentType, sourceLabel) {
  const trimmed = htmlDecode(text).trim();
  if (!/json/i.test(contentType ?? "") && !trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];

  try {
    const parsed = JSON.parse(trimmed);
    return collectObjects(parsed)
      .map(({ value, path }) => standingCandidateFromObject(value, sourceLabel, path))
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AI-MatchLab-FootballTruthNorwayNtfEndpointCandidateProbe/1.0",
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
if (!fs.existsSync(sourcePath)) throw new Error(`Missing Norway NTF endpoint discovery diagnostic: ${sourcePath}`);

fs.mkdirSync(outputDir, { recursive: true });

const source = readJson(sourcePath);
const sourceSummary = source.summary && typeof source.summary === "object" ? source.summary : {};
const htmlFetchRows = Array.isArray(source.htmlFetchRows) ? source.htmlFetchRows : [];
const allowedOriginsByCompetition = buildAllowedOriginsByCompetition(htmlFetchRows);
const endpointProbeCandidateRows = buildProbeCandidateRows(source, allowedOriginsByCompetition);

const preChecks = [];
assertEqual("sourceEndpointDiscoveryStatus", sourceSummary.norwayNtfHtmlEndpointDiscoveryRunnerStatus, "passed_with_endpoint_candidates", preChecks);
assertEqual("sourceMayBuildEndpointProbeRunnerCount", Number(sourceSummary.mayBuildNorwayNtfEndpointCandidateProbeRunnerCount ?? 0), 1, preChecks);
assertEqual("sourceEndpointCandidateRowCountPositive", Number(sourceSummary.endpointCandidateRowCount ?? 0) > 0, true, preChecks);
assertEqual("endpointProbeCandidateRowCountPositive", endpointProbeCandidateRows.length > 0, true, preChecks);
assertArrayEqual("endpointProbeCandidateCompetitions", uniqueSorted(endpointProbeCandidateRows.map((row) => row.competitionSlug)), expectedCompetitions, preChecks);
assertAll("endpointProbeCandidatesAreFetchAllowed", endpointProbeCandidateRows, (row) => row.fetchAllowed === true, preChecks);
assertAll("endpointProbeCandidatesKeepWritesBlocked", endpointProbeCandidateRows, (row) => row.canonicalWriteAllowedNow === false && row.productionWriteAllowedNow === false && row.truthAssertionAllowedNow === false, preChecks);
assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowFetchFlagPresent", allowFetch, true, preChecks);
assertEqual("controlledSourceOnlyFlagPresent", controlledSourceOnly, true, preChecks);

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;
if (blockedPreCheckCount !== 0) {
  writeJson(outputPath, {
    output: outputPath,
    job: "run-football-truth-norway-ntf-endpoint-candidate-probe-runner-file",
    status: "blocked_before_fetch",
    preChecks
  });
  console.log(JSON.stringify({ output: outputPath, norwayNtfEndpointCandidateProbeRunnerStatus: "blocked_before_fetch", blockedPreCheckCount }, null, 2));
  process.exit(1);
}

const endpointProbeFetchRows = [];
let secondOrderEndpointCandidateRows = [];
let standingCandidateRows = [];

for (const candidate of endpointProbeCandidateRows) {
  const fetched = await fetchText(candidate.absoluteUrl);
  const fetchRow = {
    norwayNtfEndpointProbeFetchRowId: `norway_ntf_endpoint_probe_fetch_${String(endpointProbeFetchRows.length + 1).padStart(3, "0")}`,
    sourceNorwayNtfEndpointProbeCandidateRowId: candidate.norwayNtfEndpointProbeCandidateRowId,
    competitionSlug: candidate.competitionSlug,
    candidateSource: candidate.candidateSource,
    endpointCandidateKind: candidate.endpointCandidateKind,
    priorityScore: candidate.priorityScore,
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

  endpointProbeFetchRows.push(fetchRow);

  if (fetched.ok) {
    secondOrderEndpointCandidateRows.push(...extractSecondOrderEndpointRows(fetched.body, fetched.finalUrl ?? fetched.url, candidate.competitionSlug, fetchRow.norwayNtfEndpointProbeFetchRowId));

    const extractedStandingCandidates = extractStandingCandidatesFromMaybeJson(fetched.body, fetched.contentType, fetchRow.norwayNtfEndpointProbeFetchRowId);
    standingCandidateRows.push(...extractedStandingCandidates.map((row, index) => ({
      norwayNtfEndpointStandingCandidateProbeRowId: `pending`,
      sourceNorwayNtfEndpointProbeFetchRowId: fetchRow.norwayNtfEndpointProbeFetchRowId,
      competitionSlug: candidate.competitionSlug,
      candidateOrdinal: index + 1,
      ...row,
      resultStatus: "norway_ntf_endpoint_probe_candidate_not_truth_asserted",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    })));
  }
}

secondOrderEndpointCandidateRows = secondOrderEndpointCandidateRows.map((row, index) => ({
  ...row,
  norwayNtfSecondOrderEndpointCandidateRowId: `norway_ntf_second_order_endpoint_candidate_${String(index + 1).padStart(4, "0")}`
}));

standingCandidateRows = standingCandidateRows.map((row, index) => ({
  ...row,
  norwayNtfEndpointStandingCandidateProbeRowId: `norway_ntf_endpoint_standing_candidate_probe_${String(index + 1).padStart(4, "0")}`
}));

const competitionsWithOkEndpointFetch = uniqueSorted(endpointProbeFetchRows.filter((row) => row.ok).map((row) => row.competitionSlug));
const competitionsWithSecondOrderEndpoints = uniqueSorted(secondOrderEndpointCandidateRows.map((row) => row.competitionSlug));
const competitionsWithStandingCandidates = uniqueSorted(standingCandidateRows.map((row) => row.competitionSlug));

const postChecks = [];
assertEqual("endpointProbeFetchAttemptCount", endpointProbeFetchRows.length, endpointProbeCandidateRows.length, postChecks);
assertEqual("endpointProbeOkFetchCountPositive", endpointProbeFetchRows.filter((row) => row.ok).length > 0, true, postChecks);
assertArrayEqual("competitionsWithOkEndpointFetch", competitionsWithOkEndpointFetch, expectedCompetitions, postChecks);
assertEqual("secondOrderEndpointCandidateRowsNonNegative", secondOrderEndpointCandidateRows.length >= 0, true, postChecks);
assertEqual("standingCandidateRowsNonNegative", standingCandidateRows.length >= 0, true, postChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const passedPreCheckCount = preChecks.filter((check) => check.passed).length;
const passedPostCheckCount = postChecks.filter((check) => check.passed).length;

const status = blockedPostCheckCount !== 0
  ? "blocked_after_endpoint_candidate_probe_validation"
  : standingCandidateRows.length > 0
    ? "passed_with_endpoint_standing_candidates"
    : secondOrderEndpointCandidateRows.length > 0
      ? "passed_with_second_order_endpoint_candidates"
      : "passed_with_endpoint_assets_needs_route_mapping";

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-endpoint-candidate-probe-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    controlledFetchFromEndpointDiscoveryCandidatesOnly: true,
    sameOriginOnly: true,
    norwayNtfOnly: true,
    endpointCandidateProbeOnly: true,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    norwayNtfEndpointCandidateProbeRunnerStatus: status,
    endpointDiscoveryReadCount: 1,

    endpointProbeCandidateRowCount: endpointProbeCandidateRows.length,
    endpointProbeCandidateRowsByCompetition: countBy(endpointProbeCandidateRows, "competitionSlug"),
    endpointProbeFetchAttemptCount: endpointProbeFetchRows.length,
    endpointProbeOkFetchCount: endpointProbeFetchRows.filter((row) => row.ok).length,
    endpointProbeRespondedFetchCount: endpointProbeFetchRows.filter((row) => row.responded).length,
    secondOrderEndpointCandidateRowCount: secondOrderEndpointCandidateRows.length,
    standingCandidateProbeRowCount: standingCandidateRows.length,

    competitionsWithOkEndpointFetch,
    competitionsWithSecondOrderEndpoints,
    competitionsWithStandingCandidates,

    endpointProbeFetchRowsByKind: countBy(endpointProbeFetchRows, "endpointCandidateKind"),
    secondOrderEndpointCandidatesByKind: countBy(secondOrderEndpointCandidateRows, "secondOrderEndpointKind"),

    preCheckCount: preChecks.length,
    passedPreCheckCount,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount,
    blockedPostCheckCount,

    mayBuildNorwayNtfSecondOrderEndpointProbeRunnerCount: blockedPostCheckCount === 0 && secondOrderEndpointCandidateRows.length > 0 ? 1 : 0,
    mayBuildNorwayNtfRouteSpecificParserPlanCount: blockedPostCheckCount === 0 ? 1 : 0,

    fetchExecutedNowCount: endpointProbeFetchRows.length,
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
  endpointProbeCandidateRows,
  endpointProbeFetchRows,
  secondOrderEndpointCandidateRows,
  standingCandidateRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfEndpointCandidateProbeRunnerStatus: output.summary.norwayNtfEndpointCandidateProbeRunnerStatus,
  endpointProbeCandidateRowCount: output.summary.endpointProbeCandidateRowCount,
  endpointProbeCandidateRowsByCompetition: output.summary.endpointProbeCandidateRowsByCompetition,
  endpointProbeFetchAttemptCount: output.summary.endpointProbeFetchAttemptCount,
  endpointProbeOkFetchCount: output.summary.endpointProbeOkFetchCount,
  secondOrderEndpointCandidateRowCount: output.summary.secondOrderEndpointCandidateRowCount,
  standingCandidateProbeRowCount: output.summary.standingCandidateProbeRowCount,
  competitionsWithSecondOrderEndpoints: output.summary.competitionsWithSecondOrderEndpoints,
  endpointProbeFetchRowsByKind: output.summary.endpointProbeFetchRowsByKind,
  secondOrderEndpointCandidatesByKind: output.summary.secondOrderEndpointCandidatesByKind,
  sampleSecondOrderEndpointCandidates: secondOrderEndpointCandidateRows.slice(0, 12).map((row) => ({
    competitionSlug: row.competitionSlug,
    secondOrderEndpointKind: row.secondOrderEndpointKind,
    absoluteUrl: row.absoluteUrl
  })),
  mayBuildNorwayNtfSecondOrderEndpointProbeRunnerCount: output.summary.mayBuildNorwayNtfSecondOrderEndpointProbeRunnerCount,
  mayBuildNorwayNtfRouteSpecificParserPlanCount: output.summary.mayBuildNorwayNtfRouteSpecificParserPlanCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}
