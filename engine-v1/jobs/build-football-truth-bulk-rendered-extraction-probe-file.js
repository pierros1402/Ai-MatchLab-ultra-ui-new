#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const CELL_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-cell-shape-inspection-${DATE}`);
const POST_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-post-analysis-${DATE}`);
const CELL_ROWS_PATH = path.join(CELL_DIR, `bulk-rendered-cell-shape-inspection-rows-${DATE}.jsonl`);
const POST_ROWS_PATH = path.join(POST_DIR, `bulk-rendered-post-analysis-rows-${DATE}.jsonl`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-extraction-probe-${DATE}`);
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
  return String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9+#-]+/g, "");
}
function findHeader(header, tests) {
  for (let i = 0; i < header.length; i++) {
    const h = norm(header[i]);
    if (tests.some((t) => typeof t === "string" ? h === t : t.test(h))) return i;
  }
  return -1;
}
function arithmetic(rows) {
  const failures = [];
  for (const r of rows) {
    if (Number.isInteger(r.played) && Number.isInteger(r.won) && Number.isInteger(r.drawn) && Number.isInteger(r.lost)) {
      const expectedPlayed = r.won + r.drawn + r.lost;
      if (r.played !== expectedPlayed) failures.push({ teamName: r.teamName, check: "played=w+d+l", played: r.played, expected: expectedPlayed });
    }
    if (Number.isInteger(r.points) && Number.isInteger(r.won) && Number.isInteger(r.drawn)) {
      const expectedPoints = r.won * 3 + r.drawn;
      if (r.points !== expectedPoints) failures.push({ teamName: r.teamName, check: "points=3w+d", points: r.points, expected: expectedPoints, won: r.won, drawn: r.drawn });
    }
  }
  return { status: failures.length ? "failed" : "passed", tested: rows.length, failed: failures.length, failures: failures.slice(0, 20) };
}
function parseGoalPair(x) {
  const m = String(x || "").match(/(-?\d+)\s*[-:]\s*(-?\d+)/);
  if (!m) return { goalsFor: null, goalsAgainst: null, goalDifference: null };
  const gf = Number(m[1]);
  const ga = Number(m[2]);
  return { goalsFor: gf, goalsAgainst: ga, goalDifference: gf - ga };
}
function probeTableParser(target, html) {
  const expectedRows = Number(target.expectedRows || 0) || null;
  const tables = parseTables(html);
  const candidates = [];

  for (const table of tables) {
    const grid = table.grid;
    if (grid.length < 4) continue;

    const header = grid[0] || [];
    const posIdx = findHeader(header, ["#", "pos", "position"]);
    const teamIdx = findHeader(header, ["club", "team", "ploeg"]);
    const playedIdx = findHeader(header, ["gs", "pld", "played", "p", "wed"]);
    const wonIdx = findHeader(header, ["w", "won"]);
    const lostIdx = findHeader(header, ["v", "l", "lost"]);
    const drawnIdx = findHeader(header, ["g", "d", "drawn"]);
    const goalsIdx = findHeader(header, [/dv.*dt/, /gf.*ga/, /goals/, /doelsaldo/]);
    let pointsIdx = findHeader(header, ["pt", "pts", "pnt", "punten", "points"]);
    if (pointsIdx < 0) pointsIdx = header.length - 1;

    const rows = [];
    for (const cells of grid.slice(1)) {
      if (cells.length < 6) continue;
      const position = posIdx >= 0 ? toInt(cells[posIdx]) : rows.length + 1;
      const teamName = teamIdx >= 0 ? cells[teamIdx] : cells.find((c) => /[A-Za-zÀ-ž]/.test(c) && toInt(c) === null);
      if (!Number.isInteger(position) || !teamName) continue;

      const played = playedIdx >= 0 ? toInt(cells[playedIdx]) : null;
      const won = wonIdx >= 0 ? toInt(cells[wonIdx]) : null;
      const lost = lostIdx >= 0 ? toInt(cells[lostIdx]) : null;
      const drawn = drawnIdx >= 0 ? toInt(cells[drawnIdx]) : null;
      const points = pointsIdx >= 0 ? toInt(cells[pointsIdx]) : null;
      const goals = goalsIdx >= 0 ? parseGoalPair(cells[goalsIdx]) : { goalsFor: null, goalsAgainst: null, goalDifference: null };

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
        goalDifference: goals.goalDifference,
        points,
        rawCells: cells
      });
    }

    const ar = arithmetic(rows);
    const expectedRowsMatch = expectedRows ? rows.length === expectedRows : false;
    const score = (ar.status === "passed" ? 100000 : 0) + (expectedRowsMatch ? 10000 : 0) + rows.length * 100 + table.tableLength;
    candidates.push({
      tableIndex: table.tableIndex,
      header,
      gridRowCount: grid.length,
      parsedRowCount: rows.length,
      expectedRows,
      expectedRowsMatch,
      arithmetic: ar,
      score,
      rows: rows.slice(0, expectedRows || 30),
      firstGridRows: grid.slice(0, 8)
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    competitionSlug: target.competitionSlug,
    sourceHost: target.sourceHost,
    sourceUrl: target.sourceUrl,
    expectedRows,
    candidateCount: candidates.length,
    bestCandidate: candidates[0] || null,
    parserProbeStatus: candidates[0]?.arithmetic?.status === "passed" && candidates[0]?.expectedRowsMatch
      ? "parser_probe_passed"
      : candidates[0]
        ? "parser_probe_needs_column_review"
        : "no_table_parser_candidate"
  };
}
function extractScriptHints(html) {
  const scripts = [...String(html || "").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((m, i) => ({ index: i, attrs: m[1] || "", body: m[2] || "" }));
  const full = scripts.map((s) => s.body).join("\n");
  const markers = ["__NEXT_DATA__", "__NUXT__", "__INITIAL_STATE__", "__APOLLO_STATE__", "standings", "leagueTable", "ranking", "classification", "classificacao", "tabela"].filter((m) => String(html).includes(m) || full.includes(m));
  const urls = [...full.matchAll(/https?:\/\/[^"'\s<>\\]+/g)].map((m) => m[0]).filter((u) => /(api|stand|table|ranking|league|competition|club|team|season|stats|match)/i.test(u));
  const jsonScripts = scripts.filter((s) => /application\/json|ld\+json/i.test(s.attrs) || /__NEXT_DATA__/i.test(s.attrs + s.body)).slice(0, 10).map((s) => {
    let parsedKeys = [];
    try {
      const parsed = JSON.parse(s.body.trim());
      parsedKeys = Object.keys(parsed || {}).slice(0, 30);
    } catch {}
    return { index: s.index, attrs: s.attrs.slice(0, 250), byteCount: Buffer.byteLength(s.body), parsedTopKeys: parsedKeys };
  });
  const snippets = [];
  for (const keyword of ["standings", "leagueTable", "ranking", "classification", "classificacao", "tabela", "points", "played", "club", "team"]) {
    const idx = full.toLowerCase().indexOf(keyword.toLowerCase());
    if (idx >= 0) snippets.push({ keyword, snippet: full.slice(Math.max(0, idx - 240), idx + 420).replace(/\s+/g, " ").trim() });
  }
  return {
    markers,
    apiLikeUrls: [...new Set(urls)].slice(0, 80),
    jsonScripts,
    snippets: snippets.slice(0, 20),
    scriptByteCount: Buffer.byteLength(full),
    apiProbeStatus: markers.length || urls.length || jsonScripts.length ? "api_or_embedded_state_hints_found" : "no_api_hint_found"
  };
}

const cellRows = readJsonl(CELL_ROWS_PATH);
const postRows = readJsonl(POST_ROWS_PATH);
if (!cellRows.length) throw new Error(`Missing rendered cell rows: ${CELL_ROWS_PATH}`);
if (!postRows.length) throw new Error(`Missing post-analysis rows: ${POST_ROWS_PATH}`);

const cellBySlug = new Map(cellRows.map((r) => [r.competitionSlug, r]));
const parserTargets = postRows.filter((r) => r.recommendedNextAction === "inspect_table_columns_then_build_parser_probe" || r.recommendedNextAction === "build_bulk_native_table_parser_probe");
const apiTargets = postRows.filter((r) => r.recommendedNextAction === "mine_embedded_json_or_api_route");

const parserProbeRows = [];
for (const target of parserTargets) {
  const cell = cellBySlug.get(target.competitionSlug);
  const htmlPath = cell?.renderedHtmlPath ? path.join(ROOT, cell.renderedHtmlPath) : null;
  const html = htmlPath && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  parserProbeRows.push(probeTableParser({ ...target, renderedHtmlPath: cell?.renderedHtmlPath }, html));
}

const apiProbeRows = [];
for (const target of apiTargets) {
  const cell = cellBySlug.get(target.competitionSlug);
  const htmlPath = cell?.renderedHtmlPath ? path.join(ROOT, cell.renderedHtmlPath) : null;
  const html = htmlPath && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  apiProbeRows.push({
    competitionSlug: target.competitionSlug,
    sourceHost: target.sourceHost,
    sourceUrl: target.sourceUrl,
    renderedByteCount: cell?.renderedByteCount || 0,
    ...extractScriptHints(html)
  });
}

const summary = {
  status: "passed",
  runner: "bulk_rendered_extraction_probe",
  sourceCellRowsPath: rel(CELL_ROWS_PATH),
  sourcePostRowsPath: rel(POST_ROWS_PATH),
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  parserTargetCount: parserTargets.length,
  parserProbePassedCount: parserProbeRows.filter((r) => r.parserProbeStatus === "parser_probe_passed").length,
  parserProbeNeedsReviewCount: parserProbeRows.filter((r) => r.parserProbeStatus === "parser_probe_needs_column_review").length,
  apiTargetCount: apiTargets.length,
  apiHintFoundCount: apiProbeRows.filter((r) => r.apiProbeStatus === "api_or_embedded_state_hints_found").length,
  totalApiLikeUrlCount: apiProbeRows.reduce((sum, r) => sum + r.apiLikeUrls.length, 0),
  recommendedNextLane: parserProbeRows.some((r) => r.parserProbeStatus === "parser_probe_passed")
    ? "integrate_passed_table_parser_candidate_then_continue_api_route_mining"
    : "review_parser_columns_and_mine_api_route_hints_in_bulk"
};

const outPath = path.join(OUT_DIR, `bulk-rendered-extraction-probe-${DATE}.json`);
const parserRowsPath = path.join(OUT_DIR, `bulk-table-parser-probe-rows-${DATE}.jsonl`);
const apiRowsPath = path.join(OUT_DIR, `bulk-api-extraction-probe-rows-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, parserProbeRows, apiProbeRows }, null, 2) + "\n", "utf8");
fs.writeFileSync(parserRowsPath, parserProbeRows.map((r) => JSON.stringify(r)).join("\n") + (parserProbeRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(apiRowsPath, apiProbeRows.map((r) => JSON.stringify(r)).join("\n") + (apiProbeRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  parserRowsOutput: rel(parserRowsPath),
  apiRowsOutput: rel(apiRowsPath),
  summary
}, null, 2));
