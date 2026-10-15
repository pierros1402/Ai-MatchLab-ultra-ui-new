import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createValueDecisionEvidence } from "./value-decision-evidence.js";
import { isHistoryEvidencePath, preserveHistoryCheckpoint, restoreHistoryCheckpoint } from "./history-preservation.js";

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "matchlab-input-evidence-"));
  try { run(root); }
  finally {
    const checked = fs.realpathSync(root);
    assert.ok(checked.startsWith(fs.realpathSync(os.tmpdir()) + path.sep));
    assert.ok(path.basename(checked).startsWith("matchlab-input-evidence-"));
    fs.rmSync(checked, { recursive: true });
  }
}
function readRef(root, ref) {
  const raw = fs.readFileSync(path.join(root, ref.path.replace(/^data\//u, "")));
  assert.equal(crypto.createHash("sha256").update(raw).digest("hex"), ref.sha256);
  assert.ok(isHistoryEvidencePath(ref.path));
  return JSON.parse(raw);
}

test("actual cached inputs are frozen by content and shared without mutating a prior capture", () => fixture(dataRoot => {
  const inputs = { indexes: { teamForm: { Team: { sample: 3 } } }, priors: {} };
  const first = createValueDecisionEvidence("2099-12-30", "plan-a", inputs, { dataRoot });
  const original = readRef(dataRoot, first.summary().records[0].receipt);
  const second = createValueDecisionEvidence("2099-12-30", "plan-a2", inputs, { dataRoot });
  const same = readRef(dataRoot, second.summary().records[0].receipt);
  assert.deepEqual(original.inputs.indexes, same.inputs.indexes);
  inputs.indexes.teamForm.Team.sample = 4;
  const later = first.capture("engine_arguments", inputs, "cid_fixture");
  const changed = readRef(dataRoot, later);
  assert.notEqual(original.inputs.indexes.sha256, changed.inputs.indexes.sha256);
  assert.equal(readRef(dataRoot, original.inputs.indexes).teamForm.Team.sample, 3);
  assert.equal(readRef(dataRoot, changed.inputs.indexes).teamForm.Team.sample, 4);
  assert.equal(original.originalHistoricalObservationCertified, false);
  assert.equal(original.upstreamRawInputLineageFullyCertified, false);
}));

test("corrupt content-addressed input is retained and rejects a later capture", () => fixture(dataRoot => {
  const evidence = createValueDecisionEvidence("2099-12-30", "plan-b", { fixture: { modelProb: .8 } }, { dataRoot });
  const receipt = readRef(dataRoot, evidence.summary().records[0].receipt);
  const file = path.join(dataRoot, receipt.inputs.fixture.path.replace(/^data\//u, ""));
  fs.writeFileSync(file, "corrupt retained evidence");
  assert.throws(() => evidence.capture("assessment_selector_arguments", { fixture: { modelProb: .8 } }), { code: "VALUE_DECISION_EVIDENCE_FAILED" });
  assert.equal(fs.readFileSync(file, "utf8"), "corrupt retained evidence");
}));

test("credentials and credential URLs cannot be copied into an evidence object", () => fixture(dataRoot => {
  const evidence = createValueDecisionEvidence("2099-12-30", "plan-b2", {}, { dataRoot });
  for (const value of [{ nested: { apiKey: "fixture-secret" } }, { url: "https://example.invalid/?access_token=fixture-secret" }]) {
    assert.throws(() => evidence.capture("assessment_selector_arguments", { value }), { code: "VALUE_DECISION_EVIDENCE_FAILED" });
  }
  assert.equal(evidence.summary().records.length, 1);
}));

test("missing, null, undefined and non-finite inputs stay distinguishable", () => fixture(dataRoot => {
  const evidence = createValueDecisionEvidence("2099-12-30", "plan-a", {
    values: { nullValue: null, missingValue: undefined, nan: NaN, infinity: Infinity }
  }, { dataRoot });
  const receipt = readRef(dataRoot, evidence.summary().records[0].receipt);
  const values = readRef(dataRoot, receipt.inputs.values);
  assert.equal(values.nullValue, null);
  assert.deepEqual(values.missingValue, { __valueEvidenceType: "undefined" });
  assert.deepEqual(values.nan, { __valueEvidenceType: "number", value: "NaN" });
  assert.deepEqual(values.infinity, { __valueEvidenceType: "number", value: "Infinity" });
}));

test("a captured decision survives Git checkpoint and independent restore", () => fixture(temp => {
  const project = path.join(temp, "project"), remote = path.join(temp, "remote.git");
  fs.mkdirSync(project);
  const git = args => execFileSync("git", args, { cwd: project, windowsHide: true, stdio: "pipe" });
  git(["init", "-b", "main"]); git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  fs.writeFileSync(path.join(project, "source.txt"), "fixture source\n");
  git(["add", "source.txt"]); git(["commit", "-m", "fixture"]);
  git(["init", "--bare", remote]); git(["remote", "add", "origin", remote]);
  const evidence = createValueDecisionEvidence("2099-12-30", "plan-a2", { priors: { sample: 4 } }, { dataRoot: path.join(project, "data") });
  const ref = evidence.summary().records[0].receipt;
  const checkpoint = preserveHistoryCheckpoint({ root: project, dayKey: "2099-12-30", stage: "input-evidence", runId: "fixture" });
  const destination = path.join(temp, "restored");
  restoreHistoryCheckpoint({ root: project, ref: checkpoint.archiveCommit, manifestPath: checkpoint.manifestPath, destination });
  const receipt = readRef(path.join(destination, "data"), ref);
  assert.equal(readRef(path.join(destination, "data"), receipt.inputs.priors).sample, 4);
}));
