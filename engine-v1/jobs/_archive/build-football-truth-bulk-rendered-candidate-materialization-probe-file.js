#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const CELL_ROWS_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-cell-shape-inspection-${DATE}`, `bulk-rendered-cell-shape-inspection-rows-${DATE}.jsonl`);
const EXTRACTION_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-extraction-probe-${DATE}`, `bulk-rendered-extraction-probe-${DATE}.json`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-candidate-materialization-probe-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
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
    .map((m) => cleanText(m[2]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
function parseTables(html) {
  const tables = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  return tables.map((table, tableIndex) => {
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const grid = rowBlocks.map(parseCells).filter((r) => r.length);
    return { tableIndex, tableLength: table.length, grid };
  });
}
function toInt(x) {
  const t = String(x || "").replace(/[^\d-]/g, "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}
function norm(x) {
  return String(x || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+#/-]+/g, "");
}
function findHeader(header, candidates) {
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i]);
    for (const c of candidates) {
      if (typeof c === "string" && h === c) return i;
      if (c instanceof RegExp && c.test(h)) return i;
    }
  }
  return -1;
}
function parseGoalPair(x) {
  const m = String(x || "").match(/(-?\d+)\s*[-:]\s*(-?\d+)/);
  if (!m) return { goalsFor: null, goalsAgainst: null, goalDifference: null };
  const goalsFor = Number(m[1]);
  const goalsAgainst = Number(m[2]);
  return { goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst };
}
function arithmetic(rows) {
  const failures = [];
  for (const r of rows) {
    const expectedPlayed = r.won + r.drawn + r.lost;
    if (r.played !== expectedPlayed) failures.push({ teamName: r.teamName, check: "played=w+d+l", played: r.played, expected: expectedPlayed });
    const expectedPoints = r.won * 3 + r.drawn;
    if (r.points !== expectedPoints) failures.push({ teamName: r.teamName, check: "points=3w+d", points: r.points, expected: expectedPoints, won: r.won, drawn: r.drawn });
  }
  return { status: failures.length ? "failed" : "passed", tested: rows.length, failed: failures.length, failures: failures.slice(0, 20) };
}
function parseEredivisieDutchTable(html) {
  const expectedRows = 18;
  const tables = parseTables(html);
  const candidates = [];

  for (const table of tables) {
    const grid = table.grid;
    if (grid.length < 8) continue;
    const header = grid[0] || [];

    const posIdx = findHeader(header, ["#", "pos", "positie"]);
    const teamIdx = findHeader(header, ["club", "team", "ploeg"]);
    const playedIdx = findHeader(header, ["gs"]);
    const wonIdx = findHeader(header, ["w"]);
    const lostIdx = findHeader(header, ["v"]);
    const drawnIdx = findHeader(header, ["g"]);
    const goalsIdx = findHeader(header, [/dv[-/]*dt/, /dvdt/]);
    let goalDiffIdx = findHeader(header, ["ds", "+/-", "saldo"]);
    let pointsIdx = findHeader(header, ["pt", "pts", "pnt", "punten", "p"]);
    if (pointsIdx < 0) pointsIdx = header.length - 1;

    const rows = [];
    for (const cells of grid.slice(1)) {
      if (cells.length < 8) continue;
      const position = posIdx >= 0 ? toInt(cells[posIdx]) : rows.length + 1;
      const teamName = teamIdx >= 0 ? cells[teamIdx] : null;
      if (!Number.isInteger(position) || !teamName) continue;

      const played = toInt(cells[playedIdx]);
      const won = toInt(cells[wonIdx]);
      const lost = toInt(cells[lostIdx]);
      const drawn = toInt(cells[drawnIdx]);
      const goals = goalsIdx >= 0 ? parseGoalPair(cells[goalsIdx]) : { goalsFor: null, goalsAgainst: null, goalDifference: null };
      const goalDifference = goalDiffIdx >= 0 ? toInt(cells[goalDiffIdx]) : goals.goalDifference;
      const points = toInt(cells[pointsIdx]);

      if (![played, won, drawn, lost, points].every(Number.isInteger)) continue;

      rows.push({
        position,
        teamName,
        played,
        won,
        drawn,
        lost,
        goalsFor: goals.goalsFor,
        goalsAgainst: goals.goalsAgainst,
        goalDifference,
        points,
        rawCells: cells
      });
    }

    const ar = arithmetic(rows);
    const expectedRowsMatch = rows.length === expectedRows;
    const score = (ar.status === "passed" ? 100000 : 0) + (expectedRowsMatch ? 10000 : 0) + rows.length * 100 + table.tableLength;

    candidates.push({
      tableIndex: table.tableIndex,
      tableLength: table.tableLength,
      header,
      gridRowCount: grid.length,
      parsedRowCount: rows.length,
      expectedRows,
      expectedRowsMatch,
      arithmetic: ar,
      score,
      rows,
      firstGridRows: grid.slice(0, 8)
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0] || null;
  return {
    parserId: "eredivisie_rendered_table_dutch_columns",
    candidateCount: candidates.length,
    bestCandidate: best,
    status: best?.expectedRowsMatch && best?.arithmetic?.status === "passed" ? "materializable_verified_parser_candidate" : "not_materializable_yet"
  };
}
function extractScripts(html) {
  return [...String(html || "").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m, index) => ({ index, attrs: m[1] || "", body: m[2] || "" }));
}
function collectJsonPaths(value, pathName = "$", out = [], depth = 0) {
  if (depth > 8 || out.length > 1200) return out;
  if (Array.isArray(value)) {
    if (value.length) {
      out.push({ path: pathName, type: "array", length: value.length, sampleKeys: value[0] && typeof value[0] === "object" ? Object.keys(value[0]).slice(0, 30) : [] });
      collectJsonPaths(value[0], `${pathName}[0]`, out, depth + 1);
    } else {
      out.push({ path: pathName, type: "array", length: 0, sampleKeys: [] });
    }
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value);
    out.push({ path: pathName, type: "object", keyCount: keys.length, sampleKeys: keys.slice(0, 40) });
    for (const k of keys.slice(0, 80)) collectJsonPaths(value[k], `${pathName}.${k}`, out, depth + 1);
  }
  return out;
}
function scorePath(p) {
  const text = `${p.path} ${(p.sampleKeys || []).join(" ")}`.toLowerCase();
  let score = 0;
  for (const k of ["standing", "standings", "table", "ranking", "classification", "classificacao", "tabela", "league", "competition"]) if (text.includes(k)) score += 50;
  for (const k of ["team", "club", "points", "played", "won", "draw", "lost", "position", "rank"]) if (text.includes(k)) score += 20;
  if (p.type === "array") score += Math.min(Number(p.length || 0), 30);
  return score;
}
function apiMaterializationHints(html) {
  const scripts = extractScripts(html);
  const full = scripts.map((s) => s.body).join("\n");
  const apiLikeUrls = [...new Set([...full.matchAll(/https?:\/\/[^"'\s<>\\]+/g)].map((m) => m[0]).filter((u) => /(api|stand|table|ranking|league|competition|club|team|season|stats|match)/i.test(u)))].slice(0, 80);
  const parsedJsonScripts = [];

  for (const script of scripts) {
    const body = script.body.trim();
    if (!body) continue;
    const isJsonScript = /application\/json|ld\+json/i.test(script.attrs) || /__NEXT_DATA__/i.test(script.attrs) || body.startsWith("{") || body.startsWith("[");
    if (!isJsonScript) continue;
    try {
      const json = JSON.parse(body);
      const paths = collectJsonPaths(json).map((p) => ({ ...p, score: scorePath(p) })).sort((a, b) => b.score - a.score).slice(0, 50);
      parsedJsonScripts.push({ index: script.index, attrs: script.attrs.slice(0, 220), byteCount: Buffer.byteLength(body), topPaths: paths });
    } catch {}
  }

  const assignmentHints = [];
  for (const marker of ["__NUXT__", "__NEXT_DATA__", "__INITIAL_STATE__", "__APOLLO_STATE__", "standings", "leagueTable", "ranking", "classification", "classificacao", "tabela"]) {
    const idx = full.toLowerCase().indexOf(marker.toLowerCase());
    if (idx >= 0) assignmentHints.push({ marker, snippet: full.slice(Math.max(0, idx - 500), idx + 1200).replace(/\s+/g, " ").trim() });
  }

  const topMaterializationPaths = parsedJsonScripts
    .flatMap((s) => s.topPaths.map((p) => ({ scriptIndex: s.index, ...p })))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);

  return {
    apiLikeUrls,
    parsedJsonScriptCount: parsedJsonScripts.length,
    parsedJsonScripts,
    assignmentHints: assignmentHints.slice(0, 30),
    topMaterializationPaths,
    materializationStatus: topMaterializationPaths.some((p) => p.score >= 100) || apiLikeUrls.length ? "actionable_embedded_or_api_hints" : "weak_embedded_hints"
  };
}

const cellRows = readJsonl(CELL_ROWS_PATH);
const extraction = readJson(EXTRACTION_PATH);
const cellBySlug = new Map(cellRows.map((r) => [r.competitionSlug, r]));

const nedCell = cellBySlug.get("ned.1");
const nedHtmlPath = nedCell?.renderedHtmlPath ? path.join(ROOT, nedCell.renderedHtmlPath) : null;
const nedHtml = nedHtmlPath && fs.existsSync(nedHtmlPath) ? fs.readFileSync(nedHtmlPath, "utf8") : "";
const eredivisieProbe = parseEredivisieDutchTable(nedHtml);

const apiProbeRows = [];
for (const row of extraction.apiProbeRows || []) {
  const cell = cellBySlug.get(row.competitionSlug);
  const htmlPath = cell?.renderedHtmlPath ? path.join(ROOT, cell.renderedHtmlPath) : null;
  const html = htmlPath && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  apiProbeRows.push({
    competitionSlug: row.competitionSlug,
    sourceHost: row.sourceHost,
    sourceUrl: row.sourceUrl,
    renderedByteCount: cell?.renderedByteCount || 0,
    ...apiMaterializationHints(html)
  });
}

const materializableParserCandidates = [];
if (eredivisieProbe.status === "materializable_verified_parser_candidate") {
  materializableParserCandidates.push({
    competitionSlug: "ned.1",
    sourceHost: "eredivisie.nl",
    sourceUrl: "https://eredivisie.nl/competitie/stand/",
    expectedRows: 18,
    parserId: "eredivisie_rendered_table",
    seasonScope: "previous_completed",
    seasonLabel: "2025-2026",
    acceptedRowsPreview: eredivisieProbe.bestCandidate.rows.slice(0, 18),
    gate: {
      expectedRowsMatch: eredivisieProbe.bestCandidate.expectedRowsMatch,
      arithmetic: eredivisieProbe.bestCandidate.arithmetic.status
    }
  });
}

const apiRouteMiningBoard = apiProbeRows.map((r) => ({
  competitionSlug: r.competitionSlug,
  sourceHost: r.sourceHost,
  sourceUrl: r.sourceUrl,
  renderedByteCount: r.renderedByteCount,
  materializationStatus: r.materializationStatus,
  apiLikeUrlCount: r.apiLikeUrls.length,
  parsedJsonScriptCount: r.parsedJsonScriptCount,
  topApiLikeUrls: r.apiLikeUrls.slice(0, 20),
  topMaterializationPaths: r.topMaterializationPaths.slice(0, 20),
  topAssignmentMarkers: r.assignmentHints.map((h) => h.marker).slice(0, 20),
  recommendedNextAction: r.apiLikeUrls.length
    ? "fetch_candidate_api_urls_with_no_canonical_write"
    : r.topMaterializationPaths.length
      ? "build_embedded_state_extractor_from_rendered_html"
      : "inspect_source_specific_route"
}));

const summary = {
  status: "passed",
  runner: "bulk_rendered_candidate_materialization_probe",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  tableParserProbeCount: 1,
  materializableParserCandidateCount: materializableParserCandidates.length,
  apiProbeCount: apiProbeRows.length,
  actionableApiHintCount: apiRouteMiningBoard.filter((r) => r.materializationStatus === "actionable_embedded_or_api_hints").length,
  apiUrlFetchCandidateCount: apiRouteMiningBoard.filter((r) => r.apiLikeUrlCount > 0).length,
  embeddedExtractorCandidateCount: apiRouteMiningBoard.filter((r) => r.apiLikeUrlCount === 0 && r.topMaterializationPaths.length > 0).length,
  recommendedNextLane: materializableParserCandidates.length
    ? "integrate_materializable_table_parser_candidates_then_continue_api_route_mining"
    : "continue_api_route_mining_and_manual_column_review"
};

const outPath = path.join(OUT_DIR, `bulk-rendered-candidate-materialization-probe-${DATE}.json`);
const parserPath = path.join(OUT_DIR, `materializable-table-parser-candidates-${DATE}.jsonl`);
const apiBoardPath = path.join(OUT_DIR, `api-route-mining-board-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, eredivisieProbe, materializableParserCandidates, apiRouteMiningBoard, apiProbeRows }, null, 2) + "\n", "utf8");
fs.writeFileSync(parserPath, materializableParserCandidates.map((r) => JSON.stringify(r)).join("\n") + (materializableParserCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(apiBoardPath, apiRouteMiningBoard.map((r) => JSON.stringify(r)).join("\n") + (apiRouteMiningBoard.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  materializableParserCandidatesOutput: rel(parserPath),
  apiRouteMiningBoardOutput: rel(apiBoardPath),
  summary
}, null, 2));
