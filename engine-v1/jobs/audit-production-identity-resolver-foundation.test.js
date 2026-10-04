import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  parseArgs,
  runResolverFoundationAudit,
} from "./audit-production-identity-resolver-foundation.js";
import {
  currentP0CArtifactPaths,
  writeResolverFoundationEvidenceFixtures,
} from "../test-support/p0c-hermetic-test-inputs.js";

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

  try {
    const output = path.join(temp, "audit.json");
    const paths = currentP0CArtifactPaths();
    const evidence =
      writeResolverFoundationEvidenceFixtures(temp);

    const report = runResolverFoundationAudit({
      contract: paths.contract,
      registry: paths.registry,
      retention: paths.retentionLedger,
      "source-ledger": paths.sourceLedger,
      "classification-audit":
        evidence.classificationAudit,
      "phase-contract": evidence.phaseContract,
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
  }
  finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});