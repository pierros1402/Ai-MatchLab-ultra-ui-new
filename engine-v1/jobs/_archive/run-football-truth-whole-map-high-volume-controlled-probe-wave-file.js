import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const concurrency = Number(process.argv.find(a=>a.startsWith("--concurrency="))?.split("=")[1] ?? 10);
const maxUrls = Number(process.argv.find(a=>a.startsWith("--max-urls="))?.split("=")[1] ?? 360);

const inputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-next-execution-wave-plan-2026-06-16","whole-map-high-volume-next-execution-wave-plan-2026-06-16.json");
const outputDir = path.join("data","football-truth","_diagnostics","whole-map-high-volume-controlled-probe-wave-2026-06-16");
const responseDir = path.join(outputDir,"responses");
const outputPath = path.join(outputDir,"whole-map-high-volume-controlled-probe-wave-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function sha256Buffer(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function safe(v){return String(v).replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,140);}
function uniq(values){return [...new Set(values.filter(Boolean).map(String))];}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

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

function stripTags(v){
  return String(v ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/g," ")
    .replace(/&amp;/g,"&")
    .replace(/\s+/g," ")
    .trim();
}

function inspect(text, contentType){
  const lower = String(text).toLowerCase();
  const title = String(text).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g," ").trim() ?? "";
  const tableRows = [...String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(m=>[...m[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c=>stripTags(c[1])).filter(Boolean))
    .filter(cells=>cells.length>=3);

  const signals = {
    json: /json/i.test(contentType ?? "") || /^[\s{\[]/.test(String(text).slice(0,40)),
    standings: lower.includes("standings") || lower.includes("standing"),
    table: lower.includes("table"),
    ranking: lower.includes("ranking"),
    tabelle: lower.includes("tabelle"),
    classement: lower.includes("classement"),
    klassement: lower.includes("klassement"),
    ladder: lower.includes("ladder"),
    team: lower.includes("team") || lower.includes("club"),
    points: lower.includes("points") || lower.includes("pts") || lower.includes("punkte")
  };

  const score = Object.values(signals).filter(Boolean).length + (tableRows.length >= 6 ? 2 : 0);
  let probeStatus = "fetched_2xx_no_standings_signal";
  if(score >= 6) probeStatus = "accepted_probe_strong_signal_requires_parser_board";
  else if(score >= 3) probeStatus = "review_probe_weak_signal";

  return { title, score, tableRowCount: tableRows.length, signals, probeStatus, first300: String(text).slice(0,300).replace(/\s+/g," ") };
}

function buildProbeRows(plan){
  const rows = [];

  for(const row of plan.endpointProbePlanRows ?? []){
    for(const url of row.plannedEndpointProbeUrls ?? []){
      rows.push({competitionSlug:row.competitionSlug,countryCode:row.countryCode,laneType:"endpoint_probe",sourceUrl:row.sourceUrl,probeUrl:url});
    }
  }

  for(const row of plan.assetOrJsProbePlanRows ?? []){
    for(const url of row.plannedProbeSeedUrls ?? []){
      rows.push({competitionSlug:row.competitionSlug,countryCode:row.countryCode,laneType:"asset_or_js_probe",sourceUrl:row.sourceUrl,probeUrl:url});
    }
  }

  for(const row of plan.routeRepairProbePlanRows ?? []){
    for(const url of row.plannedRouteRepairUrls ?? []){
      rows.push({competitionSlug:row.competitionSlug,countryCode:row.countryCode,laneType:row.primaryAction==="build_route_repair_or_js_probe_plan" ? "route_repair_or_js_probe" : "route_repair_probe",sourceUrl:row.sourceUrl,probeUrl:url});
    }
  }

  const seen = new Set();
  return rows.filter(row=>{
    const key = `${row.competitionSlug} ${row.laneType} ${row.probeUrl}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,maxUrls);
}

function runCurl(row,index){
  return new Promise(resolve=>{
    const outFile = path.join(responseDir,`${String(index+1).padStart(4,"0")}-${safe(row.competitionSlug)}-${safe(row.laneType)}-${safe(new URL(row.probeUrl).hostname)}.txt`);
    const curlArgs = [
      "--location","--ipv4","--http1.1",
      "--connect-timeout","3",
      "--max-time","8",
      "--max-filesize","1200000",
      "--silent","--show-error",
      "--header","Accept: text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.7",
      "--header","Accept-Language: en-US,en;q=0.9",
      "--header","User-Agent: Mozilla/5.0 controlled-football-truth-high-volume-probe-wave",
      "--output",outFile,
      "--write-out","HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
      row.probeUrl
    ];

    const child = spawn("curl.exe",curlArgs,{windowsHide:true});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data",d=>stdout+=d.toString());
    child.stderr.on("data",d=>stderr+=d.toString());
    child.on("error",err=>resolve({...row,probeStatus:"curl_spawn_error",httpStatus:0,finalUrl:null,contentType:null,outputFile:outFile,outputSize:0,curlExitCode:null,curlError:String(err.message ?? err)}));
    child.on("close",(code,signal)=>{
      const parsed = parseWriteOut(stdout);
      const exists = fs.existsSync(outFile);
      const buffer = exists ? fs.readFileSync(outFile) : Buffer.from("");
      const text = buffer.toString("utf8");
      const httpOk = parsed.httpStatus >= 200 && parsed.httpStatus < 300;
      const inspection = httpOk ? inspect(text, parsed.contentType) : null;
      let probeStatus = "probe_fetch_not_2xx";
      if(httpOk) probeStatus = inspection.probeStatus;
      else if(parsed.httpStatus === 404) probeStatus = "probe_route_not_found";
      else if(code !== 0) probeStatus = "probe_curl_nonzero_or_timeout";

      resolve({
        ...row,
        probeStatus,
        httpStatus: parsed.httpStatus,
        finalUrl: parsed.finalUrl,
        contentType: parsed.contentType,
        outputFile: outFile,
        outputSize: buffer.length,
        outputSha256: buffer.length ? sha256Buffer(buffer) : null,
        curlExitCode: code,
        curlSignal: signal,
        curlStderr: stderr,
        inspection,
        nextAllowedAction: {
          mayBuildParserBoard: probeStatus === "accepted_probe_strong_signal_requires_parser_board" || probeStatus === "review_probe_weak_signal",
          mayKeepRouteRepairCandidate: probeStatus === "probe_route_not_found" || probeStatus === "probe_fetch_not_2xx" || probeStatus === "probe_curl_nonzero_or_timeout",
          mayWriteCanonicalNow: false,
          mayWriteProductionNow: false,
          mayAssertTruthNow: false
        }
      });
    });
  });
}

async function pool(items,limit,worker){
  const results = [];
  let i = 0;
  await Promise.all(Array.from({length:Math.max(1,limit)},async()=>{
    while(i<items.length){
      const idx = i++;
      results[idx] = await worker(items[idx],idx);
    }
  }));
  return results;
}

if(!fs.existsSync(inputPath)) throw new Error(`Missing next execution wave plan: ${inputPath}`);
const inputText = fs.readFileSync(inputPath,"utf8");
const plan = JSON.parse(inputText);
const probeRows = buildProbeRows(plan);

const checks = [];
check(checks,"allowExecuteFlagPresent",allowExecute);
check(checks,"allowFetchFlagPresent",allowFetch);
check(checks,"sourcePlanPassed",plan.summary?.status==="passed",{actual:plan.summary?.status});
check(checks,"sourceManifestCompetitionCountFiftySix",Number(plan.summary?.manifestCompetitionCount??0)===56,{actual:plan.summary?.manifestCompetitionCount});
check(checks,"plannedProbeRowsAtLeastThreeHundred",probeRows.length>=300,{actual:probeRows.length});
check(checks,"noSearchNoWriteInThisRunner",true);
check(checks,"productionAndTruthLocked",true);

const preflightBlockedCount = checks.filter(c=>!c.passed).length;

if(preflightBlockedCount || !allowExecute || !allowFetch){
  const output = {output:outputPath,job:"run-football-truth-whole-map-high-volume-controlled-probe-wave-file",status:"blocked_preflight",checks,probeRows:[],resultRows:[],summary:{status:"blocked_preflight",plannedProbeRowCount:probeRows.length,fetchExecutedNowCount:0,searchExecutedNowCount:0,broadSearchExecutedNowCount:0,canonicalWriteExecutedNowCount:0,productionWriteExecutedNowCount:0,truthAssertionExecutedNowCount:0,preflightBlockedCount}};
  writeJson(outputPath,output);
  console.log(JSON.stringify(output.summary,null,2));
  process.exitCode=1;
} else {
  fs.mkdirSync(responseDir,{recursive:true});
  console.log(JSON.stringify({phase:"fetch_start",plannedProbeRowCount:probeRows.length,concurrency,noSearch:true,noCanonicalWrite:true,noProductionWrite:true,noTruthAssertion:true}));
  const resultRows = await pool(probeRows,concurrency,runCurl);
  const bestRows = uniq(resultRows.map(r=>r.competitionSlug)).map(slug=>{
    const rows = resultRows.filter(r=>r.competitionSlug===slug).sort((a,b)=>(b.inspection?.score??-1)-(a.inspection?.score??-1) || (b.httpStatus>=200&&b.httpStatus<300)-(a.httpStatus>=200&&a.httpStatus<300));
    const best = rows[0];
    return {competitionSlug:slug,countryCode:best.countryCode,laneType:best.laneType,bestProbeStatus:best.probeStatus,httpStatus:best.httpStatus,score:best.inspection?.score??null,tableRowCount:best.inspection?.tableRowCount??null,title:best.inspection?.title??null,probeUrl:best.probeUrl,finalUrl:best.finalUrl,outputFile:best.outputFile};
  });

  const output = {
    output: outputPath,
    job: "run-football-truth-whole-map-high-volume-controlled-probe-wave-file",
    generatedAtUtc: new Date().toISOString(),
    sourcePlanPath: inputPath,
    sourcePlanSha256: sha256Text(inputText),
    policy: {controlledProbeWaveOnly:true,noSearchInThisJob:true,noBroadSearchInThisJob:true,noCanonicalWriteInThisJob:true,noProductionWriteInThisJob:true,noTruthAssertionInThisJob:true},
    checks,
    probeRows,
    resultRows,
    bestRows,
    summary: {
      status: "passed",
      plannedProbeRowCount: probeRows.length,
      plannedCompetitionCount: uniq(probeRows.map(r=>r.competitionSlug)).length,
      plannedCountryCount: uniq(probeRows.map(r=>r.countryCode)).length,
      probeRowsByLaneType: countBy(probeRows,"laneType"),
      fetchExecutedNowCount: resultRows.length,
      fetched2xxCount: resultRows.filter(r=>r.httpStatus>=200&&r.httpStatus<300).length,
      resultRowsByStatus: countBy(resultRows,"probeStatus"),
      bestCompetitionCount: bestRows.length,
      bestRowsByStatus: countBy(bestRows,"bestProbeStatus"),
      strongSignalCompetitionCount: bestRows.filter(r=>r.bestProbeStatus==="accepted_probe_strong_signal_requires_parser_board").length,
      weakSignalCompetitionCount: bestRows.filter(r=>r.bestProbeStatus==="review_probe_weak_signal").length,
      mayBuildHighVolumeProbeResultParserBoardCount: bestRows.some(r=>r.bestProbeStatus==="accepted_probe_strong_signal_requires_parser_board"||r.bestProbeStatus==="review_probe_weak_signal") ? 1 : 0,
      mayBuildRouteRepairFollowupCount: bestRows.some(r=>r.bestProbeStatus!=="accepted_probe_strong_signal_requires_parser_board"&&r.bestProbeStatus!=="review_probe_weak_signal") ? 1 : 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      truthAssertionExecutedNowCount: 0,
      preflightBlockedCount
    }
  };

  writeJson(outputPath,output);
  console.log(JSON.stringify(output.summary,null,2));
}
