export const RESTORED_DAY='2026-10-31';
export const RESTORED_HASH='fe973e7ec8eadc16da6983358f89b02da555f1c9115cfde9cdf37ce741d71506';
export function restoredDaySyncAdmission({ref,manifest,receipt,latestDay,publicRelease}){
 if(!/^[a-f0-9]{40}$/.test(ref||''))throw Error('immutable_source_ref_required');
 if(manifest?.date!==RESTORED_DAY||manifest?.hash!==RESTORED_HASH||manifest?.valueGate?.ok!==true||manifest?.valueGate?.frozenReleaseSafe!==true)throw Error('approved_restoration_manifest_required');
 if(manifest.counts?.fixtures!==537||manifest.counts?.details!==537||manifest.counts?.valuePicks!==1)throw Error('approved_restoration_counts_required');
 if(receipt?.day!==RESTORED_DAY||receipt?.after?.manifestHash!==RESTORED_HASH||receipt?.originalSignature!=='12f7556309c0f1149b0fdddc1063440193a01255459e7446725b749250c99735'||receipt?.after?.valueHash!=='4f88815a450a442fbaf889c9bf31b0763bf92ee42e964da9cec4916443e142fa')throw Error('approved_restoration_receipt_required');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(latestDay||'')||latestDay<=RESTORED_DAY)throw Error('historical_sync_must_not_promote_latest');
 return {day:RESTORED_DAY,ref,expectedHash:RESTORED_HASH,action:publicRelease?.ok===true&&publicRelease?.date===RESTORED_DAY&&publicRelease?.manifest?.hash===RESTORED_HASH?'VERIFIED':'SYNC_REQUIRED'};
}
