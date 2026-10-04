import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function currentP0CArtifactPaths() {
  return Object.freeze({
    contract: path.join(
      ROOT,
      "data/identity-decisions/production-identity-resolver-contract.v1.json",
    ),
    registry: path.join(
      ROOT,
      "data/identity-decisions/production-global-club-id-registry.v1.json",
    ),
    retentionLedger: path.join(
      ROOT,
      "data/identity-decisions/fixture-retention-decision-ledger.v1.json",
    ),
    sourceLedger: path.join(
      ROOT,
      "data/identity-decisions/semantic-duplicate-decision-ledger.v1.json",
    ),
  });
}

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/u, ""),
  );
}

export function loadCurrentP0CDecisionArtifacts() {
  const paths = currentP0CArtifactPaths();
  return {
    contract: readJson(paths.contract),
    registry: readJson(paths.registry),
    retentionLedger: readJson(paths.retentionLedger),
    sourceLedger: readJson(paths.sourceLedger),
  };
}

export function makeResolverClassificationAuditFixture() {
  return {
    schema: "ai-matchlab.test-only.resolver-classification-audit.v1",
    status: "PASS_CLASSIFICATION_COMPLETE_NO_WRITE_PLAN",
    ok: true,
    issueCount: 0,
    validation: {
      impactedFilesClassified: 2310,
      unclassifiedFiles: 0,
      directFileEditAuthorizations: 0,
      writePlanRows: 0,
    },
    testOnly: true,
    historicalBytesReconstructed: false,
  };
}

export function makeResolverPhaseContractFixture() {
  return {
    schema: "ai-matchlab.test-only.resolver-phase-contract.v1",
    status: "PASS_CLASSIFICATION_COMPLETE_NO_WRITE_PLAN",
    globalInvariants: {
      directBulkRewriteAuthorized: false,
      writePlanGenerated: false,
      productionDataApplicationAuthorized: false,
      fixtureDeletionAuthorized: false,
      historyRewriteAuthorized: false,
      resolverFoundationRequiredBeforePropagation: true,
    },
    testOnly: true,
    historicalBytesReconstructed: false,
  };
}

export function writeResolverFoundationEvidenceFixtures(directory) {
  fs.mkdirSync(directory, { recursive: true });

  const classificationAudit = path.join(
    directory,
    "classification-audit.test-only.json",
  );
  const phaseContract = path.join(
    directory,
    "phase-contract.test-only.json",
  );

  fs.writeFileSync(
    classificationAudit,
    `${JSON.stringify(makeResolverClassificationAuditFixture(), null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    phaseContract,
    `${JSON.stringify(makeResolverPhaseContractFixture(), null, 2)}\n`,
    "utf8",
  );

  return Object.freeze({
    classificationAudit,
    phaseContract,
  });
}
