import test from "node:test";
import assert from "node:assert/strict";

import { resolveDataPath } from "../storage/data-root.js";
import {
  buildProductionIdentityResolverFromCommittedDecisions,
  loadJsonBomSafe,
} from "./production-identity-resolver.js";
import {
  buildExtendedProductionIdentityResolver,
  validateProductionIdentityExtension,
} from "./production-identity-extension.js";
import {
  getProductionIdentityResolverRuntime,
  resetProductionIdentityResolverRuntimeForTests,
} from "./production-identity-resolver-runtime.js";
import {
  bindProductionResultIdentity,
} from "./production-result-identity-binding.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadBaseResolver() {
  const dir = (...parts) => resolveDataPath("identity-decisions", ...parts);
  return buildProductionIdentityResolverFromCommittedDecisions({
    contract: loadJsonBomSafe(dir("production-identity-resolver-contract.v1.json")),
    registry: loadJsonBomSafe(dir("production-global-club-id-registry.v1.json")),
    retentionLedger: loadJsonBomSafe(dir("fixture-retention-decision-ledger.v1.json")),
    sourceLedger: loadJsonBomSafe(dir("semantic-duplicate-decision-ledger.v1.json")),
  });
}

function loadLedger() {
  return loadJsonBomSafe(
    resolveDataPath(
      "identity-decisions",
      "production-identity-extension-ledger.v1.json"
    )
  );
}

test("source-bound identity extension validates exactly", () => {
  const validation = validateProductionIdentityExtension({
    ledger: loadLedger(),
    baseResolver: loadBaseResolver(),
  });
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.counts, {
    promotedTeamBindings: 13,
    fixtureLineageDecisions: 12,
    suppressedFixtureAliases: 12,
  });
});

test("extended resolver preserves base counts and exposes effective coverage", () => {
  resetProductionIdentityResolverRuntimeForTests();
  const runtime = getProductionIdentityResolverRuntime();
  assert.deepEqual(runtime.counts, {
    identityBindings: 70,
    retainedFixtureIds: 53,
    suppressedFixtureAliases: 53,
    sourceFixtureIds: 106,
  });
  assert.deepEqual(runtime.effectiveCounts, {
    identityBindings: 83,
    retainedFixtureIds: 65,
    suppressedFixtureAliases: 65,
    sourceFixtureIds: 130,
  });
  assert.equal(runtime.extension.validationStatus, "PASS_PRODUCTION_IDENTITY_EXTENSION");
});

test("new aliases resolve by normalized exact identity only", () => {
  const resolver = buildExtendedProductionIdentityResolver({
    baseResolver: loadBaseResolver(),
    ledger: loadLedger(),
  });
  const pairs = [
    ["ned.1", "G.A. Eagles", "Go Ahead Eagles"],
    ["bel.1", "St. Truiden", "Sint-Truidense"],
    ["bel.1", "Westerlo", "KVC Westerlo"],
    ["bel.1", "Royale Union SG", "Union St.-Gilloise"],
    ["fra.2", "St Etienne", "Saint-Étienne"],
    ["bol.1", "Guabira", "Guabirá"],
    ["bol.1", "Nacional Potosi", "Nacional Potosí"],
    ["aut.1", "Ried", "SV Josko Ried"],
    ["arg.2", "Tristan Suarez", "Tristán Suárez"],
  ];
  for (const [slug, left, right] of pairs) {
    const a = resolver.resolveTeamReference({ alias: left, leagueSlug: slug });
    const b = resolver.resolveTeamReference({ alias: right, leagueSlug: slug });
    assert.equal(a.ok, true, left);
    assert.equal(b.ok, true, right);
    assert.equal(a.globalClubId, b.globalClubId, `${left} ↔ ${right}`);
    assert.equal(a.fuzzyMatchingAttempted, false);
    assert.equal(b.fuzzyMatchingAttempted, false);
  }

  const fuzzy = resolver.resolveTeamReference({
    alias: "Go Ahead Eaglez",
    leagueSlug: "ned.1",
  });
  assert.equal(fuzzy.ok, false);
  assert.equal(fuzzy.status, "NORMALIZED_EXACT_ALIAS_NOT_FOUND");
});

test("all source-bound suppressed fixture IDs resolve one-way to retained lineage", () => {
  const ledger = loadLedger();
  const resolver = buildExtendedProductionIdentityResolver({
    baseResolver: loadBaseResolver(),
    ledger,
  });

  for (const decision of ledger.fixtureLineageDecisions) {
    const retained = resolver.resolveFixtureId(decision.retainedRepositoryFixtureId);
    assert.equal(retained.ok, true);
    assert.equal(retained.sourceRole, "retained");
    assert.equal(retained.resolvedFixtureId, decision.retainedRepositoryFixtureId);

    for (const suppressedId of decision.suppressedRepositoryFixtureIds) {
      const suppressed = resolver.resolveFixtureId(suppressedId);
      assert.equal(suppressed.ok, true);
      assert.equal(suppressed.sourceRole, "suppressed_lineage_alias");
      assert.equal(suppressed.resolvedFixtureId, decision.retainedRepositoryFixtureId);
      assert.equal(suppressed.homeGlobalClubId, decision.homeGlobalClubId);
      assert.equal(suppressed.awayGlobalClubId, decision.awayGlobalClubId);
    }
  }
});

test("suppressed final-result identity binds to retained ID without changing truth", () => {
  const resolver = buildExtendedProductionIdentityResolver({
    baseResolver: loadBaseResolver(),
    ledger: loadLedger(),
  });
  const row = {
    canonicalId: "cid_bol1_academiadelbalompie_guabira_20260808",
    matchId: "cid_bol1_academiadelbalompie_guabira_20260808",
    homeTeam: "Academia del Balompie",
    awayTeam: "Guabira",
    status: "FT",
    scoreHome: 0,
    scoreAway: 1,
  };
  const bound = bindProductionResultIdentity(row, { resolver });
  assert.equal(bound.managed, true);
  assert.equal(
    bound.row.canonicalId,
    "cid_bol1_abb_guabira_20260808"
  );
  assert.equal(bound.row.scoreHome, 0);
  assert.equal(bound.row.scoreAway, 1);
  assert.equal(bound.row.status, "FT");
});

test("extension derivation tampering fails closed", () => {
  const ledger = clone(loadLedger());
  ledger.teamBindings[0].globalClubId = "gcid_000000000000000000000000";
  const validation = validateProductionIdentityExtension({
    ledger,
    baseResolver: loadBaseResolver(),
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(x => x.code === "TEAM_BINDING_DERIVATION_MISMATCH"));
});

test("two-sided new alias promotion requires independent confirmation", () => {
  const ledger = clone(loadLedger());
  const decision = ledger.fixtureLineageDecisions.find(
    x => x.promotionBasis === "TWO_PROVIDER_PLUS_INDEPENDENT_FIXTURE_CONFIRMATION"
  );
  delete decision.independentConfirmations;
  const validation = validateProductionIdentityExtension({
    ledger,
    baseResolver: loadBaseResolver(),
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(
    x => x.code === "INDEPENDENT_FIXTURE_CONFIRMATION_REQUIRED"
  ));
});

test("stable-side promotion label must be proven by source evidence", () => {
  const ledger = clone(loadLedger());
  const decision = ledger.fixtureLineageDecisions.find(
    x => x.leagueSlug === "ned.1"
  );
  decision.sourceFixtures[1].awayTeam = "Unrelated Willem Alias";
  const validation = validateProductionIdentityExtension({
    ledger,
    baseResolver: loadBaseResolver(),
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(
    x => x.code === "STABLE_SIDE_PROMOTION_BASIS_NOT_PROVEN"
  ));
});

test("existing-production promotion label requires both sides in base identity", () => {
  const ledger = clone(loadLedger());
  const decision = ledger.fixtureLineageDecisions.find(
    x => x.leagueSlug === "per.1"
  );
  decision.promotionBasis = "TWO_PROVIDER_EXISTING_PRODUCTION_IDENTITIES";
  decision.sourceFixtures[1].awayTeam = "Unknown ADT Alias";
  const validation = validateProductionIdentityExtension({
    ledger,
    baseResolver: loadBaseResolver(),
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some(
    x => x.code === "EXISTING_IDENTITY_PROMOTION_BASIS_NOT_PROVEN"
  ));
});
