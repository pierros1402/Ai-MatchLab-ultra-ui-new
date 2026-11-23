import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest } from "./daily-resume-contract.mjs";
import { packResumeTransport, verifyResumeTransport, stageResumeTransport } from "./daily-resume-transport.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-resume-transfer-"));
  const source = path.join(root, "source");
  fs.mkdirSync(source);
  fs.mkdirSync(path.join(source, "nested"));
  fs.writeFileSync(path.join(source, "input.txt"), "bound upstream bytes");
  fs.writeFileSync(path.join(source, "nested", "result.txt"), "verified calculated output");
  const binding = { root: source, dayKey: "2026-11-23",
    producerCommit: "a".repeat(40), contractSha256: digest("resume-contract") };
  const stage = { id: "calculate", dependsOn: [], inputs: ["input.txt"],
    outputs: ["nested/result.txt"] };
  const custody = { repository: "pierros1402/Ai-MatchLab-ultra-ui-new",
    runId: "45137286904", attempt: 1, producerCommit: binding.producerCommit,
    dayKey: binding.dayKey, stageId: stage.id };
  const storeRoot = path.join(root, "archive");
  const bundleRoot = path.join(root, "bundle");
  const pack = () => packResumeTransport({ stage, binding, storeRoot, bundleRoot, custody });
  const verify = (overrides = {}) => verifyResumeTransport({
    stage, binding, bundleRoot, expectedCustody: custody, ...overrides
  });
  const stageIt = (overrides = {}) => stageResumeTransport({
    stage, binding, bundleRoot, expectedCustody: custody, stagingParent: root, ...overrides
  });
  return { root, source, binding, stage, custody, bundleRoot, pack, verify, stageIt };
}
function use(fn) {
  const f = fixture();
  try { fn(f); } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
}
test("signed-by-content bundle transfers and stages exact nested output", () => use(f => {
  const a = f.pack();
  assert.equal(a.count, 2);
  assert.equal(f.verify().ok, true);
  const staged = f.stageIt();
  assert.equal(fs.readFileSync(path.join(staged.staging, "nested", "result.txt"), "utf8"),
    "verified calculated output");
}));
test("different producer runner can consume bundle with matching current inputs", () => use(f => {
  f.pack();
  const another = path.join(f.root, "another-run");
  fs.mkdirSync(another);
  fs.copyFileSync(path.join(f.source, "input.txt"), path.join(another, "input.txt"));
  const binding = { ...f.binding, root: another };
  const restored = f.stageIt({ binding });
  assert.equal(fs.readFileSync(path.join(restored.staging, "nested", "result.txt"), "utf8"),
    "verified calculated output");
  assert.equal(fs.existsSync(path.join(another, "nested", "result.txt")), false);
}));
test("wrong runId is denied", () => use(f => {
  f.pack();
  assert.equal(f.verify({ expectedCustody: { ...f.custody, runId: "45137286905" } }).ok, false);
}));
test("wrong run attempt is denied", () => use(f => {
  f.pack();
  assert.equal(f.verify({ expectedCustody: { ...f.custody, attempt: 2 } }).ok, false);
}));
test("wrong repository is denied", () => use(f => {
  f.pack();
  assert.equal(f.verify({ expectedCustody: { ...f.custody, repository: "other/repository" } }).ok, false);
}));
test("wrong producer sha is denied", () => use(f => {
  f.pack();
  assert.equal(f.verify({ expectedCustody: { ...f.custody, producerCommit: "b".repeat(40) } }).ok, false);
}));
test("wrong day is denied", () => use(f => {
  f.pack();
  assert.equal(f.verify({ expectedCustody: { ...f.custody, dayKey: "2026-11-24" } }).ok, false);
}));
test("unmatched current source input is denied", () => use(f => {
  f.pack();
  fs.writeFileSync(path.join(f.source, "input.txt"), "new source");
  assert.equal(f.verify().ok, false);
}));
test("changed artifact bytes denied", () => use(f => {
  f.pack();
  const files = fs.readdirSync(path.join(f.bundleRoot, "store", f.binding.dayKey, f.stage.id));
  fs.writeFileSync(path.join(f.bundleRoot, "store", f.binding.dayKey, f.stage.id,
    files[0], "outputs", "nested", "result.txt"), "evil");
  assert.equal(f.verify().ok, false);
}));
test("extra undeclared artifact rejected", () => use(f => {
  f.pack();
  fs.writeFileSync(path.join(f.bundleRoot, "undeclared.txt"), "extra");
  assert.equal(f.verify().ok, false);
}));
test("missing artifact output rejected", () => use(f => {
  f.pack();
  const files = fs.readdirSync(path.join(f.bundleRoot, "store", f.binding.dayKey, f.stage.id));
  fs.rmSync(path.join(f.bundleRoot, "store", f.binding.dayKey, f.stage.id,
    files[0], "outputs", "nested", "result.txt"));
  assert.equal(f.verify().ok, false);
}));
test("tampered transport manifest rejected", () => use(f => {
  f.pack();
  const p = path.join(f.bundleRoot, "transport.json");
  const doc = JSON.parse(fs.readFileSync(p, "utf8"));
  doc.custody.attempt = 7;
  fs.writeFileSync(p, JSON.stringify(doc));
  assert.equal(f.verify().ok, false);
}));
test("symlink injected into downloaded bundle rejected", () => use(f => {
  f.pack();
  fs.symlinkSync(path.join(f.source, "input.txt"), path.join(f.bundleRoot, "surprise"));
  assert.equal(f.verify().ok, false);
}));
test("missing transport manifest rejected without staging", () => use(f => {
  f.pack();
  fs.rmSync(path.join(f.bundleRoot, "transport.json"));
  assert.equal(f.verify().ok, false);
  assert.throws(() => f.stageIt(), /resume_transport_not_verified/);
}));
test("cannot overwrite previously generated bundle", () => use(f => {
  f.pack();
  assert.throws(() => f.pack(), /resume_transport_bundle_exists/);
}));
test("bundle with malformed producer custody rejected", () => use(f => {
  assert.throws(() => packResumeTransport({
    stage: f.stage, binding: f.binding, storeRoot: path.join(f.root, "archive"),
    bundleRoot: f.bundleRoot, custody: { ...f.custody, runId: "unknown" }
  }), /resume_transport_custody_invalid/);
}));
