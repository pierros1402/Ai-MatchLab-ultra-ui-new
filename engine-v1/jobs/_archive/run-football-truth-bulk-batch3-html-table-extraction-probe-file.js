import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const inputPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-route-candidate-identity-surface-probe-${today}`, `bulk-batch3-route-candidate-identity-surface-probe-${today}.json`);
const inputRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-route-candidate-identity-surface-probe-${today}`, `bulk-batch3-route-candidate-identity-surface-probe-rows-${today}.jsonl`);
const inputVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-route-candidate-identity-surface-probe-verification-${today}`, `bulk-batch3-route-candidate-identity-surface-probe-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch3-html-table-extraction-probe-${today}`);
const outPath = path.join(outDir, `bulk-batch3-html-table-extraction-probe-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch3-html-table-extraction-probe-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&aacute;/gi, "á")
    .replace(/&eacute;/gi, "é")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
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

function extractTables(html) {
  const tables = [];
  const tableRegex = /<table\b[\s\S]*?<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[0];
    const rows = [];
    const rowRegex = /<tr\b[\s\S]*?<\/tr>/gi;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[0];
      const cells = [];
      const cellRegex = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        cells.push(stripHtml(cellMatch[1]));
      }
      if (cells.length > 0) rows.push(cells);
    }
    tables.push({ tableIndex: tables.length, tableHtml, rows });
  }
  return tables;
}

function parseIntLoose(value) {
  const s = stripHtml(value).replace(/[^\d\-+]/g, "");
  if (!s || s === "-" || s === "+") return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function headerScore(cells) {
  const joined = norm(cells.join(" "));
  let score = 0;
  for (const pattern of [
    /\b(pos|position|rank|no|#)\b/,
    /\b(club|team|equipo|equipos|clubes|institution|institucion)\b/,
    /\b(pj|j|mp|played|partidos)\b/,
    /\b(pg|g|w|wins|ganados)\b/,
    /\b(pe|e|d|draws|empatados)\b/,
    /\b(pp|p|l|losses|perdidos)\b/,
    /\b(gf|gc|ga|dg|gd|dif|diff)\b/,
    /\b(pts|points|puntos|ptos)\b/
  ]) {
    if (pattern.test(joined)) score += 1;
  }
  return score;
}

function buildColumnMap(headerCells, fallbackWidth) {
  const map = {};
  const normalized = headerCells.map(cell => norm(cell));

  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i];

    if (map.position == null && /^(pos|position|rank|#|no|nro|num)/.test(h)) map.position = i;
    if (map.team == null && /(club|team|equipo|equipos|clubes|institucion|institution|nombre)/.test(h)) map.team = i;
    if (map.played == null && /^(pj|j|mp|played|partidos|p\.?j\.?)$/.test(h)) map.played = i;
    if (map.wins == null && /^(pg|g|w|wins|ganados|victorias)$/.test(h)) map.wins = i;
    if (map.draws == null && /^(pe|e|d|draws|empatados|empates)$/.test(h)) map.draws = i;
    if (map.losses == null && /^(pp|p|l|losses|perdidos|derrotas)$/.test(h)) map.losses = i;
    if (map.goalsFor == null && /^(gf|favor|goles favor|goals for)$/.test(h)) map.goalsFor = i;
    if (map.goalsAgainst == null && /^(gc|ga|contra|goles contra|goals against)$/.test(h)) map.goalsAgainst = i;
    if (map.goalDifference == null && /^(dg|gd|dif|diff|diferencia)$/.test(h)) map.goalDifference = i;
    if (map.points == null && /^(pts|points|puntos|ptos|pnts)$/.test(h)) map.points = i;
  }

  if (map.position == null && fallbackWidth >= 2) map.position = 0;
  if (map.team == null && fallbackWidth >= 2) map.team = 1;

  return map;
}

function extractRowsFromTable(table) {
  const rows = table.rows;
  if (!rows.length) return { headerRowIndex: null, columnMap: {}, standingsRows: [] };

  let headerRowIndex = rows.findIndex(cells => headerScore(cells) >= 3);
  if (headerRowIndex < 0) {
    headerRowIndex = rows.findIndex(cells => cells.length >= 5 && cells.filter(cell => parseIntLoose(cell) == null).length >= 3);
  }
  if (headerRowIndex < 0) headerRowIndex = 0;

  const fallbackWidth = Math.max(...rows.map(row => row.length));
  const columnMap = buildColumnMap(rows[headerRowIndex] || [], fallbackWidth);
  const dataRows = rows.slice(headerRowIndex + 1);

  const standingsRows = [];

  for (const cells of dataRows) {
    if (cells.length < 4) continue;

    let position = columnMap.position != null ? parseIntLoose(cells[columnMap.position]) : null;
    let teamName = columnMap.team != null ? stripHtml(cells[columnMap.team]) : "";

    if (!teamName || /^\d+$/.test(teamName)) {
      const teamCellIndex = cells.findIndex((cell, index) => index !== columnMap.position && parseIntLoose(cell) == null && stripHtml(cell).length >= 2);
      if (teamCellIndex >= 0) teamName = stripHtml(cells[teamCellIndex]);
    }

    const numericCells = cells.map(parseIntLoose).filter(value => value != null);
    if (position == null && numericCells.length > 0) position = numericCells[0];

    let played = columnMap.played != null ? parseIntLoose(cells[columnMap.played]) : null;
    let wins = columnMap.wins != null ? parseIntLoose(cells[columnMap.wins]) : null;
    let draws = columnMap.draws != null ? parseIntLoose(cells[columnMap.draws]) : null;
    let losses = columnMap.losses != null ? parseIntLoose(cells[columnMap.losses]) : null;
    let goalsFor = columnMap.goalsFor != null ? parseIntLoose(cells[columnMap.goalsFor]) : null;
    let goalsAgainst = columnMap.goalsAgainst != null ? parseIntLoose(cells[columnMap.goalsAgainst]) : null;
    let goalDifference = columnMap.goalDifference != null ? parseIntLoose(cells[columnMap.goalDifference]) : null;
    let points = columnMap.points != null ? parseIntLoose(cells[columnMap.points]) : null;

    if (played == null && numericCells.length >= 6) {
      const start = position != null && numericCells[0] === position ? 1 : 0;
      played = numericCells[start] ?? null;
      wins = numericCells[start + 1] ?? null;
      draws = numericCells[start + 2] ?? null;
      losses = numericCells[start + 3] ?? null;
      goalsFor = numericCells[start + 4] ?? null;
      goalsAgainst = numericCells[start + 5] ?? null;
      if (numericCells.length - start >= 8) {
        goalDifference = numericCells[start + 6] ?? null;
        points = numericCells[start + 7] ?? null;
      } else {
        points = numericCells[numericCells.length - 1] ?? null;
        if (goalsFor != null && goalsAgainst != null) goalDifference = goalsFor - goalsAgainst;
      }
    }

    teamName = teamName.replace(/\s+/g, " ").trim();
    if (!teamName || teamName.length < 2) continue;
    if (/(pos|position|club|team|equipo|pts|points|puntos)/i.test(teamName) && numericCells.length < 4) continue;

    const playedArithmeticPassed = played != null && wins != null && draws != null && losses != null ? played === wins + draws + losses : null;
    const goalDifferenceArithmeticPassed = goalsFor != null && goalsAgainst != null && goalDifference != null ? goalDifference === goalsFor - goalsAgainst : null;
    const pointsArithmeticPassed = wins != null && draws != null && points != null ? points === wins * 3 + draws : null;

    const arithmeticPassed =
      playedArithmeticPassed !== false &&
      goalDifferenceArithmeticPassed !== false &&
      pointsArithmeticPassed !== false &&
      (playedArithmeticPassed === true || goalDifferenceArithmeticPassed === true || pointsArithmeticPassed === true);

    standingsRows.push({
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

  return { headerRowIndex, columnMap, standingsRows };
}

function scoreTable(table, extraction) {
  const rowCount = table.rows.length;
  const maxCellCount = Math.max(0, ...table.rows.map(row => row.length));
  const headerMaxScore = Math.max(0, ...table.rows.map(headerScore));
  const extractedCount = extraction.standingsRows.length;
  const arithmeticPassedCount = extraction.standingsRows.filter(row => row.arithmeticPassed).length;
  const nonzeroPlayedCount = extraction.standingsRows.filter(row => Number(row.played || 0) > 0).length;
  const pointRows = extraction.standingsRows.filter(row => row.points != null).length;

  let score = 0;
  score += Math.min(rowCount, 30) * 2;
  score += Math.min(maxCellCount, 12) * 3;
  score += headerMaxScore * 20;
  score += extractedCount * 10;
  score += arithmeticPassedCount * 12;
  score += nonzeroPlayedCount * 8;
  score += pointRows * 4;
  if (extractedCount >= 8) score += 50;
  if (nonzeroPlayedCount >= 6) score += 40;

  return { score, rowCount, maxCellCount, headerMaxScore, extractedCount, arithmeticPassedCount, nonzeroPlayedCount, pointRows };
}

async function fetchWithTimeout(url, timeoutMs = 14000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +batch3-html-table-extraction-probe)",
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

if (inputVerification.status !== "passed") blocks.push("input_verification_not_passed");

const readySlugs = input.summary?.htmlTableExtractionProbeReadySlugs || [];
const sourceRows = inputRows.filter(row => readySlugs.includes(row.slug));
if (readySlugs.length !== 8) blocks.push("ready_slug_count_not_8");
if (sourceRows.length !== 8) blocks.push("source_rows_count_not_8");

const rows = [];
let fetchCount = 0;

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const sourceRow of sourceRows) {
    index += 1;
    const url = sourceRow.finalUrl || sourceRow.sourceSelectedFinalUrl || sourceRow.sourceSelectedUrl;
    console.log(`[${index}/${sourceRows.length}] extract ${sourceRow.slug} ${url}`);
    const fetched = await fetchWithTimeout(url);
    fetchCount += 1;

    const html = fetched.text || "";
    const tables = extractTables(html);
    const tableCandidates = tables.map(table => {
      const extraction = extractRowsFromTable(table);
      return { table, extraction, metrics: scoreTable(table, extraction) };
    }).sort((a, b) => b.metrics.score - a.metrics.score);

    const selected = tableCandidates[0] || null;
    const standingsRows = selected?.extraction?.standingsRows || [];
    const duplicateTeamNameCount = standingsRows.length - new Set(standingsRows.map(row => norm(row.teamName))).size;
    const arithmeticPassedCount = standingsRows.filter(row => row.arithmeticPassed).length;
    const arithmeticFailedCount = standingsRows.filter(row => row.arithmeticPassed === false).length;
    const playedValues = standingsRows.map(row => row.played).filter(value => value != null);
    const pointsValues = standingsRows.map(row => row.points).filter(value => value != null);
    const minPlayed = playedValues.length ? Math.min(...playedValues) : null;
    const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
    const allRowsZeroPlayed = standingsRows.length > 0 && playedValues.length === standingsRows.length && playedValues.every(value => value === 0);
    const allRowsZeroPoints = standingsRows.length > 0 && pointsValues.length === standingsRows.length && pointsValues.every(value => value === 0);

    let extractionProbeStatus = "no_extractable_standings_table_found";
    if (standingsRows.length >= 8 && duplicateTeamNameCount === 0 && arithmeticPassedCount >= Math.ceil(standingsRows.length * 0.7) && maxPlayed != null && maxPlayed > 0) {
      extractionProbeStatus = "proof_shape_passed_nonzero_standings_needs_season_review";
    } else if (standingsRows.length >= 8 && duplicateTeamNameCount === 0 && allRowsZeroPlayed && allRowsZeroPoints) {
      extractionProbeStatus = "proof_shape_passed_zero_played_table_needs_start_date_lane";
    } else if (standingsRows.length >= 6) {
      extractionProbeStatus = "extraction_review_required";
    }

    rows.push({
      slug: sourceRow.slug,
      displayName: sourceRow.displayName,
      sourceFinalUrl: url,
      fetchStatus: fetched.response?.status ?? null,
      finalUrl: fetched.response?.url || url,
      title: titleOf(html),
      bodyLength: html.length,
      bodySha256: html ? shaText(html) : null,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      tableCount: tables.length,
      selectedTableIndex: selected?.table?.tableIndex ?? null,
      selectedTableRowCount: selected?.metrics?.rowCount ?? 0,
      selectedTableMaxCellCount: selected?.metrics?.maxCellCount ?? 0,
      selectedHeaderMaxScore: selected?.metrics?.headerMaxScore ?? 0,
      extractedStandingRowCount: standingsRows.length,
      arithmeticPassedRowCount: arithmeticPassedCount,
      arithmeticFailedRowCount: arithmeticFailedCount,
      duplicateTeamNameCount,
      minPlayed,
      maxPlayed,
      allRowsZeroPlayed,
      allRowsZeroPoints,
      extractionProbeStatus,
      selectedTableSampleRows: (selected?.table?.rows || []).slice(0, 6).map((cells, rowIndex) => ({ rowIndex, cells })),
      sampleStandingsRows: standingsRows.slice(0, 8),
      standingsRows,
      acceptedNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    });
  }
}

const statusCounts = rows.reduce((acc, row) => {
  acc[row.extractionProbeStatus] = (acc[row.extractionProbeStatus] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch3_html_table_extraction_probe",
  contractVersion: 1,
  batchIndex: 3,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputPath: rel(inputPath),
  inputRowsPath: rel(inputRowsPath),
  inputVerificationPath: rel(inputVerificationPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchCount,
    controlledHtmlTableExtractionFetchExecutedNowCount: fetchCount,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex: 3,
    targetCount: sourceRows.length,
    attemptedFetchCount: fetchCount,
    extractionProbeStatusCounts: statusCounts,
    proofShapePassedNonzeroSlugs: rows.filter(row => row.extractionProbeStatus === "proof_shape_passed_nonzero_standings_needs_season_review").map(row => row.slug),
    proofShapePassedZeroPlayedSlugs: rows.filter(row => row.extractionProbeStatus === "proof_shape_passed_zero_played_table_needs_start_date_lane").map(row => row.slug),
    extractionReviewRequiredSlugs: rows.filter(row => row.extractionProbeStatus === "extraction_review_required").map(row => row.slug),
    noExtractableTableSlugs: rows.filter(row => row.extractionProbeStatus === "no_extractable_standings_table_found").map(row => row.slug),
    acceptedNowCount: 0,
    canonicalWriteAllowedNow: false,
    lifecycleWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "verify diagnostic; passed proof-shape rows still require season identity/lifecycle approval before any review-only candidate write"
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
  rows: report.rows.map(row => ({
    slug: row.slug,
    extractionProbeStatus: row.extractionProbeStatus,
    fetchStatus: row.fetchStatus,
    title: row.title,
    tableCount: row.tableCount,
    selectedTableRowCount: row.selectedTableRowCount,
    selectedTableMaxCellCount: row.selectedTableMaxCellCount,
    extractedStandingRowCount: row.extractedStandingRowCount,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    arithmeticFailedRowCount: row.arithmeticFailedRowCount,
    duplicateTeamNameCount: row.duplicateTeamNameCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    sampleStandingsRows: row.sampleStandingsRows.slice(0, 4)
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
