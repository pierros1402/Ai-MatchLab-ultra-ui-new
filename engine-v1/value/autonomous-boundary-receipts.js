// Archive-time verification of existing primary A decision-input evidence objects.
// No data acquisition, no model inference, no production authority.
import fs from 'node:fs';import {createHash} from 'node:crypto';
import {readEncodedValueEvidence} from '../storage/value-evidence-object.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
const objectHash=x=>hash(JSON.stringify(x));
export function readBoundaryObject(root,ref){
 return JSON.parse(readEncodedValueEvidence(root,ref));
}
function checkReceipt(r,stage,record,row){
 if(r?.schema!=='ai-matchlab.value-decision-input-evidence.v1'||r.stage!==stage||r.planId!=='plan-a'||r.targetDay!==record.date||r.canonicalMatchId!==row.id||typeof r.executionId!=='string'||!r.executionId||!Number.isFinite(Date.parse(r.capturedAt))||Date.parse(r.capturedAt)>Date.parse(row.boundaryEvidence.observedAt))throw Error('boundary_receipt_scope_mismatch');
}
function sameIdentity(f,expected){return f&&f.canonicalId===expected.id&&Date.parse(f.kickoffUtc)===Date.parse(expected.boundaryEvidence.kickoffUtc);}
export function verifyExistingBoundaryReceipts(root,record){
 let verified=0,unavailable=0,statisticalBoundaryVerified=0;
 if(!record.ledger.some(row=>row.boundaryEvidence))return {verified,unavailable,fullCommonInputsCertified:false,rawSourceLineageCertified:false};
 root=fs.realpathSync(root);
 for(const row of record.ledger){const e=row.boundaryEvidence;if(!e)continue;
  if(e.fixtureContextReceipt===null&&e.engineArgumentsReceipt===null){unavailable++;continue;}
  if(!e.fixtureContextReceipt||!e.engineArgumentsReceipt)throw Error('incomplete_boundary_evidence_receipts');
  const context=readBoundaryObject(root,e.fixtureContextReceipt),args=readBoundaryObject(root,e.engineArgumentsReceipt);checkReceipt(context,'fixture_context',record,row);checkReceipt(args,'engine_arguments',record,row);
  if(context.executionId!==args.executionId||Date.parse(context.capturedAt)>Date.parse(args.capturedAt)||record.commonSourceRefs&&args.executionId!==record.commonSourceRefs.A.executionId)throw Error('boundary_receipt_execution_mismatch');
  const fixture=readBoundaryObject(root,context.inputs?.fixture),details=readBoundaryObject(root,context.inputs?.details),engine=readBoundaryObject(root,args.inputs?.input);readBoundaryObject(root,args.inputs?.intelligence);
  if(!sameIdentity(fixture,row)||!sameIdentity(engine,row)||!['leagueSlug','homeTeam','awayTeam'].every(k=>fixture[k]===engine[k]))throw Error('boundary_receipt_fixture_mismatch');
  if(e.opponentShadow.status==='SHADOW_ONLY_UNVERIFIED_SOURCE_CUTOFF'&&(!details?.opponentAdjustedForm||objectHash(details.opponentAdjustedForm)!==e.opponentShadow.blockSha256||details.generatedAt!==e.opponentShadow.detailGeneratedAt||details.matchId!==row.id))throw Error('boundary_receipt_detail_mismatch');
  if(e.statisticalBoundaryReceipt){
   const metrics=readBoundaryObject(root,e.statisticalBoundaryReceipt);checkReceipt(metrics,'autonomous_boundary_metrics',record,row);
   if(metrics.executionId!==args.executionId||Date.parse(metrics.capturedAt)<Date.parse(args.capturedAt))throw Error('statistical_boundary_execution_mismatch');
   if(objectHash(readBoundaryObject(root,metrics.inputs?.metrics))!==objectHash(e.statisticalInputs)||objectHash(readBoundaryObject(root,metrics.inputs?.probabilities))!==objectHash(row.probabilities))throw Error('statistical_boundary_bytes_mismatch');
   statisticalBoundaryVerified++;
  }
  verified++;
 }
 return {verified,unavailable,...(statisticalBoundaryVerified?{statisticalBoundaryVerified}:{}),fullCommonInputsCertified:false,rawSourceLineageCertified:false};
}
