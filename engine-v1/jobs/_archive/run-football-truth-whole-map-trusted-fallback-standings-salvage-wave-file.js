import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { URL } from "node:url";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const maxTargets = Number(process.argv.find(a=>a.startsWith("--max-targets="))?.split("=")[1] ?? 260);
const concurrency = Number(process.argv.find(a=>a.startsWith("--concurrency="))?.split("=")[1] ?? 12);

const diagRoot = path.join("data","football-truth","_diagnostics");
const stateDir = path.join("data","football-truth","_state","canonical-standings-candidates");
const outDir = path.join("data","football-truth","_diagnostics","whole-map-trusted-fallback-standings-salvage-wave-2026-06-17");
const responseDir = path.join(outDir,"responses");
const outPath = path.join(outDir,"whole-map-trusted-fallback-standings-salvage-wave-2026-06-17.json");

const trustedHostPatterns = [
  /(^|\.)soccerway\.com$/i,
  /(^|\.)globalsportsarchive\.com$/i,
  /(^|\.)worldfootball\.net$/i,
  /(^|\.)flashscore\.[a-z.]+$/i,
  /(^|\.)livesport\.com$/i,
  /(^|\.)espn\.[a-z.]+$/i,
  /(^|\.)fbref\.com$/i,
  /(^|\.)footystats\.org$/i,
  /(^|\.)sofascore\.com$/i,
  /(^|\.)aiscore\.com$/i,
  /(^|\.)besoccer\.com$/i,
  /(^|\.)playmakerstats\.com$/i,
  /(^|\.)the-sports\.org$/i,
  /(^|\.)soccerstand\.com$/i
];

const rejectHostPatterns = [
  /porn|xhamster|xnxx|xvideos|bokep|jav|booking|tripadvisor|microsoft|target|amazon|linkedin|facebook|instagram|youtube|netflix|office|google|duckduckgo|bing|wikipedia/i
];

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function sha(v){ return crypto.createHash("sha256").update(String(v)).digest("hex").slice(0,24); }
function clean(v){ return String(v??"").replace(/\s+/g," ").trim(); }
function isObj(v){ return v && typeof v==="object" && !Array.isArray(v); }
function walkFiles(dir,pred,acc=[]){
  if(!fs.existsSync(dir)) return acc;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p=path.join(dir,ent.name);
    if(ent.isDirectory()) walkFiles(p,pred,acc);
    else if(pred(p)) acc.push(p);
  }
  return acc;
}
function collectStrings(node,out=[]){
  if(typeof node==="string") out.push(node);
  else if(Array.isArray(node)) for(const x of node) collectStrings(x,out);
  else if(isObj(node)) for(const v of Object.values(node)) collectStrings(v,out);
  return out;
}
function collectObjects(node,out=[]){
  if(Array.isArray(node)) for(const x of node) collectObjects(x,out);
  else if(isObj(node)){ out.push(node); for(const v of Object.values(node)) collectObjects(v,out); }
  return out;
}
function extractUrlsFromString(s){
  return [...String(s??"").matchAll(/https?:\/\/[^\s"'<>\\)]+/gi)].map(m=>m[0].replace(/[.,;:]+$/,""));
}
function slugOf(o){ return clean(o?.competitionSlug ?? o?.slug ?? o?.competition_id ?? o?.competitionId ?? o?.id); }
function getHost(u){
  try { return new URL(u).hostname.replace(/^www\./i,"").toLowerCase(); } catch { return ""; }
}
function trustedHost(host){
  if(!host) return false;
  if(rejectHostPatterns.some(r=>r.test(host))) return false;
  return trustedHostPatterns.some(r=>r.test(host));
}
function urlScore(u,host){
  const l=u.toLowerCase();
  let s=0;
  if(/standings|table|league-table|clasificacion|classification|classement|tabla|rankings?|ladder|premier-league|first-division|liga|serie|superliga|division|league/.test(l)) s+=80;
  if(/soccerway|globalsportsarchive|worldfootball|fbref/.test(host)) s+=40;
  if(/flashscore|livesport|sofascore|aiscore/.test(host)) s+=25;
  if(/football|soccer|standings|table/.test(l)) s+=20;
  if(/news|article|video|tickets|shop|login|register|profile|ranking\/[a-z]{3}$/i.test(l)) s-=80;
  return s;
}
function decodeHtml(s){
  return String(s??"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/&quot;/g,'"')
    .replace(/&#39;/g,"'")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/\s+/g," ")
    .trim();
}
function stripTags(s){ return decodeHtml(String(s??"").replace(/<[^>]+>/g," ")); }
function parseTables(html){
  const tables=[];
  for(const tm of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)){
    const tableHtml=tm[0];
    const rows=[];
    for(const rm of tableHtml.matchAll(/<tr\b[\s\S]*?<\/tr>/gi)){
      const rowHtml=rm[0];
      const cells=[...rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(m=>stripTags(m[1])).filter(Boolean);
      if(cells.length) rows.push(cells);
    }
    if(rows.length) tables.push(rows);
  }
  return tables;
}
function candidateRowsFromTables(html){
  const out=[];
  const tables=parseTables(html);
  for(const [ti,rows] of tables.entries()){
    const candidates=[];
    for(const cells of rows){
      const joined=cells.join(" | ");
      if(!/\d/.test(joined)) continue;
      let pos=null, team=null;
      for(const c of cells){
        const m=clean(c).match(/^(\d{1,3})(?:\.|\)|\s)?$/);
        if(m && pos===null) pos=Number(m[1]);
      }
      for(const c of cells){
        const cc=clean(c);
        if(cc.length>=2 && cc.length<=70 && !/^\d+$/.test(cc) && !/^(team|club|played|points|pts|w|d|l|gd|form|rank|#)$/i.test(cc)){
          team=cc; break;
        }
      }
      const numericCount=cells.filter(c=>/^-?\d{1,3}$/.test(clean(c))).length;
      if(pos!==null && team && numericCount>=2) candidates.push({position:pos,teamName:team,cells});
    }
    const uniqTeams=new Set(candidates.map(r=>r.teamName.toLowerCase()));
    const posSet=new Set(candidates.map(r=>r.position));
    const contiguous=[...Array(Math.min(uniqTeams.size,30)).keys()].map(i=>i+1).filter(n=>posSet.has(n)).length;
    if(candidates.length>=6 && uniqTeams.size>=6 && contiguous>=5){
      out.push({tableIndex:ti,rowCount:candidates.length,uniqueTeamCount:uniqTeams.size,contiguousPositions:contiguous,rows:candidates.slice(0,40)});
    }
  }
  out.sort((a,b)=>(b.contiguousPositions-a.contiguousPositions)||(b.uniqueTeamCount-a.uniqueTeamCount)||(b.rowCount-a.rowCount));
  return out;
}
async function curlFetch(target){
  fs.mkdirSync(responseDir,{recursive:true});
  const outputFile=path.join(responseDir,`${target.competitionSlug}-${sha(target.url)}.body`);
  const args=[
    "--location","--silent","--show-error","--max-time","18",
    "--connect-timeout","7",
    "--compressed",
    "--header","Accept: text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "--header","User-Agent: Mozilla/5.0 controlled-football-truth-trusted-fallback-salvage",
    "--output",outputFile,
    "--write-out","%{http_code} %{content_type} %{url_effective}",
    target.url
  ];
  return await new Promise(resolve=>{
    const p=spawn("curl",args,{stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    p.stdout.on("data",d=>stdout+=d.toString());
    p.stderr.on("data",d=>stderr+=d.toString());
    p.on("close",code=>{
      const [httpCode,...rest]=stdout.trim().split(/\s+/);
      const contentType=rest[0]||"";
      let text="";
      try{ text=fs.existsSync(outputFile)?fs.readFileSync(outputFile,"utf8"):""; }catch{}
      resolve({...target,curlExitCode:code,httpCode:Number(httpCode)||0,contentType,stderr:stderr.slice(0,500),responseBytes:Buffer.byteLength(text),responseSha256:sha(text),responseFile:path.relative(".",outputFile),text});
    });
  });
}
async function pool(items,limit,worker){
  const results=[]; let i=0;
  await Promise.all(Array.from({length:Math.max(1,limit)},async()=>{
    while(i<items.length){ const idx=i++; results[idx]=await worker(items[idx],idx); }
  }));
  return results;
}

const covered=new Set();
if(fs.existsSync(stateDir)){
  for(const f of fs.readdirSync(stateDir).filter(f=>f.endsWith(".json"))){
    const txt=fs.readFileSync(path.join(stateDir,f),"utf8");
    for(const m of txt.matchAll(/"competitionSlug"\s*:\s*"([^"]+)"/g)) covered.add(m[1]);
    for(const m of txt.matchAll(/"rowsByCompetition"\s*:\s*\{([\s\S]*?)\}/g)){
      for(const s of m[1].matchAll(/"([^"]+)"\s*:/g)) covered.add(s[1]);
    }
  }
}

const jsonFiles=walkFiles(diagRoot,p=>p.endsWith(".json"));
const targetMap=new Map();
for(const file of jsonFiles){
  let j; try{ j=readJson(file); }catch{ continue; }
  for(const o of collectObjects(j)){
    const slug=slugOf(o);
    if(!slug || covered.has(slug) || !/\.\d+$/.test(slug)) continue;
    const strings=collectStrings(o);
    for(const s of strings){
      for(const url of extractUrlsFromString(s)){
        const host=getHost(url);
        if(!trustedHost(host)) continue;
        const score=urlScore(url,host);
        if(score<40) continue;
        const key=`${slug} ${url}`;
        if(!targetMap.has(key)){
          targetMap.set(key,{competitionSlug:slug,url,host,sourceFile:path.relative(".",file),score});
        }
      }
    }
  }
}
const targets=[...targetMap.values()].sort((a,b)=>b.score-a.score).slice(0,maxTargets);

const checks=[];
function check(name,passed,details={}){ checks.push({name,passed:Boolean(passed),...details}); }
check("allowExecuteFlagPresent", allowExecute);
check("allowFetchFlagPresent", allowFetch);
check("targetCountPositive", targets.length>0, {targetCount:targets.length});
check("noSearchInThisJob", true);
check("noCanonicalProductionTruthWrite", true);

const preflightBlockedCount=checks.filter(c=>!c.passed).length;

if(preflightBlockedCount){
  const output={status:"blocked_preflight",checks,targets:targets.slice(0,50),summary:{status:"blocked_preflight",targetCount:targets.length,fetchExecutedNowCount:0,searchExecutedNowCount:0,broadSearchExecutedNowCount:0,canonicalWriteExecutedNowCount:0,productionWriteExecutedNowCount:0,truthAssertionExecutedNowCount:0,preflightBlockedCount}};
  writeJson(outPath,output);
  console.log(JSON.stringify(output.summary,null,2));
  process.exitCode=1;
} else {
  console.log(JSON.stringify({phase:"fetch_start",targetCount:targets.length,competitionCount:new Set(targets.map(t=>t.competitionSlug)).size,concurrency,noSearch:true,noCanonicalWrite:true,noProductionWrite:true,noTruthAssertion:true},null,2));
  const fetched=await pool(targets,concurrency,curlFetch);
  const results=fetched.map(r=>{
    const candidates = r.httpCode>=200 && r.httpCode<300 ? candidateRowsFromTables(r.text) : [];
    const best=candidates[0]||null;
    const status = best ? "accepted_generic_table_candidate_requires_quality_gate" : (r.httpCode>=200&&r.httpCode<300 ? "fetched_2xx_no_generic_table" : "fetch_not_2xx_or_curl_failed");
    const {text,...rest}=r;
    return {...rest,status,candidateTableCount:candidates.length,bestCandidateTable:best};
  });
  const accepted=results.filter(r=>r.status==="accepted_generic_table_candidate_requires_quality_gate");
  const acceptedByComp=new Map();
  for(const r of accepted){
    if(!acceptedByComp.has(r.competitionSlug) || (r.bestCandidateTable?.rowCount??0) > (acceptedByComp.get(r.competitionSlug).bestCandidateTable?.rowCount??0)){
      acceptedByComp.set(r.competitionSlug,r);
    }
  }
  const output={
    status:"passed",
    generatedAtUtc:new Date().toISOString(),
    targets,
    results,
    acceptedBestByCompetition:[...acceptedByComp.values()],
    checks,
    safety:{noSearchInThisJob:true,noBroadSearchInThisJob:true,noCanonicalWriteInThisJob:true,noProductionWriteInThisJob:true,noTruthAssertionInThisJob:true},
    summary:{
      status:"passed",
      targetCount:targets.length,
      targetCompetitionCount:new Set(targets.map(t=>t.competitionSlug)).size,
      fetched2xxCount:results.filter(r=>r.httpCode>=200&&r.httpCode<300).length,
      acceptedGenericRowsTargetCount:accepted.length,
      acceptedGenericRowsCompetitionCount:acceptedByComp.size,
      totalGenericCandidateRows:[...acceptedByComp.values()].reduce((s,r)=>s+(r.bestCandidateTable?.rowCount??0),0),
      resultRowsByStatus:results.reduce((a,r)=>{a[r.status]=(a[r.status]||0)+1;return a;},{}),
      fetchExecutedNowCount:results.length,
      searchExecutedNowCount:0,
      broadSearchExecutedNowCount:0,
      canonicalWriteExecutedNowCount:0,
      productionWriteExecutedNowCount:0,
      truthAssertionExecutedNowCount:0,
      preflightBlockedCount
    }
  };
  writeJson(outPath,output);
  console.log(JSON.stringify(output.summary,null,2));
}
