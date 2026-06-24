import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchIndex = Number((process.argv.find(arg => arg.startsWith("--batch=")) || "--batch=1").split("=")[1]);
const pad = String(batchIndex).padStart(3, "0");

const surfacePath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-parser-surface-probe-${today}`, `bulk-batch-parser-surface-probe-batch-${pad}-${today}.json`);
const surfaceRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-parser-surface-probe-${today}`, `bulk-batch-parser-surface-probe-batch-${pad}-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-html-table-extraction-diagnostic-${today}`);
const outPath = path.join(outDir, `bulk-batch-html-table-extraction-diagnostic-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-html-table-extraction-diagnostic-batch-${pad}-rows-${today}.jsonl`);

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

async function fetchWithTimeout(url, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +html-table-extraction-diagnostic)",
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
    const rows = [];
    const rowMatches = tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    for (let rowIndex = 0; rowIndex < rowMatches.length; rowIndex++) {
      const rowHtml = rowMatches[rowIndex];
      const cellMatches = [...rowHtml.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
      const cells = cellMatches.map(match => stripTags(match[2])).filter(cell => cell.length > 0);
      if (cells.length > 0) rows.push({ rowIndex, cells });
    }

    const text = stripTags(tableHtml);
    const numericCellCount = rows.flatMap(row => row.cells).filter(cell => /^-?\d+(?:[.,]\d+)?$/.test(cell)).length;
    const rowNumericCount = rows.filter(row => row.cells.some(cell => /^-?\d+$/.test(cell))).length;
    const teamLikeCellCount = rows.flatMap(row => row.cells).filter(cell => /[A-Za-zΑ-Ωα-ωÀ-ÖØ-öø-ÿ]/.test(cell) && cell.length >= 2 && cell.length <= 60).length;
    const standingTermCount = (text.match(/pts|points|played|wins|draws|losses|goals|gd|pos|team|club|p|w|d|l|f|a|pt|tabela|tabulka|classifica|clasament|βαθμολογ/gi) || []).length;
    const fixtureTermCount = (text.match(/date|round|home|away|fixture|match|score|result|calendar|ώρα|αγωνιστική/gi) || []).length;

    let score = 0;
    score += Math.min(rows.length, 30) * 3;
    score += Math.min(numericCellCount, 120);
    score += Math.min(teamLikeCellCount, 80);
    score += standingTermCount * 5;
    score += fixtureTermCount * 3;
    if (rows.length >= 8 && rows.length <= 30) score += 80;
    if (rows.some(row => row.cells.length >= 6)) score += 40;

    tables.push({
      tableIndex,
      rowCount: rows.length,
      maxCellCount: Math.max(0, ...rows.map(row => row.cells.length)),
      numericCellCount,
      rowNumericCount,
      teamLikeCellCount,
      standingTermCount,
      fixtureTermCount,
      score,
      sampleRows: rows.slice(0, 8),
      extractedRows: rows.slice(0, 40)
    });
  }

  return tables.sort((a, b) => b.score - a.score || b.rowCount - a.rowCount);
}

function classifyBestTable(best, routeIntent) {
  if (!best) return "no_table_found";
  if (best.rowCount >= 8 && best.maxCellCount >= 5 && best.numericCellCount >= 20 && best.teamLikeCellCount >= 8) {
    return routeIntent === "standings" ? "standings_table_extraction_candidate" : "fixture_or_standings_table_extraction_candidate";
  }
  if (best.rowCount >= 8 && best.teamLikeCellCount >= 8) return "table_found_needs_custom_parser";
  return "weak_table_surface";
}

await fs.mkdir(outDir, { recursive: true });

const surface = JSON.parse(await fs.readFile(surfacePath, "utf8"));
const surfaceRows = parseJsonl(await fs.readFile(surfaceRowsPath, "utf8"));
const blocks = [];

if (!allowFetch) blocks.push("missing_allow_fetch");
if (surface.status !== "passed") blocks.push("surface_probe_not_passed");
if (surface.summary?.parserPlanningAllowedCount !== 7) blocks.push("parser_planning_count_not_7");

const targets = surfaceRows.filter(row => row.parserPlanningAllowedNow === true);
if (targets.length !== 7) blocks.push("target_count_not_7");

const rows = [];

if (allowFetch && blocks.length === 0) {
  let index = 0;
  for (const target of targets) {
    index += 1;
    console.log(`[${index}/${targets.length}] extract ${target.slug} ${target.finalUrl}`);

    const startedAt = new Date().toISOString();
    const fetched = await fetchWithTimeout(target.finalUrl, 20000);
    const endedAt = new Date().toISOString();

    const html = fetched.text || "";
    const tables = parseTables(html);
    const best = tables[0] || null;
    const fetchStatus = fetched.response?.status ?? null;
    const finalUrl = fetched.response?.url || target.finalUrl;

    const extractionStatus = classifyBestTable(best, target.routeIntent);

    rows.push({
      slug: target.slug,
      batchIndex,
      routeIntent: target.routeIntent,
      inputUrl: target.finalUrl,
      finalUrl,
      finalHost: hostOf(finalUrl),
      fetchStatus,
      contentType: fetched.response?.headers?.get("content-type") || null,
      bodyLength: html.length,
      bodySha256: html ? shaText(html) : null,
      title: titleOf(html),
      startedAt,
      endedAt,
      fetchError: fetched.error,
      timedOut: fetched.timedOut,
      tableCount: tables.length,
      bestTable: best ? {
        tableIndex: best.tableIndex,
        rowCount: best.rowCount,
        maxCellCount: best.maxCellCount,
        numericCellCount: best.numericCellCount,
        rowNumericCount: best.rowNumericCount,
        teamLikeCellCount: best.teamLikeCellCount,
        standingTermCount: best.standingTermCount,
        fixtureTermCount: best.fixtureTermCount,
        score: best.score,
        sampleRows: best.sampleRows,
        extractedRows: best.extractedRows
      } : null,
      extractionStatus,
      extractionProofPlanningAllowedNow: [
        "standings_table_extraction_candidate",
        "fixture_or_standings_table_extraction_candidate"
      ].includes(extractionStatus),
      customParserPlanningRequired: extractionStatus === "table_found_needs_custom_parser",
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
  runner: "bulk_batch_html_table_extraction_diagnostic",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  surfacePath: rel(surfacePath),
  surfaceRowsPath: rel(surfaceRowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: rows.length,
    controlledHtmlTableFetchExecutedNowCount: rows.length,
    providerFetchExecutedNowCount: 0,
    extractionWriteExecutedNowCount: 0,
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
    extractionProofPlanningAllowedCount: rows.filter(row => row.extractionProofPlanningAllowedNow).length,
    customParserPlanningRequiredCount: rows.filter(row => row.customParserPlanningRequired).length,
    weakOrNoTableCount: rows.filter(row => !row.extractionProofPlanningAllowedNow && !row.customParserPlanningRequired).length,
    extractionProofPlanningAllowedSlugs: rows.filter(row => row.extractionProofPlanningAllowedNow).map(row => row.slug),
    customParserPlanningRequiredSlugs: rows.filter(row => row.customParserPlanningRequired).map(row => row.slug),
    weakOrNoTableSlugs: rows.filter(row => !row.extractionProofPlanningAllowedNow && !row.customParserPlanningRequired).map(row => row.slug),
    extractionStatusCounts: rows.reduce((acc, row) => {
      acc[row.extractionStatus] = (acc[row.extractionStatus] || 0) + 1;
      return acc;
    }, {}),
    acceptedNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "verify extraction diagnostics; then build proof extraction runner only for extractionProofPlanningAllowedSlugs"
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
    tableCount: row.tableCount,
    bestTableRowCount: row.bestTable?.rowCount || 0,
    bestTableMaxCellCount: row.bestTable?.maxCellCount || 0,
    bestTableNumericCellCount: row.bestTable?.numericCellCount || 0,
    bestTableTeamLikeCellCount: row.bestTable?.teamLikeCellCount || 0,
    extractionStatus: row.extractionStatus,
    extractionProofPlanningAllowedNow: row.extractionProofPlanningAllowedNow,
    customParserPlanningRequired: row.customParserPlanningRequired,
    sampleRows: row.bestTable?.sampleRows || []
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
