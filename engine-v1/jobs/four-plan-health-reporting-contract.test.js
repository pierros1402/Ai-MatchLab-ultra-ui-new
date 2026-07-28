import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function read(relativePath) {
  return fs
    .readFileSync(path.join(root, relativePath), "utf8")
    .replace(/\r\n/g, "\n");
}

function requireToken(source, token) {
  assert.ok(
    source.includes(token),
    `missing health-reporting token: ${token}`
  );
}

test(
  "day report requires A A2 B and B2",
  () => {
    const source = read("engine-v1/jobs/build-day-report.js");

    for (const token of [
      'requiredComparisonPlans = ["A", "A2", "B", "B2"]',
      "planA: planSummary(comparison.plans.A)",
      "planA2: planSummary(comparison.plans.A2)",
      "planB: planSummary(comparison.plans.B)",
      "planB2: planSummary(comparison.plans.B2)",
      '"value_plan_comparison_missing"',
      '"four_plan_comparison_incomplete:"'
    ]) {
      requireToken(source, token);
    }
  }
);

test(
  "day report accepts zero-pick plans as present",
  () => {
    const source = read("engine-v1/jobs/build-day-report.js");

    assert.equal(
      source.includes("comparison.plans.A2.count > 0"),
      false
    );

    assert.equal(
      source.includes("comparison.plans.B2.count > 0"),
      false
    );

    requireToken(
      source,
      'typeof comparison.plans[planKey] === "object"'
    );
  }
);

test(
  "system health alerts fail incomplete comparison",
  () => {
    const source = read(
      "engine-v1/jobs/build-system-health-alerts-day.js"
    );

    for (const token of [
      '"error"',
      '"four_plan_comparison_incomplete"',
      'const requiredPlans = ["A", "A2", "B", "B2"]',
      "planA2:",
      "planB2:"
    ]) {
      requireToken(source, token);
    }
  }
);

test(
  "system health reports unresolved A2 and B2 picks",
  () => {
    const source = read(
      "engine-v1/jobs/build-system-health-alerts-day.js"
    );

    requireToken(source, '"plan_a2_unresolved_settlement"');
    requireToken(source, '"plan_b2_unresolved_settlement"');
  }
);

test(
  "backend exposes four-plan summaries",
  () => {
    const source = read("engine-v1/index.js");

    for (const token of [
      "A2: valueComparison.plans.A2",
      "B2: valueComparison.plans.B2",
      '"four_plan_comparison_incomplete"',
      "missingRequiredArtifacts:",
      "fourPlanContract:"
    ]) {
      requireToken(source, token);
    }
  }
);

test(
  "backend incomplete comparison is an error",
  () => {
    const source = read("engine-v1/index.js");

    const incompleteIndex = source.indexOf(
      '"four_plan_comparison_incomplete"'
    );

    assert.ok(incompleteIndex >= 0);

    const nearby = source.slice(
      Math.max(0, incompleteIndex - 250),
      incompleteIndex + 250
    );

    assert.ok(
      nearby.includes('"error"'),
      "incomplete comparison must create an error issue"
    );
  }
);
