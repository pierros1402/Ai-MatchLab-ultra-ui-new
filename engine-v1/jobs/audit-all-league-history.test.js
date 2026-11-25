import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {audit} from "./audit-all-league-history.js";
test("inventory distinguishes missing, empty, invalid, duplicates and disabled",()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"history-audit-"));
 try{
 const dir=path.join(root,"data/league-memory/results");fs.mkdirSync(dir,{recursive:true});
 const write=(slug,d)=>fs.writeFileSync(path.join(dir,slug+".json"),JSON.stringify(d));
 const match={date:"2026-11-01T12:00Z",ha:"H",opp:"B",gf:1,ga:0};
 write("eng.1",{teams:{A:[match,{...match,matchId:"other"},null]}});
 write("eng.2",{teams:{}});write("eng.3",{teams:[]});
 const result=audit(root,["eng.1","eng.2","eng.3","eng.4","som.1"].map(slug=>({slug,type:"league"})));
 assert.deepEqual(result.totals,{MISSING:1,EMPTY:1,INVALID:1,REVIEW:1,PRESENT:0});
 assert.equal(result.rows[0].teams[0].distinctCandidateResults,1);
 assert.equal(result.rows[0].teams[0].duplicateCandidates,1);
 assert.equal(result.rows[0].invalidRows,1);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
