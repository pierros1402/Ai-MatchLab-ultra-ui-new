import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const argv = process.argv.slice(2);
const allowSearch = argv.includes("--allow-search");
const batchIndexArg = argv.find(arg => arg.startsWith("--batch-index="));
const batchIndex = Number(batchIndexArg?.split("=")[1] || "1");

if (!Number.isInteger(batchIndex) || batchIndex < 1) {
  throw new Error(`Invalid --batch-index value: ${batchIndexArg || "(missing)"}`);
}

if (!allowSearch) {
  throw new Error("Refusing RSS/search execution without --allow-search");
}

const routeMeta = new Map(Object.entries({
  "arg.1": {
    leagueTerms: ["liga profesional argentina", "primera división argentina", "argentina primera"],
    countryTerms: ["argentina"],
    officialHosts: ["afa.com.ar", "ligaprofesional.ar"]
  },
  "aus.1": {
    leagueTerms: ["a-league men", "aleague men", "isuzu ute a-league"],
    countryTerms: ["australia", "australian"],
    officialHosts: ["aleagues.com.au", "footballaustralia.com.au"]
  },
  "aut.1": {
    leagueTerms: ["bundesliga austria", "austrian bundesliga", "admiral bundesliga"],
    countryTerms: ["austria", "austrian", "österreich"],
    officialHosts: ["bundesliga.at"]
  },
  "bel.1": {
    leagueTerms: ["jupiler pro league", "belgian pro league", "pro league belgium"],
    countryTerms: ["belgium", "belgian", "belgië", "belgique"],
    officialHosts: ["proleague.be"]
  },
  "bra.1": {
    leagueTerms: ["brasileirão série a", "brasileirao serie a", "campeonato brasileiro série a", "brasileiro serie a"],
    countryTerms: ["brazil", "brasil", "brazilian"],
    officialHosts: ["cbf.com.br"]
  },
  "fra.1": {
    leagueTerms: ["ligue 1", "ligue 1 mcdonald", "championnat de france"],
    countryTerms: ["france", "french", "français"],
    officialHosts: ["ligue1.fr", "lfp.fr"]
  }
}));

const knownJunkHosts = new Set([
  "olx.com.pk",
  "daraz.pk",
  "w3schools.com",
  "roblox.com",
  "habitt.com",
  "alfatah.pk",
  "apnafurniture.pk",
  "indoor.pk",
  "support.google.com",
  "visit-nottinghamshire.co.uk"
]);

const thirdPartyScoreHosts = [
  "flashscore.",
  "soccerway.",
  "worldfootball.",
  "transfermarkt.",
  "aiscore.",
  "sofascore.",
  "livesport.",
  "scores24.",
  "besoccer.",
  "oddspedia.",
  "365scores."
];

const footballContextTerms = [
  "football", "soccer", "league", "liga", "ligue", "bundesliga", "pro league",
  "campeonato", "serie a", "série a", "standings", "table", "classement",
  "tabelle", "clasificación", "classifica", "ladder", "competition"
];

const planDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-batches-${today}`
);

const planPath = path.join(
  planDir,
  `high-yield-previous-completed-official-route-search-batches-${today}.json`
);

const planRowsPath = path.join(
  planDir,
  `high-yield-previous-completed-official-route-search-batch-rows-${today}.jsonl`
);

const outputDir = path.join(
  root,
  "data",
  "football-truth",
  "_diagnostics",
  `high-yield-previous-completed-official-route-search-results-${today}`
);

const outputPath = path.join(
  outputDir,
  `high-yield-previous-completed-official-route-search-results-batch-${String(batchIndex).padStart(2, "0")}-${today}.json`
);

const rowsOutputPath = path.join(
  outputDir,
  `high-yield-previous-completed-official-route-search-result-rows-batch-${String(batchIndex).padStart(2, "0")}-${today}.jsonl`
);

function parseJsonl(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

async function sha256(file) {
  return crypto.createHash("sha256").update(await fs.readFile(file)).digest("hex");
}

function decodeXml(text) {
  return String(text || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function stripTags(text) {
  return decodeXml(String(text || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function firstTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function parseRssItems(xml) {
  const itemBlocks = [...String(xml || "").matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
  return itemBlocks.slice(0, 10).map((block, index) => {
    const title = stripTags(firstTag(block, "title"));
    const link = stripTags(firstTag(block, "link"));
    const description = stripTags(firstTag(block, "description"));
    const pubDate = stripTags(firstTag(block, "pubDate"));
    let host = "";
    try {
      host = new URL(link).hostname.replace(/^www\./, "");
    } catch {}
    return {
      resultRank: index + 1,
      title,
      link,
      host,
      description,
      pubDate
    };
  }).filter(item => item.title || item.link || item.description);
}

function parseSiteHost(query) {
  const match = String(query || "").match(/site:([^\s"]+)/i);
  return match ? match[1].replace(/^www\./, "").toLowerCase() : "";
}

function hostMatches(host, expectedHost) {
  if (!host || !expectedHost) return false;
  const normalizedHost = host.replace(/^www\./, "").toLowerCase();
  const normalizedExpected = expectedHost.replace(/^www\./, "").toLowerCase();
  return normalizedHost === normalizedExpected || normalizedHost.endsWith(`.${normalizedExpected}`);
}

function containsAny(text, terms) {
  return terms.some(term => text.includes(term.toLowerCase()));
}

function classifyResult(item, queryRow) {
  const title = String(item.title || "");
  const link = String(item.link || "");
  const description = String(item.description || "");
  const text = `${title} ${link} ${description}`.toLowerCase();
  const meta = routeMeta.get(queryRow.slug) || { leagueTerms: [], countryTerms: [], officialHosts: [] };
  const siteHost = parseSiteHost(queryRow.query);

  const positiveSignals = [];
  const negativeSignals = [];
  const reviewFlags = [];

  const siteHostMatch = hostMatches(item.host, siteHost);
  const officialHostMatch = meta.officialHosts.some(host => hostMatches(item.host, host));
  const leagueTermMatch = containsAny(text, meta.leagueTerms);
  const countryTermMatch = containsAny(text, meta.countryTerms);
  const season2025Match = /2025[-/ ]?(26|2026)?/.test(text) || text.includes("2025/2026");
  const standingsTermMatch = containsAny(text, ["standings", "table", "classement", "tabelle", "clasificación", "classifica", "ladder"]);
  const footballContextMatch = containsAny(text, footballContextTerms);
  const thirdPartyScoreHost = thirdPartyScoreHosts.some(hostPart => item.host.includes(hostPart));

  if (siteHostMatch) positiveSignals.push("site_host_match");
  if (officialHostMatch) positiveSignals.push("known_official_host_match");
  if (leagueTermMatch) positiveSignals.push("league_term_match");
  if (countryTermMatch) positiveSignals.push("country_term_match");
  if (season2025Match) positiveSignals.push("season_2025_signal");
  if (standingsTermMatch && footballContextMatch) positiveSignals.push("football_standings_context");

  if (knownJunkHosts.has(item.host)) negativeSignals.push("known_junk_host");
  if (thirdPartyScoreHost) negativeSignals.push("third_party_score_site");
  if (text.includes("wikipedia")) negativeSignals.push("wikipedia");
  if (containsAny(text, ["furniture", "dining", "home decor", "buy table", "html tables", "download roblox", "google maps help"])) {
    negativeSignals.push("generic_table_or_non_football_junk");
  }
  if (text.includes("prediction") || text.includes("preview") || text.includes("odds")) negativeSignals.push("news_preview_prediction_or_odds");
  if (text.includes("2026/27") || text.includes("2026-27") || text.includes("2026 2027")) negativeSignals.push("current_or_next_season_signal");

  let candidateScore = 0;
  if (siteHostMatch) candidateScore += 35;
  if (officialHostMatch) candidateScore += 30;
  if (leagueTermMatch) candidateScore += 22;
  if (countryTermMatch) candidateScore += 8;
  if (season2025Match) candidateScore += 14;
  if (standingsTermMatch && footballContextMatch) candidateScore += 14;

  if (knownJunkHosts.has(item.host)) candidateScore -= 40;
  if (thirdPartyScoreHost) candidateScore -= 18;
  if (negativeSignals.includes("generic_table_or_non_football_junk")) candidateScore -= 35;
  if (negativeSignals.includes("news_preview_prediction_or_odds")) candidateScore -= 12;
  if (negativeSignals.includes("current_or_next_season_signal")) candidateScore -= 12;
  if (!leagueTermMatch && !officialHostMatch && !siteHostMatch) {
    candidateScore -= 12;
    reviewFlags.push("no_league_or_official_host_anchor");
  }
  if (standingsTermMatch && !footballContextMatch) {
    candidateScore -= 20;
    reviewFlags.push("generic_table_without_football_context");
  }

  const routeCandidate = candidateScore >= 35 &&
    (officialHostMatch || siteHostMatch) &&
    leagueTermMatch &&
    !negativeSignals.includes("known_junk_host") &&
    !negativeSignals.includes("generic_table_or_non_football_junk");

  return {
    candidateScore,
    positiveSignals,
    negativeSignals,
    reviewFlags,
    routeCandidate,
    reviewOnly: true,
    acceptanceAllowedNow: false
  };
}

async function runSearch(query) {
  const url = `https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 AI-MatchLab-FootballTruth/1.0"
    }
  });

  const body = await response.text();

  return {
    searchUrl: url,
    status: response.status,
    ok: response.ok,
    bodyLength: body.length,
    items: response.ok ? parseRssItems(body) : []
  };
}

await fs.mkdir(outputDir, { recursive: true });

const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
const planRows = parseJsonl(await fs.readFile(planRowsPath, "utf8"));

const batch = (plan.batches || [])[batchIndex - 1];
if (!batch) {
  throw new Error(`Batch index ${batchIndex} not found in plan`);
}

const targetSet = new Set(batch.targetSlugs);
const queryRows = planRows.filter(row => targetSet.has(row.slug));

if (queryRows.length !== batch.queryCount) {
  throw new Error(`Query count mismatch for batch ${batch.batchId}: expected ${batch.queryCount}, got ${queryRows.length}`);
}

const resultRows = [];
const seenResultKeys = new Set();
let searchExecutedNowCount = 0;
let rssOkCount = 0;
let rssNonOkCount = 0;
let duplicateSearchResultSkippedCount = 0;

for (let i = 0; i < queryRows.length; i += 1) {
  const queryRow = queryRows[i];
  console.log(`SEARCH ${i + 1}/${queryRows.length} ${queryRow.slug} ${queryRow.query}`);

  const result = await runSearch(queryRow.query);
  searchExecutedNowCount += 1;
  if (result.ok) rssOkCount += 1;
  else rssNonOkCount += 1;

  for (const item of result.items) {
    const key = `${queryRow.slug}|${item.link || item.title}`;
    if (seenResultKeys.has(key)) {
      duplicateSearchResultSkippedCount += 1;
      continue;
    }
    seenResultKeys.add(key);

    resultRows.push({
      batchId: batch.batchId,
      batchIndex,
      slug: queryRow.slug,
      lane: queryRow.lane,
      batchRank: queryRow.batchRank,
      queryRank: queryRow.queryRank,
      query: queryRow.query,
      searchStatus: result.status,
      searchOk: result.ok,
      resultRank: item.resultRank,
      title: item.title,
      link: item.link,
      host: item.host,
      description: item.description,
      pubDate: item.pubDate,
      ...classifyResult(item, queryRow)
    });
  }

  await new Promise(resolve => setTimeout(resolve, 350));
}

const bySlug = {};
for (const slug of batch.targetSlugs) {
  const rows = resultRows.filter(row => row.slug === slug);
  const routeCandidates = rows
    .filter(row => row.routeCandidate)
    .sort((a, b) => b.candidateScore - a.candidateScore || a.resultRank - b.resultRank);

  bySlug[slug] = {
    resultRowCount: rows.length,
    uniqueHostCount: new Set(rows.map(row => row.host).filter(Boolean)).size,
    routeCandidateCount: routeCandidates.length,
    topCandidateHosts: rows
      .slice()
      .sort((a, b) => b.candidateScore - a.candidateScore || a.resultRank - b.resultRank)
      .slice(0, 8)
      .map(row => ({
        host: row.host,
        title: row.title,
        link: row.link,
        candidateScore: row.candidateScore,
        routeCandidate: row.routeCandidate,
        positiveSignals: row.positiveSignals,
        negativeSignals: row.negativeSignals,
        reviewFlags: row.reviewFlags
      }))
  };
}

const report = {
  status: "passed",
  runner: "high_yield_previous_completed_official_route_search_batch",
  contractVersion: 2,
  purpose: "Search-only RSS execution for one approved high-yield previous_completed official route batch. Result pages are not fetched; rows are review candidates only.",
  batchId: batch.batchId,
  batchIndex,
  inputPlanPath: path.relative(root, planPath).replaceAll("\\", "/"),
  inputPlanRowsPath: path.relative(root, planRowsPath).replaceAll("\\", "/"),
  inputPlanSha256: await sha256(planPath),
  inputPlanRowsSha256: await sha256(planRowsPath),
  output: path.relative(root, outputPath).replaceAll("\\", "/"),
  rowsOutput: path.relative(root, rowsOutputPath).replaceAll("\\", "/"),
  guardrails: {
    allowSearch,
    searchExecutedNowCount,
    fetchResultPagesExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false
  },
  summary: {
    targetCount: batch.targetSlugs.length,
    queryCount: queryRows.length,
    rssOkCount,
    rssNonOkCount,
    resultRowCount: resultRows.length,
    duplicateSearchResultSkippedCount,
    targetSlugs: batch.targetSlugs,
    highScoreResultCount: resultRows.filter(row => row.candidateScore >= 35).length,
    routeCandidateCount: resultRows.filter(row => row.routeCandidate).length,
    knownJunkResultCount: resultRows.filter(row => row.negativeSignals.includes("known_junk_host") || row.negativeSignals.includes("generic_table_or_non_football_junk")).length,
    reviewCandidateOnly: true
  },
  acceptance: {
    acceptedNowCount: 0,
    reason: "Search results are route candidates only. Acceptance still requires exact competition identity, previous_completed season scope, season label, expected row count, team signals, non-zero rows, W/D/L/points arithmetic, GD arithmetic, and duplicate guard."
  },
  bySlug
};

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsOutputPath, resultRows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  contractVersion: report.contractVersion,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  bySlug: report.bySlug
}, null, 2));
