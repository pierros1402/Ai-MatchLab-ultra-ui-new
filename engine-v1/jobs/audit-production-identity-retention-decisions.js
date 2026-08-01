#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadJson,
  sha256File,
  validateFinalizedIdentityRetention,
} from "../core/production-identity-retention-decisions.js";

function fail(message) {
  throw new Error(message);
}

export function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) fail(`unexpected_argument:${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) fail(`missing_value:${key}`);
    args[key] = value;
    index += 1;
  }

  for (const key of [
    "registry",
    "retention",
    "source-ledger",
    "binding-proposal",
    "retention-proposal",
    "proposal-audit",
    "proposal-content-manifest",
    "output",
  ]) {
    if (!args[key]) fail(`missing_argument:${key}`);
  }

  return args;
}

function cloneHashes(paths) {
  return Object.fromEntries(
    Object.entries(paths).map(([key, filePath]) => [
      key,
      sha256File(filePath),
    ]),
  );
}

function exactSet(values) {
  return new Set(values.map(value => String(value ?? "").trim()));
}

function compareProposalBindings(registry, proposal) {
  const issues = [];
  const registryByTeam = new Map(
    registry.bindings.map(item => [item.ledgerTeamIdentityKey, item]),
  );
  const proposalByTeam = new Map(
    proposal.bindings.map(item => [item.ledgerTeamIdentityKey, item]),
  );

  if (registryByTeam.size !== 70 || proposalByTeam.size !== 70) {
    issues.push({
      code: "PROPOSAL_BINDING_COVERAGE_INVALID",
      severity: "error",
    });
    return issues;
  }

  for (const [teamKey, source] of proposalByTeam) {
    const target = registryByTeam.get(teamKey);
    if (
      !target ||
      target.globalClubId !== source.globalClubId ||
      target.sourceIdentityHash !== source.sourceIdentityHash
    ) {
      issues.push({
        code: "PROPOSAL_BINDING_MISMATCH",
        severity: "error",
        teamKey,
      });
    }
  }
  return issues;
}

function compareProposalRetention(retentionLedger, proposal) {
  const issues = [];
  const finalBySource = new Map(
    retentionLedger.decisions.map(item => [
      item.sourceSemanticDuplicateDecisionId,
      item,
    ]),
  );
  const proposalBySource = new Map(
    proposal.decisions.map(item => [item.decisionId, item]),
  );

  if (finalBySource.size !== 53 || proposalBySource.size !== 53) {
    issues.push({
      code: "PROPOSAL_RETENTION_COVERAGE_INVALID",
      severity: "error",
    });
    return issues;
  }

  for (const [sourceId, source] of proposalBySource) {
    const target = finalBySource.get(sourceId);
    if (
      !target ||
      target.retainedRepositoryFixtureId !==
        source.retainedRepositoryFixtureId ||
      target.selectionPolicy !== source.selectionPolicy ||
      [...exactSet(target.suppressedRepositoryFixtureIds)].sort().join("|") !==
        [...exactSet(source.suppressedRepositoryFixtureIds)].sort().join("|")
    ) {
      issues.push({
        code: "PROPOSAL_RETENTION_MISMATCH",
        severity: "error",
        sourceId,
      });
    }
  }

  return issues;
}

export function runAudit(args) {
  const inputs = {
    registry: path.resolve(args.registry),
    retention: path.resolve(args.retention),
    sourceLedger: path.resolve(args["source-ledger"]),
    bindingProposal: path.resolve(args["binding-proposal"]),
    retentionProposal: path.resolve(args["retention-proposal"]),
    proposalAudit: path.resolve(args["proposal-audit"]),
    proposalContentManifest: path.resolve(
      args["proposal-content-manifest"],
    ),
  };
  const output = path.resolve(args.output);

  const before = cloneHashes(inputs);

  const registry = loadJson(inputs.registry);
  const retentionLedger = loadJson(inputs.retention);
  const sourceLedger = loadJson(inputs.sourceLedger);
  const bindingProposal = loadJson(inputs.bindingProposal);
  const retentionProposal = loadJson(inputs.retentionProposal);
  const proposalAudit = loadJson(inputs.proposalAudit);
  const proposalContentManifest = loadJson(inputs.proposalContentManifest);

  const validation = validateFinalizedIdentityRetention({
    registry,
    retentionLedger,
    sourceLedger,
  });

  const issues = [
    ...validation.issues,
    ...compareProposalBindings(registry, bindingProposal),
    ...compareProposalRetention(retentionLedger, retentionProposal),
  ];

  if (
    proposalAudit.status !==
      "PASS_PROPOSAL_SOURCE_BOUND_APPLICATION_FORBIDDEN" ||
    proposalAudit.issueCount !== 0
  ) {
    issues.push({
      code: "PROPOSAL_AUDIT_NOT_CLEAN",
      severity: "error",
    });
  }

  const expectedHashes = registry.source;
  const actualHashes = {
    sourceSemanticDuplicateLedgerSha256: before.sourceLedger,
    bindingProposalSha256: before.bindingProposal,
    retentionProposalSha256: before.retentionProposal,
    proposalAuditSha256: before.proposalAudit,
    proposalContentManifestSha256: before.proposalContentManifest,
  };

  for (const [field, actual] of Object.entries(actualHashes)) {
    if (
      expectedHashes[field] !== actual ||
      retentionLedger.source[field] !== actual
    ) {
      issues.push({
        code: "AUDIT_SOURCE_HASH_MISMATCH",
        severity: "error",
        field,
        expected: expectedHashes[field],
        actual,
      });
    }
  }

  if (
    proposalContentManifest.source?.commit !==
      registry.source.sourceCommit ||
    proposalContentManifest.authorization
      ?.repositoryApplicationAuthorized !== false ||
    proposalContentManifest.authorization?.mutationAllowed !== false ||
    proposalContentManifest.authorization?.writePlanGenerated !== false
  ) {
    issues.push({
      code: "PROPOSAL_CONTENT_MANIFEST_INVALID",
      severity: "error",
    });
  }

  const after = cloneHashes(inputs);
  const changedInputs = Object.keys(before).filter(
    key => before[key] !== after[key],
  );

  if (changedInputs.length > 0) {
    issues.push({
      code: "AUDIT_INPUT_MUTATION_DETECTED",
      severity: "error",
      changedInputs,
    });
  }

  const report = {
    schema:
      "ai-matchlab.production-identity-retention-finalization-audit.v1",
    generatedAt: new Date().toISOString(),
    status:
      issues.length === 0
        ? "PASS_FINALIZED_DECISIONS_APPLICATION_FORBIDDEN"
        : "FAIL_FINALIZED_DECISIONS_INVALID",
    ok: issues.length === 0,
    publicationDecision: "DECISIONS_FINALIZED_PRODUCTION_APPLICATION_FORBIDDEN",
    inputs: Object.fromEntries(
      Object.entries(inputs).map(([key, filePath]) => [
        key,
        { path: filePath, sha256: before[key] },
      ]),
    ),
    validation,
    summary: {
      identityBindingsFinalized:
        validation.summary.identityBindingsFinalized,
      uniqueGlobalClubIds:
        validation.summary.uniqueGlobalClubIds,
      retentionDecisionsFinalized:
        validation.summary.retentionDecisionsFinalized,
      sourceFixtureIdsCovered:
        validation.summary.sourceFixtureIdsCovered,
      truthDominantDecisions:
        validation.summary.truthDominantDecisions,
      lineageDominantDecisions:
        validation.summary.lineageDominantDecisions,
      retainedClaimA: validation.summary.retainedClaimA,
      retainedClaimB: validation.summary.retainedClaimB,
      productionArtifactsUpdated: 0,
      fixtureRowsDeleted: 0,
    },
    authorization: {
      identityBindingDecisionsFinalized: true,
      fixtureRetentionDecisionsFinalized: true,
      productionDataApplicationAuthorized: false,
      repositoryRepairAuthorized: false,
      fixtureDeletionAuthorized: false,
      historyRewriteAuthorized: false,
      writePlanGenerated: false,
    },
    readOnlyEvidence: {
      sourceFilesChanged: changedInputs.length > 0,
      changedInputs,
    },
    issueCount: issues.length,
    issues,
  };

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsCli) {
  try {
    const report = runAudit(parseArgs(process.argv));
    console.log(JSON.stringify(report));
    if (!report.ok) process.exitCode = 2;
  } catch (error) {
    console.error(
      JSON.stringify({
        ok: false,
        error: error.message,
        stack: error.stack,
      }),
    );
    process.exitCode = 1;
  }
}
