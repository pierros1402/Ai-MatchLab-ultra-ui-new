import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchIndex = Number((process.argv.find(arg => arg.startsWith("--batch=")) || "--batch=1").split("=")[1]);
const pad = String(batchIndex).padStart(3, "0");

const gatePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-identity-gate-${today}`, `bulk-batch-html-table-identity-gate-batch-${pad}-${today}.json`);
const gateRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-identity-gate-${today}`, `bulk-batch-html-table-identity-gate-batch-${pad}-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-generic-standings-extraction-proof-${today}`);
const outPath = path.join(outDir, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-generic-standings-extraction-proof-batch-${pad}-rows-${today}.jsonl`);

const expectedRowCountBySlug = {
  "aut.2": 16,
  "jpn.2": 20,
  "ksa.1": 18
};

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeEntities(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return stripTags(m?.[1] || "").slice(0, 180);
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function parseIntCell(value) {
  const cleaned = String(value || "").replace(/[^\d+-]/g, "");
  if (!/^[+-]?\d+$/.test(cleaned)) return null;
  return Number.parseInt(cleaned, 10);
}

function isIntCell(value) {
  return parseIntCell(value) !== null;
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +generic-standings-extraction-proof)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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

function parseTables(html) {
  const tables = [];
  const tableMatches = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];

  for (let tableIndex = 0; tableIndex < tableMatches.length; tableIndex++) {
    const tableHtml = tableMatches[tableIndex];
    const rowMatches = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const parsedRows = [];

    for (let rowIndex = 0; rowIndex < rowMatches.length; rowIndex++) {
      const cellMatches = [...rowMatches[rowIndex].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
      const cells = cellMatches.map(match => stripTags(match[2])).filter(Boolean);
      if (cells.length > 0) parsedRows.push({ rowIndex, cells });
    }

    const headerText = (parsedRows[0]?.cells || []).join(" ").toLowerCase();
    const allText = parsedRows.flatMap(row => row.cells).join(" ").toLowerCase();
    const numericCellCount = parsedRows.flatMap(row => row.cells).filter(isIntCell).length;
    const bodyRows = parsedRows.slice(1);
    const bodyRowsWithTail = bodyRows.filter(row => {
      const numericCells = row.cells.filter(isIntCell);
      return numericCells.length >= 8;
    }).length;

    let score = 0;
    if (/pos|pl|club|klub|team|played|spiele|p\b|w\b|d\b|l\b|gf|ga|gd|pts|punkte|points|position/.test(headerText)) score += 500;
    if (/goal|assist|nome|cognome|player|scorer/.test(headerText) && !/played|won|drawn|lost|gf|ga|gd|points|pts/.test(headerText)) score -= 500;
    score += Math.min(parsedRows.length, 30) * 5;
    score += Math.min(numericCellCount, 180);
    score += bodyRowsWithTail * 30;
    if (/standings|table|tabelle|classifica|tabulka/.test(allText)) score += 50;

    tables.push({
      tableIndex,
      rows: parsedRows,
      rowCount: parsedRows.length,
      headerText,
      numericCellCount,
      bodyRowsWithTail,
      score
    });
  }

  return tables.sort((a, b) => b.score - a.score || b.rowCount - a.rowCount);
}

function extractTeamName(cells, tailStartIndex) {
  const beforeTail = cells.slice(0, tailStartIndex);
  const filtered = beforeTail.filter((cell, index) => {
    const t = String(cell || "").trim();
    if (!t) return false;
    if (index === 0 && isIntCell(t)) return false;
    if (/^-+$/.test(t)) return false;
    if (/^(pl|pos|position|trend|tendenz)$/i.test(t)) return false;
    return true;
  });

  return filtered.join(" ").replace(/\s+/g, " ").trim();
}

function parseStandingRows(table, slug) {
  const body = table.rows.slice(1);
  const rows = [];

  for (let i = 0; i < body.length; i++) {
    const source = body[i];
    const cells = source.cells;
    const numericIndexes = cells.map((cell, index) => ({ cell, index, value: parseIntCell(cell) })).filter(item => item.value !== null);

    if (numericIndexes.length < 8) continue;

    const fieldNums = numericIndexes.slice(-8);
    const tailStartIndex = fieldNums[0].index;
    const values = fieldNums.map(item => item.value);
    const positionNums = numericIndexes.slice(0, Math.max(0, numericIndexes.length - 8));
    const position = positionNums.length > 0 ? positionNums[0].value : rows.length + 1;

    const teamName = extractTeamName(cells, tailStartIndex);
    if (!teamName || teamName.length < 2) continue;

    const [played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points] = values;
    const arithmeticBlocks = [];
    if (played !== wins + draws + losses) arithmeticBlocks.push("played_not_equal_wdl");
    if (goalDifference !== goalsFor - goalsAgainst) arithmeticBlocks.push("gd_not_equal_gf_minus_ga");
    if (points < 0) arithmeticBlocks.push("negative_points");
    if (played < 0 || wins < 0 || draws < 0 || losses < 0 || goalsFor < 0 || goalsAgainst < 0) arithmeticBlocks.push("negative_core_stat");

    rows.push({
      slug,
      sourceRowIndex: source.rowIndex,
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
      arithmeticPassed: arithmeticBlocks.length === 0,
      arithmeticBlocks,
      sourceCells: cells
    });
  }

  return rows;
}

function validateExtractedRows(slug, standingsRows) {
  const blocks = [];
  const expectedRowCount = expectedRowCountBySlug[slug];

  if (standingsRows.length !== expectedRowCount) blocks.push(`row_count_not_${expectedRowCount}`);
  if (standingsRows.some(row => !row.arithmeticPassed)) blocks.push("arithmetic_failed");
  if (new Set(standingsRows.map(row => row.teamName.toLowerCase())).size !== standingsRows.length) blocks.push("duplicate_team_names");
  if (standingsRows.some(row => row.played < 0 || row.points < 0)) blocks.push("negative_values");
  if (standingsRows.some(row => row.position < 1)) blocks.push("bad_position");
  if (standingsRows.length > 0 && standingsRows.every(row => row.played === 0)) blocks.push("all_rows_zero_played_preseason_or_not_started");

  return blocks;
}

await fs.mkdir(outDir, { recursive: true });

const gate = JSON.parse(await fs.readFile(gatePath, "utf8"));
const gateRows = parseJsonl(await fs.readFile(gateRowsPath, "utf8"));
const blocks = [];

if (!allowFetch) blocks.push("missing_allow_fetch");
if (gate.status !== "passed") blocks.push("identity_gate_not_passed");
if (gate.summary?.extractionProofPlanningAllowedCount !== 3) blocks.push("gate_extraction_proof_planning_allowed_not_3");

const targets = gateRows.filter(row => row.extractionProofPlanningAllowedNow === true);
if (targets.length !== 3) blocks.push("target_count_not_3");

const rows = [];

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const target of targets) {
    index += 1;
    console.log(`[${index}/${targets.length}] proof ${target.slug} ${target.finalUrl}`);

    const startedAt = new Date().toISOString();
    const fetched = await fetchWithTimeout(target.finalUrl, 20000);
    const endedAt = new Date().toISOString();

    const html = fetched.text || "";
    const tables = parseTables(html);
    const bestTable = tables[0] || null;
    const standingsRows = bestTable ? parseStandingRows(bestTable, target.slug) : [];
    const validationBlocks = validateExtractedRows(target.slug, standingsRows);

    if (fetched.error) validationBlocks.push("fetch_error");
    if (fetched.timedOut) validationBlocks.push("fetch_timeout");
    if (!((fetched.response?.status ?? 0) >= 200 && (fetched.response?.status ?? 0) < 400)) validationBlocks.push("status_not_2xx_or_3xx");
    if (!bestTable) validationBlocks.push("no_table_selected");

    const extractionProofStatus =
      validationBlocks.length === 0 ? "proof_passed_nonzero_standings" :
      validationBlocks.length === 1 && validationBlocks[0] === "all_rows_zero_played_preseason_or_not_started" ? "proof_passed_zero_played_table_needs_start_date_lane" :
      "proof_failed";

    const finalUrl = fetched.response?.url || target.finalUrl;

    rows.push({
      slug: target.slug,
      batchIndex,
      inputUrl: target.finalUrl,
      finalUrl,
      finalHost: hostOf(finalUrl),
      fetchStatus: fetched.response?.status ?? null,
      contentType: fetched.response?.headers?.get("content-type") || null,
      bodyLength: html.length,
      bodySha256: html ? shaText(html) : null,
      title: titleOf(html),
      startedAt,
      endedAt,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      selectedTableIndex: bestTable?.tableIndex ?? null,
      selectedTableRowCount: bestTable?.rowCount ?? 0,
      selectedTableScore: bestTable?.score ?? 0,
      extractedStandingRowCount: standingsRows.length,
      expectedStandingRowCount: expectedRowCountBySlug[target.slug],
      maxPlayed: standingsRows.length ? Math.max(...standingsRows.map(row => row.played)) : null,
      minPlayed: standingsRows.length ? Math.min(...standingsRows.map(row => row.played)) : null,
      allRowsZeroPlayed: standingsRows.length > 0 && standingsRows.every(row => row.played === 0),
      arithmeticPassedRowCount: standingsRows.filter(row => row.arithmeticPassed).length,
      arithmeticFailedRowCount: standingsRows.filter(row => !row.arithmeticPassed).length,
      duplicateTeamNameCount: standingsRows.length - new Set(standingsRows.map(row => row.teamName.toLowerCase())).size,
      extractionProofStatus,
      validationBlocks,
      standingsRows,
      acceptedNow: false,
      canonicalWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadWritten: false,
      rawPayloadCommitted: false
    });
  }
}

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_generic_standings_extraction_proof",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  gatePath: rel(gatePath),
  gateRowsPath: rel(gateRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: rows.length,
    controlledExtractionProofFetchExecutedNowCount: rows.length,
    providerFetchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    targetCount: targets.length,
    attemptedFetchCount: rows.length,
    proofPassedNonzeroCount: rows.filter(row => row.extractionProofStatus === "proof_passed_nonzero_standings").length,
    proofPassedZeroPlayedCount: rows.filter(row => row.extractionProofStatus === "proof_passed_zero_played_table_needs_start_date_lane").length,
    proofFailedCount: rows.filter(row => row.extractionProofStatus === "proof_failed").length,
    proofPassedNonzeroSlugs: rows.filter(row => row.extractionProofStatus === "proof_passed_nonzero_standings").map(row => row.slug),
    proofPassedZeroPlayedSlugs: rows.filter(row => row.extractionProofStatus === "proof_passed_zero_played_table_needs_start_date_lane").map(row => row.slug),
    proofFailedSlugs: rows.filter(row => row.extractionProofStatus === "proof_failed").map(row => row.slug),
    extractedRowsBySlug: Object.fromEntries(rows.map(row => [row.slug, row.extractedStandingRowCount])),
    validationBlocksBySlug: Object.fromEntries(rows.map(row => [row.slug, row.validationBlocks])),
    acceptedNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "verify extraction proof; proof-passed rows may move to review-only candidate approval board, zero-played rows require start-date lifecycle lane"
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
    fetchStatus: row.fetchStatus,
    title: row.title,
    selectedTableRowCount: row.selectedTableRowCount,
    extractedStandingRowCount: row.extractedStandingRowCount,
    expectedStandingRowCount: row.expectedStandingRowCount,
    minPlayed: row.minPlayed,
    maxPlayed: row.maxPlayed,
    arithmeticPassedRowCount: row.arithmeticPassedRowCount,
    arithmeticFailedRowCount: row.arithmeticFailedRowCount,
    duplicateTeamNameCount: row.duplicateTeamNameCount,
    extractionProofStatus: row.extractionProofStatus,
    validationBlocks: row.validationBlocks,
    sampleStandingsRows: row.standingsRows.slice(0, 5).map(r => ({
      position: r.position,
      teamName: r.teamName,
      played: r.played,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      goalsFor: r.goalsFor,
      goalsAgainst: r.goalsAgainst,
      goalDifference: r.goalDifference,
      points: r.points,
      arithmeticPassed: r.arithmeticPassed
    }))
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
