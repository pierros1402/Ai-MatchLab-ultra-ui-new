import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);
const allowFetch = process.argv.includes("--allow-fetch");
const batchIndex = Number((process.argv.find(arg => arg.startsWith("--batch=")) || "--batch=1").split("=")[1]);
const pad = String(batchIndex).padStart(3, "0");

const outDir = path.join(root, "data", "football-truth", "_diagnostics", `bulk-batch-alternative-route-probe-${today}`);
const outPath = path.join(outDir, `bulk-batch-alternative-route-probe-batch-${pad}-${today}.json`);
const rowsPath = path.join(outDir, `bulk-batch-alternative-route-probe-batch-${pad}-rows-${today}.jsonl`);

function rel(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function shaText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function hostOf(url) {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

function titleOf(html) {
  const m = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return (m?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function compact(value, max = 220) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function fetchWithTimeout(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-MatchLab-FootballTruth/1.0; +bounded-alternative-route-probe)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.8,*/*;q=0.7",
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

const routeTerms = /(standings|ranking|table|fixtures|fixture|results|schedule|matches|match|tabela|tabulka|tabelle|classifica|classificacao|clasament|puan|ladder|calendario|spielplan|program|terminarz|zapasy|fikstur|βαθμολογ|πρόγραμμα|αγώνες|round|club|team)/i;

const competitionTerms = {
  "fra.1": /(ligue 1|ligue1)/i,
  "fra.2": /(ligue 2|ligue2|bkt)/i,
  "por.1": /(liga portugal|primeira|betclic)/i,
  "por.2": /(liga portugal 2|ligaportugal2|liga 2|sabseg)/i,
  "bel.1": /(jupiler|pro league|first division a)/i,
  "bel.2": /(challenger|challenger pro league)/i,
  "aut.2": /(2\. liga|2liga|zweite liga)/i,
  "sui.1": /(super league|superleague|swiss)/i,
  "sui.2": /(challenge league|challengeleague)/i,
  "pol.2": /(1 liga|i liga|pierwsza liga)/i,
  "cze.1": /(chance liga|chanceliga)/i,
  "tur.1": /(super lig|süper lig)/i,
  "tur.2": /(1\. lig|1 lig|birinci)/i,
  "gre.1": /(super league|slgr|stoiximan|βαθμολογ|σούπερ)/i,
  "gre.2": /(super league 2|sl2)/i,
  "mex.1": /(liga mx|ligamx)/i,
  "mex.2": /(expansion|expansión|ascenso)/i,
  "bra.1": /(serie a|série a|brasileiro)/i,
  "bra.2": /(serie b|série b|brasileiro)/i,
  "arg.2": /(primera nacional)/i,
  "kor.1": /(k league 1|kleague 1|k리그1)/i,
  "kor.2": /(k league 2|kleague 2|k리그2)/i,
  "chn.1": /(super league|csl|chinese super league)/i,
  "chn.2": /(league one|china league one)/i,
  "jpn.2": /(j2|j\.league|j league)/i,
  "ita.2": /(serie b|serie-b|bkt)/i,
  "cze.2": /(fnliga|f:nl|narodni liga|národní liga|second league)/i,
  "den.2": /(1\. division|1-division|nordicbet)/i,
  "ksa.1": /(saudi pro league|ros（?hn）?|spl|دوري)/i,
  "aus.2": /(national second tier|npl|championship)/i,
  "rou.1": /(superliga|liga 1|liga i|romania)/i
};

const officialHostBySlug = {
  "fra.1": ["ligue1.com"],
  "fra.2": ["ligue1.com"],
  "por.1": ["ligaportugal.pt"],
  "por.2": ["ligaportugal.pt"],
  "bel.1": ["proleague.be"],
  "bel.2": ["proleague.be"],
  "aut.2": ["2liga.at"],
  "sui.1": ["sfl.ch"],
  "sui.2": ["sfl.ch"],
  "pol.2": ["1liga.org"],
  "cze.1": ["chanceliga.cz"],
  "tur.1": ["tff.org"],
  "tur.2": ["tff.org"],
  "gre.1": ["slgr.gr"],
  "gre.2": ["sl2.gr"],
  "mex.1": ["ligamx.net"],
  "mex.2": ["ligamx.net"],
  "bra.1": ["cbf.com.br"],
  "bra.2": ["cbf.com.br"],
  "arg.2": ["afa.com.ar"],
  "kor.1": ["kleague.com"],
  "kor.2": ["kleague.com"],
  "chn.1": ["thecfa.cn"],
  "chn.2": ["thecfa.cn"],
  "jpn.2": ["jleague.co", "jleague.jp"],
  "ita.2": ["legab.it"],
  "cze.2": ["fotbal.cz", "fnliga.cz"],
  "den.2": ["dbu.dk", "division.dk"],
  "ksa.1": ["spl.com.sa"],
  "aus.2": ["footballaustralia.com.au", "npl.tv"],
  "rou.1": ["lpf.ro", "superliga.ro", "frf.ro"]
};

const candidates = {
  "fra.1": ["https://www.ligue1.com/ranking", "https://www.ligue1.com/fr/ranking", "https://www.ligue1.com/fixtures-results", "https://www.ligue1.com/fr/fixtures-results"],
  "fra.2": ["https://www.ligue1.com/ligue2/ranking", "https://www.ligue1.com/ligue2/fixtures-results", "https://www.ligue1.com/fr/ligue2/ranking", "https://www.ligue1.com/fr/ligue2/fixtures-results"],
  "por.1": ["https://www.ligaportugal.pt/en/liga/classificacao/20252026/ligaportugalbetclic", "https://www.ligaportugal.pt/pt/liga/classificacao/20252026/ligaportugalbetclic", "https://www.ligaportugal.pt/en/standings", "https://www.ligaportugal.pt/pt/liga/calendario/20252026/ligaportugalbetclic"],
  "por.2": ["https://www.ligaportugal.pt/en/liga/classificacao/20252026/ligaportugal2", "https://www.ligaportugal.pt/pt/liga/classificacao/20252026/ligaportugal2", "https://www.ligaportugal.pt/en/liga/calendario/20252026/ligaportugal2", "https://www.ligaportugal.pt/pt/liga/calendario/20252026/ligaportugal2"],
  "bel.1": ["https://www.proleague.be/en/jupiler-pro-league/standings", "https://www.proleague.be/en/jupiler-pro-league/calendar", "https://www.proleague.be/standings", "https://www.proleague.be/en/competition/jupiler-pro-league"],
  "bel.2": ["https://www.proleague.be/en/challenger-pro-league/standings", "https://www.proleague.be/en/challenger-pro-league/fixtures", "https://www.proleague.be/en/challenger-pro-league/calendar"],
  "aut.2": ["https://www.2liga.at/de/tabelle/", "https://www.2liga.at/de/ranking", "https://www.2liga.at/de/spielplan/", "https://www.2liga.at/de/fixtures/"],
  "sui.1": ["https://www.sfl.ch/en/superleague/table", "https://www.sfl.ch/en/superleague/matches", "https://www.sfl.ch/en/superleague/standings", "https://www.sfl.ch/en/"],
  "sui.2": ["https://www.sfl.ch/en/challengeleague/table", "https://www.sfl.ch/en/challengeleague/matches", "https://www.sfl.ch/en/challengeleague/standings", "https://www.sfl.ch/en/"],
  "pol.2": ["https://www.1liga.org/tabela", "https://www.1liga.org/terminarz", "https://www.1liga.org/fixtures", "https://www.1liga.org/"],
  "cze.1": ["https://www.chanceliga.cz/tabulka", "https://www.chanceliga.cz/zapasy", "https://www.chanceliga.cz/", "https://www.chanceliga.cz/fixtures"],
  "tur.1": ["https://www.tff.org/default.aspx?pageID=198", "https://www.tff.org/default.aspx?pageID=142", "https://tff.org/standings", "https://tff.org/fixtures"],
  "tur.2": ["https://www.tff.org/default.aspx?pageID=488", "https://www.tff.org/default.aspx?pageID=142", "https://tff.org/fixtures", "https://tff.org/standings"],
  "gre.1": ["https://www.slgr.gr/el/scoreboard/", "https://www.slgr.gr/el/standings/", "https://www.slgr.gr/el/schedule/", "https://www.slgr.gr/el/fixtures/"],
  "gre.2": ["https://sl2.gr/fixtures", "https://sl2.gr/%CE%B1%CE%B3%CF%89%CE%BD%CE%B5%CF%83/", "https://sl2.gr/%CE%B2%CE%B1%CE%B8%CE%BC%CE%BF%CE%BB%CE%BF%CE%B3%CE%B9%CE%B1/", "https://sl2.gr/"],
  "mex.1": ["https://ligamx.net/cancha/calendarios", "https://ligamx.net/cancha/tablaGeneral", "https://ligamx.net/cancha/estadistica", "https://ligamx.net/"],
  "mex.2": ["https://ligamx.net/cancha/ascenso", "https://ligamx.net/cancha/calendarios", "https://ligamx.net/cancha/tablaGeneral", "https://ligamx.net/"],
  "bra.1": ["https://www.cbf.com.br/futebol-brasileiro/competicoes/campeonato-brasileiro-serie-a", "https://www.cbf.com.br/futebol-brasileiro/competicoes/campeonato-brasileiro-serie-a/tabela", "https://cbf.com.br/standings"],
  "bra.2": ["https://www.cbf.com.br/futebol-brasileiro/competicoes/campeonato-brasileiro-serie-b", "https://www.cbf.com.br/futebol-brasileiro/competicoes/campeonato-brasileiro-serie-b/tabela", "https://cbf.com.br/standings"],
  "arg.2": ["https://www.afa.com.ar/es/pages/primera-nacional", "https://www.afa.com.ar/es/posts/fixture-primera-nacional", "https://www.afa.com.ar/es/pages/torneos", "https://afa.com.ar/es/posts/fixture-primera-nacional"],
  "kor.1": ["https://www.kleague.com/match.do?leagueId=1", "https://www.kleague.com/record.do?leagueId=1", "https://www.kleague.com/schedule.do?leagueId=1", "https://www.kleague.com/match.do"],
  "kor.2": ["https://www.kleague.com/match.do?leagueId=2", "https://www.kleague.com/record.do?leagueId=2", "https://www.kleague.com/schedule.do?leagueId=2", "https://www.kleague.com/match.do"],
  "chn.1": ["https://www.thecfa.cn/csl/", "https://www.thecfa.cn/match", "https://www.thecfa.cn/league/1", "https://www.thecfa.cn/"],
  "chn.2": ["https://www.thecfa.cn/chinaleague/", "https://www.thecfa.cn/match", "https://www.thecfa.cn/league/2", "https://www.thecfa.cn/"],
  "jpn.2": ["https://www.jleague.co/en/matches/?category=j2", "https://www.jleague.jp/en/matches/j2/", "https://www.jleague.jp/en/standings/j2/", "https://www.jleague.co/en/standings/j2"],
  "ita.2": ["https://www.legab.it/classifica/", "https://www.legab.it/calendario/", "https://www.legab.it/seriebkt/classifica/", "https://www.legab.it/seriebkt/calendario/"],
  "cze.2": ["https://www.fotbal.cz/souteze/turnaje/fnl", "https://www.fotbal.cz/souteze/tabulky", "https://www.fotbal.cz/souteze/zapasy", "https://www.fnliga.cz/tabulka"],
  "den.2": ["https://division.dk/1-division/stilling/", "https://division.dk/1-division/kampprogram/", "https://www.dbu.dk/resultater/pulje/444838", "https://www.dbu.dk/resultater/"],
  "ksa.1": ["https://www.spl.com.sa/en/standings", "https://www.spl.com.sa/en/fixtures", "https://www.spl.com.sa/en/matches", "https://www.spl.com.sa/en"],
  "aus.2": ["https://www.footballaustralia.com.au/national-second-tier", "https://www.footballaustralia.com.au/competitions", "https://npl.tv/", "https://www.footballaustralia.com.au/"],
  "rou.1": ["https://lpf.ro/liga-1", "https://lpf.ro/clasament-superliga", "https://lpf.ro/program-superliga", "https://superliga.ro/clasament"]
};

const targetSlugs = Object.keys(candidates);
const allTasks = targetSlugs.flatMap(slug => candidates[slug].map(url => ({ slug, url })));

const blocks = [];
if (!allowFetch) blocks.push("missing_allow_fetch");

await fs.mkdir(outDir, { recursive: true });

const results = [];

async function runTask(task, index) {
  const slug = task.slug;
  const url = task.url;
  console.log(`[${index + 1}/${allTasks.length}] probe ${slug} ${url}`);

  const startedAt = new Date().toISOString();
  const fetched = await fetchWithTimeout(url, 15000);
  const endedAt = new Date().toISOString();

  const status = fetched.response?.status ?? null;
  const finalUrl = fetched.response?.url || url;
  const finalHost = hostOf(finalUrl);
  const bodyLength = fetched.text.length;
  const title = titleOf(fetched.text);
  const contentType = fetched.response?.headers?.get("content-type") || null;
  const allowedHosts = officialHostBySlug[slug] || [];
  const hostMatched = allowedHosts.some(host => finalHost === host || finalHost.endsWith(`.${host}`));
  const routeTermMatched = routeTerms.test(fetched.text) || routeTerms.test(finalUrl) || routeTerms.test(title);
  const compRegex = competitionTerms[slug];
  const competitionTermMatched = compRegex ? compRegex.test(fetched.text) || compRegex.test(finalUrl) || compRegex.test(title) : true;

  const validationBlocks = [];
  if (fetched.error) validationBlocks.push("fetch_error");
  if (fetched.timedOut) validationBlocks.push("fetch_timeout");
  if (!(status >= 200 && status < 400)) validationBlocks.push("status_not_2xx_or_3xx");
  if (!hostMatched) validationBlocks.push("final_host_mismatch");
  if (bodyLength < 500) validationBlocks.push("body_too_short");
  if (!routeTermMatched) validationBlocks.push("route_terms_not_found");
  if (!competitionTermMatched) validationBlocks.push("competition_terms_not_found");

  return {
    slug,
    url,
    finalUrl,
    finalHost,
    fetchStatus: status,
    contentType,
    bodyLength,
    title: compact(title),
    bodySha256: fetched.text ? shaText(fetched.text) : null,
    startedAt,
    endedAt,
    fetchError: fetched.error,
    timedOut: fetched.timedOut,
    hostMatched,
    routeTermMatched,
    competitionTermMatched,
    validationPassed: validationBlocks.length === 0,
    validationBlocks,
    rawPayloadWritten: false,
    rawPayloadCommitted: false,
    productionWriteExecutedNow: false,
    truthAssertionExecutedNow: false
  };
}

if (allowFetch && blocks.length === 0) {
  const concurrency = 8;
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < allTasks.length) {
      const index = next++;
      results[index] = await runTask(allTasks[index], index);
    }
  });
  await Promise.all(workers);
}

const rows = targetSlugs.map(slug => {
  const attempts = results.filter(row => row.slug === slug);
  const passed = attempts.filter(row => row.validationPassed);
  const status2xx = attempts.filter(row => row.fetchStatus >= 200 && row.fetchStatus < 400);
  const best = [...attempts].sort((a, b) => {
    const score = item => (item.validationPassed ? 1000 : 0) + ((item.fetchStatus >= 200 && item.fetchStatus < 400) ? 300 : 0) + (item.hostMatched ? 100 : 0) + (item.routeTermMatched ? 50 : 0) + (item.competitionTermMatched ? 50 : 0) + Math.min(item.bodyLength || 0, 100000) / 10000;
    return score(b) - score(a);
  })[0] || null;

  return {
    slug,
    attemptedUrlCount: attempts.length,
    passedUrlCount: passed.length,
    status2xxUrlCount: status2xx.length,
    bestStatus: best?.validationPassed ? "alternative_route_passed" : status2xx.length > 0 ? "route_fetches_but_needs_rendered_or_parser_review" : "needs_search_or_manual_official_discovery",
    bestUrl: best?.url || null,
    bestFinalUrl: best?.finalUrl || null,
    bestFinalHost: best?.finalHost || null,
    bestFetchStatus: best?.fetchStatus ?? null,
    bestBodyLength: best?.bodyLength ?? 0,
    bestTitle: best?.title || "",
    bestValidationBlocks: best?.validationBlocks || [],
    passedUrls: passed.map(row => row.finalUrl),
    attempts
  };
});

const passedSlugRows = rows.filter(row => row.bestStatus === "alternative_route_passed");
const renderedReviewRows = rows.filter(row => row.bestStatus === "route_fetches_but_needs_rendered_or_parser_review");
const discoveryRows = rows.filter(row => row.bestStatus === "needs_search_or_manual_official_discovery");

const report = {
  status: blocks.length === 0 ? "passed" : "failed",
  runner: "bulk_batch_alternative_route_probe",
  contractVersion: 1,
  batchIndex,
  output: rel(outPath),
  rowsOutput: rel(rowsPath),
  guardrails: {
    searchExecutedNowCount: 0,
    fetchExecutedNowCount: results.length,
    providerFetchExecutedNowCount: 0,
    controlledAlternativeRouteFetchExecutedNowCount: results.length,
    canonicalWriteExecutedNowCount: 0,
    lifecycleWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    rawPayloadCommitted: false,
    fullRawPayloadWritten: false
  },
  summary: {
    batchIndex,
    targetSlugCount: targetSlugs.length,
    attemptedFetchCount: results.length,
    alternativeRoutePassedCount: passedSlugRows.length,
    renderedOrParserReviewCount: renderedReviewRows.length,
    needsSearchOrManualOfficialDiscoveryCount: discoveryRows.length,
    alternativeRoutePassedSlugs: passedSlugRows.map(row => row.slug),
    renderedOrParserReviewSlugs: renderedReviewRows.map(row => row.slug),
    needsSearchOrManualOfficialDiscoverySlugs: discoveryRows.map(row => row.slug),
    acceptedNowCount: 0,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false,
    nextRecommendedLane: "merge with prior 9 passed fetch routes; run rendered/parser planning for passed and rendered-review rows; run search only for remaining discovery rows"
  },
  rows,
  blocks
};

await fs.writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(rowsPath, rows.map(row => JSON.stringify(row)).join("\n") + "\n", "utf8");

console.log(JSON.stringify({
  status: report.status,
  output: report.output,
  rowsOutput: report.rowsOutput,
  guardrails: report.guardrails,
  summary: report.summary,
  rows: report.rows.map(row => ({
    slug: row.slug,
    bestStatus: row.bestStatus,
    passedUrlCount: row.passedUrlCount,
    status2xxUrlCount: row.status2xxUrlCount,
    bestFetchStatus: row.bestFetchStatus,
    bestFinalHost: row.bestFinalHost,
    bestTitle: row.bestTitle,
    bestFinalUrl: row.bestFinalUrl,
    bestValidationBlocks: row.bestValidationBlocks
  })),
  blocks: report.blocks
}, null, 2));

if (blocks.length > 0) process.exitCode = 1;
