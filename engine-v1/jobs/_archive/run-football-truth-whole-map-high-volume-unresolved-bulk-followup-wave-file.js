import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const concurrency = Number(process.argv.find(a=>a.startsWith("--concurrency="))?.split("=")[1] ?? 14);
const maxUrls = Number(process.argv.find(a=>a.startsWith("--max-urls="))?.split("=")[1] ?? 650);

const probeResultBoardPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-controlled-probe-result-board-2026-06-16","whole-map-high-volume-controlled-probe-result-board-2026-06-16.json");
const contractRecoveryPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16.json");
const allLanesPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-all-lanes-board-2026-06-16","whole-map-high-volume-all-lanes-board-2026-06-16.json");
const outputDir = path.join("data","football-truth","_diagnostics","whole-map-high-volume-unresolved-bulk-followup-wave-2026-06-16");
const responseDir = path.join(outputDir,"responses");
const outputPath = path.join(outputDir,"whole-map-high-volume-unresolved-bulk-followup-wave-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function sha256Buffer(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function safe(v){return String(v??"").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,120);}
function uniq(values){return [...new Set(values.filter(Boolean).map(String))];}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function readJson(p){
  const text = fs.readFileSync(p,"utf8");
  return { text, json: JSON.parse(text), sha: sha256Text(text) };
}

function originOf(url){
  try { return new URL(url).origin; } catch { return null; }
}

function hostOf(url){
  try { return new URL(url).hostname; } catch { return "unknown"; }
}

function absUrl(value, base){
  try { return new URL(value, base).toString(); } catch { return null; }
}

function routeSeedsFor(row){
  const bases = uniq([row.sourceUrl,row.finalUrl,row.probeUrl].map(originOf));
  const suffixes = [
    "/robots.txt",
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/wp-sitemap.xml",
    "/sitemap/sitemap-index.xml",
    "/standings",
    "/standings/",
    "/table",
    "/table/",
    "/league-table",
    "/league-table/",
    "/ranking",
    "/ranking/",
    "/rankings",
    "/rankings/",
    "/tabelle",
    "/tabelle/",
    "/classement",
    "/classement/",
    "/klassement",
    "/klassement/",
    "/ladder",
    "/ladder/",
    "/competition/standings",
    "/competitions/standings",
    "/api/standings",
    "/api/table",
    "/api/ranking",
    "/graphql",
    "/wp-json/wp/v2/search?search=standings",
    "/wp-json/wp/v2/search?search=table",
    "/wp-json/wp/v2/search?search=league"
  ];
  return bases.flatMap(base => suffixes.map(s => absUrl(s, base))).filter(Boolean);
}

function parseWriteOut(stdout){
  const text = String(stdout ?? "");
  return {
    httpStatus: Number(text.match(/HTTP=(\d{3})/)?.[1] ?? 0),
    finalUrl: text.match(/FINAL=([^\s]+)/)?.[1] ?? null,
    contentType: text.match(/TYPE=([^\n\r]+?) SIZE=/)?.[1]?.trim() ?? null,
    sizeDownload: Number(text.match(/SIZE=([0-9.]+)/)?.[1] ?? 0),
    timeTotal: Number(text.match(/TIME=([0-9.]+)/)?.[1] ?? 0)
  };
}

function decode(v){
  return String(v??"")
    .replace(/&quot;/g,'"')
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&nbsp;/g," ")
    .replace(/\\u002F/g,"/")
    .replace(/\\u003C/g,"<")
    .replace(/\\u003E/g,">")
    .replace(/\\u0026/g,"&")
    .replace(/\\"/g,'"');
}

function stripTags(v){
  return decode(v)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function parseHtmlRows(text){
  return [...String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(m=>[...m[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c=>stripTags(c[1])).filter(Boolean))
    .filter(cells=>cells.length>=3);
}

function endpointHints(text, base){
  const decoded = decode(text);
  const urls = [...decoded.matchAll(/https?:\/\/[^"'\\\s<>)]+/gi)].map(m=>m[0]);
  const paths = [...decoded.matchAll(/["'`]((?:\/api\/|\/graphql|\/data\/|\/_next\/data\/|\/wp-json\/|\/ajax\/|\/standings|\/table|\/ranking|\/tabelle|\/classement)[^"'`\\\s<>)]+)["'`]/gi)].map(m=>absUrl(m[1], base)).filter(Boolean);
  return uniq([...urls,...paths].filter(v=>/api|graphql|data|stand|table|ranking|tabelle|classement|team|club|season|competition|fixture|standing|league/i.test(v))).slice(0,30);
}

function inspect(text, contentType, base){
  const lower = decode(text).toLowerCase();
  const title = String(text).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g," ").trim() ?? "";
  const htmlTableRowCount = parseHtmlRows(text).length;
  const hints = endpointHints(text, base);

  const signals = {
    sitemap: /xml/i.test(contentType??"") && lower.includes("<urlset"),
    robots: lower.includes("sitemap:") || lower.includes("user-agent:"),
    json: /json/i.test(contentType??"") || /^[\s{\[]/.test(String(text).slice(0,40)),
    graphql: lower.includes("graphql"),
    api: lower.includes("api"),
    standings: lower.includes("standings") || lower.includes("standing"),
    table: lower.includes("table"),
    ranking: lower.includes("ranking"),
    tabelle: lower.includes("tabelle"),
    classement: lower.includes("classement"),
    klassement: lower.includes("klassement"),
    team: lower.includes("team") || lower.includes("club"),
    points: lower.includes("points") || lower.includes("pts") || lower.includes("punkte")
  };

  const score =
    Object.values(signals).filter(Boolean).length +
    Math.min(hints.length, 8) +
    (htmlTableRowCount >= 6 ? 3 : 0);

  let followupStatus = "fetched_2xx_no_followup_signal";
  if(score >= 11 || (signals.json && (signals.standings || signals.team || signals.points))) followupStatus = "accepted_followup_strong_signal_requires_parser";
  else if(score >= 5 || hints.length >= 3 || signals.sitemap || signals.robots) followupStatus = "review_followup_weak_signal";

  return { title, score, htmlTableRowCount, endpointHintCount:hints.length, endpointHints:hints, signals, followupStatus, first300:String(text).slice(0,300).replace(/\s+/g," ") };
}

function buildUnresolvedRows(probeBoard, recoveryBoard, allLanes){
  const rows = [];

  for(const r of probeBoard.resultRows ?? []){
    if(r.nextAllowedAction?.mayBuildRouteRepairFollowup || r.nextAllowedAction?.mayBuildProbeResultReview){
      rows.push({
        sourceGroup:"probe_result_unresolved",
        competitionSlug:r.competitionSlug,
        countryCode:r.countryCode,
        unresolvedKind:r.nextAllowedAction?.mayBuildProbeResultReview ? "probe_result_review" : "route_repair_followup",
        sourceUrl:r.sourceUrl,
        finalUrl:r.finalUrl,
        probeUrl:r.probeUrl,
        previousStatus:r.laneStatus ?? r.bestProbeStatus ?? null
      });
    }
  }

  for(const r of recoveryBoard.recoveredRows ?? []){
    if(r.nextAllowedAction?.mayBuildParserReview || r.nextAllowedAction?.mayBuildParserContractFollowup || r.nextAllowedAction?.mayBuildContractRouteRepairFollowup){
      rows.push({
        sourceGroup:"contract_recovery_unresolved",
        competitionSlug:r.competitionSlug,
        countryCode:r.countryCode,
        unresolvedKind:
          r.nextAllowedAction?.mayBuildParserReview ? "parser_review" :
          r.nextAllowedAction?.mayBuildParserContractFollowup ? "parser_contract_followup" :
          "contract_route_repair_followup",
        sourceUrl:r.probeUrl,
        finalUrl:r.finalUrl,
        probeUrl:r.probeUrl,
        previousStatus:r.recoveredStatus
      });
    }
  }

  for(const r of allLanes.laneRows ?? []){
    if(r.laneKind==="parser_review" || r.laneKind==="weak_route_review"){
      rows.push({
        sourceGroup:"all_lanes_unresolved_review",
        competitionSlug:r.competitionSlug,
        countryCode:r.countryCode,
        unresolvedKind:r.laneKind,
        sourceUrl:r.sourceUrl,
        finalUrl:r.finalUrl,
        probeUrl:r.finalUrl ?? r.sourceUrl,
        previousStatus:r.laneStatus
      });
    }
  }

  const byKey = new Map();
  for(const r of rows){
    const key = `${r.competitionSlug}:${r.sourceGroup}:${r.unresolvedKind}`;
    if(!byKey.has(key)) byKey.set(key,r);
  }
  return [...byKey.values()];
}

function buildProbeRows(unresolvedRows){
  const rows = [];
  for(const row of unresolvedRows){
    const seeds = routeSeedsFor(row);
    for(const [i,url] of seeds.entries()){
      rows.push({
        competitionSlug:row.competitionSlug,
        countryCode:row.countryCode,
        sourceGroup:row.sourceGroup,
        unresolvedKind:row.unresolvedKind,
        probePriority:i+1,
        probeUrl:url,
        seedHost:hostOf(url),
        previousStatus:row.previousStatus
      });
    }
  }
  const seen = new Set();
  return rows.filter(r=>{
    const key=`${r.competitionSlug} ${r.probeUrl}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,maxUrls);
}

function runCurl(row,index){
  return new Promise(resolve=>{
    const outFile = path.join(responseDir,`${String(index+1).padStart(4,"0")}-${safe(row.competitionSlug)}-${safe(row.unresolvedKind)}-${safe(row.seedHost)}.txt`);
    const curlArgs = [
      "--location","--ipv4","--http1.1",
      "--connect-timeout","3",
      "--max-time","7",
      "--max-filesize","1000000",
      "--silent","--show-error",
      "--header","Accept: application/json,text/html,application/xhtml+xml,application/xml,text/xml,*/*;q=0.8",
      "--header","Accept-Language: en-US,en;q=0.9",
      "--header","User-Agent: Mozilla/5.0 controlled-football-truth-unresolved-bulk-followup",
      "--output",outFile,
      "--write-out","HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
      row.probeUrl
    ];

    const child = spawn("curl.exe",curlArgs,{windowsHide:true});
    let stdout="", stderr="";
    child.stdout.on("data",d=>stdout+=d.toString());
    child.stderr.on("data",d=>stderr+=d.toString());
    child.on("error",err=>resolve({...row,followupStatus:"curl_spawn_error",httpStatus:0,finalUrl:null,contentType:null,outputFile:outFile,outputSize:0,curlExitCode:null,curlError:String(err.message??err)}));
    child.on("close",(code,signal)=>{
      const parsed = parseWriteOut(stdout);
      const exists = fs.existsSync(outFile);
      const buffer = exists ? fs.readFileSync(outFile) : Buffer.from("");
      const text = buffer.toString("utf8");
      const httpOk = parsed.httpStatus >= 200 && parsed.httpStatus < 300;
      const inspection = httpOk ? inspect(text, parsed.contentType, parsed.finalUrl ?? row.probeUrl) : null;

      let followupStatus = "followup_fetch_not_2xx";
      if(httpOk) followupStatus = inspection.followupStatus;
      else if(parsed.httpStatus===404) followupStatus = "followup_route_not_found";
      else if(code!==0) followupStatus = "followup_curl_nonzero_or_timeout";

      resolve({
        ...row,
        followupStatus,
        httpStatus:parsed.httpStatus,
        finalUrl:parsed.finalUrl,
        contentType:parsed.contentType,
        outputFile:outFile,
        outputSize:buffer.length,
        outputSha256:buffer.length?sha256Buffer(buffer):null,
        curlExitCode:code,
        curlSignal:signal,
        curlStderr:stderr,
        inspection,
        nextAllowedAction:{
          mayBuildParserBoard:followupStatus==="accepted_followup_strong_signal_requires_parser",
          mayBuildReviewBoard:followupStatus==="review_followup_weak_signal",
          mayKeepUnresolved:followupStatus!=="accepted_followup_strong_signal_requires_parser" && followupStatus!=="review_followup_weak_signal",
          mayWriteCanonicalNow:false,
          mayWriteProductionNow:false,
          mayAssertTruthNow:false
        }
      });
    });
  });
}

async function pool(items,limit,worker){
  const results=[];
  let i=0;
  await Promise.all(Array.from({length:Math.max(1,limit)},async()=>{
    while(i<items.length){
      const idx=i++;
      results[idx]=await worker(items[idx],idx);
    }
  }));
  return results;
}

for(const p of [probeResultBoardPath, contractRecoveryPath, allLanesPath]){
  if(!fs.existsSync(p)) throw new Error(`Missing input: ${p}`);
}

const probeBoard = readJson(probeResultBoardPath);
const recoveryBoard = readJson(contractRecoveryPath);
const allLanes = readJson(allLanesPath);

const unresolvedRows = buildUnresolvedRows(probeBoard.json, recoveryBoard.json, allLanes.json);
const probeRows = buildProbeRows(unresolvedRows);

const checks=[];
check(checks,"allowExecuteFlagPresent",allowExecute);
check(checks,"allowFetchFlagPresent",allowFetch);
check(checks,"sourceProbeBoardPassed",probeBoard.json.summary?.status==="passed",{actual:probeBoard.json.summary?.status});
check(checks,"sourceRecoveryBoardPassed",recoveryBoard.json.summary?.status==="passed",{actual:recoveryBoard.json.summary?.status});
check(checks,"sourceAllLanesPassed",allLanes.json.summary?.status==="passed",{actual:allLanes.json.summary?.status});
check(checks,"unresolvedRowsAtLeastForty",unresolvedRows.length>=40,{actual:unresolvedRows.length});
check(checks,"probeRowsAtLeastSixHundred",probeRows.length>=600,{actual:probeRows.length});
check(checks,"noSearchNoWriteInThisRunner",true);
check(checks,"productionAndTruthLocked",true);

const preflightBlockedCount = checks.filter(c=>!c.passed).length;

if(preflightBlockedCount || !allowExecute || !allowFetch){
  const output = {output:outputPath,job:"run-football-truth-whole-map-high-volume-unresolved-bulk-followup-wave-file",status:"blocked_preflight",checks,unresolvedRows,probeRows:[],resultRows:[],bestRows:[],summary:{status:"blocked_preflight",unresolvedCompetitionCount:uniq(unresolvedRows.map(r=>r.competitionSlug)).length,unresolvedRowCount:unresolvedRows.length,plannedProbeRowCount:probeRows.length,fetchExecutedNowCount:0,searchExecutedNowCount:0,broadSearchExecutedNowCount:0,canonicalWriteExecutedNowCount:0,productionWriteExecutedNowCount:0,truthAssertionExecutedNowCount:0,preflightBlockedCount}};
  writeJson(outputPath,output);
  console.log(JSON.stringify(output.summary,null,2));
  process.exitCode=1;
} else {
  fs.mkdirSync(responseDir,{recursive:true});
  console.log(JSON.stringify({phase:"fetch_start",unresolvedRows:unresolvedRows.length,plannedProbeRowCount:probeRows.length,concurrency,noSearch:true,noCanonicalWrite:true,noProductionWrite:true,noTruthAssertion:true}));
  const resultRows = await pool(probeRows,concurrency,runCurl);
  const bestRows = uniq(resultRows.map(r=>r.competitionSlug)).map(slug=>{
    const rows = resultRows.filter(r=>r.competitionSlug===slug).sort((a,b)=>
      (b.inspection?.score ?? -1) - (a.inspection?.score ?? -1) ||
      (b.httpStatus>=200&&b.httpStatus<300?1:0) - (a.httpStatus>=200&&a.httpStatus<300?1:0)
    );
    const best = rows[0];
    return {
      competitionSlug:slug,
      countryCode:best.countryCode,
      sourceGroup:best.sourceGroup,
      unresolvedKind:best.unresolvedKind,
      bestFollowupStatus:best.followupStatus,
      httpStatus:best.httpStatus,
      score:best.inspection?.score ?? null,
      htmlTableRowCount:best.inspection?.htmlTableRowCount ?? null,
      endpointHintCount:best.inspection?.endpointHintCount ?? null,
      title:best.inspection?.title ?? null,
      probeUrl:best.probeUrl,
      finalUrl:best.finalUrl,
      outputFile:best.outputFile,
      inspection:best.inspection
    };
  });

  const output = {
    output:outputPath,
    job:"run-football-truth-whole-map-high-volume-unresolved-bulk-followup-wave-file",
    generatedAtUtc:new Date().toISOString(),
    sourceProbeResultBoardPath:probeResultBoardPath,
    sourceProbeResultBoardSha256:probeBoard.sha,
    sourceContractRecoveryPath:contractRecoveryPath,
    sourceContractRecoverySha256:recoveryBoard.sha,
    sourceAllLanesPath:allLanesPath,
    sourceAllLanesSha256:allLanes.sha,
    policy:{unresolvedBulkFollowupWaveOnly:true,noSearchInThisJob:true,noBroadSearchInThisJob:true,noCanonicalWriteInThisJob:true,noProductionWriteInThisJob:true,noTruthAssertionInThisJob:true},
    checks,
    unresolvedRows,
    probeRows,
    resultRows,
    bestRows,
    summary:{
      status:"passed",
      unresolvedRowCount:unresolvedRows.length,
      unresolvedCompetitionCount:uniq(unresolvedRows.map(r=>r.competitionSlug)).length,
      unresolvedRowsByKind:countBy(unresolvedRows,"unresolvedKind"),
      plannedProbeRowCount:probeRows.length,
      plannedCompetitionCount:uniq(probeRows.map(r=>r.competitionSlug)).length,
      plannedCountryCount:uniq(probeRows.map(r=>r.countryCode)).length,
      fetchExecutedNowCount:resultRows.length,
      fetched2xxCount:resultRows.filter(r=>r.httpStatus>=200&&r.httpStatus<300).length,
      resultRowsByStatus:countBy(resultRows,"followupStatus"),
      bestCompetitionCount:bestRows.length,
      bestRowsByStatus:countBy(bestRows,"bestFollowupStatus"),
      strongFollowupCompetitionCount:bestRows.filter(r=>r.bestFollowupStatus==="accepted_followup_strong_signal_requires_parser").length,
      weakFollowupCompetitionCount:bestRows.filter(r=>r.bestFollowupStatus==="review_followup_weak_signal").length,
      mayBuildUnresolvedFollowupResultBoardCount:bestRows.length>0?1:0,
      mayBuildParserBoardCount:bestRows.some(r=>r.bestFollowupStatus==="accepted_followup_strong_signal_requires_parser")?1:0,
      mayBuildReviewBoardCount:bestRows.some(r=>r.bestFollowupStatus==="review_followup_weak_signal")?1:0,
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
