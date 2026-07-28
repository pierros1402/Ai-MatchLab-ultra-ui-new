import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const refreshFile = path.join(
  here,
  "refresh-value-artifacts-day.js"
);

const builderFile = path.join(
  here,
  "build-value-a2-b2-day.js"
);

function readNormalized(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .replace(/\r\n/g, "\n");
}

function requireToken(source, token, label = token) {
  assert.ok(
    source.includes(token),
    `missing contract token: ${label}`
  );
}

function tokenIndex(source, token, label = token) {
  const index = source.indexOf(token);

  assert.notEqual(
    index,
    -1,
    `missing ordered contract token: ${label}`
  );

  return index;
}

test(
  "daily refresh builds A2/B2 before writing comparison",
  () => {
    const source = readNormalized(refreshFile);

    requireToken(
      source,
      'import { buildValueA2B2Day } from "./build-value-a2-b2-day.js";'
    );

    const buildIndex = tokenIndex(
      source,
      "const adjustedPlans = await buildValueA2B2Day(date);",
      "A2/B2 build"
    );

    const failureGateIndex = tokenIndex(
      source,
      'reason: "adjusted_value_plans_build_failed"',
      "adjusted-plan failure gate"
    );

    const comparisonIndex = tokenIndex(
      source,
      "buildValuePlanComparisonDay(date, { write: true })",
      "written four-plan comparison"
    );

    assert.ok(
      buildIndex < failureGateIndex,
      "A2/B2 build must precede its failure gate"
    );

    assert.ok(
      failureGateIndex < comparisonIndex,
      "A2/B2 failure gate must run before comparison write"
    );
  }
);

test(
  "daily refresh fails closed unless both adjusted plans succeed",
  () => {
    const source = readNormalized(refreshFile);

    for (const token of [
      "adjustedPlans?.ok !== true",
      "planA2?.ok !== true",
      "planB2?.ok !== true",
      'reason: "adjusted_value_plans_build_failed"'
    ]) {
      requireToken(source, token);
    }

    const failureReturnIndex = tokenIndex(
      source,
      'reason: "adjusted_value_plans_build_failed"'
    );

    const freshnessIndex = tokenIndex(
      source,
      "const freshness = verifyArtifactFreshnessDay(date);"
    );

    assert.ok(
      failureReturnIndex < freshnessIndex,
      "adjusted-plan failure must stop before downstream reports"
    );
  }
);

test(
  "daily refresh enforces shared fixture-universe parity",
  () => {
    const source = readNormalized(refreshFile);

    for (const token of [
      "A_B: planB",
      "A_A2: assertValueFixtureUniverseParity(",
      "A_B2: assertValueFixtureUniverseParity(",
      "planA?.fixtureUniverse",
      "planA2?.fixtureUniverse",
      "planB2?.sourceContract?.fixtureUniverse"
    ]) {
      requireToken(source, token);
    }
  }
);

test(
  "daily refresh returns and declares all four plans",
  () => {
    const source = readNormalized(refreshFile);

    for (const token of [
      "planA2: {",
      "planB2: {",
      "planA2: comparison?.plans?.A2?.summary || null",
      "planB2: comparison?.plans?.B2?.summary || null",
      "planA2: `data/value-plans/${date}/plan-a2.json`",
      "planA2Audit: `data/value-plans/${date}/plan-a2-audit.json`",
      "planB2: `data/value-plans/${date}/plan-b2.json`",
      "planB2Audit: `data/value-plans/${date}/plan-b2-audit.json`"
    ]) {
      requireToken(source, token);
    }
  }
);

test(
  "A2/B2 builder always supplies explicit output and audit paths",
  () => {
    const source = readNormalized(builderFile);

    for (const token of [
      'outputPath: resolveDataPath("value-plans", dayKey, "plan-a2.json")',
      'auditPath: resolveDataPath("value-plans", dayKey, "plan-a2-audit.json")',
      'outputMode: "plan-b2-observation"'
    ]) {
      requireToken(source, token);
    }

    assert.equal(
      source.includes("if (picks.length"),
      false,
      "artifact creation must not depend on a non-zero pick count"
    );

    assert.equal(
      source.includes("if (planA2.picks"),
      false,
      "Plan A2 output must also remain explicit on zero-pick days"
    );

    assert.equal(
      source.includes("if (planB2.picks"),
      false,
      "Plan B2 output must also remain explicit on zero-pick days"
    );
  }
);

test(
  "A2/B2 builder success requires both plans",
  () => {
    const source = readNormalized(builderFile);

    requireToken(
      source,
      "ok: planA2?.ok === true && planB2?.ok === true"
    );

    requireToken(
      source,
      "plans: { A2: planA2, B2: planB2 }"
    );
  }
);
