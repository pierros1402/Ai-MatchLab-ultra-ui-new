import {reconcile} from "./audit-history-standings-reconciliation.js";
import {PRIMARY_COMPETITION_SOURCES} from "../source-discovery/primary-competition-count.js";
import {fileURLToPath} from "node:url";
import path from "node:path";
export function buildIntegrityQueue(report,profiles=PRIMARY_COMPETITION_SOURCES){
 const tasks=[];
 for(const row of report.rows){
  const add=(kind,detail)=>tasks.push({slug:row.slug,kind,detail});
  if(row.status==="ROSTER_AUTHORITY_HOLD")add(profiles[row.slug]?"VERIFY_PRIMARY_AUTHORITY":"REVIEW_PRIMARY_SOURCE_ADAPTER",row.standingsReasons);
  if(row.memoryStatus==="MISSING")add(row.archiveFiles.length?"RECONCILE_ARCHIVE_TO_MEMORY":"DISCOVER_VERIFIED_HISTORY",row.archiveFiles);
  if(row.status==="IDENTITY_OR_MEMORY_GAP")add("REVIEW_SCOPED_IDENTITY",row.teams.filter(t=>!t.exactMemoryKey).map(t=>t.name));
  if(row.teams.some(t=>t.exactMemoryKey&&t.candidateResults<6))add("REVIEW_RECENT_SAMPLE",row.teams.filter(t=>t.exactMemoryKey&&t.candidateResults<6).map(t=>t.name));
  if(row.status==="ACTIVE_MEMORY_SAMPLE_PRESENT")add("VERIFY_EXTERNAL_COMPLETENESS",[]);
 }
 return {schema:"ai-matchlab.league-integrity-queue.v1",fullCoverageCertified:false,productionMutationAuthorized:false,tasks,totals:Object.fromEntries([...new Set(tasks.map(t=>t.kind))].map(k=>[k,tasks.filter(t=>t.kind===k).length]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildIntegrityQueue(reconcile(fileURLToPath(new URL("../../",import.meta.url)))),null,2));
