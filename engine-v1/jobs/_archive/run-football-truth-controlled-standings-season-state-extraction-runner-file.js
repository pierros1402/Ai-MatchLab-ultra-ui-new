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
  "standings-season-state-extraction-plan-2026-06-15",
  "standings-season-state-extraction-plan-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-standings-season-state-extraction-runner-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "controlled-standings-season-state-extraction-runner-2026-06-15.json"
);

const expectedCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];
const expectedProviderFamilies = ["laliga", "norway_ntf", "sportomedia"];

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

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim().replace(",", ".");
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) return Number(cleaned);
  }
  return null;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string") {
      const cleaned = value.trim();
      if (cleaned.length >= 2 && cleaned.length <= 90 && !/^https?:\/\//i.test(cleaned)) return cleaned;
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

function objectStandingCandidate(obj, sourceLabel) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const teamName = firstString(
    obj.teamName,
    obj.clubName,
    obj.contestantName,
    obj.displayName,
    obj.fullName,
    obj.shortName,
    obj.name,
    getNested(obj, ["team", "name"]),
    getNested(obj, ["team", "teamName"]),
    getNested(obj, ["team", "displayName"]),
    getNested(obj, ["club", "name"]),
    getNested(obj, ["club", "teamName"]),
    getNested(obj, ["participant", "name"]),
    getNested(obj, ["competitor", "name"]),
    getNested(obj, ["contestant", "name"]),
    getNested(obj, ["entity", "name"])
  );

  if (!teamName) return null;
  if (/^(home|away|team|club|standings?|classification|table|total)$/i.test(teamName)) return null;

  const position = firstNumber(obj.position, obj.rank, obj.ranking, obj.place, obj.pos, obj.standingPosition);
  const points = firstNumber(obj.points, obj.pts, obj.point, obj.totalPoints);
  const played = firstNumber(obj.played, obj.matchesPlayed, obj.playedMatches, obj.gamesPlayed, obj.matches, obj.p, obj.mp);
  const won = firstNumber(obj.won, obj.wins, obj.w);
  const drawn = firstNumber(obj.drawn, obj.draws, obj.d, obj.tied);
  const lost = firstNumber(obj.lost, obj.losses, obj.l);
  const goalsFor = firstNumber(obj.goalsFor, obj.gf, obj.goals_for);
  const goalsAgainst = firstNumber(obj.goalsAgainst, obj.ga, obj.goals_against);
  const goalDifference = firstNumber(obj.goalDifference, obj.gd, obj.diff);

  if ([position, points, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference].filter((value) => value !== null).length < 1) return null;

  return {
    extractionSource: sourceLabel,
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

function collectStandingCandidatesFromObject(root, sourceLabel, maxNodes = 90000) {
  const candidates = [];
  const stack = [root];
  let visited = 0;

  while (stack.length > 0 && visited < maxNodes) {
    const current = stack.pop();
    visited += 1;

    if (!current || typeof current !== "object") continue;

    const candidate = objectStandingCandidate(current, sourceLabel);
    if (candidate) candidates.push(candidate);

    if (Array.isArray(current)) {
      for (let i = Math.min(current.length - 1, 500); i >= 0; i -= 1) {
        stack.push(current[i]);
      }
    } else {
      for (const value of Object.values(current)) {
        if (value && typeof value === "object") stack.push(value);
      }
    }
  }

  return candidates;
}

function parseJsonScripts(html) {
  const chunks = [];
  const decoded = htmlDecode(html);

  const nextDataRegex = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of decoded.matchAll(nextDataRegex)) chunks.push({ label: "__NEXT_DATA__", text: match[1] });

  const jsonScriptRegex = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of decoded.matchAll(jsonScriptRegex)) chunks.push({ label: "application_json_script", text: match[1] });

  const ldJsonRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of decoded.matchAll(ldJsonRegex)) chunks.push({ label: "ld_json_script", text: match[1] });

  const initialStateRegex = /(?:window\.)?(?:__INITIAL_STATE__|__APOLLO_STATE__|__PRELOADED_STATE__)\s*=\s*(\{[\s\S]{100,250000}?\})\s*[;<]/gi;
  for (const match of decoded.matchAll(initialStateRegex)) chunks.push({ label: "initial_state_assignment", text: match[1] });

  return chunks.slice(0, 30);
}

function regexStandingCandidates(html) {
  const decoded = htmlDecode(html);
  const candidates = [];

  const patterns = [
    {
      label: "regex_name_then_points",
      regex: /"(?:teamName|clubName|contestantName|displayName|fullName|shortName|name)"\s*:\s*"([^"]{2,90})"[\s\S]{0,650}?"(?:points|pts|totalPoints)"\s*:\s*"?(-?\d{1,3})"?/gi
    },
    {
      label: "regex_points_then_name",
      regex: /"(?:points|pts|totalPoints)"\s*:\s*"?(-?\d{1,3})"?[\s\S]{0,650}?"(?:teamName|clubName|contestantName|displayName|fullName|shortName|name)"\s*:\s*"([^"]{2,90})"/gi,
      reverse: true
    }
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern.regex)) {
      const teamName = pattern.reverse ? match[2] : match[1];
      const points = Number(pattern.reverse ? match[1] : match[2]);
      if (!teamName || !Number.isFinite(points)) continue;
      if (/^(home|away|team|club|standings?|classification|table|total)$/i.test(teamName.trim())) continue;
      candidates.push({
        extractionSource: pattern.label,
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

function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => {
    const ap = a.position ?? 9999;
    const bp = b.position ?? 9999;
    if (ap !== bp) return ap - bp;
    const apt = a.points ?? -9999;
    const bpt = b.points ?? -9999;
    if (apt !== bpt) return bpt - apt;
    return String(a.teamName).localeCompare(String(b.teamName));
  });
}

function extractCandidatesFromHtml(html) {
  const all = [];

  for (const chunk of parseJsonScripts(html)) {
    try {
      const parsed = JSON.parse(chunk.text.trim());
      all.push(...collectStandingCandidatesFromObject(parsed, chunk.label));
    } catch {
      // Ignore non-JSON script payloads.
    }
  }

  all.push(...regexStandingCandidates(html));

  return sortCandidates(dedupeCandidates(all)).slice(0, 80);
}

function extractSeasonStateCandidate(html, standingCandidateCount) {
  const decoded = htmlDecode(html).slice(0, 800000);
  const seasonMatches = uniqueSorted([...decoded.matchAll(/\b20\d{2}\s*[\/\-–]\s*20\d{2}\b/g)].map((match) => match[0].replace(/\s+/g, ""))).slice(0, 5);

  const fixtureMarkers = [
    /fixture/i,
    /terminliste/i,
    /kamper/i,
    /matches/i,
    /schedule/i,
    /result/i,
    /standing/i,
    /standings/i,
    /classification/i,
    /tabell/i
  ].filter((regex) => regex.test(decoded)).map((regex) => regex.source.replace(/\\/g, ""));

  const seasonStateCandidate =
    standingCandidateCount > 0 || fixtureMarkers.length > 0
      ? "active_or_current_season_candidate"
      : "season_state_unknown_needs_route_specific_extraction";

  return {
    seasonStateCandidate,
    seasonLabels: seasonMatches,
    markerSignals: fixtureMarkers.slice(0, 12)
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
        "user-agent": "AI-MatchLab-FootballTruthControlledExtraction/1.0",
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

if (!allowExecute) throw new Error("Missing required --allow-execute flag.");
if (!allowFetch) throw new Error("Missing required --allow-fetch flag.");
if (!controlledSourceOnly) throw new Error("Missing required --controlled-source-only flag.");

if (!fs.existsSync(planPath)) {
  throw new Error(`Missing standings/season-state extraction plan: ${planPath}`);
}

fs.mkdirSync(outputDir, { recursive: true });

const plan = readJson(planPath);
const planSummary = plan.summary && typeof plan.summary === "object" ? plan.summary : {};
const planRows = Array.isArray(plan.extractionPlanRows) ? plan.extractionPlanRows : [];
const readyRows = planRows.filter((row) => row.planStatus === "ready_for_controlled_extraction_probe");

const preChecks = [];
assertEqual("planStatus", planSummary.standingsSeasonStateExtractionPlanStatus, "passed", preChecks);
assertEqual("mayBuildControlledStandingsSeasonStateExtractionRunnerCount", Number(planSummary.mayBuildControlledStandingsSeasonStateExtractionRunnerCount ?? 0), 1, preChecks);
assertEqual("readyForControlledExtractionProbeRowCount", readyRows.length, 6, preChecks);
assertArrayEqual("planCompetitions", uniqueSorted(readyRows.map((row) => row.competitionSlug)), expectedCompetitions, preChecks);
assertArrayEqual("planProviderFamilies", uniqueSorted(readyRows.map((row) => row.providerFamily)), expectedProviderFamilies, preChecks);
assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowFetchFlagPresent", allowFetch, true, preChecks);
assertEqual("controlledSourceOnlyFlagPresent", controlledSourceOnly, true, preChecks);
assertEqual("planBroadSearchExecutedNowCount", Number(planSummary.broadSearchExecutedNowCount ?? 0), 0, preChecks);
assertEqual("planClassifierExecutedNowCount", Number(planSummary.classifierExecutedNowCount ?? 0), 0, preChecks);
assertEqual("planCanonicalWriteExecutedNowCount", Number(planSummary.canonicalWriteExecutedNowCount ?? 0), 0, preChecks);
assertEqual("planProductionWriteExecutedNowCount", Number(planSummary.productionWriteExecutedNowCount ?? 0), 0, preChecks);
assertEqual("planTruthAssertionExecutedNowCount", Number(planSummary.truthAssertionExecutedNowCount ?? 0), 0, preChecks);

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;
if (blockedPreCheckCount !== 0) {
  writeJson(outputPath, {
    output: outputPath,
    job: "run-football-truth-controlled-standings-season-state-extraction-runner-file",
    status: "blocked_before_fetch",
    preChecks
  });
  console.log(JSON.stringify({
    output: outputPath,
    controlledStandingsSeasonStateExtractionRunnerStatus: "blocked_before_fetch",
    blockedPreCheckCount
  }, null, 2));
  process.exit(1);
}

const fetchRows = [];
const extractionResultRows = [];
const seasonStateCandidateRows = [];

for (const planRow of readyRows) {
  const urls = uniqueSorted([...(Array.isArray(planRow.finalUrls) ? planRow.finalUrls : []), ...(Array.isArray(planRow.urls) ? planRow.urls : [])]).slice(0, 2);
  const rowFetches = [];

  for (const url of urls) {
    const fetched = await fetchText(url);
    const bodyForExtraction = fetched.body ?? "";
    const standingCandidates = fetched.ok ? extractCandidatesFromHtml(bodyForExtraction) : [];
    const seasonStateCandidate = extractSeasonStateCandidate(bodyForExtraction, standingCandidates.length);

    const fetchRow = {
      controlledExtractionFetchRowId: `controlled_extraction_fetch_${String(fetchRows.length + 1).padStart(2, "0")}`,
      competitionSlug: planRow.competitionSlug,
      providerFamily: planRow.providerFamily,
      extractionRoute: planRow.extractionRoute,
      url: fetched.url,
      finalUrl: fetched.finalUrl,
      responded: fetched.responded,
      ok: fetched.ok,
      statusCode: fetched.statusCode,
      statusText: fetched.statusText,
      contentType: fetched.contentType,
      bodyCharCount: fetched.bodyCharCount,
      bodySha256: fetched.bodySha256,
      standingCandidateCount: standingCandidates.length,
      seasonStateCandidate: seasonStateCandidate.seasonStateCandidate,
      seasonLabels: seasonStateCandidate.seasonLabels,
      markerSignals: seasonStateCandidate.markerSignals,
      errorName: fetched.errorName,
      errorMessage: fetched.errorMessage
    };

    fetchRows.push(fetchRow);
    rowFetches.push(fetchRow);

    standingCandidates.slice(0, 40).forEach((candidate, index) => {
      extractionResultRows.push({
        standingsSeasonStateExtractionResultRowId: `standings_season_state_extraction_result_${String(extractionResultRows.length + 1).padStart(3, "0")}`,
        sourceControlledExtractionFetchRowId: fetchRow.controlledExtractionFetchRowId,
        competitionSlug: planRow.competitionSlug,
        providerFamily: planRow.providerFamily,
        extractionRoute: planRow.extractionRoute,
        extractionSource: candidate.extractionSource,
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
        resultStatus: "extracted_candidate_not_truth_asserted",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      });
    });

    seasonStateCandidateRows.push({
      seasonStateCandidateRowId: `season_state_candidate_${String(seasonStateCandidateRows.length + 1).padStart(2, "0")}`,
      sourceControlledExtractionFetchRowId: fetchRow.controlledExtractionFetchRowId,
      competitionSlug: planRow.competitionSlug,
      providerFamily: planRow.providerFamily,
      extractionRoute: planRow.extractionRoute,
      seasonStateCandidate: seasonStateCandidate.seasonStateCandidate,
      seasonLabels: seasonStateCandidate.seasonLabels,
      markerSignals: seasonStateCandidate.markerSignals,
      standingCandidateCount: standingCandidates.length,
      resultStatus: "season_state_candidate_not_truth_asserted",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    });
  }
}

const okFetchRows = fetchRows.filter((row) => row.ok);
const competitionsWithOkFetch = uniqueSorted(okFetchRows.map((row) => row.competitionSlug));
const competitionsWithStandingCandidates = uniqueSorted(extractionResultRows.map((row) => row.competitionSlug));
const competitionsWithSeasonStateCandidates = uniqueSorted(seasonStateCandidateRows.filter((row) => row.seasonStateCandidate !== "season_state_unknown_needs_route_specific_extraction").map((row) => row.competitionSlug));

const postChecks = [];
assertEqual("controlledExtractionFetchAttemptCount", fetchRows.length, 12, postChecks);
assertEqual("controlledExtractionOkFetchCountAtLeastOnePerCompetition", competitionsWithOkFetch.length, 6, postChecks);
assertArrayEqual("competitionsWithOkFetch", competitionsWithOkFetch, expectedCompetitions, postChecks);
assertEqual("seasonStateCandidateRowCount", seasonStateCandidateRows.length, 12, postChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const standingCandidateCompetitionCount = competitionsWithStandingCandidates.length;

const runnerStatus = blockedPostCheckCount === 0
  ? (standingCandidateCompetitionCount > 0 ? "passed_with_extracted_candidates" : "passed_fetch_only_needs_route_specific_parser")
  : "blocked_after_fetch_validation";

const diagnostic = {
  output: outputPath,
  job: "run-football-truth-controlled-standings-season-state-extraction-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { planPath },
  policy: {
    controlledFetchFromExtractionPlanOnly: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false,
    candidateResultsOnly: true
  },
  summary: {
    controlledStandingsSeasonStateExtractionRunnerStatus: runnerStatus,
    standingsSeasonStateExtractionPlanReadCount: 1,
    readyForControlledExtractionProbeRowCount: readyRows.length,

    controlledExtractionFetchAttemptCount: fetchRows.length,
    controlledExtractionOkFetchCount: okFetchRows.length,
    controlledExtractionRespondedFetchCount: fetchRows.filter((row) => row.responded).length,
    competitionsWithOkFetchCount: competitionsWithOkFetch.length,

    standingCandidateRowCount: extractionResultRows.length,
    standingCandidateCompetitionCount,
    seasonStateCandidateRowCount: seasonStateCandidateRows.length,
    seasonStateCandidateCompetitionCount: competitionsWithSeasonStateCandidates.length,

    competitionsWithOkFetch,
    competitionsWithStandingCandidates,
    competitionsWithSeasonStateCandidates,

    byCompetitionSlug: countBy(fetchRows, "competitionSlug"),
    byProviderFamily: countBy(fetchRows, "providerFamily"),
    byExtractionRoute: countBy(fetchRows, "extractionRoute"),
    standingCandidateRowsByCompetition: countBy(extractionResultRows, "competitionSlug"),

    preCheckCount: preChecks.length,
    passedPreCheckCount: preChecks.filter((check) => check.passed).length,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount: postChecks.filter((check) => check.passed).length,
    blockedPostCheckCount,

    mayBuildControlledStandingsSeasonStateExtractionReviewBoardCount: blockedPostCheckCount === 0 ? 1 : 0,

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
  controlledExtractionFetchRows: fetchRows,
  seasonStateCandidateRows,
  extractionResultRows
};

writeJson(outputPath, diagnostic);

console.log(JSON.stringify({
  output: diagnostic.output,
  controlledStandingsSeasonStateExtractionRunnerStatus: diagnostic.summary.controlledStandingsSeasonStateExtractionRunnerStatus,
  controlledExtractionFetchAttemptCount: diagnostic.summary.controlledExtractionFetchAttemptCount,
  controlledExtractionOkFetchCount: diagnostic.summary.controlledExtractionOkFetchCount,
  standingCandidateRowCount: diagnostic.summary.standingCandidateRowCount,
  standingCandidateCompetitionCount: diagnostic.summary.standingCandidateCompetitionCount,
  seasonStateCandidateRowCount: diagnostic.summary.seasonStateCandidateRowCount,
  seasonStateCandidateCompetitionCount: diagnostic.summary.seasonStateCandidateCompetitionCount,
  competitionsWithStandingCandidates: diagnostic.summary.competitionsWithStandingCandidates,
  standingCandidateRowsByCompetition: diagnostic.summary.standingCandidateRowsByCompetition,
  sampleStandingCandidates: extractionResultRows.slice(0, 12).map((row) => ({
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    teamName: row.teamName,
    position: row.position,
    points: row.points,
    played: row.played
  })),
  mayBuildControlledStandingsSeasonStateExtractionReviewBoardCount: diagnostic.summary.mayBuildControlledStandingsSeasonStateExtractionReviewBoardCount,
  productionWriteExecutedNowCount: diagnostic.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: diagnostic.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}
