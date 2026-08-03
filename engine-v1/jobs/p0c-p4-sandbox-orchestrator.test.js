import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  runP0CP4SandboxFoundation,
} from "./p0c-p4-sandbox-orchestrator.js";

function tempTarget(name) {
  const parent = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-sandbox-"),
  );
  return {
    parent,
    target: path.join(parent, name),
  };
}

function baseArgs(target) {
  return {
    sandboxRoot: target,
    sourceHead: "head-1",
    sourceTree: "tree-1",
    buildTimestamp: "2026-08-02T20:00:00.000Z",
  };
}

test("exact inventory outputs are materialized with deterministic manifest", async () => {
  const temp = tempTarget("output");
  try {
    const result = await runP0CP4SandboxFoundation({
      ...baseArgs(temp.target),
      inventoryPaths: ["data/a.json", "data/b.txt"],
      tasks: [{
        id: "one",
        run() {
          return [
            { relativePath: "data/a.json", content: { a: 1 } },
            { relativePath: "data/b.txt", content: "hello\n" },
          ];
        },
      }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.manifest.outputFileCount, 2);
    assert.equal(result.manifest.exactInventorySatisfied, true);
    assert.equal(result.repositoryApplicationAuthorized, false);
    assert.equal(
      fs.existsSync(
        path.join(temp.target, "P0C_P4_SANDBOX_MANIFEST.json"),
      ),
      true,
    );
  }
  finally {
    fs.rmSync(temp.parent, { recursive: true, force: true });
  }
});

test("unplanned output fails and leaves no sandbox", async () => {
  const temp = tempTarget("output");
  try {
    await assert.rejects(
      () => runP0CP4SandboxFoundation({
        ...baseArgs(temp.target),
        inventoryPaths: ["data/a.json"],
        tasks: [{
          id: "bad",
          run: () => [{
            relativePath: "data/unplanned.json",
            content: {},
          }],
        }],
      }),
      /p0c_p4_unplanned_output_path:data\/unplanned.json/,
    );
    assert.equal(fs.existsSync(temp.target), false);
  }
  finally {
    fs.rmSync(temp.parent, { recursive: true, force: true });
  }
});

test("missing exact inventory output fails closed", async () => {
  const temp = tempTarget("output");
  try {
    await assert.rejects(
      () => runP0CP4SandboxFoundation({
        ...baseArgs(temp.target),
        inventoryPaths: ["data/a.json", "data/b.json"],
        tasks: [{
          id: "partial",
          run: () => [{
            relativePath: "data/a.json",
            content: {},
          }],
        }],
      }),
      /p0c_p4_inventory_outputs_missing:data\/b.json/,
    );
  }
  finally {
    fs.rmSync(temp.parent, { recursive: true, force: true });
  }
});

test("path traversal and duplicate output paths are rejected", async () => {
  const traversal = tempTarget("traversal");
  try {
    await assert.rejects(
      () => runP0CP4SandboxFoundation({
        ...baseArgs(traversal.target),
        inventoryPaths: ["../escape.json"],
        tasks: [{ id: "x", run: () => [] }],
      }),
      /p0c_p4_sandbox_output_path_invalid/,
    );
  }
  finally {
    fs.rmSync(traversal.parent, { recursive: true, force: true });
  }

  const duplicate = tempTarget("duplicate");
  try {
    await assert.rejects(
      () => runP0CP4SandboxFoundation({
        ...baseArgs(duplicate.target),
        inventoryPaths: ["data/a.json"],
        tasks: [
          { id: "one", run: () => [{ relativePath: "data/a.json", content: "1" }] },
          { id: "two", run: () => [{ relativePath: "data/a.json", content: "2" }] },
        ],
      }),
      /p0c_p4_duplicate_output_path:data\/a.json/,
    );
  }
  finally {
    fs.rmSync(duplicate.parent, { recursive: true, force: true });
  }
});

test("repository application flag is always rejected", async () => {
  const temp = tempTarget("output");
  try {
    await assert.rejects(
      () => runP0CP4SandboxFoundation({
        ...baseArgs(temp.target),
        applicationAuthorized: true,
        inventoryPaths: ["data/a.json"],
        tasks: [{ id: "one", run: () => [] }],
      }),
      /p0c_p4_repository_application_forbidden/,
    );
  }
  finally {
    fs.rmSync(temp.parent, { recursive: true, force: true });
  }
});
