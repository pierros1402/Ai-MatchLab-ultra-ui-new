import fs from "node:fs";
import path from "node:path";

const targetPath = "data/football-truth/_diagnostics/exact-value-market-search-pack-2026-06-17/exact-value-market-search-targets-2026-06-17.json";
const searchPath = "data/football-truth/_diagnostics/exact-value-market-search-pack-2026-06-17/exact-value-market-search-wave-2026-06-17.json";
const rawDir = "data/football-truth/_diagnostics/exact-value-market-search-pack-2026-06-17/raw-search-batches";
const outPath = "data/football-truth/_diagnostics/exact-value-market-search-pack-2026-06-17/exact-value-market-search-classifier-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function listFiles(dir,out=[]){ if(!fs.existsSync(dir)) return out; for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) listFiles(p,out); else out.push(p); } return out; }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function getField(o,names){ for(const n of names){ if(o && Object.prototype.hasOwnProperty.call(o,n) && typeof o[n]==="string" && clean(o[n])) return clean(o[n]); } return ""; }
function terms(s){ return clean(s).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x=>x.length>=3 && !["league","division","football","soccer","official","standings","table","premier","first","super","results","fixtures","federation"].includes(x)); }

const targetPayload = readJson(targetPath);
const searchPayload = readJson(searchPath);
const byQuery = new Map();
for(const t of targetPayload.rows || []) byQuery.set(clean(t.query).toLowerCase(), t);

function normalize(o, sourceFile){
  if(!o || typeof o !== "object") return null;
  const url = getField(o,["url","link","href","resultUrl","targetUrl","displayUrl","sourceUrl"]);
  if(!/^https?:\/\//i.test(url)) return null;
  const q = getField(o,["query","q","searchQuery"]) || getField(o.searchTarget||{},["query","q","searchQuery"]) || getField(o.target||{},["query","q","searchQuery"]);
  const t = q ? byQuery.get(clean(q).toLowerCase()) : null;
  return {
    competitionSlug:clean(o.competitionSlug || o.searchTarget?.competitionSlug || o.target?.competitionSlug || t?.competitionSlug),
    competitionName:clean(o.competitionName || o.searchTarget?.competitionName || o.target?.competitionName || t?.competitionName),
    country:clean(o.country || o.searchTarget?.country || o.target?.country || t?.country),
    marketTier:clean(o.marketTier || o.searchTarget?.marketTier || o.target?.marketTier || t?.marketTier),
    query:q,
    title:getField(o,["title","name","heading"]),
    snippet:getField(o,["snippet","description","content","text","summary"]),
    url,
    host:hostOf(url),
    path:pathOf(url),
    sourceFile
  };
}
function walk(x, sourceFile, rows, depth=0){
  if(!x || depth>8) return;
  if(Array.isArray(x)){ for(const v of x) walk(v,sourceFile,rows,depth+1); return; }
  if(typeof x === "object"){
    const r=normalize(x,sourceFile);
    if(r && r.competitionSlug) rows.push(r);
    for(const v of Object.values(x).slice(0,140)) if(v && typeof v==="object") walk(v,sourceFile,rows,depth+1);
  }
}

const rawRows=[];
for(const f of listFiles(path.join(rawDir,"search-batches")).filter(p=>/autonomous-search-results-batch-\d+\.json$/.test(p))){
  walk(readJson(f),f,rawRows);
}
const seen = new Set();
const rows = [];
for(const r of rawRows){
  const key = `${r.competitionSlug}|${r.url}|${r.title}|${r.snippet}`.toLowerCase();
  if(!seen.has(key)){ seen.add(key); rows.push(r); }
}

const rejectHosts = ["wikipedia.org","rsssf.org","soccerway.com","flashscore.com","sofascore.com","transfermarkt.com","worldfootball.net","facebook.com","instagram.com","x.com","twitter.com","youtube.com","linkedin.com","google.com","microsoft.com","britannica.com","tripadvisor.com","worldatlas.com","livesport.com"];
const routeRe = /(standings|standing|league-table|league table|table|classification|classement|classifica|classificacao|classificação|posiciones|tabla|rankings?|ladder|fixtures-results|results)/i;
const officialRe = /(official|football association|football federation|soccer association|soccer federation|super league|prvaliga|hnl|faf|affa|bfs|bff|hns|hff|kfsi|fa|federation|association)/i;

function classify(r){
  const evidence = `${r.title} ${r.snippet} ${r.url} ${r.host}`.toLowerCase();
  const nameHits = terms(r.competitionName).filter(t=>evidence.includes(t) || r.host.includes(t));
  const countryHits = terms(r.country).filter(t=>evidence.includes(t) || r.host.includes(t));
  const routeHit = routeRe.test(r.path) || routeRe.test(r.url) || routeRe.test(r.title || "");
  const officialHit = officialRe.test(`${r.title} ${r.snippet} ${r.host}`);
  const reject = rejectHosts.some(h=>r.host===h || r.host.endsWith("." + h)) || /tourism|travel|wiki|britannica|transfermarkt|rsssf|soccerway|flashscore|sofascore|facebook|youtube|linkedin|livesport/i.test(evidence);
  let score = 0;
  score += nameHits.length * 35;
  score += countryHits.length * 15;
  if(routeHit) score += 80;
  if(officialHit) score += 50;
  if(r.marketTier === "A") score += 10;
  if(reject) score -= 500;
  let status = "rejected_exact_value_no_official_route_signal";
  if(reject) status = "rejected_exact_value_noise";
  else if(routeHit && officialHit && nameHits.length >= 1 && score >= 125) status = "exact_value_route_candidate_requires_controlled_fetch_probe";
  else if(officialHit && nameHits.length >= 1 && score >= 90) status = "exact_value_domain_candidate_requires_route_probe";
  else if(nameHits.length >= 1 && score >= 75) status = "exact_value_review_league_context_without_route";
  return {...r, precisionScore:score, precisionStatus:status, routeHit, officialHit, nameHits, countryHits, reject};
}

const classified = rows.map(classify);
const rank = s => s==="exact_value_route_candidate_requires_controlled_fetch_probe"?4:s==="exact_value_domain_candidate_requires_route_probe"?3:s==="exact_value_review_league_context_without_route"?2:0;
const bestBySlug = new Map();
for(const r of classified){
  const prev = bestBySlug.get(r.competitionSlug);
  const s = rank(r.precisionStatus)*100000 + r.precisionScore;
  const ps = prev ? rank(prev.precisionStatus)*100000 + prev.precisionScore : -999999;
  if(!prev || s > ps) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));
const routeRows = bestRows.filter(r=>r.precisionStatus==="exact_value_route_candidate_requires_controlled_fetch_probe");
const domainRows = bestRows.filter(r=>r.precisionStatus==="exact_value_domain_candidate_requires_route_probe");
const reviewRows = bestRows.filter(r=>r.precisionStatus==="exact_value_review_league_context_without_route");

const summary = {
  status:"passed",
  sourceSearchHealthStatus:searchPayload.summary?.searchHealth?.status || null,
  targetCompetitionCount:(targetPayload.valueMarketTargets||[]).length,
  targetQueryCount:(targetPayload.rows||[]).length,
  sourceSearchResultRowCount:searchPayload.summary?.searchResultRowCount ?? null,
  extractedUniqueSearchRowCount:rows.length,
  bestCompetitionCount:bestRows.length,
  routeCandidateSlugCount:routeRows.length,
  domainCandidateSlugCount:domainRows.length,
  reviewCandidateSlugCount:reviewRows.length,
  bestRowsByPrecisionStatus:Object.entries(bestRows.reduce((a,r)=>{a[r.precisionStatus]=(a[r.precisionStatus]||0)+1; return a;},{})).map(([status,count])=>({status,count})),
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

writeJson(outPath,{
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  bestRows,
  routeCandidateRows:routeRows,
  domainCandidateRows:domainRows,
  reviewRows,
  policy:{
    localClassificationOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    queryTextNotUsedAsEvidence:true,
    nextAllowedAction:"controlled_fetch_probe_only_if_route_or_domain_candidates_exist_else_park_lane"
  }
});
console.log(JSON.stringify(summary,null,2));
