import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `controlled-refreshed-host-first-fetch-${DATE}`);
const args = new Set(process.argv.slice(2));

const MAX_FETCHES = Number(process.env.REFRESHED_HOST_FIRST_FETCH_MAX || "955");
const TIMEOUT_MS = Number(process.env.REFRESHED_HOST_FIRST_FETCH_TIMEOUT_MS || "12000");

if (!args.has("--allow-fetch")) {
  throw new Error("Refusing controlled host-first fetch without --allow-fetch");
}

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
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function latestFile(pattern) {
  const files = walk(DIAG_ROOT).filter((file) => pattern.test(file));
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || null;
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

function safeSnippet(text, index, radius = 220) {
  const s = String(text || "").replace(/\s+/g, " ");
  const start = Math.max(0, index - radius);
  const end = Math.min(s.length, index + radius);
  return s.slice(start, end).trim();
}

function looksUsefulContentType(contentType) {
  const c = normalizeText(contentType);
  return c.includes("text/html") || c.includes("application/json") || c.includes("text/plain") || c.includes("application/ld+json") || c.includes("javascript");
}

function hasStandingSignals(text) {
  const n = normalizeText(text);
  const signals = ["standings", "table", "ranking", "classification", "classifica", "classement", "tabell", "tabelle", "pts", "points", "played", "won", "drawn", "lost"];
  return signals.filter((s) => n.includes(s)).length;
}

function hasStartSignals(text) {
  const n = normalizeText(text);
  const signals = ["season", "campaign", "calendar", "fixtures", "schedule", "starts", "start", "begin", "begins", "opening", "kick off", "kicks off", "2026/27", "2026-27", "2026-2027"];
  return signals.filter((s) => n.includes(s)).length;
}

const dateRegexes = [
  /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(2026|2027)\b/gi,
  /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(2026|2027)\b/gi,
  /\b(2026|2027)[-/.](\d{1,2})[-/.](\d{1,2})\b/g,
  /\b(\d{1,2})[-/.](\d{1,2})[-/.](2026|2027)\b/g
];

function isGovernedStartDateContext(context) {
  const n = normalizeText(context);
  const hasSeason = /\b(season|campaign|league|competition|calendar|fixture|fixtures|schedule|matchweek|round|matchday)\b/.test(n);
  const hasStart = /\b(start|starts|starting|begin|begins|beginning|opening|opens|kick off|kicks off|commence|commences|launch|launches)\b/.test(n);
  const hasEnd = /\b(end|ends|ending|conclude|concludes|finish|finishes|final day|final round|last round)\b/.test(n);
  const articleDate = /\b(published|updated|copyright|privacy|cookie|released on|release day)\b/.test(n);
  return hasSeason && hasStart && !articleDate && !hasEnd;
}

function extractStartDateCandidates(row, text) {
  const out = [];
  const flat = String(text || "").replace(/\s+/g, " ");
  for (const re of dateRegexes) {
    re.lastIndex = 0;
    for (const m of flat.matchAll(re)) {
      const dateText = m[0].trim();
      const context = safeSnippet(flat, m.index || 0, 260);
      const governedStartMention = isGovernedStartDateContext(context);
      if (!/(2026|2027)/.test(dateText)) continue;
      out.push({
        competitionSlug: row.competitionSlug,
        taskType: row.taskType,
        officialHost: row.officialHost,
        sourceUrl: row.fetchUrl,
        finalUrl: row.finalUrl || row.fetchUrl,
        dateText,
        governedStartMention,
        context
      });
    }
  }
  return out;
}

function extractApiHints(row, text) {
  const flat = String(text || "");
  const candidates = new Set();

  const urlRe = /https?:\/\/[^\s"'<>\\)]+/gi;
  for (const m of flat.matchAll(urlRe)) {
    candidates.add(m[0]);
  }

  const pathRe = /["'](\/[^"']*(?:api|standings|table|ranking|classification|fixtures|calendar|schedule)[^"']*)["']/gi;
  for (const m of flat.matchAll(pathRe)) {
    try {
      const base = new URL(row.finalUrl || row.fetchUrl);
      candidates.add(new URL(m[1], `${base.protocol}//${base.host}`).toString());
    } catch {}
  }

  const out = [];
  for (const raw of candidates) {
    let u;
    try { u = new URL(raw); } catch { continue; }
    const h = hostFromUrl(u.toString());
    const p = decodeURIComponent(u.pathname + u.search).toLowerCase();
    const rawLower = raw.toLowerCase();

    if (/%20|%7b|%22|%3c|%3e|\{|\}|<|>|computeviewport|blocklayout|navigationtype/i.test(raw)) continue;
    if (raw.length > 360) continue;
    if (/\.(png|jpg|jpeg|svg|gif|webp|woff|woff2|ttf|css)(\?|$)/i.test(u.pathname)) continue;

    const isApi = h.startsWith("api.") || p.includes("/api/") || p.includes("graphql") || p.includes("standings") || p.includes("fixtures") || p.includes("calendar") || p.includes("ranking") || p.includes("classification") || p.includes("table");
    if (!isApi) continue;

    const officialish = h === row.officialHost || h.endsWith(`.${row.officialHost}`) || row.officialHost.endsWith(`.${h}`);
    if (!officialish) continue;

    out.push({
      competitionSlug: row.competitionSlug,
      taskType: row.taskType,
      officialHost: row.officialHost,
      sourceUrl: row.fetchUrl,
      apiUrl: u.toString(),
      hintKind:
        h.startsWith("api.") || p.includes("/api/") ? "api_endpoint_hint" :
        p.includes("standings") || p.includes("ranking") || p.includes("classification") || p.includes("table") ? "standing_route_hint" :
        "schedule_or_calendar_route_hint"
    });
  }

  return out;
}

function extractTableCandidate(row, text) {
  const n = normalizeText(text);
  const tableCount = (String(text).match(/<table\b/gi) || []).length;
  const trCount = (String(text).match(/<tr\b/gi) || []).length;
  const standingSignalCount = hasStandingSignals(text);
  if (tableCount <= 0 && standingSignalCount < 4) return null;
  return {
    competitionSlug: row.competitionSlug,
    taskType: row.taskType,
    officialHost: row.officialHost,
    sourceUrl: row.fetchUrl,
    finalUrl: row.finalUrl || row.fetchUrl,
    tableCount,
    trCount,
    standingSignalCount,
    hasSeason2025Signal: n.includes("2025") || n.includes("2025-2026") || n.includes("2025/26"),
    hasSeason2026Signal: n.includes("2026") || n.includes("2026-2027") || n.includes("2026/27"),
    materializationLane: tableCount > 0 ? "browser_table_schema_review" : "route_or_embedded_review"
  };
}

function findStandingArrays(obj, pathParts = []) {
  const out = [];
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    if (obj.length >= 8 && obj.every((x) => x && typeof x === "object" && !Array.isArray(x))) {
      const keys = new Set(obj.flatMap((x) => Object.keys(x || {}).map((k) => k.toLowerCase())));
      const hasTeam = [...keys].some((k) => /(team|club|name|participant|competitor)/.test(k));
      const hasPoints = [...keys].some((k) => /(point|pts|rank|position|played|won|draw|lost|goals)/.test(k));
      if (hasTeam && hasPoints) {
        out.push({
          arrayPath: pathParts.join(".") || "$",
          arrayLength: obj.length,
          sampleKeys: Object.keys(obj[0] || {}).slice(0, 40),
          sampleItem: obj[0]
        });
      }
    }
    obj.slice(0, 30).forEach((v, i) => out.push(...findStandingArrays(v, [...pathParts, String(i)])));
    return out;
  }
  for (const [k, v] of Object.entries(obj).slice(0, 120)) {
    out.push(...findStandingArrays(v, [...pathParts, k]));
  }
  return out;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 football-truth-controlled-fetch/1.0",
        "accept": "text/html,application/json,text/plain,*/*"
      }
    });
    const contentType = res.headers.get("content-type") || "";
    const finalUrl = res.url || url;
    let text = "";
    if (looksUsefulContentType(contentType)) {
      text = await res.text();
    }
    return {
      ok: res.ok,
      status: res.status,
      finalUrl,
      contentType,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

ensureDir(OUT_DIR);

const fetchPackPath = latestFile(/refreshed-host-first-controlled-fetch-pack-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!fetchPackPath) throw new Error("Missing refreshed host-first controlled fetch pack");

const inputRows = parseJsonlSafe(fetchPackPath).slice(0, MAX_FETCHES);
const fetchRows = [];
const startDateCandidates = [];
const tableCandidates = [];
const apiHints = [];
const standingApiCandidates = [];

let fetchExecutedNowCount = 0;

for (const row of inputRows) {
  fetchExecutedNowCount += 1;
  let result;
  try {
    result = await fetchWithTimeout(row.fetchUrl);
  } catch (error) {
    fetchRows.push({
      ...row,
      fetchStatus: "fetch_failed",
      errorName: error?.name || "Error",
      errorMessage: String(error?.message || error).slice(0, 240)
    });
    continue;
  }

  const text = result.text || "";
  const fetchRow = {
    ...row,
    fetchStatus: result.ok ? "fetched_2xx" : result.status >= 300 && result.status < 400 ? "fetched_3xx" : "fetched_non_2xx",
    httpStatus: result.status,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    contentLength: text.length,
    standingSignalCount: hasStandingSignals(text),
    startSignalCount: hasStartSignals(text),
    title: (text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 180)
  };
  fetchRows.push(fetchRow);

  if (!text) continue;

  const starts = extractStartDateCandidates(fetchRow, text);
  startDateCandidates.push(...starts);

  const table = extractTableCandidate(fetchRow, text);
  if (table) tableCandidates.push(table);

  const hints = extractApiHints(fetchRow, text);
  apiHints.push(...hints);

  if ((result.contentType || "").toLowerCase().includes("json")) {
    try {
      const parsed = JSON.parse(text);
      const arrays = findStandingArrays(parsed);
      for (const a of arrays) {
        standingApiCandidates.push({
          competitionSlug: fetchRow.competitionSlug,
          taskType: fetchRow.taskType,
          officialHost: fetchRow.officialHost,
          sourceUrl: fetchRow.fetchUrl,
          finalUrl: fetchRow.finalUrl,
          httpStatus: fetchRow.httpStatus,
          contentType: fetchRow.contentType,
          ...a
        });
      }
    } catch {}
  }
}

function dedupeRows(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, row);
  }
  return [...map.values()];
}

const dedupedStartDateCandidates = dedupeRows(startDateCandidates, (r) => `${r.competitionSlug}|${r.dateText}|${r.finalUrl}`);
const dedupedGovernedStartDateCandidates = dedupedStartDateCandidates.filter((r) => r.governedStartMention);
const dedupedTableCandidates = dedupeRows(tableCandidates, (r) => `${r.competitionSlug}|${r.finalUrl}`);
const dedupedApiHints = dedupeRows(apiHints, (r) => `${r.competitionSlug}|${r.apiUrl}`);
const dedupedStandingApiCandidates = dedupeRows(standingApiCandidates, (r) => `${r.competitionSlug}|${r.finalUrl}|${r.arrayPath}`);

dedupedTableCandidates.sort((a, b) => b.standingSignalCount - a.standingSignalCount || b.trCount - a.trCount || String(a.competitionSlug).localeCompare(String(b.competitionSlug)));
dedupedApiHints.sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)) || String(a.hintKind).localeCompare(String(b.hintKind)));
dedupedGovernedStartDateCandidates.sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const summary = {
  status: "passed",
  runner: "controlled_refreshed_host_first_fetch",
  sourceFetchPackPath: rel(fetchPackPath),
  inputFetchUrlCount: inputRows.length,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  fetched2xxOr3xxCount: fetchRows.filter((r) => r.fetchStatus === "fetched_2xx" || r.fetchStatus === "fetched_3xx").length,
  fetched2xxCount: fetchRows.filter((r) => r.fetchStatus === "fetched_2xx").length,
  fetchFailureCount: fetchRows.filter((r) => r.fetchStatus === "fetch_failed").length,
  usefulStartSignalFetchCount: fetchRows.filter((r) => r.startSignalCount >= 4).length,
  usefulStandingsSignalFetchCount: fetchRows.filter((r) => r.standingSignalCount >= 4).length,
  startDateCandidateCount: dedupedStartDateCandidates.length,
  governedStartDateCandidateCount: dedupedGovernedStartDateCandidates.length,
  standingsTableCandidateCount: dedupedTableCandidates.length,
  standingApiCandidateCount: dedupedStandingApiCandidates.length,
  apiHintCount: dedupedApiHints.length,
  apiHintSlugCount: new Set(dedupedApiHints.map((r) => r.competitionSlug)).size,
  candidateSlugs: [...new Set([...dedupedTableCandidates, ...dedupedGovernedStartDateCandidates, ...dedupedStandingApiCandidates].map((r) => r.competitionSlug))].sort(),
  recommendedNextLane:
    dedupedStandingApiCandidates.length > 0 ? "review_standing_api_candidates_for_adapter_proofs" :
    dedupedGovernedStartDateCandidates.length > 0 ? "strict_review_refreshed_host_first_start_date_candidates" :
    dedupedTableCandidates.length > 0 ? "browser_schema_review_refreshed_host_first_table_candidates" :
    dedupedApiHints.length > 0 ? "controlled_fetch_refreshed_api_hints" :
    "expand_official_host_registry_or_unresolved_host_mining"
};

const outPath = path.join(OUT_DIR, `controlled-refreshed-host-first-fetch-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `controlled-refreshed-host-first-fetch-rows-${DATE}.jsonl`);
const startsPath = path.join(OUT_DIR, `controlled-refreshed-host-first-start-date-candidates-${DATE}.jsonl`);
const tablesPath = path.join(OUT_DIR, `controlled-refreshed-host-first-table-candidates-${DATE}.jsonl`);
const apiHintsPath = path.join(OUT_DIR, `controlled-refreshed-host-first-api-hints-${DATE}.jsonl`);
const standingApiPath = path.join(OUT_DIR, `controlled-refreshed-host-first-standing-api-candidates-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  topGovernedStartDateCandidates: dedupedGovernedStartDateCandidates.slice(0, 80),
  topTableCandidates: dedupedTableCandidates.slice(0, 120),
  topStandingApiCandidates: dedupedStandingApiCandidates.slice(0, 80),
  topApiHints: dedupedApiHints.slice(0, 160),
  topFetchRows: fetchRows
    .filter((r) => r.startSignalCount >= 4 || r.standingSignalCount >= 4)
    .sort((a, b) => (b.startSignalCount + b.standingSignalCount) - (a.startSignalCount + a.standingSignalCount))
    .slice(0, 160)
}, null, 2) + "\n", "utf8");

fs.writeFileSync(rowsPath, fetchRows.map((row) => JSON.stringify(row)).join("\n") + (fetchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(startsPath, dedupedStartDateCandidates.map((row) => JSON.stringify(row)).join("\n") + (dedupedStartDateCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(tablesPath, dedupedTableCandidates.map((row) => JSON.stringify(row)).join("\n") + (dedupedTableCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(apiHintsPath, dedupedApiHints.map((row) => JSON.stringify(row)).join("\n") + (dedupedApiHints.length ? "\n" : ""), "utf8");
fs.writeFileSync(standingApiPath, dedupedStandingApiCandidates.map((row) => JSON.stringify(row)).join("\n") + (dedupedStandingApiCandidates.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  startDateCandidatesOutput: rel(startsPath),
  tableCandidatesOutput: rel(tablesPath),
  apiHintsOutput: rel(apiHintsPath),
  standingApiCandidatesOutput: rel(standingApiPath),
  summary
}, null, 2));
