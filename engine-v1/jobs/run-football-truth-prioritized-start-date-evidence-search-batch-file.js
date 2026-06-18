#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);

const allowSearch = argv.includes("--allow-search");
const batchStartIndex = Number(argv[argv.indexOf("--batch-start-index") + 1] || 0);
const batchCount = Number(argv[argv.indexOf("--batch-count") + 1] || 1);
const queriesPerTarget = Number(argv[argv.indexOf("--queries-per-target") + 1] || 2);
const concurrency = Number(argv[argv.indexOf("--concurrency") + 1] || 6);
const timeoutMs = Number(argv[argv.indexOf("--timeout-ms") + 1] || 12000);

const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const BATCH_DIR = path.join(DATA_ROOT, "_diagnostics", `prioritized-start-date-evidence-batches-${DATE}`);
const BATCH_PATH = path.join(BATCH_DIR, `prioritized-start-date-evidence-batches-${DATE}.json`);
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `prioritized-start-date-evidence-search-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function htmlDecode(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

function stripHtml(s) {
  return htmlDecode(String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function normalizeDate(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (!y || !m || !d) return null;
  if (y < 2026 || y > 2027 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const monthMap = new Map(Object.entries({
  january:1, jan:1, janvier:1, enero:1, janeiro:1, januar:1, januari:1, gennaio:1,
  february:2, feb:2, février:2, fevrier:2, febrero:2, fevereiro:2, februar:2, februari:2, febbraio:2,
  march:3, mar:3, mars:3, marzo:3, março:3, março:3, maart:3, märz:3, maerz:3,
  april:4, apr:4, avril:4, abril:4, aprile:4,
  may:5, mai:5, mayo:5, maio:5, maggio:5, mei:5,
  june:6, jun:6, juin:6, junio:6, junho:6, juni:6, giugno:6,
  july:7, jul:7, juillet:7, julio:7, julho:7, juli:7, luglio:7,
  august:8, aug:8, août:8, aout:8, agosto:8, augustus:8,
  september:9, sep:9, sept:9, septembre:9, septiembre:9, setembro:9, settembre:9,
  october:10, oct:10, octobre:10, octubre:10, outubro:10, oktober:10, ottobre:10,
  november:11, nov:11, novembre:11, noviembre:11, novembro:11,
  december:12, dec:12, décembre:12, decembre:12, diciembre:12, dezembro:12, dezember:12, dicembre:12
}));

function extractDates(text) {
  const t = stripHtml(text).toLowerCase();
  const dates = new Set();

  for (const m of t.matchAll(/\b(2026|2027)[-/\.](0?[1-9]|1[0-2])[-/\.](0?[1-9]|[12]\d|3[01])\b/g)) {
    const d = normalizeDate(m[1], m[2], m[3]);
    if (d) dates.add(d);
  }

  for (const m of t.matchAll(/\b(0?[1-9]|[12]\d|3[01])[-/\.](0?[1-9]|1[0-2])[-/\.](2026|2027)\b/g)) {
    const d = normalizeDate(m[3], m[2], m[1]);
    if (d) dates.add(d);
  }

  const monthNames = [...monthMap.keys()].sort((a, b) => b.length - a.length).join("|").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\|/g, "|");

  const dayMonthYear = new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?\\s+(${monthNames})\\s+(2026|2027)\\b`, "gi");
  for (const m of t.matchAll(dayMonthYear)) {
    const d = normalizeDate(m[3], monthMap.get(m[2].toLowerCase()), m[1]);
    if (d) dates.add(d);
  }

  const monthDayYear = new RegExp(`\\b(${monthNames})\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?,?\\s+(2026|2027)\\b`, "gi");
  for (const m of t.matchAll(monthDayYear)) {
    const d = normalizeDate(m[3], monthMap.get(m[1].toLowerCase()), m[2]);
    if (d) dates.add(d);
  }

  return [...dates].sort();
}

function isDateContext(text) {
  return /\b(start|starts|begin|begins|opening|kick.?off|fixture|fixtures|schedule|calendar|matchday|round 1|jornada 1|spieltag 1|calendario|calendrier|programma|season)\b/i.test(String(text || ""));
}

function parseBingResults(html) {
  const results = [];
  const blocks = html.match(/<li class="b_algo"[\s\S]*?<\/li>/gi) || [];

  for (const block of blocks) {
    const href = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/i)?.[1] ||
      block.match(/<a[^>]+href="(https?:\/\/[^"]+)"/i)?.[1];

    if (!href || !/^https?:\/\//i.test(href)) continue;

    const titleHtml = block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1] || "";
    const snippetHtml = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] || "";
    const title = stripHtml(titleHtml);
    const snippet = stripHtml(snippetHtml);
    const url = htmlDecode(href);
    const resultHost = hostOf(url);

    if (!resultHost || resultHost.includes("bing.com")) continue;

    results.push({
      title,
      snippet,
      url,
      resultHost,
      dates: extractDates(`${title} ${snippet} ${url}`)
    });
  }

  return results.slice(0, 8);
}

async function searchBing(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10&setlang=en`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 FootballTruthStartDateEvidence/1.0",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const html = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      html,
      results: parseBingResults(html)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyTarget(target, resultRows) {
  const officialHost = target.sourceHostHint ? String(target.sourceHostHint).replace(/^www\./, "").toLowerCase() : null;

  const officialHostResults = resultRows.filter((r) =>
    officialHost && r.resultHost && (r.resultHost === officialHost || r.resultHost.endsWith(`.${officialHost}`))
  );

  const dateCandidates = resultRows.filter((r) =>
    r.dates?.length && isDateContext(`${r.title} ${r.snippet} ${r.url}`)
  );

  const officialDateCandidates = dateCandidates.filter((r) =>
    officialHost && r.resultHost && (r.resultHost === officialHost || r.resultHost.endsWith(`.${officialHost}`))
  );

  const best = officialDateCandidates[0] || dateCandidates[0] || officialHostResults[0] || resultRows[0] || null;

  return {
    competitionSlug: target.competitionSlug,
    competitionName: target.competitionName,
    priorityScore: target.priorityScore,
    sourceHostHint: officialHost,
    searchedQueryCount: target._searchedQueryCount || 0,
    resultCount: resultRows.length,
    officialHostResultCount: officialHostResults.length,
    dateCandidateCount: dateCandidates.length,
    officialHostDateCandidateCount: officialDateCandidates.length,
    evidenceStatus: officialDateCandidates.length ? "official_host_date_candidate" :
      dateCandidates.length ? "date_candidate_unverified_host" :
      officialHostResults.length ? "official_host_result_no_date" :
      resultRows.length ? "search_result_no_date" :
      "no_search_result",
    candidateNextSeasonStartDate: best?.dates?.[0] || null,
    candidateUrl: best?.url || null,
    candidateHost: best?.resultHost || null,
    candidateTitle: best?.title || null,
    candidateSnippet: best?.snippet || null
  };
}

async function runPool(items, worker, limit) {
  const results = [];
  let next = 0;
  async function runOne() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runOne));
  return results;
}

if (!fs.existsSync(BATCH_PATH)) {
  throw new Error(`Missing prioritized batch file: ${BATCH_PATH}`);
}

const batchDoc = JSON.parse(fs.readFileSync(BATCH_PATH, "utf8"));
const selectedBatches = (batchDoc.batches || []).slice(batchStartIndex, batchStartIndex + batchCount);
const targets = selectedBatches.flatMap((b) => b.targets || []);

let searchExecutedNowCount = 0;
const searchRows = [];
const failures = [];

console.log(JSON.stringify({
  status: "starting",
  allowSearch,
  selectedBatchIds: selectedBatches.map((b) => b.batchId),
  targetCount: targets.length,
  queriesPerTarget,
  concurrency,
  timeoutMs
}, null, 2));

if (allowSearch) {
  await runPool(targets, async (target, index) => {
    const queries = (target.queries || []).slice(0, queriesPerTarget);
    target._searchedQueryCount = queries.length;

    for (const query of queries) {
      try {
        searchExecutedNowCount++;
        const searchedAt = new Date().toISOString();
        const res = await searchBing(query);

        for (const result of res.results) {
          searchRows.push({
            competitionSlug: target.competitionSlug,
            competitionName: target.competitionName,
            priorityScore: target.priorityScore,
            sourceHostHint: target.sourceHostHint || null,
            query,
            searchedAt,
            searchStatus: res.status,
            ...result
          });
        }
      } catch (err) {
        failures.push({
          competitionSlug: target.competitionSlug,
          query,
          error: String(err?.message || err)
        });
      }
    }

    if ((index + 1) % 10 === 0 || index + 1 === targets.length) {
      console.error(`PROGRESS targets=${index + 1}/${targets.length} searches=${searchExecutedNowCount} results=${searchRows.length} failures=${failures.length}`);
    }
  }, concurrency);
}

const bySlug = new Map();
for (const row of searchRows) {
  if (!bySlug.has(row.competitionSlug)) bySlug.set(row.competitionSlug, []);
  bySlug.get(row.competitionSlug).push(row);
}

const classifications = targets.map((target) => classifyTarget(target, bySlug.get(target.competitionSlug) || []));

const summary = {
  status: "passed",
  runner: "prioritized_start_date_evidence_search_batch",
  sourceBatchPath: rel(BATCH_PATH),
  selectedBatchIds: selectedBatches.map((b) => b.batchId),
  batchStartIndex,
  batchCount,
  targetCount: targets.length,
  allowSearch,
  searchExecutedNowCount,
  fetchExecutedNowCount: 0,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  searchResultRowCount: searchRows.length,
  failureCount: failures.length,
  targetWithSearchResultCount: classifications.filter((c) => c.resultCount > 0).length,
  targetWithAnyDateCandidateCount: classifications.filter((c) => c.dateCandidateCount > 0).length,
  targetWithOfficialHostResultCount: classifications.filter((c) => c.officialHostResultCount > 0).length,
  targetWithOfficialHostDateCandidateCount: classifications.filter((c) => c.officialHostDateCandidateCount > 0).length,
  officialHostDateCandidateSlugs: classifications.filter((c) => c.officialHostDateCandidateCount > 0).map((c) => c.competitionSlug),
  anyDateCandidateSlugs: classifications.filter((c) => c.dateCandidateCount > 0).map((c) => c.competitionSlug),
  recommendedNextLane: "fetch_and_verify_official_candidate_pages_for_official_host_date_candidates_only"
};

const reportPath = path.join(OUT_DIR, `prioritized-start-date-evidence-search-report-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `prioritized-start-date-evidence-search-results-${DATE}.jsonl`);
const classPath = path.join(OUT_DIR, `prioritized-start-date-evidence-classifications-${DATE}.jsonl`);
const failuresPath = path.join(OUT_DIR, `prioritized-start-date-evidence-search-failures-${DATE}.jsonl`);

fs.writeFileSync(reportPath, JSON.stringify({ summary, classifications }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, searchRows.map((r) => JSON.stringify(r)).join("\n") + (searchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(classPath, classifications.map((r) => JSON.stringify(r)).join("\n") + (classifications.length ? "\n" : ""), "utf8");
fs.writeFileSync(failuresPath, failures.map((r) => JSON.stringify(r)).join("\n") + (failures.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(reportPath),
  searchResultsOutput: rel(rowsPath),
  classificationsOutput: rel(classPath),
  failuresOutput: rel(failuresPath),
  summary
}, null, 2));
