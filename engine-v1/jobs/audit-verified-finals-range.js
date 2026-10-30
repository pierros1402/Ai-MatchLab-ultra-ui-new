import fs from "node:fs";
import path from "node:path";
import {auditVerifiedFinalsDay} from "./audit-verified-final-canonical-day.js";

// Read-only historical coverage; missing days are explicit blockers, never zero-success.
export function auditVerifiedFinalsRange({root,fromDay,throughDay,maxDays=366}) {
  const valid=x=>/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+"T00:00:00Z"));
  if (!root||!valid(fromDay)||!valid(throughDay)) throw Error("historical_audit_invalid_range");
  const start=Date.parse(fromDay+"T00:00:00Z"),end=Date.parse(throughDay+"T00:00:00Z");
  const count=Math.floor((end-start)/86400000)+1;
  if (count<1||count>maxDays) throw Error("historical_audit_range_bounds");
  const days=[],issues=[];
  for(let offset=0;offset<count;offset++) {
    const dayKey=new Date(start+offset*86400000).toISOString().slice(0,10);
    const finalDir=path.join(root,"data","final-results",dayKey);
    const canonicalDir=path.join(root,"data","canonical-fixtures",dayKey);
    if (!fs.existsSync(finalDir)||!fs.existsSync(canonicalDir)) {
      const entry={dayKey,reason:"historical_source_day_missing",
        finalResultsPresent:fs.existsSync(finalDir),canonicalPresent:fs.existsSync(canonicalDir)};
      issues.push(entry);days.push({dayKey,ok:false,missing:true});continue;
    }
    try {
      const result=auditVerifiedFinalsDay({root,dayKey});
      days.push({dayKey,ok:result.ok,verifiedFinalFiles:result.verifiedFinalFiles,matched:result.matched});
      for(const issue of result.issues)issues.push({dayKey,...issue});
    } catch (e) {
      issues.push({dayKey,reason:"historical_source_day_unverifiable",error:String(e?.message||e)});
      days.push({dayKey,ok:false,unverifiable:true});
    }
  }
  return {ok:issues.length===0,readOnly:true,approvedForWrite:false,
    fromDay,throughDay,daysChecked:count,days,issues};
}
