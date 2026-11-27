// Advisory invocation coverage only. No checkpoint, execution or publication authority.
import {invocationContract,invocationKey,verifyInvocationSource} from "./daily-resume-runtime-invocations.mjs";
import {createHash} from "node:crypto";
const schema="ai-matchlab.daily-invocation-coverage-advisory.v1";
const deny=reason=>({schema,accepted:false,reason,coverageVerified:false,resumeAuthorized:false,publicationAuthorized:false});
export function auditInvocationCoverage({source,census,expected,observed}={}){
  try {
    verifyInvocationSource(source,census);
    if(!Array.isArray(expected)||!Array.isArray(observed)||!expected.length||expected.length>10000||observed.length>10000)
      return deny("invocation_inventory_invalid");
    const planned=new Map(), seen=new Set(), counts=new Map();
    for(const row of expected){
      const contract=invocationContract.find(x=>x.id===row.id);
      const key=invocationKey(row.id,row.scope);
      if(planned.has(key)||!["required","conditional-unresolved"].includes(row.requirement))
        return deny("invocation_expected_invalid");
      const count=(counts.get(row.id)||0)+1;
      if(contract.multiplicity==="once"&&count>1)return deny("invocation_multiplicity_invalid");
      counts.set(row.id,count);
      if(contract.guard==="always"&&row.requirement!=="required")return deny("invocation_required_downgrade");
      planned.set(key,row.requirement);
    }
    for(const contract of invocationContract)
      if(!counts.has(contract.id))return deny("invocation_contract_incomplete");
    for(const row of observed){
      const key=invocationKey(row.id,row.scope);
      if(!planned.has(key)||seen.has(key))return deny("invocation_observation_unplanned_or_duplicate");
      if(row.status!=="completed")return deny("invocation_observation_incomplete");
      seen.add(key);
    }
    const missing=[...planned].filter(([key])=>!seen.has(key)).map(([key,requirement])=>({key,requirement}));
    return {schema,accepted:true,reason:null,expectedCount:planned.size,observedCount:seen.size,missing,
      sourceSha256:createHash("sha256").update(source).digest("hex"),
      // Expected scope is caller supplied, not an independently proven complete runtime inventory.
      coverageVerified:false,declaredInventoryMatched:missing.length===0,
      resumeAuthorized:false,publicationAuthorized:false};
  }catch{return deny("invocation_source_or_input_invalid");}
}
