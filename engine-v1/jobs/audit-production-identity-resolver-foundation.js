#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildProductionIdentityResolver,
  loadJsonBomSafe,
  sha256File,
  validateResolverFoundation,
} from "../core/production-identity-resolver.js";

export function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`unexpected_argument:${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing_value:${key}`);
    }
    args[key] = value;
    index += 1;
  }

  for (const key of [
    "contract",
    "registry",
    "retention",
    "source-ledger",
    "classification-audit",
    "phase-contract",
    "output",
  ]) {
    if (!args[key]) {
      throw new Error(`missing_argument:${key}`);
    }
  }

  return args;
}

export function runResolverFoundationAudit(args) {
  const inputPaths = {
    contract: path.resolve(args.contract),
    registry: path.resolve(args.registry),
    retention: path.resolve(args.retention),
    sourceLedger: path.resolve(args["source-ledger"]),
    classificationAudit: path.resolve(
      args["classification-audit"],
    ),
    phaseContract: path.resolve(args["phase-contract"]),
  };

  const beforeHashes = Object.fromEntries(
    Object.entries(inputPaths).map(([key, filePath]) => [
      key,
      sha256File(filePath),
    ]),
  );

  const contract = loadJsonBomSafe(inputPaths.contract);
  const registry = loadJsonBomSafe(inputPaths.registry);
  const retentionLedger = loadJsonBomSafe(
    inputPaths.retention,
  );
  const sourceLedger = loadJsonBomSafe(
    inputPaths.sourceLedger,
  );
  const classificationAudit = loadJsonBomSafe(
    inputPaths.classificationAudit,
  );
  const phaseContract = loadJsonBomSafe(
    inputPaths.phaseContract,
  );

  const validation = validateResolverFoundation({
    contract,
    registry,
    retentionLedger,
    sourceLedger,
    classificationAudit,
    phaseContract,
  });

  const resolver = validation.ok
    ? buildProductionIdentityResolver({
        contract,
        registry,
        retentionLedger,
        sourceLedger,
        classificationAudit,
        phaseContract,
      })
    : null;

  let identityResolutionChecks = 0;
  let fixtureResolutionChecks = 0;
  let membershipGuardChecks = 0;
  const runtimeIssues = [];

  if (resolver) {
    for (const binding of registry.bindings) {
      const byGlobal = resolver.resolveTeamReference({
        globalClubId: binding.globalClubId,
      });
      const byLedger = resolver.resolveTeamReference({
        ledgerTeamIdentityKey:
          binding.ledgerTeamIdentityKey,
      });
      const byAlias = resolver.resolveTeamReference({
        alias: binding.preferredDisplayName,
      });

      if (
        !byGlobal.ok ||
        !byLedger.ok ||
        !byAlias.ok ||
        new Set([
          byGlobal.globalClubId,
          byLedger.globalClubId,
          byAlias.globalClubId,
        ]).size !== 1
      ) {
        runtimeIssues.push({
          code: "IDENTITY_RESOLUTION_CHECK_FAILED",
          bindingDecisionId:
            binding.bindingDecisionId,
        });
      }
      identityResolutionChecks += 3;
    }

    const canonicalTargets = new Set(
      retentionLedger.decisions.map(
        decision =>
          decision.retainedRepositoryFixtureId,
      ),
    );

    for (const decision of retentionLedger.decisions) {
      const retained = resolver.resolveFixtureId(
        decision.retainedRepositoryFixtureId,
      );
      if (
        !retained.ok ||
        retained.resolvedFixtureId !==
          decision.retainedRepositoryFixtureId ||
        retained.status !==
          "RETAINED_FIXTURE_IDEMPOTENT"
      ) {
        runtimeIssues.push({
          code: "RETAINED_FIXTURE_CHECK_FAILED",
          fixtureRetentionDecisionId:
            decision.fixtureRetentionDecisionId,
        });
      }
      fixtureResolutionChecks += 1;

      for (const suppressed of
        decision.suppressedRepositoryFixtureIds) {
        const alias =
          resolver.resolveFixtureId(suppressed);
        const membership =
          resolver.resolveFixtureMembership({
            repositoryFixtureId: suppressed,
            canonicalFixtureIds: canonicalTargets,
          });

        if (
          !alias.ok ||
          alias.resolvedFixtureId !==
            decision.retainedRepositoryFixtureId ||
          alias.deletionAuthorized !== false
        ) {
          runtimeIssues.push({
            code: "SUPPRESSED_ALIAS_CHECK_FAILED",
            fixtureRetentionDecisionId:
              decision.fixtureRetentionDecisionId,
            suppressed,
          });
        }

        if (
          !membership.ok ||
          membership.fixtureMembershipCreated !==
            false
        ) {
          runtimeIssues.push({
            code: "MEMBERSHIP_GUARD_CHECK_FAILED",
            fixtureRetentionDecisionId:
              decision.fixtureRetentionDecisionId,
            suppressed,
          });
        }

        fixtureResolutionChecks += 1;
        membershipGuardChecks += 1;
      }
    }
  }

  const afterHashes = Object.fromEntries(
    Object.entries(inputPaths).map(([key, filePath]) => [
      key,
      sha256File(filePath),
    ]),
  );

  const changedInputs = Object.keys(beforeHashes).filter(
    key => beforeHashes[key] !== afterHashes[key],
  );

  const issues = [
    ...validation.issues,
    ...runtimeIssues.map(item => ({
      ...item,
      severity: "error",
    })),
    ...(changedInputs.length > 0
      ? [{
          code: "AUDIT_INPUT_CHANGED",
          severity: "error",
          changedInputs,
        }]
      : []),
  ];

  const report = {
    schema:
      "ai-matchlab.production-identity-resolver-foundation-audit.v1",
    generatedAt: new Date().toISOString(),
    ok: issues.length === 0,
    status:
      issues.length === 0
        ? "PASS_RESOLVER_FOUNDATION_APPLICATION_FORBIDDEN"
        : "FAIL_RESOLVER_FOUNDATION",
    sourceBinding: {
      branch: contract?.source?.branch,
      commit: contract?.source?.commit,
      tree: contract?.source?.tree,
      classificationZipSha256:
        contract?.source?.classificationZipSha256,
      classificationAuditSha256:
        contract?.source?.classificationAuditSha256,
      phaseContractSha256:
        contract?.source?.phaseContractSha256,
    },
    inputs: Object.fromEntries(
      Object.entries(inputPaths).map(([key, filePath]) => [
        key,
        {
          path: filePath,
          sha256: beforeHashes[key],
        },
      ]),
    ),
    validation,
    summary: {
      identityBindings: resolver?.counts.identityBindings || 0,
      retainedFixtureIds:
        resolver?.counts.retainedFixtureIds || 0,
      suppressedFixtureAliases:
        resolver?.counts.suppressedFixtureAliases || 0,
      sourceFixtureIds:
        resolver?.counts.sourceFixtureIds || 0,
      identityResolutionChecks,
      fixtureResolutionChecks,
      membershipGuardChecks,
      runtimeConsumerIntegrations: 0,
      productionArtifactsUpdated: 0,
      fixtureRowsDeleted: 0,
      writePlanRows: 0,
    },
    readOnlyEvidence: {
      inputFilesChanged: changedInputs.length > 0,
      changedInputs,
    },
    authorization: {
      productionDataApplicationAuthorized: false,
      repositoryRepairAuthorized: false,
      fixtureRetentionApplicationAuthorized: false,
      fixtureDeletionAuthorized: false,
      historyRewriteAuthorized: false,
      consumerIntegrationAuthorized: false,
      writePlanGenerated: false,
      commitAuthorized: false,
      pushAuthorized: false,
      workflowAuthorized: false,
      deployAuthorized: false,
    },
    issueCount: issues.length,
    issues,
  };

  fs.writeFileSync(
    path.resolve(args.output),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log(JSON.stringify(report));
  return report;
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  import.meta.url ===
    pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsCli) {
  try {
    runResolverFoundationAudit(parseArgs(process.argv));
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      error: error.message,
      stack: error.stack,
    }));
    process.exitCode = 1;
  }
}
