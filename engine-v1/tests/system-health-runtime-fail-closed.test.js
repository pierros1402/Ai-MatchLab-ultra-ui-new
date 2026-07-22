import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  collectRuntimeArtifactIssues,
  classifyRuntimeSystemHealth,
  systemHealthMissingArtifactSeverity
} from "../system-health/runtime-report-policy.js";

function missingRead(path) {
  return {
    exists: false,
    ok: false,
    path,
    data: null,
    error: null
  };
}

const allMissing = {
  manifest: missingRead(
    "data/deploy-snapshots/2099-01-01/manifest.json"
  ),
  invariant: missingRead(
    "data/deploy-snapshots/2099-01-01/invariant-report.json"
  ),
  freshness: missingRead(
    "data/deploy-snapshots/2099-01-01/freshness-report.json"
  ),
  value: missingRead(
    "data/deploy-snapshots/2099-01-01/value.json"
  ),
  valueAudit: missingRead(
    "data/deploy-snapshots/2099-01-01/value-audit.json"
  ),
  buildReport: missingRead(
    "data/build-reports/2099-01-01.json"
  ),
  valueComparison: missingRead(
    "data/value-comparison/2099-01-01.json"
  )
};

test("complete diagnostic absence is an error and value-unsafe", () => {
  const issues = collectRuntimeArtifactIssues(allMissing);

  const state = classifyRuntimeSystemHealth({
    issues,
    invariant: null
  });

  assert.deepEqual(
    Object.fromEntries(
      issues.map(issue => [issue.source, issue.severity])
    ),
    {
      manifest: "error",
      invariant: "error",
      freshness: "warning",
      value: "error",
      valueAudit: "warning",
      buildReport: "warning",
      valueComparison: "info"
    }
  );

  assert.equal(state.ok, false);
  assert.equal(state.severity, "error");
  assert.equal(state.status, "error");
  assert.equal(state.valueSafe, false);
});

test("missing invariant fails value safety when another artifact exists", () => {
  const read = {
    ...allMissing,
    manifest: {
      exists: true,
      ok: true,
      path: "data/deploy-snapshots/2099-01-01/manifest.json",
      data: { ok: true },
      error: null
    }
  };

  const issues = collectRuntimeArtifactIssues(read);

  const state = classifyRuntimeSystemHealth({
    issues,
    invariant: null
  });

  assert.equal(state.ok, false);
  assert.equal(state.severity, "error");
  assert.equal(state.status, "error");
  assert.equal(state.valueSafe, false);
});

test("value safety requires an explicit true invariant value", () => {
  assert.equal(
    classifyRuntimeSystemHealth({
      issues: [],
      invariant: { valueSafe: true }
    }).valueSafe,
    true
  );

  assert.equal(
    classifyRuntimeSystemHealth({
      issues: [],
      invariant: { valueSafe: false }
    }).valueSafe,
    false
  );

  assert.equal(
    classifyRuntimeSystemHealth({
      issues: [],
      invariant: {}
    }).valueSafe,
    false
  );

  assert.equal(
    classifyRuntimeSystemHealth({
      issues: [],
      invariant: null
    }).valueSafe,
    false
  );
});

test("missing-artifact severities match the alert builder policy", () => {
  assert.equal(
    systemHealthMissingArtifactSeverity("manifest"),
    "error"
  );

  assert.equal(
    systemHealthMissingArtifactSeverity("invariant"),
    "error"
  );

  assert.equal(
    systemHealthMissingArtifactSeverity("freshness"),
    "warning"
  );

  assert.equal(
    systemHealthMissingArtifactSeverity("value"),
    "error"
  );

  assert.equal(
    systemHealthMissingArtifactSeverity("valueAudit"),
    "warning"
  );

  assert.equal(
    systemHealthMissingArtifactSeverity("buildReport"),
    "warning"
  );

  assert.equal(
    systemHealthMissingArtifactSeverity("valueComparison"),
    "info"
  );
});

test("runtime endpoint uses the shared fail-closed policy", () => {
  const source = fs.readFileSync(
    new URL("../index.js", import.meta.url),
    "utf8"
  );

  assert.match(
    source,
    /collectRuntimeArtifactIssues\(read/
  );

  assert.match(
    source,
    /classifyRuntimeSystemHealth\(\{[\s\S]*?issues,[\s\S]*?invariant/
  );

  assert.match(
    source,
    /valueSafe:\s*runtimeState\.valueSafe/
  );

  assert.doesNotMatch(
    source,
    /status:\s*"no_report"/
  );

  assert.doesNotMatch(
    source,
    /invariant\?\.valueSafe\s*\?\?\s*true/
  );
});

test("alert builder uses the shared missing-artifact policy", () => {
  const source = fs.readFileSync(
    new URL(
      "../jobs/build-system-health-alerts-day.js",
      import.meta.url
    ),
    "utf8"
  );

  for (const key of [
    "manifest",
    "invariant",
    "freshness",
    "value",
    "valueAudit",
    "buildReport",
    "valueComparison"
  ]) {
    assert.equal(
      source.includes(
        `systemHealthMissingArtifactSeverity("${key}")`
      ),
      true,
      `missing shared severity policy for ${key}`
    );
  }
});