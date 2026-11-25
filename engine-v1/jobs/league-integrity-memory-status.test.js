import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIntegrityQueue} from './build-league-integrity-queue.js';
test('empty, invalid and review memory cannot disappear behind roster hold',()=>{
 const rows=['EMPTY','INVALID','REVIEW'].map((memoryStatus,i)=>({slug:'test.'+i,memoryStatus,status:'ROSTER_AUTHORITY_HOLD',archiveFiles:i===0?['2026-2027.json']:[],standingsReasons:[],teams:[]}));
 const q=buildIntegrityQueue({rows},{});
 for(const [i,kind] of ['RECONCILE_ARCHIVE_TO_MEMORY','REVIEW_INVALID_MEMORY','REVIEW_MEMORY_QUALITY'].entries())assert.ok(q.tasks.some(t=>t.slug==='test.'+i&&t.kind===kind));
 assert.equal(q.productionMutationAuthorized,false);
});
