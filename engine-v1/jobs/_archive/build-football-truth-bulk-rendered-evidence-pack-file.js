#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const CELL_ROWS_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-cell-shape-inspection-${DATE}`, `bulk-rendered-cell-shape-inspection-rows-${DATE}.jsonl`);
const MATERIALIZATION_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-candidate-materialization-probe-${DATE}`, `bulk-rendered-candidate-materialization-probe-${DATE}.json`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-evidence-pack-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }
function decodeHtml(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}
function cleanText(html) {
  return decodeHtml(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}
function parseCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => cleanText(m[2]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
function parseTables(html) {
  const tables = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  return tables.map((table, tableIndex) => {
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const grid = rowBlocks.map(parseCells).filter((r) => r.length);
    return {
      tableIndex,
      tableLength: table.length,
      rowBlockCount: rowBlocks.length,
      gridRowCount: grid.length,
      columnCountMax: Math.max(0, ...grid.map((r) => r.length)),
      numericCellCount: grid.flat().filter((x) => /^-?\d+$/.test(String(x).replace(/,/g, "").trim())).length,
      alphaCellCount: grid.flat().filter((x) => /[A-Za-zÀ-ž]/.test(x)).length,
      firstRows: grid.slice(0, 30),
      textPreview: cleanText(table).slice(0, 2000)
    };
  }).sort((a, b) => b.gridRowCount - a.gridRowCount || b.numericCellCount - a.numericCellCount || b.tableLength - a.tableLength);
}

const cellRows = readJsonl(CELL_ROWS_PATH);
const materialization = readJson(MATERIALIZATION_PATH);
const cellBySlug = new Map(cellRows.map((r) => [r.competitionSlug, r]));

const nedCell = cellBySlug.get("ned.1");
const nedHtmlPath = nedCell?.renderedHtmlPath ? path.join(ROOT, nedCell.renderedHtmlPath) : null;
const nedHtml = nedHtmlPath && fs.existsSync(nedHtmlPath) ? fs.readFileSync(nedHtmlPath, "utf8") : "";
const nedTables = parseTables(nedHtml);

const apiEvidence = (materialization.apiRouteMiningBoard || []).map((row) => {
  const full = (materialization.apiProbeRows || []).find((x) => x.competitionSlug === row.competitionSlug) || {};
  return {
    competitionSlug: row.competitionSlug,
    sourceHost: row.sourceHost,
    sourceUrl: row.sourceUrl,
    renderedByteCount: row.renderedByteCount,
    materializationStatus: row.materializationStatus,
    recommendedNextAction: row.recommendedNextAction,
    apiLikeUrlCount: row.apiLikeUrlCount,
    topApiLikeUrls: row.topApiLikeUrls || [],
    parsedJsonScriptCount: row.parsedJsonScriptCount,
    topMaterializationPaths: row.topMaterializationPaths || [],
    topAssignmentMarkers: row.topAssignmentMarkers || [],
    assignmentHints: (full.assignmentHints || []).slice(0, 10),
    parsedJsonScripts: (full.parsedJsonScripts || []).map((s) => ({
      index: s.index,
      attrs: s.attrs,
      byteCount: s.byteCount,
      topPaths: (s.topPaths || []).slice(0, 20)
    }))
  };
});

const summary = {
  status: "passed",
  runner: "bulk_rendered_evidence_pack",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  nedTableCount: nedTables.length,
  nedBestGridRowCount: nedTables[0]?.gridRowCount || 0,
  nedBestColumnCountMax: nedTables[0]?.columnCountMax || 0,
  apiEvidenceCount: apiEvidence.length,
  apiUrlCandidateCount: apiEvidence.reduce((sum, r) => sum + (r.topApiLikeUrls?.length || 0), 0),
  jsonScriptCandidateCount: apiEvidence.reduce((sum, r) => sum + (r.parsedJsonScripts?.length || 0), 0),
  recommendedNextLane: "use_evidence_pack_to_patch_ned_parser_or_run_controlled_eng_api_fetch"
};

const outPath = path.join(OUT_DIR, `bulk-rendered-evidence-pack-${DATE}.json`);
fs.writeFileSync(outPath, JSON.stringify({ summary, nedTables, apiEvidence }, null, 2) + "\n", "utf8");

console.log(JSON.stringify({ output: rel(outPath), summary }, null, 2));
