import {getProjectRoot} from '../storage/data-root.js';
import {checkpointHistoryIfRequired} from '../storage/history-preservation.js';
import {VERIFIED_HISTORY_POLICY,prepareVerifiedHistoryRecovery} from './prepare-verified-history-recovery.js';
import {applyPreparedHistoryEvidence,canonicalRowsInCheckout} from './apply-reviewed-archived-match-import.js';

export function applyVerifiedHistoryRecovery(prepared,{root,sourcePolicy,nowFn=()=>Date.now(),checkpoint=checkpointHistoryIfRequired,dayKey}={}) {
  if(sourcePolicy!==VERIFIED_HISTORY_POLICY||prepared.sourcePolicy!==sourcePolicy)throw Error('VERIFIED_HISTORY_POLICY_REQUIRED');
  if(!prepared.batch.ok||!prepared.proposals.length||prepared.proposals.some(p=>!p.ok||p.consumerValidation!=='PASSED'))throw Error('VERIFIED_HISTORY_PREPARATION_REQUIRED');
  if(prepared.batch.files.some(file=>!['MERGE_ADDITIVE_ONLY_AFTER_REVIEW','CREATE_ONLY_AFTER_REVIEW'].includes(file.mode)))throw Error('VERIFIED_HISTORY_PREPARATION_MODE_INVALID');
  const validScope=()=>prepared.scope.length===prepared.proposals.length&&prepared.proposals.every(proposal=>{
    const id=proposal.canonicalProposal.providerIds.flashscore;
    const scope=prepared.scope.filter(s=>s.providerMatchId===id);
    return scope.length===1&&scope[0].bindings.some(b=>Date.parse(b.kickoffUtc)>nowFn());
  });
  if(!validScope())throw Error('VERIFIED_HISTORY_FUTURE_SCOPE_REQUIRED');
  checkpoint(dayKey,'before-automatic-verified-history');
  if(!validScope())throw Error('VERIFIED_HISTORY_SCOPE_EXPIRED_DURING_CHECKPOINT');
  const authorized={...prepared,authorization:sourcePolicy,reviewRequired:false,batch:{...prepared.batch,files:prepared.batch.files.map(file=>({...file,
    mode:file.mode==='MERGE_ADDITIVE_ONLY_AFTER_REVIEW'?'MERGE_ADDITIVE_ONLY_AFTER_SOURCE_POLICY_VALIDATION':'CREATE_ONLY_AFTER_SOURCE_POLICY_VALIDATION'}))}};
  const applied=applyPreparedHistoryEvidence(authorized,{root,authorization:sourcePolicy,afterWrite:()=>checkpoint(dayKey,'after-automatic-verified-history')});
  return {...applied,authorization:sourcePolicy,individualRowsHumanReviewed:false,frozenPredictionsRegenerated:false};
}

export async function recoverVerifiedHistory(dayKey,bindings,{fixtures,sourcePolicy,nowFn=()=>Date.now(),resolveProviderIdentity=null}={}) {
  if(sourcePolicy!==VERIFIED_HISTORY_POLICY||process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REPOSITORY!=='pierros1402/Ai-MatchLab-ultra-ui-new'
    ||!['Autonomous Value data preparation','Intraday deploy snapshot refresh'].includes(process.env.GITHUB_WORKFLOW)||process.env.HISTORY_PRESERVATION_REQUIRED!=='1'){
    throw Error('VERIFIED_HISTORY_SHARED_WRITER_REQUIRED');
  }
  const root=getProjectRoot();
  const prepared=await prepareVerifiedHistoryRecovery(bindings,{fixtures,canonicalRows:canonicalRowsInCheckout(root),nowFn,resolveProviderIdentity});
  const summary={sourcePolicy,attempted:prepared.attempted,verified:prepared.accepted,deferred:prepared.deferred,rejected:prepared.rejected,
    conflicts:prepared.batch.conflicts,sourceBindings:prepared.scope,individualRowsHumanReviewed:false,
    appliedMatches:0,writePaths:[],frozenPredictionsRegenerated:false,fullCoverageCertified:false};
  if(!prepared.batch.ok||!prepared.accepted)return summary;
  const applied=applyVerifiedHistoryRecovery(prepared,{root,sourcePolicy,nowFn,dayKey});
  return {...summary,appliedMatches:applied.canonicalAdditions,writePaths:applied.writtenPaths};
}
