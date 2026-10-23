export const VERIFIED_HISTORY_POLICY='exact-native-future-team-v1';
const allowed=/^data\/(?:canonical-fixtures\/\d{4}-\d{2}-\d{2}\/[a-z0-9_.-]+\.json|final-results\/\d{4}-\d{2}-\d{2}\/cid_[a-zA-Z0-9_]+\.json|value-data-acquisition\/\d{4}-\d{2}-\d{2}\/[a-z0-9_.-]+\.archived-[A-Za-z0-9]{6,16}\.results\.research\.json)$/;

export function verifiedHistoryRecoveryWritePaths(report){
  const recovery=report.verifiedHistoryRecovery,paths=recovery?.writePaths||[];
  if(!Array.isArray(paths)||new Set(paths).size!==paths.length||paths.some(p=>!allowed.test(p)))throw Error('verified_history_recovery_write_scope_invalid');
  if(paths.length&&(recovery.sourcePolicy!==VERIFIED_HISTORY_POLICY||!Number.isInteger(recovery.appliedMatches)||recovery.appliedMatches<1||recovery.appliedMatches>40))throw Error('verified_history_recovery_authorization_invalid');
  return paths;
}

export function verifiedHistoryRecoveryWritePattern(report){
  const paths=verifiedHistoryRecoveryWritePaths(report);
  return paths.length?'^(?:'+paths.map(p=>p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')+')$':'(?!)';
}
