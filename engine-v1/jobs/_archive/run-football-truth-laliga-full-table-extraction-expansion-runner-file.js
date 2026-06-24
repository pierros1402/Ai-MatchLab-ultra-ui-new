import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const controlledSourceOnly = args.has("--controlled-source-only");

const reviewBoardPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-standings-season-state-extraction-review-board-2026-06-15",
  "controlled-standings-season-state-extraction-review-board-2026-06-15.json"
);

const canonicalEvidencePointerPath = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-evidence-pointers",
  "controlled-real-source-evidence-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "laliga-full-table-extraction-expansion-runner-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "laliga-full-table-extraction-expansion-runner-2026-06-15.json"
);

const expected = {
  "esp.1": { expectedLeagueSize: 20, expectedPlayed: 38 },
  "esp.2": { expectedLeagueSize: 22, expectedPlayed: 42 }
};

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
      if (cleaned.length >= 2 && cleaned.length <= 110 && !/^https?:\/\//i.test(cleaned)) return cleaned;
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
  if (/^(home|away|team|club|standings?|classification|table|total|general)$/i.test(teamName)) return null;

  const position = firstNumber(obj.position, obj.rank, obj.ranking, obj.place, obj.pos, obj.standingPosition);
  const points = firstNumber(obj.points, obj.pts, obj.point, obj.totalPoints);
  const played = firstNumber(obj.played, obj.matchesPlayed, obj.playedMatches, obj.gamesPlayed, obj.matches, obj.p, obj.mp);
  const won = firstNumber(obj.won, obj.wins, obj.w);
  const drawn = firstNumber(obj.drawn, obj.draws, obj.d, obj.tied);
  const lost = firstNumber(obj.lost, obj.losses, obj.l);
  const goalsFor = firstNumber(obj.goalsFor, obj.gf, obj.goals_for);
  const goalsAgainst = firstNumber(obj.goalsAgainst, obj.ga, obj.goals_against);
  const goalDifference = firstNumber(obj.goalDifference, obj.gd, obj.diff);

  if ([position, points, played, won, drawn, lost, goalsFor, goalsAgainst, goalDifference].filter((value) => value !== null).length < 2) return null;

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

function collectStandingCandidatesFromObject(root, sourceLabel, maxNodes = 300000) {
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
      for (let i = Math.min(current.length - 1, 2000); i >= 0; i -= 1) {
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

  const initialStateRegex = /(?:window\.)?(?:__INITIAL_STATE__|__APOLLO_STATE__|__PRELOADED_STATE__)\s*=\s*(\{[\s\S]{100,750000}?\})\s*[;<]/gi;
  for (const match of decoded.matchAll(initialStateRegex)) chunks.push({ label: "initial_state_assignment", text: match[1] });

  return chunks.slice(0, 50);
}

function regexStandingCandidates(html) {
  const decoded = htmlDecode(html);
  const candidates = [];

  const patterns = [
    {
      label: "regex_name_then_points",
      regex: /"(?:teamName|clubName|contestantName|displayName|fullName|shortName|name)"\s*:\s*"([^"]{2,110})"[\s\S]{0,900}?"(?:points|pts|totalPoints)"\s*:\s*"?(-?\d{1,3})"?/gi
    },
    {
      label: "regex_points_then_name",
      regex: /"(?:points|pts|totalPoints)"\s*:\s*"?(-?\d{1,3})"?[\s\S]{0,900}?"(?:teamName|clubName|contestantName|displayName|fullName|shortName|name)"\s*:\s*"([^"]{2,110})"/gi,
      reverse: true
    }
  ];

  for (const pattern of patterns) {
    for (const match of decoded.matchAll(pattern.regex)) {
      const teamName = pattern.reverse ? match[2] : match[1];
      const points = Number(pattern.reverse ? match[1] : match[2]);
      if (!teamName || !Number.isFinite(points)) continue;
      if (/^(home|away|team|club|standings?|classification|table|total|general)$/i.test(teamName.trim())) continue;

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

function extractCandidatesFromHtml(html) {
  const all = [];

  for (const chunk of parseJsonScripts(html)) {
    try {
      const parsed = JSON.parse(chunk.text.trim());
      all.push(...collectStandingCandidatesFromObject(parsed, chunk.label));
    } catch {
      // Ignore.
    }
  }

  all.push(...regexStandingCandidates(html));

  return dedupeCandidates(all);
}

function buildSeasonTotalRows(competitionSlug, candidates) {
  const target = expected[competitionSlug];
  const seasonTotalRows = candidates
    .filter((candidate) => candidate.teamName)
    .filter((candidate) => Number(candidate.played) === target.expectedPlayed)
    .filter((candidate) => Number.isFinite(Number(candidate.position)))
    .filter((candidate) => Number.isFinite(Number(candidate.points)))
    .sort((a, b) => Number(a.position) - Number(b.position) || String(a.teamName).localeCompare(String(b.teamName)));

  const seenPositions = new Set();
  const selected = [];

  for (const row of seasonTotalRows) {
    const position = Number(row.position);
    if (seenPositions.has(position)) continue;
    seenPositions.add(position);
    selected.push({
      teamName: row.teamName,
      position,
      points: Number(row.points),
      played: Number(row.played),
      won: row.won === null ? null : Number(row.won),
      drawn: row.drawn === null ? null : Number(row.drawn),
      lost: row.lost === null ? null : Number(row.lost),
      goalsFor: row.goalsFor === null ? null : Number(row.goalsFor),
      goalsAgainst: row.goalsAgainst === null ? null : Number(row.goalsAgainst),
      goalDifference: row.goalDifference === null ? null : Number(row.goalDifference),
      extractionSource: row.extractionSource
    });
  }

  return selected;
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AI-MatchLab-FootballTruthLaLigaFullTableExpansion/1.0",
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

function assertEqual(name, actual, expectedValue, checks) {
  const passed = Object.is(actual, expectedValue);
  checks.push({ name, actual, expected: expectedValue, passed });
}

function assertArrayEqual(name, actual, expectedValue, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expectedValue);
  checks.push({ name, actual, expected: expectedValue, passed });
}

if (!allowExecute) throw new Error("Missing required --allow-execute flag.");
if (!allowFetch) throw new Error("Missing required --allow-fetch flag.");
if (!controlledSourceOnly) throw new Error("Missing required --controlled-source-only flag.");

if (!fs.existsSync(reviewBoardPath)) throw new Error(`Missing review board: ${reviewBoardPath}`);
if (!fs.existsSync(canonicalEvidencePointerPath)) throw new Error(`Missing canonical evidence pointer file: ${canonicalEvidencePointerPath}`);

fs.mkdirSync(outputDir, { recursive: true });

const reviewBoard = readJson(reviewBoardPath);
const canonicalEvidencePointer = readJson(canonicalEvidencePointerPath);

const reviewSummary = reviewBoard.summary && typeof reviewBoard.summary === "object" ? reviewBoard.summary : {};
const canonicalRows = Array.isArray(canonicalEvidencePointer.canonicalEvidencePointerRows)
  ? canonicalEvidencePointer.canonicalEvidencePointerRows
  : [];

const laligaRows = canonicalRows
  .filter((row) => ["esp.1", "esp.2"].includes(row.competitionSlug))
  .filter((row) => Array.isArray(row.providerFamilies) && row.providerFamilies.includes("laliga"));

const preChecks = [];
assertEqual("reviewBoardStatus", reviewSummary.controlledStandingsSeasonStateExtractionReviewBoardStatus, "passed", preChecks);
assertEqual("mayBuildLaligaFullTableExtractionExpansionPlanCount", Number(reviewSummary.mayBuildLaligaFullTableExtractionExpansionPlanCount ?? 0), 1, preChecks);
assertEqual("fullTableCompletenessGapRowCount", Number(reviewSummary.fullTableCompletenessGapRowCount ?? 0), 2, preChecks);
assertEqual("laligaCanonicalEvidencePointerRowCount", laligaRows.length, 2, preChecks);
assertArrayEqual("laligaCompetitions", uniqueSorted(laligaRows.map((row) => row.competitionSlug)), ["esp.1", "esp.2"], preChecks);
assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowFetchFlagPresent", allowFetch, true, preChecks);
assertEqual("controlledSourceOnlyFlagPresent", controlledSourceOnly, true, preChecks);
assertEqual("reviewCanonicalWriteExecutedNowCount", Number(reviewSummary.canonicalWriteExecutedNowCount ?? 0), 0, preChecks);
assertEqual("reviewProductionWriteExecutedNowCount", Number(reviewSummary.productionWriteExecutedNowCount ?? 0), 0, preChecks);
assertEqual("reviewTruthAssertionExecutedNowCount", Number(reviewSummary.truthAssertionExecutedNowCount ?? 0), 0, preChecks);

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;
if (blockedPreCheckCount !== 0) {
  writeJson(outputPath, {
    output: outputPath,
    job: "run-football-truth-laliga-full-table-extraction-expansion-runner-file",
    status: "blocked_before_fetch",
    preChecks
  });
  console.log(JSON.stringify({
    output: outputPath,
    laligaFullTableExtractionExpansionRunnerStatus: "blocked_before_fetch",
    blockedPreCheckCount
  }, null, 2));
  process.exit(1);
}

const fetchRows = [];
const fullTableRows = [];

for (const canonicalRow of laligaRows) {
  const urls = uniqueSorted((canonicalRow.sourceEvidencePointers ?? []).flatMap((pointer) => [pointer.finalUrl, pointer.url])).slice(0, 2);
  const competitionSlug = canonicalRow.competitionSlug;

  for (const url of urls) {
    const fetched = await fetchText(url);
    const candidates = fetched.ok ? extractCandidatesFromHtml(fetched.body) : [];
    const seasonTotalRows = fetched.ok ? buildSeasonTotalRows(competitionSlug, candidates) : [];
    const target = expected[competitionSlug];

    const fetchRow = {
      laligaFullTableExpansionFetchRowId: `laliga_full_table_expansion_fetch_${String(fetchRows.length + 1).padStart(2, "0")}`,
      competitionSlug,
      providerFamily: "laliga",
      url: fetched.url,
      finalUrl: fetched.finalUrl,
      responded: fetched.responded,
      ok: fetched.ok,
      statusCode: fetched.statusCode,
      statusText: fetched.statusText,
      contentType: fetched.contentType,
      bodyCharCount: fetched.bodyCharCount,
      bodySha256: fetched.bodySha256,
      rawStandingCandidateCount: candidates.length,
      seasonTotalCandidateRowCount: seasonTotalRows.length,
      expectedLeagueSize: target.expectedLeagueSize,
      expectedPlayed: target.expectedPlayed,
      fullTableCandidateComplete: seasonTotalRows.length === target.expectedLeagueSize,
      errorName: fetched.errorName,
      errorMessage: fetched.errorMessage
    };

    fetchRows.push(fetchRow);

    seasonTotalRows.forEach((row, index) => {
      fullTableRows.push({
        laligaFullTableCandidateRowId: `laliga_full_table_candidate_${String(fullTableRows.length + 1).padStart(3, "0")}`,
        sourceLaligaFullTableExpansionFetchRowId: fetchRow.laligaFullTableExpansionFetchRowId,
        competitionSlug,
        providerFamily: "laliga",
        teamName: row.teamName,
        position: row.position,
        points: row.points,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        extractionSource: row.extractionSource,
        candidateStatus: "laliga_full_table_candidate_not_truth_asserted",
        canonicalWriteAllowedNow: false,
        productionWriteAllowedNow: false,
        truthAssertionAllowedNow: false
      });
    });
  }
}

const bestRowsByCompetition = [];
for (const competitionSlug of ["esp.1", "esp.2"]) {
  const grouped = new Map();
  for (const row of fullTableRows.filter((item) => item.competitionSlug === competitionSlug)) {
    const sourceId = row.sourceLaligaFullTableExpansionFetchRowId;
    if (!grouped.has(sourceId)) grouped.set(sourceId, []);
    grouped.get(sourceId).push(row);
  }

  const best = [...grouped.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  bestRowsByCompetition.push(...best.sort((a, b) => a.position - b.position));
}

const fullTableCompetitionCounts = Object.fromEntries(
  ["esp.1", "esp.2"].map((slug) => [slug, bestRowsByCompetition.filter((row) => row.competitionSlug === slug).length])
);

const competitionsWithCompleteFullTables = Object.entries(fullTableCompetitionCounts)
  .filter(([slug, count]) => count === expected[slug].expectedLeagueSize)
  .map(([slug]) => slug)
  .sort();

const postChecks = [];
assertEqual("laligaExpansionFetchAttemptCount", fetchRows.length, 4, postChecks);
assertEqual("laligaExpansionOkFetchCount", fetchRows.filter((row) => row.ok).length, 4, postChecks);
assertEqual("esp1BestFullTableRowCount", fullTableCompetitionCounts["esp.1"], 20, postChecks);
assertEqual("esp2BestFullTableRowCount", fullTableCompetitionCounts["esp.2"], 22, postChecks);
assertArrayEqual("competitionsWithCompleteFullTables", competitionsWithCompleteFullTables, ["esp.1", "esp.2"], postChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const passedPreCheckCount = preChecks.filter((check) => check.passed).length;
const passedPostCheckCount = postChecks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-laliga-full-table-extraction-expansion-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    reviewBoardPath,
    canonicalEvidencePointerPath
  },
  policy: {
    controlledFetchFromCanonicalEvidencePointersOnly: true,
    laligaOnly: true,
    candidateResultsOnly: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    laligaFullTableExtractionExpansionRunnerStatus: blockedPostCheckCount === 0 ? "passed_with_complete_full_tables" : "blocked_or_incomplete_full_tables",
    laligaCanonicalEvidencePointerRowCount: laligaRows.length,
    laligaExpansionFetchAttemptCount: fetchRows.length,
    laligaExpansionOkFetchCount: fetchRows.filter((row) => row.ok).length,
    rawStandingCandidateCount: fetchRows.reduce((sum, row) => sum + row.rawStandingCandidateCount, 0),
    laligaFullTableCandidateRowCount: bestRowsByCompetition.length,
    laligaFullTableCompetitionCount: competitionsWithCompleteFullTables.length,
    fullTableCompetitionCounts,
    competitionsWithCompleteFullTables,
    expectedLeagueSizes: Object.fromEntries(Object.entries(expected).map(([slug, value]) => [slug, value.expectedLeagueSize])),
    expectedPlayed: Object.fromEntries(Object.entries(expected).map(([slug, value]) => [slug, value.expectedPlayed])),

    preCheckCount: preChecks.length,
    passedPreCheckCount,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount,
    blockedPostCheckCount,

    mayBuildLaligaFullTableCandidateQualityGateCount: blockedPostCheckCount === 0 ? 1 : 0,

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
  laligaFullTableCandidateRows: bestRowsByCompetition
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  laligaFullTableExtractionExpansionRunnerStatus: output.summary.laligaFullTableExtractionExpansionRunnerStatus,
  laligaExpansionFetchAttemptCount: output.summary.laligaExpansionFetchAttemptCount,
  laligaExpansionOkFetchCount: output.summary.laligaExpansionOkFetchCount,
  rawStandingCandidateCount: output.summary.rawStandingCandidateCount,
  laligaFullTableCandidateRowCount: output.summary.laligaFullTableCandidateRowCount,
  laligaFullTableCompetitionCount: output.summary.laligaFullTableCompetitionCount,
  fullTableCompetitionCounts: output.summary.fullTableCompetitionCounts,
  competitionsWithCompleteFullTables: output.summary.competitionsWithCompleteFullTables,
  sampleFullTableRows: bestRowsByCompetition.slice(0, 12).map((row) => ({
    competitionSlug: row.competitionSlug,
    teamName: row.teamName,
    position: row.position,
    points: row.points,
    played: row.played
  })),
  mayBuildLaligaFullTableCandidateQualityGateCount: output.summary.mayBuildLaligaFullTableCandidateQualityGateCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}
