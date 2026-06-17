import fs from "node:fs";
import path from "node:path";

const inputPath = "data/football-truth/_diagnostics/strict-search-ready-frontier-search-classifier-2026-06-17/strict-search-ready-frontier-search-classifier-2026-06-17.json";
const outPath = "data/football-truth/_diagnostics/ultra-strict-official-host-vetter-2026-06-17/ultra-strict-official-host-vetter-2026-06-17.json";

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8").replace(/^\uFEFF/,"")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function pathOf(u){ try { return new URL(u).pathname.toLowerCase(); } catch { return ""; } }
function uniq(a){ return [...new Set(a.filter(Boolean))]; }
function hits(s, arr){ const t=String(s||"").toLowerCase(); return uniq(arr.filter(x => t.includes(String(x).toLowerCase()))); }

const input = readJson(inputPath);
const rows = input.classifiedRows || [];

const hardRejectHosts = [
  "rsssf.org","linguapedia.info","petfinder.com","apraia.pt","web.whatsapp.com","whatsapp.com","fr.linkedin.com","linkedin.com",
  "visitangola.ao","autotrader.co.za","howtogeek.com","aruba.it","aa.com","alongdustyroads.com","worldatlas.com",
  "bahamas.gov.bs","bangladesh.gov.bd","nationsonline.org","benin.bj","bermuda.com","bubo.sk","bahrain.com",
  "premier.cz","gry.pl","tiscali.it","mail.tiscali.it","cestujlevne.com","gov.bw","visitbarbados.org","lonelyplanet.com",
  "lex.dk","visitbulgaria.com","demo.cambodia.gov.kh","outlook.office.com","office.com","developer.android.com",
  "caymanchem.com","diplomatie.gouv.fr","civil-protection-humanitarian-aid.ec.europa.eu","britannica.com","tripadvisor.com",
  "gotobermuda.com","aruba.com","tourismbih.com","albaniaturism.com","google.com","mail.google.com","support.microsoft.com",
  "microsoft.com","pluralsight.com","tenforums.com","chromedino.com","thinkorswim.com","trade.thinkorswim.com","lata.com.pt",
  "bhutanwiki.org","angola24horas.com","azerbaijan.az","mae.gov.bi","lematin.bj"
];
const hardRejectTextTokens = [
  "tourism","travel","hotel","culture","britannica","tripadvisor","wiki","wikipedia","google","microsoft","pluralsight",
  "forum","tutorial","mail.google","thinkorswim","chrome dino","petfinder","linkedin","whatsapp","outlook","office.com",
  "autotrader","howtogeek","worldatlas","lonelyplanet","diplomatie.gouv","humanitarian-aid","visit "
];

const hostOfficialRegexes = [
  /(^|[.-])football([.-]|$)/i,
  /(^|[.-])soccer([.-]|$)/i,
  /(^|[.-])futbol([.-]|$)/i,
  /(^|[.-])futebol([.-]|$)/i,
  /(^|[.-])futbal([.-]|$)/i,
  /(^|[.-])league([.-]|$)/i,
  /(^|[.-])liga([.-]|$)/i,
  /(^|[.-])ligue([.-]|$)/i,
  /(^|[.-])fa([.-]|$)/i,
  /(^|[.-])ff[a-z]{0,4}([.-]|$)/i,
  /(^|[.-])fpf([.-]|$)/i,
  /(^|[.-])fshf([.-]|$)/i,
  /(^|[.-])afa([.-]|$)/i,
  /(^|[.-])auf([.-]|$)/i,
  /(^|[.-])saff([.-]|$)/i,
  /(^|[.-])dimayor([.-]|$)/i,
  /(^|[.-])premierleague([.-]|$)/i,
  /(^|[.-])superliga([.-]|$)/i,
  /(^|[.-])federation([.-]|$)/i,
  /(^|[.-])association([.-]|$)/i
];

const titleOfficialPhrases = [
  "football association","football federation","soccer association","soccer federation","futbol federation",
  "futbol association","federation of football","association of football","official football federation",
  "official football association","premier league","first division","superliga","league table"
];

const routeTokens = [
  "standings","standing","table","league-table","classification","classement","classifica","classificacao","classificação",
  "posiciones","tabla","ranking","rankings","ladder"
];

function hostHasOfficialSignal(host){
  return hostOfficialRegexes.some(re => re.test(host));
}
function phraseOfficialSignal(text){
  const t = String(text || "").toLowerCase();
  return titleOfficialPhrases.filter(p => t.includes(p));
}
function routeSignal(row){
  const text = `${row.title} ${row.snippet} ${row.url}`.toLowerCase();
  const routeHits = uniq([...hits(row.url, routeTokens), ...hits(pathOf(row.url), routeTokens), ...hits(text, routeTokens)]);
  return routeHits;
}
function countryOrCompetitionSignal(row){
  const text = `${row.title} ${row.snippet} ${row.url} ${row.host}`.toLowerCase();
  const countryTerms = clean(row.country).toLowerCase().split(/[ _-]+/).filter(x => x.length >= 4);
  const nameTerms = clean(row.competitionName).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x => x.length >= 4 && !["league","division","football","official","standings","table","premier","first","second"].includes(x));
  return {
    countryHits: countryTerms.filter(t => text.includes(t)),
    nameHits: nameTerms.filter(t => text.includes(t))
  };
}
function vet(row){
  const host = row.host || hostOf(row.url);
  const text = `${row.title} ${row.snippet} ${row.url} ${host}`.toLowerCase();
  const rejectHost = hardRejectHosts.some(h => host === h || host.endsWith("." + h));
  const rejectTextHits = hits(text, hardRejectTextTokens);
  const officialHost = hostHasOfficialSignal(host);
  const officialPhrases = phraseOfficialSignal(`${row.title} ${row.snippet}`);
  const routeHits = routeSignal(row);
  const ctx = countryOrCompetitionSignal(row);

  let score = 0;
  if(officialHost) score += 100;
  if(officialPhrases.length) score += 80;
  if(routeHits.length) score += 60;
  if(ctx.countryHits.length) score += 15;
  if(ctx.nameHits.length) score += 20;
  if(rejectHost) score -= 500;
  if(rejectTextHits.length) score -= 300;

  const hasOfficialSignal = officialHost || officialPhrases.length > 0;
  const hasRouteSignal = routeHits.length > 0;
  const hasContext = ctx.countryHits.length > 0 || ctx.nameHits.length > 0;

  let vettingStatus = "rejected_ultra_strict_no_official_route_signal";
  if(rejectHost || rejectTextHits.length) vettingStatus = "rejected_ultra_strict_noise_host_or_text";
  else if(hasOfficialSignal && hasRouteSignal && hasContext && score >= 170) vettingStatus = "ultra_strict_official_route_candidate_requires_controlled_fetch_probe";
  else if(hasOfficialSignal && hasContext && score >= 125) vettingStatus = "ultra_strict_official_domain_candidate_requires_route_probe";
  else if(hasOfficialSignal && score >= 100) vettingStatus = "ultra_strict_review_official_signal_without_route_or_context";

  return {
    vettingStatus,
    ultraStrictScore: score,
    officialHost,
    officialPhrases,
    routeHits,
    countryHits: ctx.countryHits,
    nameHits: ctx.nameHits,
    rejectHost,
    rejectTextHits
  };
}

const vettedRows = rows.map(r => ({...r, ...vet(r)}));

const bestBySlug = new Map();
const rank = s => s === "ultra_strict_official_route_candidate_requires_controlled_fetch_probe" ? 4 : s === "ultra_strict_official_domain_candidate_requires_route_probe" ? 3 : s === "ultra_strict_review_official_signal_without_route_or_context" ? 2 : 0;
for(const r of vettedRows){
  const prev = bestBySlug.get(r.competitionSlug);
  const s = rank(r.vettingStatus) * 100000 + r.ultraStrictScore;
  const ps = prev ? rank(prev.vettingStatus) * 100000 + prev.ultraStrictScore : -999999;
  if(!prev || s > ps) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>String(a.competitionSlug).localeCompare(String(b.competitionSlug)));

const routeRows = bestRows.filter(r => r.vettingStatus === "ultra_strict_official_route_candidate_requires_controlled_fetch_probe");
const domainRows = bestRows.filter(r => r.vettingStatus === "ultra_strict_official_domain_candidate_requires_route_probe");
const reviewRows = bestRows.filter(r => r.vettingStatus === "ultra_strict_review_official_signal_without_route_or_context");

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

const summary = {
  status:"passed",
  inputClassifiedRowCount:rows.length,
  vettedRowCount:vettedRows.length,
  bestCompetitionCount:bestRows.length,
  bestRowsByVettingStatus:Object.entries(bestRows.reduce((a,r)=>{ a[r.vettingStatus]=(a[r.vettingStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  allRowsByVettingStatus:Object.entries(vettedRows.reduce((a,r)=>{ a[r.vettingStatus]=(a[r.vettingStatus]||0)+1; return a; },{})).map(([status,count])=>({status,count})),
  ultraStrictRouteCandidateSlugCount:routeRows.length,
  ultraStrictDomainCandidateSlugCount:domainRows.length,
  ultraStrictReviewSlugCount:reviewRows.length,
  fetchProbePreviewCount:fetchProbePreviewRows.length,
  retryTargetCount:input.retryPayload?.summary?.retryTargetCount ?? 0,
  retryTargetsPath:input.retryTargetsPath,
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
  inputPath,
  summary,
  vettedRows,
  bestRows,
  fetchProbePreviewRows,
  retryTargetsPath:input.retryTargetsPath,
  policy:{
    localVettingOnly:true,
    noSearch:true,
    noFetch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    requiresPositiveOfficialHostOrFootballAssociationSignal:true,
    genericCountryTourismGovernmentTravelAndTechDomainsRejected:true,
    nextAllowedAction:"retry_lost_batches_or_controlled_fetch_probe_only_for_ultra_strict_candidates"
  }
};

writeJson(outPath,out);
console.log(JSON.stringify(summary,null,2));
