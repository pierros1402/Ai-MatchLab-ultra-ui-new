export const VALUE_EXPORT_IDENTITY_FIELDS=Object.freeze(['canonicalMatchId','matchId','canonicalIdentityStatus']);
export const VALUE_EXPORT_IDENTITY_LABELS=Object.freeze(['Canonical Match ID','Stored Match ID','Identity Status']);
export function valueExportIdentity(pick,date){
 const clean=x=>String(x??'').trim();
 const declared=clean(pick?.canonicalMatchId||pick?.canonicalId),stored=clean(pick?.matchId)||declared;
 const candidate=declared||(/^cid_/.test(stored)?stored:'');
 // Legacy numeric IDs are provider identifiers. Preserve them as stored IDs;
 // a canonical identity can only come from recorded canonical evidence.
 const canonicalMatchId=candidate&&!/^\d+$/.test(candidate)?candidate:null;
 const suffix=canonicalMatchId?.match(/_(\d{8})$/)?.[1];
 const dayMismatch=(suffix&&suffix!==String(date).replaceAll('-',''))||(/^\d{4}-\d{2}-\d{2}$/.test(String(pick?.date||''))&&pick.date!==date);
 return {canonicalMatchId,matchId:stored||canonicalMatchId||null,canonicalIdentityStatus:dayMismatch?'CANONICAL_DAY_MISMATCH':canonicalMatchId?'RECORDED_CANONICAL_ID':'LEGACY_ID_UNBOUND'};
}
export function valueExportIdentityValues(row){return VALUE_EXPORT_IDENTITY_FIELDS.map(key=>row?.[key]??'');}
