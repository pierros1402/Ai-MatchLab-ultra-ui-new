import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildP0CP4CompositionTasks,
  loadP0CP4InventoryFile,
  parseP0CP4InventoryJsonl,
  runP0CP4Composition,
} from "./p0c-p4-composition-runner.js";

function inventoryRow(file, rebuildFamily) {
  return {
    file,
    phase: "P4_DERIVED_REBUILD",
    rebuildFamily,
    rebuildRequired: true,
    directFileEditAuthorized: false,
    applicationAuthorized: false,
  };
}

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aiml-p0c-compose-"));
}

test("parses and validates source-bound P4 inventory JSONL", () => {
  const text = [
    JSON.stringify(inventoryRow("data/a.json", "A")),
    JSON.stringify(inventoryRow("data/b.json", "B")),
    "",
  ].join("\n");
  const rows = parseP0CP4InventoryJsonl(text, {
    expectedInventoryCount: 2,
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].file, "data/a.json");
  assert.throws(
    () => parseP0CP4InventoryJsonl(text),
    /inventory_count_mismatch/,
  );
});

test("loads inventory file and enforces its SHA-256", () => {
  const root = tempRoot();
  try {
    const target = path.join(root, "inventory.jsonl");
    fs.writeFileSync(
      target,
      `${JSON.stringify(inventoryRow("data/a.json", "A"))}\n`,
      "utf8",
    );
    const loaded = loadP0CP4InventoryFile({
      inventoryPath: target,
      expectedInventoryCount: 1,
    });
    assert.equal(loaded.rowCount, 1);
    assert.match(loaded.sha256, /^[a-f0-9]{64}$/u);
    assert.throws(
      () => loadP0CP4InventoryFile({
        inventoryPath: target,
        expectedInventoryCount: 1,
        expectedSha256: "0".repeat(64),
      }),
      /inventory_hash_mismatch/,
    );
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("builds one exact task per family and rejects missing runners", () => {
  const rows = [
    inventoryRow("data/a.json", "A"),
    inventoryRow("data/b.json", "B"),
  ];
  const composition = buildP0CP4CompositionTasks({
    inventoryRows: rows,
    expectedInventoryCount: 2,
    familyRunners: {
      A: () => ({ completeFamilyOutput: true, outputs: [] }),
      B: () => ({ completeFamilyOutput: true, outputs: [] }),
    },
  });
  assert.equal(composition.familyCount, 2);
  assert.equal(composition.tasks.length, 2);
  assert.throws(
    () => buildP0CP4CompositionTasks({
      inventoryRows: rows,
      expectedInventoryCount: 2,
      familyRunners: { A: () => [] },
    }),
    /family_runner_missing:B/,
  );
});

test("materializes writes and infers stale inventory deletions", async () => {
  const parent = tempRoot();
  const sandboxRoot = path.join(parent, "sandbox");
  try {
    const result = await runP0CP4Composition({
      sandboxRoot,
      sourceHead: "head-1",
      sourceTree: "tree-1",
      buildTimestamp: "2026-08-03T18:00:00.000Z",
      inventoryRows: [
        inventoryRow("data/keep.json", "FAMILY"),
        inventoryRow("data/stale.json", "FAMILY"),
      ],
      expectedInventoryCount: 2,
      familyRunners: {
        FAMILY: () => ({
          completeFamilyOutput: true,
          outputs: [{
            relativePath: "data/keep.json",
            content: { retained: true },
          }],
        }),
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.sandbox.manifest.outputPathCount, 2);
    assert.equal(result.sandbox.manifest.outputFileCount, 1);
    assert.equal(result.sandbox.manifest.deletePathCount, 1);
    assert.equal(
      fs.existsSync(path.join(sandboxRoot, "data", "keep.json")),
      true,
    );
    assert.equal(
      fs.existsSync(path.join(sandboxRoot, "data", "stale.json")),
      false,
    );
  }
  finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("fails closed for incomplete or unplanned family output", async () => {
  const rows = [inventoryRow("data/a.json", "A")];
  const composition = buildP0CP4CompositionTasks({
    inventoryRows: rows,
    expectedInventoryCount: 1,
    familyRunners: {
      A: () => ({ outputs: [] }),
    },
  });
  await assert.rejects(
    () => composition.tasks[0].run({}),
    /family_output_not_complete:A/,
  );

  const unplanned = buildP0CP4CompositionTasks({
    inventoryRows: rows,
    expectedInventoryCount: 1,
    familyRunners: {
      A: () => ({
        completeFamilyOutput: true,
        outputs: [{
          relativePath: "data/outside.json",
          content: {},
        }],
      }),
    },
  });
  await assert.rejects(
    () => unplanned.tasks[0].run({}),
    /family_output_unplanned:A:data\/outside.json/,
  );
});

test("repository application is always forbidden", async () => {
  await assert.rejects(
    () => runP0CP4Composition({ applicationAuthorized: true }),
    /composition_application_forbidden/,
  );
});
