import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");

const gatePath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-identity-surface-gate-${today}`, `football-truth-global-batch001-strict-identity-surface-gate-${today}.json`);
const gateRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-identity-surface-gate-${today}`, `football-truth-global-batch001-strict-identity-surface-gate-rows-${today}.jsonl`);
const gateVerificationPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-identity-surface-gate-verification-${today}`, `football-truth-global-batch001-strict-identity-surface-gate-verification-${today}.json`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-batch001-strict-html-table-extraction-probe-${today}`);
const outPath = path.join(outDir, `football-truth-global-batch001-strict-html-table-extraction-probe-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-global-batch001-strict-html-table-extraction-probe-rows-${today}.jsonl`);

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
  return stripHtml(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim();
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

function headerScore(cells) {
  const joined = norm(cells.join(" "));
  let score = 0;
  for (const rx of [
    /\b(pos|position|rank|#|no)\b/,
    /\b(team|club|equipo|name|ομαδα)\b/,
    /\b(pj|mp|played|games|αγωνες|αγ)\b/,
    /\b(w|wins|pg|νικες)\b/,
    /\b(d|draws|pe|ισοπαλιες)\b/,
    /\b(l|losses|pp|ηττες)\b/,
    /\b(gf|ga|gd|dg|diff|goals)\b/,
    /\b(pts|points|puntos|βαθμοι)\b/
  ]) if (rx.test(joined)) score += 1;
  return score;
}

function columnMap(header, width) {
  const map = {};
  const hs = header.map(norm);
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i];
    if (map.position == null && /^(pos|position|rank|#|no|a\/a)/.test(h)) map.position = i;
    if (map.team == null && /(team|club|ομαδα|name|σωματειο)/.test(h)) map.team = i;
    if (map.played == null && /^(pj|mp|played|games|αγωνες|αγ)$/.test(h)) map.played = i;
    if (map.wins == null && /^(w|wins|pg|νικες|ν)$/.test(h)) map.wins = i;
    if (map.draws == null && /^(d|draws|pe|ισοπαλιες|ι)$/.test(h)) map.draws = i;
    if (map.losses == null && /^(l|losses|pp|ηττες|η)$/.test(h)) map.losses = i;
    if (map.goalsFor == null && /^(gf|goals for|υπερ|γυ)$/.test(h)) map.goalsFor = i;
    if (map.goalsAgainst == null && /^(ga|gc|goals against|κατα|γκ)$/.test(h)) map.goalsAgainst = i;
    if (map.goalDifference == null && /^(gd|dg|diff|διαφ)$/.test(h)) map.goalDifference = i;
    if (map.points == null && /^(pts|points|puntos|βαθμοι|β)$/.test(h)) map.points = i;
  }
  if (map.position == null && width >= 2) map.position = 0;
  if (map.team == null && width >= 2) map.team = 1;
  return map;
}

function extractStandingsRows(table) {
  const rows = table.rows;
  if (!rows.length) return { headerRowIndex: null, columnMap: {}, standingsRows: [] };
  let headerRowIndex = rows.findIndex(r => headerScore(r) >= 3);
  if (headerRowIndex < 0) headerRowIndex = 0;

  const width = Math.max(...rows.map(r => r.length));
  const map = columnMap(rows[headerRowIndex] || [], width);
  const standingsRows = [];

  for (const cells of rows.slice(headerRowIndex + 1)) {
    if (cells.length < 4) continue;

    const numeric = cells.map(parseIntLoose).filter(v => v != null);
    let position = map.position != null ? parseIntLoose(cells[map.position]) : null;
    let teamName = map.team != null ? stripHtml(cells[map.team]) : "";

    if (!teamName || /^\d+$/.test(teamName)) {
      const idx = cells.findIndex((cell, i) => i !== map.position && parseIntLoose(cell) == null && stripHtml(cell).length >= 2);
      if (idx >= 0) teamName = stripHtml(cells[idx]);
    }

    let played = map.played != null ? parseIntLoose(cells[map.played]) : null;
    let wins = map.wins != null ? parseIntLoose(cells[map.wins]) : null;
    let draws = map.draws != null ? parseIntLoose(cells[map.draws]) : null;
    let losses = map.losses != null ? parseIntLoose(cells[map.losses]) : null;
    let goalsFor = map.goalsFor != null ? parseIntLoose(cells[map.goalsFor]) : null;
    let goalsAgainst = map.goalsAgainst != null ? parseIntLoose(cells[map.goalsAgainst]) : null;
    let goalDifference = map.goalDifference != null ? parseIntLoose(cells[map.goalDifference]) : null;
    let points = map.points != null ? parseIntLoose(cells[map.points]) : null;

    if (played == null && numeric.length >= 5) {
      const start = position != null && numeric[0] === position ? 1 : 0;
      played = numeric[start] ?? null;
      wins = numeric[start + 1] ?? null;
      draws = numeric[start + 2] ?? null;
      losses = numeric[start + 3] ?? null;
      if (numeric.length - start >= 8) {
        goalsFor = numeric[start + 4] ?? null;
        goalsAgainst = numeric[start + 5] ?? null;
        goalDifference = numeric[start + 6] ?? null;
        points = numeric[start + 7] ?? null;
      } else {
        points = numeric[numeric.length - 1] ?? null;
      }
    }

    if (!teamName || teamName.length < 2) continue;
    const playedOk = played != null && wins != null && draws != null && losses != null ? played === wins + draws + losses : null;
    const gdOk = goalsFor != null && goalsAgainst != null && goalDifference != null ? goalDifference === goalsFor - goalsAgainst : null;
    const ptsOk = wins != null && draws != null && points != null ? points === wins * 3 + draws : null;
    const arithmeticPassed = playedOk !== false && gdOk !== false && ptsOk !== false && (playedOk === true || gdOk === true || ptsOk === true);

    standingsRows.push({
      position,
      teamName: teamName.replace(/\s+/g, " ").trim(),
      played,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDifference,
      points,
      arithmeticPassed,
      playedArithmeticPassed: playedOk,
      goalDifferenceArithmeticPassed: gdOk,
      pointsArithmeticPassed: ptsOk,
      rawCells: cells
    });
  }

  return { headerRowIndex, columnMap: map, standingsRows };
}

function scoreTable(table, extraction) {
  const rowCount = table.rows.length;
  const maxCellCount = Math.max(0, ...table.rows.map(r => r.length));
  const headerMaxScore = Math.max(0, ...table.rows.map(headerScore));
  const extracted = extraction.standingsRows.length;
  const arithmetic = extraction.standingsRows.filter(r => r.arithmeticPassed).length;
  const nonzero = extraction.standingsRows.filter(r => Number(r.played || 0) > 0).length;
  return headerMaxScore * 30 + extracted * 15 + arithmetic * 20 + nonzero * 15 + Math.min(rowCount, 30) + maxCellCount;
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
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +strict-html-extraction)",
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

const gate = JSON.parse(await fs.readFile(gatePath, "utf8"));
const gateRows = parseJsonl(await fs.readFile(gateRowsPath, "utf8"));
const gateVerification = JSON.parse(await fs.readFile(gateVerificationPath, "utf8"));

if (gate.status !== "passed") blocks.push("gate_not_passed");
if (gateVerification.status !== "passed") blocks.push("gate_verification_not_passed");

const targets = gateRows.filter(row => row.identitySurfaceLane === "html_table_extraction_probe_ready");
if (targets.length !== 2) blocks.push("target_rows_not_2");

const rows = [];
let fetchCount = 0;

if (allowFetch && blocks.length === 0) {
  let i = 0;
  for (const target of targets) {
    i += 1;
    console.log(`[${i}/${targets.length}] ${target.slug} ${target.finalUrl}`);
    const fetched = await fetchWithTimeout(target.finalUrl);
    fetchCount += 1;
    const html = fetched.text || "";
    const tables = extractTables(html);
    const candidates = tables.map(table => {
      const extraction = extractStandingsRows(table);
      return { table, extraction, score: scoreTable(table, extraction) };
    }).sort((a,b) => b.score - a.score);

    const selected = candidates[0] || null;
    const standingsRows = selected?.extraction?.standingsRows || [];
    const duplicateTeamNameCount = standingsRows.length - new Set(standingsRows.map(r => norm(r.teamName))).size;
    const arithmeticPassedRowCount = standingsRows.filter(r => r.arithmeticPassed).length;
    const arithmeticFailedRowCount = standingsRows.filter(r => r.arithmeticPassed === false).length;
    const playedValues = standingsRows.map(r => r.played).filter(v => v != null);
    const pointsValues = standingsRows.map(r => r.points).filter(v => v != null);
    const minPlayed = playedValues.length ? Math.min(...playedValues) : null;
    const maxPlayed = playedValues.length ? Math.max(...playedValues) : null;
    const allRowsZeroPlayed = standingsRows.length > 0 && playedValues.length === standingsRows.length && playedValues.every(v => v === 0);
    const allRowsZeroPoints = standingsRows.length > 0 && pointsValues.length === standingsRows.length && pointsValues.every(v => v === 0);

    let extractionProbeStatus = "no_extractable_standings_table_found";
    if (standingsRows.length >= 8 && duplicateTeamNameCount === 0 && arithmeticPassedRowCount >= Math.ceil(standingsRows.length * 0.7) && maxPlayed != null && maxPlayed > 0) {
      extractionProbeStatus = "proof_shape_passed_nonzero_standings_needs_season_review";
    } else if (standingsRows.length >= 8 && duplicateTeamNameCount === 0 && allRowsZeroPlayed && allRowsZeroPoints) {
      extractionProbeStatus = "proof_shape_passed_zero_played_table_needs_start_date_lane";
    } else if (standingsRows.length >= 4) {
      extractionProbeStatus = "extraction_review_required";
    }

    rows.push({
      slug: target.slug,
      displayName: target.displayName,
      sourceFinalUrl: target.finalUrl,
      fetchStatus: fetched.response?.status ?? null,
      finalUrl: fetched.response?.url || target.finalUrl,
      title: titleOf(html),
      bodyLength: html.length,
      bodySha256: html ? shaText(html) : null,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      tableCount: tables.length,
      selectedTableIndex: selected?.table?.tableIndex ?? null,
      selectedTableRowCount: selected?.table?.rows?.length ?? 0,
      selectedTableMaxCellCount: selected ? Math.max(0, ...selected.table.rows.map(r => r.length)) : 0,
      extractedStandingRowCount: standingsRows.length,
      arithmeticPassedRowCount,
      arithmeticFailedRowCount,
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
  runner: "global_batch001_strict_html_table_extraction_probe",
  contractVersion: 1,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  inputGatePath: rel(gatePath),
  inputGateRowsPath: rel(gateRowsPath),
  inputGateVerificationPath: rel(gateVerificationPath),
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
    targetCount: targets.length,
    attemptedFetchCount: fetchCount,
    extractionProbeStatusCounts: statusCounts,
    proofShapePassedNonzeroSlugs: rows.filter(row => row.extractionProbeStatus === "proof_shape_passed_nonzero_standings_needs_season_review").map(row => row.slug),
    proofShapePassedZeroPlayedSlugs: rows.filter(row => row.extractionProbeStatus === "proof_shape_passed_zero_played_table_needs_start_date_lane").map(row => row.slug),
    extractionReviewRequiredSlugs: rows.filter(row => row.extractionProbeStatus === "extraction_review_required").map(row => row.slug),
    noExtractableTableSlugs: rows.filter(row => row.extractionProbeStatus === "no_extractable_standings_table_found").map(row => row.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "passed proof-shape rows still require season/lifecycle review and explicit approval before any candidate write"
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
