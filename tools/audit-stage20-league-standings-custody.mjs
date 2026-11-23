// Source-bound read-only audit of the ACTUAL original Stage20 league-memory
// layout: 96 standings-evidence JSON, 3 root files. The 0 results/ documents
// must never be misattributed to the accumulated FORM results writer.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
export const LEAGUE_STANDINGS_CUSTODY_SCHEMA="ai-matchlab.stage20-league-standings-custody.v1";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function check(ok,reason){if(!ok)throw Error(reason);}
export function inspectStandingsMemoryWriter(source){
  check(typeof source==="string" && [
    'resolveDataPath("league-memory", "standings")',
    "export function recordStandingsResult(",
    "function shouldReplace(",
    "export function readStandings(",
    "export function readStandingsEvidence(",
    "readTrustedStandingsState(",
    "cur.attempts",
    "fs.writeFileSync(fileFor(slug)"
  ].every(x=>source.includes(x)),"standings_memory_source_contract_mismatch");
  return {
    sourceSha256:sha(source),producer:"storage/standings-memory-db.js",
    role:"legacy-research-evidence-with-attempts",
    productionModelTruthFromLegacyMemory:false,
    trustedStandingsGateRequired:true,
    exactBaselineRetentionRequired:true,
    omissionAuthorized:false,resumeAuthorized:false
  };
}
export function summarizeStandingsMemoryRows(rows,root){
  check(Array.isArray(rows) && typeof root==="string","standings_memory_invalid_input");
  let files=0,validPayloads=0,invalidPaths=0,invalidShape=0,
    acceptedSnapshots=0,withAttempts=0,attemptRecords=0,
    acceptedRows=0,bytes=0,emptyAccepted=0;
  const seen=new Set();
  for(const item of rows){
    const p=item?.path;
    check(typeof p==="string" && p.startsWith("data/league-memory/standings/") &&
      !p.includes("\\") && !p.includes("\0") &&
      p.split("/").every(s=>s&&s!=="."&&s!=="..") && !seen.has(p),
      "standings_memory_path_invalid");
    seen.add(p);files++;
    if(!/^data\/league-memory\/standings\/[A-Za-z0-9._-]+\.json$/.test(p)){
      invalidPaths++;continue;
    }
    const data=fs.readFileSync(path.join(root,p));
    check(data.length===item.bytes && sha(data)===item.sha256,
      "standings_memory_historical_bytes_mismatch");
    bytes+=data.length;
    let obj;
    try{obj=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data));}
    catch{invalidShape++;continue;}
    if(!obj || typeof obj!=="object" || Array.isArray(obj) ||
      !Array.isArray(obj.attempts)){invalidShape++;continue;}
    validPayloads++;
    if(obj.attempts.length){withAttempts++;attemptRecords+=obj.attempts.length;}
    if(obj.accepted && typeof obj.accepted==="object"){
      acceptedSnapshots++;
      if(Array.isArray(obj.accepted.rows))acceptedRows+=obj.accepted.rows.length;
      else emptyAccepted++;
    }
  }
  return {
    files,validPayloads,invalidPaths,invalidShape,
    acceptedSnapshots,withAttempts,attemptRecords,acceptedRows,
    emptyAccepted,bytes,
    legacyResearchEvidenceOnly:true,
    modelTruthGateBypassed:false,
    exactStandingsLegacyBytesRequired:true,
    productionStandingsTruthIndependentlyVerified:false,
    omissionAuthorized:false,resumeAuthorized:false,publicationAuthorized:false
  };
}
export function auditHistoricalLeagueStandingsMemory(root,sourceRoot){
  const archive=auditHistorical954(root);
  check(archive.files===9083 && archive.bytes===428113899,
    "standings_memory_original_archive_unbound");
  const writer=inspectStandingsMemoryWriter(fs.readFileSync(
    path.join(sourceRoot,"engine-v1/storage/standings-memory-db.js"),"utf8"));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const league=manifest.files.filter(r=>r.path.startsWith("data/league-memory/"));
  const standing=league.filter(r=>r.path.startsWith("data/league-memory/standings/"));
  const roots=league.filter(r=>r.path.split("/").length===3);
  const report=summarizeStandingsMemoryRows(standing,root);
  check(league.length===99 && standing.length===96 && roots.length===3 &&
    report.files===96 && report.validPayloads===96 &&
    report.invalidPaths===0 && report.invalidShape===0,
    "standings_memory_historical_shape_incomplete:"+JSON.stringify({
      league:league.length,standings:standing.length,root:roots.length,
      valid:report.validPayloads,invalidPaths:report.invalidPaths,invalidShape:report.invalidShape
    }));
  return {
    schema:LEAGUE_STANDINGS_CUSTODY_SCHEMA,dayKey:archive.dayKey,
    sourceManifestSha256:archive.manifestSha256,
    writer,allLeagueMemoryFiles:league.length,
    sourceBoundStandingsFiles:standing.length,
    rootFilesNeedingSeparateWriterProof:roots.length,
    resultsMemoryFilesInOriginalArchive:0,
    ...report,readOnly:true,productionWrites:0
  };
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    check(process.argv.length===4 && path.isAbsolute(process.argv[2]) &&
      path.isAbsolute(process.argv[3]),"standings_memory_absolute_roots_required");
    console.log("STAGE20_LEAGUE_STANDINGS_CUSTODY="+JSON.stringify(
      auditHistoricalLeagueStandingsMemory(process.argv[2],process.argv[3])));
  }catch(e){console.error("STAGE20_LEAGUE_STANDINGS_DENIED="+String(e.message||e));process.exitCode=1;}
}
