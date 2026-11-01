import fs from 'node:fs';
import path from 'node:path';
import {canonicalFileSha256} from './deploy-snapshot-release-contract.js';
import {planAObservationSignature} from '../value/plan-a-observation.js';

export function validateArchivedValueRelease({day,receipt,value,audit,fixtures,valueHash,auditHash}) {
  const errors=[];
  if(receipt?.schema!=='ai-matchlab.original-value-restoration.v1'||receipt.day!==day)errors.push('restoration_receipt_invalid');
  if(value?.date!==day||value?.immutable!==true||value?.publicationAuthority!=='frozen_plan_a_observation'||
      value?.count!==receipt?.after?.picks||value?.picks?.length!==receipt?.after?.picks||
      value?.observationSignature!==receipt?.originalSignature||planAObservationSignature(day,value)!==receipt?.originalSignature)errors.push('restored_observation_changed');
  if(valueHash!==receipt?.after?.valueHash)errors.push('restored_value_bytes_changed');
  if(auditHash!==receipt?.after?.auditHash||audit?.date!==day||audit?.ok!==true||audit?.universe?.approved!==value?.count)errors.push('restored_audit_changed');
  for(const pick of value?.picks||[]){
    const matches=fixtures.filter(f=>(f.canonicalId||f.matchId)===pick.matchId);
    if(matches.length!==1||matches[0].homeTeam!==pick.homeTeam||matches[0].awayTeam!==pick.awayTeam)errors.push('restored_canonical_identity_changed');
  }
  return {ok:errors.length===0,errors:[...new Set(errors)]};
}

export function assertArchivedValueRelease({day,stageDir,receiptFile}) {
  if(!fs.existsSync(receiptFile))return {applicable:false};
  // Existing but malformed receipts fail closed, never become an exemption.
  const read=name=>JSON.parse(fs.readFileSync(path.join(stageDir,name),'utf8'));
  const receipt=JSON.parse(fs.readFileSync(receiptFile,'utf8'));
  const fixtures=read('fixtures.json');
  const result=validateArchivedValueRelease({day,receipt,value:read('value.json'),audit:read('value-audit.json'),
    fixtures:Array.isArray(fixtures)?fixtures:fixtures.fixtures||[],
    valueHash:canonicalFileSha256(path.join(stageDir,'value.json')),auditHash:canonicalFileSha256(path.join(stageDir,'value-audit.json'))});
  if(!result.ok)throw Error('archived_value_release_rejected:'+result.errors.join(','));
  return {applicable:true,...result};
}
