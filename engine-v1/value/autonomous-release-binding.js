// Additive research binding at the existing comparison publication boundary.
import {isDeepStrictEqual} from 'node:util';
import {validateAutonomousTransport} from './autonomous-preview-transport.js';
import {validateProductionProjection} from './unified-production-journal.js';
export const AB_BINDING_FIELD='autonomousResearchEnvelope';
function verifyPair(base,transport,day){
 if(base?.ok!==true||base.date!==day||!base.plans||!['A','A2','B','B2'].every(k=>Object.hasOwn(base.plans,k)))throw Error('ab_legacy_comparison_required');
 const a=validateProductionProjection(base.unifiedPlan,day), b=validateAutonomousTransport(transport,day).unifiedPlan;
 // The existing comparison writer can refresh readiness metadata and re-sign A.
 // All material prediction, observation and settlement fields must still match.
 const material=({projectionSignature,generatedAt,dataReadiness,analysisComplete,zeroPicksCertified,...rest})=>rest;
 if(!isDeepStrictEqual(material(a),material(b)))throw Error('ab_release_combined_material_mismatch');
 return transport;
}
export function bindResearchEnvelope(base,transport,day){
 if(Object.hasOwn(base,AB_BINDING_FIELD))throw Error('ab_existing_envelope_rejected');
 verifyPair(base,transport,day);return {...base,[AB_BINDING_FIELD]:structuredClone(transport)};
}
// Reserved preview fields can only originate from the validated nested envelope.
export function stripResearchFields(base){
 const {[AB_BINDING_FIELD]:envelope,autonomousPreviewMode,autonomousPreview,autonomousDailyStats,autonomousCohortStats,autonomousResearchHold,...ordinary}=base;
 return ordinary;
}
export function composeResearchRelease(base,transport,day){
 const ordinary=stripResearchFields(base);
 if(transport===null)return {payload:ordinary,status:'HOLD',reason:'no_fresh_verified_research_candidate'};
 try{return {payload:bindResearchEnvelope(ordinary,transport,day),status:'BOUND_RESEARCH_ONLY',reason:null};}
 catch(e){return {payload:ordinary,status:'HOLD',reason:String(e?.message||e)};}
}
export function exposeBoundResearch(base,day,{pinned=false,enabled=false}={}){
 const envelope=base[AB_BINDING_FIELD],ordinary=stripResearchFields(base);
 if(!Object.hasOwn(base,AB_BINDING_FIELD))return ordinary;
 if(!pinned||!enabled)return ordinary;
 try{const t=verifyPair(ordinary,envelope,day);return {...ordinary,autonomousPreviewMode:true,autonomousPreview:t.autonomousPreview,autonomousDailyStats:t.autonomousDailyStats,autonomousCohortStats:t.autonomousCohortStats};}
 catch(e){return {...ordinary,autonomousResearchHold:String(e?.message||e)};}
}
