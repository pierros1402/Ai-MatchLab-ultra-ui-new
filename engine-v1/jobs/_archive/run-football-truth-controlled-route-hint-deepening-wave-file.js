import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `controlled-route-hint-deepening-wave-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-fetch")) throw new Error("Refusing controlled fetch without --allow-fetch");

const MAX_HINT_FETCHES = Number(process.env.ROUTE_HINT_MAX_FETCHES || "420");
const FETCH_TIMEOUT_MS = Number(process.env.ROUTE_HINT_FETCH_TIMEOUT_MS || "12000");
const MAX_BODY_CHARS_TO_ANALYZE = Number(process.env.ROUTE_HINT_MAX_BODY_CHARS_TO_ANALYZE || "650000");

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
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
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

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function pathSignal(url) {
  try {
    const u = new URL(url);
    return normalizeText(`${u.pathname} ${u.search}`);
  } catch {
    return "";
  }
}

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 240) : null;
}

function extractTables(html) {
  return String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
}

function inspectTables(html) {
  return extractTables(html).map((tableHtml, tableIndex) => {
    const rows = (tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).map((rowHtml) => {
      const cells = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [];
      return cells.map(stripHtml).filter(Boolean);
    }).filter((row) => row.length);
    const text = stripHtml(tableHtml);
    const n = normalizeText(text);
    const standingsSignal = ["standings","table","ranking","classifica","tabelle","points","played","won","drawn","lost","pts","gf","ga","gd"].some((term) => n.includes(term));
    const numericCount = rows.flat().filter((cell) => /^-?\d+$/.test(String(cell).replace(/[^\d-]/g, ""))).length;
    const dataLikeRowCount = rows.filter((row) => row.some((cell) => /[A-Za-zÀ-žΑ-ωԱ-Ֆა-ჰ]/.test(cell)) && row.map((cell) => String(cell).replace(/[^\d-]/g, "")).filter(Boolean).length >= 4).length;
    return {
      tableIndex,
      rowCount: rows.length,
      maxCellCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
      numericCount,
      dataLikeRowCount,
      standingsSignal,
      materializableTableCandidate: rows.length >= 10 && dataLikeRowCount >= 8 && numericCount >= 20 && standingsSignal,
      firstRows: rows.slice(0, 6)
    };
  }).sort((a, b) =>
    Number(b.materializableTableCandidate) - Number(a.materializableTableCandidate) ||
    Number(b.standingsSignal) - Number(a.standingsSignal) ||
    b.dataLikeRowCount - a.dataLikeRowCount ||
    b.numericCount - a.numericCount
  ).slice(0, 6);
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    try {
      const url = new URL(htmlDecode(m[1]), baseUrl).toString();
      out.push({ url, host: hostFromUrl(url), text: stripHtml(m[2]).slice(0, 160) });
    } catch {}
  }
  return out.slice(0, 600);
}

function extractApiUrlHints(html, baseUrl) {
  const out = new Set();
  const text = String(html || "");
  const patterns = [
    /["']([^"']*(?:api|ajax|graphql|standings|table|classification|ranking|fixtures|calendar|matches|seasons?)[^"']*)["']/gi,
    /\bhttps?:\/\/[^\s"'<>]+(?:api|standings|table|classification|ranking|fixtures|calendar|matches|seasons?)[^\s"'<>]*/gi
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(text))) {
      const raw = m[1] || m[0];
      if (!raw || raw.length > 700) continue;
      try {
        const url = new URL(htmlDecode(raw), baseUrl).toString();
        out.add(url);
      } catch {}
    }
  }
  return [...out].slice(0, 80).map((url) => ({ url, host: hostFromUrl(url), pathSignal: pathSignal(url) }));
}

function extractDateCandidates(text) {
  const source = String(text || "").replace(/\s+/g, " ");
  const month = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
  const dow = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?";
  const startTerms = "(?:start|starts|begin|begins|kick(?:s)? off|commence(?:s)?|opening|round 1|matchday 1)";
  const subjectTerms = "(?:season|league|competition|campaign|fixtures?|calendar|schedule|opening match|match round|round 1|matchday 1)";
  const patterns = [
    new RegExp(`\\b${subjectTerms}\\s+(?:will\\s+)?${startTerms}\\s+(?:on\\s+)?(${dow}\\s*\\d{1,2}\\s+${month}\\s+20\\d{2})`, "gi"),
    new RegExp(`\\b${startTerms}\\s+(?:on\\s+)?(${dow}\\s*\\d{1,2}\\s+${month}\\s+20\\d{2})`, "gi"),
    new RegExp(`\\b(${dow}\\s*${month}\\s+\\d{1,2},?\\s+20\\d{2})\\b.{0,160}\\b${subjectTerms}|\\b${subjectTerms}.{0,160}\\b(${dow}\\s*${month}\\s+\\d{1,2},?\\s+20\\d{2})`, "gi"),
    new RegExp(`\\b(\\d{1,2}\\s*[/.-]\\s*\\d{1,2}\\s*[/.-]\\s*20\\d{2})\\b.{0,160}\\b${subjectTerms}|\\b${subjectTerms}.{0,160}\\b(\\d{1,2}\\s*[/.-]\\s*\\d{1,2}\\s*[/.-]\\s*20\\d{2})`, "gi"),
    new RegExp(`\\b(20\\d{2}\\s*[-/]\\s*\\d{1,2}\\s*[-/]\\s*\\d{1,2})\\b.{0,160}\\b${subjectTerms}|\\b${subjectTerms}.{0,160}\\b(20\\d{2}\\s*[-/]\\s*\\d{1,2}\\s*[-/]\\s*\\d{1,2})`, "gi"),
    new RegExp(`\\b(\\d{1,2}\\s*/\\s*\\d{1,2}\\s+${month}\\s+20\\d{2})\\b.{0,180}\\b${subjectTerms}|\\b${subjectTerms}.{0,180}\\b(\\d{1,2}\\s*/\\s*\\d{1,2}\\s+${month}\\s+20\\d{2})`, "gi")
  ];

  const out = [];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(source))) {
      const dateText = (m[1] || m[2] || "").replace(/\s+/g, " ").trim();
      if (!dateText) continue;
      const start = Math.max(0, m.index - 220);
      const end = Math.min(source.length, m.index + m[0].length + 260);
      const context = source.slice(start, end).trim();
      const n = normalizeText(context);
      const governed =
        (n.includes("season") || n.includes("league") || n.includes("competition") || n.includes("campaign") || n.includes("fixture") || n.includes("calendar") || n.includes("schedule") || n.includes("opening") || n.includes("round") || n.includes("matchday")) &&
        (n.includes("start") || n.includes("begin") || n.includes("kick") || n.includes("commence") || n.includes("opening"));
      const reject =
        n.includes("published") || n.includes("updated") || n.includes("copyright") || n.includes("privacy") || n.includes("cookie") || n.includes("download");
      out.push({ dateText, context, governedStartMention: governed && !reject, rejectedAsPageOrArticleDate: reject });
    }
  }

  const seen = new Set();
  return out.filter((row) => {
    const key = `${row.dateText}|${row.context.slice(0, 140)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function findStandingArrays(value, pathParts = [], depth = 0, out = []) {
  if (depth > 7 || out.length > 40) return out;
  if (Array.isArray(value)) {
    const objectItems = value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (objectItems.length >= 8) {
      const keys = new Set(objectItems.flatMap((item) => Object.keys(item).map((key) => normalizeText(key))));
      const keyText = [...keys].join(" ");
      const hasTeam = ["team","club","teamname","team name","name"].some((k) => keyText.includes(k));
      const hasPoints = ["points","pts","point"].some((k) => keyText.includes(k));
      const hasPlayed = ["played","matches","matchplayed","games","p"].some((k) => keyText.includes(k));
      const hasRank = ["rank","position","pos"].some((k) => keyText.includes(k));
      if ((hasTeam && hasPoints) || (hasTeam && hasPlayed) || (hasTeam && hasRank)) {
        out.push({
          path: pathParts.join(".") || "$",
          length: value.length,
          sampleKeys: [...keys].slice(0, 40),
          sampleItem: objectItems[0]
        });
      }
    }
    for (let i = 0; i < Math.min(value.length, 20); i++) findStandingArrays(value[i], [...pathParts, String(i)], depth + 1, out);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value).slice(0, 80)) findStandingArrays(child, [...pathParts, key], depth + 1, out);
  }
  return out;
}

function parseJsonCandidate(body, contentType) {
  const trimmed = String(body || "").trim();
  const looksJson = String(contentType || "").includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!looksJson) return { parsed: false, standingArrays: [] };
  try {
    const json = JSON.parse(trimmed);
    return { parsed: true, standingArrays: findStandingArrays(json) };
  } catch {
    return { parsed: false, standingArrays: [] };
  }
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "accept": "text/html,application/xhtml+xml,application/json,text/plain,*/*",
        "user-agent": "AI-MatchLab-FootballTruth/1.0"
      }
    });
    const body = await response.text();
    return {
      ok: true,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || "",
      body: body.slice(0, MAX_BODY_CHARS_TO_ANALYZE)
    };
  } catch (error) {
    return { ok: false, status: null, finalUrl: url, contentType: null, body: "", error: String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
  }
}

function routeIntentFromHint(hint) {
  const n = normalizeText(`${hint.taskKind || ""} ${hint.hintUrl || ""} ${hint.hintText || ""}`);
  if (n.includes("fixture") || n.includes("calendar") || n.includes("schedule") || n.includes("match") || n.includes("start")) return "start_date_or_fixtures";
  if (n.includes("standing") || n.includes("table") || n.includes("ranking") || n.includes("classifica") || n.includes("tabelle")) return "standings";
  if (n.includes("api") || n.includes("ajax") || n.includes("json")) return "api";
  return hint.taskKind || "unknown";
}

function hintPriority(hint) {
  const n = normalizeText(`${hint.hintUrl || ""} ${hint.hintText || ""}`);
  let score = Number(hint.score || 0);
  if (n.includes("api") || n.includes("ajax") || n.includes("json") || n.includes("graphql")) score += 90;
  if (n.includes("standings") || n.includes("table") || n.includes("ranking") || n.includes("classifica") || n.includes("tabelle")) score += 60;
  if (n.includes("fixtures") || n.includes("calendar") || n.includes("schedule") || n.includes("matches")) score += 50;
  if (n.includes("2025") || n.includes("2026") || n.includes("2027")) score += 25;
  if (String(hint.taskKind || "").includes("previous_completed_standings")) score += 10;
  if (String(hint.taskKind || "").includes("next_season_start_date")) score += 10;
  return score;
}

ensureDir(OUT_DIR);

const routeHintsPath = latestFile(/controlled-host-first-route-hints-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!routeHintsPath) throw new Error("Missing controlled host-first route hints");

const routeHints = parseJsonlSafe(routeHintsPath);
const targetMap = new Map();
for (const hint of routeHints) {
  const url = hint.hintUrl;
  if (!url || !/^https?:\/\//i.test(url)) continue;
  const host = hostFromUrl(url);
  if (!host || host !== hint.officialHost) continue;
  const key = `${hint.competitionSlug}|${hint.taskKind}|${url}`;
  const prev = targetMap.get(key);
  const enriched = { ...hint, routeIntent: routeIntentFromHint(hint), priority: hintPriority(hint) };
  if (!prev || enriched.priority > prev.priority) targetMap.set(key, enriched);
}

const targets = [...targetMap.values()]
  .sort((a, b) => b.priority - a.priority || a.competitionSlug.localeCompare(b.competitionSlug) || a.hintUrl.localeCompare(b.hintUrl))
  .slice(0, MAX_HINT_FETCHES);

const fetchRows = [];
const standingsApiCandidates = [];
const standingsTableCandidates = [];
const startDateCandidates = [];
const discoveredApiHints = [];
let fetchExecutedNowCount = 0;

for (const target of targets) {
  console.log(`FETCH_HINT ${target.competitionSlug} ${target.taskKind} ${target.hintUrl}`);
  const fetched = await fetchWithTimeout(target.hintUrl);
  fetchExecutedNowCount++;

  const bodyText = stripHtml(fetched.body);
  const tableInfo = inspectTables(fetched.body);
  const title = extractTitle(fetched.body);
  const jsonProbe = parseJsonCandidate(fetched.body, fetched.contentType);
  const links = extractLinks(fetched.body, fetched.finalUrl || target.hintUrl);
  const apiHints = extractApiUrlHints(fetched.body, fetched.finalUrl || target.hintUrl);

  const usefulStandings =
    tableInfo.some((table) => table.materializableTableCandidate || table.standingsSignal) ||
    jsonProbe.standingArrays.length > 0 ||
    ["standing","table","ranking","classifica","tabelle","points","played"].some((term) => normalizeText(bodyText).includes(term));

  const dates = extractDateCandidates(bodyText);
  const governedDates = dates.filter((date) => date.governedStartMention);

  fetchRows.push({
    competitionSlug: target.competitionSlug,
    taskKind: target.taskKind,
    displayName: target.displayName,
    officialHost: target.officialHost,
    sourceUrl: target.sourceUrl,
    hintUrl: target.hintUrl,
    finalUrl: fetched.finalUrl,
    httpStatus: fetched.status,
    ok: fetched.ok,
    contentType: fetched.contentType,
    title,
    routeIntent: target.routeIntent,
    priority: target.priority,
    bodyLengthAnalyzed: fetched.body.length,
    bodyTextLength: bodyText.length,
    tableCount: tableInfo.length,
    bestTable: tableInfo[0] || null,
    jsonParsed: jsonProbe.parsed,
    standingArrayCount: jsonProbe.standingArrays.length,
    governedDateCandidateCount: governedDates.length,
    usefulStandings,
    apiHintCount: apiHints.length,
    bodySnippet: bodyText.slice(0, 700),
    error: fetched.error || null
  });

  if (jsonProbe.standingArrays.length > 0) {
    for (const arr of jsonProbe.standingArrays) {
      standingsApiCandidates.push({
        competitionSlug: target.competitionSlug,
        taskKind: target.taskKind,
        displayName: target.displayName,
        officialHost: target.officialHost,
        hintUrl: target.hintUrl,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        contentType: fetched.contentType,
        title,
        arrayPath: arr.path,
        arrayLength: arr.length,
        sampleKeys: arr.sampleKeys,
        sampleItem: arr.sampleItem,
        candidateStatus: "standing_like_json_array_candidate"
      });
    }
  }

  if (tableInfo.some((table) => table.materializableTableCandidate)) {
    standingsTableCandidates.push({
      competitionSlug: target.competitionSlug,
      taskKind: target.taskKind,
      displayName: target.displayName,
      officialHost: target.officialHost,
      hintUrl: target.hintUrl,
      finalUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      contentType: fetched.contentType,
      title,
      bestTables: tableInfo.filter((table) => table.materializableTableCandidate).slice(0, 4),
      candidateStatus: "materializable_table_route_candidate"
    });
  }

  for (const date of dates) {
    startDateCandidates.push({
      competitionSlug: target.competitionSlug,
      taskKind: target.taskKind,
      displayName: target.displayName,
      officialHost: target.officialHost,
      hintUrl: target.hintUrl,
      finalUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      title,
      dateText: date.dateText,
      context: date.context,
      governedStartMention: date.governedStartMention,
      rejectedAsPageOrArticleDate: date.rejectedAsPageOrArticleDate,
      candidateStatus: date.governedStartMention ? "governed_start_date_candidate" : "date_candidate_needs_review"
    });
  }

  for (const apiHint of apiHints) {
    if (apiHint.host === target.officialHost) {
      discoveredApiHints.push({
        competitionSlug: target.competitionSlug,
        taskKind: target.taskKind,
        displayName: target.displayName,
        officialHost: target.officialHost,
        sourceHintUrl: target.hintUrl,
        apiUrl: apiHint.url,
        pathSignal: apiHint.pathSignal
      });
    }
  }
}

const summary = {
  status: "passed",
  runner: "controlled_route_hint_deepening_wave",
  sourceRouteHintsPath: rel(routeHintsPath),
  inputRouteHintCount: routeHints.length,
  targetCount: targets.length,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  fetched2xxOr3xxCount: fetchRows.filter((row) => row.ok && row.httpStatus >= 200 && row.httpStatus < 400).length,
  fetchFailureCount: fetchRows.filter((row) => !row.ok || !row.httpStatus || row.httpStatus >= 400).length,
  standingApiCandidateCount: standingsApiCandidates.length,
  materializableTableRouteCandidateCount: standingsTableCandidates.length,
  startDateCandidateCount: startDateCandidates.length,
  governedStartDateCandidateCount: startDateCandidates.filter((row) => row.governedStartMention).length,
  discoveredApiHintCount: discoveredApiHints.length,
  usefulStandingsFetchCount: fetchRows.filter((row) => row.usefulStandings).length,
  recommendedNextLane:
    standingsApiCandidates.length > 0
      ? "build_bulk_official_api_adapter_proofs_for_standing_array_candidates"
      : standingsTableCandidates.length > 0
        ? "run_browser_materialization_review_for_deepened_table_route_candidates"
        : startDateCandidates.some((row) => row.governedStartMention)
          ? "materialize_governed_start_date_evidence_candidates"
          : "expand_official_host_registry_for_unresolved_tasks"
};

const outPath = path.join(OUT_DIR, `controlled-route-hint-deepening-wave-${DATE}.json`);
const fetchRowsPath = path.join(OUT_DIR, `controlled-route-hint-deepening-fetch-rows-${DATE}.jsonl`);
const apiCandidatesPath = path.join(OUT_DIR, `controlled-route-hint-standing-api-candidates-${DATE}.jsonl`);
const tableCandidatesPath = path.join(OUT_DIR, `controlled-route-hint-table-route-candidates-${DATE}.jsonl`);
const startDateCandidatesPath = path.join(OUT_DIR, `controlled-route-hint-start-date-candidates-${DATE}.jsonl`);
const apiHintsPath = path.join(OUT_DIR, `controlled-route-hint-discovered-api-hints-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  topStandingApiCandidates: standingsApiCandidates.slice(0, 120),
  topTableRouteCandidates: standingsTableCandidates.slice(0, 120),
  topGovernedStartDateCandidates: startDateCandidates.filter((row) => row.governedStartMention).slice(0, 120),
  topDiscoveredApiHints: discoveredApiHints.slice(0, 160)
}, null, 2) + "\n", "utf8");

fs.writeFileSync(fetchRowsPath, fetchRows.map((row) => JSON.stringify(row)).join("\n") + (fetchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(apiCandidatesPath, standingsApiCandidates.map((row) => JSON.stringify(row)).join("\n") + (standingsApiCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(tableCandidatesPath, standingsTableCandidates.map((row) => JSON.stringify(row)).join("\n") + (standingsTableCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(startDateCandidatesPath, startDateCandidates.map((row) => JSON.stringify(row)).join("\n") + (startDateCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(apiHintsPath, discoveredApiHints.map((row) => JSON.stringify(row)).join("\n") + (discoveredApiHints.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  fetchRowsOutput: rel(fetchRowsPath),
  standingApiCandidatesOutput: rel(apiCandidatesPath),
  tableRouteCandidatesOutput: rel(tableCandidatesPath),
  startDateCandidatesOutput: rel(startDateCandidatesPath),
  discoveredApiHintsOutput: rel(apiHintsPath),
  summary
}, null, 2));
