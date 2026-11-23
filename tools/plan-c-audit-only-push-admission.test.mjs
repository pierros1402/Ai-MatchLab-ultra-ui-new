import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {decidePlanCAuditOnlyRemoteDiff as decide} from "./plan-c-audit-only-push-admission.mjs";
test("only separate Stage20 audit sources admitted",()=>{
 const x=decide(["tools/audit-stage20-value-acquisition-temporal.mjs",
 ".github/workflows/p0-stage20-value-acquisition-temporal.yml",
 "tools/audit-stage20-value-acquisition-temporal.test.mjs"]);
 assert.equal(x.ok,true);assert.equal(x.files,3);
});
test("empty unverified diff, duplicates and path injection refused",()=>{
 for(const paths of [[],[""],["tools/audit-stage20-a.mjs","tools/audit-stage20-a.mjs"],
 ["tools/audit-stage20-a.mjs\0data/x"],["tools/../audit-stage20-a.mjs"],["tools\\audit-stage20-a.mjs"]])
 assert.equal(decide(paths).ok,false,JSON.stringify(paths));
});
test("runtime, truth, publication and unrelated remote edits denied",()=>{
 for(const path of ["engine-v1/jobs/run-daily-cycle.js","tools/git-push-rebase-retry.sh",
 ".github/workflows/daily-deploy-snapshot.yml","data/plan-c-shadow/settlement/latest.json",
 "data/canonical-fixtures/2026-11-23/x.json","data/deploy-snapshots/latest.json",
 "tools/audit-daily954-stage20-history.mjs","tools/audit-stage20-a.js",
 ".github/workflows/intraday-deploy-snapshot-refresh.yml","README.md"])
 assert.equal(decide([path]).ok,false,path);
});
test("final Daily opt-in is scoped to snapshot push",()=>{
 const daily=fs.readFileSync(".github/workflows/daily-deploy-snapshot.yml","utf8");
 const script=fs.readFileSync("tools/git-push-rebase-retry.sh","utf8");
 assert.equal((daily.match(/PUSH_RETRY_PLAN_C_AUDIT_ONLY=1/g)||[]).length,1);
 assert.match(daily,/git commit -m "Auto refresh deploy snapshot for \$\{DAY_KEY\}"\s+[\s\S]*?PUSH_RETRY_PLAN_C_AUDIT_ONLY=1 bash tools\/git-push-rebase-retry.sh/);
 assert.match(script,/plan_c_snapshot_rebase_forbidden_after_push_rejection/);
 assert.match(script,/plan_c_remote_diff_not_audit_only/);
 assert.match(script,/PLAN_C_AUDIT_ONLY_REBASE_REVALIDATED=true/);
 for(const gate of ["run-snapshot-invariant-check.js","verify-details-value-mirror-day.js","check-publication-ft.mjs","verify-daily-publish-contract.js"])assert.ok(script.includes(gate),gate);
});
