import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseArgs,
  runResolverFoundationAudit,
} from "./audit-production-identity-resolver-foundation.js";

function env(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  return value;
}

test("CLI parser accepts all explicit read-only inputs", () => {
  const parsed = parseArgs([
    "node",
    "audit.js",
    "--contract",
    "contract.json",
    "--registry",
    "registry.json",
    "--retention",
    "retention.json",
    "--source-ledger",
    "source.json",
    "--classification-audit",
    "classification.json",
    "--phase-contract",
    "phase.json",
    "--output",
    "audit.json",
  ]);
  assert.equal(parsed.contract, "contract.json");
  assert.equal(parsed.output, "audit.json");
});

test("real resolver foundation audit is clean and source-bound", () => {
  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-resolver-audit-"),
  );
  const output = path.join(temp, "audit.json");

  const report = runResolverFoundationAudit({
    contract: env("AIML_P0C_RESOLVER_CONTRACT"),
    registry: env("AIML_P0C_REGISTRY"),
    retention: env("AIML_P0C_RETENTION"),
    "source-ledger": env("AIML_P0C_SOURCE_LEDGER"),
    "classification-audit":
      env("AIML_P0C_CLASSIFICATION_AUDIT"),
    "phase-contract":
      env("AIML_P0C_PHASE_CONTRACT"),
    output,
  });

  assert.equal(report.ok, true);
  assert.equal(
    report.status,
    "PASS_RESOLVER_FOUNDATION_APPLICATION_FORBIDDEN",
  );
  assert.equal(report.issueCount, 0);
  assert.equal(report.summary.identityBindings, 70);
  assert.equal(report.summary.retainedFixtureIds, 53);
  assert.equal(
    report.summary.suppressedFixtureAliases,
    53,
  );
  assert.equal(report.summary.sourceFixtureIds, 106);
  assert.equal(
    report.summary.identityResolutionChecks,
    210,
  );
  assert.equal(
    report.summary.fixtureResolutionChecks,
    106,
  );
  assert.equal(
    report.summary.membershipGuardChecks,
    53,
  );
  assert.equal(
    report.readOnlyEvidence.inputFilesChanged,
    false,
  );
  assert.equal(
    report.authorization.consumerIntegrationAuthorized,
    false,
  );
  assert.equal(
    report.authorization.writePlanGenerated,
    false,
  );
  assert.equal(fs.existsSync(output), true);

  fs.rmSync(temp, { recursive: true, force: true });
});
