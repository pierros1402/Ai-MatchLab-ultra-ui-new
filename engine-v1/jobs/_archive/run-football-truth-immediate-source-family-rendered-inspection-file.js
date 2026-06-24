import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/immediate-source-family-rendered-inspection-${DATE}`;
const OUT = `${OUT_DIR}/immediate-source-family-rendered-inspection-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/immediate-source-family-rendered-inspection-rows-${DATE}.jsonl`;

if (!process.argv.includes("--allow-browser")) throw new Error("Missing --allow-browser");

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function readJsonl(p) { if (!p || !fs.existsSync(abs(p))) return []; return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")); }
function sha256Text(t) { return crypto.createHash("sha256").update(String(t ?? "")).digest("hex"); }
function stripTags(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch { return ""; } }

function walk(dir, predicate, out = []) {
  const full = abs(dir);
  if (!fs.existsSync(full)) return out;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.posix.join(dir.replace(/\\/g, "/"), entry.name);
    if (entry.isDirectory()) walk(rel, predicate, out);
    else if (predicate(rel)) out.push(rel);
  }
  return out;
}

function latestExact(fileRegex) {
  const files = walk("data/football-truth/_diagnostics", p => fileRegex.test(path.basename(p)));
  if (!files.length) return null;
  return files.map(p => ({ p, mtimeMs: fs.statSync(abs(p)).mtimeMs })).sort((a, b) => b.mtimeMs - a.mtimeMs)[0].p;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe"
  ].filter(Boolean);
  return candidates.find(p => fs.existsSync(p.replace(/\//g, path.sep))) ?? null;
}

function chromeDump(url) {
  const chrome = findChrome();
  if (!chrome) return { ok: false, error: "chrome_not_found", html: "" };
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--virtual-time-budget=10000", "--dump-dom", url];
  const r = spawnSync(chrome, args, { encoding: "utf8", maxBuffer: 35 * 1024 * 1024, timeout: 24000 });
  return { ok: r.status === 0 && !!r.stdout, status: r.status, error: r.error?.message ?? (r.stderr || null), html: r.stdout ?? "" };
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
    tables.push({
      tableIndex: tables.length,
      rowCount: rows.length,
      maxCells: rows.reduce((m, r) => Math.max(m, r.length), 0),
      header: rows[0] ?? [],
      firstRows: rows.slice(0, 8),
      rowSignature: sha256Text(rows.slice(0, 12).map(r => r.join("|")).join("\n")).slice(0, 24)
    });
  }
  return tables;
}

function collectUrls(value, out = []) {
  if (value == null) return out;
  if (typeof value === "string") {
    const matches = value.match(/https?:\/\/[^\s"'<>\\]+/g) ?? [];
    for (const m of matches) out.push(m.replace(/[),.;]+$/g, ""));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value)) collectUrls(v, out);
  }
  return out;
}

function inferSlug(row) {
  return row.competitionSlug ?? row.leagueSlug ?? row.slug ?? row.targetSlug ?? row.competition?.slug ?? row.task?.competitionSlug ?? row.task?.leagueSlug ?? null;
}

function inferTaskKind(row) {
  const s = JSON.stringify(row).toLowerCase();
  if (s.includes("previous_completed")) return "previous_completed";
  if (s.includes("current_or_new") || s.includes("current-or-new")) return "current_or_new";
  if (s.includes("start_date") || s.includes("start-date")) return "next_season_start_date";
  return "unknown";
}

function inferSourceFamily(row) {
  return row.sourceFamily ?? row.familyId ?? row.routeFamily ?? row.providerFamily ?? row.family ?? row.sourceGroup ?? null;
}

const prioritizedPath = latestExact(/^prioritized-lifecycle-execution-board-\d{4}-\d{2}-\d{2}\.json$/);
if (!prioritizedPath) throw new Error("No prioritized lifecycle execution board found");

const prioritized = readJson(prioritizedPath);
const prioritizedDir = path.posix.dirname(prioritizedPath);
const siblingSourceFamilyBoardPath = path.posix.join(prioritizedDir, `source-family-expansion-board-${DATE}.jsonl`);
const latestSourceFamilyBoardPath = latestExact(/^source-family-expansion-board-\d{4}-\d{2}-\d{2}\.jsonl$/);

const sourceFamilyBoardPathCandidates = [
  prioritized.sourceFamilyExpansionBoardOutput,
  prioritized.summary?.sourceFamilyExpansionBoardOutput,
  siblingSourceFamilyBoardPath,
  latestSourceFamilyBoardPath
].filter(Boolean);

const sourceFamilyBoardPath = sourceFamilyBoardPathCandidates.find(p => fs.existsSync(abs(p))) ?? null;
if (!sourceFamilyBoardPath) {
  throw new Error(`No source-family expansion board found. Candidates: ${JSON.stringify(sourceFamilyBoardPathCandidates)}`);
}

const sourceRows = readJsonl(sourceFamilyBoardPath);

const candidateMap = new Map();
for (const row of sourceRows) {
  const urls = [...new Set(collectUrls(row))].filter(u => {
    const h = hostOf(u);
    return h && !/(github\.com|google|fonts|cloudflare|schema\.org|w3\.org)/i.test(h);
  });
  for (const url of urls) {
    const key = `${inferSlug(row) ?? "unknown"}|${url}`;
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        competitionSlug: inferSlug(row),
        taskKind: inferTaskKind(row),
        url,
        host: hostOf(url),
        sourceFamily: inferSourceFamily(row),
        sourceRowKind: row.kind ?? row.type ?? row.taskType ?? null,
        sourceRowPreview: row
      });
    }
  }
}

const candidates = [...candidateMap.values()]
  .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)) || a.url.localeCompare(b.url))
  .slice(0, 24);

const rendered = [];
for (const candidate of candidates) {
  const dump = chromeDump(candidate.url);
  const html = dump.html ?? "";
  const text = stripTags(html);
  const tables = parseTables(html);
  const standingsLikeTables = tables.filter(t => {
    const h = `${t.header.join(" ")} ${t.firstRows.slice(1, 4).map(r => r.join(" ")).join(" ")}`.toLowerCase();
    const numericDense = t.firstRows.slice(1).some(r => r.filter(c => /^\d+$/.test(c) || /^\d+\s*[–-]\s*\d+$/.test(c)).length >= 4);
    const headerSignal = /(team|club|lið|joukkue|played|games|pts|points|p\b|w\b|d\b|l\b|o\b|v\b|t\b|h\b|m\b)/i.test(h);
    return t.rowCount >= 8 && t.maxCells >= 6 && numericDense && headerSignal;
  });

  rendered.push({
    ...candidate,
    browserOk: dump.ok,
    browserStatus: dump.status ?? null,
    browserError: dump.error ?? null,
    browserBytes: Buffer.byteLength(html),
    title: stripTags(html.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0] ?? ""),
    h1: stripTags(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? ""),
    tableCount: tables.length,
    standingsLikeTableCount: standingsLikeTables.length,
    tableShapes: tables.slice(0, 8),
    standingsLikeTableShapes: standingsLikeTables.slice(0, 6),
    textSignals: text.slice(0, 1000),
    rawPayloadCommitted: false
  });
}

const parserProbeCandidates = rendered
  .filter(r => r.standingsLikeTableCount > 0)
  .map(r => ({
    competitionSlug: r.competitionSlug,
    taskKind: r.taskKind,
    sourceFamily: r.sourceFamily,
    url: r.url,
    host: r.host,
    title: r.title,
    h1: r.h1,
    standingsLikeTableCount: r.standingsLikeTableCount,
    bestTableShape: r.standingsLikeTableShapes[0] ?? null,
    recommendedAction: "manual_schema_contract_or_family_adapter_probe_required_before_acceptance"
  }));

writeJsonl(ROWS_OUT, parserProbeCandidates);

const output = {
  status: "passed",
  runner: "immediate_source_family_rendered_inspection",
  generatedAtUtc: new Date().toISOString(),
  purpose: "inspect immediate official-rendered/source-family expansion targets after current_or_new lifecycle integration; diagnostics only",
  prioritizedPath,
  sourceFamilyBoardPath,
  sourceFamilyBoardPathCandidates,
  sourceRowCount: sourceRows.length,
  sourceRowsPreview: sourceRows.slice(0, 10),
  plannedRenderCandidateCount: candidates.length,
  browserRenderExecutedNowCount: candidates.length,
  renderedCandidateCount: rendered.length,
  standingsLikeCandidateCount: parserProbeCandidates.length,
  candidates,
  rendered,
  parserProbeCandidates,
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: parserProbeCandidates.length
    ? {
        lane: "build_family_schema_probe_for_rendered_candidates",
        candidateCount: parserProbeCandidates.length,
        readyCompetitionSlugs: [...new Set(parserProbeCandidates.map(c => c.competitionSlug).filter(Boolean))].sort(),
        rule: "no acceptance until expected rows/team signals/arithmetic/non-trivial/duplicate gates pass"
      }
    : {
        lane: "expand_official_source_family_discovery_from_prioritized_lifecycle_tasks",
        candidateCount: 0,
        rule: "immediate rendered board had no table-like shapes or no URLs; use broader official-host family discovery"
      },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserRenderExecutedNowCount: candidates.length,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: candidates.length,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  prioritizedPath,
  sourceFamilyBoardPath,
  sourceFamilyBoardPathCandidates,
  sourceRowCount: output.sourceRowCount,
  sourceRowsPreview: output.sourceRowsPreview,
  plannedRenderCandidateCount: output.plannedRenderCandidateCount,
  browserRenderExecutedNowCount: output.browserRenderExecutedNowCount,
  standingsLikeCandidateCount: output.standingsLikeCandidateCount,
  parserProbeCandidates,
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
