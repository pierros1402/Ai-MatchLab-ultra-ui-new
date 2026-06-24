import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const allowFetch = argv.includes("--allow-fetch");
const maxPages = Number(argv.find(arg => arg.startsWith("--max-pages="))?.split("=")[1] || "120");

if (!allowFetch) {
  throw new Error("Refusing official-host asset/API mining without --allow-fetch");
}

const probeRowsPath = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `direct-official-host-previous-completed-route-probe-${today}`,
  `direct-official-host-previous-completed-route-probe-rows-${today}.jsonl`
);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `official-host-asset-api-route-miner-${today}`
);

const outputPath = path.join(outputDir, `official-host-asset-api-route-miner-${today}.json`);
const rowsOutputPath = path.join(outputDir, `official-host-asset-api-route-miner-rows-${today}.jsonl`);

const routeKeywords = [
  "standing", "standings", "table", "tables", "tabelle", "tabell", "tabela",
  "tabla", "classement", "classificacao", "classificação", "ranking", "rankings",
  "ladder", "competition", "competitions", "league-table", "estatistica",
  "estadistica", "estadisticahistorica", "fixtures", "results"
];

const apiKeywords = [
  "api", "graphql", "json", "rest", "ajax", "dapi", "wp-json", "next-data",
  "__next_data__", "nuxt", "payload", "standings", "rankings", "tables"
];

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function decodeHtml(s) {
  return String(s || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function safeUrl(value, base) {
  try {
    return new URL(decodeHtml(value), base).href;
  } catch {
    return "";
  }
}

function hostOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function pathText(value) {
  try {
    const u = new URL(value);
    return `${u.pathname} ${u.search}`.toLowerCase();
  } catch {
    return String(value || "").toLowerCase();
  }
}

function containsAny(text, terms) {
  const lower = String(text || "").toLowerCase();
  return terms.some(term => lower.includes(term.toLowerCase()));
}

function extractCandidateUrls(html, baseUrl) {
  const candidates = new Set();

  const attrRegex = /\b(?:href|src|action)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(attrRegex)) {
    const u = safeUrl(match[1], baseUrl);
    if (u) candidates.add(u);
  }

  const quotedUrlRegex = /["']((?:https?:\/\/|\/)[^"']{3,220})["']/gi;
  for (const match of html.matchAll(quotedUrlRegex)) {
    const u = safeUrl(match[1], baseUrl);
    if (u) candidates.add(u);
  }

  const escapedUrlRegex = /https?:\\\/\\\/[^"'\\\s]{6,240}/gi;
  for (const match of html.matchAll(escapedUrlRegex)) {
    const u = match[0].replaceAll("\\/", "/");
    if (u) candidates.add(u);
  }

  return [...candidates];
}

function classifyCandidate({ slug, sourceUrl, candidateUrl, sourceHost }) {
  const candidateHost = hostOf(candidateUrl);
  const text = pathText(candidateUrl);
  const sameHost = candidateHost === sourceHost || candidateHost.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${candidateHost}`);
  const routeHit = containsAny(text, routeKeywords);
  const apiHit = containsAny(text, apiKeywords);
  const jsAsset = /\.js(?:\?|$)/i.test(candidateUrl);
  const jsonAsset = /\.json(?:\?|$)/i.test(candidateUrl);
  const likelyStaticNoise = /\.(png|jpg|jpeg|svg|webp|gif|css|woff2?|ttf|ico)(?:\?|$)/i.test(candidateUrl);
  const socialNoise = ["facebook.com", "twitter.com", "x.com", "instagram.com", "youtube.com", "linkedin.com", "tiktok.com"].some(h => candidateHost.endsWith(h));

  let score = 0;
  const signals = [];

  if (sameHost) { score += 25; signals.push("same_official_host_family"); }
  if (routeHit) { score += 35; signals.push("route_keyword"); }
  if (apiHit) { score += 30; signals.push("api_keyword"); }
  if (jsAsset) { score += 12; signals.push("javascript_asset"); }
  if (jsonAsset) { score += 25; signals.push("json_asset"); }
  if (candidateUrl.includes("2025")) { score += 12; signals.push("season_2025_in_url"); }
  if (likelyStaticNoise) { score -= 45; signals.push("static_media_or_font_noise"); }
  if (socialNoise) { score -= 35; signals.push("social_external_noise"); }
  if (!sameHost) score -= 20;

  const candidateType = jsonAsset || apiHit
    ? "api_or_json_candidate"
    : jsAsset
      ? "script_asset_candidate"
      : "route_candidate";

  return {
    slug,
    sourceUrl,
    candidateUrl,
    candidateHost,
    candidateType,
    score,
    signals,
    sameHost,
    routeHit,
    apiHit,
    reviewOnly: true,
    acceptanceAllowedNow: false
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 AI-MatchLab-FootballTruth/1.0" }
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, finalUrl: res.url, body };
  } catch (error) {
    return { ok: false, status: 0, finalUrl: url, body: "", error: `${error.name || "Error"}: ${error.message || String(error)}` };
  } finally {
    clearTimeout(timeout);
  }
}

await fs.mkdir(outputDir, { recursive: true });

const probeRows = parseJsonl(await fs.readFile(probeRowsPath, "utf8"));

const pageMap = new Map();
for (const row of probeRows) {
  if (!(row.status >= 200 && row.status < 300)) continue;
  const url = row.finalUrl || row.url;
  const key = `${row.slug}|${url}`;
  if (!pageMap.has(key)) {
    pageMap.set(key, {
      slug: row.slug,
      league: row.league,
      url,
      host: row.host,
      sourceCandidateScore: row.candidateScore,
      tableTagCount: row.tableTagCount,
      rowTagCount: row.rowTagCount
    });
  }
}

const pages = [...pageMap.values()]
  .sort((a, b) => b.sourceCandidateScore - a.sourceCandidateScore || a.slug.localeCompare(b.slug))
  .slice(0, maxPages);

const candidateRows = [];
const seenCandidates = new Set();
let fetchExecutedNowCount = 0;
let fetched2xxCount = 0;
let fetchFailedCount = 0;

for (let i = 0; i < pages.length; i += 1) {
  const page = pages[i];
  console.log(`FETCH_PAGE ${i + 1}/${pages.length} ${page.slug} ${page.url}`);

  const fetched = await fetchText(page.url);
  fetchExecutedNowCount += 1;
  if (fetched.ok) fetched2xxCount += 1;
  else fetchFailedCount += 1;

  if (!fetched.ok) {
    candidateRows.push({
      slug: page.slug,
      sourceUrl: page.url,
      sourceStatus: fetched.status,
      sourceFetchOk: false,
      error: fetched.error || null,
      candidateUrl: "",
      candidateType: "source_fetch_failed",
      score: 0,
      signals: [],
      reviewOnly: true,
      acceptanceAllowedNow: false
    });
    continue;
  }

  const sourceHost = hostOf(fetched.finalUrl || page.url);
  const urls = extractCandidateUrls(fetched.body, fetched.finalUrl || page.url);

  for (const candidateUrl of urls) {
    const classified = classifyCandidate({
      slug: page.slug,
      sourceUrl: fetched.finalUrl || page.url,
      candidateUrl,
      sourceHost
    });

    if (classified.score < 30) continue;

    const key = `${classified.slug}|${classified.candidateUrl}`;
    if (seenCandidates.has(key)) continue;
    seenCandidates.add(key);

    candidateRows.push({
      sourceLeague: page.league,
      sourceStatus: fetched.status,
      sourceFetchOk: true,
      sourceTitleHint: String(fetched.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200),
      ...classified
    });
  }

  await new Promise(resolve => setTimeout(resolve, 120));
}

candidateRows.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug) || a.candidateUrl.localeCompare(b.candidateUrl));

const actionableRows = candidateRows.filter(row =>
  row.score >= 55 &&
  row.acceptanceAllowedNow === false &&
  (row.candidateType === "api_or_json_candidate" || row.candidateType === "script_asset_candidate" || row.routeHit)
);

const bySlug = {};
for (const slug of [...new Set(candidateRows.map(row => row.slug).filter(Boolean))]) {
  const rows = candidateRows.filter(row => row.slug === slug);
  bySlug[slug] = {
    candidateCount: rows.length,
    actionableCandidateCount: rows.filter(row => row.score >= 55).length,
    apiOrJsonCandidateCount: rows.filter(row => row.candidateType === "api_or_json_candidate").length,
    scriptAssetCandidateCount: rows.filter(row => row.candidateType === "script_asset_candidate").length,
    routeCandidateCount: rows.filter(row => row.candidateType === "route_candidate").length,
    topCandidates: rows.slice(0, 10).map(row => ({
      candidateType: row.candidateType,
      candidateUrl: row.candidateUrl,
      score: row.score,
      signals: row.signals
    }))
  };
}

const selectedNextTargets = [];
const selectedKey = new Set();
for (const row of actionableRows) {
  if (selectedNextTargets.length >= 30) break;
  const key = `${row.slug}|${row.candidateType}`;
  if (selectedKey.has(key) && row.candidateType !== "api_or_json_candidate") continue;
  selectedKey.add(key);
  selectedNextTargets.push({
    slug: row.slug,
    candidateType: row.candidateType,
    candidateUrl: row.candidateUrl,
    score: row.score,
    signals: row.signals
  });
}

const report = {
  status: "passed",
  runner: "official_host_asset_api_route_miner",
  contractVersion: 1,
  purpose: "Mine official-host HTML pages for route/API/script candidates after direct official-host probe. No raw payloads written and no acceptance performed.",
  inputProbeRowsPath: path.relative(root, probeRowsPath).replaceAll("\\", "/"),
  inputProbeRowsSha256: await sha256(probeRowsPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    allowFetch,
    searchExecutedNowCount: 0,
    fetchExecutedNowCount,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    sourcePageCount: pages.length,
    fetched2xxCount,
    fetchFailedCount,
    minedCandidateRowCount: candidateRows.length,
    actionableCandidateCount: actionableRows.length,
    actionableSlugCount: new Set(actionableRows.map(row => row.slug)).size,
    apiOrJsonCandidateCount: candidateRows.filter(row => row.candidateType === "api_or_json_candidate").length,
    scriptAssetCandidateCount: candidateRows.filter(row => row.candidateType === "script_asset_candidate").length,
    routeCandidateCount: candidateRows.filter(row => row.candidateType === "route_candidate").length,
    acceptedNowCount: 0,
    selectedNextTargets
  },
  recommendation: {
    nextLane: "Use selectedNextTargets to build a bounded endpoint/script inspection job, then extractor/render proof only where endpoint data or rendered table rows validate exact previous_completed standings.",
    selectedNextTargets
  },
  bySlug
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, candidateRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  recommendation: report.recommendation
}, null, 2));
