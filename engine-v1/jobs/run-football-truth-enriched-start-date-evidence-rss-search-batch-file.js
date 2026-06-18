#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);

const allowSearch = argv.includes("--allow-search");
const batchStartIndex = Number(argv[argv.indexOf("--batch-start-index") + 1] || 0);
const batchCount = Number(argv[argv.indexOf("--batch-count") + 1] || 4);
const queriesPerTarget = Number(argv[argv.indexOf("--queries-per-target") + 1] || 4);
const concurrency = Number(argv[argv.indexOf("--concurrency") + 1] || 8);
const timeoutMs = Number(argv[argv.indexOf("--timeout-ms") + 1] || 15000);

const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const BATCH_DIR = path.join(DATA_ROOT, "_diagnostics", `prioritized-start-date-evidence-batches-${DATE}`);
const BATCH_PATH = path.join(BATCH_DIR, `prioritized-start-date-evidence-batches-${DATE}.json`);
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `enriched-start-date-evidence-rss-search-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function htmlDecode(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
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
  march:3, mar:3, mars:3, marzo:3, março:3, maart:3, märz:3, maerz:3,
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

const countryByPrefix = {
  alb:"Albania", and:"Andorra", arm:"Armenia", aut:"Austria", aze:"Azerbaijan", bel:"Belgium", bih:"Bosnia and Herzegovina", blr:"Belarus", bul:"Bulgaria", cro:"Croatia", cyp:"Cyprus", cze:"Czech Republic", den:"Denmark", eng:"England", esp:"Spain", est:"Estonia", fin:"Finland", fra:"France", fro:"Faroe Islands", geo:"Georgia", ger:"Germany", gib:"Gibraltar", gre:"Greece", hun:"Hungary", irl:"Ireland", isl:"Iceland", isr:"Israel", ita:"Italy", kaz:"Kazakhstan", kos:"Kosovo", lva:"Latvia", ltu:"Lithuania", lux:"Luxembourg", mda:"Moldova", mkd:"North Macedonia", mlt:"Malta", mne:"Montenegro", ned:"Netherlands", nir:"Northern Ireland", nor:"Norway", pol:"Poland", por:"Portugal", rom:"Romania", rus:"Russia", sco:"Scotland", ser:"Serbia", sui:"Switzerland", svk:"Slovakia", svn:"Slovenia", swe:"Sweden", tur:"Turkey", ukr:"Ukraine", wal:"Wales",
  arg:"Argentina", bra:"Brazil", mex:"Mexico", usa:"United States", can:"Canada", jpn:"Japan", kor:"South Korea", aus:"Australia", chn:"China", ksa:"Saudi Arabia", qat:"Qatar"
};

const leagueNameBySlug = {
  "esp.1":"LaLiga", "esp.2":"LaLiga Hypermotion",
  "ger.1":"Bundesliga", "ger.2":"2. Bundesliga", "ger.3":"3. Liga",
  "cro.1":"SuperSport HNL", "cro.2":"Prva NL",
  "eng.1":"Premier League", "eng.2":"EFL Championship", "eng.3":"EFL League One", "eng.4":"EFL League Two", "eng.5":"National League",
  "ita.1":"Serie A", "ita.2":"Serie B",
  "fra.1":"Ligue 1", "fra.2":"Ligue 2",
  "por.1":"Liga Portugal Betclic", "por.2":"Liga Portugal 2",
  "ned.1":"Eredivisie", "ned.2":"Eerste Divisie",
  "bel.1":"Belgian Pro League", "bel.2":"Challenger Pro League",
  "aut.1":"Austrian Bundesliga", "aut.2":"2. Liga Austria",
  "sui.1":"Swiss Super League", "sui.2":"Swiss Challenge League",
  "tur.1":"Süper Lig", "tur.2":"TFF 1. Lig",
  "gre.1":"Super League Greece", "gre.2":"Super League 2 Greece",
  "sco.1":"Scottish Premiership", "sco.2":"Scottish Championship",
  "den.1":"Danish Superliga", "den.2":"Danish 1st Division",
  "swe.1":"Allsvenskan", "swe.2":"Superettan",
  "nor.1":"Eliteserien", "nor.2":"OBOS-ligaen",
  "fin.1":"Veikkausliiga", "fin.2":"Ykkösliiga",
  "pol.1":"Ekstraklasa", "pol.2":"I liga Poland",
  "cze.1":"Czech First League", "cze.2":"Czech National Football League",
  "ser.1":"Serbian SuperLiga", "ser.2":"Serbian First League",
  "ukr.1":"Ukrainian Premier League", "ukr.2":"Ukrainian First League",
  "rus.1":"Russian Premier League", "rus.2":"Russian First League",
  "arg.1":"Argentine Primera División", "arg.2":"Primera Nacional Argentina",
  "bra.1":"Campeonato Brasileiro Série A", "bra.2":"Campeonato Brasileiro Série B",
  "mex.1":"Liga MX", "mex.2":"Liga de Expansión MX",
  "usa.1":"Major League Soccer", "usa.2":"USL Championship",
  "jpn.1":"J1 League", "jpn.2":"J2 League",
  "kor.1":"K League 1", "kor.2":"K League 2",
  "aus.1":"A-League Men", "aus.2":"National Premier Leagues Australia",
  "chn.1":"Chinese Super League", "chn.2":"China League One",
  "ksa.1":"Saudi Pro League", "ksa.2":"Saudi First Division League",
  "qat.1":"Qatar Stars League", "qat.2":"Qatari Second Division"
};

const badHosts = new Set([
  "wikipedia.org", "en.wikipedia.org", "google.com", "support.google.com", "support.microsoft.com", "microsoft.com",
  "imdb.com", "genius.com", "answers.com", "merriam-webster.com", "github.com", "play.google.com",
  "qr-code-generator.com", "public.com"
]);

function targetDisplayName(target) {
  if (leagueNameBySlug[target.competitionSlug]) return leagueNameBySlug[target.competitionSlug];
  const prefix = String(target.competitionSlug).split(".")[0];
  const tier = Number(String(target.competitionSlug).split(".")[1]);
  const country = countryByPrefix[prefix] || target.country || "";
  if (country && tier === 1) return `${country} top football league`;
  if (country && tier === 2) return `${country} second football league`;
  if (country && tier === 3) return `${country} third football league`;
  if (target.competitionName && !/^[a-z]{3}\.\d+$/.test(target.competitionName)) return target.competitionName;
  return target.competitionSlug;
}

function buildQueries(target) {
  const name = targetDisplayName(target);
  const host = target.sourceHostHint ? String(target.sourceHostHint).replace(/^www\./, "").toLowerCase() : null;
  const qs = [];

  if (host) {
    qs.push(`site:${host} "${name}" "2026/27" fixtures`);
    qs.push(`site:${host} "${name}" "2026-27" calendar`);
    qs.push(`site:${host} "${name}" "opening match"`);
  }

  qs.push(`"${name}" "2026/27" fixtures start date`);
  qs.push(`"${name}" "2026-27" calendar first match`);
  qs.push(`"${name}" "2026 2027" league fixtures`);
  qs.push(`"${name}" season starts 2026 2027 official`);

  return [...new Set(qs)].slice(0, queriesPerTarget);
}

function isDateContext(text) {
  return /\b(start|starts|begin|begins|opening|kick.?off|fixture|fixtures|schedule|calendar|matchday|round 1|jornada|spieltag|calendario|calendrier|programma|season|2026.?27|2026.?2027|first match)\b/i.test(String(text || ""));
}

function relevanceScore(target, row) {
  const name = targetDisplayName(target).toLowerCase();
  const tokens = name.split(/[^a-z0-9]+/i).filter((x) => x.length >= 3);
  const text = `${row.title} ${row.snippet} ${row.url}`.toLowerCase();
  let score = 0;

  for (const token of tokens) {
    if (text.includes(token)) score += 3;
  }

  if (/\bfootball|soccer|league|fixtures?|calendar|season|matchday|round|standing|table\b/i.test(text)) score += 5;
  if (/\bofficial\b/i.test(text)) score += 3;

  const host = row.resultHost || "";
  const sourceHost = target.sourceHostHint ? String(target.sourceHostHint).replace(/^www\./, "").toLowerCase() : null;
  if (sourceHost && (host === sourceHost || host.endsWith(`.${sourceHost}`))) score += 20;
  if (badHosts.has(host)) score -= 25;

  return score;
}

function parseRssItems(xml) {
  const items = [];
  const blocks = String(xml || "").match(/<item\b[\s\S]*?<\/item>/gi) || [];

  for (const block of blocks) {
    const title = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const link = htmlDecode(stripHtml(block.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || ""));
    const description = stripHtml(block.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "");
    const resultHost = hostOf(link);

    if (!link || !/^https?:\/\//i.test(link) || !resultHost) continue;

    items.push({
      title,
      snippet: description,
      url: link,
      resultHost,
      dates: extractDates(`${title} ${description} ${link}`),
      parser: "bing_rss_enriched"
    });
  }

  return items.slice(0, 10);
}

async function searchBingRss(query) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}&count=10&setlang=en`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 FootballTruthEnrichedStartDateEvidence/1.0",
        "accept": "application/rss+xml,text/xml,application/xml,text/plain,*/*"
      }
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      byteCount: Buffer.byteLength(text),
      itemCount: (text.match(/<item\b/gi) || []).length,
      results: parseRssItems(text),
      responseHead: text.slice(0, 300)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function classifyTarget(target, resultRows) {
  const officialHost = target.sourceHostHint ? String(target.sourceHostHint).replace(/^www\./, "").toLowerCase() : null;
  const scoredRows = resultRows.map((r) => ({ ...r, relevanceScore: relevanceScore(target, r) }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const relevantRows = scoredRows.filter((r) => r.relevanceScore >= 5);
  const officialHostResults = relevantRows.filter((r) =>
    officialHost && r.resultHost && (r.resultHost === officialHost || r.resultHost.endsWith(`.${officialHost}`))
  );

  const dateCandidates = relevantRows.filter((r) =>
    r.dates?.length && isDateContext(`${r.title} ${r.snippet} ${r.url}`)
  );

  const officialHostDateCandidates = dateCandidates.filter((r) =>
    officialHost && r.resultHost && (r.resultHost === officialHost || r.resultHost.endsWith(`.${officialHost}`))
  );

  const best = officialHostDateCandidates[0] || dateCandidates[0] || officialHostResults[0] || relevantRows[0] || scoredRows[0] || null;

  return {
    competitionSlug: target.competitionSlug,
    enrichedCompetitionName: targetDisplayName(target),
    priorityScore: target.priorityScore,
    sourceHostHint: officialHost,
    searchedQueryCount: target._searchedQueryCount || 0,
    rawResultCount: resultRows.length,
    relevantResultCount: relevantRows.length,
    officialHostResultCount: officialHostResults.length,
    dateCandidateCount: dateCandidates.length,
    officialHostDateCandidateCount: officialHostDateCandidates.length,
    evidenceStatus: officialHostDateCandidates.length ? "official_host_date_candidate" :
      dateCandidates.length ? "date_candidate_relevant_unverified_host" :
      officialHostResults.length ? "official_host_result_no_date" :
      relevantRows.length ? "relevant_result_no_date" :
      resultRows.length ? "raw_result_rejected_low_relevance" :
      "no_search_result",
    candidateNextSeasonStartDate: best?.dates?.[0] || null,
    candidateUrl: best?.url || null,
    candidateHost: best?.resultHost || null,
    candidateTitle: best?.title || null,
    candidateSnippet: best?.snippet || null,
    candidateRelevanceScore: best?.relevanceScore ?? null
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

if (!fs.existsSync(BATCH_PATH)) throw new Error(`Missing prioritized batch file: ${BATCH_PATH}`);

const batchDoc = JSON.parse(fs.readFileSync(BATCH_PATH, "utf8"));
const selectedBatches = (batchDoc.batches || []).slice(batchStartIndex, batchStartIndex + batchCount);
const targets = selectedBatches.flatMap((b) => b.targets || []).map((target) => ({
  ...target,
  enrichedCompetitionName: targetDisplayName(target),
  queries: buildQueries(target)
}));

let searchExecutedNowCount = 0;
const searchRows = [];
const failures = [];
const searchHealth = [];

console.log(JSON.stringify({
  status: "starting",
  mode: "bing_rss_enriched_name_aware",
  allowSearch,
  selectedBatchIds: selectedBatches.map((b) => b.batchId),
  targetCount: targets.length,
  queriesPerTarget,
  concurrency,
  timeoutMs,
  sampleTargets: targets.slice(0, 12).map((t) => ({ competitionSlug: t.competitionSlug, enrichedCompetitionName: t.enrichedCompetitionName, queries: t.queries }))
}, null, 2));

if (allowSearch) {
  await runPool(targets, async (target, index) => {
    const queries = (target.queries || []).slice(0, queriesPerTarget);
    target._searchedQueryCount = queries.length;

    for (const query of queries) {
      try {
        searchExecutedNowCount++;
        const searchedAt = new Date().toISOString();
        const res = await searchBingRss(query);

        searchHealth.push({
          competitionSlug: target.competitionSlug,
          enrichedCompetitionName: target.enrichedCompetitionName,
          query,
          searchedAt,
          status: res.status,
          byteCount: res.byteCount,
          itemCount: res.itemCount,
          parsedResultCount: res.results.length,
          responseHead: res.responseHead
        });

        for (const result of res.results) {
          const row = {
            competitionSlug: target.competitionSlug,
            enrichedCompetitionName: target.enrichedCompetitionName,
            priorityScore: target.priorityScore,
            sourceHostHint: target.sourceHostHint || null,
            query,
            searchedAt,
            searchStatus: res.status,
            ...result
          };
          row.relevanceScore = relevanceScore(target, row);
          searchRows.push(row);
        }
      } catch (err) {
        failures.push({
          competitionSlug: target.competitionSlug,
          enrichedCompetitionName: target.enrichedCompetitionName,
          query,
          error: String(err?.message || err)
        });
      }
    }

    if ((index + 1) % 20 === 0 || index + 1 === targets.length) {
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
  runner: "enriched_start_date_evidence_rss_search_batch",
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
  relevantSearchResultRowCount: searchRows.filter((r) => r.relevanceScore >= 5).length,
  failureCount: failures.length,
  searchHealthZeroItemCount: searchHealth.filter((h) => h.itemCount === 0).length,
  searchHealthNonZeroItemCount: searchHealth.filter((h) => h.itemCount > 0).length,
  targetWithRawSearchResultCount: classifications.filter((c) => c.rawResultCount > 0).length,
  targetWithRelevantSearchResultCount: classifications.filter((c) => c.relevantResultCount > 0).length,
  targetWithAnyDateCandidateCount: classifications.filter((c) => c.dateCandidateCount > 0).length,
  targetWithOfficialHostResultCount: classifications.filter((c) => c.officialHostResultCount > 0).length,
  targetWithOfficialHostDateCandidateCount: classifications.filter((c) => c.officialHostDateCandidateCount > 0).length,
  officialHostDateCandidateSlugs: classifications.filter((c) => c.officialHostDateCandidateCount > 0).map((c) => c.competitionSlug),
  anyDateCandidateSlugs: classifications.filter((c) => c.dateCandidateCount > 0).map((c) => c.competitionSlug),
  recommendedNextLane: classifications.some((c) => c.dateCandidateCount > 0)
    ? "fetch_and_verify_candidate_pages_for_relevant_date_candidates_only"
    : "inspect_enriched_query_quality_and_source_host_coverage"
};

const reportPath = path.join(OUT_DIR, `enriched-start-date-evidence-rss-search-report-${DATE}.json`);
const rowsPath = path.join(OUT_DIR, `enriched-start-date-evidence-rss-search-results-${DATE}.jsonl`);
const classPath = path.join(OUT_DIR, `enriched-start-date-evidence-rss-classifications-${DATE}.jsonl`);
const failuresPath = path.join(OUT_DIR, `enriched-start-date-evidence-rss-search-failures-${DATE}.jsonl`);
const healthPath = path.join(OUT_DIR, `enriched-start-date-evidence-rss-search-health-${DATE}.jsonl`);
const enrichedTargetsPath = path.join(OUT_DIR, `enriched-start-date-evidence-targets-${DATE}.jsonl`);

fs.writeFileSync(reportPath, JSON.stringify({ summary, classifications }, null, 2) + "\n", "utf8");
fs.writeFileSync(rowsPath, searchRows.map((r) => JSON.stringify(r)).join("\n") + (searchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(classPath, classifications.map((r) => JSON.stringify(r)).join("\n") + (classifications.length ? "\n" : ""), "utf8");
fs.writeFileSync(failuresPath, failures.map((r) => JSON.stringify(r)).join("\n") + (failures.length ? "\n" : ""), "utf8");
fs.writeFileSync(healthPath, searchHealth.map((r) => JSON.stringify(r)).join("\n") + (searchHealth.length ? "\n" : ""), "utf8");
fs.writeFileSync(enrichedTargetsPath, targets.map((r) => JSON.stringify(r)).join("\n") + (targets.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(reportPath),
  searchResultsOutput: rel(rowsPath),
  classificationsOutput: rel(classPath),
  failuresOutput: rel(failuresPath),
  searchHealthOutput: rel(healthPath),
  enrichedTargetsOutput: rel(enrichedTargetsPath),
  summary
}, null, 2));
