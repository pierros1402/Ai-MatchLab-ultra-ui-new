import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowSearch = process.argv.includes("--allow-search");
const allowFetch = process.argv.includes("--allow-fetch");

const rollupPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-rollup-${today}`, `football-truth-global-macro-official-host-wave-rollup-${today}.json`);
const rollupRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-rollup-${today}`, `football-truth-global-macro-official-host-wave-rollup-rows-${today}.jsonl`);
const planRowsPath = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-global-macro-official-host-wave-plan-${today}`, `football-truth-global-macro-official-host-wave-plan-rows-${today}.jsonl`);

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `football-truth-bulk-official-route-discovery-160-${today}`);
const outPath = path.join(outDir, `football-truth-bulk-official-route-discovery-160-${today}.json`);
const rowsPath = path.join(outDir, `football-truth-bulk-official-route-discovery-160-rows-${today}.jsonl`);
const fetchPlanPath = path.join(outDir, `football-truth-bulk-official-route-discovery-160-fetch-plan-${today}.jsonl`);

function rel(file) { return path.relative(root, file).replaceAll("\\", "/"); }
function parseJsonl(text) { return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function shaText(text) { return crypto.createHash("sha256").update(String(text || "")).digest("hex"); }
function stripHtml(value) { return String(value || "").replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10))).replace(/\s+/g, " ").trim(); }
function norm(value) { return stripHtml(value).toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim(); }
function hostOf(url) { try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; } }
function uniq(values) { return [...new Set((values || []).filter(Boolean))]; }
function sorted(values) { return uniq(values).sort((a,b) => a.localeCompare(b)); }

const contaminantHosts = [
  "wikipedia.org","wikidata.org","facebook.com","instagram.com","twitter.com","x.com","youtube.com","linkedin.com",
  "flashscore.com","sofascore.com","livescore.com","aiscore.com","fotmob.com","soccerway.com","transfermarkt.com",
  "worldfootball.net","fbref.com","globalsportsarchive.com","besoccer.com","footystats.org","oddspedia.com",
  "365scores.com","espn.com","eurosport.com","skysports.com","bbc.com","goal.com","theguardian.com","google.com","bing.com"
];

const highValuePrefixes = new Set([
  "aut","bel","bul","cro","cze","den","eng","fin","fra","ger","gre","hun","irl","isr","ita","ned","nor","pol","por","rou","sco","srb","sui","swe","tur","ukr","wal",
  "arg","bra","chi","col","ecu","mex","par","per","uru","usa","ven",
  "aus","chn","jpn","kor","ksa","qat","uae","tha","vie","idn","ind",
  "mar","egy","rsa","tun","alg","nga","gha"
]);

const suppressPrefixes = new Set([
  "aaa","abc","aia","aru","asa","bad","bah","bdi","ben","ber","bfa","bhu","blz","brb","bru","cam","cay","cgo","cha","civ","cmr","cod","cok","com","cpv","cta","cub","cuw","dji","dma","dom","eqg","eri","esx","fij","gab","gam","gib","gnb","grn","gui","gum","guy","hai","kit","klo","lbr","lca","les","lie","mad","mdv","mli","mng","mri","msr","mtn","mwi","nca","ncl","nep","nig","nir","png","prk","pur","rwa","sam","sey","skn","sle","smr","sol","som","sri","ssd","stp","sud","sur","swz","syr","tah","tan","tca","tga","tls","tog","tpe","tri","van","vgb","vin","vir","www","yem","zam","zim"
]);

function slugPrefix(slug) { return String(slug || "").split(".")[0]; }

function candidateTier(row) {
  const prefix = slugPrefix(row.slug);
  if (highValuePrefixes.has(prefix)) return 3;
  if (suppressPrefixes.has(prefix)) return 0;
  if (String(row.slug).match(/\.[12]$/)) return 1;
  return 0;
}

function queryTerms(row) {
  const display = row.displayName || row.slug;
  const slug = row.slug;
  const prefix = slugPrefix(slug);
  const level = slug.endsWith(".2") ? "second division" : slug.endsWith(".3") ? "third division" : "premier league";
  return [
    `"${display}" official standings`,
    `"${display}" official table`,
    `${display} ${level} official standings football`,
    `${display} football federation standings`
  ];
}

function parseRssItems(xml) {
  const items = [];
  const itemRx = /<item\b[\s\S]*?<\/item>/gi;
  let im;
  while ((im = itemRx.exec(xml)) !== null) {
    const item = im[0];
    const title = stripHtml((item.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const link = stripHtml((item.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const description = stripHtml((item.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || "");
    if (link) items.push({ title, link, description });
  }
  return items;
}

function isContaminantHost(host) {
  return contaminantHosts.some(bad => host === bad || host.endsWith(`.${bad}`));
}

function scoreResult({ row, query, item }) {
  const host = hostOf(item.link);
  const hay = norm(`${item.title} ${item.description} ${item.link}`);
  const display = norm(row.displayName || "");
  const slug = row.slug;
  const prefix = slugPrefix(slug);

  let score = 0;
  if (!host || isContaminantHost(host)) score -= 500;
  if (/(federation|association|league|liga|ligue|bund|futbol|football|voetbal|soccer|fa|fpf|figc|dfb|rfef|knvb|spfl|efl|faw|fai|uefa|competitions|standings|table|tabelle|classement|clasificacion)/i.test(hay)) score += 55;
  if (/standings|table|league table|ladder|tabelle|classement|clasificacion|classifica|posiciones/i.test(hay)) score += 45;
  if (/official|federation|association|league/i.test(hay)) score += 35;
  if (display && hay.includes(display.slice(0, Math.min(18, display.length)))) score += 30;
  if (new RegExp(`\\b${prefix}\\b`, "i").test(host)) score += 12;
  if (host.endsWith(".org") || host.endsWith(".com") || host.endsWith(".net")) score += 5;
  if (/news|article|ticket|shop|video|youtube|facebook|instagram/i.test(item.link)) score -= 40;
  if (/women|youth|u19|u21|cup/i.test(hay) && !/women|cup/i.test(display)) score -= 20;

  return score;
}

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +bulk-official-route-discovery)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.8,*/*;q=0.7",
        "accept-language": "en-US,en;q=0.9"
      }
    });
    const text = await response.text();
    clearTimeout(timer);
    return { response, text, error: null, timedOut: false };
  } catch (error) {
    clearTimeout(timer);
    return { response: null, text: "", error: String(error?.name || error?.message || error), timedOut: String(error?.name || "") === "AbortError" };
  }
}

function routeProbeUrls(url) {
  let base;
  try { base = new URL(url); } catch { return []; }
  const origin = `${base.protocol}//${base.host}`;
  const pathBase = base.pathname.endsWith("/") ? base.pathname.slice(0, -1) : base.pathname;
  return uniq([
    url,
    `${origin}/standings`,
    `${origin}/standings/`,
    `${origin}/table`,
    `${origin}/tables`,
    `${origin}/league-table`,
    `${origin}/competitions`,
    `${origin}/fixtures`,
    `${origin}${pathBase}/standings`,
    `${origin}${pathBase}/table`
  ]).slice(0, 8);
}

await fs.mkdir(outDir, { recursive: true });

const blocks = [];
if (!allowSearch) blocks.push("missing_allow_search");
if (!allowFetch) blocks.push("missing_allow_fetch");

const rollup = JSON.parse(await fs.readFile(rollupPath, "utf8"));
const rollupRows = parseJsonl(await fs.readFile(rollupRowsPath, "utf8"));
const planRows = parseJsonl(await fs.readFile(planRowsPath, "utf8"));

if (rollup.status !== "passed") blocks.push("rollup_not_passed");

const planBySlug = new Map(planRows.map(row => [row.slug, row]));
const missingSlugs = rollupRows.filter(row => row.rollupLane === "suppressed_missing_official_host_allowlist_long_tail").map(row => row.slug);
const targets = missingSlugs
  .map(slug => planBySlug.get(slug) || rollupRows.find(row => row.slug === slug) || { slug, displayName: slug })
  .map(row => ({ ...row, tier: candidateTier(row) }))
  .filter(row => row.tier > 0)
  .sort((a,b) => b.tier - a.tier || a.slug.localeCompare(b.slug))
  .slice(0, 160);

const rows = [];
const fetchPlanRows = [];
let searchRequestCount = 0;
let routeProbeFetchCount = 0;

if (blocks.length === 0) {
  let targetIndex = 0;
  for (const row of targets) {
    targetIndex += 1;
    console.log(`[${targetIndex}/${targets.length}] ${row.slug} tier=${row.tier}`);

    const queries = queryTerms(row);
    const resultItems = [];

    for (const q of queries) {
      const rssUrl = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(q)}`;
      const fetched = await fetchWithTimeout(rssUrl, 12000);
      searchRequestCount += 1;
      const items = fetched.text ? parseRssItems(fetched.text) : [];
      for (const item of items.slice(0, 10)) {
        const score = scoreResult({ row, query: q, item });
        resultItems.push({
          query: q,
          title: item.title,
          link: item.link,
          host: hostOf(item.link),
          description: item.description.slice(0, 250),
          score
        });
      }
    }

    const scored = resultItems
      .filter(item => item.host && !isContaminantHost(item.host))
      .sort((a,b) => b.score - a.score);

    const bestByHost = [];
    const seenHosts = new Set();
    for (const item of scored) {
      if (seenHosts.has(item.host)) continue;
      seenHosts.add(item.host);
      bestByHost.push(item);
      if (bestByHost.length >= 5) break;
    }

    const routeProbeRows = [];
    for (const item of bestByHost.slice(0, 3)) {
      for (const probeUrl of routeProbeUrls(item.link).slice(0, 4)) {
        const fetched = await fetchWithTimeout(probeUrl, 9000);
        routeProbeFetchCount += 1;
        const text = fetched.text || "";
        const title = stripHtml((text.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
        const standingHints = (text.match(/standings|table|league table|ladder|points|played|wins|draws|losses|tabelle|classement|clasificacion|classifica/gi) || []).length;
        const tableCount = (text.match(/<table\b/gi) || []).length;
        const trCount = (text.match(/<tr\b/gi) || []).length;
        const status = fetched.response?.status ?? null;

        let probeScore = item.score;
        if ((status ?? 0) >= 200 && (status ?? 0) < 400) probeScore += 30;
        probeScore += Math.min(standingHints, 40) * 4;
        if (tableCount > 0 && trCount >= 8) probeScore += 100;
        if (/standings|table|league-table|tables|ladder/i.test(probeUrl)) probeScore += 50;

        routeProbeRows.push({
          sourceSearchLink: item.link,
          url: probeUrl,
          finalUrl: fetched.response?.url || probeUrl,
          host: hostOf(fetched.response?.url || probeUrl),
          fetchStatus: status,
          title,
          bodyLength: text.length,
          bodySha256: text ? shaText(text) : null,
          standingHints,
          tableCount,
          trCount,
          probeScore,
          fetchError: fetched.error,
          timedOut: fetched.timedOut
        });
      }
    }

    const bestProbe = routeProbeRows.sort((a,b) => b.probeScore - a.probeScore || b.bodyLength - a.bodyLength)[0] || null;

    let discoveryLane = "bulk_route_discovery_no_viable_candidate";
    if (bestProbe && bestProbe.probeScore >= 220 && bestProbe.tableCount > 0 && bestProbe.trCount >= 8) discoveryLane = "bulk_route_discovery_html_table_candidate";
    else if (bestProbe && bestProbe.probeScore >= 180) discoveryLane = "bulk_route_discovery_rendered_or_api_candidate";
    else if (bestByHost.length > 0) discoveryLane = "bulk_route_discovery_host_candidate_needs_review";

    const outRow = {
      slug: row.slug,
      displayName: row.displayName || row.slug,
      tier: row.tier,
      queryCount: queries.length,
      rssResultCount: resultItems.length,
      nonContaminantHostCandidateCount: bestByHost.length,
      routeProbeFetchCount: routeProbeRows.length,
      discoveryLane,
      bestSearchCandidates: bestByHost,
      bestProbe: bestProbe ? {
        url: bestProbe.url,
        finalUrl: bestProbe.finalUrl,
        host: bestProbe.host,
        fetchStatus: bestProbe.fetchStatus,
        title: bestProbe.title,
        bodyLength: bestProbe.bodyLength,
        bodySha256: bestProbe.bodySha256,
        standingHints: bestProbe.standingHints,
        tableCount: bestProbe.tableCount,
        trCount: bestProbe.trCount,
        probeScore: bestProbe.probeScore
      } : null,
      acceptedNow: false,
      reviewOnlyCandidateWriteExecutedNow: false,
      canonicalCandidateWriteExecutedNow: false,
      lifecycleWriteExecutedNow: false,
      productionWriteExecutedNow: false,
      truthAssertionExecutedNow: false,
      rawPayloadCommitted: false,
      fullRawPayloadWritten: false
    };

    rows.push(outRow);

    if (["bulk_route_discovery_html_table_candidate","bulk_route_discovery_rendered_or_api_candidate"].includes(discoveryLane)) {
      fetchPlanRows.push({
        slug: row.slug,
        displayName: row.displayName || row.slug,
        discoveryLane,
        plannedUrls: routeProbeUrls(bestProbe.finalUrl || bestProbe.url).slice(0, 8),
        host: bestProbe.host,
        source: "bulk_official_route_discovery_160"
      });
    }
  }
}

const discoveryLaneCounts = rows.reduce((acc, row) => {
  acc[row.discoveryLane] = (acc[row.discoveryLane] || 0) + 1;
  return acc;
}, {});

const report = {
  status: blocks.length ? "failed" : "passed",
  runner: "football_truth_bulk_official_route_discovery_160",
  contractVersion: 1,
  generatedAt: new Date().toISOString(),
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  fetchPlanOutput: rel(fetchPlanPath),
  inputs: {
    rollupPath: rel(rollupPath),
    rollupRowsPath: rel(rollupRowsPath),
    planRowsPath: rel(planRowsPath)
  },
  guardrails: {
    rssSearchRequestExecutedNowCount: searchRequestCount,
    routeProbeFetchExecutedNowCount: routeProbeFetchCount,
    reviewOnlyCandidateWriteExecutedNowCount: 0,
    canonicalCandidateWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    suppressedMissingAllowlistInputCount: missingSlugs.length,
    selectedBulkTargetCount: targets.length,
    rssSearchRequestCount: searchRequestCount,
    routeProbeFetchCount,
    discoveryLaneCounts,
    fetchPlanTargetCount: fetchPlanRows.length,
    htmlTableCandidateSlugs: rows.filter(row => row.discoveryLane === "bulk_route_discovery_html_table_candidate").map(row => row.slug),
    renderedOrApiCandidateSlugs: rows.filter(row => row.discoveryLane === "bulk_route_discovery_rendered_or_api_candidate").map(row => row.slug),
    hostCandidateNeedsReviewSlugs: rows.filter(row => row.discoveryLane === "bulk_route_discovery_host_candidate_needs_review").map(row => row.slug),
    noViableCandidateSlugs: rows.filter(row => row.discoveryLane === "bulk_route_discovery_no_viable_candidate").map(row => row.slug),
    acceptedNowCount: 0,
    nextRecommendedLane: "run one fetch/extraction wave over fetchPlanOutput; do not hand-pick single leagues"
  },
  rows,
  fetchPlanRows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");
await fs.writeFile(fetchPlanPath, fetchPlanRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  fetchPlanOutput: report.fetchPlanOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  sampleFetchPlanRows: fetchPlanRows.slice(0, 12),
  blocks: report.blocks
}, null, 2));

if (blocks.length) process.exitCode = 1;

