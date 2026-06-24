import fs from "node:fs";
import path from "node:path";

const targetPackPath = "data/football-truth/_diagnostics/search-ready-frontier-query-hygiene-pack-2026-06-17/search-ready-frontier-query-hygiene-pack-2026-06-17.json";
const mainWavePath = "data/football-truth/_diagnostics/search-ready-frontier-official-search-wave-2026-06-17/search-ready-frontier-official-search-wave-2026-06-17.json";
const retryWavePath = "data/football-truth/_diagnostics/search-ready-frontier-official-search-retry-wave-2026-06-17/search-ready-frontier-official-search-retry-wave-2026-06-17.json";
const rawDirs = [
  "data/football-truth/_diagnostics/search-ready-frontier-official-search-wave-2026-06-17/raw-search-batches",
  "data/football-truth/_diagnostics/search-ready-frontier-official-search-retry-wave-2026-06-17/raw-search-batches"
];
const outPath = "data/football-truth/_diagnostics/combined-ultra-strict-frontier-search-board-2026-06-17/combined-ultra-strict-frontier-search-board-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function listFiles(dir, out=[]){
  if(!fs.existsSync(dir)) return out;
  for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const p = path.join(dir,e.name);
    if(e.isDirectory()) listFiles(p,out);
    else out.push(p);
  }
  return out;
}
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function uniq(a){ return [...new Set(a.filter(Boolean))]; }
function hits(s, arr){ const t=String(s||"").toLowerCase(); return uniq(arr.filter(x => t.includes(String(x).toLowerCase()))); }
function getField(o, names){
  for(const n of names){
    if(o && Object.prototype.hasOwnProperty.call(o,n) && typeof o[n] === "string" && clean(o[n])) return clean(o[n]);
  }
  return "";
}

const targetPack = readJson(targetPackPath);
const targets = targetPack.searchReadyTargets || [];
const queryToTarget = new Map();
for(const t of targets){
  for(const q of t.plannedSearchQueries || []) queryToTarget.set(clean(q).toLowerCase(), t);
}

function normalizeRow(o, sourceFile, sourceWaveKind){
  if(!o || typeof o !== "object") return null;
  const url = getField(o, ["url","link","href","resultUrl","targetUrl","displayUrl","sourceUrl"]);
  if(!/^https?:\/\//i.test(url)) return null;

  const q = getField(o, ["query","q","searchQuery"]) || getField(o.searchTarget || {}, ["query","q","searchQuery"]) || getField(o.target || {}, ["query","q","searchQuery"]);
  const target = q ? queryToTarget.get(clean(q).toLowerCase()) : null;

  return {
    competitionSlug: clean(o.competitionSlug || o.searchTarget?.competitionSlug || o.target?.competitionSlug || target?.competitionSlug),
    competitionName: clean(o.competitionName || o.searchTarget?.competitionName || o.target?.competitionName || target?.competitionName),
    country: clean(o.country || o.searchTarget?.country || o.target?.country || target?.country),
    query: q,
    title: getField(o, ["title","name","heading"]),
    snippet: getField(o, ["snippet","description","content","text","summary"]),
    url,
    host: hostOf(url),
    path: pathOf(url),
    sourceFile,
    sourceWaveKind
  };
}
function walk(x, sourceFile, sourceWaveKind, rows, depth=0){
  if(depth > 8 || !x) return;
  if(Array.isArray(x)){
    for(const item of x) walk(item, sourceFile, sourceWaveKind, rows, depth+1);
    return;
  }
  if(typeof x === "object"){
    const r = normalizeRow(x, sourceFile, sourceWaveKind);
    if(r) rows.push(r);
    for(const v of Object.values(x).slice(0,120)) if(v && typeof v === "object") walk(v, sourceFile, sourceWaveKind, rows, depth+1);
  }
}

const rawRows = [];
for(const rawDir of rawDirs){
  const kind = rawDir.includes("retry-wave") ? "retry" : "main";
  for(const f of listFiles(path.join(rawDir,"search-batches")).filter(p => /autonomous-search-results-batch-\d+\.json$/.test(p))){
    walk(readJson(f), f, kind, rawRows);
  }
}

const seen = new Set();
const rows = [];
for(const r of rawRows){
  if(!r.competitionSlug) continue;
  const key = `${r.competitionSlug}|${r.url}|${r.title}|${r.snippet}`.toLowerCase();
  if(!seen.has(key)){
    seen.add(key);
    rows.push(r);
  }
}

const hardRejectHosts = [
  "rsssf.org","soccerway.com","flashscore.com","sofascore.com","livesport.com","futbol24.com","worldfootball.net","transfermarkt.com",
  "wikipedia.org","wikidata.org","britannica.com","tripadvisor.com","worldatlas.com","nationsonline.org","lonelyplanet.com",
  "google.com","mail.google.com","microsoft.com","support.microsoft.com","office.com","outlook.office.com","linkedin.com","whatsapp.com",
  "petfinder.com","pluralsight.com","tenforums.com","chromedino.com","howtogeek.com","autotrader.co.za","caymanchem.com",
  "tourismbih.com","albaniaturism.com","visitangola.ao","aruba.com","aruba.it","bahamas.com","bermuda.com","gotobermuda.com",
  "visitbarbados.org","visitbulgaria.com","cestujlevne.com","bubo.sk","lex.dk","gry.pl","thinkorswim.com","trade.thinkorswim.com",
  "diplomatie.gouv.fr","civil-protection-humanitarian-aid.ec.europa.eu","developer.android.com","demo.cambodia.gov.kh"
];
const hardRejectTextTokens = [
  "tourism","travel","hotel","culture","tripadvisor","britannica","wikipedia","wiki","worldatlas","nations online","lonely planet",
  "google","microsoft","linkedin","whatsapp","pluralsight","tutorial","forum","chrome dino","petfinder","autotrader","howtogeek",
  "humanitarian","civil protection","lawyer","anwalt","template","muster","kuendigung","samba","chemical"
];

const routeTokens = ["standings","standing","points standing","table","league table","league-table","classification","classement","classifica","classificacao","classificação","posiciones","tabla","ranking","rankings","ladder"];
const officialPhrases = ["football association","football federation","soccer association","soccer federation","federation of football","association of football","official football","national football federation","national football association"];
const hostOfficialRegexes = [
  /(^|[.-])football([.-]|$)/i,
  /(^|[.-])soccer([.-]|$)/i,
  /(^|[.-])futbol([.-]|$)/i,
  /(^|[.-])futebol([.-]|$)/i,
  /(^|[.-])futbal([.-]|$)/i,
  /(^|[.-])fa([.-]|$)/i,
  /(^|[.-])[a-z]{2,4}fa([.-]|$)/i,
  /(^|[.-])ff[a-z]{1,5}([.-]|$)/i,
  /(^|[.-])fpf([.-]|$)/i,
  /(^|[.-])afa([.-]|$)/i,
  /(^|[.-])saff([.-]|$)/i,
  /(^|[.-])dimayor([.-]|$)/i,
  /(^|[.-])league([.-]|$)/i,
  /(^|[.-])liga([.-]|$)/i,
  /(^|[.-])ligue([.-]|$)/i,
  /(^|[.-])superliga([.-]|$)/i
];

function termsFrom(s){
  return clean(s).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x => x.length >= 4 && !["league","division","football","soccer","official","standings","table","premier","first","second","national"].includes(x));
}
function vet(row){
  const evidenceText = `${row.title} ${row.snippet} ${row.url} ${row.host}`.toLowerCase(); // intentionally excludes query
  const titleSnippet = `${row.title} ${row.snippet}`.toLowerCase();
  const host = row.host;
  const rejectHost = hardRejectHosts.some(h => host === h || host.endsWith("." + h));
  const rejectTextHits = hits(evidenceText, hardRejectTextTokens);
  const routeHits = uniq([...hits(row.path, routeTokens), ...hits(row.url, routeTokens), ...hits(titleSnippet, routeTokens)]);
  const phraseHits = hits(titleSnippet, officialPhrases);
  const officialHost = hostOfficialRegexes.some(re => re.test(host));

  const countryHits = termsFrom(row.country).filter(t => evidenceText.includes(t) || host.includes(t));
  const nameHits = termsFrom(row.competitionName).filter(t => evidenceText.includes(t) || host.includes(t));

  let score = 0;
  if(officialHost) score += 100;
  if(phraseHits.length) score += 90;
  if(routeHits.length) score += 70;
  if(countryHits.length) score += 20;
  if(nameHits.length) score += 25;
  if(rejectHost) score -= 600;
  if(rejectTextHits.length) score -= 300;

  const hasOfficial = officialHost || phraseHits.length > 0;
  const hasRoute = routeHits.length > 0;
  const hasContext = countryHits.length > 0 || nameHits.length > 0;

  let status = "rejected_combined_ultra_strict_no_official_route_signal";
  if(rejectHost || rejectTextHits.length) status = "rejected_combined_ultra_strict_noise";
  else if(hasOfficial && hasRoute && hasContext && score >= 180) status = "combined_ultra_strict_official_route_candidate_requires_fetch_probe";
  else if(hasOfficial && hasContext && score >= 135) status = "combined_ultra_strict_official_domain_candidate_requires_route_probe";
  else if(hasOfficial && score >= 110) status = "combined_ultra_strict_review_official_signal_without_context_or_route";

  return { vettingStatus:status, ultraStrictScore:score, officialHost, phraseHits, routeHits, countryHits, nameHits, rejectHost, rejectTextHits };
}

const vettedRows = rows.map(r => ({...r, ...vet(r)}));
const rank = s => s === "combined_ultra_strict_official_route_candidate_requires_fetch_probe" ? 4 : s === "combined_ultra_strict_official_domain_candidate_requires_route_probe" ? 3 : s === "combined_ultra_strict_review_official_signal_without_context_or_route" ? 2 : 0;
const bestBySlug = new Map();
for(const r of vettedRows){
  const prev = bestBySlug.get(r.competitionSlug);
  const s = rank(r.vettingStatus) * 100000 + r.ultraStrictScore;
  const ps = prev ? rank(prev.vettingStatus) * 100000 + prev.ultraStrictScore : -999999;
  if(!prev || s > ps) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));
const routeRows = bestRows.filter(r => r.vettingStatus === "combined_ultra_strict_official_route_candidate_requires_fetch_probe");
const domainRows = bestRows.filter(r => r.vettingStatus === "combined_ultra_strict_official_domain_candidate_requires_route_probe");
const reviewRows = bestRows.filter(r => r.vettingStatus === "combined_ultra_strict_review_official_signal_without_context_or_route");

const fetchProbePreviewRows = [...routeRows, ...domainRows].map((r,i)=>({
  priority:i+1,
  competitionSlug:r.competitionSlug,
  competitionName:r.competitionName,
  country:r.country,
  sourceSearchUrl:r.url,
  sourceSearchHost:r.host,
  sourceSearchTitle:r.title,
  sourceSearchSnippet:r.snippet,
  vettingStatus:r.vettingStatus,
  ultraStrictScore:r.ultraStrictScore,
  fetchAllowedOnlyWithExplicitApproval:false,
  canonicalWriteAllowedNow:false,
  productionTruthAllowedNow:false
}));

const mainWave = readJson(mainWavePath);
const retryWave = readJson(retryWavePath);
const summary = {
  status:"passed",
  targetCompetitionCount:targets.length,
  mainSearchResultRowCount:mainWave.summary?.searchResultRowCount ?? null,
  retrySearchResultRowCount:retryWave.summary?.searchResultRowCount ?? null,
  combinedRawSearchRowsBeforeDedup:rawRows.length,
  combinedUniqueSearchRows:rows.length,
  bestCompetitionCount:bestRows.length,
  bestRowsByVettingStatus:Object.entries(bestRows.reduce((a,r)=>{ a[r.vettingStatus]=(a[r.vettingStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  allRowsByVettingStatus:Object.entries(vettedRows.reduce((a,r)=>{ a[r.vettingStatus]=(a[r.vettingStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  routeCandidateSlugCount:routeRows.length,
  domainCandidateSlugCount:domainRows.length,
  reviewCandidateSlugCount:reviewRows.length,
  fetchProbePreviewCount:fetchProbePreviewRows.length,
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

const out = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  bestRows,
  fetchProbePreviewRows,
  routeCandidateRows:routeRows,
  domainCandidateRows:domainRows,
  reviewRows,
  policy:{
    localCombinedVettingOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    queryTextNotUsedAsEvidence:true,
    nextAllowedAction:"controlled_fetch_probe_only_for_combined_ultra_strict_route_or_domain_candidates"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
