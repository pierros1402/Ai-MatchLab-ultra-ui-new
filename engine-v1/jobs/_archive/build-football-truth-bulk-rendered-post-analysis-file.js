#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const IN_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-cell-shape-inspection-${DATE}`);
const ROWS_PATH = path.join(IN_DIR, `bulk-rendered-cell-shape-inspection-rows-${DATE}.jsonl`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-post-analysis-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

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
    .map((m) => cleanText(m[2]))
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function intLike(x) {
  return /^-?\d+$/.test(String(x || "").replace(/,/g, "").trim());
}

function tableGrids(html) {
  const tables = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  return tables.map((table, tableIndex) => {
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const grid = rowBlocks.map(parseCells).filter((r) => r.length);
    const header = grid[0] || [];
    const body = grid.slice(1);
    const numericCellCount = body.flat().filter(intLike).length;
    const alphaCellCount = body.flat().filter((x) => /[A-Za-zÀ-ž]/.test(x)).length;
    const keywordText = cleanText(table).toLowerCase();
    const keywordScore =
      (/\b(pos|position|team|club|played|pld|pts|points|gd|goal difference|won|drawn|lost|w\b|d\b|l\b)\b/i.test(keywordText) ? 10 : 0) +
      (/(standings|table|ranking|tabelle|stilling|tabela|classement|classificacao)/i.test(keywordText) ? 10 : 0);
    const standingsLikeScore =
      keywordScore +
      Math.min(body.length, 30) * 2 +
      Math.min(numericCellCount, 80) +
      Math.min(alphaCellCount, 40);

    return {
      tableIndex,
      tableLength: table.length,
      gridRowCount: grid.length,
      bodyRowCount: body.length,
      columnCountMax: Math.max(0, ...grid.map((r) => r.length)),
      numericCellCount,
      alphaCellCount,
      header,
      firstRows: grid.slice(0, 16),
      standingsLikeScore,
      tableTextPreview: cleanText(table).slice(0, 1200)
    };
  }).sort((a, b) => b.standingsLikeScore - a.standingsLikeScore || b.bodyRowCount - a.bodyRowCount || b.tableLength - a.tableLength);
}

function embeddedHints(html) {
  const scripts = [...String(html || "").matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1] || "");
  const joined = scripts.join("\n");
  const urls = [...joined.matchAll(/https?:\/\/[^"'\s<>\\]+/g)].map((m) => m[0])
    .filter((u) => /(api|stand|table|ranking|league|competition|club|team|season|stats|match)/i.test(u))
    .slice(0, 80);
  const jsonStateMarkers = [
    "__NEXT_DATA__",
    "__NUXT__",
    "window.__INITIAL_STATE__",
    "window.__APOLLO_STATE__",
    "apolloState",
    "dehydratedState",
    "preloadedState",
    "redux",
    "standings",
    "leagueTable",
    "ranking",
    "classification",
    "classificacao",
    "tabela"
  ];
  const markers = jsonStateMarkers.filter((m) => String(html || "").includes(m));
  const keywordCounts = Object.fromEntries(["standings","leagueTable","ranking","table","team","club","points","played","position","matches","season"].map((k) => [k, (joined.match(new RegExp(k, "gi")) || []).length]));
  return { markers, urls, keywordCounts, scriptByteCount: Buffer.byteLength(joined) };
}

function expectedRowsFallback(slug) {
  const map = {
    "aut.1": 12,
    "bel.1": 16,
    "den.1": 12,
    "eng.1": 20,
    "fra.1": 18,
    "ita.1": 20,
    "ned.1": 18,
    "pol.1": 18,
    "por.1": 18,
    "cze.1": 16
  };
  return map[slug] || null;
}

const inputRows = readJsonl(ROWS_PATH);
if (!inputRows.length) throw new Error(`Missing or empty input rows: ${ROWS_PATH}`);

const analysisRows = [];

for (const row of inputRows) {
  const htmlPath = row.renderedHtmlPath ? path.join(ROOT, row.renderedHtmlPath) : null;
  const html = htmlPath && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  const tables = tableGrids(html);
  const hints = embeddedHints(html);
  const expectedRows = Number(row.expectedRows || expectedRowsFallback(row.competitionSlug) || 0) || null;
  const expectedRowTables = expectedRows ? tables.filter((t) => t.bodyRowCount === expectedRows || t.gridRowCount === expectedRows || t.gridRowCount === expectedRows + 1) : [];
  const strongTableCandidate = expectedRowTables.find((t) => t.numericCellCount >= expectedRows * 3) || null;
  const standingsLikeTable = tables.find((t) => t.bodyRowCount >= 8 && t.numericCellCount >= 20 && t.alphaCellCount >= 8) || null;
  const routeFamilyProbeStatus =
    strongTableCandidate ? "strong_expected_row_table_candidate" :
    standingsLikeTable ? "standings_like_table_candidate" :
    hints.markers.length || hints.urls.length ? "embedded_json_or_api_hint_candidate" :
    "weak_or_blocked_route";

  analysisRows.push({
    competitionSlug: row.competitionSlug,
    competitionName: row.competitionName || null,
    sourceHost: row.sourceHost,
    sourceUrl: row.sourceUrl,
    expectedRows,
    renderedByteCount: row.renderedByteCount,
    tableCount: tables.length,
    topTables: tables.slice(0, 5),
    embeddedHints: hints,
    strongTableCandidate: strongTableCandidate ? {
      tableIndex: strongTableCandidate.tableIndex,
      bodyRowCount: strongTableCandidate.bodyRowCount,
      gridRowCount: strongTableCandidate.gridRowCount,
      columnCountMax: strongTableCandidate.columnCountMax,
      header: strongTableCandidate.header,
      firstRows: strongTableCandidate.firstRows.slice(0, 8)
    } : null,
    standingsLikeTableCandidate: standingsLikeTable ? {
      tableIndex: standingsLikeTable.tableIndex,
      bodyRowCount: standingsLikeTable.bodyRowCount,
      gridRowCount: standingsLikeTable.gridRowCount,
      columnCountMax: standingsLikeTable.columnCountMax,
      header: standingsLikeTable.header,
      firstRows: standingsLikeTable.firstRows.slice(0, 8)
    } : null,
    routeFamilyProbeStatus,
    recommendedNextAction:
      routeFamilyProbeStatus === "strong_expected_row_table_candidate" ? "build_bulk_native_table_parser_probe" :
      routeFamilyProbeStatus === "standings_like_table_candidate" ? "inspect_table_columns_then_build_parser_probe" :
      routeFamilyProbeStatus === "embedded_json_or_api_hint_candidate" ? "mine_embedded_json_or_api_route" :
      "replace_route_or_skip_for_now"
  });
}

const grouped = Object.values(analysisRows.reduce((acc, row) => {
  const key = row.recommendedNextAction;
  acc[key] ||= { recommendedNextAction: key, count: 0, slugs: [], rows: [] };
  acc[key].count++;
  acc[key].slugs.push(row.competitionSlug);
  acc[key].rows.push({
    competitionSlug: row.competitionSlug,
    sourceHost: row.sourceHost,
    expectedRows: row.expectedRows,
    tableCount: row.tableCount,
    renderedByteCount: row.renderedByteCount,
    status: row.routeFamilyProbeStatus
  });
  return acc;
}, {})).sort((a, b) => b.count - a.count || a.recommendedNextAction.localeCompare(b.recommendedNextAction));

const parserProbePack = analysisRows
  .filter((r) => r.recommendedNextAction === "build_bulk_native_table_parser_probe" || r.recommendedNextAction === "inspect_table_columns_then_build_parser_probe")
  .sort((a, b) => {
    const aw = a.recommendedNextAction === "build_bulk_native_table_parser_probe" ? 1 : 0;
    const bw = b.recommendedNextAction === "build_bulk_native_table_parser_probe" ? 1 : 0;
    return bw - aw || (b.tableCount || 0) - (a.tableCount || 0);
  });

const apiProbePack = analysisRows
  .filter((r) => r.recommendedNextAction === "mine_embedded_json_or_api_route")
  .sort((a, b) => (b.embeddedHints.urls.length + b.embeddedHints.markers.length) - (a.embeddedHints.urls.length + a.embeddedHints.markers.length));

const summary = {
  status: "passed",
  runner: "bulk_rendered_post_analysis",
  sourceRowsPath: rel(ROWS_PATH),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  analyzedTargetCount: analysisRows.length,
  strongExpectedRowTableCandidateCount: analysisRows.filter((r) => r.routeFamilyProbeStatus === "strong_expected_row_table_candidate").length,
  standingsLikeTableCandidateCount: analysisRows.filter((r) => r.routeFamilyProbeStatus === "standings_like_table_candidate").length,
  embeddedJsonOrApiHintCandidateCount: analysisRows.filter((r) => r.routeFamilyProbeStatus === "embedded_json_or_api_hint_candidate").length,
  weakOrBlockedRouteCount: analysisRows.filter((r) => r.routeFamilyProbeStatus === "weak_or_blocked_route").length,
  parserProbePackCount: parserProbePack.length,
  apiProbePackCount: apiProbePack.length,
  recommendedNextLane: parserProbePack.length
    ? "build_bulk_native_table_parser_probe_for_parser_probe_pack"
    : apiProbePack.length
      ? "mine_embedded_json_api_routes_for_api_probe_pack"
      : "replace_weak_routes_with_official_source_specific_candidates"
};

const outPath = path.join(OUT_DIR, `bulk-rendered-post-analysis-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-rendered-post-analysis-rows-${DATE}.jsonl`);
const parserPackPath = path.join(OUT_DIR, `bulk-native-table-parser-probe-pack-${DATE}.jsonl`);
const apiPackPath = path.join(OUT_DIR, `bulk-api-route-probe-pack-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, grouped, parserProbePack, apiProbePack }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, analysisRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
fs.writeFileSync(parserPackPath, parserProbePack.map((r) => JSON.stringify(r)).join("\n") + (parserProbePack.length ? "\n" : ""), "utf8");
fs.writeFileSync(apiPackPath, apiProbePack.map((r) => JSON.stringify(r)).join("\n") + (apiProbePack.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  parserProbePackOutput: rel(parserPackPath),
  apiProbePackOutput: rel(apiPackPath),
  summary
}, null, 2));
