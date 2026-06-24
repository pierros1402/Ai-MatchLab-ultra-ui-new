import fs from "node:fs";
import path from "node:path";

const targetPath = "data/football-truth/_diagnostics/high-yield-named-frontier-search-wave-2026-06-17/high-yield-named-frontier-search-targets-2026-06-17.json";
const wavePath = "data/football-truth/_diagnostics/high-yield-named-frontier-search-wave-2026-06-17/high-yield-named-frontier-search-wave-2026-06-17.json";
const rawDir = "data/football-truth/_diagnostics/high-yield-named-frontier-search-wave-2026-06-17/raw-search-batches";
const outPath = "data/football-truth/_diagnostics/high-yield-partial-search-classifier-2026-06-17/high-yield-partial-search-classifier-2026-06-17.json";
const retryTargetsPath = "data/football-truth/_diagnostics/high-yield-partial-search-classifier-2026-06-17/high-yield-named-frontier-retry-targets-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function listFiles(dir,out=[]){ if(!fs.existsSync(dir)) return out; for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) listFiles(p,out); else out.push(p); } return out; }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function uniq(a){ return [...new Set(a.filter(Boolean))]; }
function hits(s, arr){ const t=String(s||"").toLowerCase(); return uniq(arr.filter(x => t.includes(String(x).toLowerCase()))); }
function getField(o,names){ for(const n of names){ if(o && Object.prototype.hasOwnProperty.call(o,n) && typeof o[n]==="string" && clean(o[n])) return clean(o[n]); } return ""; }
function batchNumber(p){ const m=String(p).match(/(?:provider-)?batch-(\d+)\.json$/); return m ? Number(m[1]) : null; }

const targetsPayload = readJson(targetPath);
const wave = readJson(wavePath);
const targets = targetsPayload.targets || targetsPayload.searchTargets || targetsPayload.rows || [];
const targetById = new Map();
const targetByQuery = new Map();
for(const t of targets){
  for(const k of [t.targetId,t.id].filter(Boolean)) targetById.set(String(k), t);
  for(const q of [t.query,t.q,t.searchQuery].filter(Boolean)) targetByQuery.set(clean(q).toLowerCase(), t);
}

function normalizeResult(o, sourceFile){
  if(!o || typeof o !== "object") return null;
  const url = getField(o, ["url","link","href","resultUrl","targetUrl","displayUrl","sourceUrl"]);
  if(!/^https?:\/\//i.test(url)) return null;

  let target = null;
  const ids = [o.targetId,o.id,o.searchTargetId,o.sourceTargetId,o.searchTarget?.targetId,o.target?.targetId,o.searchTarget?.id,o.target?.id].filter(Boolean);
  for(const id of ids){ if(targetById.has(String(id))){ target = targetById.get(String(id)); break; } }
  const q = getField(o, ["query","q","searchQuery"]) || getField(o.searchTarget || {}, ["query","q","searchQuery"]) || getField(o.target || {}, ["query","q","searchQuery"]);
  if(!target && q) target = targetByQuery.get(clean(q).toLowerCase()) || null;

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
    sourceFile
  };
}
function walkResults(x, sourceFile, rows, depth=0){
  if(!x || depth > 8) return;
  if(Array.isArray(x)){ for(const v of x) walkResults(v,sourceFile,rows,depth+1); return; }
  if(typeof x === "object"){
    const r = normalizeResult(x, sourceFile);
    if(r) rows.push(r);
    for(const v of Object.values(x).slice(0,140)) if(v && typeof v === "object") walkResults(v,sourceFile,rows,depth+1);
  }
}
function looksLikeTarget(o){
  if(!o || typeof o !== "object") return false;
  const slug = clean(o.competitionSlug || o.slug || o.normalizedCompetitionSlug);
  const q = clean(o.query || o.q || o.searchQuery);
  return /^[a-z]{2,3}\.\d+$/.test(slug) && q.length > 3;
}
function walkTargets(x, rows, depth=0){
  if(!x || depth > 8) return;
  if(Array.isArray(x)){ for(const v of x) walkTargets(v,rows,depth+1); return; }
  if(typeof x === "object"){
    if(looksLikeTarget(x)) rows.push(x);
    for(const v of Object.values(x).slice(0,140)) if(v && typeof v === "object") walkTargets(v,rows,depth+1);
  }
}

const resultFiles = listFiles(path.join(rawDir,"search-batches")).filter(p => /autonomous-search-results-batch-\d+\.json$/.test(p));
const rawRows = [];
const resultCountByBatch = new Map();
for(const f of resultFiles){
  const rows = [];
  walkResults(readJson(f), f, rows);
  rawRows.push(...rows);
  const n = batchNumber(f);
  if(n != null) resultCountByBatch.set(n, rows.length);
}
const seen = new Set();
const resultRows = [];
for(const r of rawRows){
  if(!r.competitionSlug) continue;
  const key = `${r.competitionSlug}|${r.url}|${r.title}|${r.snippet}`.toLowerCase();
  if(!seen.has(key)){ seen.add(key); resultRows.push(r); }
}

const hardRejectHosts = [
  "rsssf.org","soccerway.com","flashscore.com","sofascore.com","livesport.com","futbol24.com","worldfootball.net","transfermarkt.com",
  "wikipedia.org","wikidata.org","britannica.com","tripadvisor.com","worldatlas.com","nationsonline.org","lonelyplanet.com",
  "google.com","mail.google.com","microsoft.com","support.microsoft.com","office.com","outlook.office.com","linkedin.com","whatsapp.com",
  "youtube.com","facebook.com","instagram.com","x.com","twitter.com","tiktok.com","petfinder.com","pluralsight.com","tenforums.com",
  "chromedino.com","howtogeek.com","autotrader.co.za","developer.android.com"
];
const hardRejectTextTokens = ["tourism","travel","hotel","culture","tripadvisor","britannica","wikipedia","wiki","worldatlas","google","microsoft","linkedin","whatsapp","youtube","facebook","instagram","tutorial","forum","petfinder","autotrader","humanitarian","lawyer","anwalt","template","chemical"];
const routeTokens = ["standings","standing","table","league table","league-table","classification","classement","classifica","classificacao","classificação","posiciones","tabla","ranking","rankings","ladder"];
const officialPhrases = ["football association","football federation","soccer association","soccer federation","federation of football","association of football","official football","national football federation","national football association"];
const hostOfficialRegexes = [
  /(^|[.-])football([.-]|$)/i,/(^|[.-])soccer([.-]|$)/i,/(^|[.-])futbol([.-]|$)/i,/(^|[.-])futebol([.-]|$)/i,/(^|[.-])futbal([.-]|$)/i,
  /(^|[.-])fa([.-]|$)/i,/(^|[.-])[a-z]{2,4}fa([.-]|$)/i,/(^|[.-])ff[a-z]{1,5}([.-]|$)/i,
  /(^|[.-])fpf([.-]|$)/i,/(^|[.-])afa([.-]|$)/i,/(^|[.-])saff([.-]|$)/i,/(^|[.-])league([.-]|$)/i,/(^|[.-])liga([.-]|$)/i,/(^|[.-])ligue([.-]|$)/i,/(^|[.-])superliga([.-]|$)/i
];
function termsFrom(s){ return clean(s).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x => x.length >= 4 && !["league","division","football","soccer","official","standings","table","premier","first","second","national"].includes(x)); }
function classify(row){
  const evidenceText = `${row.title} ${row.snippet} ${row.url} ${row.host}`.toLowerCase(); // query intentionally excluded
  const titleSnippet = `${row.title} ${row.snippet}`.toLowerCase();
  const rejectHost = hardRejectHosts.some(h => row.host === h || row.host.endsWith("." + h));
  const rejectTextHits = hits(evidenceText, hardRejectTextTokens);
  const routeHits = uniq([...hits(row.path, routeTokens), ...hits(row.url, routeTokens), ...hits(titleSnippet, routeTokens)]);
  const phraseHits = hits(titleSnippet, officialPhrases);
  const officialHost = hostOfficialRegexes.some(re => re.test(row.host));
  const countryHits = termsFrom(row.country).filter(t => evidenceText.includes(t) || row.host.includes(t));
  const nameHits = termsFrom(row.competitionName).filter(t => evidenceText.includes(t) || row.host.includes(t));

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

  let classification = "rejected_high_yield_no_official_route_signal";
  if(rejectHost || rejectTextHits.length) classification = "rejected_high_yield_noise";
  else if(hasOfficial && hasRoute && hasContext && score >= 180) classification = "high_yield_official_route_candidate_requires_fetch_probe";
  else if(hasOfficial && hasContext && score >= 135) classification = "high_yield_official_domain_candidate_requires_route_probe";
  else if(hasOfficial && score >= 110) classification = "high_yield_review_official_signal_without_context_or_route";

  return { classification, score, officialHost, phraseHits, routeHits, countryHits, nameHits, rejectHost, rejectTextHits };
}

const classifiedRows = resultRows.map(r => ({...r, ...classify(r)}));
const rank = s => s === "high_yield_official_route_candidate_requires_fetch_probe" ? 4 : s === "high_yield_official_domain_candidate_requires_route_probe" ? 3 : s === "high_yield_review_official_signal_without_context_or_route" ? 2 : 0;
const bestBySlug = new Map();
for(const r of classifiedRows){
  const prev = bestBySlug.get(r.competitionSlug);
  const s = rank(r.classification)*100000 + r.score;
  const ps = prev ? rank(prev.classification)*100000 + prev.score : -999999;
  if(!prev || s > ps) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));
const routeRows = bestRows.filter(r => r.classification === "high_yield_official_route_candidate_requires_fetch_probe");
const domainRows = bestRows.filter(r => r.classification === "high_yield_official_domain_candidate_requires_route_probe");
const reviewRows = bestRows.filter(r => r.classification === "high_yield_review_official_signal_without_context_or_route");

const targetBatchFiles = listFiles(path.join(rawDir,"search-batch-targets")).filter(p => /autonomous-search-targets-(?:provider-)?batch-\d+\.json$/.test(p));
const retryBatchNumbers = [];
for(let i=1;i<=32;i++){
  const count = resultCountByBatch.get(i);
  if(count == null || count === 0 || i >= 13) retryBatchNumbers.push(i);
}
const retryRows = [];
for(const f of targetBatchFiles){
  const n = batchNumber(f);
  if(!retryBatchNumbers.includes(n)) continue;
  const rows = [];
  walkTargets(readJson(f), rows);
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
  status:retryUnique.length ? "passed" : "blocked_no_retry_targets",
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
  policy:{ retryOnly:true, searchRequiresExplicitAllowSearch:true, noFetch:true, noCanonicalCandidateWrite:true, noProductionTruth:true }
};
writeJson(retryTargetsPath, retryPayload);

const summary = {
  status:"passed",
  sourceSearchHealthStatus:wave.summary?.searchHealth?.status || null,
  targetCompetitionCount:(targetsPayload.searchReadyTargets || []).length,
  targetQueryCount:targets.length,
  completedBatchCount:wave.summary?.completedBatchCount ?? null,
  failedBatchCount:wave.summary?.failedBatchCount ?? null,
  sourceSearchResultRowCount:wave.summary?.searchResultRowCount ?? null,
  extractedUniqueSearchRowCount:resultRows.length,
  bestCompetitionCount:bestRows.length,
  bestRowsByClassification:Object.entries(bestRows.reduce((a,r)=>{ a[r.classification]=(a[r.classification]||0)+1; return a; },{})).map(([classification,count])=>({classification,count})),
  allRowsByClassification:Object.entries(classifiedRows.reduce((a,r)=>{ a[r.classification]=(a[r.classification]||0)+1; return a; },{})).map(([classification,count])=>({classification,count})),
  routeCandidateSlugCount:routeRows.length,
  domainCandidateSlugCount:domainRows.length,
  reviewCandidateSlugCount:reviewRows.length,
  fetchProbePreviewCount:routeRows.length + domainRows.length,
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
  sourceTargetPath:targetPath,
  sourceWavePath:wavePath,
  retryTargetsPath,
  summary,
  bestRows,
  routeCandidateRows:routeRows,
  domainCandidateRows:domainRows,
  reviewRows,
  retryPayload,
  policy:{
    localClassificationOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    queryTextNotUsedAsEvidence:true,
    failedBatchesParkedForRetry:true,
    nextAllowedAction:"controlled_fetch_probe_only_for_route_or_domain_candidates; otherwise retry_failed_batches_later"
  }
};
writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
