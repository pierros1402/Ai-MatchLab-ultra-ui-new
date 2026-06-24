import fs from "node:fs";
import path from "node:path";

const wavePath = "data/football-truth/_diagnostics/search-ready-frontier-official-search-wave-2026-06-17/search-ready-frontier-official-search-wave-2026-06-17.json";
const targetsPath = "data/football-truth/_diagnostics/search-ready-frontier-official-search-wave-2026-06-17/search-ready-frontier-official-search-runner-targets-2026-06-17.json";
const rawDir = "data/football-truth/_diagnostics/search-ready-frontier-official-search-wave-2026-06-17/raw-search-batches";
const outPath = "data/football-truth/_diagnostics/strict-search-ready-frontier-search-classifier-2026-06-17/strict-search-ready-frontier-search-classifier-2026-06-17.json";
const retryTargetsPath = "data/football-truth/_diagnostics/strict-search-ready-frontier-search-classifier-2026-06-17/search-ready-frontier-retry-targets-repaired-2026-06-17.json";

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
function hasAny(s, arr){ const t=String(s||"").toLowerCase(); return arr.some(x => t.includes(String(x).toLowerCase())); }
function hits(s, arr){ const t=String(s||"").toLowerCase(); return uniq(arr.filter(x => t.includes(String(x).toLowerCase()))); }
function slugPrefix(slug){ return String(slug||"").split(".")[0]; }

const wave = readJson(wavePath);
const targetPayload = readJson(targetsPath);
const allTargets = targetPayload.targets || targetPayload.searchTargets || targetPayload.rows || [];
const targetById = new Map();
const targetByQuery = new Map();
for(const t of allTargets){
  for(const k of [t.targetId,t.id].filter(Boolean)) targetById.set(String(k), t);
  for(const q of [t.query,t.q,t.searchQuery].filter(Boolean)) targetByQuery.set(clean(q).toLowerCase(), t);
}

const hardRejectHosts = [
  "rsssf.org","soccerway.com","flashscore.com","sofascore.com","livesport.com","futbol24.com","worldfootball.net",
  "transfermarkt.com","besoccer.com","aiscore.com","footystats.org","365scores.com","espn.com","wikipedia.org","wikidata.org",
  "britannica.com","tripadvisor.com","gotobermuda.com","bahamas.com","aruba.com","tourismbih.com","albaniaturism.com",
  "google.com","mail.google.com","support.microsoft.com","microsoft.com","pluralsight.com","tenforums.com","chromedino.com",
  "thinkorswim.com","trade.thinkorswim.com","lata.com.pt","bhutanwiki.org","angola24horas.com","azerbaijan.az",
  "bangladesh.gov.bd","mae.gov.bi","lematin.bj"
];
const hardRejectTokens = [
  "tourism","travel","hotel","culture","britannica","tripadvisor","wiki","wikipedia","google","microsoft","pluralsight",
  "forum","tutorial","mail.google","thinkorswim","rsssf","archive","news","newspaper","samba","chrome dino"
];
const officialHostTokens = [
  "football","soccer","futbol","fútbol","futebol","federation","association","league","liga","ligue","premierleague",
  "superliga","fa.","-fa","thefa","fff","fpf","fshf","ffa","fed","lff","afc","caf","concacaf","uefa","dimayor","auf","saff"
];
const routeTokens = [
  "standings","standing","table","tables","league-table","classification","classement","classifica","classificacao","classificação",
  "posiciones","tabla","ranking","rankings","ladder","league table"
];
const lowRouteTokens = ["news","article","blog","video","gallery","shop","tickets","privacy","login","culture","tourism","forum","tutorial"];

function getField(o, names){
  for(const n of names){
    if(o && Object.prototype.hasOwnProperty.call(o,n) && typeof o[n] === "string" && clean(o[n])) return clean(o[n]);
  }
  return "";
}
function normalizeRow(o, sourceFile){
  if(!o || typeof o !== "object") return null;
  const url = getField(o, ["url","link","href","resultUrl","targetUrl","displayUrl","sourceUrl"]);
  if(!/^https?:\/\//i.test(url)) return null;

  let target = null;
  const ids = [o.targetId,o.id,o.searchTargetId,o.sourceTargetId,o.searchTarget?.targetId,o.target?.targetId,o.searchTarget?.id,o.target?.id].filter(Boolean);
  for(const id of ids){ if(targetById.has(String(id))){ target = targetById.get(String(id)); break; } }
  const q = getField(o, ["query","q","searchQuery"]) || getField(o.searchTarget || {}, ["query","q","searchQuery"]) || getField(o.target || {}, ["query","q","searchQuery"]);
  if(!target && q) target = targetByQuery.get(clean(q).toLowerCase()) || null;

  return {
    competitionSlug:clean(o.competitionSlug || o.searchTarget?.competitionSlug || o.target?.competitionSlug || target?.competitionSlug),
    competitionName:clean(o.competitionName || o.searchTarget?.competitionName || o.target?.competitionName || target?.competitionName),
    country:clean(o.country || o.searchTarget?.country || o.target?.country || target?.country),
    query:q || clean(target?.query || target?.q || target?.searchQuery),
    targetId:clean(ids[0] || target?.targetId || target?.id),
    title:getField(o, ["title","name","heading"]),
    snippet:getField(o, ["snippet","description","content","text","summary"]),
    url,
    host:hostOf(url),
    path:pathOf(url),
    sourceFile
  };
}
function walkResults(x, sourceFile, rows, depth=0){
  if(depth > 8 || !x) return;
  if(Array.isArray(x)){
    for(const item of x) walkResults(item, sourceFile, rows, depth+1);
    return;
  }
  if(typeof x === "object"){
    const r = normalizeRow(x, sourceFile);
    if(r) rows.push(r);
    for(const v of Object.values(x).slice(0,120)) if(v && typeof v === "object") walkResults(v, sourceFile, rows, depth+1);
  }
}
function looksLikeSearchTarget(o){
  if(!o || typeof o !== "object") return false;
  const q = o.query || o.q || o.searchQuery;
  const slug = o.competitionSlug || o.slug || o.normalizedCompetitionSlug;
  return typeof q === "string" && typeof slug === "string" && /^[a-z]{2,3}\.\d+$/.test(slug);
}
function walkTargets(x, rows, depth=0){
  if(depth > 8 || !x) return;
  if(Array.isArray(x)){
    for(const item of x) walkTargets(item, rows, depth+1);
    return;
  }
  if(typeof x === "object"){
    if(looksLikeSearchTarget(x)) rows.push(x);
    for(const v of Object.values(x).slice(0,120)) if(v && typeof v === "object") walkTargets(v, rows, depth+1);
  }
}
function batchNumber(p){
  const m = String(p).match(/(?:batch|provider-batch)-(\d+)\.json$/);
  return m ? Number(m[1]) : null;
}
function classifyStrict(r){
  const host = r.host;
  const url = r.url;
  const text = `${r.title} ${r.snippet} ${r.url} ${r.query}`.toLowerCase();
  const fullHostPath = `${host} ${r.path}`.toLowerCase();
  const rejectHost = hardRejectHosts.some(h => host === h || host.endsWith("." + h));
  const rejectTokenHits = hits(text + " " + host, hardRejectTokens);
  const lowRouteHits = hits(r.path, lowRouteTokens);
  const routeHits = uniq([...hits(url, routeTokens), ...hits(text, routeTokens)]);
  const officialHits = uniq([...hits(host, officialHostTokens), ...hits(text, officialHostTokens)]);
  const footballContext = hasAny(text + " " + host, ["football","soccer","futbol","fútbol","futebol","league","premier","division","federation","association","fa "]);

  const countryTerms = clean(r.country).toLowerCase().split(/[ _-]+/).filter(x => x.length >= 4);
  const nameTerms = clean(r.competitionName).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x => x.length >= 4 && !["league","division","football","official","standings","table","premier","first","second"].includes(x));
  const countryHits = countryTerms.filter(t => text.includes(t) || host.includes(t));
  const nameHits = nameTerms.filter(t => text.includes(t) || host.includes(t));
  const slugHostHit = slugPrefix(r.competitionSlug) && host.includes(slugPrefix(r.competitionSlug));

  let score = 0;
  if(routeHits.length) score += 45;
  if(officialHits.length) score += 55;
  if(footballContext) score += 35;
  score += countryHits.length * 10;
  score += nameHits.length * 14;
  if(slugHostHit) score += 8;
  if(/standings|table|classification|classement|tabla|posiciones|ladder/i.test(r.path)) score += 25;
  if(lowRouteHits.length) score -= 50;
  if(rejectHost) score -= 250;
  if(rejectTokenHits.length) score -= 120;

  const officialHostOrTitle = officialHits.length > 0 && footballContext;
  const routeEvidence = routeHits.length > 0 || /standings|table|classification|classement|tabla|posiciones|ladder/i.test(r.path);
  const countryOrNameContext = countryHits.length > 0 || nameHits.length > 0 || slugHostHit;

  let classification = "rejected_low_signal";
  if(rejectHost || rejectTokenHits.length || lowRouteHits.length) classification = "rejected_noise_or_non_official";
  else if(officialHostOrTitle && routeEvidence && countryOrNameContext && score >= 125) classification = "strict_official_route_candidate_requires_controlled_fetch_probe";
  else if(officialHostOrTitle && countryOrNameContext && score >= 105) classification = "strict_official_domain_candidate_requires_route_probe";
  else if(officialHostOrTitle && score >= 85) classification = "strict_review_weak_official_candidate";

  return { classification, score, routeHits, officialHits, countryHits, nameHits, rejectTokenHits, lowRouteHits, rejectHost, footballContext };
}

const resultFiles = listFiles(path.join(rawDir,"search-batches")).filter(p => /autonomous-search-results-batch-\d+\.json$/.test(p));
const rawRows = [];
for(const f of resultFiles){
  const j = readJson(f);
  walkResults(j, f, rawRows);
}
walkResults(wave, wavePath, rawRows);

const seen = new Set();
const searchRows = [];
for(const r of rawRows){
  if(!r.competitionSlug) continue;
  const key = `${r.competitionSlug}|${r.url}|${r.title}|${r.snippet}`.toLowerCase();
  if(!seen.has(key)){ seen.add(key); searchRows.push(r); }
}
const classifiedRows = searchRows.map(r => ({...r, ...classifyStrict(r)}));

const bestBySlug = new Map();
const rank = s => s === "strict_official_route_candidate_requires_controlled_fetch_probe" ? 4 : s === "strict_official_domain_candidate_requires_route_probe" ? 3 : s === "strict_review_weak_official_candidate" ? 2 : s === "rejected_low_signal" ? 1 : 0;
for(const r of classifiedRows){
  const prev = bestBySlug.get(r.competitionSlug);
  const s = rank(r.classification) * 100000 + r.score;
  const ps = prev ? rank(prev.classification) * 100000 + prev.score : -999999;
  if(!prev || s > ps) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));

const retryBatchNumbers = [];
for(let i=21;i<=32;i++) retryBatchNumbers.push(i);
const targetFiles = listFiles(path.join(rawDir,"search-batch-targets")).filter(p => /autonomous-search-targets-(?:provider-)?batch-\d+\.json$/.test(p));
const retryRows = [];
for(const f of targetFiles){
  const n = batchNumber(f);
  if(!retryBatchNumbers.includes(n)) continue;
  const j = readJson(f);
  const rows = [];
  walkTargets(j, rows);
  for(const r of rows) retryRows.push({...r, retrySourceBatchNumber:n});
}
const retrySeen = new Set();
const retryUnique = [];
for(const r of retryRows){
  const key = `${r.competitionSlug}|${r.query || r.q || r.searchQuery}|${r.retrySourceBatchNumber}`;
  if(!retrySeen.has(key)){ retrySeen.add(key); retryUnique.push(r); }
}
const retryPayload = {
  generatedAtUtc:new Date().toISOString(),
  status:retryUnique.length > 0 ? "passed" : "blocked_retry_target_rows_not_found",
  sourceWavePath:wavePath,
  summary:{
    retryBatchCount:retryBatchNumbers.length,
    retryTargetCount:retryUnique.length,
    retryBatchNumbers,
    searchExecutedNowCount:0,
    fetchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0
  },
  targets:retryUnique,
  searchTargets:retryUnique,
  rows:retryUnique,
  policy:{ searchOnlyRetry:true, requiresExplicitAllowSearch:true, noFetch:true, noCanonicalCandidateWrite:true, noProductionTruth:true }
};
writeJson(retryTargetsPath, retryPayload);

const strictRouteRows = bestRows.filter(r => r.classification === "strict_official_route_candidate_requires_controlled_fetch_probe");
const strictDomainRows = bestRows.filter(r => r.classification === "strict_official_domain_candidate_requires_route_probe");
const weakRows = bestRows.filter(r => r.classification === "strict_review_weak_official_candidate");

const summary = {
  status:"passed",
  sourceSearchHealthStatus:wave.summary?.searchHealth?.status || null,
  sourceSearchProviderBulkStateTrusted:Boolean(wave.summary?.searchHealth?.searchProviderBulkStateTrusted),
  extractedUniqueSearchRowCount:searchRows.length,
  classifiedRowCount:classifiedRows.length,
  bestCompetitionCount:bestRows.length,
  bestRowsByClassification:Object.entries(bestRows.reduce((a,r)=>{ a[r.classification]=(a[r.classification]||0)+1; return a; },{})).map(([classification,count])=>({classification,count})),
  allRowsByClassification:Object.entries(classifiedRows.reduce((a,r)=>{ a[r.classification]=(a[r.classification]||0)+1; return a; },{})).map(([classification,count])=>({classification,count})),
  strictRouteFetchProbeCandidateSlugCount:strictRouteRows.length,
  strictDomainRouteProbeCandidateSlugCount:strictDomainRows.length,
  strictWeakReviewCandidateSlugCount:weakRows.length,
  retryBatchCount:retryBatchNumbers.length,
  retryTargetCount:retryUnique.length,
  retryBatchNumbers,
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
  sourceWavePath:wavePath,
  sourceTargetsPath:targetsPath,
  retryTargetsPath,
  summary,
  classifiedRows,
  bestRows,
  strictFetchProbePreviewRows:[...strictRouteRows, ...strictDomainRows].slice(0,120),
  retryPayload,
  policy:{
    localStrictClassificationOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    rejectsAggregatorsTourismGovernmentGenericAndNonFootball:true,
    absenceNotTrustedBecauseSearchHealthUntrusted:true,
    nextAllowedAction:"retry_lost_batches_before_any_absence_claim_or_run_controlled_fetch_probe_only_for_strict_candidates"
  }
};
writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
