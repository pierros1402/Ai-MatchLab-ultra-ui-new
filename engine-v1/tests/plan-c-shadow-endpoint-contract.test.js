import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../index.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("engine exposes the exported Plan C shadow snapshot through a read-only endpoint", () => {
  assert.match(source, /function readDeploySnapshotPlanCShadow\(dayKey\)/);
  assert.match(source, /app\.get\("\/plan-c-shadow"/);
  assert.match(source, /plan_c_shadow_snapshot_not_found/);
  assert.match(source, /planCShadowPredictions: Number\(manifest\?\.counts\?\.planCShadowPredictions/);
  assert.match(source, /planCShadowPicks: Number\(manifest\?\.counts\?\.planCShadowPicks/);
});
