import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/bulk-official-route-template-shape-wave-2026-06-17/bulk-official-route-template-shape-wave-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/bulk-same-host-endpoint-shape-probe-2026-06-17/bulk-same-host-endpoint-shape-probe-2026-06-17.json";
const snapshotDir = "data/football-truth/_diagnostics/bulk-same-host-endpoint-shape-probe-2026-06-17/snapshots";
const maxEndpointsPerSlug = 8;
const timeoutMs = 9000;

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function readText(p){ return p && fs.existsSync(p) ? fs.readFileSync(p,"utf8") : ""; }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function writeText(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,String(v ?? "")); }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function sameHostOrSubdomain(u, host){
  const a = hostOf(u);
  const b = String(host || "").toLowerCase().replace(/^www\./,"");
  return a === b || a.endsWith("." + b);
}
function resolveUrl(raw, base){
  try { return new URL(String(raw || "").replace(/&amp;/g,"&"), base).href; } catch { return null; }
}
function cleanUrl(u){
  return String(u || "")
    .replace(/[)\].,;]+$/g,"")
    .replace(/\\u002F/g,"/")
    .replace(/\\\//g,"/");
}
function uniq(a){ return [...new Set(a.filter(Boolean))]; }
function count(text,re){ return [...String(text ?? "").matchAll(re)].length; }
function hits(text,tokens){
  const t = String(text || "").toLowerCase();
  return uniq(tokens.filter(x => t.includes(String(x).toLowerCase())));
}

const routeTokens = [
  "standings","standing","table","tables","league-table","classification","classement","classifica",
  "classificacao","classificação","posiciones","tabla","ranking","rankings","teamrank","teamRank",
  "competitionTable","leagueTable","overallStandings","順位","stand"
];
const apiTokens = ["api","json","data","graphql","ajax","rest","feed","endpoint","service","__next_data__","_next/data"];
const statTokens = [
  "played","pld","matchesplayed","matchesPlayed","mp","won","wins","drawn","draws","lost","losses",
  "points","pts","goalsfor","goalsFor","goalsagainst","goalsAgainst","goaldifference","goalDifference",
  "rank","position","teamName","clubName","team","club","puntos","punten","pj","pg","pe","pp","gf","ga","gd","dg"
];
const rejectAsset = /\.(png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf|pdf|zip|mp4|webm|avi|mov)(\?|$)/i;
const rejectRoute = /(privacy|terms|cookie|login|register|account|newsletter|shop|ticket|video|gallery|media|sponsor|partner|academy|women)/i;

function endpointCandidateScore(url){
  const u = String(url || "");
  const lower = u.toLowerCase();
  let score = 0;
  const routeHits = hits(lower, routeTokens);
  const apiHits = hits(lower, apiTokens);
  score += routeHits.length * 45;
  score += apiHits.length * 25;
  if(/[?&](competition|season|league|division|stage|type|lang|locale|comp|id)=/i.test(u)) score += 20;
  if(/\.(json)(\?|$)/i.test(u)) score += 35;
  if(/graphql/i.test(u)) score += 30;
  if(/standings|table|posiciones|classification|classement|teamrank/i.test(u)) score += 55;
  if(/fixture|fixtures|schedule|calendar|result|results|match|matches/i.test(u)) score -= 10;
  if(rejectRoute.test(u)) score -= 80;
  return { score, routeHits, apiHits };
}
function bodyShape(text, contentType){
  const sample = String(text || "").slice(0, 200000);
  const lowerType = String(contentType || "").toLowerCase();
  const isJsonLike = lowerType.includes("json") || /^[\s\uFEFF]*[\[{]/.test(sample);
  const jsonKeyHits = hits(sample, statTokens);
  const standingsHits = hits(sample, routeTokens);
  const tableTagCount = count(sample, /<table\b/gi);
  const trCount = count(sample, /<tr\b/gi);
  const objectWithStatsCount = count(sample, /\{[^{}]{0,1600}(points|pts|played|matchesPlayed|goalDifference|standings|table|teamName|clubName)[^{}]{0,1600}\}/gi);
  const arrayWithTeamsCount = count(sample, /\[[\s\S]{0,8000}(team|club|teamName|clubName|name)[\s\S]{0,8000}(points|pts|played|standings|table|rank|position)[\s\S]{0,8000}\]/gi);
  let score = 0;
  if(isJsonLike) score += 30;
  score += jsonKeyHits.length * 12;
  score += standingsHits.length * 18;
  score += Math.min(objectWithStatsCount, 30) * 5;
  score += Math.min(arrayWithTeamsCount, 8) * 20;
  if(tableTagCount > 0) score += 25;
  if(trCount >= 8) score += 25;
  return { isJsonLike, jsonKeyHits, standingsHits, tableTagCount, trCount, objectWithStatsCount, arrayWithTeamsCount, score };
}
function extractCandidateUrls(body, baseUrl, sourceHost){
  const found = [];
  const add = raw => {
    if(!raw) return;
    let x = cleanUrl(raw);
    if(!x || x.startsWith("mailto:") || x.startsWith("tel:") || x.startsWith("#")) return;
    if(x.includes("{") || x.includes("}") || x.length > 600) return;
    const u = resolveUrl(x, baseUrl);
    if(!u) return;
    if(!sameHostOrSubdomain(u, sourceHost)) return;
    if(rejectAsset.test(u)) return;
    const sc = endpointCandidateScore(u);
    if(sc.score < 25) return;
    found.push({ url:u, endpointCandidateScore:sc.score, routeHits:sc.routeHits, apiHits:sc.apiHits, sourceBaseUrl:baseUrl });
  };

  for(const m of String(body || "").matchAll(/https?:\/\/[^\s"'<>\\]+/g)) add(m[0]);
  for(const m of String(body || "").matchAll(/(?:href|src|action|data-url|data-api|data-endpoint|url)=["']([^"']+)["']/gi)) add(m[1]);
  for(const m of String(body || "").matchAll(/["'](\/[^"']{2,400})["']/g)) add(m[1]);
  for(const m of String(body || "").matchAll(/["']([^"']*(?:api|json|standings|standing|table|classification|classement|classifica|posiciones|tabla|teamRank)[^"']{0,350})["']/gi)) add(m[1]);

  const byUrl = new Map();
  for(const f of found){
    const prev = byUrl.get(f.url);
    if(!prev || f.endpointCandidateScore > prev.endpointCandidateScore) byUrl.set(f.url,f);
  }
  return [...byUrl.values()].sort((a,b) => b.endpointCandidateScore - a.endpointCandidateScore);
}
async function fetchWithTimeout(url){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try{
    const res = await fetch(url, {
      method:"GET",
      redirect:"follow",
      signal:controller.signal,
      headers:{
        "user-agent":"football-truth-bulk-same-host-endpoint-probe/1.0",
        "accept":"application/json,text/html;q=0.9,*/*;q=0.5"
      }
    });
    const text = await res.text();
    clearTimeout(timer);
    return {
      ok:true,
      status:res.status,
      contentType:res.headers.get("content-type") || "",
      effectiveUrl:res.url,
      text
    };
  } catch(e){
    clearTimeout(timer);
    return { ok:false, status:0, contentType:"", effectiveUrl:url, text:"", error:String(e && e.message || e) };
  }
}

const input = readJson(inputPath);
const shapeRows = (input.fetchRows || []).filter(r => r.bulkRouteShapeStatus === "L4_bulk_route_template_shape_candidate_requires_parser_contract" && r.snapshotBody);

const candidateMap = new Map();
for(const r of shapeRows){
  const body = readText(r.snapshotBody);
  const candidates = extractCandidateUrls(body, r.url, r.host);
  for(const c of candidates){
    const key = `${r.competitionSlug} ${c.url}`;
    const prev = candidateMap.get(key);
    const merged = {
      competitionSlug:r.competitionSlug,
      host:r.host,
      url:c.url,
      sourceRouteUrl:r.url,
      sourceRouteRank:r.rank,
      endpointCandidateScore:c.endpointCandidateScore,
      routeHits:c.routeHits,
      apiHits:c.apiHits
    };
    if(!prev || merged.endpointCandidateScore > prev.endpointCandidateScore) candidateMap.set(key, merged);
  }
}

const candidatesBySlug = new Map();
for(const c of candidateMap.values()){
  if(!candidatesBySlug.has(c.competitionSlug)) candidatesBySlug.set(c.competitionSlug, []);
  candidatesBySlug.get(c.competitionSlug).push(c);
}
const plannedRows = [];
for(const [slug, arr] of candidatesBySlug.entries()){
  const top = arr.sort((a,b)=>b.endpointCandidateScore-a.endpointCandidateScore).slice(0,maxEndpointsPerSlug);
  plannedRows.push(...top.map((x,i)=>({...x, endpointRank:i+1})));
}

fs.mkdirSync(snapshotDir,{recursive:true});
const probeRows = [];
let i = 0;
for(const p of plannedRows){
  i++;
  console.log(`endpoint fetch ${i}/${plannedRows.length} ${p.competitionSlug} r${p.endpointRank} ${p.url}`);
  const f = await fetchWithTimeout(p.url);
  const shape = bodyShape(f.text, f.contentType);
  const safe = `${p.competitionSlug.replace(/\./g,"_")}_e${p.endpointRank}`;
  let snapshotBody = null;
  let snapshotMeta = null;

  let status = "blocked_endpoint_fetch_error";
  if(f.ok && f.status >= 200 && f.status < 300){
    if(shape.score >= 115 && (shape.jsonKeyHits.length >= 5 || shape.arrayWithTeamsCount >= 1 || shape.objectWithStatsCount >= 6 || shape.tableTagCount > 0)){
      status = "L4_endpoint_shape_candidate_requires_parser_contract";
    } else if(shape.score >= 70){
      status = "review_endpoint_2xx_weak_shape";
    } else {
      status = "blocked_endpoint_no_shape";
    }
  } else if(f.status > 0) {
    status = "blocked_endpoint_fetch_not_2xx";
  }

  if(status === "L4_endpoint_shape_candidate_requires_parser_contract" || status === "review_endpoint_2xx_weak_shape"){
    snapshotBody = path.join(snapshotDir, `${safe}.body.txt`);
    snapshotMeta = path.join(snapshotDir, `${safe}.meta.json`);
    writeText(snapshotBody, f.text);
    writeJson(snapshotMeta, { status:f.status, contentType:f.contentType, effectiveUrl:f.effectiveUrl, error:f.error || null });
  }

  probeRows.push({
    ...p,
    fetchStatus:f.status,
    contentType:f.contentType,
    effectiveUrl:f.effectiveUrl,
    fetchOk:f.ok,
    fetchError:f.error || null,
    bodyBytes:Buffer.byteLength(f.text || "", "utf8"),
    bodyShapeScore:shape.score,
    endpointProbeStatus:status,
    shape,
    snapshotBody,
    snapshotMeta,
    parserContractAllowed:status === "L4_endpoint_shape_candidate_requires_parser_contract",
    dryExtractAllowed:false,
    canonicalCandidateWriteAllowed:false,
    productionTruthAllowed:false
  });
}

const bestBySlug = new Map();
const statusScore = s => s === "L4_endpoint_shape_candidate_requires_parser_contract" ? 3 : s === "review_endpoint_2xx_weak_shape" ? 2 : s === "blocked_endpoint_no_shape" ? 1 : 0;
for(const r of probeRows){
  const prev = bestBySlug.get(r.competitionSlug);
  const score = statusScore(r.endpointProbeStatus) * 100000 + r.bodyShapeScore + r.endpointCandidateScore;
  const prevScore = prev ? statusScore(prev.endpointProbeStatus) * 100000 + prev.bodyShapeScore + prev.endpointCandidateScore : -1;
  if(!prev || score > prevScore) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const summary = {
  status:"passed",
  sourceShapeRouteCount:shapeRows.length,
  discoveredEndpointCandidateCount:candidateMap.size,
  plannedEndpointFetchCount:plannedRows.length,
  endpointFetchExecutedNowCount:probeRows.length,
  fetched2xxCount:probeRows.filter(r => r.fetchStatus >= 200 && r.fetchStatus < 300).length,
  parserContractCandidateEndpointCount:probeRows.filter(r => r.endpointProbeStatus === "L4_endpoint_shape_candidate_requires_parser_contract").length,
  parserContractCandidateSlugCount:bestRows.filter(r => r.endpointProbeStatus === "L4_endpoint_shape_candidate_requires_parser_contract").length,
  reviewEndpointSlugCount:bestRows.filter(r => r.endpointProbeStatus === "review_endpoint_2xx_weak_shape").length,
  bestRowsByStatus:Object.entries(bestRows.reduce((a,r)=>{ a[r.endpointProbeStatus]=(a[r.endpointProbeStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  probeRowsByStatus:Object.entries(probeRows.reduce((a,r)=>{ a[r.endpointProbeStatus]=(a[r.endpointProbeStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  parserContractCandidateSlugs:bestRows.filter(r => r.endpointProbeStatus === "L4_endpoint_shape_candidate_requires_parser_contract").map(r => r.competitionSlug),
  reviewEndpointSlugs:bestRows.filter(r => r.endpointProbeStatus === "review_endpoint_2xx_weak_shape").map(r => r.competitionSlug),
  blockedOrFailedSlugs:bestRows.filter(r => !["L4_endpoint_shape_candidate_requires_parser_contract","review_endpoint_2xx_weak_shape"].includes(r.endpointProbeStatus)).map(r => r.competitionSlug),
  searchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

const out = {
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  inputPath,
  summary,
  plannedRows,
  probeRows,
  bestRows,
  policy:{
    sameHostOrSubdomainEndpointFetchOnly:true,
    noSearch:true,
    noStandingsExtraction:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    nextAllowedAction:"bulk_endpoint_parser_contract_discovery"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
