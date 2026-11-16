// Read-only local audit of the exact archived research records and existing receipt objects.
// Run after an authorized prospective capture. Never generates historical picks or writes data.
import fs from 'node:fs';import path from 'node:path';
import {readResearchRecord,proveResearchCommit} from './autonomous-research-journal.js';
import {verifyExistingBoundaryReceipts} from './autonomous-boundary-receipts.js';
import {auditCommonSources} from './autonomous-common-source-audit.js';
import {validResearchDay} from './autonomous-comparison-stats.js';
const root=fs.realpathSync(process.argv[2]||'.'),day=process.argv[3];
if(!validResearchDay(day))throw Error('invalid_qualification_day');
const dir=path.resolve(root,'data','value-autonomous-research',day,'observations'),records=[];
if(fs.existsSync(dir)){
 if(fs.realpathSync(dir)!==dir)throw Error('qualification_path_escape');
 for(const name of fs.readdirSync(dir).filter(n=>n.endsWith('.json')).sort()){
  const f=path.join(dir,name);
  try{const r=readResearchRecord(root,f),timing=proveResearchCommit(root,f),boundary=verifyExistingBoundaryReceipts(root,r),common=auditCommonSources(root,r),evaluated=r.ledger.filter(x=>x.status==='EVALUATED'),shadow=evaluated.filter(x=>x.boundaryEvidence?.opponentShadow?.status==='SHADOW_ONLY_UNVERIFIED_SOURCE_CUTOFF').length;
   records.push({file:name,status:'AUDITED_RESEARCH_ONLY',picks:r.count,generatedAt:r.generatedAt,commonDecisionAt:r.commonDecisionAt??null,evaluated:evaluated.length,metricsReceiptCount:evaluated.filter(x=>x.boundaryEvidence?.statisticalBoundaryReceipt).length,opponentShadowRows:shadow,boundary,common,timing});
  }catch(e){records.push({file:name,status:'HOLD',reason:String(e?.code||e?.message||e)});}
 }
}
const audited=records.filter(r=>r.status==='AUDITED_RESEARCH_ONLY');
const missing=audited.filter(r=>r.common.status!=='PAIRWISE_INPUT_RECEIPTS_MATCH'||r.evaluated!==r.metricsReceiptCount||r.evaluated!==(r.boundary.statisticalBoundaryVerified||0)||r.timing.status!=='ORIGINAL_COMMITTED_BYTES_VERIFIED');
const status=records.length&&audited.length===records.length&&!missing.length?'PASS_PAIRWISE_AUDIT_ONLY':'HOLD_INCOMPLETE_RESEARCH_EVIDENCE';
console.log(JSON.stringify({schema:'aiml.autonomous-qualification-audit.v1',date:day,status,records,fullCommonInputsCertified:false,opponentSourceCutoffCertified:false,policyApproved:false,publicationAuthorized:false,limitations:['Exact stored receipt and pairwise comparisons are not upstream cutoff proof.','A and B use separate mathematical policies; no certified full common envelope here.','Git original-byte proof is not independent external time authority.']}));
