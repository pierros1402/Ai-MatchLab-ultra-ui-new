import test from 'node:test';
import assert from 'node:assert/strict';
import {VERIFIED_HISTORY_POLICY,verifiedHistoryRecoveryWritePaths,verifiedHistoryRecoveryWritePattern} from './verified-history-recovery-boundary.js';
const paths=['data/canonical-fixtures/2026-05-01/idn.1.json','data/final-results/2026-05-01/cid_exact.json','data/value-data-acquisition/2026-10-23/idn.1.archived-native01.results.research.json'];
const report=writePaths=>({verifiedHistoryRecovery:{sourcePolicy:VERIFIED_HISTORY_POLICY,appliedMatches:1,writePaths}});
test('the staged recovery boundary admits exact producer paths, not filename prefixes or frozen outputs',()=>{
 const regex=new RegExp(verifiedHistoryRecoveryWritePattern(report(paths)));
 for(const path of paths){assert.equal(regex.test(path),true);assert.equal(regex.test(path+'.extra.json'),false);}
 for(const path of ['data/value-unified/2026-10-23/public-plan.json','data/final-results/2026-05-01/cid_other.json','data/canonical-fixtures/2026-05-01/other.1.json'])assert.equal(regex.test(path),false);
});
test('unverified producer paths, duplicates, traversal and broad data writes cannot authorize staging',()=>{
 for(const values of [[paths[0],paths[0]],['data/value-unified/2026-10-23/public-plan.json'],['data/canonical-fixtures/../../secret.json']])assert.throws(()=>verifiedHistoryRecoveryWritePaths(report(values)),/scope/);
 assert.throws(()=>verifiedHistoryRecoveryWritePaths({verifiedHistoryRecovery:{writePaths:paths}}),/authorization/);
 assert.deepEqual(verifiedHistoryRecoveryWritePaths({}),[]);assert.equal(new RegExp(verifiedHistoryRecoveryWritePattern({})).test(paths[0]),false);
});
