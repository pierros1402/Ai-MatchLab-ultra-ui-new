import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest } from "./daily-resume-contract.mjs";
import { archiveStage, verifyArchive, stageArchive } from "./daily-resume-artifact-store.mjs";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-store-test-"));
  const data = path.join(root, "data"), store = path.join(root, "store");
  fs.mkdirSync(data);
  fs.writeFileSync(path.join(data, "input"), "alpha");
  fs.writeFileSync(path.join(data, "result"), "bravo");
  const binding = { root: data, dayKey: "2026-11-23", producerCommit: "a".repeat(40), contractSha256: digest("contract") };
  const stage = { id: "calculate", dependsOn: [], inputs: ["input"], outputs: ["result"] };
  return { root, data, store, binding, stage };
}
function exercise(fn) {
  const f = setup(); try { fn(f); } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}
test("persist, verify and materialize checkpoint to isolated staging", () => exercise(f => {
  const a = archiveStage(f.stage, f.binding, {}, f.store);
  assert.equal(a.reusedExistingArchive, false);
  assert.equal(verifyArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256).ok, true);
  const staged = stageArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256, f.root);
  assert.equal(fs.readFileSync(path.join(staged.staging, "result"), "utf8"), "bravo");
  assert.equal(fs.readFileSync(path.join(f.data, "result"), "utf8"), "bravo");
}));
test("repeat archive is idempotent", () => exercise(f => {
  archiveStage(f.stage, f.binding, {}, f.store);
  assert.equal(archiveStage(f.stage, f.binding, {}, f.store).reusedExistingArchive, true);
}));
test("missing checkpoint rejected", () => exercise(f => {
  assert.equal(verifyArchive(f.stage, f.binding, {}, f.store, "f".repeat(64)).ok, false);
}));
test("tampered archive output rejected before materialization", () => exercise(f => {
  const a = archiveStage(f.stage, f.binding, {}, f.store);
  fs.writeFileSync(path.join(a.folder, "outputs", "result"), "bad");
  assert.equal(verifyArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256).ok, false);
  assert.throws(() => stageArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256, f.root),
    /resume_archive_not_verified/);
}));
test("changed input rejected", () => exercise(f => {
  const a = archiveStage(f.stage, f.binding, {}, f.store);
  fs.writeFileSync(path.join(f.data, "input"), "changed");
  assert.equal(verifyArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256).ok, false);
}));
test("changed producer SHA rejected", () => exercise(f => {
  const a = archiveStage(f.stage, f.binding, {}, f.store);
  f.binding.producerCommit = "b".repeat(40);
  assert.equal(verifyArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256).ok, false);
}));
test("changed contract rejected", () => exercise(f => {
  const a = archiveStage(f.stage, f.binding, {}, f.store);
  f.binding.contractSha256 = digest("new");
  assert.equal(verifyArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256).ok, false);
}));
test("tampered manifest rejected", () => exercise(f => {
  const a = archiveStage(f.stage, f.binding, {}, f.store);
  const file = path.join(a.folder, "manifest.json");
  const doc = JSON.parse(fs.readFileSync(file));
  doc.outputs[0].bytes += 1;
  fs.writeFileSync(file, JSON.stringify(doc));
  assert.equal(verifyArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256).ok, false);
}));
test("symlink archive output forbidden", () => exercise(f => {
  const a = archiveStage(f.stage, f.binding, {}, f.store);
  const file = path.join(a.folder, "outputs", "result");
  fs.unlinkSync(file);
  fs.symlinkSync(path.join(f.data, "result"), file);
  assert.equal(verifyArchive(f.stage, f.binding, {}, f.store, a.checkpoint.evidenceSha256).ok, false);
}));
