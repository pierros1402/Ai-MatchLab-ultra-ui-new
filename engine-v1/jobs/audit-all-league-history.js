import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { isDisabledLeague } from "../source-discovery/disabled-leagues.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
export function audit(rootDir, registry=LEAGUES_COVERAGE) {
 const rows=[];
 for(const {slug} of registry.filter(x=>x.type==="league"&&!isDisabledLeague(x.slug))) {
  const file=path.join(rootDir,"data/league-memory/results",slug+".json");
  const row={slug,status:"MISSING",teams:[],invalidRows:0};
  rows.push(row);
  if(!fs.existsSync(file)) continue;
  try {
   const d=JSON.parse(fs.readFileSync(file,"utf8"));
   if(!d.teams||typeof d.teams!=="object"||Array.isArray(d.teams)) throw Error("Invalid teams");
   for(const [team,history] of Object.entries(d.teams)) {
    if(!Array.isArray(history)) throw Error("Invalid history");
    const seen=new Set(); let duplicateCandidates=0,latest=null;
    for(const x of history) {
     if(!x||!Number.isFinite(Date.parse(x.date))||!Number.isInteger(x.gf)||!Number.isInteger(x.ga)||x.gf<0||x.ga<0||!x.opp||!["H","A"].includes(x.ha)){row.invalidRows++;continue;}
     const key=JSON.stringify([new Date(x.date).toISOString().slice(0,10),x.ha,String(x.opp).normalize("NFKC").trim().toLowerCase(),x.gf,x.ga]);
     if(seen.has(key)) duplicateCandidates++;
     seen.add(key); const date=new Date(x.date).toISOString(); if(!latest||date>latest)latest=date;
    }
    row.teams.push({team,distinctCandidateResults:seen.size,duplicateCandidates,latest,belowSix:seen.size<6});
   }
   row.status=!row.teams.length?"EMPTY":row.invalidRows||row.teams.some(t=>t.belowSix)?"REVIEW":"PRESENT";
  }catch(e){row.status="INVALID";row.error=e.message;}
 }
 return {schema:"ai-matchlab.history-inventory-audit.v1",scope:"registry league rows excluding disabled countries; stored team keys only; not verified active rosters or identity-deduplicated results",rows,totals:Object.fromEntries(["MISSING","EMPTY","INVALID","REVIEW","PRESENT"].map(s=>[s,rows.filter(r=>r.status===s).length]))};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(audit(root),null,2));
