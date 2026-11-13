import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcilePublicSystemHealth
} from "./public-mirror-policy.js";

const dayKey = "2026-11-11";
const schema = "ai-matchlab.system-health-alerts.v1";

function issue(artifact) {
  return {
    severity: "error",
    source: "runtime-artifact",
    type: "artifact_missing",
    details: { artifact }
  };
}

function evaluate(runtimeIssues, alertIssues, invalid = false) {
  return reconcilePublicSystemHealth({
    dayKey,
    manifestGeneratedAt: null,
    dynamicReport: {
      ok: runtimeIssues.length === 0,
      severity: runtimeIssues.length ? "error" : "ok",
      issues: runtimeIssues
    },
    alertArtifact: invalid ? null : {
      schema,
      dayKey,
      generatedAt: "2026-11-11T14:00:00Z",
      activeIssues: alertIssues
    }
  });
}

test("V34 distinct artifact errors remain separate", () => {
  const result = evaluate(
    [issue("coverage-readiness.json")],
    [issue("foundation-integrity.json")]
  );

  assert.equal(result.issueCounts.error, 2);
  assert.equal(result.issues.length, 2);
  assert.equal(result.ok, false);
});

test("V34 identical errors are not double counted", () => {
  const result = evaluate(
    [issue("coverage-readiness.json")],
    [issue("coverage-readiness.json")]
  );

  assert.equal(result.issueCounts.error, 1);
  assert.equal(result.issues.length, 1);
});

test("V34 distinct runtime errors survive", () => {
  const result = evaluate(
    [
      issue("coverage-readiness.json"),
      issue("foundation-integrity.json")
    ],
    []
  );

  assert.equal(result.issueCounts.error, 2);
});

test("V34 invalid alert without timestamp fails closed", () => {
  const result = evaluate([], [], true);

  assert.equal(result.ok, false);
  assert.equal(result.severity, "error");
  assert.equal(
    result.issues.some(
      x => x.type === "system_health_authoritative_alert_untrusted"
    ),
    true
  );
});

test("V34 valid alert remains usable", () => {
  const result = evaluate([], []);

  assert.equal(result.ok, true);
  assert.equal(result.severity, "ok");
});

test("V34 invalid alert retains runtime errors", () => {
  const result = evaluate(
    [issue("coverage-readiness.json")],
    [],
    true
  );

  assert.equal(result.ok, false);
  assert.equal(result.issueCounts.error, 2);
});
