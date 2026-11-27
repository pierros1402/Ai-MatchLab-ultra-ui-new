import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function classifyAliasReviewQueue(report){
  if(report?.schema!=='aiml.history-event-alias-audit.v1'||report.writeAuthorized!==false||!Array.isArray(report.candidates))throw new Error('invalid_alias_audit');
  const counts={}, queue=[];
  let aliases=0;
  for(const candidate of report.candidates){
    const isAlias=candidate.result?.ok===true&&candidate.result.requiresIndependentIdentityApproval===true;
    if(isAlias)aliases++;
    if(isAlias&&candidate.identityApproval!==false)throw new Error('unexpected_alias_approval');
    const category=!isAlias?'CONFLICT_REVIEW':candidate.bindingStatus==='VERIFIED_PROVIDER_BINDING'&&candidate.memoryProof==='EXACT_RECIPROCAL_MEMORY'?'PROVIDER_AND_MEMORY_REVIEW':candidate.bindingStatus==='VERIFIED_PROVIDER_BINDING'?'PROVIDER_BINDING_REVIEW':candidate.memoryProof==='EXACT_RECIPROCAL_MEMORY'?'MEMORY_CORROBORATION_REVIEW':'INDEPENDENT_IDENTITY_EVIDENCE_REQUIRED';
    counts[category]=(counts[category]||0)+1;
    queue.push({category,sourceId:candidate.row?.id??null,targetId:candidate.result?.canonicalId??null,league:candidate.row?.leagueSlug??null,bindingStatus:candidate.bindingStatus??null,memoryProof:candidate.memoryProof??null,identityApproval:false,writeAuthorized:false,evidence:candidate});
  }
  if(aliases!==Number(report.counts?.ALIAS_CANDIDATE??0))throw new Error('alias_count_mismatch');
  return {schema:'aiml.history-alias-review-queue.v1',counts,aliasCount:aliases,reviewCount:queue.length,approvedCount:0,writeAuthorized:false,queue};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const bytes=fs.readFileSync(process.argv[2]);
  const result={...classifyAliasReviewQueue(JSON.parse(bytes)),sourceAuditSha256:createHash('sha256').update(bytes).digest('hex')};
  fs.writeFileSync(process.argv[3],JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({...result,queue:undefined}));
}
