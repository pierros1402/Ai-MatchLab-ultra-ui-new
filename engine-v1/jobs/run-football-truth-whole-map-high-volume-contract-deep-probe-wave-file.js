import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowFetch = args.has("--allow-fetch");
const concurrency = Number(process.argv.find(a => a.startsWith("--concurrency="))?.split("=")[1] ?? 12);
const maxUrls = Number(process.argv.find(a => a.startsWith("--max-urls="))?.split("=")[1] ?? 444);

const inputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-deep-probe-plan-2026-06-16","whole-map-high-volume-contract-deep-probe-plan-2026-06-16.json");
const outputDir = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-deep-probe-wave-2026-06-16");
const responseDir = path.join(outputDir,"responses");
const outputPath = path.join(outputDir,"whole-map-high-volume-contract-deep-probe-wave-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function sha256Buffer(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function safe(v){return String(v ?? "").replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,120);}
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

function decode(v){
  return String(v ?? "")
    .replace(/&quot;/g,'"')
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&nbsp;/g," ")
    .replace(/\\u002F/g,"/")
    .replace(/\\u003C/g,"<")
    .replace(/\\u003E/g,">")
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
    .map(m => [...m[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c => stripTags(c[1])).filter(Boolean))
    .filter(cells => cells.length >= 3);
}

function tryParseJson(text){
  try { return JSON.parse(text); } catch { return null; }
}

function objectScore(obj){
  if(!obj || typeof obj !== "object" || Array.isArray(obj)) return 0;
  const keys = Object.keys(obj).map(k => k.toLowerCase());
  let score = 0;
  if(keys.some(k => k.includes("team") || k.includes("club") || k === "name" || k.includes("displayname"))) score += 4;
  if(keys.some(k => k.includes("position") || k === "rank" || k.includes("standing") || k.includes("place"))) score += 3;
  if(keys.some(k => k.includes("point") || k === "pts")) score += 3;
  if(keys.some(k => k.includes("played") || k.includes("match") || k.includes("game"))) score += 2;
  if(keys.some(k => k.includes("win") || k.includes("draw") || k.includes("loss") || k.includes("goal"))) score += 2;
  return score;
}

function walkJson(root){
  let visits = 0;
  const candidates = [];
  function walk(node,pathParts,depth){
    visits++;
    if(visits > 60000 || depth > 28) return;
    if(Array.isArray(node)){
      const objects = node.filter(x => x && typeof x === "object" && !Array.isArray(x));
      if(objects.length >= 3){
        const scores = objects.map(objectScore);
        const strong = scores.filter(s => s >= 7).length;
        const medium = scores.filter(s => s >= 5).length;
        if(strong >= Math.max(3, Math.floor(objects.length * 0.30)) || medium >= Math.max(4, Math.floor(objects.length * 0.45))){
          candidates.push({
            sourcePath: pathParts.join(".") || "$",
            objectRowCount: objects.length,
            strongRows: strong,
            mediumRows: medium,
            score: strong * 10 + medium * 4,
            sampleKeys: Object.keys(objects[0] ?? {}).slice(0,20)
          });
        }
      }
      for(let i=0;i<Math.min(node.length,300);i++) walk(node[i],[...pathParts,`[${i}]`],depth+1);
      return;
    }
    if(node && typeof node === "object"){
      for(const [k,v] of Object.entries(node)) walk(v,[...pathParts,k],depth+1);
    }
  }
  walk(root,[],0);
  return candidates.sort((a,b)=>b.score-a.score).slice(0,10);
}

function endpointHints(text){
  const decoded = decode(text);
  const urls = [...decoded.matchAll(/https?:\/\/[^"'\\\s<>)]+/gi)].map(m=>m[0]);
  const paths = [...decoded.matchAll(/["'`]((?:\/api\/|\/graphql|\/data\/|\/_next\/data\/|\/wp-json\/|\/ajax\/)[^"'`\\\s<>)]+)["'`]/gi)].map(m=>m[1]);
  return uniq([...urls,...paths].filter(v => /api|graphql|data|stand|table|ranking|tabelle|classement|team|club|season|competition|fixture|standing/i.test(v))).slice(0,25);
}

function inspect(text, contentType, probeType){
  const lower = decode(text).toLowerCase();
  const title = String(text).match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g," ").trim() ?? "";
  const htmlRows = parseHtmlRows(text);
  const jsonRoot = /json/i.test(contentType ?? "") || /^[\s{\[]/.test(String(text).slice(0,40)) ? tryParseJson(decode(text).trim()) : null;
  const jsonCandidateArrays = jsonRoot ? walkJson(jsonRoot) : [];

  const signals = {
    json: Boolean(jsonRoot),
    graphql: lower.includes("graphql"),
    api: lower.includes("api"),
    standings: lower.includes("standings") || lower.includes("standing"),
    table: lower.includes("table"),
    ranking: lower.includes("ranking"),
    tabelle: lower.includes("tabelle"),
    classement: lower.includes("classement"),
    klassement: lower.includes("klassement"),
    team: lower.includes("team") || lower.includes("club"),
    points: lower.includes("points") || lower.includes("pts") || lower.includes("punkte"),
    script: /\.js($|\?)/i.test(probeType ?? "") || /javascript/i.test(contentType ?? "")
  };

  const hints = endpointHints(text);
  const score =
    Object.values(signals).filter(Boolean).length +
    (htmlRows.length >= 6 ? 2 : 0) +
    (jsonCandidateArrays.length > 0 ? 6 : 0) +
    Math.min(hints.length, 5);

  let probeStatus = "fetched_2xx_no_contract_signal";
  if(score >= 10 || jsonCandidateArrays.length > 0) probeStatus = "accepted_contract_probe_strong_signal_requires_extractor";
  else if(score >= 5 || hints.length > 0) probeStatus = "review_contract_probe_weak_signal";

  return {
    title,
    score,
    htmlTableRowCount: htmlRows.length,
    jsonCandidateArrayCount: jsonCandidateArrays.length,
    topJsonCandidateArrays: jsonCandidateArrays.slice(0,5),
    endpointHintCount: hints.length,
    endpointHints: hints,
    signals,
    probeStatus,
    first300: String(text).slice(0,300).replace(/\s+/g," ")
  };
}

function runCurl(row,index){
  return new Promise(resolve=>{
    let host = "unknown";
    try { host = new URL(row.probeUrl).hostname; } catch {}
    const outFile = path.join(responseDir,`${String(index+1).padStart(4,"0")}-${safe(row.competitionSlug)}-${safe(row.probeType)}-${safe(host)}.txt`);
    const curlArgs = [
      "--location","--ipv4","--http1.1",
      "--connect-timeout","3",
      "--max-time","7",
      "--max-filesize","900000",
      "--silent","--show-error",
      "--header","Accept: application/json,text/html,application/xhtml+xml,application/javascript,text/javascript,*/*;q=0.8",
      "--header","Accept-Language: en-US,en;q=0.9",
      "--header","User-Agent: Mozilla/5.0 controlled-football-truth-contract-deep-probe",
      "--output",outFile,
      "--write-out","HTTP=%{http_code} FINAL=%{url_effective} TYPE=%{content_type} SIZE=%{size_download} TIME=%{time_total}",
      row.probeUrl
    ];

    const child = spawn("curl.exe",curlArgs,{windowsHide:true});
    let stdout = "";
    let stderr = "";
    child.stdout.on("data",d=>stdout += d.toString());
    child.stderr.on("data",d=>stderr += d.toString());
    child.on("error",err=>resolve({...row,probeStatus:"curl_spawn_error",httpStatus:0,finalUrl:null,contentType:null,outputFile:outFile,outputSize:0,curlExitCode:null,curlError:String(err.message ?? err)}));
    child.on("close",(code,signal)=>{
      const parsed = parseWriteOut(stdout);
      const exists = fs.existsSync(outFile);
      const buffer = exists ? fs.readFileSync(outFile) : Buffer.from("");
      const text = buffer.toString("utf8");
      const httpOk = parsed.httpStatus >= 200 && parsed.httpStatus < 300;
      const inspection = httpOk ? inspect(text, parsed.contentType, row.probeType) : null;

      let probeStatus = "contract_probe_fetch_not_2xx";
      if(httpOk) probeStatus = inspection.probeStatus;
      else if(parsed.httpStatus === 404) probeStatus = "contract_probe_route_not_found";
      else if(code !== 0) probeStatus = "contract_probe_curl_nonzero_or_timeout";

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
        nextAllowedAction:{
          mayBuildContractProbeExtractor: probeStatus === "accepted_contract_probe_strong_signal_requires_extractor",
          mayBuildContractProbeReview: probeStatus === "review_contract_probe_weak_signal",
          mayBuildContractRouteRepairFollowup: probeStatus !== "accepted_contract_probe_strong_signal_requires_extractor" && probeStatus !== "review_contract_probe_weak_signal",
          mayWriteCanonicalNow:false,
          mayWriteProductionNow:false,
          mayAssertTruthNow:false
        }
      });
    });
  });
}

async function pool(items,limit,worker){
  const results = [];
  let i = 0;
  await Promise.all(Array.from({length:Math.max(1,limit)}, async()=>{
    while(i < items.length){
      const idx = i++;
      results[idx] = await worker(items[idx],idx);
    }
  }));
  return results;
}

if(!fs.existsSync(inputPath)) throw new Error(`Missing contract deep probe plan: ${inputPath}`);
const inputText = fs.readFileSync(inputPath,"utf8");
const plan = JSON.parse(inputText);
const plannedRows = (Array.isArray(plan.deepProbeRows) ? plan.deepProbeRows : []).slice(0,maxUrls);

const checks = [];
check(checks,"allowExecuteFlagPresent",allowExecute);
check(checks,"allowFetchFlagPresent",allowFetch);
check(checks,"sourcePlanPassed",plan.summary?.status==="passed",{actual:plan.summary?.status});
check(checks,"sourceDeepProbeRowsAtLeastFourHundred",Number(plan.summary?.deepProbeRowCount ?? 0)>=400,{actual:plan.summary?.deepProbeRowCount});
check(checks,"plannedRowsAtLeastFourHundred",plannedRows.length>=400,{actual:plannedRows.length});
check(checks,"noSearchNoWriteInThisRunner",true);
check(checks,"productionAndTruthLocked",true);

const preflightBlockedCount = checks.filter(c=>!c.passed).length;

if(preflightBlockedCount || !allowExecute || !allowFetch){
  const output = {output:outputPath,job:"run-football-truth-whole-map-high-volume-contract-deep-probe-wave-file",status:"blocked_preflight",checks,resultRows:[],bestRows:[],summary:{status:"blocked_preflight",plannedProbeRowCount:plannedRows.length,fetchExecutedNowCount:0,searchExecutedNowCount:0,broadSearchExecutedNowCount:0,canonicalWriteExecutedNowCount:0,productionWriteExecutedNowCount:0,truthAssertionExecutedNowCount:0,preflightBlockedCount}};
  writeJson(outputPath,output);
  console.log(JSON.stringify(output.summary,null,2));
  process.exitCode=1;
} else {
  fs.mkdirSync(responseDir,{recursive:true});
  console.log(JSON.stringify({phase:"fetch_start",plannedProbeRowCount:plannedRows.length,concurrency,noSearch:true,noCanonicalWrite:true,noProductionWrite:true,noTruthAssertion:true}));
  const resultRows = await pool(plannedRows,concurrency,runCurl);
  const bestRows = uniq(resultRows.map(r=>r.competitionSlug)).map(slug=>{
    const rows = resultRows.filter(r=>r.competitionSlug===slug).sort((a,b)=>
      (b.inspection?.score ?? -1) - (a.inspection?.score ?? -1) ||
      (b.httpStatus >= 200 && b.httpStatus < 300 ? 1 : 0) - (a.httpStatus >= 200 && a.httpStatus < 300 ? 1 : 0)
    );
    const best = rows[0];
    return {
      competitionSlug:slug,
      countryCode:best.countryCode,
      sourceGroup:best.sourceGroup,
      probeType:best.probeType,
      bestProbeStatus:best.probeStatus,
      httpStatus:best.httpStatus,
      score:best.inspection?.score ?? null,
      htmlTableRowCount:best.inspection?.htmlTableRowCount ?? null,
      jsonCandidateArrayCount:best.inspection?.jsonCandidateArrayCount ?? null,
      endpointHintCount:best.inspection?.endpointHintCount ?? null,
      title:best.inspection?.title ?? null,
      probeUrl:best.probeUrl,
      finalUrl:best.finalUrl,
      outputFile:best.outputFile,
      inspection:best.inspection
    };
  });

  const output = {
    output: outputPath,
    job: "run-football-truth-whole-map-high-volume-contract-deep-probe-wave-file",
    generatedAtUtc: new Date().toISOString(),
    sourcePlanPath: inputPath,
    sourcePlanSha256: sha256Text(inputText),
    policy:{contractDeepProbeWaveOnly:true,noSearchInThisJob:true,noBroadSearchInThisJob:true,noCanonicalWriteInThisJob:true,noProductionWriteInThisJob:true,noTruthAssertionInThisJob:true},
    checks,
    resultRows,
    bestRows,
    summary:{
      status:"passed",
      sourceDeepProbeRowCount:plan.summary?.deepProbeRowCount ?? null,
      plannedProbeRowCount:plannedRows.length,
      plannedCompetitionCount:uniq(plannedRows.map(r=>r.competitionSlug)).length,
      plannedCountryCount:uniq(plannedRows.map(r=>r.countryCode)).length,
      plannedRowsByProbeType:countBy(plannedRows,"probeType"),
      fetchExecutedNowCount:resultRows.length,
      fetched2xxCount:resultRows.filter(r=>r.httpStatus>=200&&r.httpStatus<300).length,
      resultRowsByStatus:countBy(resultRows,"probeStatus"),
      bestCompetitionCount:bestRows.length,
      bestRowsByStatus:countBy(bestRows,"bestProbeStatus"),
      strongContractSignalCompetitionCount:bestRows.filter(r=>r.bestProbeStatus==="accepted_contract_probe_strong_signal_requires_extractor").length,
      weakContractSignalCompetitionCount:bestRows.filter(r=>r.bestProbeStatus==="review_contract_probe_weak_signal").length,
      jsonCandidateArrayCompetitionCount:bestRows.filter(r=>Number(r.jsonCandidateArrayCount ?? 0)>0).length,
      mayBuildContractProbeExtractorBoardCount:bestRows.some(r=>r.bestProbeStatus==="accepted_contract_probe_strong_signal_requires_extractor")?1:0,
      mayBuildContractProbeReviewBoardCount:bestRows.some(r=>r.bestProbeStatus==="review_contract_probe_weak_signal")?1:0,
      mayBuildContractRouteRepairFollowupCount:bestRows.some(r=>r.bestProbeStatus!=="accepted_contract_probe_strong_signal_requires_extractor"&&r.bestProbeStatus!=="review_contract_probe_weak_signal")?1:0,
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
