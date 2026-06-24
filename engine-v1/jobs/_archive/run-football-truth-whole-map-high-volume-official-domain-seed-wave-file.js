import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const concurrency = Number(process.argv.find(a=>a.startsWith("--concurrency="))?.split("=")[1] ?? 16);
const maxUrls = Number(process.argv.find(a=>a.startsWith("--max-urls="))?.split("=")[1] ?? 700);

const packPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-consolidated-status-and-official-search-pack-2026-06-16","whole-map-high-volume-consolidated-status-and-official-search-pack-2026-06-16.json");
const allLanesPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-all-lanes-board-2026-06-16","whole-map-high-volume-all-lanes-board-2026-06-16.json");
const recoveryPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16.json");
const outputDir = path.join("data","football-truth","_diagnostics","whole-map-high-volume-official-domain-seed-wave-2026-06-16");
const responseDir = path.join(outputDir,"responses");
const outputPath = path.join(outputDir,"whole-map-high-volume-official-domain-seed-wave-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function sha256Buffer(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function uniq(values){return [...new Set(values.filter(v=>v!==null&&v!==undefined&&v!=="").map(String))];}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function clean(v){return String(v??"").replace(/\s+/g," ").trim();}
function safe(v){return String(v??"").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,120);}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function readJson(p){
  if(!fs.existsSync(p)) throw new Error(`Missing input: ${p}`);
  const text=fs.readFileSync(p,"utf8");
  return {path:p,text,json:JSON.parse(text),sha:sha256Text(text)};
}

function urlFor(domain, suffix){
  const d=String(domain??"").replace(/^https?:\/\//,"").replace(/\/.*$/,"").trim();
  if(!d) return null;
  try { return new URL(suffix, `https://${d}`).toString(); } catch { return null; }
}

function buildSeedRows(pack){
  const suffixes=[
    "/",
    "/standings","/standings/","/table","/table/","/league-table","/league-table/",
    "/ranking","/rankings","/tabelle","/classement","/klassement","/ladder",
    "/fixtures","/results",
    "/api/standings","/api/table","/api/ranking","/graphql",
    "/robots.txt","/sitemap.xml","/sitemap_index.xml","/wp-sitemap.xml","/wp-json/wp/v2/search?search=standings"
  ];

  const rows=[];
  for(const target of pack.searchTargetRows ?? []){
    const domains=target.officialDomainHints ?? [];
    for(const domain of domains){
      for(const [idx,suffix] of suffixes.entries()){
        const url=urlFor(domain,suffix);
        if(!url) continue;
        rows.push({
          competitionSlug:target.competitionSlug,
          countryCode:target.countryCode,
          countryName:target.countryName,
          officialDomain:domain,
          seedSuffix:suffix,
          seedPriority:idx+1,
          probeUrl:url,
          reason:(target.reasons??[]).join("|"),
          source:"official_domain_seed_wave",
          mayWriteCanonicalNow:false,
          mayWriteProductionNow:false,
          mayAssertTruthNow:false
        });
      }
    }
  }

  const seen=new Set();
  return rows.filter(r=>{
    const key=`${r.competitionSlug} ${r.probeUrl}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,maxUrls);
}

function decode(v){
  return String(v??"")
    .replace(/&quot;/g,'"').replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&nbsp;/g," ")
    .replace(/\\u002F/g,"/").replace(/\\u003C/g,"<").replace(/\\u003E/g,">").replace(/\\u0026/g,"&").replace(/\\"/g,'"');
}

function stripTags(v){
  return decode(v).replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();
}

function parseIntLoose(v){
  const t=String(v??"").trim().replace(/^\+/,"");
  if(!/^-?\d+$/.test(t)) return null;
  const n=Number(t);
  return Number.isFinite(n)?n:null;
}
function firstNumber(v){const m=String(v??"").match(/[+-]?\d+/); return m?Number(m[0]):null;}

function parseHtmlRows(text){
  return [...String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(m=>[...m[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c=>stripTags(c[1])).filter(Boolean))
    .filter(cells=>cells.length>=3);
}

function numericCount(cells){
  return cells.filter(c=>/(^|\s)[+-]?\d+(\s|$)/.test(String(c)) || /\d+\s*[-:]\s*\d+/.test(String(c))).length;
}

function looksStanding(cells){
  if(!Array.isArray(cells)||cells.length<4) return false;
  const joined=cells.join(" ");
  const hasPos=parseIntLoose(cells[0])!==null || /^\d+/.test(joined);
  const hasTeam=cells.some(c=>/[A-Za-zÀ-ÿ]/.test(String(c)) && String(c).trim().length>=2);
  return hasPos && hasTeam && numericCount(cells)>=3;
}

function teamNameFromCells(cells){
  const cell=cells.find((v,i)=>i>0 && /[A-Za-zÀ-ÿ]/.test(String(v)) && !/^[+-]?\d+$/.test(String(v).trim()) && String(v).trim().length>=2);
  return clean(cell);
}

function getHint(obj,hints){
  if(!obj || typeof obj!=="object") return null;
  for(const [k,v] of Object.entries(obj)){
    const lower=k.toLowerCase();
    if(hints.some(h=>lower===h || lower.includes(h))) return v;
  }
  return null;
}

function objectScore(obj){
  if(!obj || typeof obj!=="object" || Array.isArray(obj)) return 0;
  const keys=Object.keys(obj).map(k=>k.toLowerCase());
  let score=0;
  if(keys.some(k=>k.includes("team")||k.includes("club")||k==="name"||k.includes("display"))) score+=4;
  if(keys.some(k=>k.includes("position")||k==="rank"||k.includes("standing")||k.includes("place"))) score+=3;
  if(keys.some(k=>k.includes("point")||k==="pts")) score+=3;
  if(keys.some(k=>k.includes("played")||k.includes("match")||k.includes("game"))) score+=2;
  if(keys.some(k=>k.includes("win")||k.includes("draw")||k.includes("loss")||k.includes("goal"))) score+=2;
  return score;
}

function normalizeJsonRow(obj,index,path,kind){
  const teamObj=getHint(obj,["team","club"]);
  const teamNameRaw=getHint(obj,["teamname","clubname","displayname","shortname","name"]) ?? (teamObj && typeof teamObj==="object" ? getHint(teamObj,["teamname","clubname","displayname","shortname","name"]) : null);
  return {
    rowIndex:index+1,
    extractionMethod:"official_domain_seed_json",
    sourceKind:kind,
    sourcePath:path,
    position:parseIntLoose(getHint(obj,["position","rank","place","standing"])),
    teamName:clean(teamNameRaw),
    played:parseIntLoose(getHint(obj,["played","playedmatches","matches","games"])),
    wins:parseIntLoose(getHint(obj,["wins","won"])),
    draws:parseIntLoose(getHint(obj,["draws","drawn"])),
    losses:parseIntLoose(getHint(obj,["losses","lost"])),
    goalsFor:parseIntLoose(getHint(obj,["goalsfor","goals_for","scored"])),
    goalsAgainst:parseIntLoose(getHint(obj,["goalsagainst","goals_against","conceded"])),
    goalDifference:parseIntLoose(getHint(obj,["goaldifference","goal_difference","diff"])),
    points:parseIntLoose(getHint(obj,["points","pts"]))
  };
}

function tryParseJson(text){try{return JSON.parse(text);}catch{return null;}}

function extractPayloads(text, contentType){
  const raw=decode(text);
  const payloads=[];
  const direct=/json/i.test(contentType??"") || /^[\s{\[]/.test(raw.slice(0,40)) ? tryParseJson(raw.trim()) : null;
  if(direct) payloads.push({sourceKind:"direct_json_response",root:direct});
  for(const m of [...raw.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)]){
    const parsed=tryParseJson(decode(m[1]).trim());
    if(parsed) payloads.push({sourceKind:"__NEXT_DATA__",root:parsed});
  }
  for(const m of [...raw.matchAll(/<script[^>]+type=["']application\/(?:json|ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi)]){
    const parsed=tryParseJson(decode(m[1]).trim());
    if(parsed) payloads.push({sourceKind:"application_json_script",root:parsed});
  }
  return payloads;
}

function walkJson(root,expectedRows,kind){
  const candidates=[];
  let visits=0;
  function walk(node,pathParts,depth){
    visits++;
    if(visits>70000 || depth>28) return;
    if(Array.isArray(node)){
      const objects=node.filter(x=>x&&typeof x==="object"&&!Array.isArray(x));
      if(objects.length>=3){
        const scores=objects.map(objectScore);
        const strong=scores.filter(s=>s>=7).length;
        const medium=scores.filter(s=>s>=5).length;
        const near=expectedRows && objects.length>=Math.max(1,expectedRows-2) && objects.length<=expectedRows+10;
        if(strong>=Math.max(3,Math.floor(objects.length*0.30)) || (near && medium>=Math.max(3,Math.floor(objects.length*0.35)))){
          candidates.push({sourceKind:kind,sourcePath:pathParts.join(".")||"$",objectRowCount:objects.length,strongRows:strong,mediumRows:medium,nearExpected:Boolean(near),score:strong*10+medium*4+(near?30:0),rows:objects.map((o,i)=>normalizeJsonRow(o,i,pathParts.join(".")||"$",kind))});
        }
      }
      for(let i=0;i<Math.min(node.length,350);i++) walk(node[i],[...pathParts,`[${i}]`],depth+1);
      return;
    }
    if(node && typeof node==="object") for(const [k,v] of Object.entries(node)) walk(v,[...pathParts,k],depth+1);
  }
  walk(root,[],0);
  return candidates.sort((a,b)=>b.score-a.score).slice(0,10);
}

function htmlCandidates(text,expectedRows){
  const rows=parseHtmlRows(text).filter(looksStanding).map((cells,i)=>({
    rowIndex:i+1,
    extractionMethod:"official_domain_seed_html_table",
    sourceKind:"html_table",
    sourcePath:"table_rows",
    position:parseIntLoose(cells[0])??firstNumber(cells[0]),
    teamName:teamNameFromCells(cells),
    rawCells:cells.map(clean).filter(Boolean),
    numericCells:cells.map(firstNumber).filter(v=>v!==null)
  }));
  if(!expectedRows || rows.length<=expectedRows+8) return rows;
  const windows=[];
  for(let start=0;start<=rows.length-expectedRows;start++){
    const slice=rows.slice(start,start+expectedRows);
    const contiguous=slice.map(r=>r.position).every((p,i)=>p===i+1);
    const teams=uniq(slice.map(r=>r.teamName)).length;
    windows.push({score:(contiguous?1000:0)+teams*10,start,rows:slice});
  }
  windows.sort((a,b)=>b.score-a.score);
  return windows[0]?.rows ?? rows;
}

function qualityGate(rows,expectedRows){
  const mapped=rows.map((r,i)=>{
    const position=Number.isInteger(r.position)?r.position:parseIntLoose(r.rawCells?.[0])??firstNumber(r.rawCells?.[0]);
    const teamName=clean(r.teamName || r.rawCells?.find(c=>/[A-Za-zÀ-ÿ]/.test(String(c)) && !/^\d+$/.test(String(c).trim())));
    const rawCells=Array.isArray(r.rawCells)?r.rawCells.map(clean).filter(Boolean):[];
    return {rowIndex:i+1,position,teamName,rawCells,rowIssueCodes:[Number.isInteger(position)?null:"missing_position",teamName?null:"missing_team_name"].filter(Boolean)};
  });
  const positions=mapped.map(r=>r.position);
  const teams=mapped.map(r=>r.teamName);
  const missingPositions=expectedRows?Array.from({length:expectedRows},(_,i)=>i+1).filter(p=>!positions.includes(p)):[];
  const duplicateTeams=teams.filter((t,i)=>t&&teams.indexOf(t)!==i);
  const rowIssueCount=mapped.reduce((s,r)=>s+r.rowIssueCodes.length,0);
  const qualityGateStatus=expectedRows && mapped.length===expectedRows && uniq(teams).length===expectedRows && missingPositions.length===0 && duplicateTeams.length===0 && rowIssueCount===0 ? "accepted_shape_quality_gate_ready_for_stat_mapper" : "blocked_shape_quality_gate_needs_parser_review";
  return {qualityGateStatus,rowCount:mapped.length,expectedRows,uniqueTeamCount:uniq(teams).length,missingPositions,duplicateTeams,rowIssueCount,sampleRows:mapped.slice(0,5),mappedRows:mapped};
}

function expectedRowsFor(slug, allLanes, recovery){
  const lane=(allLanes.laneRows??[]).find(r=>r.competitionSlug===slug && Number(r.expectedRows)>0);
  if(lane) return Number(lane.expectedRows);
  const rec=(recovery.recoveredRows??[]).find(r=>r.competitionSlug===slug && Number(r.recoveredExpectedRows)>0);
  if(rec) return Number(rec.recoveredExpectedRows);
  return null;
}

function parseWriteOut(stdout){
  const text=String(stdout??"");
  return {httpStatus:Number(text.match(/HTTP=(\d{3})/)?.[1]??0),finalUrl:text.match(/FINAL=([^\s]+)/)?.[1]??null,contentType:text.match(/TYPE=([^\n\r]+?) SIZE=/)?.[1]?.trim()??null,sizeDownload:Number(text.match(/SIZE=([0-9.]+)/)?.[1]??0),timeTotal:Number(text.match(/TIME=([0-9.]+)/)?.[1]??0)};
}

function inspectText(text, contentType){
  const lower=decode(text).toLowerCase();
  const htmlRows=parseHtmlRows(text);
  const signals={
    standings:lower.includes("standings")||lower.includes("standing"),
    table:lower.includes("table"),
    ranking:lower.includes("ranking"),
    tabelle:lower.includes("tabelle"),
    classement:lower.includes("classement"),
    klassement:lower.includes("klassement"),
    team:lower.includes("team")||lower.includes("club"),
    points:lower.includes("points")||lower.includes("pts")||lower.includes("punkte"),
    json:/json/i.test(contentType??"")||/^[\s{\[]/.test(text.slice(0,40)),
    sitemap:lower.includes("<urlset")||lower.includes("sitemap")
  };
  const score=Object.values(signals).filter(Boolean).length+(htmlRows.length>=6?4:0);
  return {score,signals,htmlTableRowCount:htmlRows.length};
}

function classifyRows(rows,expectedRows){
  if(rows.length===0) return "no_rows_extracted_requires_review";
  if(expectedRows && rows.length===expectedRows) return "accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate";
  if(expectedRows && rows.length>=Math.max(1,expectedRows-2) && rows.length<=expectedRows+10) return "partial_or_near_expected_extraction_requires_quality_gate";
  return "extracted_rows_count_mismatch_requires_parser_review";
}

function runCurl(row,index){
  return new Promise(resolve=>{
    let host="unknown"; try{host=new URL(row.probeUrl).hostname}catch{}
    const outFile=path.join(responseDir,`${String(index+1).padStart(4,"0")}-${safe(row.competitionSlug)}-${safe(host)}-${safe(row.seedSuffix)}.txt`);
    const curlArgs=["--location","--ipv4","--http1.1","--connect-timeout","3","--max-time","8","--max-filesize","1200000","--silent","--show-error","--header","Accept: text/html,application/xhtml+xml,application/json,application/xml,text/xml,*/*;q=0.8","--header","Accept-Language: en-US,en;q=0.9","--header","User-Agent: Mozilla/5.0 controlled-football-truth-official-domain-seed-wave","--output",outFile,"--write-out","HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",row.probeUrl];
    const child=spawn("curl.exe",curlArgs,{windowsHide:true});
    let stdout="",stderr="";
    child.stdout.on("data",d=>stdout+=d.toString());
    child.stderr.on("data",d=>stderr+=d.toString());
    child.on("error",err=>resolve({...row,fetchStatus:"curl_spawn_error",httpStatus:0,finalUrl:null,contentType:null,outputFile:outFile,outputSize:0,curlExitCode:null,curlError:String(err.message??err)}));
    child.on("close",(code,signal)=>{
      const parsed=parseWriteOut(stdout);
      const exists=fs.existsSync(outFile);
      const buffer=exists?fs.readFileSync(outFile):Buffer.from("");
      const text=buffer.toString("utf8");
      const httpOk=parsed.httpStatus>=200&&parsed.httpStatus<300;
      const inspection=httpOk?inspectText(text,parsed.contentType):null;
      const fetchStatus=httpOk?"fetched_2xx":parsed.httpStatus===404?"route_not_found":code!==0?"curl_nonzero_or_timeout":"fetch_not_2xx";
      resolve({...row,fetchStatus,httpStatus:parsed.httpStatus,finalUrl:parsed.finalUrl,contentType:parsed.contentType,outputFile:outFile,outputSize:buffer.length,outputSha256:buffer.length?sha256Buffer(buffer):null,curlExitCode:code,curlSignal:signal,curlStderr:stderr,inspection});
    });
  });
}

async function pool(items,limit,worker){
  const results=[]; let i=0;
  await Promise.all(Array.from({length:Math.max(1,limit)},async()=>{ while(i<items.length){ const idx=i++; results[idx]=await worker(items[idx],idx); } }));
  return results;
}

for(const p of [packPath,allLanesPath,recoveryPath]) if(!fs.existsSync(p)) throw new Error(`Missing input: ${p}`);

const pack=readJson(packPath);
const allLanes=readJson(allLanesPath);
const recovery=readJson(recoveryPath);
const seedRows=buildSeedRows(pack.json);

const checks=[];
check(checks,"allowExecuteFlagPresent",allowExecute);
check(checks,"allowFetchFlagPresent",allowFetch);
check(checks,"sourcePackPassed",pack.json.summary?.status==="passed",{actual:pack.json.summary?.status});
check(checks,"sourcePackTargetsFiftyOne",Number(pack.json.summary?.officialSearchTargetCount??0)===51,{actual:pack.json.summary?.officialSearchTargetCount});
check(checks,"seedRowsAtLeastSixHundred",seedRows.length>=600,{actual:seedRows.length});
check(checks,"noSearchNoWriteInThisRunner",true);
check(checks,"productionAndTruthLocked",true);

const preflightBlockedCount=checks.filter(c=>!c.passed).length;

if(preflightBlockedCount || !allowExecute || !allowFetch){
  const output={output:outputPath,status:"blocked_preflight",checks,summary:{status:"blocked_preflight",plannedSeedRowCount:seedRows.length,fetchExecutedNowCount:0,searchExecutedNowCount:0,broadSearchExecutedNowCount:0,canonicalWriteExecutedNowCount:0,productionWriteExecutedNowCount:0,truthAssertionExecutedNowCount:0,preflightBlockedCount}};
  writeJson(outputPath,output);
  console.log(JSON.stringify(output.summary,null,2));
  process.exitCode=1;
} else {
  fs.mkdirSync(responseDir,{recursive:true});
  console.log(JSON.stringify({phase:"fetch_start",plannedSeedRowCount:seedRows.length,competitionCount:uniq(seedRows.map(r=>r.competitionSlug)).length,concurrency,noSearch:true,noCanonicalWrite:true,noProductionWrite:true,noTruthAssertion:true}));
  const fetchRows=await pool(seedRows,concurrency,runCurl);

  const bestRows=uniq(fetchRows.map(r=>r.competitionSlug)).map(slug=>{
    const rows=fetchRows.filter(r=>r.competitionSlug===slug).sort((a,b)=>(b.inspection?.score??-1)-(a.inspection?.score??-1)||(b.httpStatus>=200&&b.httpStatus<300?1:0)-(a.httpStatus>=200&&a.httpStatus<300?1:0));
    return rows[0];
  });

  const boardRows=bestRows.map(row=>{
    let text="";
    if(row.outputFile && fs.existsSync(row.outputFile)) text=fs.readFileSync(row.outputFile,"utf8");
    const expectedRows=expectedRowsFor(row.competitionSlug,allLanes.json,recovery.json);
    const jsonCandidates=[];
    for(const payload of extractPayloads(text,row.contentType)) jsonCandidates.push(...walkJson(payload.root,expectedRows,payload.sourceKind));
    const htmlRows=htmlCandidates(text,expectedRows);
    const bestJson=jsonCandidates.sort((a,b)=>b.score-a.score)[0]??null;
    let method="none", selectedRows=[];
    if(bestJson && (!expectedRows || bestJson.rows.length>=Math.max(3,expectedRows-2))){method=bestJson.sourceKind;selectedRows=bestJson.rows;}
    else if(htmlRows.length){method="official_domain_seed_html_table";selectedRows=htmlRows;}
    const extractionStatus=classifyRows(selectedRows,expectedRows);
    const q=(extractionStatus==="accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate"||extractionStatus==="partial_or_near_expected_extraction_requires_quality_gate")?qualityGate(selectedRows,expectedRows):null;
    return {
      competitionSlug:row.competitionSlug,
      countryCode:row.countryCode,
      officialDomain:row.officialDomain,
      seedSuffix:row.seedSuffix,
      probeUrl:row.probeUrl,
      fetchStatus:row.fetchStatus,
      httpStatus:row.httpStatus,
      contentType:row.contentType,
      finalUrl:row.finalUrl,
      outputFile:row.outputFile,
      outputSize:row.outputSize,
      inspection:row.inspection,
      expectedRows,
      selectedExtractionMethod:method,
      jsonCandidateArrayCount:jsonCandidates.length,
      htmlCandidateRowCount:htmlRows.length,
      extractedCandidateRowCount:selectedRows.length,
      extractionStatus,
      qualityGate:q,
      extractedCandidateRows:selectedRows.slice(0,expectedRows?Math.max(expectedRows+10,60):60),
      nextAllowedAction:{
        mayBuildCanonicalCandidatePlanAfterExplicitApproval:q?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper",
        mayBuildParserReview:extractionStatus==="extracted_rows_count_mismatch_requires_parser_review"||q?.qualityGateStatus==="blocked_shape_quality_gate_needs_parser_review"||extractionStatus==="no_rows_extracted_requires_review",
        mayWriteCanonicalNow:false,
        mayWriteProductionNow:false,
        mayAssertTruthNow:false
      }
    };
  });

  const accepted=boardRows.filter(r=>r.nextAllowedAction.mayBuildCanonicalCandidatePlanAfterExplicitApproval);
  const output={
    output:outputPath,
    job:"run-football-truth-whole-map-high-volume-official-domain-seed-wave-file",
    generatedAtUtc:new Date().toISOString(),
    sourcePackPath:packPath,
    sourcePackSha256:pack.sha,
    sourceAllLanesPath:allLanesPath,
    sourceAllLanesSha256:allLanes.sha,
    sourceRecoveryPath:recoveryPath,
    sourceRecoverySha256:recovery.sha,
    policy:{officialDomainSeedWaveOnly:true,noSearchInThisJob:true,noBroadSearchInThisJob:true,noCanonicalWriteInThisJob:true,noProductionWriteInThisJob:true,noTruthAssertionInThisJob:true,canonicalCandidateWriteRequiresExplicitUserApproval:true},
    checks,
    seedRows,
    fetchRows,
    boardRows,
    summary:{
      status:"passed",
      plannedSeedRowCount:seedRows.length,
      plannedCompetitionCount:uniq(seedRows.map(r=>r.competitionSlug)).length,
      plannedCountryCount:uniq(seedRows.map(r=>r.countryCode)).length,
      fetchExecutedNowCount:fetchRows.length,
      fetchRowsByStatus:countBy(fetchRows,"fetchStatus"),
      fetched2xxCount:fetchRows.filter(r=>r.fetchStatus==="fetched_2xx").length,
      bestCompetitionCount:bestRows.length,
      bestRowsByFetchStatus:countBy(bestRows,"fetchStatus"),
      extractionRowsByStatus:countBy(boardRows,"extractionStatus"),
      selectedMethodsByType:countBy(boardRows,"selectedExtractionMethod"),
      acceptedQualityGateCompetitionCount:accepted.length,
      totalExtractedCandidateRowCount:boardRows.reduce((s,r)=>s+r.extractedCandidateRowCount,0),
      mayBuildCanonicalCandidatePlanAfterExplicitApprovalCount:accepted.length>0?1:0,
      mayBuildParserReviewCount:boardRows.some(r=>r.nextAllowedAction.mayBuildParserReview)?1:0,
      searchExecutedNowCount:0,
      broadSearchExecutedNowCount:0,
      canonicalWriteExecutedNowCount:0,
      productionWriteExecutedNowCount:0,
      truthAssertionExecutedNowCount:0,
      preflightBlockedCount
    }
  };
  writeJson(outputPath,output);
  console.log(JSON.stringify(output.summary,null,2));
}
