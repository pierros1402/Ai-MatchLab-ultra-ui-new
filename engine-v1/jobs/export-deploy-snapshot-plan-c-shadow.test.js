import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./export-deploy-snapshot-day.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");

test("deploy exporter emits shadow payload and audit without replacing official Value", () => {
  assert.match(source, /readPlanCShadowDay\(dayKey\)/);
  assert.match(source, /"plan-c-shadow\.json"/);
  assert.match(source, /"plan-c-shadow-audit\.json"/);
  assert.match(source, /planCShadowPredictions: planCShadowOut\.count/);
  assert.match(source, /planCShadowPicks: planCShadowOut\.pickCount/);
  assert.match(source, /planCShadow: `data\/deploy-snapshots\/\$\{dayKey\}\/plan-c-shadow\.json`/);
  assert.match(source, /planCShadowAudit: `data\/deploy-snapshots\/\$\{dayKey\}\/plan-c-shadow-audit\.json`/);
  assert.match(source, /valuePicks: persistedValueOut\.count/);
});

test("deploy manifest cryptographically binds both Plan C shadow files", () => {
  assert.match(source, /"plan-c-shadow\.json": canonicalFileSha256\(snapshotPlanCShadowFile\)/);
  assert.match(source, /"plan-c-shadow-audit\.json": canonicalFileSha256\(snapshotPlanCShadowAuditFile\)/);
});
