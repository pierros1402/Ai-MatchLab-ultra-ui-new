import fs from "node:fs";
import crypto from "node:crypto";

export const GLOBAL_CLUB_ID_REGISTRY_SCHEMA =
  "ai-matchlab.production-global-club-id-registry.v1";

export const FIXTURE_RETENTION_LEDGER_SCHEMA =
  "ai-matchlab.fixture-retention-decision-ledger.v1";

export const EXPECTED_FINALIZED_COUNTS = Object.freeze({
  identityBindings: 70,
  retentionDecisions: 53,
  sourceFixtureIds: 106,
  truthDominant: 7,
  lineageDominant: 46,
  retainedClaimA: 50,
  retainedClaimB: 3,
});

export const EXPECTED_SOURCE = Object.freeze({
  sourceCommit: "003f8d6be532f29ced9faf43daee90fd74014ee9",
  sourceSemanticDuplicateLedgerSha256:
    "a0bc336e1df2f1913fed90cd6574aee94ba8d7e502addc8c0d1626e966347574",
  bindingProposalSha256:
    "76579def666a2eb36f5ee9b16dd30f3f3cd684479040152b40677eeee18586a4",
  retentionProposalSha256:
    "ff86ad19404d9beea074d80b0ff829f07140ac5f8acc426517001a3e45bb42eb",
  proposalAuditSha256:
    "117fff8f4fe863fc85b6dc371b77799340f41a8dfb73878b9171efeb09ab779a",
  proposalContentManifestSha256:
    "5e7af0dc1a68d000e3e24c0211b587403e7e2a3a4a8d3682a3b734c292cd3116",
});

function clean(value) {
  return String(value ?? "").trim();
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value) {
  return crypto
    .createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

export function sha256File(filePath) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

export function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function deriveGenesisGlobalClubId(team) {
  const seed = [
    "ai-matchlab.global-club-id.v1",
    clean(team?.ledgerTeamIdentityKey),
    clean(team?.identityHash),
  ].join("\0");
  return `gcid_${crypto
    .createHash("sha256")
    .update(seed, "utf8")
    .digest("hex")
    .slice(0, 24)}`;
}

export function normalizeGenesisAlias(value) {
  return clean(value)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(
      /\b(fc|cf|sc|ac|afc|fk|sk|club|football|futbol|soccer)\b/g,
      " ",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function withoutField(value, field) {
  const copy = JSON.parse(JSON.stringify(value));
  delete copy[field];
  return copy;
}

function issue(code, message, details = {}) {
  return { code, severity: "error", message, details };
}

function sourceFixtureTruthMatch(fixture, truth) {
  if (truth?.status === "RESOLVED_FINAL") {
    const terminal = new Set([
      "FT",
      "FINAL",
      "STATUS_FINAL",
      "STATUS_FULL_TIME",
      "AET",
      "PEN",
    ]).has(clean(fixture?.status).toUpperCase());

    return (
      terminal &&
      fixture?.scoreHome === truth?.scoreHome &&
      fixture?.scoreAway === truth?.scoreAway
    );
  }

  if (truth?.status === "RESOLVED_NON_PLAYED") {
    const expected = clean(
      truth?.nonPlayedStatus || truth?.terminalStatus,
    ).toUpperCase();
    const observed = [
      fixture?.status,
      fixture?.rawStatus,
    ]
      .map(value => clean(value).toUpperCase())
      .join(" ");
    return Boolean(expected) && observed.includes(expected);
  }

  return false;
}

function exactStringSet(values) {
  return new Set((values || []).map(clean).filter(Boolean));
}

export function validateFinalizedIdentityRetention({
  registry,
  retentionLedger,
  sourceLedger,
}) {
  const issues = [];

  if (registry?.schema !== GLOBAL_CLUB_ID_REGISTRY_SCHEMA) {
    issues.push(issue("REGISTRY_SCHEMA_INVALID", "Unexpected registry schema."));
  }

  if (retentionLedger?.schema !== FIXTURE_RETENTION_LEDGER_SCHEMA) {
    issues.push(
      issue("RETENTION_SCHEMA_INVALID", "Unexpected retention ledger schema."),
    );
  }

  if (
    registry?.source?.sourceCommit !== EXPECTED_SOURCE.sourceCommit ||
    retentionLedger?.source?.sourceCommit !== EXPECTED_SOURCE.sourceCommit
  ) {
    issues.push(issue("SOURCE_COMMIT_MISMATCH", "Source commit is not pinned."));
  }

  for (const [field, expected] of Object.entries(EXPECTED_SOURCE)) {
    if (field === "sourceCommit") continue;
    if (
      registry?.source?.[field] !== expected ||
      retentionLedger?.source?.[field] !== expected
    ) {
      issues.push(
        issue("SOURCE_HASH_MISMATCH", `Source hash mismatch: ${field}.`, {
          field,
        }),
      );
    }
  }

  if (
    sha256Canonical(withoutField(registry, "immutableRegistryHash")) !==
    registry?.immutableRegistryHash
  ) {
    issues.push(
      issue("REGISTRY_HASH_INVALID", "Immutable registry hash is invalid."),
    );
  }

  if (
    sha256Canonical(withoutField(retentionLedger, "immutableLedgerHash")) !==
    retentionLedger?.immutableLedgerHash
  ) {
    issues.push(
      issue(
        "RETENTION_LEDGER_HASH_INVALID",
        "Immutable retention ledger hash is invalid.",
      ),
    );
  }

  const sourceTeams = new Map(
    (sourceLedger?.teamIdentities || []).map(team => [
      clean(team.ledgerTeamIdentityKey),
      team,
    ]),
  );

  const sourceDecisions = new Map(
    (sourceLedger?.decisions || []).map(decision => [
      clean(decision.decisionId),
      decision,
    ]),
  );

  if (sourceTeams.size !== EXPECTED_FINALIZED_COUNTS.identityBindings) {
    issues.push(issue("SOURCE_TEAM_COUNT_INVALID", "Source team count is not 70."));
  }

  if (sourceDecisions.size !== EXPECTED_FINALIZED_COUNTS.retentionDecisions) {
    issues.push(
      issue("SOURCE_DECISION_COUNT_INVALID", "Source decision count is not 53."),
    );
  }

  const bindings = registry?.bindings || [];
  const bindingByTeam = new Map();
  const globalIdOwners = new Map();
  const aliasOwners = new Map();

  for (const binding of bindings) {
    const teamKey = clean(binding?.ledgerTeamIdentityKey);
    const globalClubId = clean(binding?.globalClubId);

    if (!teamKey || bindingByTeam.has(teamKey)) {
      issues.push(
        issue("DUPLICATE_OR_MISSING_TEAM_BINDING", "Team binding is not unique.", {
          teamKey,
        }),
      );
      continue;
    }

    bindingByTeam.set(teamKey, binding);

    const priorGlobalOwner = globalIdOwners.get(globalClubId);
    if (!globalClubId || priorGlobalOwner) {
      issues.push(
        issue("GLOBAL_CLUB_ID_NOT_UNIQUE", "globalClubId is not unique.", {
          globalClubId,
          priorGlobalOwner,
          teamKey,
        }),
      );
    } else {
      globalIdOwners.set(globalClubId, teamKey);
    }

    const sourceTeam = sourceTeams.get(teamKey);
    if (!sourceTeam) {
      issues.push(
        issue("TEAM_BINDING_NOT_IN_SOURCE_LEDGER", "Binding has no source team.", {
          teamKey,
        }),
      );
      continue;
    }

    if (binding.globalClubId !== deriveGenesisGlobalClubId(sourceTeam)) {
      issues.push(
        issue(
          "GLOBAL_CLUB_ID_DERIVATION_MISMATCH",
          "Final globalClubId does not match genesis derivation.",
          { teamKey },
        ),
      );
    }

    if (binding.sourceIdentityHash !== sourceTeam.identityHash) {
      issues.push(
        issue("SOURCE_IDENTITY_HASH_MISMATCH", "Source identity hash drift.", {
          teamKey,
        }),
      );
    }

    const expectedAliases = [
      sourceTeam.preferredDisplayName,
      ...(sourceTeam.aliases || []),
    ]
      .map(clean)
      .filter(Boolean)
      .sort();

    const actualAliases = [
      binding.preferredDisplayName,
      ...(binding.genesisAliases || []),
    ]
      .map(clean)
      .filter(Boolean)
      .sort();

    if (canonicalJson(expectedAliases) !== canonicalJson(actualAliases)) {
      issues.push(
        issue("GENESIS_ALIAS_SET_MISMATCH", "Genesis alias set drift.", {
          teamKey,
        }),
      );
    }

    for (const alias of actualAliases) {
      const normalized = normalizeGenesisAlias(alias);
      const prior = aliasOwners.get(normalized);
      if (prior && prior !== teamKey) {
        issues.push(
          issue("NORMALIZED_ALIAS_COLLISION", "Genesis alias collision.", {
            normalized,
            prior,
            teamKey,
          }),
        );
      } else {
        aliasOwners.set(normalized, teamKey);
      }
    }

    if (
      sha256Canonical(
        withoutField(binding, "immutableBindingDecisionHash"),
      ) !== binding.immutableBindingDecisionHash
    ) {
      issues.push(
        issue("BINDING_HASH_INVALID", "Immutable binding hash is invalid.", {
          teamKey,
        }),
      );
    }

    if (
      binding.allocationStatus !== "FINALIZED_IDENTITY_BINDING" ||
      binding.globalClubIdImmutable !== true ||
      binding.futureAliasChangesMustNotReallocateId !== true ||
      binding.productionArtifactsUpdated !== false
    ) {
      issues.push(
        issue("BINDING_FINALIZATION_STATE_INVALID", "Binding state is invalid.", {
          teamKey,
        }),
      );
    }
  }

  if (
    bindings.length !== EXPECTED_FINALIZED_COUNTS.identityBindings ||
    bindingByTeam.size !== EXPECTED_FINALIZED_COUNTS.identityBindings ||
    globalIdOwners.size !== EXPECTED_FINALIZED_COUNTS.identityBindings
  ) {
    issues.push(
      issue("BINDING_COVERAGE_INVALID", "Binding coverage is not exactly 70."),
    );
  }

  for (const teamKey of sourceTeams.keys()) {
    if (!bindingByTeam.has(teamKey)) {
      issues.push(
        issue("SOURCE_TEAM_BINDING_MISSING", "Source team binding is missing.", {
          teamKey,
        }),
      );
    }
  }

  const decisions = retentionLedger?.decisions || [];
  const decisionBySourceId = new Map();
  const seenFixtureIds = new Set();
  let truthDominant = 0;
  let lineageDominant = 0;
  let retainedClaimA = 0;
  let retainedClaimB = 0;

  for (const decision of decisions) {
    const sourceId = clean(decision?.sourceSemanticDuplicateDecisionId);
    if (!sourceId || decisionBySourceId.has(sourceId)) {
      issues.push(
        issue("RETENTION_DECISION_NOT_UNIQUE", "Retention decision is not unique.", {
          sourceId,
        }),
      );
      continue;
    }
    decisionBySourceId.set(sourceId, decision);

    const sourceDecision = sourceDecisions.get(sourceId);
    if (!sourceDecision) {
      issues.push(
        issue("RETENTION_SOURCE_DECISION_MISSING", "Source decision is missing.", {
          sourceId,
        }),
      );
      continue;
    }

    const sourceFixtures = sourceDecision.sourceFixtures || [];
    const sourceFixtureIds = sourceFixtures.map(item =>
      clean(item.repositoryFixtureId),
    );
    const retainedId = clean(decision.retainedRepositoryFixtureId);
    const suppressedIds = (decision.suppressedRepositoryFixtureIds || []).map(
      clean,
    );

    for (const id of sourceFixtureIds) {
      if (seenFixtureIds.has(id)) {
        issues.push(
          issue("SOURCE_FIXTURE_ID_REUSED", "Source fixture ID is reused.", {
            id,
          }),
        );
      }
      seenFixtureIds.add(id);
    }

    if (
      sourceFixtureIds.length !== 2 ||
      !sourceFixtureIds.includes(retainedId) ||
      suppressedIds.length !== 1 ||
      !sourceFixtureIds.includes(suppressedIds[0]) ||
      retainedId === suppressedIds[0]
    ) {
      issues.push(
        issue("RETENTION_PAIR_INVALID", "Retained/suppressed fixture pair is invalid.", {
          sourceId,
        }),
      );
    }

    const homeBinding = bindingByTeam.get(
      clean(sourceDecision.homeTeamIdentityKey),
    );
    const awayBinding = bindingByTeam.get(
      clean(sourceDecision.awayTeamIdentityKey),
    );

    if (
      !homeBinding ||
      !awayBinding ||
      decision.homeGlobalClubId !== homeBinding.globalClubId ||
      decision.awayGlobalClubId !== awayBinding.globalClubId ||
      decision.homeGlobalClubId === decision.awayGlobalClubId
    ) {
      issues.push(
        issue("RETENTION_GLOBAL_ID_BINDING_INVALID", "Global club binding is invalid.", {
          sourceId,
        }),
      );
    }

    if (
      sourceDecision.truthDecision?.status === "RESOLVED_FINAL" ||
      sourceDecision.truthDecision?.status === "RESOLVED_NON_PLAYED"
    ) {
      truthDominant += 1;
      const matches = sourceFixtures.map(fixture =>
        sourceFixtureTruthMatch(fixture, sourceDecision.truthDecision),
      );
      const matchingIds = sourceFixtures
        .filter((fixture, index) => matches[index])
        .map(fixture => clean(fixture.repositoryFixtureId));

      if (
        decision.selectionPolicy !==
          "AUTHORITATIVE_TRUTH_MATCH_DOMINATES_RETENTION" ||
        matchingIds.length !== 1 ||
        matchingIds[0] !== retainedId ||
        decision.selectionMeaning !==
          "AUTHORITATIVE_MATCH_TRUTH_RETENTION"
      ) {
        issues.push(
          issue("TRUTH_RETENTION_INVALID", "Truth-dominant retention is invalid.", {
            sourceId,
            matchingIds,
            retainedId,
          }),
        );
      }
    } else {
      lineageDominant += 1;
      const counts = new Map(
        (
          decision.selectionEvidence?.sourceReferenceCounts || []
        ).map(item => [
          clean(item.repositoryFixtureId),
          Number(item.referenceCount),
        ]),
      );

      const retainedCount = counts.get(retainedId);
      const suppressedCount = counts.get(suppressedIds[0]);

      if (
        decision.selectionPolicy !==
          "UNIQUE_REPOSITORY_LINEAGE_DOMINANCE" ||
        decision.selectionMeaning !==
          "REPOSITORY_ID_CONTINUITY_NOT_SOURCE_TRUTH_RANKING" ||
        !Number.isFinite(retainedCount) ||
        !Number.isFinite(suppressedCount) ||
        retainedCount <= suppressedCount
      ) {
        issues.push(
          issue(
            "LINEAGE_RETENTION_INVALID",
            "Lineage-dominant continuity decision is invalid.",
            { sourceId, retainedCount, suppressedCount },
          ),
        );
      }
    }

    const retainedSource = sourceFixtures.find(
      item => clean(item.repositoryFixtureId) === retainedId,
    );
    if (retainedSource?.claimLabel === "A") retainedClaimA += 1;
    if (retainedSource?.claimLabel === "B") retainedClaimB += 1;

    const aliases = decision.suppressedFixtureLineageAliases || [];
    if (
      aliases.length !== 1 ||
      aliases[0]?.aliasFixtureId !== suppressedIds[0] ||
      aliases[0]?.targetFixtureId !== retainedId ||
      aliases[0]?.deletionAuthorized !== false ||
      sha256Canonical(
        withoutField(aliases[0], "immutableAliasDecisionHash"),
      ) !== aliases[0]?.immutableAliasDecisionHash
    ) {
      issues.push(
        issue("LINEAGE_ALIAS_INVALID", "Suppressed fixture lineage alias is invalid.", {
          sourceId,
        }),
      );
    }

    if (
      decision.retentionDecisionStatus !==
        "FINALIZED_RETENTION_DECISION_NOT_APPLIED" ||
      decision.productionFixturesUpdated !== false ||
      decision.fixtureDeletionAuthorized !== false ||
      decision.historyRewriteAuthorized !== false ||
      sha256Canonical(
        withoutField(decision, "immutableFixtureRetentionDecisionHash"),
      ) !== decision.immutableFixtureRetentionDecisionHash
    ) {
      issues.push(
        issue("RETENTION_FINALIZATION_STATE_INVALID", "Retention state is invalid.", {
          sourceId,
        }),
      );
    }
  }

  if (
    decisions.length !== EXPECTED_FINALIZED_COUNTS.retentionDecisions ||
    decisionBySourceId.size !== EXPECTED_FINALIZED_COUNTS.retentionDecisions ||
    seenFixtureIds.size !== EXPECTED_FINALIZED_COUNTS.sourceFixtureIds
  ) {
    issues.push(
      issue("RETENTION_COVERAGE_INVALID", "Retention coverage is not exact."),
    );
  }

  for (const sourceId of sourceDecisions.keys()) {
    if (!decisionBySourceId.has(sourceId)) {
      issues.push(
        issue(
          "SOURCE_RETENTION_DECISION_MISSING",
          "Source retention decision is missing.",
          { sourceId },
        ),
      );
    }
  }

  if (
    truthDominant !== EXPECTED_FINALIZED_COUNTS.truthDominant ||
    lineageDominant !== EXPECTED_FINALIZED_COUNTS.lineageDominant ||
    retainedClaimA !== EXPECTED_FINALIZED_COUNTS.retainedClaimA ||
    retainedClaimB !== EXPECTED_FINALIZED_COUNTS.retainedClaimB
  ) {
    issues.push(
      issue("RETENTION_SUMMARY_INVALID", "Retention summary totals are invalid.", {
        truthDominant,
        lineageDominant,
        retainedClaimA,
        retainedClaimB,
      }),
    );
  }

  const registryAuthorization = registry?.authorization || {};
  const retentionAuthorization = retentionLedger?.authorization || {};

  if (
    registryAuthorization.identityBindingDecisionsFinalized !== true ||
    retentionAuthorization.fixtureRetentionDecisionsFinalized !== true ||
    registryAuthorization.productionArtifactRebindingAuthorized !== false ||
    registryAuthorization.productionDataMutationAllowed !== false ||
    registryAuthorization.repositoryRepairAuthorized !== false ||
    registryAuthorization.writePlanGenerated !== false ||
    retentionAuthorization.productionFixtureApplicationAuthorized !== false ||
    retentionAuthorization.productionDataMutationAllowed !== false ||
    retentionAuthorization.fixtureDeletionAuthorized !== false ||
    retentionAuthorization.historyRewriteAuthorized !== false ||
    retentionAuthorization.repositoryRepairAuthorized !== false ||
    retentionAuthorization.writePlanGenerated !== false
  ) {
    issues.push(
      issue(
        "AUTHORIZATION_STATE_INVALID",
        "Final decisions must remain application-forbidden.",
      ),
    );
  }

  return {
    schema:
      "ai-matchlab.production-identity-retention-finalization-validation.v1",
    ok: issues.length === 0,
    status:
      issues.length === 0
        ? "PASS_FINALIZED_DECISIONS_APPLICATION_FORBIDDEN"
        : "FAIL_FINALIZED_DECISIONS_INVALID",
    registryVersion: registry?.registryVersion || null,
    retentionLedgerVersion: retentionLedger?.ledgerVersion || null,
    summary: {
      identityBindingsFinalized: bindingByTeam.size,
      uniqueGlobalClubIds: globalIdOwners.size,
      retentionDecisionsFinalized: decisionBySourceId.size,
      sourceFixtureIdsCovered: seenFixtureIds.size,
      truthDominantDecisions: truthDominant,
      lineageDominantDecisions: lineageDominant,
      retainedClaimA,
      retainedClaimB,
      productionArtifactsUpdated: 0,
      fixtureRowsDeleted: 0,
    },
    authorization: {
      productionDataApplicationAuthorized: false,
      repositoryRepairAuthorized: false,
      writePlanGenerated: false,
    },
    issueCount: issues.length,
    issues,
  };
}
