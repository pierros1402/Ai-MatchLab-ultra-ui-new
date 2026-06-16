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
  "norway-ntf-html-table-parser-plan-2026-06-15",
  "norway-ntf-html-table-parser-plan-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-controlled-html-table-parser-runner-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "norway-ntf-controlled-html-table-parser-runner-2026-06-15.json"
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
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("\\u0022", '"')
    .replaceAll("\\u0026", "&")
    .replaceAll("\\/", "/");
}

function host(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function isTrustedParserUrl(url) {
  return /^(www\.)?(eliteserien\.no|obos-ligaen\.no)$/i.test(host(url)) && /\/tabell\/?$/i.test(new URL(url).pathname);
}

function asInt(value) {
  const text = String(value ?? "").trim().replace(/\s+/g, "");
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  return null;
}

function cleanCellHtml(html) {
  return htmlDecode(String(html ?? ""))
    .replace(/<img\b[^>]*\balt=["']([^"']+)["'][^>]*>/gi, " $1 ")
    .replace(/<[^>]+\baria-label=["']([^"']+)["'][^>]*>/gi, " $1 ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:span|div|p|strong|em|a)>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTeamName(value) {
  return String(value ?? "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^\d+\s+/, "")
    .replace(/\s+\d+$/, "")
    .replace(/\b(?:form|logo|crest|klubb|lag)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeHeader(cells) {
  const text = cells.join(" ").toLowerCase();
  return /(lag|klubb|spilt|vunnet|uavgjort|tap|poeng|mål|målforskjell|position|team|played|points)/i.test(text);
}

function looksLikeTeamCell(text) {
  const cleaned = normalizeTeamName(text);
  if (cleaned.length < 2 || cleaned.length > 80) return false;
  if (!/[A-Za-zÆØÅæøå]/.test(cleaned)) return false;
  if (/^(form|poeng|spilt|vunnet|uavgjort|tap|mål|lag|klubb|table|tabell|position|points)$/i.test(cleaned)) return false;
  if (/^-?\d+([-\s]+-?\d+)*$/.test(cleaned)) return false;
  return true;
}

function parseGoalPair(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,3})\s*[-–]\s*(\d{1,3})$/);
  if (!match) return null;
  return { goalsFor: Number(match[1]), goalsAgainst: Number(match[2]) };
}

function parseTableRows(tableHtml, competitionSlug, sourceFetchRowId, tableOrdinal) {
  const rows = [];
  const trMatches = [...String(tableHtml ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const [rowIndex, trMatch] of trMatches.entries()) {
    const cellMatches = [...trMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)];
    const cells = cellMatches.map((match) => cleanCellHtml(match[1])).filter((cell) => cell.length > 0);

    if (cells.length < 3) continue;
    if (looksLikeHeader(cells)) continue;

    const teamIndex = cells.findIndex((cell, index) => index !== 0 && looksLikeTeamCell(cell));
    const fallbackTeamIndex = teamIndex >= 0 ? teamIndex : cells.findIndex((cell) => looksLikeTeamCell(cell));
    if (fallbackTeamIndex < 0) continue;

    const teamName = normalizeTeamName(cells[fallbackTeamIndex]);
    const firstCellPosition = asInt(cells[0]);
    const position = firstCellPosition !== null && firstCellPosition >= 1 && firstCellPosition <= 30 ? firstCellPosition : null;

    const numericValues = [];
    let goalsFor = null;
    let goalsAgainst = null;

    for (const [cellIndex, cell] of cells.entries()) {
      if (cellIndex === fallbackTeamIndex) continue;

      const goalPair = parseGoalPair(cell);
      if (goalPair && goalsFor === null && goalsAgainst === null) {
        goalsFor = goalPair.goalsFor;
        goalsAgainst = goalPair.goalsAgainst;
      }

      const exact = asInt(cell);
      if (exact !== null) numericValues.push({ cellIndex, value: exact });
    }

    const statsNumbers = [...numericValues];
    if (position !== null && statsNumbers.length > 0 && statsNumbers[0].value === position) {
      statsNumbers.shift();
    }

    let played = null;
    let won = null;
    let drawn = null;
    let lost = null;
    let goalDifference = null;
    let points = null;

    if (statsNumbers.length >= 5) {
      played = statsNumbers[0]?.value ?? null;
      won = statsNumbers[1]?.value ?? null;
      drawn = statsNumbers[2]?.value ?? null;
      lost = statsNumbers[3]?.value ?? null;
      points = statsNumbers.at(-1)?.value ?? null;

      if (statsNumbers.length >= 6) {
        goalDifference = statsNumbers.at(-2)?.value ?? null;
      }
    } else if (statsNumbers.length >= 2) {
      played = statsNumbers[0]?.value ?? null;
      points = statsNumbers.at(-1)?.value ?? null;
    }

    if (!teamName || position === null || points === null) continue;

    rows.push({
      norwayNtfStandingCandidateRowId: "pending",
      sourceNorwayNtfHtmlTableParserFetchRowId: sourceFetchRowId,
      competitionSlug,
      providerFamily: "norway_ntf",
      parserStrategy: "html_table_tr_td_parser",
      tableOrdinal,
      sourceRowOrdinal: rowIndex + 1,
      teamName,
      position,
      points,
      played,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      goalDifference,
      rawCells: cells,
      candidateStatus: "standing_candidate_not_truth_asserted",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    });
  }

  return rows;
}

function parseFallbackTextRows(html, competitionSlug, sourceFetchRowId) {
  const prepared = htmlDecode(String(html ?? ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(?:tr|li|div|p)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*(\d{1,2}\.)\s*/g, "\n$1 ")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = [];

  for (const [index, line] of prepared.entries()) {
    const match = line.match(/^(\d{1,2})\.?\s+([A-Za-zÆØÅæøå][A-Za-zÆØÅæøå0-9 .'\-]{2,60}?)\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{1,2})\s+(?:\d{1,3}\s*[-–]\s*\d{1,3}\s+)?(-?\d{1,3})?\s+(\d{1,3})(?:\s|$)/);
    if (!match) continue;

    const teamName = normalizeTeamName(match[2]);
    if (!looksLikeTeamCell(teamName)) continue;

    rows.push({
      norwayNtfStandingCandidateRowId: "pending",
      sourceNorwayNtfHtmlTableParserFetchRowId: sourceFetchRowId,
      competitionSlug,
      providerFamily: "norway_ntf",
      parserStrategy: "visible_text_line_parser",
      tableOrdinal: null,
      sourceRowOrdinal: index + 1,
      teamName,
      position: Number(match[1]),
      played: Number(match[3]),
      won: Number(match[4]),
      drawn: Number(match[5]),
      lost: Number(match[6]),
      goalDifference: match[7] === undefined ? null : Number(match[7]),
      points: Number(match[8]),
      goalsFor: null,
      goalsAgainst: null,
      rawCells: [line],
      candidateStatus: "standing_candidate_not_truth_asserted",
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    });
  }

  return rows;
}

function dedupeStandingRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows.sort((a, b) => {
    if (a.competitionSlug !== b.competitionSlug) return a.competitionSlug.localeCompare(b.competitionSlug);
    if (Number(a.position) !== Number(b.position)) return Number(a.position) - Number(b.position);
    return String(a.teamName).localeCompare(String(b.teamName));
  })) {
    const key = `${row.competitionSlug}|${row.position}|${row.teamName}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out.map((row, index) => ({
    ...row,
    norwayNtfStandingCandidateRowId: `norway_ntf_standing_candidate_${String(index + 1).padStart(3, "0")}`
  }));
}

function extractStandingCandidates(html, competitionSlug, sourceFetchRowId) {
  const tables = [...String(html ?? "").matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map((match) => match[0]);
  const tableCandidateRows = tables.flatMap((tableHtml, index) => parseTableRows(tableHtml, competitionSlug, sourceFetchRowId, index + 1));
  const fallbackRows = tableCandidateRows.length > 0 ? [] : parseFallbackTextRows(html, competitionSlug, sourceFetchRowId);

  return {
    tableCount: tables.length,
    tableCandidateRows,
    fallbackRows,
    standingCandidateRows: dedupeStandingRows([...tableCandidateRows, ...fallbackRows])
  };
}

function htmlTableSignals(html) {
  const decoded = htmlDecode(String(html ?? ""));
  const tableCount = (decoded.match(/<table\b/gi) ?? []).length;
  const tableLike = tableCount > 0 || /class=["'][^"']*(table|standing|tabell|league-table)[^"']*["']/i.test(decoded);

  const textOnly = decoded
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const markers = ["tabell", "poeng", "spilt", "vunnet", "uavgjort", "tap", "mål", "Eliteserien", "OBOS-ligaen"]
    .filter((marker) => textOnly.toLowerCase().includes(marker.toLowerCase()));

  return { tableCount, tableLike, markerCount: markers.length, markers };
}

async function fetchText(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "AI-MatchLab-FootballTruthNorwayNtfHtmlTableParser/1.0",
        "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8"
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
if (!fs.existsSync(sourcePath)) throw new Error(`Missing Norway NTF HTML table parser plan: ${sourcePath}`);

fs.mkdirSync(outputDir, { recursive: true });

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const parserPlanRows = Array.isArray(source.parserPlanRows) ? source.parserPlanRows : [];

const preChecks = [];
assertEqual("sourceParserPlanStatus", summary.norwayNtfHtmlTableParserPlanStatus, "passed", preChecks);
assertEqual("sourceMayBuildParserRunnerCount", Number(summary.mayBuildNorwayNtfControlledHtmlTableParserRunnerCount ?? 0), 1, preChecks);
assertEqual("parserPlanRowCount", parserPlanRows.length, 2, preChecks);
assertArrayEqual("parserPlanCompetitions", uniqueSorted(parserPlanRows.map((row) => row.competitionSlug)), expectedCompetitions, preChecks);
assertAll("parserPlanRowsReady", parserPlanRows, (row) => row.planStatus === "ready_for_controlled_html_table_parser_runner", preChecks);
assertAll("parserInputUrlsTrusted", parserPlanRows, (row) => isTrustedParserUrl(row.parserInputUrl), preChecks);
assertAll("parserPlanRowsKeepWritesBlocked", parserPlanRows, (row) => row.canonicalWriteAllowedNext === false && row.productionWriteAllowedNext === false && row.truthAssertionAllowedNext === false, preChecks);
assertEqual("allowExecuteFlagPresent", allowExecute, true, preChecks);
assertEqual("allowFetchFlagPresent", allowFetch, true, preChecks);
assertEqual("controlledSourceOnlyFlagPresent", controlledSourceOnly, true, preChecks);

const blockedPreCheckCount = preChecks.filter((check) => !check.passed).length;
if (blockedPreCheckCount !== 0) {
  writeJson(outputPath, {
    output: outputPath,
    job: "run-football-truth-norway-ntf-controlled-html-table-parser-runner-file",
    status: "blocked_before_fetch",
    preChecks
  });
  console.log(JSON.stringify({ output: outputPath, norwayNtfControlledHtmlTableParserRunnerStatus: "blocked_before_fetch", blockedPreCheckCount }, null, 2));
  process.exit(1);
}

const fetchRows = [];
const htmlTableSignalRows = [];
let standingCandidateRows = [];
const rawTableCandidateRows = [];
const fallbackCandidateRows = [];

for (const planRow of parserPlanRows) {
  const fetched = await fetchText(planRow.parserInputUrl);

  const fetchRow = {
    norwayNtfHtmlTableParserFetchRowId: `norway_ntf_html_table_parser_fetch_${String(fetchRows.length + 1).padStart(2, "0")}`,
    sourceNorwayNtfHtmlTableParserPlanRowId: planRow.norwayNtfHtmlTableParserPlanRowId,
    competitionSlug: planRow.competitionSlug,
    providerFamily: planRow.providerFamily,
    parserInputUrl: planRow.parserInputUrl,
    finalUrl: fetched.finalUrl,
    responded: fetched.responded,
    ok: fetched.ok,
    statusCode: fetched.statusCode,
    statusText: fetched.statusText,
    contentType: fetched.contentType,
    bodyCharCount: fetched.bodyCharCount,
    bodySha256: fetched.bodySha256,
    errorName: fetched.errorName,
    errorMessage: fetched.errorMessage
  };

  fetchRows.push(fetchRow);

  if (fetched.ok) {
    const signals = htmlTableSignals(fetched.body);
    htmlTableSignalRows.push({
      norwayNtfHtmlTableParserSignalRowId: `norway_ntf_html_table_parser_signal_${String(htmlTableSignalRows.length + 1).padStart(2, "0")}`,
      sourceNorwayNtfHtmlTableParserFetchRowId: fetchRow.norwayNtfHtmlTableParserFetchRowId,
      competitionSlug: planRow.competitionSlug,
      url: fetched.finalUrl ?? fetched.url,
      ...signals,
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    });

    const extracted = extractStandingCandidates(fetched.body, planRow.competitionSlug, fetchRow.norwayNtfHtmlTableParserFetchRowId);
    rawTableCandidateRows.push(...extracted.tableCandidateRows);
    fallbackCandidateRows.push(...extracted.fallbackRows);
    standingCandidateRows.push(...extracted.standingCandidateRows);
  }
}

standingCandidateRows = dedupeStandingRows(standingCandidateRows);
const competitionsWithOkFetch = uniqueSorted(fetchRows.filter((row) => row.ok).map((row) => row.competitionSlug));
const competitionsWithTableSignals = uniqueSorted(htmlTableSignalRows.filter((row) => row.tableLike && row.markerCount >= 6).map((row) => row.competitionSlug));
const competitionsWithStandingCandidates = uniqueSorted(standingCandidateRows.map((row) => row.competitionSlug));

const postChecks = [];
assertEqual("htmlTableParserFetchAttemptCount", fetchRows.length, 2, postChecks);
assertEqual("htmlTableParserOkFetchCount", fetchRows.filter((row) => row.ok).length, 2, postChecks);
assertArrayEqual("competitionsWithOkFetch", competitionsWithOkFetch, expectedCompetitions, postChecks);
assertArrayEqual("competitionsWithTableSignals", competitionsWithTableSignals, expectedCompetitions, postChecks);
assertEqual("standingCandidateRowsPresent", standingCandidateRows.length > 0, true, postChecks);
assertArrayEqual("competitionsWithStandingCandidates", competitionsWithStandingCandidates, expectedCompetitions, postChecks);
assertAll("standingCandidatesAreNotTruthAssertions", standingCandidateRows, (row) => row.candidateStatus === "standing_candidate_not_truth_asserted", postChecks);
assertAll("standingCandidatesKeepCanonicalWriteBlocked", standingCandidateRows, (row) => row.canonicalWriteAllowedNow === false, postChecks);
assertAll("standingCandidatesKeepProductionWriteBlocked", standingCandidateRows, (row) => row.productionWriteAllowedNow === false, postChecks);
assertAll("standingCandidatesKeepTruthAssertionBlocked", standingCandidateRows, (row) => row.truthAssertionAllowedNow === false, postChecks);
assertEqual("productionWriteExecutedNowCount", 0, 0, postChecks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, postChecks);

const blockedPostCheckCount = postChecks.filter((check) => !check.passed).length;
const passedPreCheckCount = preChecks.filter((check) => check.passed).length;
const passedPostCheckCount = postChecks.filter((check) => check.passed).length;

const status = blockedPostCheckCount !== 0
  ? "blocked_after_html_table_parser_validation"
  : "passed_with_standing_candidates";

const output = {
  output: outputPath,
  job: "run-football-truth-norway-ntf-controlled-html-table-parser-runner-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    controlledFetchFromParserPlanUrlsOnly: true,
    parserInputCount: parserPlanRows.length,
    norwayNtfOnly: true,
    standingsCandidateExtractionOnly: true,
    searchAllowed: false,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    norwayNtfControlledHtmlTableParserRunnerStatus: status,
    parserPlanReadCount: 1,

    parserInputRowCount: parserPlanRows.length,
    htmlTableParserFetchAttemptCount: fetchRows.length,
    htmlTableParserOkFetchCount: fetchRows.filter((row) => row.ok).length,
    htmlTableSignalRowCount: htmlTableSignalRows.length,
    rawTableCandidateRowCount: rawTableCandidateRows.length,
    fallbackCandidateRowCount: fallbackCandidateRows.length,
    standingCandidateRowCount: standingCandidateRows.length,
    standingCandidateCompetitionCount: competitionsWithStandingCandidates.length,

    competitionsWithOkFetch,
    competitionsWithTableSignals,
    competitionsWithStandingCandidates,
    standingCandidateRowsByCompetition: countBy(standingCandidateRows, "competitionSlug"),
    standingCandidateRowsByParserStrategy: countBy(standingCandidateRows, "parserStrategy"),

    preCheckCount: preChecks.length,
    passedPreCheckCount,
    blockedPreCheckCount,
    postCheckCount: postChecks.length,
    passedPostCheckCount,
    blockedPostCheckCount,

    mayBuildNorwayNtfStandingCandidateQualityGateCount: blockedPostCheckCount === 0 ? 1 : 0,

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
  htmlTableSignalRows,
  rawTableCandidateRows,
  fallbackCandidateRows,
  standingCandidateRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  norwayNtfControlledHtmlTableParserRunnerStatus: output.summary.norwayNtfControlledHtmlTableParserRunnerStatus,
  htmlTableParserFetchAttemptCount: output.summary.htmlTableParserFetchAttemptCount,
  htmlTableParserOkFetchCount: output.summary.htmlTableParserOkFetchCount,
  htmlTableSignalRowCount: output.summary.htmlTableSignalRowCount,
  rawTableCandidateRowCount: output.summary.rawTableCandidateRowCount,
  fallbackCandidateRowCount: output.summary.fallbackCandidateRowCount,
  standingCandidateRowCount: output.summary.standingCandidateRowCount,
  standingCandidateCompetitionCount: output.summary.standingCandidateCompetitionCount,
  standingCandidateRowsByCompetition: output.summary.standingCandidateRowsByCompetition,
  standingCandidateRowsByParserStrategy: output.summary.standingCandidateRowsByParserStrategy,
  sampleStandingCandidates: standingCandidateRows.slice(0, 16).map((row) => ({
    competitionSlug: row.competitionSlug,
    position: row.position,
    teamName: row.teamName,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    points: row.points,
    parserStrategy: row.parserStrategy
  })),
  mayBuildNorwayNtfStandingCandidateQualityGateCount: output.summary.mayBuildNorwayNtfStandingCandidateQualityGateCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPostCheckCount !== 0) {
  process.exitCode = 1;
}
