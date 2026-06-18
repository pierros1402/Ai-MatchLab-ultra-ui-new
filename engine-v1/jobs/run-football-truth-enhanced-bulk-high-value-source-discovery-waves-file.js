import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `enhanced-bulk-high-value-source-discovery-waves-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-search")) throw new Error("Refusing RSS search without --allow-search");

const MAX_WAVES = Number(process.env.BULK_MAX_WAVES || "4");
const MAX_TASKS = Number(process.env.BULK_MAX_TASKS || "320");
const MAX_QUERIES_PER_TASK = Number(process.env.BULK_MAX_QUERIES_PER_TASK || "3");

const SLUG_NAME_OVERRIDES = {
  "aut.1": "Austrian Bundesliga",
  "aut.2": "Austrian 2. Liga",
  "bel.1": "Belgian Pro League",
  "bel.2": "Challenger Pro League",
  "cro.1": "Croatian HNL",
  "cro.2": "Croatian Prva NL",
  "cze.1": "Czech First League",
  "cze.2": "Czech National League",
  "den.1": "Danish Superliga",
  "den.2": "Danish 1st Division",
  "eng.1": "Premier League",
  "eng.2": "EFL Championship",
  "eng.3": "EFL League One",
  "eng.4": "EFL League Two",
  "eng.5": "National League",
  "esp.1": "LaLiga",
  "esp.2": "LaLiga 2",
  "fin.1": "Veikkausliiga",
  "fin.2": "Ykkosliiga",
  "fra.1": "Ligue 1",
  "fra.2": "Ligue 2",
  "ger.1": "Bundesliga",
  "ger.2": "2. Bundesliga",
  "ger.3": "3. Liga",
  "gre.1": "Super League Greece",
  "gre.2": "Super League 2 Greece",
  "ita.1": "Serie A",
  "ita.2": "Serie B",
  "ned.1": "Eredivisie",
  "ned.2": "Eerste Divisie",
  "nor.1": "Eliteserien",
  "nor.2": "OBOS-ligaen",
  "pol.1": "Ekstraklasa",
  "pol.2": "I Liga",
  "por.1": "Primeira Liga",
  "por.2": "Liga Portugal 2",
  "rus.1": "Russian Premier League",
  "rus.2": "Russian First League",
  "sco.1": "Scottish Premiership",
  "sco.2": "Scottish Championship",
  "ser.1": "Serbian SuperLiga",
  "sui.1": "Swiss Super League",
  "sui.2": "Swiss Challenge League",
  "swe.1": "Allsvenskan",
  "swe.2": "Superettan",
  "tur.1": "Super Lig",
  "tur.2": "1. Lig",
  "ukr.1": "Ukrainian Premier League",
  "ukr.2": "Ukrainian First League"
};

const NOISE_HOSTS = [
  "fifa.com","flashscore.com","soccerway.com","transfermarkt.com","sofascore.com","aiscore.com","livesport.com",
  "worldfootball.net","footystats.org","besoccer.com","scores24.live","forebet.com","oddsportal.com","betexplorer.com",
  "wikipedia.org","wikidata.org","facebook.com","instagram.com","x.com","twitter.com","youtube.com","reddit.com",
  "linkedin.com","tiktok.com","tennisexplorer.com","icloud.com","windows.net","lingus.com"
];

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

function xmlDecode(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'");
}

function stripHtml(value) {
  return xmlDecode(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
}

function isNoiseHost(host) {
  return !host || NOISE_HOSTS.some((noise) => host === noise || host.endsWith(`.${noise}`));
}

function cleanName(raw, slug) {
  if (SLUG_NAME_OVERRIDES[slug]) return SLUG_NAME_OVERRIDES[slug];
  let s = String(raw || slug);
  s = xmlDecode(s);
  s = s.replace(/\|.*$/g, " ");
  s = s.replace(/^homepage\s*-\s*/i, " ");
  s = s.replace(/\bofficial\b/gi, " ");
  s = s.replace(/\bfixtures?\b/gi, " ");
  s = s.replace(/\bresults?\b/gi, " ");
  s = s.replace(/\bcalendar\b/gi, " ");
  s = s.replace(/\bstandings?\b/gi, " ");
  s = s.replace(/\bleague table\b/gi, " ");
  s = s.replace(/\bclassifica aggiornata\b/gi, " ");
  s = s.replace(/\bclassifica\b/gi, " ");
  s = s.replace(/\bstand\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s || slug;
}

function taskDisplayName(task, lifecycleBySlug) {
  const row = lifecycleBySlug.get(task.competitionSlug) || {};
  return cleanName(row.competitionName || row.name || row.displayName || task.competitionName || task.competitionSlug, task.competitionSlug);
}

function taskCountry(task, lifecycleBySlug) {
  const row = lifecycleBySlug.get(task.competitionSlug) || {};
  return row.country || task.country || "";
}

function isStartDateTask(task) {
  return task.taskType === "acquire_next_season_start_date" || task.executionLane === "official_start_date_evidence_discovery";
}

function buildQueries(task, lifecycleBySlug) {
  const name = taskDisplayName(task, lifecycleBySlug);
  const country = taskCountry(task, lifecycleBySlug);
  const host = task.sourceHostHint || task.sourceHost || null;
  const base = `${name} ${country}`.replace(/\s+/g, " ").trim();

  const queries = [];
  if (isStartDateTask(task)) {
    queries.push(`${base} official 2026 2027 fixtures start date`);
    queries.push(`${base} official website 2026 2027 season start`);
    if (host) queries.push(`site:${host} 2026 2027 fixtures start`);
    else queries.push(`${base} league official site fixtures calendar 2026 2027`);
  } else {
    queries.push(`${base} official standings 2025 2026`);
    queries.push(`${base} official league table 2025 2026`);
    if (host) queries.push(`site:${host} standings 2025 2026`);
    else queries.push(`${base} official site standings table`);
  }
  return [...new Set(queries)].slice(0, MAX_QUERIES_PER_TASK);
}

function scoreCandidate(task, candidate, lifecycleBySlug) {
  const title = normalizeText(candidate.title);
  const snippet = normalizeText(candidate.snippet);
  const text = `${title} ${snippet}`;
  const host = candidate.host || "";
  const sourceHost = String(task.sourceHostHint || task.sourceHost || "").replace(/^www\./, "").toLowerCase();
  const name = normalizeText(taskDisplayName(task, lifecycleBySlug));
  const nameTokens = name.split(" ").filter((token) => token.length >= 3);
  const country = normalizeText(taskCountry(task, lifecycleBySlug));

  if (isNoiseHost(host)) return 0;

  let score = 10;
  if (sourceHost && (host === sourceHost || host.endsWith(`.${sourceHost}`))) score += 90;
  if (host.includes("league") || host.includes("liga") || host.includes("serie") || host.includes("bundesliga") || host.includes("premierleague")) score += 18;
  if (host.includes("football") || host.includes("fa.") || host.includes("federation") || host.includes("fpf") || host.includes("fpf.pt")) score += 14;
  if (nameTokens.length && nameTokens.some((token) => text.includes(token))) score += 15;
  if (nameTokens.length >= 2 && nameTokens.slice(0, 3).every((token) => text.includes(token))) score += 15;
  if (country && text.includes(country)) score += 5;

  if (isStartDateTask(task)) {
    if (/2026|2027|2026\/27|2026-27|2026 2027/.test(text)) score += 20;
    if (text.includes("fixture") || text.includes("calendar") || text.includes("schedule")) score += 18;
    if (text.includes("start") || text.includes("starts") || text.includes("begin") || text.includes("kick off")) score += 20;
    if (text.includes("will start") || text.includes("season starts") || text.includes("opening match") || text.includes("match round")) score += 25;
  } else {
    if (/2025|2026|2025\/26|2025-26|2025 2026/.test(text)) score += 20;
    if (text.includes("standings") || text.includes("table") || text.includes("ranking") || text.includes("classifica") || text.includes("tabelle")) score += 30;
    if (text.includes("points") || text.includes("played") || text.includes("won") || text.includes("drawn")) score += 10;
  }

  return score;
}

function parseRssItems(xml) {
  const items = [];
  const itemBlocks = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];
  for (const block of itemBlocks) {
    const title = stripHtml((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const link = xmlDecode((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "").trim();
    const snippet = stripHtml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || "");
    const pubDate = xmlDecode((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "");
    const host = hostFromUrl(link);
    if (!link || !host) continue;
    items.push({ title, link, host, snippet, pubDate });
  }
  return items;
}

async function rssSearch(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&format=rss`;
  const response = await fetch(url, {
    headers: {
      "accept": "application/rss+xml,application/xml,text/xml,*/*",
      "user-agent": "AI-MatchLab-FootballTruth/1.0"
    }
  });
  const text = await response.text();
  return {
    query,
    status: response.status,
    contentType: response.headers.get("content-type") || "",
    items: parseRssItems(text).slice(0, 10)
  };
}

ensureDir(OUT_DIR);

const highValueWavesPath = latestFile(/high-value-bulk-execution-waves-\d{4}-\d{2}-\d{2}\.jsonl$/);
const lifecycleRowsPath = latestFile(/permanent-season-lifecycle-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!highValueWavesPath) throw new Error("Missing high-value bulk execution waves jsonl");
if (!lifecycleRowsPath) throw new Error("Missing lifecycle rows jsonl");

const waves = parseJsonlSafe(highValueWavesPath).slice(0, MAX_WAVES);
const lifecycleRows = parseJsonlSafe(lifecycleRowsPath);
const lifecycleBySlug = new Map(lifecycleRows.map((row) => [row.competitionSlug, row]));

const taskMap = new Map();
for (const wave of waves) {
  for (const task of wave.tasks || []) {
    const key = `${task.competitionSlug}|${task.taskType}`;
    if (!taskMap.has(key)) taskMap.set(key, { ...task, sourceWaveId: wave.waveId });
  }
}
const tasks = [...taskMap.values()].slice(0, MAX_TASKS);

const queryRows = [];
for (const task of tasks) {
  for (const query of buildQueries(task, lifecycleBySlug)) {
    queryRows.push({
      competitionSlug: task.competitionSlug,
      taskType: task.taskType,
      executionLane: task.executionLane,
      cleanName: taskDisplayName(task, lifecycleBySlug),
      query
    });
  }
}

const searchRows = [];
const candidateRows = [];
let searchExecutedNowCount = 0;

for (const queryRow of queryRows) {
  console.log(`RSS ${queryRow.competitionSlug} ${queryRow.taskType} :: ${queryRow.query}`);
  const search = await rssSearch(queryRow.query);
  searchExecutedNowCount++;
  searchRows.push({ ...queryRow, httpStatus: search.status, contentType: search.contentType, itemCount: search.items.length });
  const task = tasks.find((t) => t.competitionSlug === queryRow.competitionSlug && t.taskType === queryRow.taskType);
  for (const item of search.items) {
    const score = scoreCandidate(task, item, lifecycleBySlug);
    candidateRows.push({
      competitionSlug: queryRow.competitionSlug,
      taskType: queryRow.taskType,
      executionLane: queryRow.executionLane,
      cleanName: queryRow.cleanName,
      query: queryRow.query,
      title: item.title,
      link: item.link,
      host: item.host,
      snippet: item.snippet,
      pubDate: item.pubDate,
      score,
      noiseHost: isNoiseHost(item.host),
      candidateClass:
        score >= 95 ? "strong_official_candidate" :
        score >= 65 ? "review_official_candidate" :
        score > 0 ? "weak_candidate" :
        "rejected_noise_or_low_signal"
    });
  }
}

const best = new Map();
for (const row of candidateRows) {
  const key = `${row.competitionSlug}|${row.taskType}|${row.link}`;
  const prev = best.get(key);
  if (!prev || row.score > prev.score) best.set(key, row);
}

const dedupedCandidates = [...best.values()].sort((a, b) => b.score - a.score || a.competitionSlug.localeCompare(b.competitionSlug));
const bestByTask = new Map();
for (const row of dedupedCandidates.filter((candidate) => candidate.score > 0)) {
  const key = `${row.competitionSlug}|${row.taskType}`;
  if (!bestByTask.has(key)) bestByTask.set(key, row);
}

const taskReviews = tasks.map((task) => {
  const key = `${task.competitionSlug}|${task.taskType}`;
  const best = bestByTask.get(key) || null;
  return {
    competitionSlug: task.competitionSlug,
    taskType: task.taskType,
    executionLane: task.executionLane,
    cleanName: taskDisplayName(task, lifecycleBySlug),
    country: taskCountry(task, lifecycleBySlug),
    sourceHostHint: task.sourceHostHint || task.sourceHost || null,
    queryCount: queryRows.filter((row) => row.competitionSlug === task.competitionSlug && row.taskType === task.taskType).length,
    candidateCount: dedupedCandidates.filter((row) => row.competitionSlug === task.competitionSlug && row.taskType === task.taskType && row.score > 0).length,
    bestCandidateScore: best?.score || 0,
    bestCandidateClass: best?.candidateClass || "no_candidate",
    bestCandidateHost: best?.host || null,
    bestCandidateLink: best?.link || null,
    recommendedNextAction:
      best?.score >= 95 ? "controlled_fetch_candidate_url_then_extract_standings_or_governed_start_date" :
      best?.score >= 65 ? "review_candidate_before_fetch" :
      "needs_deeper_official_host_mining"
  };
});

const summary = {
  status: "passed",
  runner: "enhanced_bulk_high_value_source_discovery_waves",
  waveCount: waves.length,
  taskCount: tasks.length,
  queryCount: queryRows.length,
  searchExecutedNowCount,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  rawPayloadWriteExecutedNowCount: 0,
  candidateRowCount: candidateRows.length,
  dedupedCandidateRowCount: dedupedCandidates.length,
  rejectedNoiseOrLowSignalCandidateCount: dedupedCandidates.filter((row) => row.score === 0).length,
  strongTaskCount: taskReviews.filter((row) => row.bestCandidateScore >= 95).length,
  reviewTaskCount: taskReviews.filter((row) => row.bestCandidateScore >= 65 && row.bestCandidateScore < 95).length,
  noUsefulCandidateTaskCount: taskReviews.filter((row) => row.bestCandidateScore < 65).length,
  strongOrReviewTaskCount: taskReviews.filter((row) => row.bestCandidateScore >= 65).length,
  recommendedNextLane: "controlled_fetch_strong_and_review_candidates_in_bulk_with_governed_extractors_no_canonical_or_production_writes"
};

const outPath = path.join(OUT_DIR, `enhanced-bulk-high-value-source-discovery-waves-${DATE}.json`);
const searchRowsPath = path.join(OUT_DIR, `enhanced-bulk-high-value-source-discovery-search-rows-${DATE}.jsonl`);
const candidateRowsPath = path.join(OUT_DIR, `enhanced-bulk-high-value-source-discovery-candidates-${DATE}.jsonl`);
const taskReviewPath = path.join(OUT_DIR, `enhanced-bulk-high-value-source-discovery-task-review-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, taskReviews: taskReviews.slice(0, 500), topCandidates: dedupedCandidates.filter((row) => row.score > 0).slice(0, 500) }, null, 2) + "\n", "utf8");
fs.writeFileSync(searchRowsPath, searchRows.map((row) => JSON.stringify(row)).join("\n") + (searchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(candidateRowsPath, dedupedCandidates.map((row) => JSON.stringify(row)).join("\n") + (dedupedCandidates.length ? "\n" : ""), "utf8");
fs.writeFileSync(taskReviewPath, taskReviews.map((row) => JSON.stringify(row)).join("\n") + (taskReviews.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(outPath),
  searchRowsOutput: rel(searchRowsPath),
  candidatesOutput: rel(candidateRowsPath),
  taskReviewOutput: rel(taskReviewPath),
  summary
}, null, 2));
