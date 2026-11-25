import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {audit} from "./audit-all-league-history.js";
export function reconcile(root, inventory=audit(root)){
 const rows=inventory.rows.map(row=>{
  const slug=row.slug;
  const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}};
  const archiveDir=path.join(root,"data/history-archive",slug);
  const archiveFiles=fs.existsSync(archiveDir)?fs.readdirSync(archiveDir).filter(n=>n.endsWith(".json")).sort():[];
  const standings=read("data/standings/"+slug+".json");
  const usable=standings?.league===slug&&standings?.foundation?.usable===true&&standings?.completeness===1&&Array.isArray(standings.table)&&standings.table.length>0;
  const teams=usable?standings.table.map(t=>{
   const name=t.teamName||t.team;
   const match=row.teams.find(x=>x.team===name);
   return {name,canonicalTeamId:t.canonicalTeamId||null,exactMemoryKey:!!match,candidateResults:match?.distinctCandidateResults??null,played:t.played??null};
  }):[];
  const status=!usable?"ROSTER_AUTHORITY_HOLD":teams.some(t=>!t.exactMemoryKey)?"IDENTITY_OR_MEMORY_GAP":teams.some(t=>t.candidateResults<6)?"SPARSE_ACTIVE_MEMORY":"ACTIVE_MEMORY_SAMPLE_PRESENT";
  return {slug,status,memoryStatus:row.status,archiveFiles,standingsSeason:standings?.seasonReference??null,standingsReasons:standings?.foundation?.reasonCodes??[],historyLeagueRows:standings?.foundation?.historyLeagueRows??null,teams};
 });
 return {schema:"ai-matchlab.history-standings-reconciliation.v1",fullCoverageCertified:false,scope:"Exact-name diagnostic only; no alias inference, no external expected match baseline",rows,totals:Object.fromEntries([...new Set(rows.map(r=>r.status))].map(s=>[s,rows.filter(r=>r.status===s).length]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(reconcile(fileURLToPath(new URL("../../",import.meta.url))),null,2));
