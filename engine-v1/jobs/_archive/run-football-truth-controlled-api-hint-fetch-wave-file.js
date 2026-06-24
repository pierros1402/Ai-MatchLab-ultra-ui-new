import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `controlled-api-hint-fetch-wave-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-fetch")) throw new Error("Refusing controlled API hint fetch without --allow-fetch");

const MAX_PHASE1_FETCHES = Number(process.env.API_HINT_PHASE1_MAX_FETCHES || "650");
const MAX_PHASE2_FETCHES = Number(process.env.API_HINT_PHASE2_MAX_FETCHES || "250");
const FETCH_TIMEOUT_MS = Number(process.env.API_HINT_FETCH_TIMEOUT_MS || "12000");
const MAX_BODY_CHARS = Number(process.env.API_HINT_MAX_BODY_CHARS || "800000");

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

function badStaticAsset(url) {
  const p = pathSignal(url);
  return /\.(?:png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|eot|css|mp4|webm|mp3|zip|rar)(?:$|\?)/i.test(url) || p.includes("cookie");
}

function isJsAsset(url) {
  return /\.m?js(?:$|\?)/i.test(url) || pathSignal(url).includes("_next/static") || pathSignal(url).includes("/static/");
}

function apiHintPriority(row) {
  const url = row.apiUrl || row.url;
  const n = normalizeText(`${url || ""} ${row.pathSignal || ""} ${row.taskKind || ""} ${row.displayName || ""}`);
  let score = 0;
  if (!url || !/^https?:\/\//i.test(url)) return -9999;
  if (badStaticAsset(url)) return -9999;

  if (n.includes("api")) score += 180;
  if (n.includes("graphql")) score += 170;
  if (n.includes("ajax")) score += 150;
  if (n.includes("json")) score += 120;
  if (n.includes("standings") || n.includes("standing")) score += 160;
  if (n.includes("table") || n.includes("ranking") || n.includes("classification") || n.includes("classifica") || n.includes("tabelle")) score += 130;
  if (n.includes("fixture") || n.includes("calendar") || n.includes("schedule") || n.includes("match")) score += 90;
  if (n.includes("season") || n.includes("competition") || n.includes("tournament") || n.includes("stage")) score += 65;
  if (n.includes("team") || n.includes("club")) score += 35;
  if (n.includes("2025") || n.includes("2026") || n.includes("2027")) score += 45;
  if (String(row.taskKind || "").includes("previous_completed_standings")) score += 30;
  if (String(row.taskKind || "").includes("next_season_start_date")) score += 20;
  if (isJsAsset(url)) score += 20;
  if (n.includes("analytics") || n.includes("gtm") || n.includes("tagmanager") || n.includes("facebook") || n.includes("captcha")) score -= 250;
  return score;
}

function dedupeTargets(rows, urlField) {
  const map = new Map();
  for (const row of rows) {
    const url = row[urlField] || row.apiUrl || row.url;
    if (!url) continue;
    const host = hostFromUrl(url);
    if (!host || row.officialHost && host !== row.officialHost) continue;
    const enriched = { ...row, targetUrl: url, targetHost: host, priority: apiHintPriority({ ...row, apiUrl: url }) };
    if (enriched.priority < 0) continue;
    const key = `${enriched.competitionSlug}|${enriched.taskKind}|${url}`;
    const prev = map.get(key);
    if (!prev || enriched.priority > prev.priority) map.set(key, enriched);
  }
  return [...map.values()].sort((a, b) =>
    b.priority - a.priority ||
    String(a.competitionSlug).localeCompare(String(b.competitionSlug)) ||
    String(a.targetUrl).localeCompare(String(b.targetUrl))
  );
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "accept": "application/json,text/plain,text/html,application/xhtml+xml,*/*",
        "user-agent": "AI-MatchLab-FootballTruth/1.0"
      }
    });
    const body = await response.text();
    return {
      ok: true,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || "",
      body: body.slice(0, MAX_BODY_CHARS)
    };
  } catch (error) {
    return { ok: false, status: null, finalUrl: url, contentType: null, body: "", error: String(error?.message || error) };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJsonCandidate(body, contentType) {
  const trimmed = String(body || "").trim();
  const looksJson = String(contentType || "").includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
  if (!looksJson) return { parsed: false, json: null };
  try { return { parsed: true, json: JSON.parse(trimmed) }; } catch { return { parsed: false, json: null }; }
}

function findStandingArrays(value, pathParts = [], depth = 0, out = []) {
  if (depth > 8 || out.length > 80) return out;

  if (Array.isArray(value)) {
    const objectItems = value.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (objectItems.length >= 8) {
      const keys = new Set(objectItems.flatMap((item) => Object.keys(item).map((key) => normalizeText(key))));
      const keyText = [...keys].join(" ");
      const hasTeam = ["team", "club", "teamname", "team name", "name", "shortname", "participant"].some((k) => keyText.includes(k));
      const hasPosition = ["rank", "position", "pos", "place"].some((k) => keyText.includes(k));
      const hasPoints = ["points", "pts", "point", "score"].some((k) => keyText.includes(k));
      const hasPlayed = ["played", "matches", "matchplayed", "games", "playedgames", "p"].some((k) => keyText.includes(k));
      const hasWdl = ["won", "wins", "draw", "drawn", "lost", "losses"].some((k) => keyText.includes(k));
      if ((hasTeam && hasPoints) || (hasTeam && hasPlayed) || (hasTeam && hasPosition && hasWdl)) {
        out.push({
          path: pathParts.join(".") || "$",
          length: value.length,
          sampleKeys: [...keys].slice(0, 60),
          sampleItem: objectItems[0]
        });
      }
    }
    for (let i = 0; i < Math.min(value.length, 30); i++) findStandingArrays(value[i], [...pathParts, String(i)], depth + 1, out);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value).slice(0, 120)) findStandingArrays(child, [...pathParts, key], depth + 1, out);
  }
  return out;
}

function extractApiUrlsFromText(body, baseUrl, officialHost) {
  const out = new Map();
  const text = String(body || "");
  const patterns = [
    /["']([^"']*(?:api|ajax|graphql|standings|standing|table|ranking|classification|fixtures|calendar|matches|season|competition|tournament|stage)[^"']*)["']/gi,
    /\bhttps?:\/\/[^\s"'<>]+(?:api|ajax|graphql|standings|standing|table|ranking|classification|fixtures|calendar|matches|season|competition|tournament|stage)[^\s"'<>]*/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const raw = htmlDecode(match[1] || match[0] || "").trim();
      if (!raw || raw.length > 900 || raw.startsWith("data:")) continue;
      try {
        const url = new URL(raw, baseUrl).toString();
        const host = hostFromUrl(url);
        if (!host || host !== officialHost || badStaticAsset(url)) continue;
        out.set(url, { apiUrl: url, officialHost, targetHost: host, pathSignal: pathSignal(url) });
      } catch {}
    }
  }

  return [...out.values()];
}

function extractDateCandidatesFromText(text) {
  const source = String(text || "").replace(/\s+/g, " ");
  const month = "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)";
  const dow = "(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?";
  const subject = "(?:season|league|competition|campaign|fixtures?|calendar|schedule|opening match|match round|round 1|matchday 1)";
  const start = "(?:start|starts|begin|begins|kick(?:s)? off|commence(?:s)?|opening)";
  const patterns = [
    new RegExp(`\\b${subject}\\s+(?:will\\s+)?${start}\\s+(?:on\\s+)?(${dow}\\s*\\d{1,2}\\s+${month}\\s+20\\d{2})`, "gi"),
    new RegExp(`\\b${start}\\s+(?:on\\s+)?(${dow}\\s*\\d{1,2}\\s+${month}\\s+20\\d{2})`, "gi"),
    new RegExp(`\\b(${dow}\\s*${month}\\s+\\d{1,2},?\\s+20\\d{2})\\b.{0,180}\\b${subject}|\\b${subject}.{0,180}\\b(${dow}\\s*${month}\\s+\\d{1,2},?\\s+20\\d{2})`, "gi"),
    new RegExp(`\\b(\\d{1,2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*20\\d{2})\\b.{0,180}\\b${subject}|\\b${subject}.{0,180}\\b(\\d{1,2}\\s*[./-]\\s*\\d{1,2}\\s*[./-]\\s*20\\d{2})`, "gi")
  ];

  const rows = [];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.exec(source))) {
      const dateText = (m[1] || m[2] || "").replace(/\s+/g, " ").trim();
      if (!dateText) continue;
      const context = source.slice(Math.max(0, m.index - 220), Math.min(source.length, m.index + m[0].length + 260)).trim();
      const n = normalizeText(context);
      const governed =
        (n.includes("season") || n.includes("league") || n.includes("competition") || n.includes("campaign") || n.includes("fixture") || n.includes("calendar") || n.includes("schedule") || n.includes("opening") || n.includes("round") || n.includes("matchday")) &&
        (n.includes("start") || n.includes("begin") || n.includes("kick") || n.includes("commence") || n.includes("opening"));
      const rejected =
        n.includes("published") || n.includes("updated") || n.includes("copyright") || n.includes("privacy") || n.includes("cookie") || n.includes("download");
      rows.push({ dateText, context, governedStartMention: governed && !rejected, rejectedAsPageOrArticleDate: rejected });
    }
  }

  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.dateText}|${row.context.slice(0, 120)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function textSnippet(body) {
  return stripHtml(body).slice(0, 700);
}

async function runFetchPass(targets, phaseName) {
  const fetchRows = [];
  const standingApiCandidates = [];
  const startDateCandidates = [];
  const nestedHints = [];
  let fetchCount = 0;

  for (const target of targets) {
    console.log(`FETCH_API_HINT ${phaseName} ${target.competitionSlug} ${target.taskKind} ${target.targetUrl}`);
    const fetched = await fetchWithTimeout(target.targetUrl);
    fetchCount++;

    const jsonProbe = parseJsonCandidate(fetched.body, fetched.contentType);
    const standingArrays = jsonProbe.parsed ? findStandingArrays(jsonProbe.json) : [];
    const snippet = textSnippet(fetched.body);
    const dates = extractDateCandidatesFromText(snippet);
    const nested = extractApiUrlsFromText(fetched.body, fetched.finalUrl || target.targetUrl, target.officialHost || target.targetHost);

    fetchRows.push({
      phaseName,
      competitionSlug: target.competitionSlug,
      taskKind: target.taskKind,
      displayName: target.displayName,
      officialHost: target.officialHost,
      targetUrl: target.targetUrl,
      finalUrl: fetched.finalUrl,
      httpStatus: fetched.status,
      ok: fetched.ok,
      contentType: fetched.contentType,
      priority: target.priority,
      bodyLengthAnalyzed: fetched.body.length,
      jsonParsed: jsonProbe.parsed,
      standingArrayCount: standingArrays.length,
      nestedApiHintCount: nested.length,
      startDateCandidateCount: dates.length,
      bodySnippet: snippet,
      error: fetched.error || null
    });

    for (const arr of standingArrays) {
      standingApiCandidates.push({
        phaseName,
        competitionSlug: target.competitionSlug,
        taskKind: target.taskKind,
        displayName: target.displayName,
        officialHost: target.officialHost,
        sourceApiUrl: target.targetUrl,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        contentType: fetched.contentType,
        arrayPath: arr.path,
        arrayLength: arr.length,
        sampleKeys: arr.sampleKeys,
        sampleItem: arr.sampleItem,
        candidateStatus: "standing_like_json_array_candidate"
      });
    }

    for (const date of dates) {
      startDateCandidates.push({
        phaseName,
        competitionSlug: target.competitionSlug,
        taskKind: target.taskKind,
        displayName: target.displayName,
        officialHost: target.officialHost,
        sourceApiUrl: target.targetUrl,
        finalUrl: fetched.finalUrl,
        httpStatus: fetched.status,
        dateText: date.dateText,
        context: date.context,
        governedStartMention: date.governedStartMention,
        rejectedAsPageOrArticleDate: date.rejectedAsPageOrArticleDate,
        candidateStatus: date.governedStartMention ? "governed_start_date_candidate" : "date_candidate_needs_review"
      });
    }

    for (const hint of nested) {
      nestedHints.push({
        phaseName,
        competitionSlug: target.competitionSlug,
        taskKind: target.taskKind,
        displayName: target.displayName,
        officialHost: target.officialHost,
        sourceApiUrl: target.targetUrl,
        apiUrl: hint.apiUrl,
        pathSignal: hint.pathSignal
      });
    }
  }

  return { fetchRows, standingApiCandidates, startDateCandidates, nestedHints, fetchCount };
}

ensureDir(OUT_DIR);

const apiHintsPath = latestFile(/controlled-route-hint-discovered-api-hints-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!apiHintsPath) throw new Error("Missing controlled route-hint discovered API hints");

const rawHints = parseJsonlSafe(apiHintsPath);
const phase1Targets = dedupeTargets(rawHints, "apiUrl").slice(0, MAX_PHASE1_FETCHES);

const phase1 = await runFetchPass(phase1Targets, "phase1_discovered_api_hints");

const phase2Seen = new Set(phase1Targets.map((row) => `${row.competitionSlug}|${row.taskKind}|${row.targetUrl}`));
const phase2Raw = phase1.nestedHints.map((row) => ({ ...row, targetUrl: row.apiUrl }));
const phase2Targets = dedupeTargets(phase2Raw, "apiUrl")
  .filter((row) => !phase2Seen.has(`${row.competitionSlug}|${row.taskKind}|${row.targetUrl}`))
  .slice(0, MAX_PHASE2_FETCHES);

const phase2 = await runFetchPass(phase2Targets, "phase2_nested_api_hints");

const fetchRows = [...phase1.fetchRows, ...phase2.fetchRows];
const standingApiCandidates = [...phase1.standingApiCandidates, ...phase2.standingApiCandidates];
const startDateCandidates = [...phase1.startDateCandidates, ...phase2.startDateCandidates];
const nestedHints = [...phase1.nestedHints, ...phase2.nestedHints];

const summary = {
  status: "passed",
  runner: "controlled_api_hint_fetch_wave",
  sourceDiscoveredApiHintsPath: rel(apiHintsPath),
  inputApiHintCount: rawHints.length,
  phase1TargetCount: phase1Targets.length,
  phase2TargetCount: phase2Targets.length,
  searchExecutedNowCount: 0,
  fetchExecutedNowCount: fetchRows.length,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  fetched2xxOr3xxCount: fetchRows.filter((row) => row.ok && row.httpStatus >= 200 && row.httpStatus < 400).length,
  fetchFailureCount: fetchRows.filter((row) => !row.ok || !row.httpStatus || row.httpStatus >= 400).length,
  jsonParsedFetchCount: fetchRows.filter((row) => row.jsonParsed).length,
  standingApiCandidateCount: standingApiCandidates.length,
  standingApiCandidateSlugCount: new Set(standingApiCandidates.map((row) => row.competitionSlug)).size,
  standingApiCandidateSlugs: [...new Set(standingApiCandidates.map((row) => row.competitionSlug))],
  startDateCandidateCount: startDateCandidates.length,
  governedStartDateCandidateCount: startDateCandidates.filter((row) => row.governedStartMention).length,
  nestedApiHintCount: nestedHints.length,
  uniqueNestedApiHintCount: new Set(nestedHints.map((row) => `${row.competitionSlug}|${row.taskKind}|${row.apiUrl}`)).size,
  recommendedNextLane:
    standingApiCandidates.length > 0
      ? "build_bulk_api_candidate_shape_review_and_adapter_proofs"
      : startDateCandidates.some((row) => row.governedStartMention)
        ? "strict_review_api_start_date_candidates"
        : "use_nested_api_hints_to_expand_targeted_official_endpoint_fetches"
};

const outPath = path.join(OUT_DIR, `controlled-api-hint-fetch-wave-${DATE}.json`);
const fetchRowsPath = path.join(OUT_DIR, `controlled-api-hint-fetch-rows-${DATE}.jsonl`);
const standingCandidatesPath = path.join(OUT_DIR, `controlled-api-hint-standing-array-candidates-${DATE}.jsonl`);
const startDateCandidatesPath = path.join(OUT_DIR, `controlled-api-hint-start-date-candidates-${DATE}.jsonl`);
const nestedHintsPath = path.join(OUT_DIR, `controlled-api-hint-nested-api-hints-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({
  summary,
  topStandingApiCandidates: standingApiCandidates.slice(0, 160),
  topGovernedStartDateCandidates: startDateCandidates.filter((row) => row.governedStartMention).slice(0, 120),
  topNestedApiHints: nestedHints.slice(0, 200)
}, null, 2) + "\n", "utf8");

fs.writeFileSync(fetchRowsPath, fetchRows.map((row) => JSON.stringify(row)).join("\n") + (fetchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(standingCandidatesPath, standingApiCandidates.map((row) => JSON.stringify(row)).join("\n") + (standingApiCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(startDateCandidatesPath, startDateCandidates.map((row) => JSON.stringify(row)).join("\n") + (startDateCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(nestedHintsPath, nestedHints.map((row) => JSON.stringify(row)).join("\n") + (nestedHints.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  fetchRowsOutput: rel(fetchRowsPath),
  standingApiCandidatesOutput: rel(standingCandidatesPath),
  startDateCandidatesOutput: rel(startDateCandidatesPath),
  nestedApiHintsOutput: rel(nestedHintsPath),
  summary
}, null, 2));
