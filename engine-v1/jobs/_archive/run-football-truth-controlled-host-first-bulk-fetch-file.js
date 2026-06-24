import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `controlled-host-first-bulk-fetch-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-fetch")) throw new Error("Refusing controlled fetch without --allow-fetch");

const MAX_FETCH_URLS = Number(process.env.HOST_FIRST_MAX_FETCH_URLS || "1200");
const FETCH_TIMEOUT_MS = Number(process.env.HOST_FIRST_FETCH_TIMEOUT_MS || "12000");
const MAX_BODY_CHARS_TO_ANALYZE = Number(process.env.HOST_FIRST_MAX_BODY_CHARS_TO_ANALYZE || "450000");

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

function extractTitle(html) {
  const match = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]).slice(0, 240) : null;
}

function extractTables(html) {
  return String(html || "").match(/<table\b[\s\S]*?<\/table>/gi) || [];
}

function extractLinks(html, baseUrl) {
  const out = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(String(html || "")))) {
    try {
      const url = new URL(htmlDecode(m[1]), baseUrl).toString();
      const text = stripHtml(m[2]).slice(0, 180);
      out.push({ url, host: hostFromUrl(url), text });
    } catch {}
  }
  return out.slice(0, 400);
}

function hasUsefulStandingsSignal(text) {
  const n = normalizeText(text);
  return [
    "standings", "league table", "table", "ranking", "classifica", "tabelle", "classification",
    "points", "played", "won", "drawn", "lost", "goals", "pts", "pl", "gf", "ga"
  ].some((term) => n.includes(term));
}

function hasUsefulStartDateSignal(text) {
  const n = normalizeText(text);
  return [
    "season start", "season starts", "will start", "starts on", "begin", "kick off", "opening match",
    "fixtures", "calendar", "schedule", "match round", "round 1"
  ].some((term) => n.includes(term));
}

function tableInspection(html) {
  const tables = extractTables(html);
  return tables.map((tableHtml, tableIndex) => {
    const text = stripHtml(tableHtml);
    const rows = (tableHtml.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).map((rowHtml) => {
      const cells = rowHtml.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || [];
      return cells.map(stripHtml).filter(Boolean);
    }).filter((row) => row.length);
    const numericCount = rows.flat().filter((cell) => /^-?\d+$/.test(String(cell).replace(/[^\d-]/g, ""))).length;
    return {
      tableIndex,
      rowCount: rows.length,
      maxCellCount: rows.reduce((max, row) => Math.max(max, row.length), 0),
      numericCount,
      hasStandingsSignal: hasUsefulStandingsSignal(text),
      firstRows: rows.slice(0, 5)
    };
  }).sort((a, b) =>
    Number(b.hasStandingsSignal) - Number(a.hasStandingsSignal) ||
    b.rowCount - a.rowCount ||
    b.numericCount - a.numericCount
  ).slice(0, 5);
}

function extractDateCandidates(text) {
  const source = String(text || "").replace(/\s+/g, " ");
  const patterns = [
    /\b(?:season|league|competition|campaign|match round|round 1|opening match|fixtures?)\s+(?:will\s+)?(?:start|starts|begin|begins|kick(?:s)? off|commence(?:s)?)\s+(?:on\s+)?((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})/gi,
    /\b(?:starts?|begins?|kicks? off|commences?)\s+(?:on\s+)?((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})/gi,
    /\b((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s*\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})\b.{0,120}\b(?:season|league|competition|campaign|fixtures?|opening match|match round|round 1|start|starts|begin|kick off)\b/gi,
    /\b(?:season|league|competition|campaign|match round|round 1|opening match|fixtures?)\s+(?:will\s+)?(?:start|starts|begin|begins|kick(?:s)? off|commence(?:s)?)\s+(?:on\s+)?(\d{1,2}[\/.-]\d{1,2}[\/.-]20\d{2})/gi
  ];

  const candidates = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) {
      const dateText = match[1].replace(/\s+/g, " ").trim();
      const start = Math.max(0, match.index - 180);
      const end = Math.min(source.length, match.index + match[0].length + 220);
      const context = source.slice(start, end).trim();
      const n = normalizeText(context);
      const governed =
        (n.includes("season") || n.includes("league") || n.includes("competition") || n.includes("campaign") || n.includes("fixtures") || n.includes("opening match") || n.includes("match round") || n.includes("round 1")) &&
        (n.includes("start") || n.includes("begin") || n.includes("kick off") || n.includes("commence"));
      const rejectsPageDate =
        n.includes("published") || n.includes("updated") || n.includes("copyright") || n.includes("privacy") || n.includes("cookie");
      candidates.push({
        dateText,
        context,
        governedStartMention: governed && !rejectsPageDate,
        rejectedAsPageOrArticleDate: rejectsPageDate
      });
    }
  }

  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.dateText}|${candidate.context.slice(0, 120)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}

function extractRouteHints(links, baseHost, routeIntent) {
  const hints = [];
  for (const link of links) {
    if (!link.host || link.host !== baseHost) continue;
    const n = normalizeText(`${link.url} ${link.text}`);
    let score = 0;
    if (routeIntent === "previous_completed_standings") {
      if (n.includes("standing") || n.includes("table") || n.includes("ranking") || n.includes("classifica") || n.includes("tabelle")) score += 40;
      if (n.includes("2025") || n.includes("2026")) score += 20;
    }
    if (routeIntent === "next_season_start_date") {
      if (n.includes("fixture") || n.includes("calendar") || n.includes("schedule") || n.includes("match")) score += 35;
      if (n.includes("2026") || n.includes("2027")) score += 20;
      if (n.includes("start") || n.includes("round")) score += 20;
    }
    if (score > 0) hints.push({ ...link, score });
  }
  return hints.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, 20);
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

ensureDir(OUT_DIR);

const fetchPackPath = latestFile(/host-first-controlled-fetch-pack-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!fetchPackPath) throw new Error("Missing host-first controlled fetch pack");

const fetchPack = parseJsonlSafe(fetchPackPath).slice(0, MAX_FETCH_URLS);

const fetchRows = [];
const startDateCandidates = [];
const standingsCandidates = [];
const routeHintRows = [];

let fetchExecutedNowCount = 0;

for (const target of fetchPack) {
  console.log(`FETCH ${target.competitionSlug} ${target.taskKind} ${target.url}`);
  const fetched = await fetchWithTimeout(target.url);
  fetchExecutedNowCount++;

  const bodyText = stripHtml(fetched.body);
  const finalHost = hostFromUrl(fetched.finalUrl || target.url);
  const links = extractLinks(fetched.body, fetched.finalUrl || target.url);
  const tableInfo = tableInspection(fetched.body);
  const title = extractTitle(fetched.body);
  const bodySnippet = bodyText.slice(0, 700);
  const usefulStartSignal = hasUsefulStartDateSignal(bodyText);
  const usefulStandingsSignal = hasUsefulStandingsSignal(bodyText) || tableInfo.some((t) => t.hasStandingsSignal);

  const fetchRow = {
    competitionSlug: target.competitionSlug,
    taskType: target.taskType,
    taskKind: target.taskKind,
    displayName: target.displayName,
    officialHost: target.officialHost,
    officialHostConfidence: target.officialHostConfidence,
    routeIndex: target.routeIndex,
    url: target.url,
    finalUrl: fetched.finalUrl,
    finalHost,
    httpStatus: fetched.status,
    ok: fetched.ok,
    contentType: fetched.contentType,
    title,
    bodyLengthAnalyzed: fetched.body.length,
    bodyTextLength: bodyText.length,
    tableCount: tableInfo.length,
    bestTable: tableInfo[0] || null,
    usefulStartSignal,
    usefulStandingsSignal,
    bodySnippet,
    error: fetched.error || null
  };
  fetchRows.push(fetchRow);

  if (target.taskKind === "next_season_start_date" && fetched.ok && fetched.status >= 200 && fetched.status < 400) {
    const dates = extractDateCandidates(bodyText);
    for (const dateCandidate of dates) {
      startDateCandidates.push({
        competitionSlug: target.competitionSlug,
        taskKind: target.taskKind,
        displayName: target.displayName,
        officialHost: target.officialHost,
        url: target.url,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        title,
        dateText: dateCandidate.dateText,
        context: dateCandidate.context,
        governedStartMention: dateCandidate.governedStartMention,
        rejectedAsPageOrArticleDate: dateCandidate.rejectedAsPageOrArticleDate,
        candidateStatus: dateCandidate.governedStartMention ? "governed_start_date_candidate" : "date_candidate_needs_review"
      });
    }
  }

  if (target.taskKind === "previous_completed_standings" && fetched.ok && fetched.status >= 200 && fetched.status < 400) {
    const bestTable = tableInfo[0] || null;
    if (usefulStandingsSignal || bestTable) {
      standingsCandidates.push({
        competitionSlug: target.competitionSlug,
        taskKind: target.taskKind,
        displayName: target.displayName,
        officialHost: target.officialHost,
        url: target.url,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        title,
        contentType: fetched.contentType,
        usefulStandingsSignal,
        tableCount: tableInfo.length,
        bestTable,
        candidateStatus:
          bestTable && bestTable.rowCount >= 10 && bestTable.hasStandingsSignal
            ? "table_candidate_for_parser_or_browser_render"
            : usefulStandingsSignal
              ? "route_candidate_for_browser_render_or_api_mining"
              : "weak_route_candidate"
      });
    }
  }

  const routeHints = extractRouteHints(links, finalHost, target.taskKind);
  for (const hint of routeHints) {
    routeHintRows.push({
      competitionSlug: target.competitionSlug,
      taskKind: target.taskKind,
      displayName: target.displayName,
      officialHost: target.officialHost,
      sourceUrl: target.url,
      sourceFinalUrl: fetched.finalUrl,
      hintUrl: hint.url,
      hintText: hint.text,
      score: hint.score
    });
  }
}

const governedStartDateCandidateCount = startDateCandidates.filter((c) => c.governedStartMention).length;
const standingsTableCandidateCount = standingsCandidates.filter((c) => c.candidateStatus === "table_candidate_for_parser_or_browser_render").length;
const standingsRouteCandidateCount = standingsCandidates.filter((c) => c.candidateStatus !== "weak_route_candidate").length;

const summary = {
  status: "passed",
  runner: "controlled_host_first_bulk_fetch",
  searchExecutedNowCount: 0,
  fetchExecutedNowCount,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  sourceFetchPackPath: rel(fetchPackPath),
  inputFetchUrlCount: fetchPack.length,
  fetched2xxOr3xxCount: fetchRows.filter((r) => r.ok && r.httpStatus >= 200 && r.httpStatus < 400).length,
  fetchFailureCount: fetchRows.filter((r) => !r.ok || !r.httpStatus || r.httpStatus >= 400).length,
  usefulStartSignalFetchCount: fetchRows.filter((r) => r.usefulStartSignal).length,
  usefulStandingsSignalFetchCount: fetchRows.filter((r) => r.usefulStandingsSignal).length,
  startDateCandidateCount: startDateCandidates.length,
  governedStartDateCandidateCount,
  standingsCandidateCount: standingsCandidates.length,
  standingsTableCandidateCount,
  standingsRouteCandidateCount,
  routeHintCount: routeHintRows.length,
  recommendedNextLane:
    governedStartDateCandidateCount > 0 || standingsTableCandidateCount > 0
      ? "build_review_and_materialization_jobs_for_governed_start_dates_and_standings_table_candidates"
      : "improve_route_templates_or_browser_render_host_first_candidates"
};

const outPath = path.join(OUT_DIR, `controlled-host-first-bulk-fetch-${DATE}.json`);
const fetchRowsPath = path.join(OUT_DIR, `controlled-host-first-bulk-fetch-rows-${DATE}.jsonl`);
const startDatePath = path.join(OUT_DIR, `controlled-host-first-start-date-candidates-${DATE}.jsonl`);
const standingsPath = path.join(OUT_DIR, `controlled-host-first-standings-candidates-${DATE}.jsonl`);
const routeHintsPath = path.join(OUT_DIR, `controlled-host-first-route-hints-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  topStartDateCandidates: startDateCandidates.filter((c) => c.governedStartMention).slice(0, 120),
  topStandingsCandidates: standingsCandidates.slice(0, 160),
  topRouteHints: routeHintRows.sort((a, b) => b.score - a.score).slice(0, 160)
}, null, 2) + "\n", "utf8");

fs.writeFileSync(fetchRowsPath, fetchRows.map((row) => JSON.stringify(row)).join("\n") + (fetchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(startDatePath, startDateCandidates.map((row) => JSON.stringify(row)).join("\n") + (startDateCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(standingsPath, standingsCandidates.map((row) => JSON.stringify(row)).join("\n") + (standingsCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(routeHintsPath, routeHintRows.map((row) => JSON.stringify(row)).join("\n") + (routeHintRows.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  fetchRowsOutput: rel(fetchRowsPath),
  startDateCandidatesOutput: rel(startDatePath),
  standingsCandidatesOutput: rel(standingsPath),
  routeHintsOutput: rel(routeHintsPath),
  summary
}, null, 2));
