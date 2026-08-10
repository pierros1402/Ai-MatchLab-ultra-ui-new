import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { pruneCanonicalFixtureStore } from "./prune-canonical-fixture-store.js";

function writeJson(file, value = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("rolling prune never deletes canonical fixture truth", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-canonical-retention-"));
  const canonicalRoot = path.join(root, "canonical-fixtures");
  const coverageRoot = path.join(root, "coverage-reports");

  const oldCanonical = path.join(canonicalRoot, "2026-08-01", "arg.1.json");
  const currentCanonical = path.join(canonicalRoot, "2026-08-10", "arg.1.json");
  const oldCoverage = path.join(coverageRoot, "2026-08-01.json");
  const currentCoverage = path.join(coverageRoot, "2026-08-10.json");

  writeJson(oldCanonical, { dayKey: "2026-08-01", fixtures: [] });
  writeJson(currentCanonical, { dayKey: "2026-08-10", fixtures: [] });
  writeJson(oldCoverage, { dayKey: "2026-08-01" });
  writeJson(currentCoverage, { dayKey: "2026-08-10" });

  const result = pruneCanonicalFixtureStore({
    baseDay: "2026-08-10",
    daysBack: 3,
    daysForward: 30,
    dryRun: false,
    canonicalRoot,
    coverageReportsRoot: coverageRoot
  });

  assert.equal(result.ok, true);
  assert.equal(result.canonicalRetention.policy, "append_update_only_no_prune");
  assert.equal(result.canonicalRetention.deletionsAllowed, false);
  assert.deepEqual(
    result.canonicalRetention.protectedDays,
    ["2026-08-01", "2026-08-10"]
  );

  assert.equal(fs.existsSync(oldCanonical), true);
  assert.equal(fs.existsSync(currentCanonical), true);
  assert.equal(fs.existsSync(oldCoverage), false);
  assert.equal(fs.existsSync(currentCoverage), true);
  assert.equal(result.removed.some(row => row.root === "canonical-fixtures"), false);

  fs.rmSync(root, { recursive: true, force: true });
});

test("dry-run reports canonical truth as protected", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-canonical-retention-dry-"));
  const canonicalRoot = path.join(root, "canonical-fixtures");
  const coverageRoot = path.join(root, "coverage-reports");

  writeJson(path.join(canonicalRoot, "2026-07-01", "x.1.json"), { fixtures: [] });
  writeJson(path.join(coverageRoot, "2026-07-01.json"), {});

  const result = pruneCanonicalFixtureStore({
    baseDay: "2026-08-10",
    daysBack: 3,
    daysForward: 30,
    dryRun: true,
    canonicalRoot,
    coverageReportsRoot: coverageRoot
  });

  assert.equal(result.canonicalRetention.protectedDayCount, 1);
  assert.equal(fs.existsSync(path.join(canonicalRoot, "2026-07-01", "x.1.json")), true);
  assert.equal(fs.existsSync(path.join(coverageRoot, "2026-07-01.json")), true);

  fs.rmSync(root, { recursive: true, force: true });
});
