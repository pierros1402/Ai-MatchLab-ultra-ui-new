import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/immediate-official-rendered-route-seed-resolver-${DATE}`;
const OUT = `${OUT_DIR}/immediate-official-rendered-route-seed-resolver-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/immediate-official-rendered-route-seed-resolver-candidates-${DATE}.jsonl`;

if (!process.argv.includes("--allow-browser")) throw new Error("Missing --allow-browser");

const FAMILY_SEEDS = {
  premierleague_official_rendered: {
    competitionSlug: "eng.1",
    seeds: [
      "https://www.premierleague.com/tables",
      "https://www.premierleague.com/en/tables"
    ]
  },
  serie_a_official_rendered: {
    competitionSlug: "ita.1",
    seeds: [
      "https://www.legaseriea.it/it/serie-a/classifica",
      "https://www.legaseriea.it/en/serie-a/league-table"
    ]
  }
};

function abs(p) { return path.join(ROOT, p); }
function readJson(p) { return JSON.parse(fs.readFileSync(abs(p), "utf8")); }
function readJsonl(p) { if (!p || !fs.existsSync(abs(p))) return []; return fs.readFileSync(abs(p), "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function writeJson(p, v) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), JSON.stringify(v, null, 2) + "\n"); }
function writeJsonl(p, rows) { fs.mkdirSync(path.dirname(abs(p)), { recursive: true }); fs.writeFileSync(abs(p), rows.map(r => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "")); }
function sha256Text(t) { return crypto.createHash("sha256").update(String(t ?? "")).digest("hex"); }
function stripTags(s) { return String(s ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim(); }
function hostOf(u) { try { return new URL(u).host.toLowerCase(); } catch { return ""; } }
function normUrl(u, base) { try { const x = new URL(u, base); x.hash = ""; return x.toString(); } catch { return null; } }

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

function chromeDump(url, label) {
  const chrome = findChrome();
  if (!chrome) return { ok: false, error: "chrome_not_found", html: "" };
  console.log(`RENDER_START ${label} ${url}`);
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--virtual-time-budget=7000", "--dump-dom", url];
  const started = Date.now();
  const r = spawnSync(chrome, args, { encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 18000 });
  const elapsedMs = Date.now() - started;
  console.log(`RENDER_END ${label} status=${r.status} bytes=${Buffer.byteLength(r.stdout ?? "")} elapsedMs=${elapsedMs}`);
  return { ok: r.status === 0 && !!r.stdout, status: r.status, error: r.error?.message ?? (r.stderr || null), html: r.stdout ?? "", elapsedMs };
}

function parseAnchors(html, baseUrl) {
  const out = [];
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const href = m[1].match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const url = normUrl(href, baseUrl);
    if (!url) continue;
    out.push({ url, text: stripTags(m[2]) });
  }
  return out;
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
      firstRows: rows.slice(0, 10),
      rowSignature: sha256Text(rows.slice(0, 14).map(r => r.join("|")).join("\n")).slice(0, 24)
    });
  }
  return tables;
}

function routeScore(url, anchorText, familyId) {
  const text = `${url} ${anchorText}`.toLowerCase();
  let score = 0;
  if (/table|tables|standing|standings|classifica|league-table/.test(text)) score += 100;
  if (/serie-a|seriea|premier-league|premierleague/.test(text)) score += 60;
  if (/2025|2026|season/.test(text)) score += 20;
  if (/women|youth|u18|u19|cup|primavera|fantasy|tickets|shop|news|video|player/.test(text)) score -= 80;
  if (familyId === "premierleague_official_rendered" && hostOf(url).includes("premierleague.com")) score += 50;
  if (familyId === "serie_a_official_rendered" && hostOf(url).includes("legaseriea.it")) score += 50;
  return score;
}

function standingsLikeScore(table) {
  const joined = `${table.header.join(" ")} ${table.firstRows.slice(1, 6).map(r => r.join(" ")).join(" ")}`.toLowerCase();
  let score = 0;
  if (table.rowCount >= 18) score += 40;
  if (table.rowCount >= 20) score += 20;
  if (table.maxCells >= 6) score += 30;
  if (/(team|club|played|games|pts|points|p\b|w\b|d\b|l\b|classifica|squadra|pg|v|n|p)/i.test(joined)) score += 40;
  if (table.firstRows.slice(1).some(r => r.filter(c => /^\d+$/.test(c) || /^\d+\s*[–-]\s*\d+$/.test(c)).length >= 4)) score += 50;
  return score;
}

const prioritizedPath = latestExact(/^prioritized-lifecycle-execution-board-\d{4}-\d{2}-\d{2}\.json$/);
if (!prioritizedPath) throw new Error("No prioritized lifecycle execution board found");

const prioritizedDir = path.posix.dirname(prioritizedPath);
const sourceFamilyBoardPath = path.posix.join(prioritizedDir, `source-family-expansion-board-${DATE}.jsonl`);
if (!fs.existsSync(abs(sourceFamilyBoardPath))) throw new Error(`Missing source family board ${sourceFamilyBoardPath}`);

const sourceRows = readJsonl(sourceFamilyBoardPath);
const immediateRows = sourceRows.filter(row => FAMILY_SEEDS[row.familyId]);

const seedRenders = [];
const candidateMap = new Map();

for (const row of immediateRows) {
  const seedContract = FAMILY_SEEDS[row.familyId];
  for (const seedUrl of seedContract.seeds) {
    const dump = chromeDump(seedUrl, `${row.familyId}:seed`);
    const html = dump.html ?? "";
    const text = stripTags(html);
    const anchors = parseAnchors(html, seedUrl);
    const tables = parseTables(html);

    const seedScore = routeScore(seedUrl, text.slice(0, 500), row.familyId) + 20;
    candidateMap.set(`${row.familyId}|${seedUrl}`, {
      familyId: row.familyId,
      competitionSlug: seedContract.competitionSlug,
      url: seedUrl,
      origin: "static_family_seed",
      score: seedScore
    });

    for (const a of anchors) {
      const score = routeScore(a.url, a.text, row.familyId);
      if (score <= 80) continue;
      candidateMap.set(`${row.familyId}|${a.url}`, {
        familyId: row.familyId,
        competitionSlug: seedContract.competitionSlug,
        url: a.url,
        origin: "rendered_seed_link",
        anchorText: a.text,
        score
      });
    }

    seedRenders.push({
      familyId: row.familyId,
      competitionSlug: seedContract.competitionSlug,
      seedUrl,
      browserOk: dump.ok,
      browserStatus: dump.status ?? null,
      browserError: dump.error ?? null,
      elapsedMs: dump.elapsedMs,
      browserBytes: Buffer.byteLength(html),
      title: stripTags(html.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0] ?? ""),
      h1: stripTags(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? ""),
      tableCount: tables.length,
      tableShapes: tables.slice(0, 5),
      scoredLinkCount: anchors.filter(a => routeScore(a.url, a.text, row.familyId) > 80).length,
      textPreview: text.slice(0, 800),
      rawPayloadCommitted: false
    });
  }
}

const routeCandidates = [...candidateMap.values()].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, 8);

const routeRenders = [];
for (const c of routeCandidates) {
  const dump = chromeDump(c.url, `${c.familyId}:route`);
  const html = dump.html ?? "";
  const text = stripTags(html);
  const tables = parseTables(html);
  const scoredTables = tables.map(t => ({ ...t, standingsLikeScore: standingsLikeScore(t) })).sort((a, b) => b.standingsLikeScore - a.standingsLikeScore);
  const positiveTables = scoredTables.filter(t => t.standingsLikeScore >= 80);
  routeRenders.push({
    ...c,
    browserOk: dump.ok,
    browserStatus: dump.status ?? null,
    browserError: dump.error ?? null,
    elapsedMs: dump.elapsedMs,
    browserBytes: Buffer.byteLength(html),
    title: stripTags(html.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0] ?? ""),
    h1: stripTags(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? ""),
    tableCount: tables.length,
    positiveTableCount: positiveTables.length,
    bestTableShapes: scoredTables.slice(0, 5),
    positiveTableShapes: positiveTables.slice(0, 5),
    textPreview: text.slice(0, 1000),
    rawPayloadCommitted: false
  });
}

const parserProbeCandidates = routeRenders.filter(r => r.positiveTableCount > 0).map(r => ({
  familyId: r.familyId,
  competitionSlug: r.competitionSlug,
  url: r.url,
  host: hostOf(r.url),
  title: r.title,
  h1: r.h1,
  positiveTableCount: r.positiveTableCount,
  bestTableShape: r.positiveTableShapes[0] ?? null,
  routeRenderScore: r.score,
  recommendedAction: "build_exact_family_schema_probe_with_currentness_gate"
}));

writeJsonl(ROWS_OUT, parserProbeCandidates);

const output = {
  status: "passed",
  runner: "immediate_official_rendered_route_seed_resolver",
  generatedAtUtc: new Date().toISOString(),
  purpose: "resolve missing URLs for immediate official rendered families and inspect route table shapes; diagnostics only; capped progress runner",
  prioritizedPath,
  sourceFamilyBoardPath,
  sourceRowCount: sourceRows.length,
  immediateFamilyRowCount: immediateRows.length,
  seedRenderExecutedNowCount: seedRenders.length,
  plannedRouteRenderCandidateCount: routeCandidates.length,
  routeRenderExecutedNowCount: routeRenders.length,
  browserRenderExecutedNowCount: seedRenders.length + routeRenders.length,
  seedRenders,
  routeCandidates,
  routeRenders,
  parserProbeCandidateCount: parserProbeCandidates.length,
  parserProbeCandidates,
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: parserProbeCandidates.length
    ? {
        lane: "build_exact_family_schema_probe_with_currentness_gate",
        candidateCount: parserProbeCandidates.length,
        readyCompetitionSlugs: [...new Set(parserProbeCandidates.map(c => c.competitionSlug))].sort(),
        rule: "must reject new-season zero/current tables for previous_completed tasks unless season label and non-trivial previous_completed gates pass"
      }
    : {
        lane: "official_asset_api_route_mining_for_immediate_families",
        candidateCount: 0,
        rule: "rendered routes did not expose acceptable table shapes; mine official JS/API routes next"
      },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: 0,
    browserRenderExecutedNowCount: seedRenders.length + routeRenders.length,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: seedRenders.length + routeRenders.length,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  sourceRowCount: output.sourceRowCount,
  immediateFamilyRowCount: output.immediateFamilyRowCount,
  seedRenderExecutedNowCount: output.seedRenderExecutedNowCount,
  plannedRouteRenderCandidateCount: output.plannedRouteRenderCandidateCount,
  routeRenderExecutedNowCount: output.routeRenderExecutedNowCount,
  parserProbeCandidateCount: output.parserProbeCandidateCount,
  parserProbeCandidates,
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
