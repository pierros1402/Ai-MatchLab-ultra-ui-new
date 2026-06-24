import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/high-yield-partial-search-classifier-2026-06-17/high-yield-partial-search-classifier-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/high-yield-partial-precision-review-2026-06-17/high-yield-partial-precision-review-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function terms(s){ return clean(s).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x => x.length >= 4 && !["league","division","football","soccer","official","standings","table","premier","first","second","national","super"].includes(x)); }
function walkRows(x, rows, depth=0){
  if(!x || depth > 8) return;
  if(Array.isArray(x)){ for(const v of x) walkRows(v, rows, depth+1); return; }
  if(typeof x === "object"){
    if(x.url && x.competitionSlug && x.title !== undefined) rows.push(x);
    for(const v of Object.values(x).slice(0,140)) if(v && typeof v === "object") walkRows(v, rows, depth+1);
  }
}
const input = readJson(inputPath);
const all = [];
walkRows(input.bestRows || [], all);
walkRows(input.routeCandidateRows || [], all);
walkRows(input.domainCandidateRows || [], all);
walkRows(input.reviewRows || [], all);

const seen = new Set();
const rows = [];
for(const r of all){
  const key = `${r.competitionSlug}|${r.url}|${r.title}|${r.snippet}`.toLowerCase();
  if(!seen.has(key)){ seen.add(key); rows.push(r); }
}

const rejectHosts = ["wikipedia.org","rsssf.org","soccerway.com","flashscore.com","sofascore.com","transfermarkt.com","worldfootball.net","facebook.com","instagram.com","x.com","twitter.com","youtube.com","linkedin.com","google.com","microsoft.com","britannica.com","tripadvisor.com","worldatlas.com"];
const routeRe = /(standings|standing|league-table|league table|table|classification|classement|classifica|classificacao|classificação|posiciones|tabla|rankings?|ladder)/i;
const officialRe = /(official|football association|football federation|soccer association|soccer federation|league|liga|ligue|federation|association)/i;

function score(r){
  const url = r.url || "";
  const host = r.host || hostOf(url);
  const p = pathOf(url);
  const text = `${r.title || ""} ${r.snippet || ""} ${url} ${host}`.toLowerCase();
  const leagueTerms = terms(r.competitionName);
  const countryTerms = terms(r.country);
  const leagueHits = leagueTerms.filter(t => text.includes(t) || host.includes(t));
  const countryHits = countryTerms.filter(t => text.includes(t) || host.includes(t));
  const routeHit = routeRe.test(p) || routeRe.test(url) || routeRe.test(r.title || "");
  const officialHit = officialRe.test(`${r.title || ""} ${r.snippet || ""} ${host}`);
  const reject = rejectHosts.some(h => host === h || host.endsWith("." + h));

  let s = 0;
  s += leagueHits.length * 35;
  s += countryHits.length * 15;
  if(routeHit) s += 80;
  if(officialHit) s += 35;
  if(/\.(org|com|net|football|sport|league|football)$/i.test(host)) s += 5;
  if(reject) s -= 500;
  if(/tourism|travel|hotel|wiki|britannica|transfermarkt|rsssf|soccerway|flashscore|sofascore|facebook|youtube|linkedin/i.test(text)) s -= 250;

  let status = "precision_rejected";
  if(!reject && routeHit && leagueHits.length >= 2 && s >= 145) status = "precision_route_candidate_requires_controlled_fetch_probe";
  else if(!reject && officialHit && leagueHits.length >= 2 && s >= 115) status = "precision_domain_candidate_requires_route_probe";
  else if(!reject && leagueHits.length >= 2 && s >= 85) status = "precision_review_league_context_without_route";

  return { precisionScore:s, precisionStatus:status, host, routeHit, officialHit, leagueHits, countryHits, reject };
}

const scored = rows.map(r => ({...r, ...score(r)}));
const rank = s => s === "precision_route_candidate_requires_controlled_fetch_probe" ? 4 : s === "precision_domain_candidate_requires_route_probe" ? 3 : s === "precision_review_league_context_without_route" ? 2 : 0;
const bestBySlug = new Map();
for(const r of scored){
  const prev = bestBySlug.get(r.competitionSlug);
  const ss = rank(r.precisionStatus)*100000 + r.precisionScore;
  const ps = prev ? rank(prev.precisionStatus)*100000 + prev.precisionScore : -999999;
  if(!prev || ss > ps) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));
const routeRows = bestRows.filter(r=>r.precisionStatus==="precision_route_candidate_requires_controlled_fetch_probe");
const domainRows = bestRows.filter(r=>r.precisionStatus==="precision_domain_candidate_requires_route_probe");
const reviewRows = bestRows.filter(r=>r.precisionStatus==="precision_review_league_context_without_route");

const summary = {
  status:"passed",
  sourceInputPath:inputPath,
  inputBestRowsReviewed:rows.length,
  bestCompetitionCount:bestRows.length,
  routeCandidateSlugCount:routeRows.length,
  domainCandidateSlugCount:domainRows.length,
  reviewCandidateSlugCount:reviewRows.length,
  bestRowsByPrecisionStatus:Object.entries(bestRows.reduce((a,r)=>{ a[r.precisionStatus]=(a[r.precisionStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
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
  routeCandidateRows:routeRows,
  domainCandidateRows:domainRows,
  reviewRows,
  bestRows,
  policy:{
    localReviewOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    queryTextNotUsedAsEvidence:true,
    nextAllowedAction:"controlled_fetch_probe_only_if_route_or_domain_candidates_exist_else_park_lane"
  }
});
console.log(JSON.stringify(summary,null,2));
