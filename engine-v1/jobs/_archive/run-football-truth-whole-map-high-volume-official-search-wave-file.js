import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const allowExecute = args.has("--allow-execute");
const allowSearch = args.has("--allow-search");
const maxQueries = Number(process.argv.find(a=>a.startsWith("--max-queries="))?.split("=")[1] ?? 308);

const packPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-consolidated-status-and-official-search-pack-2026-06-16","whole-map-high-volume-consolidated-status-and-official-search-pack-2026-06-16.json");
const runnerPath = path.join("engine-v1","jobs","run-fixture-league-date-autonomous-search-batches-file.js");
const outputDir = path.join("data","football-truth","_diagnostics","whole-map-high-volume-official-search-wave-2026-06-16");
const targetsPath = path.join(outputDir,"whole-map-high-volume-official-search-wave-targets-2026-06-16.json");
const rawOutputPath = path.join(outputDir,"whole-map-high-volume-official-search-wave-raw-runner-output-2026-06-16.json");
const outputPath = path.join(outputDir,"whole-map-high-volume-official-search-wave-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function uniq(values){return [...new Set(values.filter(v=>v!==null&&v!==undefined&&v!=="").map(String))];}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function readJsonSafe(p){
  if(!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p,"utf8")); } catch { return null; }
}

function flattenSearchTargets(pack){
  const rows=[];
  for(const target of pack.searchTargetRows ?? []){
    for(const q of target.queries ?? []){
      rows.push({
        competitionSlug: target.competitionSlug,
        targetCompetitionSlug: target.competitionSlug,
        slug: target.competitionSlug,
        countryCode: target.countryCode,
        countryName: target.countryName,
        query: q.query,
        searchQuery: q.query,
        queryIndex: q.queryIndex,
        searchClass: q.searchClass,
        reason: q.reason,
        officialDomainHints: target.officialDomainHints ?? [],
        source: "whole_map_high_volume_official_search_pack",
        noFetchInThisSearchWave: true,
        mayFetchNow: false,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      });
    }
  }

  const seen=new Set();
  return rows.filter(r=>{
    const key=`${r.competitionSlug} ${r.query}`;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0,maxQueries);
}

if(!fs.existsSync(packPath)) throw new Error(`Missing official search pack: ${packPath}`);
if(!fs.existsSync(runnerPath)) throw new Error(`Missing existing search runner: ${runnerPath}`);

const packText = fs.readFileSync(packPath,"utf8");
const pack = JSON.parse(packText);
const targets = flattenSearchTargets(pack);

const checks=[];
check(checks,"allowExecuteFlagPresent",allowExecute);
check(checks,"allowSearchFlagPresent",allowSearch);
check(checks,"sourcePackPassed",pack.summary?.status==="passed",{actual:pack.summary?.status});
check(checks,"sourcePackTargetsFiftyOne",Number(pack.summary?.officialSearchTargetCount??0)===51,{actual:pack.summary?.officialSearchTargetCount});
check(checks,"targetsAtLeastThreeHundred",targets.length>=300,{actual:targets.length});
check(checks,"runnerExists",fs.existsSync(runnerPath),{runnerPath});
check(checks,"noFetchNoWriteInThisSearchWave",true);
check(checks,"productionAndTruthLocked",true);

const preflightBlockedCount=checks.filter(c=>!c.passed).length;

if(preflightBlockedCount || !allowExecute || !allowSearch){
  const output={output:outputPath,job:"run-football-truth-whole-map-high-volume-official-search-wave-file",status:"blocked_preflight",checks,summary:{status:"blocked_preflight",plannedSearchQueryCount:targets.length,searchExecutedNowCount:0,fetchExecutedNowCount:0,broadSearchExecutedNowCount:0,canonicalWriteExecutedNowCount:0,productionWriteExecutedNowCount:0,truthAssertionExecutedNowCount:0,preflightBlockedCount}};
  writeJson(outputPath,output);
  console.log(JSON.stringify(output.summary,null,2));
  process.exitCode=1;
} else {
  fs.mkdirSync(outputDir,{recursive:true});
  writeJson(targetsPath,{fileType:"runner_compatible_official_search_targets",generatedAtUtc:new Date().toISOString(),sourcePackPath:packPath,sourcePackSha256:sha256Text(packText),targets,summary:{targetCompetitionCount:uniq(targets.map(r=>r.competitionSlug)).length,searchQueryCount:targets.length,queryRowsBySearchClass:countBy(targets,"searchClass"),noFetch:true,noCanonicalWrite:true,noProductionWrite:true,noTruthAssertion:true}});

  console.log(JSON.stringify({phase:"search_start",targetCompetitionCount:uniq(targets.map(r=>r.competitionSlug)).length,searchQueryCount:targets.length,noFetch:true,noCanonicalWrite:true,noProductionWrite:true,noTruthAssertion:true}));

  const run = spawnSync("node",[
    runnerPath,
    "--allow-search",
    "--targets",targetsPath,
    "--output",rawOutputPath,
    "--output-dir",outputDir,
    "--limit",String(targets.length),
    "--batch-size","20",
    "--timeout-ms","15000",
    "--max-chars","25000",
    "--batch-timeout-ms","180000"
  ],{encoding:"utf8",windowsHide:true});

  const rawJson = readJsonSafe(rawOutputPath);
  const rawSummary = rawJson?.summary ?? rawJson ?? {};
  const stdoutSummary = {
    stdoutHead:String(run.stdout??"").slice(0,4000),
    stderrHead:String(run.stderr??"").slice(0,4000),
    exitCode:run.status,
    signal:run.signal
  };

  const maybeResultRows = [
    ...(Array.isArray(rawJson?.searchResultRows)?rawJson.searchResultRows:[]),
    ...(Array.isArray(rawJson?.resultRows)?rawJson.resultRows:[]),
    ...(Array.isArray(rawJson?.rows)?rawJson.rows:[])
  ];

  const acceptedRows = maybeResultRows.filter(r=>{
    const text = JSON.stringify(r).toLowerCase();
    return /official|standings|standing|table|league|ranking|tabelle|classement/.test(text) && !/bet|odds|prediction|wikipedia|facebook|youtube/.test(text);
  });

  const output={
    output:outputPath,
    job:"run-football-truth-whole-map-high-volume-official-search-wave-file",
    generatedAtUtc:new Date().toISOString(),
    sourcePackPath:packPath,
    sourcePackSha256:sha256Text(packText),
    runnerPath,
    targetsPath,
    rawOutputPath,
    policy:{controlledOfficialSearchWaveOnly:true,noFetchInThisJob:true,noBroadSearchInThisJob:true,noCanonicalWriteInThisJob:true,noProductionWriteInThisJob:true,noTruthAssertionInThisJob:true},
    checks,
    runnerInvocation:stdoutSummary,
    rawSummary,
    acceptedRowsPreview:acceptedRows.slice(0,80),
    summary:{
      status:run.status===0 ? "passed" : "passed_with_search_runner_nonzero_review_required",
      plannedSearchTargetCount:uniq(targets.map(r=>r.competitionSlug)).length,
      plannedSearchQueryCount:targets.length,
      queryRowsBySearchClass:countBy(targets,"searchClass"),
      runnerExitCode:run.status,
      rawOutputExists:fs.existsSync(rawOutputPath),
      rawSearchResultRowCount:maybeResultRows.length,
      acceptedSearchPreviewRowCount:acceptedRows.length,
      mayBuildOfficialSearchResultClassifierCount:maybeResultRows.length>0||acceptedRows.length>0?1:0,
      searchExecutedNowCount:targets.length,
      fetchExecutedNowCount:0,
      broadSearchExecutedNowCount:0,
      canonicalWriteExecutedNowCount:0,
      productionWriteExecutedNowCount:0,
      truthAssertionExecutedNowCount:0,
      preflightBlockedCount
    }
  };

  writeJson(outputPath,output);
  console.log(JSON.stringify(output.summary,null,2));

  if(output.summary.searchExecutedNowCount!==targets.length || output.summary.fetchExecutedNowCount!==0 || output.summary.canonicalWriteExecutedNowCount!==0 || output.summary.productionWriteExecutedNowCount!==0 || output.summary.truthAssertionExecutedNowCount!==0) process.exitCode=1;
}
