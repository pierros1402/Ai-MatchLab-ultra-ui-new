import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const yml = fs.readFileSync(path.resolve(".github/workflows/daily-deploy-snapshot.yml"), "utf8");
const original = "      - name: Run daily cycle";
const capture = "      - name: Shadow capture verified stage-20 worktree delta (opt-in only)";
const upload = "      - name: Preserve successful stage-20 delta as short-lived GitHub artifact";
const next = "      - name: Run team geo enrichment";
function assertBounded(document) {
  const stages = [original, capture, upload, next].map(x => document.indexOf(x));
  assert.ok(stages.every(x => x >= 0), "stage20-shadow-marker-missing");
  assert.ok(stages.every((x, i) => i === 0 || x > stages[i - 1]), "stage20-shadow-reordered");
  const snippet = document.slice(stages[1], stages[3]);
  assert.match(snippet, /vars\.AIML_DAILY_STAGE20_CAPTURE_ENABLED == '1'/);
  assert.match(snippet, /continue-on-error: true/);
  const captureStep = document.slice(stages[1], stages[2]);
  const guard = captureStep.split("\n").find(line => line.trim().startsWith("if:"));
  assert.ok(guard, "capture guard missing");
  for (const clause of ["env.SKIP_BUILD != 'true'", "vars.AIML_DAILY_STAGE20_CAPTURE_ENABLED == '1'", "vars.AIML_DAILY_STAGE20_PREPOST_INVENTORY_ENABLED == '1'", "steps.daily_cycle.outcome == 'success'", "steps.shadow_stage20_pre.outcome == 'success'", "steps.shadow_stage20_post.outcome == 'success'"]) assert.ok(guard.includes(clause), clause);
  assert.ok(!guard.includes("||"), "capture guard must be conjunctive");
  assert.match(captureStep, /bind-observed-stage20-delta\.mjs "\$DAY_KEY"/);
  assert.match(snippet, /aiml-stage20-bound-delta\//);
  assert.match(snippet, /steps\.shadow_capture_stage20\.outcome == 'success'/);
  assert.match(snippet, /retention-days: 2/);
  assert.match(snippet, /if-no-files-found: error/);
  assert.doesNotMatch(snippet, /git (commit|push)|--resume|--skip-/);
}
test("stage20 capture is between successful cycle and geo, default-off and non-blocking", () => {
  assertBounded(yml);
});
test("reordering capture before cycle is rejected", () => {
  const a = yml.replace(capture, "      - name: TEMP-RENAME");
  assert.throws(() => assertBounded(a.replace(original, capture).replace("      - name: TEMP-RENAME", original)),
    /stage20-shadow-reordered/);
});
test("unconditional capture activation is rejected", () => {
  assert.throws(() => assertBounded(yml.replaceAll("vars.AIML_DAILY_STAGE20_CAPTURE_ENABLED == '1'",
    "vars.AIML_DAILY_STAGE20_CAPTURE_ENABLED != '0'")),
    /AIML_DAILY_STAGE20_CAPTURE_ENABLED/);
});
test("missing successful capture guard on upload is rejected", () => {
  assert.throws(() => assertBounded(yml.replace(" && steps.shadow_capture_stage20.outcome == 'success'", "")),
    /shadow_capture_stage20/);
});
test("shadow lane must not bypass publication", () => {
  assert.throws(() => assertBounded(yml.replace("retention-days: 2", "retention-days: 2\n          git push origin main")),
    /not match/);
});

test("missing actual cycle or observation success guard is rejected", () => {
  for (const id of ["daily_cycle","shadow_stage20_pre","shadow_stage20_post"]) {
    const start=yml.indexOf(capture), end=yml.indexOf(upload);
    const changed=yml.slice(0,start)+yml.slice(start,end).replace(" && steps."+id+".outcome == 'success'","")+yml.slice(end);
    assert.notEqual(changed,yml);
    assert.throws(()=>assertBounded(changed), new RegExp(id));
  }
});
test("capture without pre/post opt-in is rejected", () => {
  const start=yml.indexOf(capture), end=yml.indexOf(upload);
  const changed=yml.slice(0,start)+yml.slice(start,end).replace(" && vars.AIML_DAILY_STAGE20_PREPOST_INVENTORY_ENABLED == '1'","")+yml.slice(end);
  assert.notEqual(changed,yml);
  assert.throws(()=>assertBounded(changed), /AIML_DAILY_STAGE20_PREPOST_INVENTORY_ENABLED/);
});
