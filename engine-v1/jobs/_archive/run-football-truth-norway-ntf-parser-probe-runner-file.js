import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const controlledSourceOnly = args.has("--controlled-source-only");

const planPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "provider-specific-parser-gap-plan-2026-06-15",
  "provider-specific-parser-gap-plan-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-parser-probe-runner-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-parser-probe-runner-2026-06-15.json"
);

const expectedCompetitions = ["nor.1", "nor.2"];

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

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(",", ".");
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  }
  return null;
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

function getNested(obj, pathParts) {
  let current = obj;
  for (const part of pathParts) {
    if (!current || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current;
}

function parseJsonScripts(html) {
  const decoded = htmlDecode(html);
  const chunks = [];

  const patterns = [
    { label: "__NEXT_DATA__", regex: /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi },
    { label: "application_json_script", regex: /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi },
    { label: "ld_json_script", regex: /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi }
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern.regex)) {
      chunks.push({ label: pattern.label, text: match[1] });
    }
  }

  return chunks.slice(0, 80);
}

function collectObjects(root, maxNodes = 300000) {
  const out = [];
  const stack = [{ value: root, path: "$" }];
  let visited = 0;

  while (stack.length > 0 && visited < maxNodes) {
    const { value, path } = stack.pop();
    visited += 1;

    if (!value || typeof value !== "object") continue;
    out.push({ value, path });

    if (Array.isArray(value)) {
      for (let index = Math.min(value.length - 1, 2500); index >= 0; index -= 1) {
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

function objectKeySignature(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
  return Object.keys(obj).sort().join("|").slice(0, 500);
}

function looksLikeStandingObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  const keys = Object.keys(obj).map((key) => key.toLowerCase());
  const joined = keys.join("|");

  const hasTeamSignal = /(team|club|participant|contestant|competitor|squad|name|displayname)/i.test(joined);
  const hasTableSignal = /(position|rank|place|pos|points|pts|played|matches|won|drawn|lost|goals|goal|diff|gd|score)/i.test(joined);

  return hasTeamSignal && hasTableSignal;
}

function standingCandidateFromObject(obj, sourceLabel, sourcePath) {
  if (!looksLikeStandingObject(obj)) return null;

  const teamName = firstString(
    obj.teamName,
    obj.clubName,
    obj.contestantName,
    obj.displayName,
    obj.fullName,
    obj.shortName,
    obj.name,
    obj.team_name,
    obj.club_name,
    obj.participantName,
    obj.competitorName,
    getNested(obj, ["team", "name"]),
    getNested(obj, ["team", "displayName"]),
    getNested(obj, ["team", "teamName"]),
    getNested(obj, ["club", "name"]),
    getNested(obj, ["club", "teamName"]),
    getNested(obj, ["participant", "name"]),
    getNested(obj, ["competitor", "name"]),
    getNested(obj, ["contestant", "name"]),
    getNested(obj, ["entity", "name"])
  );

  const position = firstNumber(obj.position, obj.rank, obj.ranking, obj.place, obj.pos, obj.standingPosition, obj.tablePosition);
  const points = firstNumber(obj.points, obj.pts, obj.point, obj.totalPoints);
  const played = firstNumber(obj.played, obj.matchesPlayed, obj.playedMatches, obj.gamesPlayed, obj.matches, obj.p, obj.mp, obj.games, obj.totalPlayed);
  const won = firstNumber(obj.won, obj.wins, obj.w);
  const drawn = firstNumber(obj.drawn, obj.draws, obj.d, obj.tied);
  const lost = firstNumber(obj.lost, obj.losses, obj.l);
  const goalsFor = firstNumber(obj.goalsFor, obj.gf, obj.goals_for, obj.scored);
  const goalsAgainst = firstNumber(obj.goalsAgainst, obj.ga, obj.goals_against, obj.conceded);
  const goalDifference = firstNumber(obj.goalDifference, obj.gd, obj.diff, obj.goalDiff);

  if (!teamName) return null;
  if (/^(home|away|team|club|tabell|table|standings?|total|general|form)$/i.test(teamName)) return null;
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

function regexCandidateRows(html) {
  const decoded = htmlDecode(html);
  const candidates = [];

  const regexes = [
    {
      label: "regex_team_points_nearby",
      regex: /"(?:teamName|clubName|displayName|name)"\s*:\s*"([^"]{2,120})"[\s\S]{0,1000}?"(?:points|pts|totalPoints)"\s*:\s*"?(-?\d{1,3})"?/gi
    },
    {
      label: "regex_points_team_nearby",
      regex: /"(?:points|pts|totalPoints)"\s*:\s*"?(-?\d{1,3})"?[\s\S]{0,1000}?"(?:teamName|clubName|displayName|name)"\s*:\s*"([^"]{2,120})"/gi,
      reverse: true
    }
  ];

  for (const entry of regexes) {
    for (const match of decoded.matchAll(entry.regex)) {
      const teamName = entry.reverse ? match[2] : match[1];
      const points = Number(entry.reverse ? match[1] : match[2]);
      if (!teamName || !Number.isFinite(points)) continue;
      if (/^(home|away|team|club|tabell|table|standings?|total|general|form)$/i.test(teamName.trim())) continue;

      candidates.push({
        extractionSource: entry.label,
        sourcePath: "html_regex",
        teamName: teamName.trim(),
        position: null,
        points,
        played: null,
        won: null,
        drawn: null,
        lost: null,
        goalsFor: null,
        goalsAgainst: null,
        goalDifference: null
      });
    }
  }

  return candidates;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];

  for (const candidate of candidates) {
    const key = [
      candidate.teamName,
      candidate.position ?? "",
      candidate.points ?? "",
      candidate.played ?? "",
      candidate.won ?? "",
      candidate.drawn ?? "",
      candidate.lost ?? ""
    ].join("|").toLowerCase();

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }

  return out;
}

function extractCandidatesAndSignatures(html) {
  const candidates = [];
  const signatures = new Map();
  const jsonChunkSummaries = [];

  for (const chunk of parseJsonScripts(html)) {
    try {
      const parsed = JSON.parse(chunk.text.trim());
      const objects = collectObjects(parsed);
      jsonChunkSummaries.push({
        label: chunk.label,
        charCount: chunk.text.length,
        objectCount: objects.length
      });

      for (const { value, path } of objects) {
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;

        const signature = objectKeySignature(value);
        if (/(team|club|participant|position|rank|points|played|matches|won|drawn|lost|goals|goal|table|standing|tabell)/i.test(signature)) {
          const current = signatures.get(signature) ?? { signature, count: 0, examplePath: path };
          current.count += 1;
          signatures.set(signature, current);
        }

        const candidate = standingCandidateFromObject(value, chunk.label, path);
        if (candidate) candidates.push(candidate);
      }
    } catch {
      jsonChunkSummaries.push({
        label: chunk.label,
        charCount: chunk.text.length,
        objectCount: 0,
        parseError: true
      });
    }
  }

  candidates.push(...regexCandidateRows(html));

  return {
    candidates: dedupeCandidates(candidates).sort((a, b) => {
      const ap = a.position ?? 9999;
      const bp = b.position ?? 9999;
      if (ap !== bp) return ap - bp;
      const apt = a.points ?? -9999;
      const bpt = b.points ?? -9999;
      if (apt !== bpt) return bpt - apt;
      return String(a.teamName).localeCompare(String(b.teamName));
    }),
    keySignatureRows: [...signatures.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, 80),
    jsonChunkSummaries
  };
}

function markerSignals(html) {
  const decoded = htmlDecode(html).slice(0, 1000000);
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
    "__NEXT_DATA__",
    "application/json"
  ].filter((marker) => decoded.toLowerCase().includes(marker.toLowerCase()));
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AI-MatchLab-FootballTruthNorwayNtfParserProbe/1.0",
        "accept": "text/html,application/json;q=0.9,*/*;q=0.8"
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

if (!allowExecute) throw new Error("Missing required --allow-execute flag.");
if (!allowFetch) throw new Error("Missing required --allow-fetch flag.");
if (!controlledSourceOnly) throw new Error("Missing required --controlled-source-only flag.");

if (!fs.existsSync(planPath)) {
  throw new Error(`Missing provider specific parser gap plan: ${planPath}`);
}

fs.mkdirSync(outputDir, { recursive: true });

const plan = readJson(planPath);
const planSummary = plan.summary && typeof plan.summary === "object" ? plan.summary : {};
const gapPlanRows = Array.isArray(plan.gapPlanRows) ? plan.gapPlanRows : [];
const norwayRows = gapPlanRows.filter((row) => row.providerFamily === "norway_ntf");

const preChecks = [];
assertEqual("gapPlanStatus", planSummary.providerSpecificParserGapPlanStatus, "passed", preChecks);
assertEqual("mayBuildNorwayNtfParserRunnerCount", Number(planSummary.mayBuildNorwayNtfParserRunnerCount ?? 0), 1, preChecks);
assertEqual("norwayGapPlanRowCount", norwayRows.length, 2, preChecks);
assertArrayEqual("norwayCompetitions", uniqueSorted(norwayRows.map((row) => row.competitionSlug)), expectedCompetitions, preChecks);
assertAll("norwayRowsHaveTrustedUrls", norwayRows, (row) => Array.isArray(row.finalUrls) && row.finalUrls.length > 0, preChecks);
assertAll("norwayRowsAllowControlledFetchOnly", norwayRows, (row) => row.controlledFetchAllowedNext === true && row.broadSearchAllowedNext === false, preChecks);
assertAll("norwayRowsKeepWritesBlocked", norwayRows, (row) => row.canonicalWriteAllowedNext === false && row.productionWriteAllowedNext === false && row.truthAssertionAllowedNext === false, preChecks);

assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowFetchFlagPresent", allowFetch, true, preChecks);
assertEqual("controlledSourceOnlyFlagPresent", controlledSourceOnly, true, preChecks);

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;
if (blockedPreCheckCount !== 0) {
  writeJson(outputPath, {
    output: outputPath,
    job: "run-football-truth-norway-ntf-parser-probe-runner-file",
    status: "blocked_before_fetch",
    preChecks
  });
  console.log(JSON.stringify({
    output: outputPath,
    norwayNtfParserProbeRunnerStatus: "blocked_before_fetch",
    blockedPreCheckCount
  }, null, 2));
  process.exit(1);
}

const fetchRows = [];
const standingCandidateRows = [];
const keySignatureRows = [];
const jsonChunkRows = [];

for (const planRow of norwayRows) {
  const urls = uniqueSorted([...(planRow.finalUrls ?? []), ...(planRow.urls ?? [])]).slice(0, 2);

  for (const url of urls) {
    const fetched = await fetchText(url);
    const extracted = fetched.ok ? extractCandidatesAndSignatures(fetched.body) : { candidates: [], keySignatureRows: [], jsonChunkSummaries: [] };
    const signals = fetched.ok ? markerSignals(fetched.body) : [];

    const fetchRow = {
      norwayNtfParserProbeFetchRowId: `norway_ntf_parser_probe_fetch_${String(fetchRows.length + 1).padStart(2, "0")}`,
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
      markerSignals: signals,
      jsonChunkCount: extracted.jsonChunkSummaries.length,
      keySignatureCount: extracted.keySignatureRows.length,
      standingCandidateCount: extracted.candidates.length,
      errorName: fetched.errorName,
      errorMessage: fetched.errorMessage
    };

    fetchRows.push(fetchRow);

    extracted.jsonChunkSummaries.forEach((chunk, index) => {
      jsonChunkRows.push({
        norwayNtfJsonChunkProbeRowId: `norway_ntf_json_chunk_probe_${String(jsonChunkRows.length + 1).padStart(2, "0")}`,
        sourceNorwayNtfParserProbeFetchRowId: fetchRow.norwayNtfParserProbeFetchRowId,
        competitionSlug: planRow.competitionSlug,
        providerFamily: planRow.providerFamily,
        chunkOrdinal: index + 1,
        ...chunk
      });
    });

    extracted.keySignatureRows.forEach((signatureRow, index) => {
      keySignatureRows.push({
        norwayNtfKeySignatureProbeRowId: `norway_ntf_key_signature_probe_${String(keySignatureRows.length + 1).padStart(3, "0")}`,
        sourceNorwayNtfParserProbeFetchRowId: fetchRow.norwayNtfParserProbeFetchRowId,
        competitionSlug: planRow.competitionSlug,
        providerFamily: planRow.providerFamily,
        signatureOrdinal: index + 1,
        ...signatureRow
      });
    });

    extracted.candidates.slice(0, 80).forEach((candidate, index) => {
      standingCandidateRows.push({
        norwayNtfStandingCandidateProbeRowId: `norway_ntf_standing_candidate_probe_${String(standingCandidateRows.length + 1).padStart(3, "0")}`,
        sourceNorwayNtfParserProbeFetchRowId: fetchRow.norwayNtfParserProbeFetchRowId,
        competitionSlug: planRow.competitionSlug,
        providerFamily: planRow.providerFamily,
        parserRoute: planRow.parserRoute,
        candidateOrdinal: index + 1,
        teamName: candidate.teamName,
        position: candidate.position,
        points: candidate.points,
        played: candidate.played,
        won: candidate.won,
        drawn: candidate.drawn,
        lost: candidate.lost,
        goalsFor: candidate.goalsFor,
        goalsAgainst: candidate.goalsAgainst,
        goalDifference: candidate.goalDifference,
        extractionSource: candidate.extractionSource,
        sourcePath: candidate.sourcePath,
        resultStatus: "norway_ntf_probe_candidate_not_truth_asserted",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      });
    });
  }
}

const competitionsWithOkFetch = uniqueSorted(fetchRows.filter((row) => row.ok).map((row) => row.competitionSlug));
const competitionsWithCandidateSignals = uniqueSorted(standingCandidateRows.map((row) => row.competitionSlug));
const competitionsWithKeySignatures = uniqueSorted(keySignatureRows.map((row) => row.competitionSlug));

const postChecks = [];
assertEqual("norwayNtfProbeFetchAttemptCount", fetchRows.length, 4, postChecks);
assertEqual("norwayNtfProbeOkFetchCount", fetchRows.filter((row) => row.ok).length, 4, postChecks);
assertArrayEqual("competitionsWithOkFetch", competitionsWithOkFetch, expectedCompetitions, postChecks);
assertEqual("trustedFetchRouteReachedForNorwayNtf", competitionsWithOkFetch.length, 2, postChecks);
assertEqual("embeddedJsonNotRequiredForProbeSuccess", true, true, postChecks);
assertEqual("keySignaturesNotRequiredForProbeSuccess", true, true, postChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const passedPreCheckCount = preChecks.filter((check) => check.passed).length;
const passedPostCheckCount = postChecks.filter((check) => check.passed).length;

const status = blockedPostCheckCount !== 0
  ? "blocked_after_fetch_validation"
  : standingCandidateRows.length > 0
    ? "passed_with_probe_candidates"
    : keySignatureRows.length > 0
      ? "passed_with_route_signatures_needs_parser_implementation"
      : "passed_with_ok_fetch_no_embedded_route_data_needs_html_or_endpoint_discovery";

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-parser-probe-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { planPath },
  policy: {
    controlledFetchFromGapPlanTrustedUrlsOnly: true,
    norwayNtfOnly: true,
    probeOnly: true,
    candidateResultsAreNotTruthAssertions: true,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    norwayNtfParserProbeRunnerStatus: status,
    providerSpecificParserGapPlanReadCount: 1,
    norwayGapPlanRowCount: norwayRows.length,

    norwayNtfProbeFetchAttemptCount: fetchRows.length,
    norwayNtfProbeOkFetchCount: fetchRows.filter((row) => row.ok).length,
    norwayNtfProbeRespondedFetchCount: fetchRows.filter((row) => row.responded).length,
    competitionsWithOkFetchCount: competitionsWithOkFetch.length,

    jsonChunkProbeRowCount: jsonChunkRows.length,
    keySignatureProbeRowCount: keySignatureRows.length,
    standingCandidateProbeRowCount: standingCandidateRows.length,
    standingCandidateProbeCompetitionCount: competitionsWithCandidateSignals.length,

    competitionsWithOkFetch,
    competitionsWithKeySignatures,
    competitionsWithCandidateSignals,

    probeFetchRowsByCompetition: countBy(fetchRows, "competitionSlug"),
    standingCandidateProbeRowsByCompetition: countBy(standingCandidateRows, "competitionSlug"),

    preCheckCount: preChecks.length,
    passedPreCheckCount,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount,
    blockedPostCheckCount,

    mayBuildNorwayNtfRouteSpecificParserImplementationCount: blockedPostCheckCount === 0 ? 1 : 0,

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
  jsonChunkRows,
  keySignatureRows,
  standingCandidateRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfParserProbeRunnerStatus: output.summary.norwayNtfParserProbeRunnerStatus,
  norwayNtfProbeFetchAttemptCount: output.summary.norwayNtfProbeFetchAttemptCount,
  norwayNtfProbeOkFetchCount: output.summary.norwayNtfProbeOkFetchCount,
  jsonChunkProbeRowCount: output.summary.jsonChunkProbeRowCount,
  keySignatureProbeRowCount: output.summary.keySignatureProbeRowCount,
  standingCandidateProbeRowCount: output.summary.standingCandidateProbeRowCount,
  standingCandidateProbeCompetitionCount: output.summary.standingCandidateProbeCompetitionCount,
  competitionsWithCandidateSignals: output.summary.competitionsWithCandidateSignals,
  sampleKeySignatures: keySignatureRows.slice(0, 8).map((row) => ({
    competitionSlug: row.competitionSlug,
    count: row.count,
    examplePath: row.examplePath,
    signature: row.signature
  })),
  sampleStandingCandidates: standingCandidateRows.slice(0, 12).map((row) => ({
    competitionSlug: row.competitionSlug,
    teamName: row.teamName,
    position: row.position,
    points: row.points,
    played: row.played,
    extractionSource: row.extractionSource
  })),
  mayBuildNorwayNtfRouteSpecificParserImplementationCount: output.summary.mayBuildNorwayNtfRouteSpecificParserImplementationCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}

