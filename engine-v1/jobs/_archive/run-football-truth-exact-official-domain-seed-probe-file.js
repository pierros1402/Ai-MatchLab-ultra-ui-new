import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

if(!process.argv.includes("--allow-fetch")){
  console.error("Refusing to run without explicit --allow-fetch");
  process.exit(2);
}

const outDir = "data/football-truth/_diagnostics/exact-official-domain-seed-probe-2026-06-17";
const snapDir = path.join(outDir, "snapshots");
const outPath = path.join(outDir, "exact-official-domain-seed-probe-2026-06-17.json");

function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function clean(s){ return String(s ?? "").replace(/\s+/g," ").trim(); }
function sha(s){ return crypto.createHash("sha256").update(String(s)).digest("hex"); }
function safe(s){ return String(s).replace(/[^a-z0-9.-]+/gi,"_").slice(0,100); }
function hostOf(u){ try { return new URL(u).hostname.toLowerCase().replace(/^www\./,""); } catch { return ""; } }
function strip(html){
  return clean(String(html||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&#8211;/gi,"-"));
}
function tableCount(html){ return (String(html).toLowerCase().match(/<table\b/g) || []).length; }
function trCount(html){ return (String(html).toLowerCase().match(/<tr\b/g) || []).length; }

const seeds = [
  {competitionSlug:"gre.1", competitionName:"Super League Greece", country:"Greece", urls:["https://www.slgr.gr/en/","https://www.slgr.gr/en/scoreboard/","https://www.slgr.gr/en/standings/","https://www.slgr.gr/el/scoreboard/"]},
  {competitionSlug:"cro.1", competitionName:"Croatian Football League HNL", country:"Croatia", urls:["https://hnl.hr/","https://hnl.hr/natjecanja/supersport-hnl/","https://hnl.hr/natjecanja/supersport-hnl/ljestvica/","https://hnl.hr/standings/"]},
  {competitionSlug:"bul.1", competitionName:"Bulgarian First League", country:"Bulgaria", urls:["https://www.fpleague.bg/","https://www.fpleague.bg/en/","https://www.fpleague.bg/en/statistics/standings","https://www.fpleague.bg/bg/statistika/klasirane"]},
  {competitionSlug:"cyp.1", competitionName:"Cypriot First Division", country:"Cyprus", urls:["https://www.cfa.com.cy/","https://www.cfa.com.cy/En/competitions","https://www.cfa.com.cy/En/competitions/1","https://www.cfa.com.cy/Gr/competitions/1"]},
  {competitionSlug:"alb.1", competitionName:"Albanian Superliga", country:"Albania", urls:["https://fshf.org/","https://fshf.org/competition/abissnet-superiore/","https://fshf.org/sq/competition/abissnet-superiore/","https://fshf.org/sq/kategoria-superiore/"]},
  {competitionSlug:"aze.1", competitionName:"Azerbaijan Premier League", country:"Azerbaijan", urls:["https://www.affa.az/","https://www.affa.az/index.php/competitions/premier-league/standings/","https://www.affa.az/index.php/yarishlar/premyer-liqa/turnir-cedveli/","https://www.pfl.az/"]},
  {competitionSlug:"svn.1", competitionName:"Slovenian PrvaLiga", country:"Slovenia", urls:["https://www.prvaliga.si/","https://www.prvaliga.si/tekmovanja/default.asp?action=lestvica","https://www.nzs.si/","https://www.nzs.si/tekmovanja/default.asp?action=lestvica"]},
  {competitionSlug:"isl.1", competitionName:"Besta deild karla", country:"Iceland", urls:["https://www.ksi.is/","https://www.ksi.is/mot/","https://www.ksi.is/mot/stada-mota/","https://www.ksi.is/mot/stakt-mot/"]},
  {competitionSlug:"ind.1", competitionName:"Indian Super League", country:"India", urls:["https://www.indiansuperleague.com/","https://www.indiansuperleague.com/standings","https://www.indiansuperleague.com/fixtures","https://www.the-aiff.com/"]},
  {competitionSlug:"tha.1", competitionName:"Thai League 1", country:"Thailand", urls:["https://thaileague.co.th/","https://thaileague.co.th/official/t1/","https://thaileague.co.th/official/t1/standings","https://thaileague.co.th/official/t1/table"]},
  {competitionSlug:"uzb.1", competitionName:"Uzbekistan Super League", country:"Uzbekistan", urls:["https://pfl.uz/","https://pfl.uz/uzb/tournaments/1","https://pfl.uz/uzb/tournaments/1/table","https://pfl.uz/ru/tournaments/1/table"]},
  {competitionSlug:"alg.1", competitionName:"Algerian Ligue Professionnelle 1", country:"Algeria", urls:["https://www.faf.dz/","https://www.lfp.dz/","https://www.lfp.dz/competition/view?id=1","https://www.faf.dz/competition/ligue-1/"]}
];

function fetchUrl(seed, url, idx){
  const snapshotPath = path.join(snapDir, `${String(idx).padStart(3,"0")}-${seed.competitionSlug}-${safe(url)}.html`);
  const args = [
    "-L","--silent","--show-error","--compressed",
    "--max-time","22","--connect-timeout","8",
    "-A","Mozilla/5.0 AI-MatchLab-FootballTruth/exact-official-domain-seed-probe",
    "-o", snapshotPath,
    "-w","%{http_code}\t%{url_effective}\t%{content_type}",
    url
  ];
  const r = spawnSync("curl.exe", args, {encoding:"utf8", timeout:28000, windowsHide:true});
  const stdout = clean(r.stdout);
  const [codeRaw,effectiveUrl,contentType] = stdout.split("\t");
  const httpCode = Number(codeRaw || 0);
  let html = "";
  if(fs.existsSync(snapshotPath)){
    try { html = fs.readFileSync(snapshotPath,"utf8"); } catch {}
  }
  const visible = strip(html);
  const pageTitle = clean(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const lower = `${url} ${effectiveUrl || ""} ${pageTitle} ${visible.slice(0,60000)}`.toLowerCase();
  const tables = tableCount(html);
  const trs = trCount(html);
  const standingsHits = (lower.match(/standings|standing|league table|table|classification|classifica|classement|posiciones|tabla|rankings?|played|pld|won|draw|lost|points|pts|goals|gd|fixtures|results/g) || []).length;
  const compHits = clean(seed.competitionName).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x=>x.length>=4).filter(x=>lower.includes(x)).length;
  const countryHits = clean(seed.country).toLowerCase().split(/[^a-zà-ž0-9]+/i).filter(x=>x.length>=4).filter(x=>lower.includes(x)).length;
  const pageNotFound = /page not found|404|not found/i.test(`${pageTitle} ${visible.slice(0,2000)}`);

  let shapeScore = 0;
  if(httpCode >= 200 && httpCode < 300) shapeScore += 35;
  if(html.length > 1000 && pageTitle) shapeScore += 15;
  shapeScore += Math.min(standingsHits,16) * 10;
  shapeScore += Math.min(compHits,4) * 20;
  shapeScore += Math.min(countryHits,2) * 8;
  if(tables > 0) shapeScore += 60;
  if(trs >= 8) shapeScore += 35;
  if(pageNotFound) shapeScore -= 130;

  let probeStatus = "blocked_no_standings_shape";
  if(shapeScore >= 160 && tables > 0) probeStatus = "shape_candidate_html_table_requires_dry_extract";
  else if(shapeScore >= 145) probeStatus = "route_candidate_requires_snapshot_mining_or_parser_contract";
  else if(pageNotFound) probeStatus = "blocked_page_not_found";

  return {
    competitionSlug:seed.competitionSlug,
    competitionName:seed.competitionName,
    country:seed.country,
    url,
    host:hostOf(url),
    httpCode,
    effectiveUrl:effectiveUrl || "",
    effectiveHost:hostOf(effectiveUrl || url),
    contentType:contentType || "",
    curlExitCode:r.status,
    curlError:r.error ? String(r.error.message || r.error) : "",
    stderr:clean(r.stderr).slice(0,500),
    snapshotPath,
    snapshotByteLength:Buffer.byteLength(html),
    snapshotSha256:html ? sha(html) : "",
    pageTitle,
    tableTagCount:tables,
    trCount:trs,
    standingsHits,
    compHits,
    countryHits,
    pageNotFound,
    shapeScore,
    probeStatus
  };
}

const fetchRows = [];
let idx = 0;
for(const seed of seeds){
  for(const url of seed.urls){
    idx++;
    fetchRows.push(fetchUrl(seed, url, idx));
  }
}

const rank = s => s === "shape_candidate_html_table_requires_dry_extract" ? 4 : s === "route_candidate_requires_snapshot_mining_or_parser_contract" ? 3 : 0;
const bestBySlug = new Map();
for(const r of fetchRows){
  const prev = bestBySlug.get(r.competitionSlug);
  const s = rank(r.probeStatus)*100000 + r.shapeScore;
  const ps = prev ? rank(prev.probeStatus)*100000 + prev.shapeScore : -999999;
  if(!prev || s > ps) bestBySlug.set(r.competitionSlug, r);
}
const bestRows = [...bestBySlug.values()].sort((a,b)=>a.competitionSlug.localeCompare(b.competitionSlug));
const tableCandidateRows = fetchRows.filter(r=>r.probeStatus==="shape_candidate_html_table_requires_dry_extract").sort((a,b)=>b.shapeScore-a.shapeScore);
const routeCandidateRows = fetchRows.filter(r=>r.probeStatus==="route_candidate_requires_snapshot_mining_or_parser_contract").sort((a,b)=>b.shapeScore-a.shapeScore);

const summary = {
  status:"passed",
  seedCompetitionCount:seeds.length,
  controlledSeedUrlCount:fetchRows.length,
  fetchExecutedNowCount:fetchRows.length,
  fetched2xxCount:fetchRows.filter(r=>r.httpCode>=200 && r.httpCode<300).length,
  bestCompetitionCount:bestRows.length,
  tableCandidateCompetitionCount:new Set(tableCandidateRows.map(r=>r.competitionSlug)).size,
  routeCandidateCompetitionCount:new Set(routeCandidateRows.map(r=>r.competitionSlug)).size,
  tableCandidateRowCount:tableCandidateRows.length,
  routeCandidateRowCount:routeCandidateRows.length,
  bestRowsByProbeStatus:Object.entries(bestRows.reduce((a,r)=>{a[r.probeStatus]=(a[r.probeStatus]||0)+1; return a;},{})).map(([status,count])=>({status,count})),
  searchExecutedNowCount:0,
  broadSearchExecutedNowCount:0,
  standingsExtractionExecutedNowCount:0,
  canonicalWriteExecutedNowCount:0,
  productionWriteExecutedNowCount:0,
  truthAssertionExecutedNowCount:0
};

writeJson(outPath,{
  generatedAtUtc:new Date().toISOString(),
  status:"passed",
  summary,
  bestRows,
  tableCandidateRows,
  routeCandidateRows,
  fetchRows,
  policy:{
    controlledOfficialDomainSeedProbeOnly:true,
    searchExecutedNow:false,
    noSearch:true,
    noCanonicalCandidateWrite:true,
    noProductionTruth:true,
    nextAllowedAction:"dry_extract_table_candidates_or_mine_route_candidates_else_park_official_domain_seed_lane"
  }
});
console.log(JSON.stringify(summary,null,2));
