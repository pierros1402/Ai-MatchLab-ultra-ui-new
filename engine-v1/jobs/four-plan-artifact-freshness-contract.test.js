import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const target = path.join(
  here,
  "verify-artifact-freshness-day.js"
);

const source = fs
  .readFileSync(target, "utf8")
  .replace(/\r\n/g, "\n");

function requireToken(token) {
  assert.ok(
    source.includes(token),
    `missing freshness contract token: ${token}`
  );
}

test(
  "freshness requires all four comparison plans",
  () => {
    requireToken('requiredPlans: ["A", "A2", "B", "B2"]');
    requireToken("comparison_missing_required_plans");
    requireToken("report.fourPlanContract.complete === true");
  }
);

test(
  "missing A2/B2 artifacts fail closed",
  () => {
    for (const token of [
      'kind: "plan_a2"',
      'kind: "plan_a2_audit"',
      'kind: "plan_b2"',
      'kind: "plan_b2_audit"',
      "four_plan_artifacts_missing_or_invalid",
      "report.missingRequiredArtifacts.length === 0"
    ]) {
      requireToken(token);
    }
  }
);

test(
  "zero-pick artifacts are validated by existence not count",
  () => {
    assert.equal(
      source.includes("planA2?.picks?.length > 0"),
      false
    );

    assert.equal(
      source.includes("planB2?.picks?.length > 0"),
      false
    );

    assert.equal(
      source.includes("planA2?.count > 0"),
      false
    );

    assert.equal(
      source.includes("planB2?.count > 0"),
      false
    );
  }
);

test(
  "freshness checks A2 and B2 timestamps",
  () => {
    for (const token of [
      'staleReason: "plan_a2_stale_against_canonical"',
      'staleReason: "plan_a2_audit_stale_against_canonical"',
      'staleReason: "plan_b2_stale_against_canonical"',
      'staleReason: "plan_b2_audit_stale_against_canonical"'
    ]) {
      requireToken(token);
    }
  }
);

test(
  "missing required artifacts are not treated as skipped",
  () => {
    const requiredIndex = source.indexOf(
      "const requiredArtifacts = ["
    );

    const missingIndex = source.indexOf(
      "report.missingRequiredArtifacts.push("
    );

    const finalGateIndex = source.indexOf(
      "report.missingRequiredArtifacts.length === 0"
    );

    assert.ok(requiredIndex >= 0);
    assert.ok(missingIndex > requiredIndex);
    assert.ok(finalGateIndex > missingIndex);
  }
);
