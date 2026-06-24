import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..", "..");
const DATE = new Date().toISOString().slice(0, 10);
const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const DIAG_ROOT = path.join(DATA_ROOT, "_diagnostics");
const OUT_DIR = path.join(DIAG_ROOT, `bulk-high-value-source-discovery-wave-${DATE}`);
const args = new Set(process.argv.slice(2));

if (!args.has("--allow-search")) {
  throw new Error("Refusing web/RSS search without --allow-search");
}

const WAVE_INDEX = Number(process.env.BULK_WAVE_INDEX || "1");
const MAX_TASKS = Number(process.env.BULK_MAX_TASKS || "80");
const MAX_QUERIES_PER_TASK = Number(process.env.BULK_MAX_QUERIES_PER_TASK || "3");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll("\\", "/");
}

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
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
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

function xmlDecode(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function stripHtml(value) {
  return xmlDecode(String(value || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function isSearchHostNoise(host) {
  return !host || [
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "youtube.com",
    "wikipedia.org",
    "wikidata.org",
    "reddit.com",
    "linkedin.com",
    "tiktok.com"
  ].some((noise) => host === noise || host.endsWith(`.${noise}`));
}

function taskDisplayName(task, lifecycleBySlug) {
  const row = lifecycleBySlug.get(task.competitionSlug) || {};
  return row.competitionName || row.name || row.displayName || task.competitionName || task.competitionSlug;
}

function taskCountry(task, lifecycleBySlug) {
  const row = lifecycleBySlug.get(task.competitionSlug) || {};
  return row.country || task.country || "";
}

function buildQueries(task, lifecycleBySlug) {
  const name = taskDisplayName(task, lifecycleBySlug);
  const country = taskCountry(task, lifecycleBySlug);
  const host = task.sourceHostHint || task.sourceHost || null;
  const seasonLabel = task.targetSeasonLabel && task.targetSeasonLabel !== "next_season_dynamic" ? task.targetSeasonLabel : "2026 2027";
  const base = `${name} ${country}`.replace(/\s+/g, " ").trim();

  const queries = [];
  if (task.taskType === "acquire_next_season_start_date" || task.executionLane === "official_start_date_evidence_discovery") {
    queries.push(`"${base}" official ${seasonLabel} season start date`);
    queries.push(`"${base}" ${seasonLabel} fixtures start`);
    if (host) queries.push(`site:${host} "${seasonLabel}" "start" "${name}"`);
    else queries.push(`"${base}" "${seasonLabel}" "will start"`);
  } else {
    queries.push(`"${base}" official standings 2025 2026`);
    queries.push(`"${base}" league table 2025-2026 official`);
    if (host) queries.push(`site:${host} standings table 2025 2026`);
    else queries.push(`"${base}" standings table official`);
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
  const country = normalizeText(taskCountry(task, lifecycleBySlug));

  let score = 0;
  if (!isSearchHostNoise(host)) score += 10;
  if (sourceHost && (host === sourceHost || host.endsWith(`.${sourceHost}`))) score += 80;
  if (host.includes("league") || host.includes("liga") || host.includes("fa.") || host.includes("football") || host.includes("federation") || host.includes("bundesliga") || host.includes("premierleague") || host.includes("seriea")) score += 15;
  if (name && text.includes(name.split(" ")[0])) score += 10;
  if (country && text.includes(country)) score += 5;

  if (task.taskType === "acquire_next_season_start_date" || task.executionLane === "official_start_date_evidence_discovery") {
    if (/2026|2027|2026\/27|2026-27|2026 2027/.test(text)) score += 20;
    if (text.includes("start") || text.includes("starts") || text.includes("begin") || text.includes("kick off") || text.includes("fixtures")) score += 25;
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
    const title = xmlDecode((block.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const linkRaw = xmlDecode((block.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const description = stripHtml((block.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || "");
    const pubDate = xmlDecode((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || "");
    const link = linkRaw.trim();
    const host = hostFromUrl(link);
    if (!link || !host) continue;
    items.push({ title: stripHtml(title), link, host, snippet: description, pubDate });
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
    itemCount: parseRssItems(text).length,
    items: parseRssItems(text).slice(0, 10)
  };
}

ensureDir(OUT_DIR);

const highValueWavesPath = latestFile(/high-value-bulk-execution-waves-\d{4}-\d{2}-\d{2}\.jsonl$/);
const lifecycleRowsPath = latestFile(/permanent-season-lifecycle-rows-\d{4}-\d{2}-\d{2}\.jsonl$/);
if (!highValueWavesPath) throw new Error("Missing high-value bulk execution waves jsonl");
if (!lifecycleRowsPath) throw new Error("Missing lifecycle rows jsonl");

const waves = parseJsonlSafe(highValueWavesPath);
const selectedWave = waves[WAVE_INDEX - 1];
if (!selectedWave) throw new Error(`Missing high-value wave index ${WAVE_INDEX}`);

const lifecycleRows = parseJsonlSafe(lifecycleRowsPath);
const lifecycleBySlug = new Map(lifecycleRows.map((row) => [row.competitionSlug, row]));

const tasks = (selectedWave.tasks || []).slice(0, MAX_TASKS);
const queryRows = [];
for (const task of tasks) {
  for (const query of buildQueries(task, lifecycleBySlug)) {
    queryRows.push({ competitionSlug: task.competitionSlug, taskType: task.taskType, executionLane: task.executionLane, query });
  }
}

const searchRows = [];
const candidateRows = [];
let searchExecutedNowCount = 0;

for (const queryRow of queryRows) {
  console.log(`RSS ${queryRow.competitionSlug} ${queryRow.taskType} :: ${queryRow.query}`);
  const search = await rssSearch(queryRow.query);
  searchExecutedNowCount++;
  searchRows.push({
    ...queryRow,
    httpStatus: search.status,
    contentType: search.contentType,
    itemCount: search.itemCount
  });
  const task = tasks.find((t) => t.competitionSlug === queryRow.competitionSlug && t.taskType === queryRow.taskType) || tasks.find((t) => t.competitionSlug === queryRow.competitionSlug);
  for (const item of search.items) {
    const score = scoreCandidate(task, item, lifecycleBySlug);
    candidateRows.push({
      competitionSlug: queryRow.competitionSlug,
      taskType: queryRow.taskType,
      executionLane: queryRow.executionLane,
      query: queryRow.query,
      title: item.title,
      link: item.link,
      host: item.host,
      snippet: item.snippet,
      pubDate: item.pubDate,
      score,
      candidateClass:
        score >= 90 ? "strong_official_or_known_host_candidate" :
        score >= 55 ? "review_candidate" :
        "weak_candidate"
    });
  }
}

const dedupedCandidateMap = new Map();
for (const row of candidateRows) {
  const key = `${row.competitionSlug}|${row.taskType}|${row.link}`;
  const prev = dedupedCandidateMap.get(key);
  if (!prev || row.score > prev.score) dedupedCandidateMap.set(key, row);
}

const dedupedCandidates = [...dedupedCandidateMap.values()].sort((a, b) =>
  b.score - a.score ||
  a.competitionSlug.localeCompare(b.competitionSlug) ||
  a.link.localeCompare(b.link)
);

const bestByTask = new Map();
for (const row of dedupedCandidates) {
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
    highValuePrefix: !!task.highValuePrefix,
    uefaLikePrefix: !!task.uefaLikePrefix,
    sourceHostHint: task.sourceHostHint || task.sourceHost || null,
    displayName: taskDisplayName(task, lifecycleBySlug),
    country: taskCountry(task, lifecycleBySlug),
    queryCount: queryRows.filter((row) => row.competitionSlug === task.competitionSlug && row.taskType === task.taskType).length,
    candidateCount: dedupedCandidates.filter((row) => row.competitionSlug === task.competitionSlug && row.taskType === task.taskType).length,
    bestCandidateScore: best?.score || 0,
    bestCandidateClass: best?.candidateClass || "no_candidate",
    bestCandidateHost: best?.host || null,
    bestCandidateLink: best?.link || null,
    recommendedNextAction:
      best?.score >= 90 ? "controlled_fetch_candidate_url_then_extract_standings_or_governed_start_date" :
      best?.score >= 55 ? "review_candidate_before_fetch" :
      "needs_source_family_or_official_host_mining"
  };
});

const strongTaskCount = taskReviews.filter((row) => row.bestCandidateScore >= 90).length;
const reviewTaskCount = taskReviews.filter((row) => row.bestCandidateScore >= 55 && row.bestCandidateScore < 90).length;
const noUsefulCandidateTaskCount = taskReviews.filter((row) => row.bestCandidateScore < 55).length;

const summary = {
  status: "passed",
  runner: "bulk_high_value_source_discovery_wave",
  waveId: selectedWave.waveId,
  waveIndex: WAVE_INDEX,
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
  strongTaskCount,
  reviewTaskCount,
  noUsefulCandidateTaskCount,
  officialOrKnownHostCandidateCount: dedupedCandidates.filter((row) => row.candidateClass === "strong_official_or_known_host_candidate").length,
  recommendedNextLane:
    strongTaskCount >= 10
      ? "run_controlled_bulk_fetch_for_strong_candidates_no_canonical_or_production_writes"
      : "mine_more_source_hosts_before_fetching"
};

const outPath = path.join(OUT_DIR, `bulk-high-value-source-discovery-wave-${DATE}.json`);
const searchRowsPath = path.join(OUT_DIR, `bulk-high-value-source-discovery-search-rows-${DATE}.jsonl`);
const candidateRowsPath = path.join(OUT_DIR, `bulk-high-value-source-discovery-candidates-${DATE}.jsonl`);
const taskReviewPath = path.join(OUT_DIR, `bulk-high-value-source-discovery-task-review-${DATE}.jsonl`);

fs.writeFileSync(outPath, JSON.stringify({ summary, selectedWave: { ...selectedWave, tasks: undefined }, taskReviews: taskReviews.slice(0, 250), topCandidates: dedupedCandidates.slice(0, 250) }, null, 2) + "\n", "utf8");
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
