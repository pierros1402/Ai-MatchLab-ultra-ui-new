#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const CELL_ROWS_PATH = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-rendered-cell-shape-inspection-${DATE}`, `bulk-rendered-cell-shape-inspection-rows-${DATE}.jsonl`);
const OUT_DIR = path.join(ROOT, "data", "football-truth", "_diagnostics", `bulk-generic-rendered-schema-scout-${DATE}`);
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
    const pipeParts = String(cell).split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
    if (pipeParts.length > 1) out.push(...pipeParts);
    else out.push(cell);
  }
  return out;
}

function parseTables(html) {
  const tables = String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
  return tables.map((table, tableIndex) => {
    const rowBlocks = table.match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    const physicalGrid = rowBlocks.map(physicalCells).filter((row) => row.length);
    const logicalGrid = physicalGrid.map(logicalCells).filter((row) => row.length);
    const text = cleanText(table);
    return {
      tableIndex,
      tableLength: table.length,
      physicalGrid,
      logicalGrid,
      textPreview: text.slice(0, 1600)
    };
  });
}

function norm(x) {
  return String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9#+/-]+/g, "");
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
    if ([row.played, row.won, row.drawn, row.lost].every(Number.isInteger) && row.played !== row.won + row.drawn + row.lost) {
      failures.push({ teamName: row.teamName, check: "played=w+d+l", played: row.played, expected: row.won + row.drawn + row.lost });
    }
    if ([row.points, row.won, row.drawn].every(Number.isInteger) && row.points !== row.won * 3 + row.drawn) {
      failures.push({ teamName: row.teamName, check: "points=3w+d", points: row.points, expected: row.won * 3 + row.drawn });
    }
    if ([row.goalsFor, row.goalsAgainst, row.goalDifference].every(Number.isInteger) && row.goalDifference !== row.goalsFor - row.goalsAgainst) {
      failures.push({ teamName: row.teamName, check: "gd=gf-ga", goalDifference: row.goalDifference, expected: row.goalsFor - row.goalsAgainst });
    }
  }
  return { status: failures.length ? "failed" : "passed", tested: rows.length, failed: failures.length, failures: failures.slice(0, 10) };
}

function inferHeaderMap(header) {
  const h = header.map(norm);
  const find = (tests) => h.findIndex((x) => tests.some((t) => typeof t === "string" ? x === t : t.test(x)));
  return {
    position: find(["#", "pos", "position", "rank", "rang"]),
    team: find(["team", "club", "ploeg", "hold", "mannschaft", "vereniging"]),
    played: find(["p", "pld", "played", "mp", "games", "matches", "gs", "wed", "sp"]),
    won: find(["w", "won", "wins", "vundet", "siege"]),
    drawn: find(["d", "drawn", "draws", "g", "u"]),
    lost: find(["l", "lost", "losses", "v", "n"]),
    goals: find([/gf[-/:]?ga/, /goals/, /dv[-/]*dt/, /goalsforagainst/, /maal/]),
    goalDifference: find(["gd", "ds", "+/-", "difference", "goaldifference", "maalverschil"]),
    points: find(["pts", "pt", "points", "pnt", "punten"])
  };
}

function parseWithMap(grid, map, slug) {
  const rows = [];
  const maxIdx = Math.max(...Object.values(map).filter((v) => Number.isInteger(v) && v >= 0));
  if (!Number.isInteger(maxIdx) || maxIdx < 0) return rows;

  for (const cells of grid) {
    if (cells.length <= maxIdx) continue;
    const position = map.position >= 0 ? toInt(cells[map.position]) : null;
    const teamName = map.team >= 0 ? cells[map.team] : null;
    if (!Number.isInteger(position) || !teamName || !/[A-Za-zÀ-ž]/.test(teamName)) continue;

    const goals = map.goals >= 0 ? goalPair(cells[map.goals]) : { goalsFor: null, goalsAgainst: null, goalDifference: null };
    const row = {
      competitionSlug: slug,
      position,
      teamName,
      played: map.played >= 0 ? toInt(cells[map.played]) : null,
      won: map.won >= 0 ? toInt(cells[map.won]) : null,
      drawn: map.drawn >= 0 ? toInt(cells[map.drawn]) : null,
      lost: map.lost >= 0 ? toInt(cells[map.lost]) : null,
      goalsFor: goals.goalsFor,
      goalsAgainst: goals.goalsAgainst,
      goalDifference: map.goalDifference >= 0 ? toInt(cells[map.goalDifference]) : goals.goalDifference,
      points: map.points >= 0 ? toInt(cells[map.points]) : null,
      rawCells: cells
    };
    rows.push(row);
  }
  return rows.filter((r) => [r.played, r.won, r.drawn, r.lost, r.points].every(Number.isInteger));
}

function scoutTableSchemas(target, html) {
  const expectedRowsBySlug = { "aut.1": 12, "bel.1": 16, "den.1": 12, "eng.1": 20, "fra.1": 18, "ita.1": 20, "pol.1": 18, "por.1": 18, "cze.1": 16 };
  const expectedRows = Number(target.expectedRows || expectedRowsBySlug[target.competitionSlug] || 0) || null;
  const tables = parseTables(html);
  const candidates = [];

  for (const table of tables) {
    for (const gridKind of ["logicalGrid", "physicalGrid"]) {
      const grid = table[gridKind];
      if (!grid || grid.length < 2) continue;

      for (let headerRowIndex = 0; headerRowIndex < Math.min(5, grid.length); headerRowIndex++) {
        const header = grid[headerRowIndex];
        const map = inferHeaderMap(header);
        const requiredPresent = ["position", "team", "played", "won", "drawn", "lost", "points"].every((k) => map[k] >= 0);
        if (!requiredPresent) continue;

        const rows = parseWithMap(grid.slice(headerRowIndex + 1), map, target.competitionSlug);
        const ar = arithmetic(rows);
        const expectedRowsMatch = expectedRows ? rows.length === expectedRows : false;
        const score = (ar.status === "passed" ? 100000 : 0) + (expectedRowsMatch ? 20000 : 0) + rows.length * 100 + table.tableLength;

        candidates.push({
          tableIndex: table.tableIndex,
          gridKind,
          headerRowIndex,
          tableLength: table.tableLength,
          gridRowCount: grid.length,
          columnCountMax: Math.max(0, ...grid.map((r) => r.length)),
          header,
          inferredColumns: map,
          parsedRowCount: rows.length,
          expectedRows,
          expectedRowsMatch,
          arithmetic: ar,
          score,
          rowsPreview: rows.slice(0, 24),
          firstRows: grid.slice(0, 8),
          schemaDraft: rows.length && ar.status === "passed" ? {
            adapter: "generic_rendered_table_by_index_map",
            cellNormalization: gridKind === "logicalGrid" ? "split_pipe_logical_cells" : "physical_cells",
            expectedRows,
            columns: map
          } : null
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    competitionSlug: target.competitionSlug,
    sourceHost: target.sourceHost,
    sourceUrl: target.sourceUrl,
    renderedByteCount: target.renderedByteCount,
    tableCount: tables.length,
    bestCandidate: candidates[0] || null,
    candidateCount: candidates.length,
    materializationStatus: candidates[0]?.expectedRowsMatch && candidates[0]?.arithmetic?.status === "passed"
      ? "generic_schema_materializable"
      : candidates[0]?.arithmetic?.status === "passed" && candidates[0]?.parsedRowCount >= 8
        ? "generic_schema_partial_or_currentness_review"
        : tables.length
          ? "tables_found_no_schema"
          : "no_tables"
  };
}

const cellRows = readJsonl(CELL_ROWS_PATH);
const configured = new Set(["esp.1","esp.2","ger.1","ger.2","ger.3","cro.1","sco.1","sco.2","ned.1"]);
const targets = cellRows.filter((r) => !configured.has(r.competitionSlug));

const rows = [];
for (const target of targets) {
  const htmlPath = target.renderedHtmlPath ? path.join(ROOT, target.renderedHtmlPath) : null;
  const html = htmlPath && fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  rows.push(scoutTableSchemas(target, html));
}

const materializable = rows.filter((r) => r.materializationStatus === "generic_schema_materializable");
const partial = rows.filter((r) => r.materializationStatus === "generic_schema_partial_or_currentness_review");
const apiOrRoute = rows.filter((r) => r.materializationStatus === "tables_found_no_schema" || r.materializationStatus === "no_tables");

const summary = {
  status: "passed",
  runner: "bulk_generic_rendered_schema_scout",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  inputTargetCount: targets.length,
  tableBearingTargetCount: rows.filter((r) => r.tableCount > 0).length,
  materializableGenericSchemaCount: materializable.length,
  partialOrCurrentnessReviewCount: partial.length,
  routeOrApiReviewCount: apiOrRoute.length,
  recommendedNextLane: materializable.length
    ? "promote_materializable_generic_schema_batch"
    : partial.length
      ? "review_partial_generic_schema_candidates_then_promote_batch"
      : "continue_api_route_mining_for_no_schema_targets"
};

const outPath = path.join(OUT_DIR, `bulk-generic-rendered-schema-scout-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-generic-rendered-schema-scout-rows-${DATE}.jsonl`);
const materializablePath = path.join(OUT_DIR, `materializable-generic-rendered-schema-candidates-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, rows, materializable, partial, apiOrRoute }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
fs.writeFileSync(materializablePath, materializable.map((r) => JSON.stringify(r)).join("\n") + (materializable.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), materializableOutput: rel(materializablePath), summary }, null, 2));
