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

function requireTokens(source, tokens) {
  for (const token of tokens) {
    assert.ok(
      source.includes(token),
      `missing UI contract token: ${token}`
    );
  }
}

test(
  "value adapter requires A A2 B and B2",
  () => {
    const source = read(
      "assets/js/live/value-adapter.js"
    );

    requireTokens(source, [
      'const requiredPlans = ["A", "A2", "B", "B2"]',
      "requiredPlans.every(",
      "hasAllRequiredPlans"
    ]);

    assert.equal(
      source.includes(
        "data.plans.A && data.plans.B)"
      ),
      false
    );
  }
);

test(
  "value UI comparison gate requires all four plans",
  () => {
    const source = read(
      "assets/js/ui/value-picks.js"
    );

    requireTokens(source, [
      '["A", "A2", "B", "B2"].every(',
      "hasFourPlanComparison",
      "renderPlanComparison(payload)"
    ]);
  }
);

test(
  "system health exposes all unresolved plan types",
  () => {
    const source = read(
      "assets/js/ui/system-health.js"
    );

    requireTokens(source, [
      "plan_a_unresolved_settlement",
      "plan_a2_unresolved_settlement",
      "plan_b_unresolved_settlement",
      "plan_b2_unresolved_settlement"
    ]);
  }
);

test(
  "system health exposes four-plan comparison counts",
  () => {
    const source = read(
      "assets/js/ui/system-health.js"
    );

    requireTokens(source, [
      "const planA = comparison.plans?.A;",
      "const planA2 = comparison.plans?.A2;",
      "const planB = comparison.plans?.B;",
      "const planB2 = comparison.plans?.B2;",
      "Four-plan contract:",
      "four_plan_comparison_incomplete"
    ]);

    assert.equal(
      source.includes("Plan A/B:"),
      false
    );
  }
);

test(
  "four plans continue to use the same card renderer",
  () => {
    const source = read(
      "assets/js/ui/value-picks.js"
    );

    const calls = [
      '"Plan A"',
      '"Plan A2"',
      '"Plan B"',
      '"Plan B2"'
    ];

    for (const title of calls) {
      assert.ok(source.includes(title));
    }

    assert.ok(source.includes("function renderPlanBlock("));
    assert.ok(source.includes('class="value-plan-card"'));
  }
);

test(
  "CSS describes the four-plan comparison contract",
  () => {
    const source = read(
      "assets/css/right-panels.css"
    );

    assert.ok(
      source.includes(
        "VALUE PLAN COMPARISON — PLAN A / A2 / B / B2"
      )
    );

    assert.equal(
      source.includes(
        "VALUE PLAN COMPARISON — PLAN A / PLAN B"
      ),
      false
    );
  }
);
