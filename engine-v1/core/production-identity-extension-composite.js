import {
  PRODUCTION_IDENTITY_EXTENSION_SCHEMA,
  validateProductionIdentityExtension,
} from "./production-identity-extension.js";

function clean(value) {
  return String(value ?? "").trim();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, stable(value[key])])
  );
}

function stableJson(value) {
  return JSON.stringify(stable(value));
}

function withoutSourceDecisionRefs(binding) {
  const copy = { ...binding };
  delete copy.sourceFixtureDecisionIds;
  return copy;
}

function assertCompatiblePolicy(primary, supplement) {
  if (stableJson(primary?.promotionPolicy) !== stableJson(supplement?.promotionPolicy)) {
    throw new Error("production_identity_extension_policy_conflict");
  }
}

export function mergeProductionIdentityExtensionLedgers({
  primary,
  supplement,
  baseResolver,
} = {}) {
  if (primary?.schema !== PRODUCTION_IDENTITY_EXTENSION_SCHEMA) {
    throw new Error("production_identity_primary_extension_schema_invalid");
  }
  if (supplement?.schema !== PRODUCTION_IDENTITY_EXTENSION_SCHEMA) {
    throw new Error("production_identity_recovery_supplement_schema_invalid");
  }

  assertCompatiblePolicy(primary, supplement);

  const teamByDecisionId = new Map();
  for (const source of [primary, supplement]) {
    for (const row of Array.isArray(source?.teamBindings) ? source.teamBindings : []) {
      const id = clean(row?.bindingDecisionId);
      if (!id) throw new Error("production_identity_binding_decision_id_required");
      const existing = teamByDecisionId.get(id);
      if (!existing) {
        teamByDecisionId.set(id, structuredClone(row));
        continue;
      }

      if (
        stableJson(withoutSourceDecisionRefs(existing)) !==
        stableJson(withoutSourceDecisionRefs(row))
      ) {
        throw new Error(`production_identity_binding_conflict:${id}`);
      }

      existing.sourceFixtureDecisionIds = [
        ...new Set([
          ...(existing.sourceFixtureDecisionIds || []),
          ...(row.sourceFixtureDecisionIds || []),
        ].map(clean).filter(Boolean)),
      ].sort();
    }
  }

  const fixtureByDecisionId = new Map();
  for (const source of [primary, supplement]) {
    for (const row of Array.isArray(source?.fixtureLineageDecisions)
      ? source.fixtureLineageDecisions
      : []) {
      const id = clean(row?.fixtureRetentionDecisionId);
      if (!id) throw new Error("production_identity_fixture_decision_id_required");
      const existing = fixtureByDecisionId.get(id);
      if (!existing) {
        fixtureByDecisionId.set(id, structuredClone(row));
        continue;
      }
      if (stableJson(existing) !== stableJson(row)) {
        throw new Error(`production_identity_fixture_decision_conflict:${id}`);
      }
    }
  }

  const teamBindings = [...teamByDecisionId.values()]
    .sort((a, b) => clean(a.bindingDecisionId).localeCompare(clean(b.bindingDecisionId)));
  const fixtureLineageDecisions = [...fixtureByDecisionId.values()]
    .sort((a, b) =>
      clean(a.fixtureRetentionDecisionId).localeCompare(
        clean(b.fixtureRetentionDecisionId)
      )
    );

  const suppressedFixtureAliases = fixtureLineageDecisions.reduce(
    (sum, row) =>
      sum +
      (Array.isArray(row?.suppressedRepositoryFixtureIds)
        ? row.suppressedRepositoryFixtureIds.length
        : 0),
    0,
  );

  const merged = {
    schema: PRODUCTION_IDENTITY_EXTENSION_SCHEMA,
    extensionVersion:
      `composite:${clean(primary.extensionVersion)}+${clean(supplement.extensionVersion)}`,
    source: {
      purpose:
        "runtime union of current production extension and immutable recovery supplement",
      primaryExtensionVersion: clean(primary.extensionVersion),
      recoverySupplementVersion: clean(supplement.extensionVersion),
    },
    promotionPolicy: structuredClone(primary.promotionPolicy),
    summary: {
      promotedTeamBindings: teamBindings.length,
      fixtureLineageDecisions: fixtureLineageDecisions.length,
      suppressedFixtureAliases,
    },
    teamBindings,
    fixtureLineageDecisions,
  };

  const validation = validateProductionIdentityExtension({
    ledger: merged,
    baseResolver,
  });
  if (!validation.ok) {
    const error = new Error("production_identity_composite_extension_invalid");
    error.validation = validation;
    throw error;
  }

  return Object.freeze({
    ledger: Object.freeze(merged),
    validation: Object.freeze(validation),
    diagnostics: Object.freeze({
      primary: Object.freeze({
        teamBindings: primary.teamBindings?.length || 0,
        fixtureLineageDecisions: primary.fixtureLineageDecisions?.length || 0,
      }),
      supplement: Object.freeze({
        teamBindings: supplement.teamBindings?.length || 0,
        fixtureLineageDecisions: supplement.fixtureLineageDecisions?.length || 0,
      }),
      merged: Object.freeze({
        teamBindings: teamBindings.length,
        fixtureLineageDecisions: fixtureLineageDecisions.length,
        suppressedFixtureAliases,
      }),
    }),
  });
}
