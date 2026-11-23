import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {auditStage20ObserverWiring} from "./daily-resume-stage20-observer-wiring.mjs";
const source=fs.readFileSync(".github/workflows/daily-deploy-snapshot.yml","utf8");
const pre="Shadow read-only Stage20 pre-cycle data inventory (default OFF)";
const post="Shadow read-only Stage20 post-cycle data inventory (default OFF)";
test("exact default OFF Stage20 pre-cycle and post-cycle observer boundaries",()=>{
  const r=auditStage20ObserverWiring(source);
  assert.equal(r.defaultOff,true);
  assert.equal(r.productionResumeAuthorized,false);
  assert.equal(r.publicationAuthorized,false);
  assert.deepEqual(r.boundaryOrder,["pre","cycle","post","existing-shadow-capture"]);
});
test("moving pre observer after Daily is denied",()=>{
  const broken=source.replace("      - name: "+pre,"      - name: MOVED_PRE")
    .replace("      - name: "+post,"      - name: "+pre)
    .replace("      - name: MOVED_PRE","      - name: "+post);
  assert.throws(()=>auditStage20ObserverWiring(broken),/stage20_observer_wrong_boundary_order/);
});
test("unconditional pre-capture activation denied",()=>{
  assert.throws(()=>auditStage20ObserverWiring(source.replace(
    "if: env.SKIP_BUILD != 'true' && vars.AIML_DAILY_STAGE20_PREPOST_INVENTORY_ENABLED == '1'",
    "if: env.SKIP_BUILD != 'true'")) ,/stage20_observer_fail_closed_guard_missing/);
});
test("post cannot run without verified success of pre",()=>{
  const broken=source.replace(" && steps.shadow_stage20_pre.outcome == 'success'","");
  assert.throws(()=>auditStage20ObserverWiring(broken),/stage20_observer_post_binding_invalid/);
});
test("observer errors must not block normal Daily publication",()=>{
  const broken=source.replace(
    "id: shadow_stage20_post\n        if:",
    "id: shadow_stage20_post\n        # no error isolation\n        if:"
  ).replace(
    "steps.shadow_stage20_pre.outcome == 'success'\n        continue-on-error: true",
    "steps.shadow_stage20_pre.outcome == 'success'");
  assert.throws(()=>auditStage20ObserverWiring(broken),/stage20_observer_fail_closed_guard_missing/);
});
test("Daily cycle remains mandatory and cannot be hidden by observer",()=>{
  const broken=source.replace(
    'run: node ./engine-v1/jobs/run-daily-cycle.js "$DAY_KEY"',
    'continue-on-error: true\n        run: node ./engine-v1/jobs/run-daily-cycle.js "$DAY_KEY"'
  );
  assert.throws(()=>auditStage20ObserverWiring(broken),/stage20_observer_cycle_failure_not_propagated/);
});
test("observer must not upload its unreviewed manifest",()=>{
  const broken=source.replace(
    'node engine-v1/jobs/observe-stage20-data-inventory.mjs post "$DAY_KEY"',
    'node engine-v1/jobs/observe-stage20-data-inventory.mjs post "$DAY_KEY"\n          actions/upload-artifact@v4'
  );
  assert.throws(()=>auditStage20ObserverWiring(broken),/stage20_observer_fail_closed_guard_missing/);
});
