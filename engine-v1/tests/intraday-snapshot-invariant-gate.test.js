import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  evaluateInvariantGate
} from "../jobs/run-snapshot-invariant-check.js";

const dayKey = "2026-07-22";
const manifest = {
  generatedAt: "2026-07-22T07:00:00.000Z"
};

const cleanReport = {
  ok: true,
  valueSafe: true,
  blocked: [],
  warnings: [],
  checkedAt: "2026-07-22T07:00:01.000Z"
};

test("invariant gate accepts a fresh clean and value-safe report", () => {
  const result = evaluateInvariantGate({
    dayKey,
    report: cleanReport,
    manifest
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
  assert.equal(result.valueSafe, true);
});

test("invariant gate rejects a false report even without blocked rows", () => {
  const result = evaluateInvariantGate({
    dayKey,
    manifest,
    report: {
      ...cleanReport,
      ok: false
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 5);
  assert.equal(result.reason, "invariant_report_not_ok");
});

test("invariant gate rejects valueSafe false even when report ok is true", () => {
  const result = evaluateInvariantGate({
    dayKey,
    manifest,
    report: {
      ...cleanReport,
      valueSafe: false
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 6);
  assert.equal(result.reason, "value_unsafe");
});

test("intraday workflow hard-fails before staging on invariant or value failure", () => {
  const workflow = fs.readFileSync(
    new URL(
      "../../.github/workflows/intraday-deploy-snapshot-refresh.yml",
      import.meta.url
    ),
    "utf8"
  );

  const enforcementStep = workflow.match(
    /- name: Refresh and enforce snapshot invariant report[\s\S]*?(?=\n      - name: Snapshot verification)/
  )?.[0];

  assert.ok(
    enforcementStep,
    "intraday invariant enforcement step is missing"
  );

  assert.doesNotMatch(
    enforcementStep,
    /continue-on-error:\s*true/
  );

  assert.match(
    enforcementStep,
    /run-snapshot-invariant-check\.js "\$DAY_KEY"\s*$/m
  );

  assert.match(
    enforcementStep,
    /run-snapshot-invariant-check\.js "\$DAY_KEY" --gate/
  );

  assert.match(
    enforcementStep,
    /check-value-artifact-gate\.js --date="\$DAY_KEY"/
  );

  const verificationStep = workflow.match(
    /- name: Snapshot verification[\s\S]*?(?=\n      - name: Refresh value plan comparison settlement)/
  )?.[0];

  assert.ok(
    verificationStep,
    "snapshot verification step is missing"
  );

  assert.match(
    verificationStep,
    /invariant-report\.json/
  );

  assert.match(
    verificationStep,
    /invariant\.ok !== true/
  );

  assert.match(
    verificationStep,
    /invariant\.valueSafe === false/
  );

  assert.match(
    verificationStep,
    /invariant\.blocked\.length > 0/
  );
});