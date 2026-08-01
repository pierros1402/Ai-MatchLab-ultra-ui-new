import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseArgs,
  runAudit,
} from "./audit-production-identity-retention-decisions.js";

const packageRoot = process.env.AIML_P0C_FINALIZATION_PACKAGE_ROOT;
const proposalRoot = process.env.AIML_P0C_PROPOSAL_ROOT;

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

test("real package audit is source-bound and preserves all inputs", () => {
  assert.ok(packageRoot);
  assert.ok(proposalRoot);

  const targetRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../..",
  );
  const paths = {
    registry: path.join(
      targetRoot,
      "data/identity-decisions/production-global-club-id-registry.v1.json",
    ),
    retention: path.join(
      targetRoot,
      "data/identity-decisions/fixture-retention-decision-ledger.v1.json",
    ),
    sourceLedger: path.join(
      targetRoot,
      "data/identity-decisions/semantic-duplicate-decision-ledger.v1.json",
    ),
    bindingProposal: path.join(
      proposalRoot,
      "P0C_PRODUCTION_GLOBAL_CLUB_ID_PROPOSAL.json",
    ),
    retentionProposal: path.join(
      proposalRoot,
      "P0C_FIXTURE_RETENTION_DECISION_PROPOSAL.json",
    ),
    proposalAudit: process.env.AIML_P0C_PROPOSAL_AUDIT,
    proposalContentManifest:
      process.env.AIML_P0C_PROPOSAL_CONTENT_MANIFEST,
  };

  const before = Object.fromEntries(
    Object.entries(paths).map(([key, filePath]) => [
      key,
      fs.readFileSync(filePath),
    ]),
  );

  const temp = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-final-audit-"),
  );
  const output = path.join(temp, "audit.json");

  const report = runAudit({
    registry: paths.registry,
    retention: paths.retention,
    "source-ledger": paths.sourceLedger,
    "binding-proposal": paths.bindingProposal,
    "retention-proposal": paths.retentionProposal,
    "proposal-audit": paths.proposalAudit,
    "proposal-content-manifest": paths.proposalContentManifest,
    output,
  });

  assert.equal(report.ok, true);
  assert.equal(report.issueCount, 0);
  assert.equal(
    report.status,
    "PASS_FINALIZED_DECISIONS_APPLICATION_FORBIDDEN",
  );
  assert.equal(report.summary.identityBindingsFinalized, 70);
  assert.equal(report.summary.retentionDecisionsFinalized, 53);
  assert.equal(report.summary.sourceFixtureIdsCovered, 106);
  assert.equal(report.summary.productionArtifactsUpdated, 0);
  assert.equal(report.summary.fixtureRowsDeleted, 0);

  for (const [key, filePath] of Object.entries(paths)) {
    assert.deepEqual(fs.readFileSync(filePath), before[key]);
  }

  fs.rmSync(temp, { recursive: true, force: true });
});
