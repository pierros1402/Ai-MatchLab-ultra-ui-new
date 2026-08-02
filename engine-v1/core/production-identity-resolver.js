import fs from "node:fs";
import crypto from "node:crypto";
import {
  canonicalJson,
  normalizeGenesisAlias,
  sha256Canonical,
  validateFinalizedIdentityRetention,
} from "./production-identity-retention-decisions.js";

export const PRODUCTION_IDENTITY_RESOLVER_CONTRACT_SCHEMA =
  "ai-matchlab.production-identity-resolver-contract.v1";

export const EXPECTED_RESOLVER_SOURCE = Object.freeze({
  branch: "work/p0c-identity-duplicate-ledger-20260801",
  commit: "d222ac46e220ba7bde9f840860bd248541d2287b",
  parent: "003f8d6be532f29ced9faf43daee90fd74014ee9",
  tree: "73e98a98538d51128677a16e8acc74dda5b2bc71",
  localCommitEvidenceSha256:
    "e721e44b547add8c75e7fa86066978f0630d204965ece2dbe63b4f1d65098459",
  globalClubIdRegistrySha256:
    "2e10c9eb3c3e0c5f606777711a148c5eb73fc5203449e3a9e3439982a9bc9387",
  fixtureRetentionLedgerSha256:
    "ad5b28d1e15d989b069035d9092cb31e6620b609d5dbd1ed1d1df3783ac1330b",
  semanticDuplicateLedgerSha256:
    "a0bc336e1df2f1913fed90cd6574aee94ba8d7e502addc8c0d1626e966347574",
  classificationZipSha256:
    "dd39db6c04f5edfa1819593d0931ced19d4890ddc3239d3a242a12215b376cd1",
  classificationManifestSha256:
    "4d0b001a1c8f4c71edbde5b256b9a5ebcc9bb8952e794136247f3820de0e8530",
  classificationAuditSha256:
    "8ac495b3acdb1337edd8061535d373aa7a347d015cbf49754e6f59c809339da2",
  phaseContractSha256:
    "15e5356525179aa7aed5bba2780fd1c2fca772c5a2b7cebddb071b8cfedd4bda",
  impactZipSha256:
    "0cd72875fc92c024b5635db27286605a0110f9e642ce02949c419888b21f46a8",
});

export const EXPECTED_RESOLVER_COUNTS = Object.freeze({
  identityBindings: 70,
  uniqueGlobalClubIds: 70,
  fixtureRetentionDecisions: 53,
  sourceFixtureIds: 106,
  suppressedFixtureAliases: 53,
  classifiedImpactFiles: 2310,
  unclassifiedImpactFiles: 0,
});

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function withoutField(value, field) {
  const copy = clone(value);
  delete copy[field];
  return copy;
}

function issue(code, message, details = {}) {
  return { code, severity: "error", message, details };
}

export function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

export function loadJsonBomSafe(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""),
  );
}

export function validateResolverFoundation({
  contract,
  registry,
  retentionLedger,
  sourceLedger,
  classificationAudit,
  phaseContract,
}) {
  const issues = [];

  if (
    contract?.schema !==
    PRODUCTION_IDENTITY_RESOLVER_CONTRACT_SCHEMA
  ) {
    issues.push(issue(
      "RESOLVER_CONTRACT_SCHEMA_INVALID",
      "Unexpected resolver contract schema.",
    ));
  }

  if (
    sha256Canonical(
      withoutField(contract, "immutableContractHash"),
    ) !== contract?.immutableContractHash
  ) {
    issues.push(issue(
      "RESOLVER_CONTRACT_HASH_INVALID",
      "Resolver contract immutable hash is invalid.",
    ));
  }

  for (const [field, expected] of Object.entries(
    EXPECTED_RESOLVER_SOURCE,
  )) {
    if (contract?.source?.[field] !== expected) {
      issues.push(issue(
        "RESOLVER_SOURCE_BINDING_INVALID",
        `Resolver source binding mismatch: ${field}.`,
        { field, expected, actual: contract?.source?.[field] },
      ));
    }
  }

  for (const [field, expected] of Object.entries(
    EXPECTED_RESOLVER_COUNTS,
  )) {
    if (Number(contract?.requiredCoverage?.[field]) !== expected) {
      issues.push(issue(
        "RESOLVER_COVERAGE_CONTRACT_INVALID",
        `Resolver coverage mismatch: ${field}.`,
        { field, expected, actual: contract?.requiredCoverage?.[field] },
      ));
    }
  }

  const requiredTruePolicy = [
    "conflictingIdentitySignalsFailClosed",
    "unknownIdentitySignalsFailClosed",
    "retainedFixtureIdResolutionIsIdempotent",
    "canonicalUniverseRequiredForMembershipResolution",
    "identityOverlayIsAdditiveOnly",
  ];

  const requiredFalsePolicy = [
    "fuzzyTeamIdentityMatchingAllowed",
    "fixtureAliasChainsAllowed",
    "fixtureAliasCyclesAllowed",
    "resolverMayCreateFixtureMembership",
    "resolverMayChangeScoreOrStatusTruth",
    "resolverMayDeleteFixture",
  ];

  for (const field of requiredTruePolicy) {
    if (contract?.resolutionPolicy?.[field] !== true) {
      issues.push(issue(
        "RESOLVER_REQUIRED_TRUE_POLICY_INVALID",
        `Resolver policy must be true: ${field}.`,
        { field },
      ));
    }
  }

  for (const field of requiredFalsePolicy) {
    if (contract?.resolutionPolicy?.[field] !== false) {
      issues.push(issue(
        "RESOLVER_REQUIRED_FALSE_POLICY_INVALID",
        `Resolver policy must be false: ${field}.`,
        { field },
      ));
    }
  }

  if (
    contract?.resolutionPolicy?.fixtureAliasDirection !==
    "SUPPRESSED_TO_RETAINED_ONLY"
  ) {
    issues.push(issue(
      "FIXTURE_ALIAS_DIRECTION_INVALID",
      "Fixture alias direction must be suppressed-to-retained only.",
    ));
  }

  for (const [field, value] of Object.entries(
    contract?.integrationState || {},
  )) {
    if (value !== false) {
      issues.push(issue(
        "RESOLVER_INTEGRATION_STATE_INVALID",
        `Integration state must remain false: ${field}.`,
        { field },
      ));
    }
  }

  for (const [field, value] of Object.entries(
    contract?.authorization || {},
  )) {
    if (value !== false) {
      issues.push(issue(
        "RESOLVER_AUTHORIZATION_INVALID",
        `Authorization must remain false: ${field}.`,
        { field },
      ));
    }
  }

  const finalizedValidation =
    validateFinalizedIdentityRetention({
      registry,
      retentionLedger,
      sourceLedger,
    });

  if (!finalizedValidation.ok) {
    issues.push(issue(
      "FINALIZED_DECISION_INPUT_INVALID",
      "Finalized identity/retention inputs are not valid.",
      { issues: finalizedValidation.issues },
    ));
  }

  if (
    classificationAudit?.status !==
      "PASS_CLASSIFICATION_COMPLETE_NO_WRITE_PLAN" ||
    classificationAudit?.ok !== true ||
    Number(classificationAudit?.issueCount) !== 0 ||
    Number(
      classificationAudit?.validation?.impactedFilesClassified,
    ) !== EXPECTED_RESOLVER_COUNTS.classifiedImpactFiles ||
    Number(
      classificationAudit?.validation?.unclassifiedFiles,
    ) !== EXPECTED_RESOLVER_COUNTS.unclassifiedImpactFiles ||
    Number(
      classificationAudit?.validation
        ?.directFileEditAuthorizations,
    ) !== 0 ||
    Number(
      classificationAudit?.validation?.writePlanRows,
    ) !== 0
  ) {
    issues.push(issue(
      "CLASSIFICATION_AUDIT_INVALID",
      "Propagation classification audit is not a clean no-write-plan source.",
    ));
  }

  if (
    phaseContract?.status !==
      "PASS_CLASSIFICATION_COMPLETE_NO_WRITE_PLAN" ||
    phaseContract?.globalInvariants
      ?.directBulkRewriteAuthorized !== false ||
    phaseContract?.globalInvariants
      ?.writePlanGenerated !== false ||
    phaseContract?.globalInvariants
      ?.productionDataApplicationAuthorized !== false ||
    phaseContract?.globalInvariants
      ?.fixtureDeletionAuthorized !== false ||
    phaseContract?.globalInvariants
      ?.historyRewriteAuthorized !== false ||
    phaseContract?.globalInvariants
      ?.resolverFoundationRequiredBeforePropagation !== true
  ) {
    issues.push(issue(
      "PHASE_CONTRACT_INVALID",
      "Propagation phase contract does not preserve resolver-first invariants.",
    ));
  }

  return {
    schema:
      "ai-matchlab.production-identity-resolver-foundation-validation.v1",
    ok: issues.length === 0,
    status:
      issues.length === 0
        ? "PASS_RESOLVER_FOUNDATION_APPLICATION_FORBIDDEN"
        : "FAIL_RESOLVER_FOUNDATION",
    summary: {
      identityBindings:
        Number(registry?.bindings?.length || 0),
      fixtureRetentionDecisions:
        Number(retentionLedger?.decisions?.length || 0),
      sourceFixtureIds:
        new Set(
          (retentionLedger?.decisions || []).flatMap(
            decision =>
              (decision.sourceFixtures || []).map(
                fixture => clean(fixture.repositoryFixtureId),
              ),
          ),
        ).size,
      classificationFiles:
        Number(
          classificationAudit?.validation
            ?.impactedFilesClassified || 0,
        ),
      finalizedDecisionValidationOk:
        finalizedValidation.ok,
    },
    authorization: {
      productionDataApplicationAuthorized: false,
      repositoryRepairAuthorized: false,
      fixtureRetentionApplicationAuthorized: false,
      fixtureDeletionAuthorized: false,
      historyRewriteAuthorized: false,
      consumerIntegrationAuthorized: false,
      writePlanGenerated: false,
    },
    issueCount: issues.length,
    issues,
  };
}

export function buildProductionIdentityResolver({
  contract,
  registry,
  retentionLedger,
  sourceLedger,
  classificationAudit,
  phaseContract,
}) {
  const validation = validateResolverFoundation({
    contract,
    registry,
    retentionLedger,
    sourceLedger,
    classificationAudit,
    phaseContract,
  });

  if (!validation.ok) {
    const error = new Error(
      "production_identity_resolver_foundation_invalid",
    );
    error.validation = validation;
    throw error;
  }

  const byGlobalClubId = new Map();
  const byLedgerTeamIdentityKey = new Map();
  const byNormalizedAlias = new Map();

  for (const binding of registry.bindings) {
    const globalClubId = clean(binding.globalClubId);
    const ledgerTeamIdentityKey = clean(
      binding.ledgerTeamIdentityKey,
    );

    if (
      byGlobalClubId.has(globalClubId) ||
      byLedgerTeamIdentityKey.has(ledgerTeamIdentityKey)
    ) {
      throw new Error("identity_binding_index_collision");
    }

    byGlobalClubId.set(globalClubId, binding);
    byLedgerTeamIdentityKey.set(
      ledgerTeamIdentityKey,
      binding,
    );

    const aliases = [
      binding.preferredDisplayName,
      ...(binding.genesisAliases || []),
    ];

    for (const alias of aliases) {
      const normalized = normalizeGenesisAlias(alias);
      if (!normalized) continue;
      const prior = byNormalizedAlias.get(normalized);
      if (
        prior &&
        prior.ledgerTeamIdentityKey !==
          binding.ledgerTeamIdentityKey
      ) {
        throw new Error(
          `normalized_identity_alias_collision:${normalized}`,
        );
      }
      byNormalizedAlias.set(normalized, binding);
    }
  }

  const retainedFixtureIds = new Set();
  const fixtureAliasToRetained = new Map();
  const fixtureDecisionById = new Map();

  for (const decision of retentionLedger.decisions) {
    const retained = clean(
      decision.retainedRepositoryFixtureId,
    );

    if (
      !retained ||
      retainedFixtureIds.has(retained) ||
      fixtureAliasToRetained.has(retained)
    ) {
      throw new Error(
        `retained_fixture_index_collision:${retained}`,
      );
    }

    retainedFixtureIds.add(retained);
    fixtureDecisionById.set(retained, decision);

    for (const suppressedValue of
      decision.suppressedRepositoryFixtureIds || []) {
      const suppressed = clean(suppressedValue);
      if (
        !suppressed ||
        suppressed === retained ||
        retainedFixtureIds.has(suppressed) ||
        fixtureAliasToRetained.has(suppressed)
      ) {
        throw new Error(
          `suppressed_fixture_alias_collision:${suppressed}`,
        );
      }
      fixtureAliasToRetained.set(suppressed, retained);
      fixtureDecisionById.set(suppressed, decision);
    }
  }

  if (
    byGlobalClubId.size !==
      EXPECTED_RESOLVER_COUNTS.identityBindings ||
    byLedgerTeamIdentityKey.size !==
      EXPECTED_RESOLVER_COUNTS.identityBindings ||
    retainedFixtureIds.size !==
      EXPECTED_RESOLVER_COUNTS.fixtureRetentionDecisions ||
    fixtureAliasToRetained.size !==
      EXPECTED_RESOLVER_COUNTS.suppressedFixtureAliases
  ) {
    throw new Error("resolver_index_coverage_invalid");
  }

  function resolveTeamReference(reference = {}) {
    const signals = [];

    const globalClubId = clean(reference.globalClubId);
    if (globalClubId) {
      const binding = byGlobalClubId.get(globalClubId);
      if (!binding) {
        return {
          ok: false,
          status: "GLOBAL_CLUB_ID_NOT_FOUND",
          productionMutationAuthorized: false,
        };
      }
      signals.push({
        signal: "globalClubId",
        binding,
      });
    }

    const ledgerTeamIdentityKey = clean(
      reference.ledgerTeamIdentityKey,
    );
    if (ledgerTeamIdentityKey) {
      const binding = byLedgerTeamIdentityKey.get(
        ledgerTeamIdentityKey,
      );
      if (!binding) {
        return {
          ok: false,
          status: "LEDGER_TEAM_IDENTITY_KEY_NOT_FOUND",
          productionMutationAuthorized: false,
        };
      }
      signals.push({
        signal: "ledgerTeamIdentityKey",
        binding,
      });
    }

    const alias = clean(reference.alias);
    if (alias) {
      const normalizedAlias =
        normalizeGenesisAlias(alias);
      const binding = byNormalizedAlias.get(normalizedAlias);
      if (!binding) {
        return {
          ok: false,
          status: "NORMALIZED_EXACT_ALIAS_NOT_FOUND",
          normalizedAlias,
          fuzzyMatchingAttempted: false,
          productionMutationAuthorized: false,
        };
      }
      signals.push({
        signal: "normalizedExactGenesisAlias",
        binding,
        normalizedAlias,
      });
    }

    if (signals.length === 0) {
      return {
        ok: false,
        status: "NO_IDENTITY_SIGNAL",
        productionMutationAuthorized: false,
      };
    }

    const resolvedGlobalIds = new Set(
      signals.map(item => item.binding.globalClubId),
    );

    if (resolvedGlobalIds.size !== 1) {
      return {
        ok: false,
        status: "CONFLICTING_IDENTITY_SIGNALS",
        signals: signals.map(item => ({
          signal: item.signal,
          globalClubId: item.binding.globalClubId,
        })),
        productionMutationAuthorized: false,
      };
    }

    const binding = signals[0].binding;
    const requestedLeagueSlug = clean(
      reference.leagueSlug,
    );

    return {
      ok: true,
      status: "RESOLVED_EXACT_IDENTITY",
      globalClubId: binding.globalClubId,
      ledgerTeamIdentityKey:
        binding.ledgerTeamIdentityKey,
      preferredDisplayName:
        binding.preferredDisplayName,
      leagueSlugs: [...(binding.leagueSlugs || [])],
      requestedLeagueSlug:
        requestedLeagueSlug || null,
      requestedLeagueObservedInGenesis:
        requestedLeagueSlug
          ? (binding.leagueSlugs || []).includes(
              requestedLeagueSlug,
            )
          : null,
      matchedSignals:
        signals.map(item => item.signal).sort(),
      fuzzyMatchingAttempted: false,
      productionMutationAuthorized: false,
    };
  }

  function resolveFixtureId(repositoryFixtureId) {
    const sourceFixtureId = clean(repositoryFixtureId);
    if (!sourceFixtureId) {
      return {
        ok: false,
        status: "FIXTURE_ID_REQUIRED",
        productionMutationAuthorized: false,
      };
    }

    if (retainedFixtureIds.has(sourceFixtureId)) {
      const decision =
        fixtureDecisionById.get(sourceFixtureId);
      return {
        ok: true,
        status: "RETAINED_FIXTURE_IDEMPOTENT",
        sourceFixtureId,
        resolvedFixtureId: sourceFixtureId,
        sourceRole: "retained",
        fixtureRetentionDecisionId:
          decision.fixtureRetentionDecisionId,
        deletionAuthorized: false,
        historyRewriteAuthorized: false,
        productionMutationAuthorized: false,
      };
    }

    const target =
      fixtureAliasToRetained.get(sourceFixtureId);

    if (target) {
      if (fixtureAliasToRetained.has(target)) {
        throw new Error(
          `fixture_alias_chain_detected:${sourceFixtureId}`,
        );
      }
      const decision =
        fixtureDecisionById.get(sourceFixtureId);
      return {
        ok: true,
        status:
          "SUPPRESSED_FIXTURE_LINEAGE_ALIAS_RESOLVED",
        sourceFixtureId,
        resolvedFixtureId: target,
        sourceRole: "suppressed_lineage_alias",
        fixtureRetentionDecisionId:
          decision.fixtureRetentionDecisionId,
        deletionAuthorized: false,
        historyRewriteAuthorized: false,
        productionMutationAuthorized: false,
      };
    }

    return {
      ok: false,
      status: "UNKNOWN_FIXTURE_ID",
      sourceFixtureId,
      productionMutationAuthorized: false,
    };
  }

  function resolveFixtureMembership({
    repositoryFixtureId,
    canonicalFixtureIds,
  } = {}) {
    if (
      !Array.isArray(canonicalFixtureIds) &&
      !(canonicalFixtureIds instanceof Set)
    ) {
      return {
        ok: false,
        status: "CANONICAL_FIXTURE_UNIVERSE_REQUIRED",
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }

    const universe = canonicalFixtureIds instanceof Set
      ? canonicalFixtureIds
      : new Set(canonicalFixtureIds.map(clean).filter(Boolean));

    const resolution =
      resolveFixtureId(repositoryFixtureId);

    if (!resolution.ok) {
      return {
        ...resolution,
        fixtureMembershipCreated: false,
      };
    }

    if (!universe.has(resolution.resolvedFixtureId)) {
      return {
        ok: false,
        status:
          "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
        sourceFixtureId: resolution.sourceFixtureId,
        resolvedFixtureId:
          resolution.resolvedFixtureId,
        sourceRole: resolution.sourceRole,
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }

    return {
      ok: true,
      status:
        "FIXTURE_MEMBERSHIP_RESOLVED_WITHOUT_CREATION",
      sourceFixtureId: resolution.sourceFixtureId,
      resolvedFixtureId:
        resolution.resolvedFixtureId,
      sourceRole: resolution.sourceRole,
      fixtureMembershipCreated: false,
      productionMutationAuthorized: false,
    };
  }

  function buildFixtureIdentityOverlay({
    repositoryFixtureId,
    canonicalFixtureIds,
    homeReference,
    awayReference,
  } = {}) {
    const membership = resolveFixtureMembership({
      repositoryFixtureId,
      canonicalFixtureIds,
    });

    if (!membership.ok) {
      return {
        ok: false,
        status: membership.status,
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }

    const home =
      resolveTeamReference(homeReference);
    const away =
      resolveTeamReference(awayReference);

    if (!home.ok || !away.ok) {
      return {
        ok: false,
        status: "TEAM_IDENTITY_RESOLUTION_FAILED",
        home,
        away,
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }

    if (home.globalClubId === away.globalClubId) {
      return {
        ok: false,
        status: "HOME_AWAY_GLOBAL_ID_COLLISION",
        homeGlobalClubId: home.globalClubId,
        awayGlobalClubId: away.globalClubId,
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }

    return {
      ok: true,
      status: "ADDITIVE_IDENTITY_OVERLAY_RESOLVED",
      sourceFixtureId: membership.sourceFixtureId,
      resolvedFixtureId:
        membership.resolvedFixtureId,
      sourceFixtureRole: membership.sourceRole,
      homeGlobalClubId: home.globalClubId,
      awayGlobalClubId: away.globalClubId,
      overlayOnly: true,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      fixtureMembershipCreated: false,
      fixtureDeletionAuthorized: false,
      historyRewriteAuthorized: false,
      productionMutationAuthorized: false,
    };
  }

  return Object.freeze({
    schema:
      "ai-matchlab.production-identity-resolver.v1",
    counts: Object.freeze({
      identityBindings: byGlobalClubId.size,
      retainedFixtureIds: retainedFixtureIds.size,
      suppressedFixtureAliases:
        fixtureAliasToRetained.size,
      sourceFixtureIds:
        retainedFixtureIds.size +
        fixtureAliasToRetained.size,
    }),
    resolveTeamReference,
    resolveFixtureId,
    resolveFixtureMembership,
    buildFixtureIdentityOverlay,
    authorization: Object.freeze({
      productionDataApplicationAuthorized: false,
      repositoryRepairAuthorized: false,
      fixtureRetentionApplicationAuthorized: false,
      fixtureDeletionAuthorized: false,
      historyRewriteAuthorized: false,
      consumerIntegrationAuthorized: false,
      writePlanGenerated: false,
    }),
  });
}
