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


test("Plan C scheduled writer checks out the current branch and binds before production",()=>{
 const workflow=fs.readFileSync(".github/workflows/plan-c-shadow-daily.yml","utf8");
 assert.match(workflow,/ref: \$\{\{ github\.ref_name \}\}/);
 assert.match(workflow,/group: ai-matchlab-data-writer/);
 const bind=workflow.indexOf("name: Bind generation to current writer branch");
 assert.ok(bind>=0&&bind<workflow.indexOf("name: Refresh official ClubElo shadow source"));
 assert.match(workflow,/test -z "\$\(git status --porcelain\)"/);
 assert.match(workflow,/git fetch --no-tags origin "\$BRANCH"/);
 assert.match(workflow,/git merge --ff-only "refs\/remotes\/origin\/\$BRANCH"/);
 assert.match(workflow,/test "\$\(git rev-parse HEAD\)" = "\$\(git rev-parse "refs\/remotes\/origin\/\$BRANCH"\)"/);
 assert.equal((workflow.match(/PUSH_RETRY_PLAN_C_AUDIT_ONLY=1 PUSH_RETRY_REMOTE_WINS_UNTRACKED_REGEX="" bash tools\/git-push-rebase-retry.sh/g)||[]).length,2);
 assert.doesNotMatch(workflow,/git push origin|git reset --hard|git push --force/);
 assert.ok(workflow.indexOf("--stage=plan-c-produced")<workflow.indexOf("PUSH_RETRY_PLAN_C_AUDIT_ONLY=1"));
 assert.match(workflow,/if: \$\{\{ always\(\) && env\.DAY_KEY != '' \}\}/);
});
