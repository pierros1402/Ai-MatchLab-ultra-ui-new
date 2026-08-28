import crypto from "node:crypto";

import {
  deriveGenesisGlobalClubId,
  normalizeGenesisAlias,
} from "./production-identity-retention-decisions.js";
import { validateIndependentFixtureConfirmation } from "./independent-fixture-confirmer.js";

export const PRODUCTION_IDENTITY_EXTENSION_SCHEMA =
  "ai-matchlab.production-identity-extension-ledger.v1";

function clean(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, stable(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value), "utf8")
    .digest("hex");
}

function normalizedAliases(binding) {
  return [...new Set([
    binding?.preferredDisplayName,
    ...(binding?.genesisAliases || [])
  ]
    .map(normalizeGenesisAlias)
    .filter(Boolean))]
    .sort();
}

function normalizedLeagueSlugs(binding) {
  return [...new Set((binding?.leagueSlugs || []).map(clean).filter(Boolean))]
    .sort();
}

export function deriveExtensionTeamIdentityKey(binding) {
  const seed = canonicalJson({
    namespace: "ai-matchlab.identity-extension-team.v1",
    leagueSlugs: normalizedLeagueSlugs(binding),
    preferredDisplayName: clean(binding?.preferredDisplayName),
    genesisAliases: normalizedAliases(binding),
  });
  return `p0xteam_${sha256(seed).slice(0, 20)}`;
}

export function deriveExtensionSourceIdentityHash(binding) {
  return sha256(canonicalJson({
    namespace: "ai-matchlab.identity-extension-source.v1",
    leagueSlugs: normalizedLeagueSlugs(binding),
    preferredDisplayName: clean(binding?.preferredDisplayName),
    genesisAliases: normalizedAliases(binding),
  }));
}

export function deriveExtensionGlobalClubId(binding) {
  const ledgerTeamIdentityKey =
    deriveExtensionTeamIdentityKey(binding);
  const identityHash =
    deriveExtensionSourceIdentityHash(binding);
  return deriveGenesisGlobalClubId({
    ledgerTeamIdentityKey,
    identityHash,
  });
}

export function deriveExtensionBindingDecisionId(binding) {
  return `p0xbind_${sha256(canonicalJson({
    globalClubId: deriveExtensionGlobalClubId(binding),
    ledgerTeamIdentityKey: deriveExtensionTeamIdentityKey(binding),
  })).slice(0, 20)}`;
}

export function deriveExtensionFixtureDecisionId(decision) {
  return `p0xfix_${sha256(canonicalJson({
    dayKey: clean(decision?.dayKey),
    leagueSlug: clean(decision?.leagueSlug),
    retainedRepositoryFixtureId: clean(decision?.retainedRepositoryFixtureId),
    suppressedRepositoryFixtureIds: [...new Set(
      (decision?.suppressedRepositoryFixtureIds || [])
        .map(clean)
        .filter(Boolean)
    )].sort(),
  })).slice(0, 20)}`;
}

function issue(code, details = {}) {
  return { code, severity: "error", details };
}

function baseTeamResolution(baseResolver, field, value, leagueSlug = null) {
  if (!value) return null;
  const result = baseResolver.resolveTeamReference({
    [field]: value,
    ...(leagueSlug ? { leagueSlug } : {}),
  });
  return result?.ok ? result : null;
}

function kickoffDeltaMs(sourceFixtures) {
  const times = sourceFixtures
    .map(row => Date.parse(row?.kickoffUtc || ""))
    .filter(Number.isFinite);
  if (times.length !== sourceFixtures.length) return null;
  return Math.max(...times) - Math.min(...times);
}

export function validateProductionIdentityExtension({
  ledger,
  baseResolver,
} = {}) {
  const issues = [];

  if (!baseResolver || typeof baseResolver.resolveTeamReference !== "function") {
    issues.push(issue("BASE_RESOLVER_REQUIRED"));
  }
  if (ledger?.schema !== PRODUCTION_IDENTITY_EXTENSION_SCHEMA) {
    issues.push(issue("EXTENSION_SCHEMA_INVALID"));
  }
  if (!clean(ledger?.extensionVersion)) {
    issues.push(issue("EXTENSION_VERSION_REQUIRED"));
  }
  if (ledger?.promotionPolicy?.fuzzyTeamIdentityMatchingAllowed !== false) {
    issues.push(issue("FUZZY_IDENTITY_PROMOTION_FORBIDDEN"));
  }
  if (ledger?.promotionPolicy?.conflictingIdentitySignalsFailClosed !== true) {
    issues.push(issue("CONFLICTING_IDENTITY_SIGNALS_MUST_FAIL_CLOSED"));
  }
  if (ledger?.promotionPolicy?.fixtureAliasChainsAllowed !== false) {
    issues.push(issue("FIXTURE_ALIAS_CHAINS_MUST_BE_FORBIDDEN"));
  }
  if (ledger?.promotionPolicy?.fixtureAliasCyclesAllowed !== false) {
    issues.push(issue("FIXTURE_ALIAS_CYCLES_MUST_BE_FORBIDDEN"));
  }
  if (ledger?.promotionPolicy?.providerIdentifiersAreCrosswalksNotPrimaryIds !== true) {
    issues.push(issue("PROVIDER_IDS_MUST_REMAIN_CROSSWALKS"));
  }
  if (ledger?.promotionPolicy?.unknownAliasesRequireSourceBoundEvidence !== true) {
    issues.push(issue("UNKNOWN_ALIASES_REQUIRE_SOURCE_BOUND_EVIDENCE"));
  }

  if (issues.length && !baseResolver) {
    return { ok: false, issues, issueCount: issues.length };
  }

  const teamBindings = Array.isArray(ledger?.teamBindings)
    ? ledger.teamBindings
    : [];
  const fixtureDecisions = Array.isArray(ledger?.fixtureLineageDecisions)
    ? ledger.fixtureLineageDecisions
    : [];

  const byGlobalClubId = new Map();
  const byIdentityKey = new Map();
  const byAlias = new Map();

  for (const binding of teamBindings) {
    const expectedKey = deriveExtensionTeamIdentityKey(binding);
    const expectedSourceHash = deriveExtensionSourceIdentityHash(binding);
    const expectedGlobalId = deriveExtensionGlobalClubId(binding);
    const expectedBindingId = deriveExtensionBindingDecisionId(binding);
    const globalClubId = clean(binding?.globalClubId);
    const identityKey = clean(binding?.ledgerTeamIdentityKey);
    const bindingId = clean(binding?.bindingDecisionId);

    if (binding?.promotionStatus !== "PROMOTED_SOURCE_BOUND_IDENTITY") {
      issues.push(issue("TEAM_BINDING_NOT_PROMOTED", { bindingId }));
    }
    if (binding?.matchingMode !== "NORMALIZED_EXACT_ONLY") {
      issues.push(issue("TEAM_BINDING_MATCHING_MODE_INVALID", { bindingId }));
    }
    if (binding?.globalClubIdImmutable !== true ||
        binding?.futureAliasChangesMustNotReallocateId !== true) {
      issues.push(issue("TEAM_GLOBAL_ID_IMMUTABILITY_REQUIRED", { bindingId }));
    }
    if (identityKey !== expectedKey ||
        clean(binding?.sourceIdentityHash) !== expectedSourceHash ||
        globalClubId !== expectedGlobalId ||
        bindingId !== expectedBindingId) {
      issues.push(issue("TEAM_BINDING_DERIVATION_MISMATCH", { bindingId }));
    }
    if (!globalClubId || byGlobalClubId.has(globalClubId)) {
      issues.push(issue("EXTENSION_GLOBAL_CLUB_ID_COLLISION", { globalClubId }));
    } else {
      byGlobalClubId.set(globalClubId, binding);
    }
    if (!identityKey || byIdentityKey.has(identityKey)) {
      issues.push(issue("EXTENSION_IDENTITY_KEY_COLLISION", { identityKey }));
    } else {
      byIdentityKey.set(identityKey, binding);
    }
    if (baseTeamResolution(baseResolver, "globalClubId", globalClubId)) {
      issues.push(issue("EXTENSION_GLOBAL_ID_COLLIDES_WITH_BASE", { globalClubId }));
    }

    const aliases = [
      binding?.preferredDisplayName,
      ...(binding?.genesisAliases || []),
    ].map(clean).filter(Boolean);
    if (!aliases.length || !normalizedLeagueSlugs(binding).length) {
      issues.push(issue("TEAM_BINDING_IDENTITY_SURFACE_REQUIRED", { bindingId }));
    }
    for (const alias of aliases) {
      const normalized = normalizeGenesisAlias(alias);
      const prior = byAlias.get(normalized);
      if (prior && prior.globalClubId !== globalClubId) {
        issues.push(issue("EXTENSION_NORMALIZED_ALIAS_COLLISION", {
          normalized,
          left: prior.globalClubId,
          right: globalClubId,
        }));
      } else {
        byAlias.set(normalized, binding);
      }

      const base = baseTeamResolution(
        baseResolver,
        "alias",
        alias,
        normalizedLeagueSlugs(binding)[0]
      );
      if (base && base.globalClubId !== globalClubId) {
        issues.push(issue("EXTENSION_ALIAS_COLLIDES_WITH_BASE", {
          alias,
          baseGlobalClubId: base.globalClubId,
          extensionGlobalClubId: globalClubId,
        }));
      }
    }
  }

  function unionResolveAlias(alias, leagueSlug) {
    const base = baseTeamResolution(baseResolver, "alias", alias, leagueSlug);
    if (base) return base.globalClubId;
    return byAlias.get(normalizeGenesisAlias(alias))?.globalClubId || null;
  }

  function unionHasGlobalId(globalClubId) {
    return Boolean(
      byGlobalClubId.has(globalClubId) ||
      baseTeamResolution(baseResolver, "globalClubId", globalClubId)
    );
  }

  const fixtureDecisionByDecisionId = new Map(
    fixtureDecisions
      .map(row => [clean(row?.fixtureRetentionDecisionId), row])
      .filter(([id]) => Boolean(id))
  );

  function hasPreExistingExtensionFixtureEvidence(globalClubId, currentDecisionId) {
    const binding = byGlobalClubId.get(clean(globalClubId));
    if (!binding) return false;
    const refs = Array.isArray(binding?.sourceFixtureDecisionIds)
      ? binding.sourceFixtureDecisionIds.map(clean).filter(Boolean)
      : [];
    return refs.some(refId => {
      if (refId === clean(currentDecisionId)) return false;
      const sourceDecision = fixtureDecisionByDecisionId.get(refId);
      if (!sourceDecision) return false;
      return [
        clean(sourceDecision?.homeGlobalClubId),
        clean(sourceDecision?.awayGlobalClubId),
      ].includes(clean(globalClubId));
    });
  }

  const retained = new Set();
  const suppressed = new Set();
  const fixtureDecisionIds = new Set();

  for (const decision of fixtureDecisions) {
    const decisionId = clean(decision?.fixtureRetentionDecisionId);
    const expectedDecisionId = deriveExtensionFixtureDecisionId(decision);
    const retainedId = clean(decision?.retainedRepositoryFixtureId);
    const suppressedIds = [...new Set(
      (decision?.suppressedRepositoryFixtureIds || [])
        .map(clean)
        .filter(Boolean)
    )];
    const sourceFixtures = Array.isArray(decision?.sourceFixtures)
      ? decision.sourceFixtures
      : [];

    if (decisionId !== expectedDecisionId || fixtureDecisionIds.has(decisionId)) {
      issues.push(issue("FIXTURE_DECISION_ID_INVALID", { decisionId }));
    }
    fixtureDecisionIds.add(decisionId);

    if (!retainedId || retained.has(retainedId) || suppressed.has(retainedId)) {
      issues.push(issue("RETAINED_FIXTURE_ID_COLLISION", { retainedId }));
    }
    retained.add(retainedId);
    if (suppressedIds.length !== 1) {
      issues.push(issue("EXTENSION_FIXTURE_REQUIRES_ONE_SUPPRESSED_ALIAS", { decisionId }));
    }
    for (const id of suppressedIds) {
      if (!id || id === retainedId || retained.has(id) || suppressed.has(id)) {
        issues.push(issue("SUPPRESSED_FIXTURE_ID_COLLISION", { id, decisionId }));
      }
      suppressed.add(id);
    }

    for (const id of [retainedId, ...suppressedIds]) {
      const base = baseResolver.resolveFixtureId(id);
      if (base?.ok || base?.status !== "UNKNOWN_FIXTURE_ID") {
        issues.push(issue("EXTENSION_FIXTURE_COLLIDES_WITH_BASE", {
          id,
          baseStatus: base?.status || null,
        }));
      }
    }

    if (sourceFixtures.length !== 2) {
      issues.push(issue("TWO_PROVIDER_SOURCE_FIXTURES_REQUIRED", { decisionId }));
      continue;
    }
    const providerSet = new Set(sourceFixtures.map(row => clean(row?.provider).toLowerCase()));
    if (providerSet.size !== 2 || providerSet.has("")) {
      issues.push(issue("DISTINCT_SOURCE_PROVIDERS_REQUIRED", { decisionId }));
    }
    if (kickoffDeltaMs(sourceFixtures) === null || kickoffDeltaMs(sourceFixtures) > 60_000) {
      issues.push(issue("SOURCE_FIXTURE_KICKOFF_MISMATCH", { decisionId }));
    }

    const expectedIds = new Set([retainedId, ...suppressedIds]);
    for (const row of sourceFixtures) {
      if (clean(row?.dayKey) !== clean(decision?.dayKey) ||
          clean(row?.leagueSlug) !== clean(decision?.leagueSlug) ||
          !clean(row?.providerMatchId) ||
          !expectedIds.has(clean(row?.repositoryFixtureId))) {
        issues.push(issue("SOURCE_FIXTURE_BINDING_INVALID", {
          decisionId,
          repositoryFixtureId: clean(row?.repositoryFixtureId),
        }));
      }
      const homeId = unionResolveAlias(row?.homeTeam, decision?.leagueSlug);
      const awayId = unionResolveAlias(row?.awayTeam, decision?.leagueSlug);
      if (homeId !== clean(decision?.homeGlobalClubId) ||
          awayId !== clean(decision?.awayGlobalClubId)) {
        issues.push(issue("SOURCE_FIXTURE_TEAM_IDENTITY_MISMATCH", {
          decisionId,
          repositoryFixtureId: clean(row?.repositoryFixtureId),
          homeId,
          awayId,
        }));
      }
    }

    if (!unionHasGlobalId(clean(decision?.homeGlobalClubId)) ||
        !unionHasGlobalId(clean(decision?.awayGlobalClubId)) ||
        clean(decision?.homeGlobalClubId) === clean(decision?.awayGlobalClubId)) {
      issues.push(issue("FIXTURE_GLOBAL_TEAM_IDS_INVALID", { decisionId }));
    }

    const basis = clean(decision?.promotionBasis);
    const allowedBasis = new Set([
      "TWO_PROVIDER_EXISTING_PRODUCTION_IDENTITIES",
      "TWO_PROVIDER_EXISTING_VALIDATED_EXTENSION_IDENTITIES",
      "TWO_PROVIDER_EXACT_COUNTERPART_WITH_STABLE_SIDE",
      "TWO_PROVIDER_PLUS_INDEPENDENT_FIXTURE_CONFIRMATION",
    ]);
    if (!allowedBasis.has(basis)) {
      issues.push(issue("FIXTURE_PROMOTION_BASIS_INVALID", { decisionId, basis }));
    }

    const [leftSource, rightSource] = sourceFixtures;
    const literalHomeStable = leftSource && rightSource &&
      normalizeGenesisAlias(leftSource.homeTeam) ===
        normalizeGenesisAlias(rightSource.homeTeam);
    const literalAwayStable = leftSource && rightSource &&
      normalizeGenesisAlias(leftSource.awayTeam) ===
        normalizeGenesisAlias(rightSource.awayTeam);
    const leftBaseHome = leftSource
      ? baseTeamResolution(
          baseResolver,
          "alias",
          leftSource.homeTeam,
          decision?.leagueSlug
        )
      : null;
    const rightBaseHome = rightSource
      ? baseTeamResolution(
          baseResolver,
          "alias",
          rightSource.homeTeam,
          decision?.leagueSlug
        )
      : null;
    const leftBaseAway = leftSource
      ? baseTeamResolution(
          baseResolver,
          "alias",
          leftSource.awayTeam,
          decision?.leagueSlug
        )
      : null;
    const rightBaseAway = rightSource
      ? baseTeamResolution(
          baseResolver,
          "alias",
          rightSource.awayTeam,
          decision?.leagueSlug
        )
      : null;
    const baseHomeStable = Boolean(
      leftBaseHome &&
      rightBaseHome &&
      leftBaseHome.globalClubId === rightBaseHome.globalClubId
    );
    const baseAwayStable = Boolean(
      leftBaseAway &&
      rightBaseAway &&
      leftBaseAway.globalClubId === rightBaseAway.globalClubId
    );
    const leftUnionHome = leftSource
      ? unionResolveAlias(leftSource.homeTeam, decision?.leagueSlug)
      : null;
    const rightUnionHome = rightSource
      ? unionResolveAlias(rightSource.homeTeam, decision?.leagueSlug)
      : null;
    const leftUnionAway = leftSource
      ? unionResolveAlias(leftSource.awayTeam, decision?.leagueSlug)
      : null;
    const rightUnionAway = rightSource
      ? unionResolveAlias(rightSource.awayTeam, decision?.leagueSlug)
      : null;
    const unionHomeStable = Boolean(
      leftUnionHome &&
      rightUnionHome &&
      leftUnionHome === rightUnionHome
    );
    const unionAwayStable = Boolean(
      leftUnionAway &&
      rightUnionAway &&
      leftUnionAway === rightUnionAway
    );
    const preExistingExtensionHome = hasPreExistingExtensionFixtureEvidence(
      decision?.homeGlobalClubId,
      decisionId,
    );
    const preExistingExtensionAway = hasPreExistingExtensionFixtureEvidence(
      decision?.awayGlobalClubId,
      decisionId,
    );

    if (
      basis === "TWO_PROVIDER_EXISTING_PRODUCTION_IDENTITIES" &&
      !(baseHomeStable && baseAwayStable)
    ) {
      issues.push(issue("EXISTING_IDENTITY_PROMOTION_BASIS_NOT_PROVEN", { decisionId }));
    }
    if (
      basis === "TWO_PROVIDER_EXISTING_VALIDATED_EXTENSION_IDENTITIES" &&
      !(
        unionHomeStable &&
        unionAwayStable &&
        preExistingExtensionHome &&
        preExistingExtensionAway
      )
    ) {
      issues.push(issue(
        "EXISTING_EXTENSION_IDENTITY_PROMOTION_BASIS_NOT_PROVEN",
        { decisionId },
      ));
    }
    if (
      basis === "TWO_PROVIDER_EXACT_COUNTERPART_WITH_STABLE_SIDE" &&
      !(literalHomeStable || literalAwayStable || baseHomeStable || baseAwayStable)
    ) {
      issues.push(issue("STABLE_SIDE_PROMOTION_BASIS_NOT_PROVEN", { decisionId }));
    }
    if (basis === "TWO_PROVIDER_PLUS_INDEPENDENT_FIXTURE_CONFIRMATION") {
      const confirmations = Array.isArray(decision?.independentConfirmations)
        ? decision.independentConfirmations
        : [];
      const confirmationContract = clean(decision?.independentConfirmationContract);
      let confirmed = false;
      if (confirmationContract === "api_football_exact_bridge_v1") {
        const candidateForConfirmation = {
          recoveryStatus: "PENDING_INDEPENDENT_CONFIRMATION",
          requiresIndependentConfirmation: true,
          promotionAuthorized: false,
          dayKey: clean(decision?.dayKey),
          leagueSlug: clean(decision?.leagueSlug),
          kickoffUtc: clean(sourceFixtures[0]?.kickoffUtc),
          left: {
            source: clean(sourceFixtures[0]?.provider),
            canonicalId: clean(sourceFixtures[0]?.repositoryFixtureId),
            kickoffUtc: clean(sourceFixtures[0]?.kickoffUtc),
            homeTeam: clean(sourceFixtures[0]?.homeTeam),
            awayTeam: clean(sourceFixtures[0]?.awayTeam),
          },
          right: {
            source: clean(sourceFixtures[1]?.provider),
            canonicalId: clean(sourceFixtures[1]?.repositoryFixtureId),
            kickoffUtc: clean(sourceFixtures[1]?.kickoffUtc),
            homeTeam: clean(sourceFixtures[1]?.homeTeam),
            awayTeam: clean(sourceFixtures[1]?.awayTeam),
          },
        };
        confirmed = confirmations.length === 1 &&
          validateIndependentFixtureConfirmation(
            candidateForConfirmation,
            confirmations[0],
          ).ok;
      } else if (!confirmationContract) {
        // Backward compatibility for the one immutable, manually reviewed
        // independent confirmation that predates the autonomous confirmer.
        // The promoter below always writes an explicit contract for new rows,
        // so this branch cannot authorize a new autonomous promotion.
        confirmed = confirmations.length === 1 &&
          /^https:\/\//u.test(clean(confirmations[0]?.url)) &&
          clean(confirmations[0]?.source) === "sofascore";
      }
      if (!confirmed) {
        issues.push(issue("INDEPENDENT_FIXTURE_CONFIRMATION_REQUIRED", { decisionId }));
      }
    }
  }

  for (const binding of teamBindings) {
    const refs = Array.isArray(binding?.sourceFixtureDecisionIds)
      ? binding.sourceFixtureDecisionIds
      : [];
    if (!refs.length || refs.some(id => !fixtureDecisionIds.has(clean(id)))) {
      issues.push(issue("TEAM_BINDING_SOURCE_DECISION_REFERENCE_INVALID", {
        bindingId: clean(binding?.bindingDecisionId),
      }));
    }
  }

  if (Number(ledger?.summary?.promotedTeamBindings) !== teamBindings.length ||
      Number(ledger?.summary?.fixtureLineageDecisions) !== fixtureDecisions.length ||
      Number(ledger?.summary?.suppressedFixtureAliases) !== suppressed.size) {
    issues.push(issue("EXTENSION_SUMMARY_COUNT_MISMATCH"));
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0
      ? "PASS_PRODUCTION_IDENTITY_EXTENSION"
      : "FAIL_PRODUCTION_IDENTITY_EXTENSION",
    counts: {
      promotedTeamBindings: teamBindings.length,
      fixtureLineageDecisions: fixtureDecisions.length,
      suppressedFixtureAliases: suppressed.size,
    },
    issueCount: issues.length,
    issues,
  };
}

export function buildExtendedProductionIdentityResolver({
  baseResolver,
  ledger,
} = {}) {
  const validation = validateProductionIdentityExtension({ ledger, baseResolver });
  if (!validation.ok) {
    const error = new Error("production_identity_extension_invalid");
    error.validation = validation;
    throw error;
  }

  const teamBindings = ledger.teamBindings;

  const teamByGlobalId = new Map();
  const teamByIdentityKey = new Map();
  const teamByAlias = new Map();
  for (const binding of ledger.teamBindings) {
    teamByGlobalId.set(binding.globalClubId, binding);
    teamByIdentityKey.set(binding.ledgerTeamIdentityKey, binding);
    for (const alias of [binding.preferredDisplayName, ...(binding.genesisAliases || [])]) {
      teamByAlias.set(normalizeGenesisAlias(alias), binding);
    }
  }

  const retainedById = new Map();
  const suppressedToRetained = new Map();
  const fixtureDecisionById = new Map();
  for (const decision of ledger.fixtureLineageDecisions) {
    retainedById.set(decision.retainedRepositoryFixtureId, decision);
    fixtureDecisionById.set(decision.retainedRepositoryFixtureId, decision);
    for (const id of decision.suppressedRepositoryFixtureIds || []) {
      suppressedToRetained.set(id, decision.retainedRepositoryFixtureId);
      fixtureDecisionById.set(id, decision);
    }
  }

  function resolveExtensionBindingSignal(field, value) {
    const text = clean(value);
    if (!text) return null;
    if (field === "globalClubId") return teamByGlobalId.get(text) || null;
    if (field === "ledgerTeamIdentityKey") return teamByIdentityKey.get(text) || null;
    if (field === "alias") return teamByAlias.get(normalizeGenesisAlias(text)) || null;
    return null;
  }

  function resolveTeamReference(reference = {}) {
    const resolvedSignals = [];
    for (const field of ["globalClubId", "ledgerTeamIdentityKey", "alias"]) {
      const value = clean(reference?.[field]);
      if (!value) continue;

      const base = baseResolver.resolveTeamReference({
        [field]: value,
        ...(reference?.leagueSlug ? { leagueSlug: reference.leagueSlug } : {}),
      });
      if (base?.ok) {
        resolvedSignals.push({ field, globalClubId: base.globalClubId, base });
        continue;
      }

      const binding = resolveExtensionBindingSignal(field, value);
      if (!binding) {
        return {
          ...base,
          ok: false,
          productionMutationAuthorized: false,
        };
      }
      resolvedSignals.push({ field, globalClubId: binding.globalClubId, binding });
    }

    if (!resolvedSignals.length) {
      return baseResolver.resolveTeamReference(reference);
    }
    const ids = new Set(resolvedSignals.map(item => item.globalClubId));
    if (ids.size !== 1) {
      return {
        ok: false,
        status: "CONFLICTING_IDENTITY_SIGNALS",
        signals: resolvedSignals.map(item => ({
          signal: item.field,
          globalClubId: item.globalClubId,
        })),
        productionMutationAuthorized: false,
      };
    }

    const extensionSignal = resolvedSignals.find(item => item.binding);
    if (!extensionSignal) {
      return baseResolver.resolveTeamReference(reference);
    }
    const binding = extensionSignal.binding;
    const requestedLeagueSlug = clean(reference?.leagueSlug);
    return {
      ok: true,
      status: "RESOLVED_EXACT_EXTENSION_IDENTITY",
      globalClubId: binding.globalClubId,
      ledgerTeamIdentityKey: binding.ledgerTeamIdentityKey,
      preferredDisplayName: binding.preferredDisplayName,
      leagueSlugs: [...binding.leagueSlugs],
      requestedLeagueSlug: requestedLeagueSlug || null,
      requestedLeagueObservedInGenesis: requestedLeagueSlug
        ? binding.leagueSlugs.includes(requestedLeagueSlug)
        : null,
      matchedSignals: resolvedSignals.map(item => item.field).sort(),
      fuzzyMatchingAttempted: false,
      productionMutationAuthorized: false,
    };
  }

  function resolveFixtureId(repositoryFixtureId) {
    const id = clean(repositoryFixtureId);
    const base = baseResolver.resolveFixtureId(id);
    if (base?.ok || base?.status !== "UNKNOWN_FIXTURE_ID") return base;

    const retainedDecision = retainedById.get(id);
    const target = suppressedToRetained.get(id);
    const decision = retainedDecision || fixtureDecisionById.get(id);
    if (!decision) return base;

    const resolvedFixtureId = target || id;
    return {
      ok: true,
      status: target
        ? "SUPPRESSED_FIXTURE_EXTENSION_ALIAS_RESOLVED"
        : "RETAINED_FIXTURE_EXTENSION_IDEMPOTENT",
      sourceFixtureId: id,
      resolvedFixtureId,
      sourceRole: target ? "suppressed_lineage_alias" : "retained",
      fixtureRetentionDecisionId: decision.fixtureRetentionDecisionId,
      dayKey: decision.dayKey,
      leagueSlug: decision.leagueSlug,
      homeGlobalClubId: decision.homeGlobalClubId,
      awayGlobalClubId: decision.awayGlobalClubId,
      deletionAuthorized: false,
      historyRewriteAuthorized: false,
      productionMutationAuthorized: false,
    };
  }

  function resolveFixtureMembership({ repositoryFixtureId, canonicalFixtureIds } = {}) {
    if (!Array.isArray(canonicalFixtureIds) && !(canonicalFixtureIds instanceof Set)) {
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
    const resolution = resolveFixtureId(repositoryFixtureId);
    if (!resolution?.ok) return { ...resolution, fixtureMembershipCreated: false };
    if (!universe.has(resolution.resolvedFixtureId)) {
      return {
        ok: false,
        status: "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
        sourceFixtureId: resolution.sourceFixtureId,
        resolvedFixtureId: resolution.resolvedFixtureId,
        sourceRole: resolution.sourceRole,
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }
    return {
      ok: true,
      status: "FIXTURE_MEMBERSHIP_RESOLVED_WITHOUT_CREATION",
      sourceFixtureId: resolution.sourceFixtureId,
      resolvedFixtureId: resolution.resolvedFixtureId,
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
    const membership = resolveFixtureMembership({ repositoryFixtureId, canonicalFixtureIds });
    if (!membership.ok) {
      return { ...membership, productionMutationAuthorized: false };
    }
    const home = resolveTeamReference(homeReference);
    const away = resolveTeamReference(awayReference);
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
        fixtureMembershipCreated: false,
        productionMutationAuthorized: false,
      };
    }
    return {
      ok: true,
      status: "ADDITIVE_IDENTITY_OVERLAY_RESOLVED",
      sourceFixtureId: membership.sourceFixtureId,
      resolvedFixtureId: membership.resolvedFixtureId,
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

  const managedIds = new Set([
    ...baseResolver.listManagedFixtureIds(),
    ...retainedById.keys(),
    ...suppressedToRetained.keys(),
  ]);

  return Object.freeze({
    schema: "ai-matchlab.production-identity-resolver.extended.v1",
    counts: baseResolver.counts,
    effectiveCounts: Object.freeze({
      identityBindings: baseResolver.counts.identityBindings + teamBindings.length,
      retainedFixtureIds: baseResolver.counts.retainedFixtureIds + retainedById.size,
      suppressedFixtureAliases:
        baseResolver.counts.suppressedFixtureAliases + suppressedToRetained.size,
      sourceFixtureIds: baseResolver.counts.sourceFixtureIds + retainedById.size + suppressedToRetained.size,
    }),
    extension: Object.freeze({
      version: ledger.extensionVersion,
      validationStatus: validation.status,
      counts: Object.freeze(validation.counts),
    }),
    resolveTeamReference,
    resolveFixtureId,
    resolveFixtureMembership,
    buildFixtureIdentityOverlay,
    isManagedFixtureId: id => managedIds.has(clean(id)),
    listManagedFixtureIds: () => [...managedIds].sort(),
    authorization: baseResolver.authorization,
  });
}
