// Read-only historical source/data custody audit. The presence of a "cache"
// filename NEVER permits dropping frozen opening odds or league memory state.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
const digest=b=>crypto.createHash("sha256").update(b).digest("hex");
function check(ok,reason){if(!ok)throw Error(reason);}
export const MEMORY_CUSTODY_SCHEMA="ai-matchlab.stage20-memory-source-custody.v1";
export function inspectMemorySourceContracts(oddsSource,leagueSource) {
  check(typeof oddsSource==="string" && typeof leagueSource==="string",
    "stage20_memory_source_missing");
  const oddsTokens=["export function recordOddsSnapshot(","cur.markets[market]","existing.open",
    "openedAt","recordSettlement(","fs.writeFileSync(fileFor(matchId)"];
  const leagueTokens=["export function writeLeagueState(","export function writeAllStates(",
    "export function writeLeagueHistory(","export function readAllStates(","recheckAfter",
    "fs.writeFileSync(STATE_FILE"];
  check(oddsTokens.every(s=>oddsSource.includes(s)) &&
    leagueTokens.every(s=>leagueSource.includes(s)),
    "stage20_memory_source_contract_changed");
  return {
    oddsSourceSha256:digest(oddsSource),leagueSourceSha256:digest(leagueSource),
    oddsOpeningMutability:"frozen-at-first-capture",
    leagueMemoryRole:"persisted-recheck-and-history",
    equivalentReconstructionProven:false,
    omissionAuthorized:false,resumeAuthorized:false
  };
}
export function analyzeMemoryDocuments(rows,root){
  check(Array.isArray(rows) && typeof root==="string","stage20_memory_rows_invalid");
  const summary={
    oddsFiles:0,leagueFiles:0,oddMarketRecords:0,
    oddsWithOpening:0,oddsWithAssessment:0,
    leagueStateDocuments:0,leagueHistoryDocuments:0,leagueOtherDocuments:0,
    jsonInvalid:0,unexpectedPaths:0,typedObjects:0
  };
  for(const item of rows){
    const name=item?.path;
    check(typeof name==="string" &&
      /^data\/(odds-memory|league-memory)\//.test(name) &&
      !name.includes("\\") && !name.includes("\0") &&
      name.split("/").every(s=>s&&s!=="."&&s!==".."),
      "stage20_memory_unsafe_path");
    if(name.startsWith("data/odds-memory/"))summary.oddsFiles++;
    else summary.leagueFiles++;
    if(!/^data\/(odds-memory|league-memory)\/.*\.json$/i.test(name)){
      summary.unexpectedPaths++;continue;
    }
    let obj;
    try{
      const data=fs.readFileSync(path.join(root,name));
      check(data.length===item.bytes && digest(data)===item.sha256,
        "stage20_memory_source_bytes_changed");
      obj=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data));
    }catch(e){
      if(e.message==="stage20_memory_source_bytes_changed")throw e;
      summary.jsonInvalid++;continue;
    }
    if(obj && typeof obj==="object" && !Array.isArray(obj))summary.typedObjects++;
    if(name.startsWith("data/odds-memory/")){
      if(obj?.markets && typeof obj.markets==="object"){
        summary.oddMarketRecords++;
        if(Object.values(obj.markets).some(x=>x?.open && typeof x.open==="object"))
          summary.oddsWithOpening++;
      }
      if(obj?.aiAssessment && typeof obj.aiAssessment==="object")
        summary.oddsWithAssessment++;
    }else if(name==="data/league-memory/state.json")
      summary.leagueStateDocuments++;
    else if(name.startsWith("data/league-memory/history/"))
      summary.leagueHistoryDocuments++;
    else summary.leagueOtherDocuments++;
  }
  return {
    ...summary,fullMemoryBaselineNeededForByteExactReplay:true,
    dynamicRebuildProvenEquivalent:false,dropMemoryAllowed:false,
    crossCommitResumeAuthorized:false,publicationAuthorized:false
  };
}
export function auditHistoricalMemoryCustody(root,sourceRoot) {
  const original=auditHistorical954(root);
  check(original.files===9083 && original.bytes===428113899,
    "stage20_memory_original_not_bound");
  const odds=fs.readFileSync(path.join(sourceRoot,"engine-v1/storage/odds-memory-db.js"),"utf8");
  const league=fs.readFileSync(path.join(sourceRoot,"engine-v1/storage/league-memory-db.js"),"utf8");
  const source=inspectMemorySourceContracts(odds,league);
  const archive=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const rows=archive.files.filter(r=>
    r.path.startsWith("data/odds-memory/") ||
    r.path.startsWith("data/league-memory/"));
  const report=analyzeMemoryDocuments(rows,root);
  check(report.oddsFiles===50 && report.leagueFiles===99 &&
    report.jsonInvalid===0 && report.unexpectedPaths===0,
    "stage20_memory_observation_contract_mismatch");
  return {
    schema:MEMORY_CUSTODY_SCHEMA,
    dayKey:original.dayKey,originalManifestSha256:original.manifestSha256,
    source,...report,productionWrites:0,readOnly:true
  };
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    check(process.argv.length===4 && path.isAbsolute(process.argv[2]) &&
      path.isAbsolute(process.argv[3]),"stage20_memory_absolute_roots_required");
    console.log("STAGE20_MEMORY_CUSTODY="+JSON.stringify(
      auditHistoricalMemoryCustody(process.argv[2],process.argv[3])));
  }catch(e){console.error("STAGE20_MEMORY_CUSTODY_DENIED="+String(e.message||e));process.exitCode=1;}
}
