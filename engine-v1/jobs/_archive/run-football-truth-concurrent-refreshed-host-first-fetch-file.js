import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DIAG_ROOT = path.join(ROOT, "data", "football-truth", "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `concurrent-refreshed-host-first-fetch-${DATE}`);

const args = new Set(process.argv.slice(2));
if (!args.has("--allow-fetch")) throw new Error("Refusing concurrent fetch without --allow-fetch");

const MAX_FETCHES = Number(process.env.CONCURRENT_HOST_FIRST_FETCH_MAX || "955");
const CONCURRENCY = Number(process.env.CONCURRENT_HOST_FIRST_FETCH_CONCURRENCY || "24");
const TIMEOUT_MS = Number(process.env.CONCURRENT_HOST_FIRST_FETCH_TIMEOUT_MS || "6500");

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

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function snippet(text, index, radius = 260) {
  const flat = String(text || "").replace(/\s+/g, " ");
  return flat.slice(Math.max(0, index - radius), Math.min(flat.length, index + radius)).trim();
}

function contentUseful(contentType) {
  const c = norm(contentType);
  return c.includes("text/html") || c.includes("application/json") || c.includes("text/plain") || c.includes("javascript") || c.includes("application/ld+json");
}

function countSignals(text, signals) {
  const n = norm(text);
  return signals.filter((s) => n.includes(s)).length;
}

const standingSignals = ["standings","standing","table","ranking","rank","classification","classifica","classement","tabelle","tabell","played","won","draw","lost","points","pts","goals"];
const startSignals = ["season","campaign","calendar","fixture","fixtures","schedule","matchday","round","start","starts","begin","begins","opening","kick off","kicks off","2026/27","2026-27","2026-2027"];

const dateRegexes = [
  /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(2026|2027)\b/gi,
  /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(2026|2027)\b/gi,
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
      const context = snippet(flat, m.index || 0, 300);
      out.push({
        competitionSlug: row.competitionSlug,
        taskType: row.taskType,
        officialHost: row.officialHost,
        sourceUrl: row.fetchUrl,
        finalUrl: row.finalUrl,
        dateText,
        governedStartMention: governedStartContext(context),
        context
      });
    }
  }
  return out;
}

function extractTables(row, text) {
  const tableCount = (String(text).match(/<table\b/gi) || []).length;
  const trCount = (String(text).match(/<tr\b/gi) || []).length;
  const standingSignalCount = countSignals(text, standingSignals);
  if (tableCount <= 0 && standingSignalCount < 5) return null;
  const n = norm(text);
  return {
    competitionSlug: row.competitionSlug,
    taskType: row.taskType,
    officialHost: row.officialHost,
    sourceUrl: row.fetchUrl,
    finalUrl: row.finalUrl,
    tableCount,
    trCount,
    standingSignalCount,
    startSignalCount: countSignals(text, startSignals),
    hasSeason2025Signal: n.includes("2025") || n.includes("2025/26") || n.includes("2025-2026"),
    hasSeason2026Signal: n.includes("2026") || n.includes("2026/27") || n.includes("2026-2027"),
    materializationLane: tableCount > 0 ? "table_schema_review" : "route_or_embedded_review"
  };
}

function extractHints(row, text) {
  const rawText = String(text || "");
  const set = new Set();
  for (const m of rawText.matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)) set.add(m[0]);
  for (const m of rawText.matchAll(/["'](\/[^"']*(?:api|standings|standing|table|ranking|classification|fixtures|calendar|schedule|matches)[^"']*)["']/gi)) {
    try {
      const base = new URL(row.finalUrl || row.fetchUrl);
      set.add(new URL(m[1], `${base.protocol}//${base.host}`).toString());
    } catch {}
  }

  const out = [];
  for (const raw of set) {
    let u;
    try { u = new URL(raw); } catch { continue; }
    if (raw.length > 420) continue;
    if (/\.(png|jpg|jpeg|svg|gif|webp|woff|woff2|css|ico)(\?|$)/i.test(u.pathname)) continue;
    if (/%7b|%22|%3c|%3e|\{|\}|<|>/i.test(raw)) continue;

    const hintHost = hostFromUrl(u.toString());
    const officialHost = String(row.officialHost || "").replace(/^www\./, "").toLowerCase();
    const officialish = hintHost === officialHost || hintHost.endsWith(`.${officialHost}`) || officialHost.endsWith(`.${hintHost}`);
    if (!officialish) continue;

    const p = decodeURIComponent(u.pathname + u.search).toLowerCase();
    const isApi = hintHost.startsWith("api.") || p.includes("/api/") || p.includes("graphql");
    const standings = /(standings|standing|table|ranking|classification|classifica|classement)/.test(p);
    const schedule = /(fixtures|fixture|calendar|schedule|matches|matchday)/.test(p);
    if (!isApi && !standings && !schedule) continue;

    out.push({
      competitionSlug: row.competitionSlug,
      taskType: row.taskType,
      officialHost,
      sourceUrl: row.fetchUrl,
      apiUrl: u.toString(),
      hintKind: isApi ? "api_endpoint_hint" : standings ? "standing_route_hint" : "schedule_or_calendar_route_hint"
    });
  }
  return out;
}

function findStandingArrays(obj, parts = []) {
  const out = [];
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    if (obj.length >= 8 && obj.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const keys = new Set(obj.flatMap((x) => Object.keys(x || {}).map((k) => k.toLowerCase())));
      const hasTeam = [...keys].some((k) => /(team|club|name|participant|competitor)/.test(k));
      const hasPoints = [...keys].some((k) => /(point|pts|rank|position|played|won|draw|lost|goal)/.test(k));
      if (hasTeam && hasPoints) out.push({ arrayPath: parts.join(".") || "$", arrayLength: obj.length, sampleKeys: Object.keys(obj[0] || {}).slice(0, 40), sampleItem: obj[0] });
    }
    for (const [i, v] of obj.slice(0, 25).entries()) out.push(...findStandingArrays(v, [...parts, String(i)]));
    return out;
  }
  for (const [k, v] of Object.entries(obj).slice(0, 140)) out.push(...findStandingArrays(v, [...parts, k]));
  return out;
}

async function fetchOne(input) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(input.fetchUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 football-truth-concurrent-host-first/1.0",
        "accept": "text/html,application/json,text/plain,*/*"
      }
    });
    const contentType = res.headers.get("content-type") || "";
    const finalUrl = res.url || input.fetchUrl;
    const text = contentUseful(contentType) ? await res.text() : "";
    const row = {
      ...input,
      fetchStatus: res.ok ? "fetched_2xx" : res.status >= 300 && res.status < 400 ? "fetched_3xx" : "fetched_non_2xx",
      httpStatus: res.status,
      finalUrl,
      contentType,
      contentLength: text.length,
      standingSignalCount: countSignals(text, standingSignals),
      startSignalCount: countSignals(text, startSignals),
      title: (text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 180)
    };

    const dates = text ? extractDates(row, text) : [];
    const table = text ? extractTables(row, text) : null;
    const hints = text ? extractHints(row, text) : [];
    const standingArrays = [];

    if (text && /json/i.test(contentType)) {
      try {
        const parsed = JSON.parse(text);
        for (const a of findStandingArrays(parsed)) {
          standingArrays.push({
            competitionSlug: row.competitionSlug,
            taskType: row.taskType,
            officialHost: row.officialHost,
            sourceUrl: row.fetchUrl,
            finalUrl: row.finalUrl,
            httpStatus: row.httpStatus,
            contentType: row.contentType,
            ...a
          });
        }
      } catch {}
    }

    return { row, dates, table, hints, standingArrays };
  } catch (error) {
    return {
      row: {
        ...input,
        fetchStatus: "fetch_failed",
        errorName: error?.name || "Error",
        errorMessage: String(error?.message || error).slice(0, 240)
      },
      dates: [],
      table: null,
      hints: [],
      standingArrays: []
    };
  } finally {
    clearTimeout(timer);
  }
}

function dedupe(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, r);
  }
  return [...map.values()];
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
      if (done % 50 === 0 || done === items.length) {
        console.error(`FETCH_PROGRESS ${done}/${items.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, loop));
  return results;
}

ensureDir(OUT_DIR);

const packPath = latestFile(/refreshed-host-first-controlled-fetch-pack-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!packPath) throw new Error("Missing refreshed host-first controlled fetch pack");

const inputs = readJsonl(packPath).slice(0, MAX_FETCHES);
const results = await runPool(inputs, fetchOne, CONCURRENCY);

const fetchRows = results.map((r) => r.row);
const dateCandidates = dedupe(results.flatMap((r) => r.dates), (r) => `${r.competitionSlug}|${r.dateText}|${r.finalUrl}`);
const governedDateCandidates = dateCandidates.filter((r) => r.governedStartMention);
const tableCandidates = dedupe(results.map((r) => r.table).filter(Boolean), (r) => `${r.competitionSlug}|${r.finalUrl}|${r.taskType}`);
const apiHints = dedupe(results.flatMap((r) => r.hints), (r) => `${r.competitionSlug}|${r.apiUrl}`);
const standingApiCandidates = dedupe(results.flatMap((r) => r.standingArrays), (r) => `${r.competitionSlug}|${r.finalUrl}|${r.arrayPath}`);

tableCandidates.sort((a, b) => b.tableCount - a.tableCount || b.trCount - a.trCount || b.standingSignalCount - a.standingSignalCount || String(a.competitionSlug).localeCompare(String(b.competitionSlug)));
apiHints.sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)) || String(a.hintKind).localeCompare(String(b.hintKind)));
governedDateCandidates.sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const bySlug = {};
for (const r of fetchRows) {
  const s = r.competitionSlug || "unknown";
  bySlug[s] ||= { competitionSlug: s, fetchCount: 0, fetched2xx: 0, usefulStanding: 0, usefulStart: 0, tableCandidates: 0, apiHints: 0, governedDates: 0 };
  bySlug[s].fetchCount += 1;
  if (r.fetchStatus === "fetched_2xx") bySlug[s].fetched2xx += 1;
  if ((r.standingSignalCount || 0) >= 4) bySlug[s].usefulStanding += 1;
  if ((r.startSignalCount || 0) >= 4) bySlug[s].usefulStart += 1;
}
for (const r of tableCandidates) bySlug[r.competitionSlug] && (bySlug[r.competitionSlug].tableCandidates += 1);
for (const r of apiHints) bySlug[r.competitionSlug] && (bySlug[r.competitionSlug].apiHints += 1);
for (const r of governedDateCandidates) bySlug[r.competitionSlug] && (bySlug[r.competitionSlug].governedDates += 1);

const slugScores = Object.values(bySlug)
  .map((r) => ({ ...r, score: r.fetched2xx * 2 + r.usefulStanding * 4 + r.usefulStart * 3 + r.tableCandidates * 10 + r.apiHints * 2 + r.governedDates * 20 }))
  .sort((a, b) => b.score - a.score || a.competitionSlug.localeCompare(b.competitionSlug));

const summary = {
  status: "passed",
  runner: "concurrent_refreshed_host_first_fetch",
  sourceFetchPackPath: rel(packPath),
  inputFetchUrlCount: inputs.length,
  concurrency: CONCURRENCY,
  timeoutMs: TIMEOUT_MS,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: inputs.length,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  fetched2xxOr3xxCount: fetchRows.filter((r) => ["fetched_2xx", "fetched_3xx"].includes(r.fetchStatus)).length,
  fetched2xxCount: fetchRows.filter((r) => r.fetchStatus === "fetched_2xx").length,
  fetchFailureCount: fetchRows.filter((r) => r.fetchStatus === "fetch_failed").length,
  usefulStartSignalFetchCount: fetchRows.filter((r) => (r.startSignalCount || 0) >= 4).length,
  usefulStandingsSignalFetchCount: fetchRows.filter((r) => (r.standingSignalCount || 0) >= 4).length,
  startDateCandidateCount: dateCandidates.length,
  governedStartDateCandidateCount: governedDateCandidates.length,
  standingsTableCandidateCount: tableCandidates.length,
  trueHtmlTableCandidateCount: tableCandidates.filter((r) => r.tableCount > 0).length,
  standingApiCandidateCount: standingApiCandidates.length,
  apiHintCount: apiHints.length,
  apiHintSlugCount: new Set(apiHints.map((r) => r.competitionSlug)).size,
  candidateSlugCount: new Set([...tableCandidates, ...governedDateCandidates, ...standingApiCandidates].map((r) => r.competitionSlug)).size,
  topCandidateSlugs: slugScores.slice(0, 30).map((r) => r.competitionSlug),
  recommendedNextLane:
    governedDateCandidates.length > 0 ? "strict_review_concurrent_start_date_candidates" :
    standingApiCandidates.length > 0 ? "review_standing_api_candidates_for_adapter_proofs" :
    tableCandidates.filter((r) => r.tableCount > 0).length > 0 ? "bulk_table_schema_review_for_true_html_table_candidates" :
    apiHints.length > 0 ? "bulk_controlled_api_hint_fetch_wave" :
    "expand_official_host_registry"
};

const outPath = path.join(OUT_DIR, `concurrent-refreshed-host-first-fetch-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `concurrent-refreshed-host-first-fetch-rows-${DATE}.jsonl`);
const datesPath = path.join(OUT_DIR, `concurrent-refreshed-host-first-start-date-candidates-${DATE}.jsonl`);
const tablesPath = path.join(OUT_DIR, `concurrent-refreshed-host-first-table-candidates-${DATE}.jsonl`);
const apiHintsPath = path.join(OUT_DIR, `concurrent-refreshed-host-first-api-hints-${DATE}.jsonl`);
const standingApiPath = path.join(OUT_DIR, `concurrent-refreshed-host-first-standing-api-candidates-${DATE}.jsonl`);
const slugScoresPath = path.join(OUT_DIR, `concurrent-refreshed-host-first-slug-scores-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  topSlugScores: slugScores.slice(0, 100),
  topGovernedStartDateCandidates: governedDateCandidates.slice(0, 100),
  topTableCandidates: tableCandidates.slice(0, 160),
  topStandingApiCandidates: standingApiCandidates.slice(0, 100),
  topApiHints: apiHints.slice(0, 200),
  topFetchRows: fetchRows.filter((r) => (r.startSignalCount || 0) >= 4 || (r.standingSignalCount || 0) >= 4).slice(0, 200)
}, null, 2) + "\n", "utf8");

fs.writeFileSync(rowsPath, fetchRows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
fs.writeFileSync(datesPath, dateCandidates.map((r) => JSON.stringify(r)).join("\n") + (dateCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(tablesPath, tableCandidates.map((r) => JSON.stringify(r)).join("\n") + (tableCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(apiHintsPath, apiHints.map((r) => JSON.stringify(r)).join("\n") + (apiHints.length ? "\n" : ""), "utf8");
fs.writeFileSync(standingApiPath, standingApiCandidates.map((r) => JSON.stringify(r)).join("\n") + (standingApiCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(slugScoresPath, slugScores.map((r) => JSON.stringify(r)).join("\n") + (slugScores.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  startDateCandidatesOutput: rel(datesPath),
  tableCandidatesOutput: rel(tablesPath),
  apiHintsOutput: rel(apiHintsPath),
  standingApiCandidatesOutput: rel(standingApiPath),
  slugScoresOutput: rel(slugScoresPath),
  summary
}, null, 2));
