import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  promoteHistoricalReleaseSandbox,
  snapshotSandboxInventory
} from "./historical-release-transaction-sandbox.js";

function createScenario() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-v35-tx-test-")
  );

  const target = path.join(root, "target");
  const stage = path.join(root, "stage");

  for (const folder of [target, stage]) {
    fs.mkdirSync(path.join(folder, "details"), { recursive: true });

    for (const [name, value] of Object.entries({
      "fixtures.json": '{"state":"old"}',
      "manifest.json": '{"hash":"old"}',
      "value.json": '{"frozen":true}',
      "value-audit.json": '{"frozen":true}',
      "plan-c-shadow.json": '{"frozen":true}',
      "plan-c-shadow-audit.json": '{"frozen":true}',
      "details/fixture.json": '{"status":"PRE"}'
    })) {
      fs.writeFileSync(path.join(folder, name), value);
    }
  }

  fs.writeFileSync(
    path.join(stage, "fixtures.json"),
    '{"state":"verified-final"}'
  );
  fs.writeFileSync(
    path.join(stage, "manifest.json"),
    '{"hash":"updated"}'
  );
  fs.writeFileSync(
    path.join(stage, "details", "fixture.json"),
    '{"status":"FT"}'
  );

  return { root, target, stage };
}

function cleanup(s) {
  fs.rmSync(s.root, { recursive: true, force: true });
}

test("sandbox promotion preserves frozen artifacts", () => {
  const s = createScenario();
  try {
    const before = snapshotSandboxInventory(s.target);
    const result = promoteHistoricalReleaseSandbox({
      targetDir: s.target,
      stageDir: s.stage,
      expectedTargetInventory: before
    });

    assert.equal(result.ok, true);
    assert.equal(result.sandboxOnly, true);
    assert.equal(result.changedFiles.length, 3);
    assert.equal(
      fs.readFileSync(path.join(s.target, "details", "fixture.json"), "utf8"),
      '{"status":"FT"}'
    );
  } finally {
    cleanup(s);
  }
});

for (const failure of ["after_backup", "after_promote"]) {
  test("injected failure restores exact preimage: " + failure, () => {
    const s = createScenario();
    try {
      const before = snapshotSandboxInventory(s.target);

      assert.throws(() => promoteHistoricalReleaseSandbox({
        targetDir: s.target,
        stageDir: s.stage,
        expectedTargetInventory: before,
        injectFailureAt: failure
      }), /injected_/);

      assert.deepEqual(
        snapshotSandboxInventory(s.target),
        before
      );
    } finally {
      cleanup(s);
    }
  });
}

test("preimage drift blocks promotion", () => {
  const s = createScenario();
  try {
    const before = snapshotSandboxInventory(s.target);
    fs.writeFileSync(path.join(s.target, "fixtures.json"), "drift");

    assert.throws(() => promoteHistoricalReleaseSandbox({
      targetDir: s.target,
      stageDir: s.stage,
      expectedTargetInventory: before
    }), /transaction_preimage_drift/);
  } finally {
    cleanup(s);
  }
});

test("changed frozen Value blocks promotion", () => {
  const s = createScenario();
  try {
    const before = snapshotSandboxInventory(s.target);
    fs.writeFileSync(path.join(s.stage, "value.json"), "changed");

    assert.throws(() => promoteHistoricalReleaseSandbox({
      targetDir: s.target,
      stageDir: s.stage,
      expectedTargetInventory: before
    }), /transaction_frozen_artifact_changed/);
  } finally {
    cleanup(s);
  }
});

test("real repository snapshot paths cannot be promoted", () => {
  const s = createScenario();
  try {
    assert.throws(() => promoteHistoricalReleaseSandbox({
      targetDir: process.cwd(),
      stageDir: s.stage,
      expectedTargetInventory: new Map()
    }), /transaction_outside_sandbox/);
  } finally {
    cleanup(s);
  }
});