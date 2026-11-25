import {test} from "node:test";
import assert from "node:assert/strict";
import {buildIntegrityQueue} from "./build-league-integrity-queue.js";
test("independent obligations survive roster holds and archive presence",()=>{
 const row={slug:"a.1",status:"ROSTER_AUTHORITY_HOLD",standingsReasons:["TEAM_COUNT_AUTHORITY_MISSING"],memoryStatus:"MISSING",archiveFiles:["2025-2026.json"],teams:[]};
 const q=buildIntegrityQueue({rows:[row]},{});
 assert.deepEqual(q.tasks.map(t=>t.kind),["REVIEW_PRIMARY_SOURCE_ADAPTER","RECONCILE_ARCHIVE_TO_MEMORY"]);
 assert.equal(q.productionMutationAuthorized,false);
 assert.equal(q.fullCoverageCertified,false);
 assert.equal(buildIntegrityQueue({rows:[row]},{"a.1":{}}).tasks[0].kind,"VERIFY_PRIMARY_AUTHORITY");
});
