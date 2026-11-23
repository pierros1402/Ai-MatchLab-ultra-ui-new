import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest, createCheckpoint, planResume, validateGraph } from "./daily-resume-contract.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-resume-contract-"));
  const write = (name, value) => fs.writeFileSync(path.join(root, name), value);
  write("input", "trusted input"); write("stage-a", "done-a"); write("stage-b", "done-b"); write("stage-c", "done-c");
  const binding = { root, dayKey: "2026-11-23", producerCommit: "a".repeat(40), contractSha256: digest("immutable contract") };
  const stages = [
    { id: "acquire", dependsOn: [], inputs: ["input"], outputs: ["stage-a"] },
    { id: "calculate", dependsOn: ["acquire"], inputs: ["stage-a"], outputs: ["stage-b"] },
    { id: "publish", dependsOn: ["calculate"], inputs: ["stage-b"], outputs: ["stage-c"] }
  ];
  const a = createCheckpoint(stages[0], binding);
  const b = createCheckpoint(stages[1], binding, { acquire: a.evidenceSha256 });
  const c = createCheckpoint(stages[2], binding, { calculate: b.evidenceSha256 });
  return { root, write, binding, stages, checkpoints: { acquire: a, calculate: b, publish: c } };
}
function withFixture(fn) {
  const f = fixture(); try { fn(f); } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}
test("exact bound checkpoints reused, no publication authorization", () => withFixture(f => {
  const result = planResume(f.stages, f.binding, f.checkpoints);
  assert.equal(result.resumeFrom, null); assert.equal(result.reusedStages, 3);
  assert.equal(result.publicationAuthorized, false);
}));
test("missing last checkpoint resumes at final stage only", () => withFixture(f => {
  delete f.checkpoints.publish;
  const result = planResume(f.stages, f.binding, f.checkpoints);
  assert.equal(result.resumeFrom, "publish"); assert.equal(result.reusedStages, 2);
}));
test("missing middle checkpoint invalidates dependent suffix", () => withFixture(f => {
  delete f.checkpoints.calculate;
  assert.deepEqual(planResume(f.stages, f.binding, f.checkpoints).plan.map(x => x.decision),
    ["REUSE_VERIFIED", "RUN", "RUN"]);
}));
test("mutated output fails closed", () => withFixture(f => {
  f.write("stage-b", "corrupted");
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "calculate");
}));
test("mutated input invalidates all stages", () => withFixture(f => {
  f.write("input", "changed");
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "acquire");
}));
test("changed code SHA invalidates all stages", () => withFixture(f => {
  f.binding.producerCommit = "b".repeat(40);
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "acquire");
}));
test("changed contract SHA invalidates all stages", () => withFixture(f => {
  f.binding.contractSha256 = digest("different policy");
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "acquire");
}));
test("changed day key invalidates all stages", () => withFixture(f => {
  f.binding.dayKey = "2026-11-24";
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "acquire");
}));
test("incomplete checkpoint never reused", () => withFixture(f => {
  delete f.checkpoints.calculate.outputs;
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "calculate");
}));
test("forged evidence digest rejected", () => withFixture(f => {
  f.checkpoints.acquire.evidenceSha256 = "f".repeat(64);
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "acquire");
}));
test("forward dependencies rejected", () => {
  assert.throws(() => validateGraph([{ id: "bad", dependsOn: ["later"], inputs: [], outputs: ["a"] }]),
    /resume_dependency_order_invalid/);
});
test("symlink output fails closed", () => withFixture(f => {
  fs.unlinkSync(path.join(f.root, "stage-b"));
  fs.symlinkSync(path.join(f.root, "stage-c"), path.join(f.root, "stage-b"));
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "calculate");
}));
test("traversal path forbidden", () => withFixture(f => {
  assert.throws(() => createCheckpoint({ ...f.stages[0], outputs: ["../secret"] }, f.binding),
    /unsafe_checkpoint_path/);
}));
test("dependency digest mismatch invalidates suffix", () => withFixture(f => {
  f.checkpoints.calculate.dependencies.acquire = "0".repeat(64);
  assert.equal(planResume(f.stages, f.binding, f.checkpoints).resumeFrom, "calculate");
}));
