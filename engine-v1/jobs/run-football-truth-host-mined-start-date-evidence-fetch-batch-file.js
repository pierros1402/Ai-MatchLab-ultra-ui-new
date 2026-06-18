#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DATE = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);

const allowSearch = argv.includes("--allow-search");
const allowFetch = argv.includes("--allow-fetch");
const batchStartIndex = Number(argv[argv.indexOf("--batch-start-index") + 1] || 0);
const batchCount = Number(argv[argv.indexOf("--batch-count") + 1] || 4);
const queriesPerTarget = Number(argv[argv.indexOf("--queries-per-target") + 1] || 6);
const fetchPerTarget = Number(argv[argv.indexOf("--fetch-per-target") + 1] || 2);
const concurrency = Number(argv[argv.indexOf("--concurrency") + 1] || 8);
const timeoutMs = Number(argv[argv.indexOf("--timeout-ms") + 1] || 15000);
const maxChars = Number(argv[argv.indexOf("--max-chars") + 1] || 250000);

const DATA_ROOT = path.join(ROOT, "data", "football-truth");
const PRIORITY_BATCH_PATH = path.join(DATA_ROOT, "_diagnostics", `prioritized-start-date-evidence-batches-${DATE}`, `prioritized-start-date-evidence-batches-${DATE}.json`);
const ENRICHED_DIR = path.join(DATA_ROOT, "_diagnostics", `enriched-start-date-evidence-rss-search-${DATE}`);
const ENRICHED_TARGETS_PATH = path.join(ENRICHED_DIR, `enriched-start-date-evidence-targets-${DATE}.jsonl`);
const ENRICHED_RESULTS_PATH = path.join(ENRICHED_DIR, `enriched-start-date-evidence-rss-search-results-${DATE}.jsonl`);
const OUT_DIR = path.join(DATA_ROOT, "_diagnostics", `host-mined-start-date-evidence-fetch-${DATE}`);
fs.mkdirSync(OUT_DIR, { recursive: true });

function rel(p) {
  return path.relative(ROOT, p).replaceAll("\\", "/");
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
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
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
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

const badHosts = new Set([
  "wikipedia.org","en.wikipedia.org","google.com","support.google.com","support.microsoft.com","microsoft.com",
  "imdb.com","genius.com","answers.com","merriam-webster.com","github.com","play.google.com","qr-code-generator.com",
  "public.com","facebook.com","x.com","twitter.com","instagram.com","youtube.com","linkedin.com","reddit.com",
  "amazon.com","booking.com","tripadvisor.com","flashscore.com","sofascore.com","livesport.com","soccerway.com",
  "worldfootball.net","transfermarkt.com","bet365.com","oddsportal.com"
]);

const knownOfficialHosts = {
  "esp.1":["laliga.com"], "esp.2":["laliga.com"],
  "ger.1":["bundesliga.com"], "ger.2":["bundesliga.com"], "ger.3":["dfb.de"],
  "cro.1":["hnl.hr"], "cro.2":["hnl.hr"],
  "eng.1":["premierleague.com"], "eng.2":["efl.com"], "eng.3":["efl.com"], "eng.4":["efl.com"], "eng.5":["thenationalleague.org.uk"],
  "ita.1":["legaseriea.it"], "ita.2":["legab.it"],
  "fra.1":["ligue1.com","lfp.fr"], "fra.2":["ligue2.fr","lfp.fr"],
  "por.1":["ligaportugal.pt"], "por.2":["ligaportugal.pt"],
  "ned.1":["eredivisie.nl"], "ned.2":["keukenkampioendivisie.nl"],
  "bel.1":["proleague.be"], "bel.2":["proleague.be"],
  "aut.1":["bundesliga.at"], "aut.2":["2liga.at","bundesliga.at"],
  "sui.1":["sfl.ch"], "sui.2":["sfl.ch"],
  "tur.1":["tff.org"], "tur.2":["tff.org"],
  "gre.1":["slgr.gr"], "gre.2":["sl2.gr"],
  "sco.1":["spfl.co.uk"], "sco.2":["spfl.co.uk"],
  "den.1":["superliga.dk"], "den.2":["divisionsforeningen.dk"],
  "swe.1":["allsvenskan.se"], "swe.2":["superettan.se"],
  "nor.1":["eliteserien.no"], "nor.2":["obos-ligaen.no","fotball.no"],
  "fin.1":["veikkausliiga.com"], "fin.2":["palloliitto.fi"],
  "pol.1":["ekstraklasa.org"], "pol.2":["1liga.org"],
  "cze.1":["chance-liga.cz"], "cze.2":["fotbal.cz"],
  "ser.1":["superliga.rs"], "ser.2":["prvaliga.rs"],
  "ukr.1":["upl.ua"], "ukr.2":["pfl.ua"],
  "rus.1":["premierliga.ru"], "rus.2":["1fnl.ru"],
  "arg.1":["afa.com.ar"], "arg.2":["afa.com.ar"],
  "bra.1":["cbf.com.br"], "bra.2":["cbf.com.br"],
  "mex.1":["ligamx.net"], "mex.2":["ligamx.net"],
  "usa.1":["mlssoccer.com"], "usa.2":["uslchampionship.com"],
  "jpn.1":["jleague.co"], "jpn.2":["jleague.co"],
  "kor.1":["kleague.com"], "kor.2":["kleague.com"],
  "aus.1":["aleagues.com.au"], "chn.1":["thecfa.cn"], "chn.2":["thecfa.cn"],
  "ksa.1":["spl.com.sa"], "ksa.2":["saff.com.sa"],
  "qat.1":["qsl.qa"], "qat.2":["qfa.qa"]
};

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

function normalizeDate(y, m, d) {
  y = Number(y); m = Number(m); d = Number(d);
  if (!y || !m || !d) return null;
  if (y < 2026 || y > 2027 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractDateMentions(text) {
  const raw = stripHtml(text);
  const lower = raw.toLowerCase();
  const mentions = [];
  const add = (date, index) => {
    if (!date) return;
    const context = raw.slice(Math.max(0, index - 160), Math.min(raw.length, index + 220)).replace(/\s+/g, " ").trim();
    mentions.push({ date, context });
  };

  for (const m of lower.matchAll(/\b(2026|2027)[-/\.](0?[1-9]|1[0-2])[-/\.](0?[1-9]|[12]\d|3[01])\b/g)) add(normalizeDate(m[1], m[2], m[3]), m.index || 0);
  for (const m of lower.matchAll(/\b(0?[1-9]|[12]\d|3[01])[-/\.](0?[1-9]|1[0-2])[-/\.](2026|2027)\b/g)) add(normalizeDate(m[3], m[2], m[1]), m.index || 0);

  const monthNames = [...monthMap.keys()].sort((a, b) => b.length - a.length).join("|").replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\|/g, "|");
  const dayMonthYear = new RegExp(`\\b(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?\\s+(${monthNames})\\s+(2026|2027)\\b`, "gi");
  for (const m of lower.matchAll(dayMonthYear)) add(normalizeDate(m[3], monthMap.get(m[2].toLowerCase()), m[1]), m.index || 0);

  const monthDayYear = new RegExp(`\\b(${monthNames})\\s+(0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?,?\\s+(2026|2027)\\b`, "gi");
  for (const m of lower.matchAll(monthDayYear)) add(normalizeDate(m[3], monthMap.get(m[1].toLowerCase()), m[2]), m.index || 0);

  const byDateContext = new Map();
  for (const mention of mentions) {
    const key = `${mention.date} ${mention.context}`;
    byDateContext.set(key, mention);
  }

  return [...byDateContext.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function hasStartContext(context) {
  return /\b(start|starts|begin|begins|opening|kick.?off|fixture|fixtures|calendar|schedule|matchday|round 1|jornada|spieltag|first match|season)\b/i.test(String(context || ""));
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
      dateMentions: extractDateMentions(`${title} ${description} ${link}`),
      parser: "bing_rss_host_mined"
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
        "user-agent": "Mozilla/5.0 FootballTruthHostMinedStartDateEvidence/1.0",
        "accept": "application/rss+xml,text/xml,application/xml,text/plain,*/*"
      }
    });
    const text = await res.text();
    return { status: res.status, itemCount: (text.match(/<item\b/gi) || []).length, results: parseRssItems(text) };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 FootballTruthHostMinedStartDateFetch/1.0",
        "accept": "text/html,application/xhtml+xml,text/plain,*/*"
      }
    });
    const text = (await res.text()).slice(0, maxChars);
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: res.url || url,
      host: hostOf(res.url || url),
      byteCount: Buffer.byteLength(text),
      text: stripHtml(text)
    };
  } finally {
    clearTimeout(timeout);
  }
}

function targetName(target) {
  return target.enrichedCompetitionName || target.competitionName || target.competitionSlug;
}

function nameTokens(target) {
  return targetName(target).toLowerCase().split(/[^a-z0-9]+/i).filter((t) => t.length >= 3 && !["league","football","division"].includes(t));
}

function rowRelevance(target, row) {
  const text = `${row.title || ""} ${row.snippet || ""} ${row.url || ""}`.toLowerCase();
  let score = 0;
  for (const token of nameTokens(target)) if (text.includes(token)) score += 4;
  if (/\bfixtures?|calendar|schedule|matchday|season|opening|first match|kick.?off\b/i.test(text)) score += 6;
  if (/\bofficial\b/i.test(text)) score += 4;
  if (row.dateMentions?.some((m) => hasStartContext(m.context))) score += 12;
  const host = row.resultHost || hostOf(row.url) || "";
  if (badHosts.has(host)) score -= 40;
  return score;
}

function buildHostCandidates(target, previousRows) {
  const scores = new Map();

  function add(host, score, reason) {
    if (!host) return;
    host = String(host).replace(/^www\./, "").toLowerCase();
    if (!host || badHosts.has(host)) return;
    const prev = scores.get(host) || { host, score: 0, reasons: [] };
    prev.score += score;
    prev.reasons.push(reason);
    scores.set(host, prev);
  }

  for (const host of knownOfficialHosts[target.competitionSlug] || []) add(host, 100, "known_official_host");
  if (target.sourceHostHint) add(target.sourceHostHint, 90, "prior_source_host_hint");

  for (const row of previousRows || []) {
    const host = row.resultHost || hostOf(row.url);
    if (!host || badHosts.has(host)) continue;
    const relevance = Number(row.relevanceScore ?? rowRelevance(target, row));
    if (relevance < 5) continue;
    add(host, Math.max(1, relevance), "relevant_prior_search_result");
    if (/\bofficial\b/i.test(`${row.title} ${row.snippet}`)) add(host, 12, "prior_result_says_official");
    if (/\bfixture|calendar|schedule|matchday\b/i.test(`${row.title} ${row.snippet} ${row.url}`)) add(host, 10, "prior_result_fixture_calendar");
  }

  return [...scores.values()].sort((a, b) => b.score - a.score || a.host.localeCompare(b.host)).slice(0, 3);
}

function buildQueries(target, hostCandidates) {
  const name = targetName(target);
  const qs = [];

  for (const cand of hostCandidates) {
    const host = cand.host;
    qs.push(`site:${host} "${name}" "2026/27" fixtures`);
    qs.push(`site:${host} "${name}" "2026-27" calendar`);
    qs.push(`site:${host} "${name}" "opening match"`);
    qs.push(`site:${host} "${name}" "fixture release"`);
    qs.push(`site:${host} "${name}" "first match" "2026"`);
    qs.push(`site:${host} "${name}" "schedule" "2026"`);
  }

  return [...new Set(qs)].slice(0, queriesPerTarget);
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

if (!fs.existsSync(PRIORITY_BATCH_PATH)) throw new Error(`Missing prioritized batch file: ${PRIORITY_BATCH_PATH}`);

const priorityDoc = readJsonSafe(PRIORITY_BATCH_PATH);
const selectedBatches = (priorityDoc.batches || []).slice(batchStartIndex, batchStartIndex + batchCount);
const selectedSlugs = new Set(selectedBatches.flatMap((b) => b.slugs || []));

const enrichedTargets = readJsonl(ENRICHED_TARGETS_PATH);
const baseTargets = enrichedTargets.length
  ? enrichedTargets.filter((t) => selectedSlugs.has(t.competitionSlug))
  : selectedBatches.flatMap((b) => b.targets || []);

const previousRows = readJsonl(ENRICHED_RESULTS_PATH);
const previousRowsBySlug = new Map();
for (const row of previousRows) {
  if (!selectedSlugs.has(row.competitionSlug)) continue;
  if (!previousRowsBySlug.has(row.competitionSlug)) previousRowsBySlug.set(row.competitionSlug, []);
  previousRowsBySlug.get(row.competitionSlug).push(row);
}

const targets = baseTargets.map((target) => {
  const prior = previousRowsBySlug.get(target.competitionSlug) || [];
  const hostCandidates = buildHostCandidates(target, prior);
  return {
    ...target,
    hostCandidates,
    queries: buildQueries(target, hostCandidates)
  };
});

let searchExecutedNowCount = 0;
let fetchExecutedNowCount = 0;
const searchRows = [];
const fetchedRows = [];
const failures = [];

console.log(JSON.stringify({
  status: "starting",
  runner: "host_mined_start_date_evidence_fetch",
  allowSearch,
  allowFetch,
  selectedBatchIds: selectedBatches.map((b) => b.batchId),
  targetCount: targets.length,
  targetWithHostCandidateCount: targets.filter((t) => t.hostCandidates.length).length,
  queriesPerTarget,
  fetchPerTarget,
  concurrency,
  timeoutMs,
  sampleTargets: targets.slice(0, 15).map((t) => ({
    competitionSlug: t.competitionSlug,
    name: targetName(t),
    hostCandidates: t.hostCandidates,
    queries: t.queries
  }))
}, null, 2));

if (allowSearch) {
  await runPool(targets, async (target, index) => {
    for (const query of target.queries || []) {
      try {
        searchExecutedNowCount++;
        const searchedAt = new Date().toISOString();
        const res = await searchBingRss(query);
        for (const result of res.results) {
          const row = {
            competitionSlug: target.competitionSlug,
            competitionName: targetName(target),
            hostCandidates: target.hostCandidates.map((h) => h.host),
            query,
            searchedAt,
            searchStatus: res.status,
            ...result
          };
          row.relevanceScore = rowRelevance(target, row);
          searchRows.push(row);
        }
      } catch (err) {
        failures.push({ phase: "search", competitionSlug: target.competitionSlug, query, error: String(err?.message || err) });
      }
    }

    if ((index + 1) % 20 === 0 || index + 1 === targets.length) {
      console.error(`SEARCH_PROGRESS targets=${index + 1}/${targets.length} searches=${searchExecutedNowCount} rows=${searchRows.length} failures=${failures.length}`);
    }
  }, concurrency);
}

const searchRowsBySlug = new Map();
for (const row of searchRows) {
  if (!searchRowsBySlug.has(row.competitionSlug)) searchRowsBySlug.set(row.competitionSlug, []);
  searchRowsBySlug.get(row.competitionSlug).push(row);
}

const fetchCandidates = [];
for (const target of targets) {
  const hosts = new Set(target.hostCandidates.map((h) => h.host));
  const rows = (searchRowsBySlug.get(target.competitionSlug) || [])
    .filter((row) => hosts.has(row.resultHost) || [...hosts].some((h) => row.resultHost?.endsWith(`.${h}`)))
    .map((row) => ({ ...row, relevanceScore: Number(row.relevanceScore ?? rowRelevance(target, row)) }))
    .filter((row) => row.relevanceScore >= 5)
    .sort((a, b) => b.relevanceScore - a.relevanceScore);

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.url)) continue;
    seen.add(row.url);
    fetchCandidates.push({ target, row });
    if (seen.size >= fetchPerTarget) break;
  }
}

if (allowFetch) {
  await runPool(fetchCandidates, async (item, index) => {
    try {
      fetchExecutedNowCount++;
      const fetchedAt = new Date().toISOString();
      const page = await fetchPage(item.row.url);
      const dateMentions = extractDateMentions(page.text).filter((m) => hasStartContext(m.context));
      fetchedRows.push({
        competitionSlug: item.target.competitionSlug,
        competitionName: targetName(item.target),
        hostCandidates: item.target.hostCandidates.map((h) => h.host),
        sourceSearchUrl: item.row.url,
        sourceSearchTitle: item.row.title,
        fetchedAt,
        url: item.row.url,
        finalUrl: page.finalUrl,
        host: page.host,
        status: page.status,
        ok: page.ok,
        byteCount: page.byteCount,
        relevanceScore: item.row.relevanceScore,
        dateMentions,
        candidateNextSeasonStartDate: dateMentions[0]?.date || null,
        candidateContext: dateMentions[0]?.context || null
      });
    } catch (err) {
      failures.push({ phase: "fetch", competitionSlug: item.target.competitionSlug, url: item.row.url, error: String(err?.message || err) });
    }

    if ((index + 1) % 40 === 0 || index + 1 === fetchCandidates.length) {
      console.error(`FETCH_PROGRESS pages=${index + 1}/${fetchCandidates.length} fetches=${fetchExecutedNowCount} fetchedRows=${fetchedRows.length} failures=${failures.length}`);
    }
  }, concurrency);
}

const fetchedBySlug = new Map();
for (const row of fetchedRows) {
  if (!fetchedBySlug.has(row.competitionSlug)) fetchedBySlug.set(row.competitionSlug, []);
  fetchedBySlug.get(row.competitionSlug).push(row);
}

const classifications = targets.map((target) => {
  const hosts = new Set(target.hostCandidates.map((h) => h.host));
  const sRows = searchRowsBySlug.get(target.competitionSlug) || [];
  const officialSearchRows = sRows.filter((r) => hosts.has(r.resultHost) || [...hosts].some((h) => r.resultHost?.endsWith(`.${h}`)));
  const searchDateRows = officialSearchRows.filter((r) => r.dateMentions?.some((m) => hasStartContext(m.context)));
  const fRows = fetchedBySlug.get(target.competitionSlug) || [];
  const fetchedDateRows = fRows.filter((r) => r.dateMentions?.length);
  const bestFetched = fetchedDateRows.sort((a, b) => String(a.candidateNextSeasonStartDate).localeCompare(String(b.candidateNextSeasonStartDate)))[0] || null;
  const bestSearch = searchDateRows[0] || null;

  return {
    competitionSlug: target.competitionSlug,
    competitionName: targetName(target),
    hostCandidateCount: target.hostCandidates.length,
    hostCandidates: target.hostCandidates,
    queryCount: target.queries.length,
    officialHostSearchResultCount: officialSearchRows.length,
    officialHostSearchDateCandidateCount: searchDateRows.length,
    fetchCandidateCount: fetchCandidates.filter((x) => x.target.competitionSlug === target.competitionSlug).length,
    fetchedPageCount: fRows.length,
    fetchedDateCandidateCount: fetchedDateRows.length,
    evidenceStatus: bestFetched ? "official_or_mined_host_fetched_date_candidate" :
      bestSearch ? "official_or_mined_host_search_snippet_date_candidate" :
      officialSearchRows.length ? "official_or_mined_host_result_no_date" :
      target.hostCandidates.length ? "host_candidate_no_search_result" :
      "no_host_candidate",
    candidateNextSeasonStartDate: bestFetched?.candidateNextSeasonStartDate || bestSearch?.dateMentions?.[0]?.date || null,
    candidateUrl: bestFetched?.finalUrl || bestSearch?.url || null,
    candidateHost: bestFetched?.host || bestSearch?.resultHost || null,
    candidateTitle: bestFetched?.sourceSearchTitle || bestSearch?.title || null,
    candidateContext: bestFetched?.candidateContext || bestSearch?.dateMentions?.[0]?.context || null
  };
});

const summary = {
  status: "passed",
  runner: "host_mined_start_date_evidence_fetch",
  selectedBatchIds: selectedBatches.map((b) => b.batchId),
  batchStartIndex,
  batchCount,
  targetCount: targets.length,
  targetWithHostCandidateCount: targets.filter((t) => t.hostCandidates.length).length,
  allowSearch,
  allowFetch,
  searchExecutedNowCount,
  fetchExecutedNowCount,
  browserRenderExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  searchResultRowCount: searchRows.length,
  officialHostSearchResultRowCount: classifications.reduce((n, c) => n + c.officialHostSearchResultCount, 0),
  fetchCandidateCount: fetchCandidates.length,
  fetchedPageRowCount: fetchedRows.length,
  failureCount: failures.length,
  targetWithOfficialHostSearchResultCount: classifications.filter((c) => c.officialHostSearchResultCount > 0).length,
  targetWithFetchedDateCandidateCount: classifications.filter((c) => c.fetchedDateCandidateCount > 0).length,
  targetWithAnyOfficialOrMinedHostDateCandidateCount: classifications.filter((c) => c.candidateNextSeasonStartDate).length,
  dateCandidateSlugs: classifications.filter((c) => c.candidateNextSeasonStartDate).map((c) => c.competitionSlug),
  recommendedNextLane: classifications.some((c) => c.candidateNextSeasonStartDate)
    ? "manual_review_then_backfill_nextSeasonStartDate_for_official_or_mined_host_date_candidates"
    : "inspect_fetched_official_pages_and_add_source_specific_start_date_extractors"
};

const reportPath = path.join(OUT_DIR, `host-mined-start-date-evidence-fetch-report-${DATE}.json`);
const targetsPath = path.join(OUT_DIR, `host-mined-start-date-evidence-targets-${DATE}.jsonl`);
const searchRowsPath = path.join(OUT_DIR, `host-mined-start-date-evidence-search-results-${DATE}.jsonl`);
const fetchRowsPath = path.join(OUT_DIR, `host-mined-start-date-evidence-fetched-pages-${DATE}.jsonl`);
const classificationsPath = path.join(OUT_DIR, `host-mined-start-date-evidence-classifications-${DATE}.jsonl`);
const failuresPath = path.join(OUT_DIR, `host-mined-start-date-evidence-failures-${DATE}.jsonl`);

fs.writeFileSync(reportPath, JSON.stringify({ summary, classifications }, null, 2) + "\n", "utf8");
fs.writeFileSync(targetsPath, targets.map((r) => JSON.stringify(r)).join("\n") + (targets.length ? "\n" : ""), "utf8");
fs.writeFileSync(searchRowsPath, searchRows.map((r) => JSON.stringify(r)).join("\n") + (searchRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(fetchRowsPath, fetchedRows.map((r) => JSON.stringify(r)).join("\n") + (fetchedRows.length ? "\n" : ""), "utf8");
fs.writeFileSync(classificationsPath, classifications.map((r) => JSON.stringify(r)).join("\n") + (classifications.length ? "\n" : ""), "utf8");
fs.writeFileSync(failuresPath, failures.map((r) => JSON.stringify(r)).join("\n") + (failures.length ? "\n" : ""), "utf8");

console.log(JSON.stringify({
  output: rel(reportPath),
  targetsOutput: rel(targetsPath),
  searchResultsOutput: rel(searchRowsPath),
  fetchedPagesOutput: rel(fetchRowsPath),
  classificationsOutput: rel(classificationsPath),
  failuresOutput: rel(failuresPath),
  summary
}, null, 2));
