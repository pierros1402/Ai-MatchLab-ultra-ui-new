import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = `data/football-truth/_diagnostics/controlled-eng1-ita1-previous-completed-route-probe-${DATE}`;
const OUT = `${OUT_DIR}/controlled-eng1-ita1-previous-completed-route-probe-${DATE}.json`;
const ROWS_OUT = `${OUT_DIR}/controlled-eng1-ita1-previous-completed-route-probe-candidates-${DATE}.jsonl`;

if (!process.argv.includes("--allow-fetch")) throw new Error("Missing --allow-fetch");
if (!process.argv.includes("--allow-browser")) throw new Error("Missing --allow-browser");

function abs(p) { return path.join(ROOT, p); }
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

function chromeDump(url, label) {
  const chrome = findChrome();
  if (!chrome) return { ok: false, error: "chrome_not_found", html: "" };
  console.log(`RENDER_START ${label} ${url}`);
  const args = ["--headless=new", "--disable-gpu", "--no-sandbox", "--disable-dev-shm-usage", "--virtual-time-budget=9000", "--dump-dom", url];
  const started = Date.now();
  const r = spawnSync(chrome, args, { encoding: "utf8", maxBuffer: 45 * 1024 * 1024, timeout: 24000 });
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
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 FootballTruthDiagnostics/1.0",
        "accept": "application/json,text/html,application/javascript,text/javascript,*/*"
      }
    });
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
    tables.push({
      tableIndex: tables.length,
      rowCount: rows.length,
      maxCells: rows.reduce((m, r) => Math.max(m, r.length), 0),
      header: rows[0] ?? [],
      firstRows: rows.slice(0, 12),
      rowSignature: sha256Text(rows.slice(0, 18).map(r => r.join("|")).join("\n")).slice(0, 24)
    });
  }
  return tables;
}

function tableScore(table) {
  const joined = `${table.header.join(" ")} ${table.firstRows.slice(1, 8).map(r => r.join(" ")).join(" ")}`.toLowerCase();
  let score = 0;
  if (table.rowCount >= 18) score += 40;
  if (table.rowCount >= 20) score += 20;
  if (table.maxCells >= 6) score += 30;
  if (/(team|club|played|games|pts|points|p\b|w\b|d\b|l\b|classifica|squadra|pg|v|n)/i.test(joined)) score += 40;
  if (table.firstRows.slice(1).some(r => r.filter(c => /^\d+$/.test(c) || /^\d+\s*[–-]\s*\d+$/.test(c)).length >= 4)) score += 50;
  return score;
}

function looksPseudoUrl(route) {
  try {
    const decoded = decodeURIComponent(route);
    if (decoded.length > 220 && /\s/.test(decoded) && /(view the|latest standings|official website|season standings)/i.test(decoded)) return true;
    return false;
  } catch {
    return true;
  }
}

function isUsefulHint(row) {
  const route = String(row.route ?? "");
  const host = hostOf(route);
  if (!route.startsWith("http")) return false;
  if (looksPseudoUrl(route)) return false;
  if (/(translations|facebook|google|fonts|analytics|imasdk|tiktok|pingone|payment|preferences|personalisation)/i.test(host + route)) return false;
  if (row.familyId === "premierleague_official_rendered") {
    return /(sdp-prem-prod\.premier-league-prod\.pulselive\.com|api\.premierleague\.com|premierleague\.com)/i.test(host) &&
      /(api|tables|standings|season|competition|premier-league\/2025-26|premier-league\/2024-25)/i.test(route);
  }
  if (row.familyId === "serie_a_official_rendered") {
    return /(dapi\.legaseriea\.it|api-sdp\.legaseriea\.it|legaseriea\.it)/i.test(host) &&
      /(api|classifica|standings|ranking|season|competition|competitions\/serie-a|tags\/season)/i.test(route);
  }
  return false;
}

function collectJsonShape(value, pathParts = [], out = []) {
  if (out.length > 120) return out;
  if (Array.isArray(value)) {
    const sample = value.slice(0, 3);
    const keys = sample.flatMap(x => x && typeof x === "object" && !Array.isArray(x) ? Object.keys(x) : []);
    const keySet = [...new Set(keys)].slice(0, 30);
    const joined = keySet.join(" ").toLowerCase();
    const standingSignal = /(team|club|squadra|standing|rank|position|points|pts|played|won|draw|lost|goals|competition|season)/i.test(joined);
    out.push({
      path: pathParts.join(".") || "root",
      type: "array",
      length: value.length,
      sampleKeys: keySet,
      standingSignal,
      samplePreview: sample.map(x => typeof x === "object" ? Object.fromEntries(Object.entries(x).slice(0, 12)) : x)
    });
    for (let i = 0; i < Math.min(3, value.length); i++) collectJsonShape(value[i], [...pathParts, String(i)], out);
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value);
    const joined = keys.join(" ").toLowerCase();
    const standingSignal = /(team|club|squadra|standing|rank|position|points|pts|played|won|draw|lost|goals|competition|season)/i.test(joined);
    out.push({
      path: pathParts.join(".") || "root",
      type: "object",
      keyCount: keys.length,
      sampleKeys: keys.slice(0, 30),
      standingSignal
    });
    for (const key of keys.slice(0, 20)) collectJsonShape(value[key], [...pathParts, key], out);
  }
  return out;
}

function extractRoutes(text, baseUrl, familyId) {
  const out = [];
  const raw = String(text ?? "");
  const urls = raw.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? [];
  for (const u0 of urls) {
    const u = u0.replace(/[.,;]+$/g, "");
    if (!u.startsWith("http")) continue;
    out.push(u);
  }
  const paths = raw.match(/["'`](\/[^"'`\\]*(?:api|standings|standing|classifica|ranking|table|tables|competition|season|clubs|teams|tournaments)[^"'`\\]*)["'`]/gi) ?? [];
  for (const p0 of paths) {
    const p = p0.slice(1, -1);
    try { out.push(new URL(p, baseUrl).toString()); } catch {}
  }
  return [...new Set(out)].filter(route => isUsefulHint({ route, familyId }));
}

const hintsPath = latestExact(/^official-asset-api-route-mining-eng1-ita1-hints-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!hintsPath) throw new Error("No eng1/ita1 asset mining hint rows found");

const hints = readJsonl(hintsPath);
const usefulHints = hints.filter(isUsefulHint);

const manualCandidates = [
  { familyId: "premierleague_official_rendered", competitionSlug: "eng.1", route: "https://www.premierleague.com/en/tables/premier-league/2025-26/all-matchweeks", kind: "manual_previous_season_render_route", score: 250 },
  { familyId: "premierleague_official_rendered", competitionSlug: "eng.1", route: "https://www.premierleague.com/en/tables/premier-league/2024-25/all-matchweeks", kind: "manual_previous_season_render_route", score: 210 },
  { familyId: "premierleague_official_rendered", competitionSlug: "eng.1", route: "https://sdp-prem-prod.premier-league-prod.pulselive.com/api", kind: "manual_api_base", score: 150 },
  { familyId: "serie_a_official_rendered", competitionSlug: "ita.1", route: "https://dapi.legaseriea.it/v2/content/it-it/competitions/serie-a", kind: "manual_competition_content_api", score: 250 },
  { familyId: "serie_a_official_rendered", competitionSlug: "ita.1", route: "https://www.legaseriea.it/it/serie-a/classifica?season=2025-2026", kind: "manual_previous_season_render_route", score: 190 },
  { familyId: "serie_a_official_rendered", competitionSlug: "ita.1", route: "https://www.legaseriea.it/it/serie-a/classifica/2025-2026", kind: "manual_previous_season_render_route", score: 180 }
];

const candidates = [...new Map(
  [...manualCandidates, ...usefulHints]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .map(row => [`${row.familyId}|${row.route}`, row])
).values()].slice(0, 42);

const fetchResults = [];
const renderResults = [];
const followupRoutes = [];

for (const c of candidates) {
  const route = c.route;
  const isPageRoute = /premierleague\.com\/en\/tables|legaseriea\.it\/.*classifica/i.test(route);
  if (isPageRoute) {
    const dump = chromeDump(route, `${c.familyId}:candidate`);
    const html = dump.html ?? "";
    const tables = parseTables(html).map(t => ({ ...t, standingsLikeScore: tableScore(t) })).sort((a, b) => b.standingsLikeScore - a.standingsLikeScore);
    const text = stripTags(html);
    renderResults.push({
      familyId: c.familyId,
      competitionSlug: c.competitionSlug,
      route,
      kind: c.kind,
      score: c.score,
      browserOk: dump.ok,
      browserStatus: dump.status,
      browserError: dump.error,
      elapsedMs: dump.elapsedMs,
      browserBytes: Buffer.byteLength(html),
      title: stripTags(html.match(/<title[^>]*>[\s\S]*?<\/title>/i)?.[0] ?? ""),
      h1: stripTags(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)?.[0] ?? ""),
      tableCount: tables.length,
      positiveTableCount: tables.filter(t => t.standingsLikeScore >= 80).length,
      bestTableShapes: tables.slice(0, 5),
      textPreview: text.slice(0, 1000),
      rawPayloadCommitted: false
    });
    for (const r of extractRoutes(html, route, c.familyId)) followupRoutes.push({ familyId: c.familyId, competitionSlug: c.competitionSlug, route: r, kind: "rendered_followup_route", score: 120, sourceRoute: route });
  } else {
    const fetched = await fetchText(route, `${c.familyId}:candidate`);
    let jsonShape = [];
    let parsedJson = false;
    if (fetched.text && /json/i.test(fetched.contentType)) {
      try {
        const parsed = JSON.parse(fetched.text);
        parsedJson = true;
        jsonShape = collectJsonShape(parsed).filter(x => x.standingSignal || x.type === "array").slice(0, 80);
      } catch {}
    }
    fetchResults.push({
      familyId: c.familyId,
      competitionSlug: c.competitionSlug,
      route,
      kind: c.kind,
      score: c.score,
      status: fetched.status,
      ok: fetched.ok,
      contentType: fetched.contentType,
      bytes: Buffer.byteLength(fetched.text ?? ""),
      elapsedMs: fetched.elapsedMs,
      error: fetched.error,
      parsedJson,
      jsonShape,
      textSignalPreview: stripTags(fetched.text ?? "").slice(0, 800),
      rawPayloadCommitted: false
    });
    for (const r of extractRoutes(fetched.text, route, c.familyId)) followupRoutes.push({ familyId: c.familyId, competitionSlug: c.competitionSlug, route: r, kind: "fetch_followup_route", score: 100, sourceRoute: route });
  }
}

const standingApiCandidates = fetchResults.flatMap(r =>
  r.jsonShape.filter(s => s.standingSignal && (s.length >= 10 || /stand|team|club|points|position|rank/i.test((s.sampleKeys ?? []).join(" ")))).map(s => ({
    familyId: r.familyId,
    competitionSlug: r.competitionSlug,
    route: r.route,
    status: r.status,
    contentType: r.contentType,
    shapePath: s.path,
    shapeType: s.type,
    length: s.length ?? null,
    sampleKeys: s.sampleKeys ?? [],
    recommendation: "build_json_shape_extractor_probe_before_acceptance"
  }))
);

const renderedTableCandidates = renderResults.flatMap(r =>
  r.bestTableShapes.filter(t => t.standingsLikeScore >= 80).map(t => ({
    familyId: r.familyId,
    competitionSlug: r.competitionSlug,
    route: r.route,
    title: r.title,
    h1: r.h1,
    tableIndex: t.tableIndex,
    rowCount: t.rowCount,
    maxCells: t.maxCells,
    header: t.header,
    firstRows: t.firstRows,
    rowSignature: t.rowSignature,
    standingsLikeScore: t.standingsLikeScore,
    allZeroLikely: t.firstRows.slice(1).length > 0 && t.firstRows.slice(1).every(row => row.slice(2).every(cell => String(cell).trim() === "0")),
    recommendation: "currentness_and_non_trivial_gate_required"
  }))
);

const prunedFollowups = [...new Map(
  followupRoutes
    .filter(r => isUsefulHint(r) && !candidates.some(c => c.route === r.route))
    .map(r => [`${r.familyId}|${r.route}`, r])
).values()].slice(0, 40);

const candidateRows = [
  ...standingApiCandidates.map(r => ({ candidateType: "standing_api_shape", ...r })),
  ...renderedTableCandidates.map(r => ({ candidateType: "rendered_table_shape", ...r })),
  ...prunedFollowups.map(r => ({ candidateType: "followup_route", ...r }))
];

writeJsonl(ROWS_OUT, candidateRows);

const output = {
  status: "passed",
  runner: "controlled_eng1_ita1_previous_completed_route_probe",
  generatedAtUtc: new Date().toISOString(),
  purpose: "strictly prune mined hints, controlled fetch/browser routes, and inspect shapes for previous_completed eng.1/ita.1 without raw payload commits",
  hintsPath,
  rawHintCount: hints.length,
  usefulHintCount: usefulHints.length,
  manualCandidateCount: manualCandidates.length,
  controlledCandidateCount: candidates.length,
  fetchExecutedNowCount: fetchResults.length,
  browserRenderExecutedNowCount: renderResults.length,
  fetchResults,
  renderResults,
  standingApiCandidateCount: standingApiCandidates.length,
  renderedTableCandidateCount: renderedTableCandidates.length,
  followupRouteCandidateCount: prunedFollowups.length,
  standingApiCandidates,
  renderedTableCandidates,
  followupRouteCandidates: prunedFollowups,
  rowsOutput: ROWS_OUT,
  nextRecommendedLane: standingApiCandidates.length
    ? {
        lane: "build_json_shape_extractor_probe_for_standing_api_candidates",
        candidateCount: standingApiCandidates.length,
        rule: "must validate exact seasonLabel previous_completed, expectedRowCount, team signals, arithmetic, non-trivial gate"
      }
    : renderedTableCandidates.some(c => !c.allZeroLikely)
      ? {
          lane: "build_rendered_previous_completed_schema_probe_for_non_zero_tables",
          candidateCount: renderedTableCandidates.filter(c => !c.allZeroLikely).length,
          rule: "rendered non-zero tables need exact season/currentness verification before acceptance"
        }
      : prunedFollowups.length
        ? {
            lane: "controlled_fetch_pruned_followup_routes",
            candidateCount: prunedFollowups.length,
            rule: "fetch followups only; no raw payload commits"
          }
        : {
            lane: "park_eng1_ita1_immediate_previous_completed_routes_and_return_to_bulk_source_families",
            reason: "no usable previous_completed API/table shape found after strict controlled probe"
          },
  policy: {
    rawPayloadCommitted: false,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: fetchResults.length,
    browserRenderExecutedNowCount: renderResults.length,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    stateLaneWriteExecutedNowCount: 0
  },
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: fetchResults.length,
  browserRenderExecutedNowCount: renderResults.length,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
};

writeJson(OUT, output);

console.log(JSON.stringify({
  status: output.status,
  hintsPath,
  rawHintCount: output.rawHintCount,
  usefulHintCount: output.usefulHintCount,
  controlledCandidateCount: output.controlledCandidateCount,
  fetchExecutedNowCount: output.fetchExecutedNowCount,
  browserRenderExecutedNowCount: output.browserRenderExecutedNowCount,
  standingApiCandidateCount: output.standingApiCandidateCount,
  renderedTableCandidateCount: output.renderedTableCandidateCount,
  followupRouteCandidateCount: output.followupRouteCandidateCount,
  standingApiCandidates,
  renderedTableCandidates,
  followupRouteCandidates: prunedFollowups.slice(0, 20),
  nextRecommendedLane: output.nextRecommendedLane,
  output: OUT,
  rowsOutput: ROWS_OUT,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  truthAssertionExecutedNowCount: 0,
  stateLaneWriteExecutedNowCount: 0
}, null, 2));
