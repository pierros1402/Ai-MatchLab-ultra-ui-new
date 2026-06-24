import fs from "node:fs";
import path from "node:path";

const targetPath = "data/football-truth/_diagnostics/exact-value-market-search-pack-2026-06-17/exact-value-market-search-targets-2026-06-17.json";
const searchPath = "data/football-truth/_diagnostics/exact-value-market-search-pack-2026-06-17/exact-value-market-search-wave-2026-06-17.json";
const rawDir = "data/football-truth/_diagnostics/exact-value-market-search-pack-2026-06-17/raw-search-batches";
const outPath = "data/football-truth/_diagnostics/exact-value-market-strict-reclassifier-2026-06-17/exact-value-market-strict-reclassifier-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function listFiles(dir,out=[]){ if(!fs.existsSync(dir)) return out; for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) listFiles(p,out); else out.push(p); } return out; }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function getField(o,names){ for(const n of names){ if(o && Object.prototype.hasOwnProperty.call(o,n) && typeof o[n]==="string" && clean(o[n])) return clean(o[n]); } return ""; }
function terms(s){ return clean(s).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x=>x.length>=3 && !["league","division","football","soccer","official","standings","table","premier","first","super","results","fixtures","federation","association"].includes(x)); }

const targets = readJson(targetPath);
const search = readJson(searchPath);
const targetByQuery = new Map();
for(const t of targets.rows || []) targetByQuery.set(clean(t.query).toLowerCase(), t);

function normalize(o, sourceFile){
  if(!o || typeof o !== "object") return null;
  const url = getField(o,["url","link","href","resultUrl","targetUrl","displayUrl","sourceUrl"]);
  if(!/^https?:\/\//i.test(url)) return null;
  const q = getField(o,["query","q","searchQuery"]) || getField(o.searchTarget||{},["query","q","searchQuery"]) || getField(o.target||{},["query","q","searchQuery"]);
  const t = q ? targetByQuery.get(clean(q).toLowerCase()) : null;
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

const hardRejectHostExact = new Set([
  "omniglot.com","bbc.com","geocountries.com","nationsonline.org","indianmotorcycle.com","ljubljana.info","touropia.com",
  "wikipedia.org","wikidata.org","britannica.com","worldatlas.com","tripadvisor.com","lonelyplanet.com","culturetrip.com",
  "rsssf.org","soccerway.com","flashscore.com","sofascore.com","livesport.com","transfermarkt.com","worldfootball.net",
  "facebook.com","instagram.com","x.com","twitter.com","youtube.com","linkedin.com","google.com","microsoft.com"
]);
const hardRejectText = /(language|alphabet|writing|tourism|travel|places to visit|country profile|news|motorcycle|learnenglish|britishcouncil|wiki|encyclopedia|geography|population|capital city|weather|hotel|trip|culture|history of|dictionary|translation)/i;

const footballHostRe = /(^|[.-])(fa|fafa|fshf|faf|affa|bfunion|bfs|bff|hns|hff|kfsi|ksi|aiff|the-aiff|tff|pfl|prvaliga|superleague|super-league|slgr|hnl|league|liga|futbol|football|soccer|federation|association)([.-]|$)/i;
const footballEvidenceRe = /(football association|football federation|soccer federation|soccer association|official website|league table|standings|fixtures|results|clubs|teams|premier league|super league|prvaliga|hnl|besta deild|indian super league|thai league|uzbekistan super league|cypriot first division|bulgarian first league|albanian superliga|azerbaijan premier league|algerian ligue professionnelle)/i;
const routeRe = /(standings|standing|league-table|league table|classification|classement|classifica|classificacao|classificação|posiciones|tabla|rankings?|ladder|fixtures-results|results|competition|table)/i;

function classify(r){
  const evidence = `${r.title} ${r.snippet} ${r.url} ${r.host}`.toLowerCase();
  const nameHits = terms(r.competitionName).filter(t => evidence.includes(t) || r.host.includes(t));
  const countryHits = terms(r.country).filter(t => evidence.includes(t) || r.host.includes(t));
  const hostOfficial = footballHostRe.test(r.host);
  const footballEvidence = footballEvidenceRe.test(`${r.title} ${r.snippet} ${r.url}`);
  const routeHit = routeRe.test(r.path) || routeRe.test(r.url) || routeRe.test(r.title || "");
  const hardReject = hardRejectHostExact.has(r.host) || hardRejectText.test(evidence);

  let score = 0;
  if(hostOfficial) score += 90;
  if(footballEvidence) score += 70;
  if(routeHit) score += 65;
  score += Math.min(nameHits.length,3) * 25;
  score += Math.min(countryHits.length,2) * 10;
  if(r.marketTier === "A") score += 10;
  if(hardReject) score -= 700;

  let status = "strict_rejected_no_official_football_route_signal";
  if(hardReject) status = "strict_rejected_noise_non_football_domain";
  else if(hostOfficial && footballEvidence && routeHit && score >= 160) status = "strict_route_candidate_requires_controlled_fetch_probe";
  else if(hostOfficial && footballEvidence && score >= 130) status = "strict_domain_candidate_requires_route_probe";
  else if((hostOfficial || footballEvidence) && nameHits.length >= 1 && score >= 115) status = "strict_review_football_signal_without_route";

  return {...r, strictScore:score, strictStatus:status, hostOfficial, footballEvidence, routeHit, nameHits, countryHits, hardReject};
}

const classified = rows.map(classify);
const rank = s => s==="strict_route_candidate_requires_controlled_fetch_probe"?4:s==="strict_domain_candidate_requires_route_probe"?3:s==="strict_review_football_signal_without_route"?2:0;
const bestBySlug = new Map();
for(const r of classified){
  const prev = bestBySlug.get(r.competitionSlug);
  const s = rank(r.strictStatus)*100000 + r.strictScore;
  const ps = prev ? rank(prev.strictStatus)*100000 + prev.strictScore : -999999;
  if(!prev || s > ps) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));
const routeRows = bestRows.filter(r=>r.strictStatus==="strict_route_candidate_requires_controlled_fetch_probe");
const domainRows = bestRows.filter(r=>r.strictStatus==="strict_domain_candidate_requires_route_probe");
const reviewRows = bestRows.filter(r=>r.strictStatus==="strict_review_football_signal_without_route");
const rejectedNoiseRows = bestRows.filter(r=>r.strictStatus==="strict_rejected_noise_non_football_domain");

const summary = {
  status:"passed",
  sourceSearchHealthStatus:search.summary?.searchHealth?.status || null,
  targetCompetitionCount:(targets.valueMarketTargets||[]).length,
  targetQueryCount:(targets.rows||[]).length,
  sourceSearchResultRowCount:search.summary?.searchResultRowCount ?? null,
  extractedUniqueSearchRowCount:rows.length,
  bestCompetitionCount:bestRows.length,
  routeCandidateSlugCount:routeRows.length,
  domainCandidateSlugCount:domainRows.length,
  reviewCandidateSlugCount:reviewRows.length,
  rejectedNoiseBestRowCount:rejectedNoiseRows.length,
  bestRowsByStrictStatus:Object.entries(bestRows.reduce((a,r)=>{a[r.strictStatus]=(a[r.strictStatus]||0)+1; return a;},{})).map(([status,count])=>({status,count})),
  searchExecutedNowCount:0,
  fetchExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

writeJson(outPath,{
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  sourceTargetPath:targetPath,
  sourceSearchPath:searchPath,
  summary,
  bestRows,
  routeCandidateRows:routeRows,
  domainCandidateRows:domainRows,
  reviewRows,
  rejectedNoiseRows,
  policy:{
    localStrictReclassificationOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    queryTextNotUsedAsEvidence:true,
    hardRejectGenericCountryLanguageTourismNewsVehicleDomains:true,
    nextAllowedAction:"controlled_fetch_probe_only_if_strict_route_or_domain_candidates_exist_else_park_exact_value_search_lane"
  }
});
console.log(JSON.stringify(summary,null,2));
