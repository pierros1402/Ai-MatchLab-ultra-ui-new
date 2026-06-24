import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `bulk-host-first-standings-materialization-scout-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-browser-render")) throw new Error("Refusing browser render without --allow-browser-render");

const MAX_TARGETS = Number(process.env.STANDINGS_MATERIALIZATION_MAX_TARGETS || "120");
const CHROME_TIMEOUT_MS = Number(process.env.STANDINGS_MATERIALIZATION_CHROME_TIMEOUT_MS || "25000");

function ensureDir(dirPath) { fs.mkdirSync(dirPath, { recursive: true }); }
function rel(filePath) { return path.relative(ROOT, filePath).replaceAll("\\", "/"); }

function walk(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function parseJsonlSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function latestFile(pattern) {
  const files = walk(DIAG_ROOT).filter((file) => pattern.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  return null;
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function stripHtml(value) {
  return htmlDecode(String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 240) : null;
}

function extractBlocks(html, tagName) {
  return String(html || "").match(new RegExp(`<${tagName}\\b[\\s\\S]*?<\\/${tagName}>`, "gi")) || [];
}

function extractRowsFromTable(tableHtml) {
  const rowBlocks = extractBlocks(tableHtml, "tr");
  return rowBlocks.map((rowHtml) => {
    const cellBlocks = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [];
    return cellBlocks.map((cellHtml) => stripHtml(cellHtml)).filter(Boolean);
  }).filter((row) => row.length > 0);
}

function numericValues(row) {
  return row.map((cell) => {
    const cleaned = String(cell).replace(/[^\d-]/g, "");
    if (!cleaned || cleaned === "-") return null;
    const n = Number.parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : null;
  }).filter((n) => n !== null);
}

function looksLikeHeader(row) {
  const n = normalizeText(row.join(" "));
  const tokens = new Set(n.split(/[^a-z0-9]+/).filter(Boolean));
  const hasTeam = ["team","club","squad","vereniging"].some((t) => tokens.has(t)) || n.includes("team") || n.includes("club");
  const hasPlayed = ["p","pl","played","matches","mp","g","gs"].some((t) => tokens.has(t));
  const hasPoints = ["pts","points","pt","pnt","punten"].some((t) => tokens.has(t));
  const hasWdl = ["w","won","d","drawn","l","lost","v","g"].some((t) => tokens.has(t));
  return hasTeam || (hasPlayed && hasPoints) || (hasPoints && hasWdl);
}

function inferColumnHints(rows) {
  const headerIndex = rows.findIndex(looksLikeHeader);
  const header = headerIndex >= 0 ? rows[headerIndex] : [];
  const normalized = header.map(normalizeText);
  const findIndex = (patterns) => normalized.findIndex((cell) => patterns.some((p) => cell === p || cell.includes(p)));
  return {
    headerIndex,
    header,
    inferred: {
      position: findIndex(["pos","position","rank","#"]),
      team: findIndex(["team","club","squad"]),
      played: findIndex(["pl","p","played","matches","mp","gs"]),
      won: findIndex(["w","won"]),
      drawn: findIndex(["d","drawn","g"]),
      lost: findIndex(["l","lost","v"]),
      goalsFor: findIndex(["gf","goals for","for","dv"]),
      goalsAgainst: findIndex(["ga","goals against","against","dt"]),
      goalDifference: findIndex(["gd","goal difference","diff","ds"]),
      points: findIndex(["pts","points","pt","pnt","punten"])
    }
  };
}

function inspectTable(tableHtml, index) {
  const rows = extractRowsFromTable(tableHtml);
  const text = stripHtml(tableHtml);
  const headerLikeRows = rows.filter(looksLikeHeader).length;
  const dataLikeRows = rows.filter((row) => {
    const nums = numericValues(row);
    return nums.length >= 4 && row.some((cell) => /[A-Za-zÀ-žΑ-ωԱ-Ֆა-ჰ]/.test(cell));
  });
  const allNumbers = dataLikeRows.flatMap(numericValues);
  const positiveNumericCount = allNumbers.filter((n) => n > 0).length;
  const zeroNumericCount = allNumbers.filter((n) => n === 0).length;
  const rowCount = rows.length;
  const maxCellCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columnHints = inferColumnHints(rows);
  const standingsSignal = hasStandingsSignal(text);
  const materializableGenericSchemaCandidate =
    rowCount >= 10 &&
    maxCellCount >= 6 &&
    dataLikeRows.length >= 8 &&
    (standingsSignal || headerLikeRows > 0) &&
    positiveNumericCount > 0;
  const allZeroLike = allNumbers.length > 0 && positiveNumericCount === 0;
  return {
    tableIndex: index,
    rowCount,
    maxCellCount,
    headerLikeRows,
    dataLikeRowCount: dataLikeRows.length,
    positiveNumericCount,
    zeroNumericCount,
    allZeroLike,
    standingsSignal,
    materializableGenericSchemaCandidate,
    columnHints,
    firstRows: rows.slice(0, 12),
    sampleDataRows: dataLikeRows.slice(0, 12)
  };
}

function hasStandingsSignal(text) {
  const n = normalizeText(text);
  return [
    "standings", "league table", "ranking", "classifica", "tabelle", "classification",
    "points", "played", "won", "drawn", "lost", "goals", "pts", "gf", "ga", "gd"
  ].some((term) => n.includes(term));
}

function scriptHints(html) {
  const scripts = extractBlocks(html, "script");
  return scripts.map((scriptHtml, index) => {
    const raw = scriptHtml.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
    const n = normalizeText(raw.slice(0, 250000));
    const score =
      (n.includes("standings") ? 5 : 0) +
      (n.includes("table") ? 2 : 0) +
      (n.includes("ranking") ? 2 : 0) +
      (n.includes("points") ? 4 : 0) +
      (n.includes("played") ? 3 : 0) +
      (n.includes("team") ? 3 : 0) +
      (n.includes("__next_data__") ? 4 : 0) +
      (n.includes("api") ? 2 : 0);
    return {
      scriptIndex: index,
      score,
      length: raw.length,
      hasNextData: n.includes("__next_data__"),
      hasStandings: n.includes("standings"),
      hasPoints: n.includes("points"),
      hasTeam: n.includes("team"),
      snippet: stripHtml(raw).slice(0, 500)
    };
  }).filter((hint) => hint.score > 0).sort((a, b) => b.score - a.score || b.length - a.length).slice(0, 12);
}

function render(chrome, url) {
  const result = spawnSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-default-apps",
    "--hide-scrollbars",
    "--window-size=1600,2600",
    "--virtual-time-budget=14000",
    "--dump-dom",
    url
  ], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 90 * 1024 * 1024,
    timeout: CHROME_TIMEOUT_MS
  });
  return {
    exitCode: result.status,
    signal: result.signal || null,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function candidatePriority(row) {
  const statusScore =
    row.candidateStatus === "table_candidate_for_parser_or_browser_render" ? 1000 :
    row.candidateStatus === "route_candidate_for_browser_render_or_api_mining" ? 500 :
    0;
  const hostScore =
    row.officialHostConfidence ? Number(row.officialHostConfidence) :
    row.officialHost ? 50 :
    0;
  return statusScore + hostScore + Number(row.tableCount || 0) * 10;
}

ensureDir(OUT_DIR);

const standingsCandidatesPath = latestFile(/controlled-host-first-standings-candidates-\d{4}-\d{2}-\d{2}\.jsonl$/);
const routeHintsPath = latestFile(/controlled-host-first-route-hints-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!standingsCandidatesPath) throw new Error("Missing controlled host-first standings candidates");

const standingCandidates = parseJsonlSafe(standingsCandidatesPath);
const routeHints = routeHintsPath ? parseJsonlSafe(routeHintsPath) : [];
const routeHintsBySlug = new Map();
for (const hint of routeHints) {
  if (!routeHintsBySlug.has(hint.competitionSlug)) routeHintsBySlug.set(hint.competitionSlug, []);
  routeHintsBySlug.get(hint.competitionSlug).push(hint);
}

const targetMap = new Map();
for (const candidate of standingCandidates) {
  if (candidate.candidateStatus === "weak_route_candidate") continue;
  const url = candidate.finalUrl || candidate.url;
  if (!url) continue;
  const key = `${candidate.competitionSlug}|${url}`;
  const prev = targetMap.get(key);
  if (!prev || candidatePriority(candidate) > candidatePriority(prev)) targetMap.set(key, candidate);
}

const targets = [...targetMap.values()]
  .sort((a, b) => candidatePriority(b) - candidatePriority(a) || a.competitionSlug.localeCompare(b.competitionSlug) || String(a.finalUrl || a.url).localeCompare(String(b.finalUrl || b.url)))
  .slice(0, MAX_TARGETS);

const chrome = chromePath();
if (!chrome) throw new Error("Chrome/Edge executable not found");

const inspections = [];
let browserRenderExecutedNowCount = 0;

for (const target of targets) {
  const url = target.finalUrl || target.url;
  console.log(`RENDER ${target.competitionSlug} ${url}`);
  const rendered = render(chrome, url);
  browserRenderExecutedNowCount++;
  const html = rendered.stdout || "";
  const text = stripHtml(html);
  const tables = extractBlocks(html, "table").map((tableHtml, index) => inspectTable(tableHtml, index));
  tables.sort((a, b) =>
    Number(b.materializableGenericSchemaCandidate) - Number(a.materializableGenericSchemaCandidate) ||
    Number(b.standingsSignal) - Number(a.standingsSignal) ||
    b.dataLikeRowCount - a.dataLikeRowCount ||
    b.positiveNumericCount - a.positiveNumericCount ||
    b.rowCount - a.rowCount
  );
  const hints = scriptHints(html);
  const slugRouteHints = (routeHintsBySlug.get(target.competitionSlug) || [])
    .filter((hint) => hint.taskKind === "previous_completed_standings")
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 12);

  inspections.push({
    competitionSlug: target.competitionSlug,
    displayName: target.displayName,
    officialHost: target.officialHost,
    sourceCandidateStatus: target.candidateStatus,
    sourceUrl: target.url,
    renderedUrl: url,
    finalHost: hostFromUrl(url),
    browserExitCode: rendered.exitCode,
    browserSignal: rendered.signal,
    stderrSnippet: rendered.stderr.slice(0, 700),
    title: extractTitle(html),
    renderedHtmlLength: html.length,
    renderedTextLength: text.length,
    bodyStandingsSignal: hasStandingsSignal(text),
    tableCount: tables.length,
    bestTables: tables.slice(0, 8),
    bestTableMaterializable: !!tables[0]?.materializableGenericSchemaCandidate,
    bestTableAllZeroLike: !!tables[0]?.allZeroLike,
    embeddedJsonHints: hints,
    sourceRouteHints: slugRouteHints,
    bodySnippet: text.slice(0, 900)
  });
}

const materializable = inspections.filter((row) => row.bestTableMaterializable);
const allZeroLike = inspections.filter((row) => row.bestTableAllZeroLike);
const tableBearing = inspections.filter((row) => row.tableCount > 0);
const embeddedHintPositive = inspections.filter((row) => row.embeddedJsonHints.length > 0);

const summary = {
  status: "passed",
  runner: "bulk_host_first_standings_materialization_scout",
  sourceStandingsCandidatesPath: rel(standingsCandidatesPath),
  sourceRouteHintsPath: routeHintsPath ? rel(routeHintsPath) : null,
  inputStandingsCandidateCount: standingCandidates.length,
  targetCount: targets.length,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  tableBearingTargetCount: tableBearing.length,
  materializableGenericSchemaCandidateCount: materializable.length,
  allZeroLikeTargetCount: allZeroLike.length,
  embeddedJsonHintPositiveTargetCount: embeddedHintPositive.length,
  materializableCompetitionSlugs: [...new Set(materializable.map((row) => row.competitionSlug))],
  recommendedNextLane:
    materializable.length > 0
      ? "build_generic_schema_materialization_review_for_bulk_table_candidates"
      : embeddedHintPositive.length > 0
        ? "mine_embedded_json_or_api_routes_for_host_first_candidates"
        : "expand_host_first_route_templates_and_rerun_browser_scout"
};

const outPath = path.join(OUT_DIR, `bulk-host-first-standings-materialization-scout-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-host-first-standings-materialization-scout-rows-${DATE}.jsonl`);
const materializablePath = path.join(OUT_DIR, `bulk-host-first-standings-materializable-candidates-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  topMaterializableCandidates: materializable.slice(0, 120),
  topAllZeroLikeCandidates: allZeroLike.slice(0, 80),
  topEmbeddedHintCandidates: embeddedHintPositive.slice(0, 80)
}, null, 2) + "\n", "utf8");

fs.writeFileSync(rowsPath, inspections.map((row) => JSON.stringify(row)).join("\n") + (inspections.length ? "\n" : ""), "utf8");
fs.writeFileSync(materializablePath, materializable.map((row) => JSON.stringify(row)).join("\n") + (materializable.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  materializableCandidatesOutput: rel(materializablePath),
  summary
}, null, 2));
