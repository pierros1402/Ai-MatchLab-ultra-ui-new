import test from "node:test";
import assert from "node:assert/strict";

import { collectFoundationIntegrityIssues } from "../jobs/build-system-health-alerts-day.js";
import { systemHealthMissingArtifactSeverity } from "../system-health/runtime-report-policy.js";

test("missing foundation integrity is a System Health error", () => {
  assert.equal(systemHealthMissingArtifactSeverity("foundationIntegrity"), "error");
  const issues = collectFoundationIntegrityIssues(null, "2026-08-09");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "error");
  assert.equal(issues[0].type, "artifact_missing");
});

test("not-ready foundation produces hard System Health errors", () => {
  const issues = collectFoundationIntegrityIssues({
    dayKey: "2026-08-09",
    modelReady: false,
    publicationReady: false,
    blocked: [{ component: "historyIndex", reason: "history_index_foundation_stale" }],
    warnings: []
  }, "2026-08-09");
  assert.ok(issues.some(row => row.type === "foundation_model_not_ready" && row.severity === "error"));
  assert.ok(issues.some(row => row.type === "foundation_publication_not_ready" && row.severity === "error"));
});

test("ready foundation only surfaces informational warnings", () => {
  const issues = collectFoundationIntegrityIssues({
    dayKey: "2026-08-09",
    modelReady: true,
    publicationReady: true,
    blocked: [],
    warnings: [{ reason: "age_expired_results_rows_present", count: 288 }]
  }, "2026-08-09");
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "info");
});
