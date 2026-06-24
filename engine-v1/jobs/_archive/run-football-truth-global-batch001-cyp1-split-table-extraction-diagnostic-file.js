import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const inputPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-html-table-extraction-probe-${today}`, `football-truth-global-batch001-strict-html-table-extraction-probe-${today}.json`);
const inputRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-html-table-extraction-probe-${today}`, `football-truth-global-batch001-strict-html-table-extraction-probe-rows-${today}.jsonl`);
const inputVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-html-table-extraction-probe-verification-${today}`, `football-truth-global-batch001-strict-html-table-extraction-probe-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-cyp1-split-table-extraction-diagnostic-${today}`);
const outPath = path.join(outDir, `football-truth-global-batch001-cyp1-split-table-extraction-diagnostic-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-batch001-cyp1-split-table-extraction-diagnostic-rows-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(value) {
  return stripHtml(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripHtml(m?.[1] || "").slice(0, 180);
}

function parseIntLoose(value) {
  const s = stripHtml(value).replace(/[^\d\-+]/g, "");
  if (!s || s === "-" || s === "+") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function extractTables(html) {
  const tables = [];
  const tableRx = /<table\b[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRx.exec(html)) !== null) {
    const tableHtml = tm[0];
    const rows = [];
    const rowRx = /<tr\b[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRx.exec(tableHtml)) !== null) {
      const cells = [];
      const cellRx = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
      let cm;
      while ((cm = cellRx.exec(rm[0])) !== null) cells.push(stripHtml(cm[1]));
      if (cells.length) rows.push(cells);
    }
    tables.push({ tableIndex: tables.length, rows });
  }
  return tables;
}

function parseCfaStandingRows(table) {
  const parsedRows = [];
  for (const cells of table.rows) {
    if (cells.length < 9) continue;

    const position = parseIntLoose(cells[0]);
    const teamName = stripHtml(cells[1]);
    const played = parseIntLoose(cells[2]);
    const wins = parseIntLoose(cells[3]);
    const draws = parseIntLoose(cells[4]);
    const losses = parseIntLoose(cells[5]);
    const goalsFor = parseIntLoose(cells[6]);
    const goalsAgainst = parseIntLoose(cells[7]);
    const points = parseIntLoose(cells[8]);

    if (position == null || !teamName || played == null || wins == null || draws == null || losses == null || points == null) continue;
    if (teamName.length < 2 || /ομαδα|team|club|σωματειο/i.test(teamName)) continue;

    const goalDifference = goalsFor != null && goalsAgainst != null ? goalsFor - goalsAgainst : null;
    const playedArithmeticPassed = played === wins + draws + losses;
    const goalDifferenceArithmeticPassed = goalDifference != null ? goalDifference === goalsFor - goalsAgainst : null;
    const pointsArithmeticPassed = points === wins * 3 + draws;
    const arithmeticPassed = playedArithmeticPassed && pointsArithmeticPassed && goalDifferenceArithmeticPassed !== false;

    parsedRows.push({
      phaseTableIndex: table.tableIndex,
      position,
      teamName,
      played,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference,
      points,
      arithmeticPassed,
      playedArithmeticPassed,
      goalDifferenceArithmeticPassed,
      pointsArithmeticPassed,
      rawCells: cells
    });
  }
  return parsedRows;
}

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +cyp1-split-table-extraction)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text, error: null, timedOut: false };
  } catch (error) {
    clearTimeout(timer);
    return { response: null, text: "", error: String(error?.name || error?.message || error), timedOut: String(error?.name || "") === "AbortError" };
  }
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

const input = JSON.parse(await fs.readFile(inputPath, "utf8"));
const inputRows = parseJsonl(await fs.readFile(inputRowsPath, "utf8"));
const inputVerification = JSON.parse(await fs.readFile(inputVerificationPath, "utf8"));

if (input.status !== "passed") blocks.push("input_not_passed");
if (inputVerification.status !== "passed") blocks.push("input_verification_not_passed");

const cypInput = inputRows.find(row => row.slug === "cyp.1");
if (!cypInput) blocks.push("missing_cyp1_input_row");
if (cypInput && cypInput.extractionProbeStatus !== "extraction_review_required") blocks.push("cyp1_not_in_extraction_review_required");

const rows = [];
let fetchCount = 0;

if (allowFetch && blocks.length === 0) {
  const url = cypInput.finalUrl || cypInput.sourceFinalUrl;
  console.log(`[1/1] cyp.1 split-table ${url}`);

  const fetched = await fetchWithTimeout(url);
  fetchCount += 1;

  const html = fetched.text || "";
  const tables = extractTables(html);
  const tableResults = tables.map(table => {
    const standingRows = parseCfaStandingRows(table);
    return {
      tableIndex: table.tableIndex,
      tableRowCount: table.rows.length,
      tableMaxCellCount: Math.max(0, ...table.rows.map(row => row.length)),
      standingRowCount: standingRows.length,
      sampleRawRows: table.rows.slice(0, 5),
      standingRows
    };
  });

  const combinedStandingRows = tableResults.flatMap(table => table.standingRows);
  const duplicateTeamNameCount = combinedStandingRows.length - new Set(combinedStandingRows.map(row => norm(row.teamName))).size;
  const arithmeticPassedRowCount = combinedStandingRows.filter(row => row.arithmeticPassed).length;
  const arithmeticFailedRowCount = combinedStandingRows.filter(row => row.arithmeticPassed === false).length;
  const playedValues = combinedStandingRows.map(row => row.played).filter(value => value != null);
  const pointsValues = combinedStandingRows.map(row => row.points).filter(value => value != null);
  const minPlayed = playedValues.length ? Math.min(...playedValues) : null;
  const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
  const minPoints = pointsValues.length ? Math.min(...pointsValues) : null;
  const maxPoints = pointsValues.length ? Math.max(...pointsValues) : null;

  let customExtractionStatus = "custom_split_table_no_proof";
  if (
    combinedStandingRows.length >= 10 &&
    duplicateTeamNameCount === 0 &&
    arithmeticPassedRowCount >= Math.ceil(combinedStandingRows.length * 0.8) &&
    maxPlayed != null &&
    maxPlayed > 0
  ) {
    customExtractionStatus = "custom_split_table_proof_shape_passed_nonzero_needs_season_phase_review";
  } else if (combinedStandingRows.length >= 6 && arithmeticPassedRowCount === combinedStandingRows.length && duplicateTeamNameCount === 0) {
    customExtractionStatus = "custom_split_table_partial_phase_review_required";
  }

  rows.push({
    slug: "cyp.1",
    sourceFinalUrl: url,
    finalUrl: fetched.response?.url || url,
    fetchStatus: fetched.response?.status ?? null,
    title: titleOf(html),
    bodyLength: html.length,
    bodySha256: html ? shaText(html) : null,
    fetchError: fetched.error,
    timedOut: fetched.timedOut,
    tableCount: tables.length,
    tableResults: tableResults.map(table => ({
      tableIndex: table.tableIndex,
      tableRowCount: table.tableRowCount,
      tableMaxCellCount: table.tableMaxCellCount,
      standingRowCount: table.standingRowCount,
      sampleRawRows: table.sampleRawRows,
      sampleStandingRows: table.standingRows.slice(0, 4)
    })),
    combinedStandingRowCount: combinedStandingRows.length,
    arithmeticPassedRowCount,
    arithmeticFailedRowCount,
    duplicateTeamNameCount,
    minPlayed,
    maxPlayed,
    minPoints,
    maxPoints,
    customExtractionStatus,
    sampleCombinedStandingRows: combinedStandingRows.slice(0, 12),
    combinedStandingRows,
    acceptedNow: false,
    canonicalWriteExecutedNow: false,
    lifecycleWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  });
}

const statusCounts = rows.reduce((acc, row) => {
  acc[row.customExtractionStatus] = (acc[row.customExtractionStatus] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "global_batch001_cyp1_split_table_extraction_diagnostic",
  contractVersion: 1,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputPath: rel(inputPath),
  inputRowsPath: rel(inputRowsPath),
  inputVerificationPath: rel(inputVerificationPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchCount,
    controlledSplitTableFetchExecutedNowCount: fetchCount,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    targetCount: 1,
    attemptedFetchCount: fetchCount,
    customExtractionStatusCounts: statusCounts,
    proofShapePassedNonzeroSlugs: rows.filter(row => row.customExtractionStatus === "custom_split_table_proof_shape_passed_nonzero_needs_season_phase_review").map(row => row.slug),
    partialPhaseReviewRequiredSlugs: rows.filter(row => row.customExtractionStatus === "custom_split_table_partial_phase_review_required").map(row => row.slug),
    noProofSlugs: rows.filter(row => row.customExtractionStatus === "custom_split_table_no_proof").map(row => row.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "if proof-shape passed, run season/phase identity review; if partial phase only, park as non-countable split-phase evidence"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: rows.map(row => ({
    slug: row.slug,
    customExtractionStatus: row.customExtractionStatus,
    fetchStatus: row.fetchStatus,
    title: row.title,
    tableCount: row.tableCount,
    tableResults: row.tableResults,
    combinedStandingRowCount: row.combinedStandingRowCount,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    arithmeticFailedRowCount: row.arithmeticFailedRowCount,
    duplicateTeamNameCount: row.duplicateTeamNameCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    minPoints: row.minPoints,
    maxPoints: row.maxPoints,
    sampleCombinedStandingRows: row.sampleCombinedStandingRows.slice(0, 8)
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
