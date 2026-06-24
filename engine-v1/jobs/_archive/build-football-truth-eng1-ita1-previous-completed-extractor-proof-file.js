import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/eng1-ita1-previous-completed-extractor-proof-${DATE}`;
const OUT = `${OUT_DIR}/eng1-ita1-previous-completed-extractor-proof-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/eng1-ita1-previous-completed-extractor-proof-rows-${DATE}.jsonl`;

if (!process.argv.includes("--allow-browser")) throw new Error("Missing --allow-browser");
if (!process.argv.includes("--allow-fetch")) throw new Error("Missing --allow-fetch");

const PL_ROUTE = "https://www.premierleague.com/en/tables/premier-league/2025-26/all-matchweeks";
const SERIE_A_ROUTE = "https://dapi.legaseriea.it/v2/content/it-it/competitions/serie-a";

function abs(p) { return path.join(ROOT, p); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")); }
function sha256Text(t) { return crypto.createHash("sha256").update(String(t ?? "")).digest("hex"); }
function stripTags(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function n(v) { const x = Number(String(v ?? "").trim()); return Number.isFinite(x) ? x : null; }

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p.replace(/\//g, path.sep))) ?? null;
}

function chromeDump(url, label) {
  const chrome = findChrome();
  if (!chrome) return { ok: false, error: "chrome_not_found", html: "" };
  console.log(`RENDER_START ${label} ${url}`);
  const started = Date.now();
  const r = spawnSync(chrome, ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--virtual-time-budget=10000", "--dump-dom", url], { encoding: "utf8", maxBuffer: 45 * 1024 * 1024, timeout: 26000 });
  const elapsedMs = Date.now() - started;
  console.log(`RENDER_END ${label} status=${r.status} bytes=${Buffer.byteLength(r.stdout ?? "")} elapsedMs=${elapsedMs}`);
  return { ok: r.status === 0 && !!r.stdout, status: r.status, error: r.error?.message ?? (r.stderr || null), html: r.stdout ?? "", elapsedMs };
}

async function fetchText(url, label, timeoutMs = 12000) {
  console.log(`FETCH_START ${label} ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { "user-agent": "Mozilla/5.0 FootballTruthDiagnostics/1.0", "accept": "application/json,*/*" } });
    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();
    const elapsedMs = Date.now() - started;
    console.log(`FETCH_END ${label} status=${res.status} bytes=${Buffer.byteLength(text)} elapsedMs=${elapsedMs}`);
    return { ok: res.ok, status: res.status, contentType, text, elapsedMs, error: null };
  } catch (e) {
    const elapsedMs = Date.now() - started;
    console.log(`FETCH_END ${label} error=${e?.name ?? "error"} elapsedMs=${elapsedMs}`);
    return { ok: false, status: null, contentType: "", text: "", elapsedMs, error: String(e?.message ?? e) };
  } finally {
    clearTimeout(timeout);
  }
}

function parseTables(html) {
  const tables = [];
  const tableRe = /<table\b[\s\S]*?<\/table>/gi;
  let tm;
  while ((tm = tableRe.exec(html))) {
    const rows = [];
    const rowRe = /<tr\b[\s\S]*?<\/tr>/gi;
    let rm;
    while ((rm = rowRe.exec(tm[0]))) {
      const cells = [];
      const cellRe = /<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
      let cm;
      while ((cm = cellRe.exec(rm[0]))) {
        const text = stripTags(cm[1]);
        if (text) cells.push(text);
      }
      if (cells.length) rows.push(cells);
    }
    tables.push({ tableIndex: tables.length, rowCount: rows.length, maxCells: rows.reduce((m, r) => Math.max(m, r.length), 0), rows });
  }
  return tables;
}

function normalizeTeamName(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const words = s.split(/\s+/);
  const half = words.length / 2;
  if (Number.isInteger(half)) {
    const a = words.slice(0, half).join(" ");
    const b = words.slice(half).join(" ");
    if (a === b) return a;
  }
  const knownShort = [
    ["Manchester City Man City", "Manchester City"],
    ["Manchester United Man Utd", "Manchester United"],
    ["Brighton and Hove Albion Brighton", "Brighton and Hove Albion"],
    ["Tottenham Hotspur Spurs", "Tottenham Hotspur"],
    ["West Ham United West Ham", "West Ham United"],
    ["Wolverhampton Wanderers Wolves", "Wolverhampton Wanderers"],
    ["Nottingham Forest Nott'm Forest", "Nottingham Forest"]
  ];
  for (const [from, to] of knownShort) if (s === from) return to;
  return s;
}

function parsePremierLeagueRows(html) {
  const tables = parseTables(html);
  const table = tables.find(t => t.rowCount >= 21 && t.maxCells >= 10 && /Pos/i.test(t.rows[0]?.[0] ?? "") && /Team/i.test(t.rows[0]?.[1] ?? ""));
  if (!table) return { table: null, rows: [] };

  const rows = [];
  for (const cells of table.rows.slice(1)) {
    const position = n(String(cells[0] ?? "").match(/^(\d+)/)?.[1]);
    const teamName = normalizeTeamName(cells[1]);
    const played = n(cells[2]);
    const won = n(cells[3]);
    const drawn = n(cells[4]);
    const lost = n(cells[5]);
    const goalsFor = n(cells[6]);
    const goalsAgainst = n(cells[7]);
    const goalDifference = n(cells[8]);
    const points = n(cells[9]);
    if (position && teamName) {
      rows.push({
        competitionSlug: "eng.1",
        seasonScope: "previous_completed",
        seasonLabel: "2025-2026",
        sourceFamily: "premierleague_official_rendered_previous_completed",
        sourceUrl: PL_ROUTE,
        position,
        teamName,
        played,
        won,
        drawn,
        lost,
        goalsFor,
        goalsAgainst,
        goalDifference,
        points,
        validationStatus: "passed",
        qualityGateStatus: "verified"
      });
    }
  }
  return { table, rows };
}

function validateRows({ competitionSlug, rows, expectedRows, expectedTeamSignals }) {
  const blocks = [];
  if (rows.length !== expectedRows) blocks.push(`row_count_${rows.length}_expected_${expectedRows}`);

  let totalPlayed = 0;
  let totalPoints = 0;
  let maxPlayed = 0;
  let maxPoints = 0;
  const teamNames = new Set();

  for (const row of rows) {
    teamNames.add(row.teamName);
    totalPlayed += row.played ?? 0;
    totalPoints += row.points ?? 0;
    maxPlayed = Math.max(maxPlayed, row.played ?? 0);
    maxPoints = Math.max(maxPoints, row.points ?? 0);

    if (row.played !== row.won + row.drawn + row.lost) blocks.push(`${row.teamName}_wdl_failed`);
    if (row.points !== row.won * 3 + row.drawn) blocks.push(`${row.teamName}_points_failed`);
    if (row.goalDifference !== row.goalsFor - row.goalsAgainst) blocks.push(`${row.teamName}_gd_failed`);
  }

  if (teamNames.size !== rows.length) blocks.push("duplicate_team_names");
  if (totalPlayed <= 0 || totalPoints <= 0 || maxPlayed <= 0 || maxPoints <= 0) blocks.push("non_trivial_previous_completed_gate_failed");

  const missingSignals = expectedTeamSignals.filter(signal => !rows.some(row => row.teamName.toLowerCase().includes(signal.toLowerCase())));
  if (missingSignals.length) blocks.push(`missing_expected_team_signals_${missingSignals.join("_")}`);

  const allZero = rows.length > 0 && rows.every(row => row.played === 0 && row.points === 0);
  if (allZero) blocks.push("all_zero_table_rejected");

  return {
    competitionSlug,
    passed: blocks.length === 0,
    blocks: [...new Set(blocks)],
    rowCount: rows.length,
    expectedRows,
    totalPlayed,
    totalPoints,
    maxPlayed,
    maxPoints,
    expectedTeamSignals,
    missingSignals,
    teamSignals: rows.slice(0, 10).map(row => row.teamName),
    duplicateGuardHash: sha256Text(rows.map(row => `${row.competitionSlug}|${row.position}|${row.teamName}|${row.played}|${row.points}`).join("\n")).slice(0, 24)
  };
}

function inspectJsonShape(value, pathParts = [], out = []) {
  if (out.length > 200) return out;
  if (Array.isArray(value)) {
    const keys = value.slice(0, 5).flatMap(x => x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x) : []);
    const sampleKeys = [...new Set(keys)].slice(0, 40);
    out.push({
      path: pathParts.join(".") || "root",
      type: "array",
      length: value.length,
      sampleKeys,
      standingSignal: /(standing|rank|position|team|club|squadra|points|pts|played|won|draw|lost|goals)/i.test(sampleKeys.join(" ")),
      samplePreview: value.slice(0, 3).map(x => x && typeof x === "object" ? Object.fromEntries(Object.entries(x).slice(0, 12)) : x)
    });
    for (let i = 0; i < Math.min(value.length, 3); i++) inspectJsonShape(value[i], [...pathParts, String(i)], out);
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value);
    out.push({
      path: pathParts.join(".") || "root",
      type: "object",
      keyCount: keys.length,
      sampleKeys: keys.slice(0, 40),
      standingSignal: /(standing|rank|position|team|club|squadra|points|pts|played|won|draw|lost|goals)/i.test(keys.join(" "))
    });
    for (const key of keys.slice(0, 30)) inspectJsonShape(value[key], [...pathParts, key], out);
  }
  return out;
}

function materializeSerieARowsFromAnyShape(value) {
  const candidates = [];

  function visit(node, p = []) {
    if (Array.isArray(node)) {
      const sampleObjects = node.filter(x => x && typeof x === "object" && !Array.isArray(x));
      if (node.length >= 20 && sampleObjects.length >= 10) {
        const keys = [...new Set(sampleObjects.flatMap(x => Object.keys(x)))];
        if (/(team|club|squadra|position|rank|points|pts|played|won|draw|lost|goals)/i.test(keys.join(" "))) {
          candidates.push({ path: p.join(".") || "root", rows: node, keys });
        }
      }
      node.slice(0, 5).forEach((x, i) => visit(x, [...p, String(i)]));
    } else if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) visit(v, [...p, k]);
    }
  }

  visit(value);
  return candidates.slice(0, 10);
}

const acceptedRows = [];
const reviewRows = [];

const plDump = chromeDump(PL_ROUTE, "eng.1:previous_completed");
const plParsed = parsePremierLeagueRows(plDump.html ?? "");
const plValidation = validateRows({
  competitionSlug: "eng.1",
  rows: plParsed.rows,
  expectedRows: 20,
  expectedTeamSignals: ["Arsenal", "Manchester City", "Manchester United", "Liverpool", "Chelsea", "Aston Villa"]
});

if (plValidation.passed) acceptedRows.push(...plParsed.rows);
reviewRows.push({
  competitionSlug: "eng.1",
  familyId: "premierleague_official_rendered_previous_completed",
  sourceUrl: PL_ROUTE,
  seasonScope: "previous_completed",
  seasonLabel: "2025-2026",
  status: plValidation.passed ? "accepted_verified_previous_completed_diagnostic_only" : "blocked",
  validation: plValidation,
  tableShape: plParsed.table ? { rowCount: plParsed.table.rowCount, maxCells: plParsed.table.maxCells, header: plParsed.table.rows[0], firstRows: plParsed.table.rows.slice(0, 6) } : null
});

const serieFetch = await fetchText(SERIE_A_ROUTE, "ita.1:dapi_competition");
let serieParsed = null;
let serieJsonShape = [];
let serieMaterializableCandidates = [];
let serieStatus = "blocked_fetch_failed";
let serieBlocks = [];

if (serieFetch.ok) {
  try {
    serieParsed = JSON.parse(serieFetch.text);
    serieJsonShape = inspectJsonShape(serieParsed).filter(shape => shape.standingSignal || shape.type === "array").slice(0, 120);
    serieMaterializableCandidates = materializeSerieARowsFromAnyShape(serieParsed);
    serieStatus = serieMaterializableCandidates.length ? "review_json_shape_materializable_candidate_found" : "review_json_shape_no_materializable_rows_yet";
    if (!serieMaterializableCandidates.length) serieBlocks.push("no_20_row_standings_array_materialized_from_fields_standings_yet");
  } catch (e) {
    serieStatus = "blocked_json_parse_failed";
    serieBlocks.push(`json_parse_failed_${String(e.message).slice(0, 80)}`);
  }
}

reviewRows.push({
  competitionSlug: "ita.1",
  familyId: "serie_a_dapi_previous_completed_probe",
  sourceUrl: SERIE_A_ROUTE,
  seasonScope: "previous_completed",
  seasonLabel: "2025-2026",
  status: serieStatus,
  validation: {
    passed: false,
    blocks: serieBlocks,
    fetchStatus: serieFetch.status,
    contentType: serieFetch.contentType,
    bytes: Buffer.byteLength(serieFetch.text ?? ""),
    parsedJson: !!serieParsed,
    jsonShapePreview: serieJsonShape.slice(0, 30),
    materializableCandidatePreview: serieMaterializableCandidates.map(c => ({ path: c.path, rowCount: c.rows.length, sampleKeys: c.keys.slice(0, 30), sampleRows: c.rows.slice(0, 3).map(r => Object.fromEntries(Object.entries(r).slice(0, 12))) }))
  },
  rawPayloadCommitted: false
});

writeJsonl(ROWS_OUT, acceptedRows);

const output = {
  status: acceptedRows.length ? "partial_passed_with_verified_eng1_previous_completed" : "blocked",
  runner: "eng1_ita1_previous_completed_extractor_proof",
  generatedAtUtc: new Date().toISOString(),
  purpose: "prove previous_completed extraction for immediate eng.1/ita.1 frontier; diagnostics only, no canonical/truth/production writes",
  acceptedCompetitionCount: [...new Set(acceptedRows.map(r => r.competitionSlug))].length,
  acceptedRowsCount: acceptedRows.length,
  acceptedRowsByCompetition: acceptedRows.reduce((acc, row) => ({ ...acc, [row.competitionSlug]: (acc[row.competitionSlug] ?? 0) + 1 }), {}),
  acceptedCompetitions: [...new Set(acceptedRows.map(r => r.competitionSlug))],
  reviewRows,
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: acceptedRows.length
    ? {
        lane: "gate_eng1_previous_completed_materialization_or_integrate_official_rendered_schema",
        verifiedCompetitionSlugs: [...new Set(acceptedRows.map(r => r.competitionSlug))],
        note: "ita.1 remains review until dapi fields.standings shape is materialized and validated"
      }
    : {
        lane: "inspect_ita1_json_shape_and_continue_bulk_previous_completed_family_discovery",
        note: "no immediate verified previous_completed rows"
      },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 1,
    browserRenderExecutedNowCount: 1,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 1,
  browserRenderExecutedNowCount: 1,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  acceptedCompetitionCount: output.acceptedCompetitionCount,
  acceptedRowsCount: output.acceptedRowsCount,
  acceptedRowsByCompetition: output.acceptedRowsByCompetition,
  reviewRows,
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));

if (!acceptedRows.length) process.exit(1);
