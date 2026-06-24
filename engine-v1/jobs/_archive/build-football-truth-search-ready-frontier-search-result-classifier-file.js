import fs from "node:fs";
import path from "node:path";

const wavePath = "data/football-truth/_diagnostics/search-ready-frontier-official-search-wave-2026-06-17/search-ready-frontier-official-search-wave-2026-06-17.json";
const targetsPath = "data/football-truth/_diagnostics/search-ready-frontier-official-search-wave-2026-06-17/search-ready-frontier-official-search-runner-targets-2026-06-17.json";
const rawDir = "data/football-truth/_diagnostics/search-ready-frontier-official-search-wave-2026-06-17/raw-search-batches";
const outPath = "data/football-truth/_diagnostics/search-ready-frontier-search-result-classifier-2026-06-17/search-ready-frontier-search-result-classifier-2026-06-17.json";
const retryTargetsPath = "data/football-truth/_diagnostics/search-ready-frontier-search-result-classifier-2026-06-17/search-ready-frontier-retry-targets-for-lost-batches-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function listFiles(dir){ return fs.existsSync(dir) ? fs.readdirSync(dir,{withFileTypes:true}).flatMap(e => e.isDirectory() ? listFiles(path.join(dir,e.name)) : [path.join(dir,e.name)]) : []; }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function uniq(a){ return [...new Set(a.filter(Boolean))]; }
function includesAny(s, arr){ const t=String(s||"").toLowerCase(); return arr.filter(x => t.includes(String(x).toLowerCase())); }
function slugPrefix(slug){ return String(slug||"").split(".")[0]; }

const wave = readJson(wavePath);
const targetsPayload = readJson(targetsPath);
const targetRows = targetsPayload.targets || targetsPayload.searchTargets || targetsPayload.rows || [];
const targetById = new Map();
const targetByQuery = new Map();
for(const t of targetRows){
  for(const k of [t.targetId,t.id].filter(Boolean)) targetById.set(String(k), t);
  if(t.query) targetByQuery.set(clean(t.query).toLowerCase(), t);
  if(t.q) targetByQuery.set(clean(t.q).toLowerCase(), t);
  if(t.searchQuery) targetByQuery.set(clean(t.searchQuery).toLowerCase(), t);
}

const noiseHosts = [
  "soccerway.com","flashscore.com","sofascore.com","livesport.com","futbol24.com","worldfootball.net",
  "transfermarkt.com","besoccer.com","aiscore.com","footystats.org","365scores.com","espn.com",
  "wikipedia.org","wikidata.org","facebook.com","x.com","twitter.com","instagram.com","youtube.com",
  "tiktok.com","linkedin.com","play.google.com","apps.apple.com","scorebar.com","soccer24.com",
  "oddsportal.com","betexplorer.com","the-sports.org","globalsportsarchive.com","int.soccerway.com"
];
const routeTokens = ["standings","standing","table","tables","league-table","classification","classement","classifica","classificacao","classificação","posiciones","tabla","rankings","ranking","ladder"];
const officialTokens = ["official","federation","association","league","football federation","football association","fa "," f.a.","lfp","premier league","first division","superliga"];
const lowValuePathTokens = ["news","video","gallery","shop","tickets","privacy","login","register","media","sponsor","academy","women"];

function getField(o, names){
  for(const n of names){
    if(o && Object.prototype.hasOwnProperty.call(o,n) && typeof o[n] === "string" && clean(o[n])) return clean(o[n]);
  }
  return "";
}
function normalizeSearchRow(o, sourceFile){
  if(!o || typeof o !== "object") return null;
  const url = getField(o, ["url","link","href","resultUrl","targetUrl","displayUrl","sourceUrl"]);
  if(!url || !/^https?:\/\//i.test(url)) return null;

  let target = null;
  const possibleIds = [o.targetId,o.id,o.searchTargetId,o.sourceTargetId,o.searchTarget?.targetId,o.target?.targetId,o.searchTarget?.id,o.target?.id].filter(Boolean);
  for(const id of possibleIds){
    if(targetById.has(String(id))){ target = targetById.get(String(id)); break; }
  }
  const q = getField(o, ["query","q","searchQuery"]) || getField(o.searchTarget || {}, ["query","q","searchQuery"]) || getField(o.target || {}, ["query","q","searchQuery"]);
  if(!target && q) target = targetByQuery.get(clean(q).toLowerCase()) || null;

  const competitionSlug = clean(o.competitionSlug || o.searchTarget?.competitionSlug || o.target?.competitionSlug || target?.competitionSlug);
  const competitionName = clean(o.competitionName || o.searchTarget?.competitionName || o.target?.competitionName || target?.competitionName);
  const country = clean(o.country || o.searchTarget?.country || o.target?.country || target?.country);

  return {
    competitionSlug,
    competitionName,
    country,
    query: q || clean(target?.query || target?.q || target?.searchQuery),
    targetId: clean(possibleIds[0] || target?.targetId || target?.id),
    title: getField(o, ["title","name","heading"]),
    snippet: getField(o, ["snippet","description","content","text","summary"]),
    url,
    host: hostOf(url),
    sourceFile
  };
}
function walkRows(x, sourceFile, rows, depth=0){
  if(depth > 8 || !x) return;
  if(Array.isArray(x)){
    for(const item of x) walkRows(item, sourceFile, rows, depth+1);
    return;
  }
  if(typeof x === "object"){
    const r = normalizeSearchRow(x, sourceFile);
    if(r) rows.push(r);
    for(const v of Object.values(x).slice(0,120)) if(v && typeof v === "object") walkRows(v, sourceFile, rows, depth+1);
  }
}

const resultFiles = listFiles(path.join(rawDir,"search-batches")).filter(p => /autonomous-search-results-batch-\d+\.json$/.test(p));
const searchRowsRaw = [];
for(const f of resultFiles){
  const j = readJson(f);
  walkRows(j, f, searchRowsRaw);
}
walkRows(wave, wavePath, searchRowsRaw);

const seen = new Set();
const searchRows = [];
for(const r of searchRowsRaw){
  const key = `${r.competitionSlug}|${r.url}|${r.title}|${r.snippet}`.toLowerCase();
  if(!seen.has(key)){
    seen.add(key);
    searchRows.push(r);
  }
}

function classify(r){
  const host = r.host;
  const u = String(r.url || "");
  const p = pathOf(u);
  const text = `${r.title} ${r.snippet} ${r.url} ${r.query}`.toLowerCase();
  const hostNoise = noiseHosts.some(h => host === h || host.endsWith("." + h));
  const routeHits = uniq([...includesAny(u, routeTokens), ...includesAny(text, routeTokens)]);
  const officialHits = uniq([...includesAny(text, officialTokens), ...includesAny(host, officialTokens)]);
  const lowPathHits = includesAny(p, lowValuePathTokens);

  const countryTerms = clean(r.country).toLowerCase().split(/[ _-]+/).filter(x => x.length >= 4);
  const nameTerms = clean(r.competitionName).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x => x.length >= 4 && !["league","division","football","official","standings","table"].includes(x));
  const countryHits = countryTerms.filter(t => text.includes(t) || host.includes(t));
  const nameHits = nameTerms.filter(t => text.includes(t) || host.includes(t));
  const slugHostHit = slugPrefix(r.competitionSlug) && host.includes(slugPrefix(r.competitionSlug));

  let score = 0;
  if(hostNoise) score -= 200;
  score += routeHits.length * 35;
  score += officialHits.length * 30;
  score += countryHits.length * 12;
  score += nameHits.length * 14;
  if(slugHostHit) score += 10;
  if(/\b(federation|association|league|liga|football|soccer)\b/i.test(host)) score += 18;
  if(/\.(org|com|net|co|com\.[a-z]{2}|org\.[a-z]{2})$/i.test(host)) score += 4;
  if(lowPathHits.length) score -= 45;
  if(/standings|table|classification|classement|tabla|posiciones/i.test(p)) score += 35;
  if(/fixture|fixtures|result|results|match|matches|schedule/i.test(p) && !routeHits.length) score -= 15;

  let classification = "rejected_low_signal";
  if(hostNoise) classification = "rejected_aggregator_or_noise";
  else if(score >= 95 && routeHits.length) classification = "official_route_candidate_strong_requires_controlled_fetch_probe";
  else if(score >= 75) classification = "official_domain_candidate_requires_route_probe";
  else if(score >= 50) classification = "review_weak_official_candidate";

  return { classification, score, routeHits, officialHits, countryHits, nameHits, lowPathHits, hostNoise };
}

const classifiedRows = searchRows.map(r => ({...r, ...classify(r)}));

const bestBySlug = new Map();
for(const r of classifiedRows){
  if(!r.competitionSlug) continue;
  const prev = bestBySlug.get(r.competitionSlug);
  const statusRank = s => s === "official_route_candidate_strong_requires_controlled_fetch_probe" ? 4 : s === "official_domain_candidate_requires_route_probe" ? 3 : s === "review_weak_official_candidate" ? 2 : s === "rejected_low_signal" ? 1 : 0;
  const score = statusRank(r.classification) * 100000 + r.score;
  const prevScore = prev ? statusRank(prev.classification) * 100000 + prev.score : -1;
  if(!prev || score > prevScore) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const strongRows = bestRows.filter(r => r.classification === "official_route_candidate_strong_requires_controlled_fetch_probe");
const domainRows = bestRows.filter(r => r.classification === "official_domain_candidate_requires_route_probe");
const weakRows = bestRows.filter(r => r.classification === "review_weak_official_candidate");

function batchNumberFromPath(p){
  const m = String(p).match(/batch-(\d+)\.json$/);
  return m ? Number(m[1]) : null;
}
const batchResultCounts = new Map();
for(const f of resultFiles){
  const num = batchNumberFromPath(f);
  if(num == null) continue;
  const j = readJson(f);
  const rows = [];
  walkRows(j, f, rows);
  batchResultCounts.set(num, rows.length);
}
const batchTargetFiles = listFiles(path.join(rawDir,"search-batch-targets")).filter(p => /autonomous-search-targets-batch-\d+\.json$/.test(p));
const retryBatchNumbers = [];
for(let i=1;i<=32;i++){
  const resultCount = batchResultCounts.get(i);
  if(i >= 21 || resultCount == null || resultCount === 0) retryBatchNumbers.push(i);
}
const retryTargetRows = [];
for(const f of batchTargetFiles){
  const n = batchNumberFromPath(f);
  if(!retryBatchNumbers.includes(n)) continue;
  const j = readJson(f);
  const rows = j.targets || j.searchTargets || j.rows || [];
  for(const r of rows) retryTargetRows.push({...r, retrySourceBatchNumber:n});
}
const retryPayload = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  sourceWavePath:wavePath,
  reason:"retry lost/untrusted batches after timeout and zero-row tail",
  summary:{
    retryBatchCount:retryBatchNumbers.length,
    retryTargetCount:retryTargetRows.length,
    retryBatchNumbers,
    searchExecutedNowCount:0,
    fetchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0
  },
  targets:retryTargetRows,
  searchTargets:retryTargetRows,
  rows:retryTargetRows,
  policy:{ searchOnlyRetry:true, requiresExplicitAllowSearch:true, noFetch:true, noCanonicalCandidateWrite:true, noProductionTruth:true }
};
writeJson(retryTargetsPath, retryPayload);

const fetchProbePreviewRows = [...strongRows, ...domainRows].slice(0,120).map((r,i)=>({
  priority:i+1,
  competitionSlug:r.competitionSlug,
  competitionName:r.competitionName,
  country:r.country,
  sourceSearchUrl:r.url,
  sourceSearchHost:r.host,
  sourceSearchTitle:r.title,
  sourceSearchSnippet:r.snippet,
  sourceClassification:r.classification,
  sourceScore:r.score,
  fetchAllowedOnlyWithExplicitApproval:false,
  canonicalWriteAllowedNow:false,
  productionTruthAllowedNow:false
}));

const summary = {
  status:"passed",
  sourceSearchHealthStatus:wave.summary?.searchHealth?.status || null,
  sourceSearchProviderBulkStateTrusted:Boolean(wave.summary?.searchHealth?.searchProviderBulkStateTrusted),
  sourceSearchResultRowCount:wave.summary?.searchResultRowCount ?? null,
  extractedUniqueSearchRowCount:searchRows.length,
  classifiedRowCount:classifiedRows.length,
  bestCompetitionCount:bestRows.length,
  bestRowsByClassification:Object.entries(bestRows.reduce((a,r)=>{ a[r.classification]=(a[r.classification]||0)+1; return a; },{})).map(([classification,count])=>({classification,count})),
  allRowsByClassification:Object.entries(classifiedRows.reduce((a,r)=>{ a[r.classification]=(a[r.classification]||0)+1; return a; },{})).map(([classification,count])=>({classification,count})),
  strongFetchProbeCandidateSlugCount:strongRows.length,
  domainRouteProbeCandidateSlugCount:domainRows.length,
  weakReviewCandidateSlugCount:weakRows.length,
  fetchProbePreviewCount:fetchProbePreviewRows.length,
  retryBatchCount:retryBatchNumbers.length,
  retryTargetCount:retryTargetRows.length,
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
  fetchProbePreviewRows,
  retryPayload,
  policy:{
    localClassificationOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    absenceNotTrustedBecauseSearchHealthUntrusted:true,
    nextAllowedAction:"retry_lost_batches_or_run_controlled_fetch_probe_for_strong_candidates"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
