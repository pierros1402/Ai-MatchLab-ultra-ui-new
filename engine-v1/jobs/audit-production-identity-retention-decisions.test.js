import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  parseArgs,
  runAudit,
} from "./audit-production-identity-retention-decisions.js";
import {
  loadJson,
  validateFinalizedIdentityRetention,
} from "../core/production-identity-retention-decisions.js";
import {
  currentP0CArtifactPaths,
} from "../test-support/p0c-hermetic-test-inputs.js";

test("CLI parser accepts all explicit read-only inputs", () => {
  const args = parseArgs([
    "node",
    "audit.js",
    "--registry",
    "registry.json",
    "--retention",
    "retention.json",
    "--source-ledger",
    "source.json",
    "--binding-proposal",
    "binding.json",
    "--retention-proposal",
    "proposal.json",
    "--proposal-audit",
    "audit.json",
    "--proposal-content-manifest",
    "manifest.json",
    "--output",
    "output.json",
  ]);
  assert.equal(args.registry, "registry.json");
  assert.equal(args.output, "output.json");
});

test("current finalized decisions validate and archival audit fails closed without historical inputs", () => {
  const paths = currentP0CArtifactPaths();
  const registry = loadJson(paths.registry);
  const retentionLedger = loadJson(paths.retentionLedger);
  const sourceLedger = loadJson(paths.sourceLedger);

  const validation = validateFinalizedIdentityRetention({
    registry,
    retentionLedger,
    sourceLedger,
  });

  assert.equal(validation.ok, true);
  assert.equal(validation.issueCount, 0);
  assert.equal(
    validation.status,
    "PASS_FINALIZED_DECISIONS_APPLICATION_FORBIDDEN",
  );
  assert.equal(
    validation.summary.identityBindingsFinalized,
    70,
  );
  assert.equal(
    validation.summary.retentionDecisionsFinalized,
    53,
  );
  assert.equal(
    validation.summary.sourceFixtureIdsCovered,
    106,
  );

  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-final-audit-"),
  );

  try {
    const unavailable =
      path.join(temp, "historical-input-unavailable.json");

    assert.throws(
      () =>
        runAudit({
          registry: paths.registry,
          retention: paths.retentionLedger,
          "source-ledger": paths.sourceLedger,
          "binding-proposal": unavailable,
          "retention-proposal": unavailable,
          "proposal-audit": unavailable,
          "proposal-content-manifest": unavailable,
          output: path.join(temp, "audit.json"),
        }),
      /ENOENT|no such file or directory/iu,
    );
  }
  finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});