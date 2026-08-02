import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProductionIdentityResolver,
  loadJsonBomSafe,
  validateResolverFoundation,
} from "./production-identity-resolver.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function required(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required`);
  return value;
}

function loadAll() {
  const contract = loadJsonBomSafe(
    process.env.AIML_P0C_RESOLVER_CONTRACT ||
      path.join(
        root,
        "data/identity-decisions/production-identity-resolver-contract.v1.json",
      ),
  );
  const registry = loadJsonBomSafe(
    process.env.AIML_P0C_REGISTRY ||
      path.join(
        root,
        "data/identity-decisions/production-global-club-id-registry.v1.json",
      ),
  );
  const retentionLedger = loadJsonBomSafe(
    process.env.AIML_P0C_RETENTION ||
      path.join(
        root,
        "data/identity-decisions/fixture-retention-decision-ledger.v1.json",
      ),
  );
  const sourceLedger = loadJsonBomSafe(
    process.env.AIML_P0C_SOURCE_LEDGER ||
      path.join(
        root,
        "data/identity-decisions/semantic-duplicate-decision-ledger.v1.json",
      ),
  );
  const classificationAudit = loadJsonBomSafe(
    required("AIML_P0C_CLASSIFICATION_AUDIT"),
  );
  const phaseContract = loadJsonBomSafe(
    required("AIML_P0C_PHASE_CONTRACT"),
  );
  return {
    contract,
    registry,
    retentionLedger,
    sourceLedger,
    classificationAudit,
    phaseContract,
  };
}

function resolver() {
  return buildProductionIdentityResolver(loadAll());
}

test("resolver foundation validates the exact source-bound artifacts", () => {
  const validation = validateResolverFoundation(loadAll());
  assert.equal(validation.ok, true);
  assert.equal(
    validation.status,
    "PASS_RESOLVER_FOUNDATION_APPLICATION_FORBIDDEN",
  );
  assert.equal(validation.issueCount, 0);
});

test("all 70 globalClubIds resolve exactly", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  for (const binding of data.registry.bindings) {
    const result = value.resolveTeamReference({
      globalClubId: binding.globalClubId,
    });
    assert.equal(result.ok, true);
    assert.equal(result.globalClubId, binding.globalClubId);
  }
});

test("all 70 ledger identity keys resolve to the same permanent IDs", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  for (const binding of data.registry.bindings) {
    const result = value.resolveTeamReference({
      ledgerTeamIdentityKey:
        binding.ledgerTeamIdentityKey,
    });
    assert.equal(result.ok, true);
    assert.equal(result.globalClubId, binding.globalClubId);
  }
});

test("all genesis aliases use normalized exact matching only", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  for (const binding of data.registry.bindings) {
    for (const alias of [
      binding.preferredDisplayName,
      ...(binding.genesisAliases || []),
    ]) {
      const result = value.resolveTeamReference({ alias });
      assert.equal(result.ok, true);
      assert.equal(result.globalClubId, binding.globalClubId);
      assert.equal(result.fuzzyMatchingAttempted, false);
    }
  }
});

test("unknown and fuzzy-like aliases fail closed", () => {
  const value = resolver();
  const unknown = value.resolveTeamReference({
    alias: "Definitely Not A Registered Club",
  });
  assert.equal(unknown.ok, false);
  assert.equal(
    unknown.status,
    "NORMALIZED_EXACT_ALIAS_NOT_FOUND",
  );
  assert.equal(unknown.fuzzyMatchingAttempted, false);
});

test("conflicting exact identity signals fail closed", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  const first = data.registry.bindings[0];
  const second = data.registry.bindings[1];
  const result = value.resolveTeamReference({
    globalClubId: first.globalClubId,
    ledgerTeamIdentityKey:
      second.ledgerTeamIdentityKey,
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.status,
    "CONFLICTING_IDENTITY_SIGNALS",
  );
});

test("all 53 retained fixture IDs resolve idempotently", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  for (const decision of data.retentionLedger.decisions) {
    const result = value.resolveFixtureId(
      decision.retainedRepositoryFixtureId,
    );
    assert.equal(result.ok, true);
    assert.equal(
      result.status,
      "RETAINED_FIXTURE_IDEMPOTENT",
    );
    assert.equal(
      result.resolvedFixtureId,
      decision.retainedRepositoryFixtureId,
    );
  }
});

test("all 53 suppressed IDs resolve one-way to retained lineage IDs", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  for (const decision of data.retentionLedger.decisions) {
    for (const suppressed of
      decision.suppressedRepositoryFixtureIds) {
      const result = value.resolveFixtureId(suppressed);
      assert.equal(result.ok, true);
      assert.equal(
        result.status,
        "SUPPRESSED_FIXTURE_LINEAGE_ALIAS_RESOLVED",
      );
      assert.equal(
        result.resolvedFixtureId,
        decision.retainedRepositoryFixtureId,
      );
      assert.equal(result.deletionAuthorized, false);
    }
  }
});

test("fixture aliases have no chains or cycles", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  for (const decision of data.retentionLedger.decisions) {
    const suppressed =
      decision.suppressedRepositoryFixtureIds[0];
    const first = value.resolveFixtureId(suppressed);
    const second = value.resolveFixtureId(
      first.resolvedFixtureId,
    );
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(
      second.status,
      "RETAINED_FIXTURE_IDEMPOTENT",
    );
    assert.equal(
      second.resolvedFixtureId,
      first.resolvedFixtureId,
    );
  }
});

test("fixture membership requires an explicit canonical universe", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  const result = value.resolveFixtureMembership({
    repositoryFixtureId:
      data.retentionLedger.decisions[0]
        .retainedRepositoryFixtureId,
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.status,
    "CANONICAL_FIXTURE_UNIVERSE_REQUIRED",
  );
  assert.equal(result.fixtureMembershipCreated, false);
});

test("suppressed IDs resolve membership only when retained target already exists", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  const decision = data.retentionLedger.decisions[0];
  const suppressed =
    decision.suppressedRepositoryFixtureIds[0];

  const missing = value.resolveFixtureMembership({
    repositoryFixtureId: suppressed,
    canonicalFixtureIds: [],
  });
  assert.equal(missing.ok, false);
  assert.equal(
    missing.status,
    "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
  );

  const present = value.resolveFixtureMembership({
    repositoryFixtureId: suppressed,
    canonicalFixtureIds: [
      decision.retainedRepositoryFixtureId,
    ],
  });
  assert.equal(present.ok, true);
  assert.equal(
    present.status,
    "FIXTURE_MEMBERSHIP_RESOLVED_WITHOUT_CREATION",
  );
  assert.equal(present.fixtureMembershipCreated, false);
});

test("identity overlay is additive and cannot alter score or status truth", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  const decision = data.retentionLedger.decisions[0];

  const result = value.buildFixtureIdentityOverlay({
    repositoryFixtureId:
      decision.suppressedRepositoryFixtureIds[0],
    canonicalFixtureIds: [
      decision.retainedRepositoryFixtureId,
    ],
    homeReference: {
      globalClubId: decision.homeGlobalClubId,
    },
    awayReference: {
      globalClubId: decision.awayGlobalClubId,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.overlayOnly, true);
  assert.equal(result.scoreTruthChanged, false);
  assert.equal(result.statusTruthChanged, false);
  assert.equal(result.fixtureMembershipCreated, false);
  assert.equal(
    result.resolvedFixtureId,
    decision.retainedRepositoryFixtureId,
  );
});

test("home and away cannot resolve to the same global club ID", () => {
  const data = loadAll();
  const value = buildProductionIdentityResolver(data);
  const decision = data.retentionLedger.decisions[0];

  const result = value.buildFixtureIdentityOverlay({
    repositoryFixtureId:
      decision.retainedRepositoryFixtureId,
    canonicalFixtureIds: [
      decision.retainedRepositoryFixtureId,
    ],
    homeReference: {
      globalClubId: decision.homeGlobalClubId,
    },
    awayReference: {
      globalClubId: decision.homeGlobalClubId,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(
    result.status,
    "HOME_AWAY_GLOBAL_ID_COLLISION",
  );
});

test("contract tampering is rejected", () => {
  const data = loadAll();
  data.contract.requiredCoverage.identityBindings = 69;
  const validation = validateResolverFoundation(data);
  assert.equal(validation.ok, false);
  assert.ok(
    validation.issues.some(
      item =>
        item.code ===
        "RESOLVER_CONTRACT_HASH_INVALID",
    ),
  );
});

test("resolver exposes no mutation or integration authorization", () => {
  const value = resolver();
  assert.deepEqual(value.authorization, {
    productionDataApplicationAuthorized: false,
    repositoryRepairAuthorized: false,
    fixtureRetentionApplicationAuthorized: false,
    fixtureDeletionAuthorized: false,
    historyRewriteAuthorized: false,
    consumerIntegrationAuthorized: false,
    writePlanGenerated: false,
  });
});
