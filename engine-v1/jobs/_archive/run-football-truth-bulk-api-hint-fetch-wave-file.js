import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `bulk-api-hint-fetch-wave-${DATE}`);

const args = new Set(process.argv.slice(2));
if (!args.has("--allow-fetch")) throw new Error("Refusing API hint fetch wave without --allow-fetch");

const MAX_HINTS = Number(process.env.BULK_API_HINT_FETCH_MAX || "666");
const CONCURRENCY = Number(process.env.BULK_API_HINT_FETCH_CONCURRENCY || "24");
const TIMEOUT_MS = Number(process.env.BULK_API_HINT_FETCH_TIMEOUT_MS || "6500");

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function rel(p) { return path.relative(ROOT, p).replaceAll("\\", "/"); }
function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
function latestFile(re) {
  const files = walk(DIAG_ROOT).filter((f) => re.test(f));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
}
function readJsonl(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}
function norm(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function snippet(text, index, radius = 260) {
  const flat = String(text || "").replace(/\s+/g, " ");
  return flat.slice(Math.max(0, index - radius), Math.min(flat.length, index + radius)).trim();
}
function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
function isProbablyFetchableHint(url) {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    if (url.length > 500) return false;
    if (/%7b|%7d|\{|\}|<|>|\%22/i.test(url)) return false;
    if (/\.(png|jpg|jpeg|svg|gif|webp|woff|woff2|css|ico|mp4|pdf)(\?|$)/i.test(u.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}
function countSignals(text, sigs) {
  const n = norm(text);
  return sigs.filter((s) => n.includes(s)).length;
}

const standingSignals = ["standings","standing","table","ranking","rank","classification","classifica","classement","tabelle","played","won","draw","lost","points","pts","goals","team","club"];
const startSignals = ["season","campaign","calendar","fixture","fixtures","schedule","matchday","round","start","starts","begin","begins","opening","kick off","kicks off","2026/27","2026-27","2026-2027"];

const dateRegexes = [
  /\b(?:Monday|Tuesday|Wednesday|Friday|Saturday|Sunday|Thursday)?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(2026|2027)\b/gi,
  /\b(?:Monday|Tuesday|Wednesday|Friday|Saturday|Sunday|Thursday)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(2026|2027)\b/gi,
  /\b(2026|2027)[-/.](\d{1,2})[-/.](\d{1,2})\b/g,
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](2026|2027)\b/g
];

function governedStartContext(ctx) {
  const n = norm(ctx);
  const hasSeason = /\b(season|campaign|league|competition|calendar|fixture|fixtures|schedule|matchweek|round|matchday)\b/.test(n);
  const hasStart = /\b(start|starts|starting|begin|begins|beginning|opening|opens|kick off|kicks off|commence|commences|launch|launches)\b/.test(n);
  const bad = /\b(end|ends|ending|conclude|concludes|finish|finishes|final day|final round|published|updated|copyright|privacy|cookie)\b/.test(n);
  return hasSeason && hasStart && !bad;
}
function extractDates(row, text) {
  const flat = String(text || "").replace(/\s+/g, " ");
  const out = [];
  for (const re of dateRegexes) {
    re.lastIndex = 0;
    for (const m of flat.matchAll(re)) {
      const dateText = m[0].trim();
      if (!/(2026|2027)/.test(dateText)) continue;
      const context = snippet(flat, m.index || 0, 320);
      out.push({
        competitionSlug: row.competitionSlug,
        taskType: row.taskType,
        officialHost: row.officialHost,
        hintKind: row.hintKind,
        apiUrl: row.apiUrl,
        finalUrl: row.finalUrl,
        dateText,
        governedStartMention: governedStartContext(context),
        context
      });
    }
  }
  return out;
}

function findStandingArrays(obj, parts = [], depth = 0) {
  const out = [];
  if (!obj || typeof obj !== "object" || depth > 8) return out;
  if (Array.isArray(obj)) {
    if (obj.length >= 8 && obj.length <= 80 && obj.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const keys = new Set(obj.flatMap((x) => Object.keys(x || {}).map((k) => k.toLowerCase())));
      const hasTeam = [...keys].some((k) => /(team|club|squad|name|participant|competitor|shortname|displayname)/.test(k));
      const hasTableStats = [...keys].some((k) => /(point|pts|rank|position|played|matches|won|draw|lost|goal|for|against)/.test(k));
      const hasAtLeastThreeStats = ["point|pts", "played|matches|games", "won|wins", "draw", "lost|loss", "goal", "rank|position"].filter((p) => [...keys].some((k) => new RegExp(p).test(k))).length >= 3;
      if (hasTeam && hasTableStats && hasAtLeastThreeStats) {
        out.push({ arrayPath: parts.join(".") || "$", arrayLength: obj.length, sampleKeys: Object.keys(obj[0] || {}).slice(0, 60), sampleItem: obj[0] });
      }
    }
    for (const [i, v] of obj.slice(0, 30).entries()) out.push(...findStandingArrays(v, [...parts, String(i)], depth + 1));
    return out;
  }
  for (const [k, v] of Object.entries(obj).slice(0, 160)) out.push(...findStandingArrays(v, [...parts, k], depth + 1));
  return out;
}

function extractHtmlTableSignal(row, text) {
  const tableCount = (String(text || "").match(/<table\b/gi) || []).length;
  const trCount = (String(text || "").match(/<tr\b/gi) || []).length;
  const standingSignalCount = countSignals(text, standingSignals);
  if (tableCount <= 0 && standingSignalCount < 6) return null;
  return {
    competitionSlug: row.competitionSlug,
    taskType: row.taskType,
    officialHost: row.officialHost,
    hintKind: row.hintKind,
    apiUrl: row.apiUrl,
    finalUrl: row.finalUrl,
    tableCount,
    trCount,
    standingSignalCount,
    startSignalCount: countSignals(text, startSignals),
    has2025: norm(text).includes("2025"),
    has2026: norm(text).includes("2026")
  };
}

function dedupe(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()];
}

async function fetchOne(hint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(hint.apiUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 football-truth-bulk-api-hint-fetch/1.0",
        "accept": "application/json,text/html,text/plain,*/*"
      }
    });
    const contentType = res.headers.get("content-type") || "";
    const text = /json|html|text|javascript/i.test(contentType) ? await res.text() : "";
    const base = {
      ...hint,
      fetchStatus: res.ok ? "fetched_2xx" : res.status >= 300 && res.status < 400 ? "fetched_3xx" : "fetched_non_2xx",
      httpStatus: res.status,
      finalUrl: res.url || hint.apiUrl,
      contentType,
      contentLength: text.length,
      standingSignalCount: countSignals(text, standingSignals),
      startSignalCount: countSignals(text, startSignals),
      title: (text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 180)
    };

    const dates = text ? extractDates(base, text) : [];
    const table = text ? extractHtmlTableSignal(base, text) : null;
    const arrays = [];

    if (text && /json/i.test(contentType)) {
      try {
        const json = JSON.parse(text);
        for (const a of findStandingArrays(json)) arrays.push({ ...base, ...a });
      } catch {}
    }

    return { row: base, dates, table, arrays };
  } catch (error) {
    return {
      row: {
        ...hint,
        fetchStatus: "fetch_failed",
        errorName: error?.name || "Error",
        errorMessage: String(error?.message || error).slice(0, 240)
      },
      dates: [],
      table: null,
      arrays: []
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let next = 0;
  let done = 0;
  async function loop() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
      done++;
      if (done % 50 === 0 || done === items.length) console.error(`API_HINT_FETCH_PROGRESS ${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
  return results;
}

ensureDir(OUT_DIR);

const hintsPath = latestFile(/concurrent-refreshed-host-first-api-hints-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!hintsPath) throw new Error("Missing concurrent host-first API hints file");

const rawHints = readJsonl(hintsPath).filter((h) => h.apiUrl && isProbablyFetchableHint(h.apiUrl));
const hostOfficial = rawHints.filter((h) => {
  const official = String(h.officialHost || "").replace(/^www\./, "").toLowerCase();
  const hh = hostFromUrl(h.apiUrl);
  return official && (hh === official || hh.endsWith(`.${official}`) || official.endsWith(`.${hh}`));
});
const unique = dedupe(hostOfficial, (h) => `${h.competitionSlug}|${h.taskType}|${h.apiUrl}`);
unique.sort((a, b) =>
  Number(b.hintKind === "api_endpoint_hint") - Number(a.hintKind === "api_endpoint_hint") ||
  Number(b.hintKind === "standing_route_hint") - Number(a.hintKind === "standing_route_hint") ||
  String(a.competitionSlug).localeCompare(String(b.competitionSlug)) ||
  String(a.apiUrl).localeCompare(String(b.apiUrl))
);

const selected = unique.slice(0, MAX_HINTS);
const results = await runPool(selected, fetchOne, CONCURRENCY);

const rows = results.map((r) => r.row);
const standingArrays = dedupe(results.flatMap((r) => r.arrays), (r) => `${r.competitionSlug}|${r.finalUrl}|${r.arrayPath}`);
const dates = dedupe(results.flatMap((r) => r.dates), (r) => `${r.competitionSlug}|${r.finalUrl}|${r.dateText}`);
const governedDates = dates.filter((r) => r.governedStartMention);
const tableSignals = dedupe(results.map((r) => r.table).filter(Boolean), (r) => `${r.competitionSlug}|${r.finalUrl}`);

const bySlug = {};
for (const r of rows) {
  const s = r.competitionSlug || "unknown";
  bySlug[s] ||= { competitionSlug: s, fetchCount: 0, fetched2xx: 0, api2xx: 0, standingArrays: 0, tableSignals: 0, governedDates: 0, usefulStanding: 0, usefulStart: 0 };
  bySlug[s].fetchCount++;
  if (r.fetchStatus === "fetched_2xx") bySlug[s].fetched2xx++;
  if (/json/i.test(r.contentType || "") && r.fetchStatus === "fetched_2xx") bySlug[s].api2xx++;
  if ((r.standingSignalCount || 0) >= 5) bySlug[s].usefulStanding++;
  if ((r.startSignalCount || 0) >= 5) bySlug[s].usefulStart++;
}
for (const r of standingArrays) bySlug[r.competitionSlug] && bySlug[r.competitionSlug].standingArrays++;
for (const r of tableSignals) bySlug[r.competitionSlug] && bySlug[r.competitionSlug].tableSignals++;
for (const r of governedDates) bySlug[r.competitionSlug] && bySlug[r.competitionSlug].governedDates++;

const slugScores = Object.values(bySlug).map((r) => ({
  ...r,
  score: r.fetched2xx * 2 + r.api2xx * 4 + r.standingArrays * 30 + r.tableSignals * 10 + r.governedDates * 25 + r.usefulStanding * 4 + r.usefulStart * 3
})).sort((a, b) => b.score - a.score || a.competitionSlug.localeCompare(b.competitionSlug));

standingArrays.sort((a, b) => b.arrayLength - a.arrayLength || String(a.competitionSlug).localeCompare(String(b.competitionSlug)));
tableSignals.sort((a, b) => b.tableCount - a.tableCount || b.trCount - a.trCount || b.standingSignalCount - a.standingSignalCount);
governedDates.sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const summary = {
  status: "passed",
  runner: "bulk_api_hint_fetch_wave",
  sourceApiHintsPath: rel(hintsPath),
  rawApiHintCount: rawHints.length,
  officialHostApiHintCount: hostOfficial.length,
  uniqueFetchableApiHintCount: unique.length,
  inputFetchUrlCount: selected.length,
  concurrency: CONCURRENCY,
  timeoutMs: TIMEOUT_MS,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: selected.length,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  fetched2xxCount: rows.filter((r) => r.fetchStatus === "fetched_2xx").length,
  fetchedJson2xxCount: rows.filter((r) => r.fetchStatus === "fetched_2xx" && /json/i.test(r.contentType || "")).length,
  fetchFailureCount: rows.filter((r) => r.fetchStatus === "fetch_failed").length,
  usefulStandingFetchCount: rows.filter((r) => (r.standingSignalCount || 0) >= 5).length,
  usefulStartFetchCount: rows.filter((r) => (r.startSignalCount || 0) >= 5).length,
  standingApiCandidateCount: standingArrays.length,
  standingApiCandidateSlugCount: new Set(standingArrays.map((r) => r.competitionSlug)).size,
  tableSignalCandidateCount: tableSignals.length,
  governedStartDateCandidateCount: governedDates.length,
  startDateCandidateCount: dates.length,
  topCandidateSlugs: slugScores.slice(0, 40).map((r) => r.competitionSlug),
  recommendedNextLane:
    standingArrays.length > 0 ? "review_standing_api_candidates_for_adapter_proofs" :
    governedDates.length > 0 ? "strict_review_api_start_date_candidates" :
    tableSignals.length > 0 ? "bulk_table_schema_review_for_api_hint_html_tables" :
    "expand_host_first_pack_with_more_official_routes"
};

const outPath = path.join(OUT_DIR, `bulk-api-hint-fetch-wave-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `bulk-api-hint-fetch-wave-rows-${DATE}.jsonl`);
const arraysPath = path.join(OUT_DIR, `bulk-api-hint-standing-array-candidates-${DATE}.jsonl`);
const datesPath = path.join(OUT_DIR, `bulk-api-hint-start-date-candidates-${DATE}.jsonl`);
const tablesPath = path.join(OUT_DIR, `bulk-api-hint-table-signal-candidates-${DATE}.jsonl`);
const scoresPath = path.join(OUT_DIR, `bulk-api-hint-slug-scores-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, topSlugScores: slugScores.slice(0, 120), topStandingApiCandidates: standingArrays.slice(0, 120), topGovernedStartDateCandidates: governedDates.slice(0, 120), topTableSignals: tableSignals.slice(0, 160), topFetchRows: rows.filter((r) => (r.standingSignalCount || 0) >= 5 || (r.startSignalCount || 0) >= 5).slice(0, 200) }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""), "utf8");
fs.writeFileSync(arraysPath, standingArrays.map((r) => JSON.stringify(r)).join("\n") + (standingArrays.length ? "\n" : ""), "utf8");
fs.writeFileSync(datesPath, dates.map((r) => JSON.stringify(r)).join("\n") + (dates.length ? "\n" : ""), "utf8");
fs.writeFileSync(tablesPath, tableSignals.map((r) => JSON.stringify(r)).join("\n") + (tableSignals.length ? "\n" : ""), "utf8");
fs.writeFileSync(scoresPath, slugScores.map((r) => JSON.stringify(r)).join("\n") + (slugScores.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({ output: rel(outPath), rowsOutput: rel(rowsPath), standingApiCandidatesOutput: rel(arraysPath), startDateCandidatesOutput: rel(datesPath), tableSignalsOutput: rel(tablesPath), slugScoresOutput: rel(scoresPath), summary }, null, 2));
