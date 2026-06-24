#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const CELL_ROWS_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-cell-shape-inspection-${DATE}`, `bulk-rendered-cell-shape-inspection-rows-${DATE}.jsonl`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `generic-rendered-table-parser-proof-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function readJsonl(p) { return fs.readFileSync(p, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)); }

function decodeHtml(s) {
  return String(s || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
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

function physicalCells(rowHtml) {
  return [...String(rowHtml || "").matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((m) => cleanText(m[2]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function logicalCells(cells) {
  const out = [];
  for (const cell of cells) {
    const parts = String(cell).split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
    if (parts.length > 1) out.push(...parts);
    else out.push(cell);
  }
  return out;
}

function parseCells(rowHtml) {
  return logicalCells(physicalCells(rowHtml));
}

function parseTables(html) {
  const tables = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  return tables.map((table, tableIndex) => {
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const physicalGrid = rowBlocks.map(physicalCells).filter((row) => row.length);
    const logicalGrid = rowBlocks.map(parseCells).filter((row) => row.length);
    return { tableIndex, tableLength: table.length, physicalGrid, grid: logicalGrid };
  });
}

function toInt(x) {
  const t = String(x || "").replace(/[^0-9+-]/g, "").replace(/^\+/, "").trim();
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

function goalPair(x) {
  const m = String(x || "").match(/(\d+)\s*[-:]\s*(\d+)/);
  if (!m) return { goalsFor: null, goalsAgainst: null, goalDifference: null };
  const goalsFor = Number(m[1]);
  const goalsAgainst = Number(m[2]);
  return { goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst };
}

function arithmetic(rows) {
  const failures = [];
  for (const row of rows) {
    const playedExpected = row.won + row.drawn + row.lost;
    if (row.played !== playedExpected) failures.push({ teamName: row.teamName, check: "played=w+d+l", played: row.played, expected: playedExpected });
    const pointsExpected = row.won * 3 + row.drawn;
    if (row.points !== pointsExpected) failures.push({ teamName: row.teamName, check: "points=3w+d", points: row.points, expected: pointsExpected, won: row.won, drawn: row.drawn });
    if (row.goalsFor !== null && row.goalsAgainst !== null && row.goalDifference !== null && row.goalDifference !== row.goalsFor - row.goalsAgainst) failures.push({ teamName: row.teamName, check: "gd=gf-ga", goalDifference: row.goalDifference, expected: row.goalsFor - row.goalsAgainst });
  }
  return { status: failures.length ? "failed" : "passed", tested: rows.length, failed: failures.length, failures };
}

function parseByIndexMap(schema, html) {
  const parsedTables = [];
  const allRows = [];
  const requiredMaxIndex = Math.max(...Object.values(schema.columns).filter(Number.isInteger));

  for (const table of parseTables(html)) {
    const tableRows = [];
    for (const cells of table.grid) {
      if (cells.length <= requiredMaxIndex) continue;

      const position = toInt(cells[schema.columns.position]);
      const teamName = cells[schema.columns.team];
      if (!Number.isInteger(position) || !teamName) continue;

      const goals = goalPair(cells[schema.columns.goals]);
      const row = {
        competitionSlug: schema.competitionSlug,
        seasonScope: schema.seasonScope,
        seasonLabel: schema.seasonLabel,
        provider: "browser_rendered_official",
        teamName,
        position,
        played: toInt(cells[schema.columns.played]),
        won: toInt(cells[schema.columns.won]),
        drawn: toInt(cells[schema.columns.drawn]),
        lost: toInt(cells[schema.columns.lost]),
        goalsFor: goals.goalsFor,
        goalsAgainst: goals.goalsAgainst,
        goalDifference: toInt(cells[schema.columns.goalDifference]),
        points: toInt(cells[schema.columns.points]),
        sourceUrl: schema.sourceUrl,
        sourceHost: schema.sourceHost,
        extractionAdapter: "generic_rendered_table_by_index_map",
        familyId: schema.familyId,
        routeType: "official_browser_rendered_table",
        rawCells: cells
      };

      if (![row.played, row.won, row.drawn, row.lost, row.points].every(Number.isInteger)) continue;
      tableRows.push(row);
    }

    if (tableRows.length) {
      parsedTables.push({
        tableIndex: table.tableIndex,
        tableLength: table.tableLength,
        physicalGridRowCount: table.physicalGrid.length,
        logicalGridRowCount: table.grid.length,
        physicalColumnCountMax: Math.max(0, ...table.physicalGrid.map((r) => r.length)),
        logicalColumnCountMax: Math.max(0, ...table.grid.map((r) => r.length)),
        parsedRowCount: tableRows.length,
        firstPhysicalRows: table.physicalGrid.slice(0, 6),
        firstLogicalRows: table.grid.slice(0, 6),
        rows: tableRows
      });
      allRows.push(...tableRows);
    }
  }

  const byPosition = new Map();
  for (const row of allRows) if (!byPosition.has(row.position)) byPosition.set(row.position, row);
  const rows = [...byPosition.values()].sort((a, b) => a.position - b.position);
  const teamText = rows.map((r) => r.teamName.toLowerCase()).join(" | ");
  const gate = {
    expectedRowsMatch: rows.length === schema.expectedRows,
    expectedTeamSignalCount: schema.expectedTeamSignals.filter((team) => teamText.includes(team.toLowerCase())).length,
    arithmetic: arithmetic(rows)
  };

  return { schemaId: schema.schemaId, parsedTables, rows, gate };
}

const schema = {
  schemaId: "eredivisie_official_rendered_split_table_index_map_v2_logical_cells",
  competitionSlug: "ned.1",
  familyId: "eredivisie_official_rendered",
  sourceHost: "eredivisie.nl",
  sourceUrl: "https://eredivisie.nl/competitie/stand/",
  seasonScope: "previous_completed",
  seasonLabel: "2025-2026",
  expectedRows: 18,
  expectedTeamSignals: ["PSV", "Feyenoord", "Ajax", "FC Utrecht", "AZ", "FC Twente", "N.E.C. Nijmegen"],
  columns: {
    position: 0,
    team: 1,
    played: 2,
    won: 3,
    lost: 4,
    drawn: 5,
    goals: 6,
    goalDifference: 7,
    points: 8
  }
};

const cellRows = readJsonl(CELL_ROWS_PATH);
const target = cellRows.find((r) => r.competitionSlug === "ned.1");
if (!target?.renderedHtmlPath) throw new Error("Cannot find ned.1 renderedHtmlPath from bulk rendered inspection rows.");

const htmlPath = path.join(ROOT, target.renderedHtmlPath);
const html = fs.readFileSync(htmlPath, "utf8");
const result = parseByIndexMap(schema, html);

const status = result.gate.expectedRowsMatch && result.gate.arithmetic.status === "passed" && result.gate.expectedTeamSignalCount >= 4 ? "passed" : "failed";

const summary = {
  status,
  runner: "generic_rendered_table_parser_proof",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  schemaId: schema.schemaId,
  competitionSlug: schema.competitionSlug,
  sourceHost: schema.sourceHost,
  tableCandidateCount: result.parsedTables.length,
  parsedRowCount: result.rows.length,
  expectedRows: schema.expectedRows,
  expectedRowsMatch: result.gate.expectedRowsMatch,
  expectedTeamSignalCount: result.gate.expectedTeamSignalCount,
  arithmeticStatus: result.gate.arithmetic.status,
  recommendedNextLane: status === "passed" ? "promote_generic_rendered_table_by_index_map_adapter_to_central_config" : "inspect_generic_logical_cell_failure"
};

const outPath = path.join(OUT_DIR, `generic-rendered-table-parser-proof-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `generic-rendered-table-parser-proof-rows-${DATE}.jsonl`);
fs.writeFileSync(outPath, JSON.stringify({ summary, schema, result }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, result.rows.map((r) => JSON.stringify(r)).join("\n") + (result.rows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), summary }, null, 2));
if (status !== "passed") throw new Error(`Generic logical-cell rendered-table parser proof failed for ${schema.competitionSlug}`);
