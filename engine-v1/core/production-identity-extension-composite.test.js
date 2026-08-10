import assert from "node:assert/strict";
import test from "node:test";

import { resolveDataPath } from "../storage/data-root.js";
import {
  buildProductionIdentityResolverFromCommittedDecisions,
  loadJsonBomSafe,
} from "./production-identity-resolver.js";
import { mergeProductionIdentityExtensionLedgers } from "./production-identity-extension-composite.js";

function loadBaseResolver() {
  const dir = (...parts) => resolveDataPath("identity-decisions", ...parts);
  return buildProductionIdentityResolverFromCommittedDecisions({
    contract: loadJsonBomSafe(dir("production-identity-resolver-contract.v1.json")),
    registry: loadJsonBomSafe(dir("production-global-club-id-registry.v1.json")),
    retentionLedger: loadJsonBomSafe(dir("fixture-retention-decision-ledger.v1.json")),
    sourceLedger: loadJsonBomSafe(dir("semantic-duplicate-decision-ledger.v1.json")),
  });
}

function load(name) {
  return loadJsonBomSafe(resolveDataPath("identity-decisions", name));
}

test("current extension and recovery supplement merge fail closed and validate", () => {
  const result = mergeProductionIdentityExtensionLedgers({
    primary: load("production-identity-extension-ledger.v1.json"),
    supplement: load("production-identity-recovery-supplement.v1.json"),
    baseResolver: loadBaseResolver(),
  });
  assert.equal(result.validation.ok, true);
  assert.ok(result.diagnostics.merged.fixtureLineageDecisions >=
    result.diagnostics.primary.fixtureLineageDecisions);
  assert.ok(result.diagnostics.merged.fixtureLineageDecisions >=
    result.diagnostics.supplement.fixtureLineageDecisions);

  const quilmes = result.ledger.fixtureLineageDecisions.find(
    row => row.fixtureRetentionDecisionId === "p0xfix_65b965c5934e9999d412"
  );
  assert.ok(quilmes);
  assert.equal(
    quilmes.retainedRepositoryFixtureId,
    "cid_arg2_quilmes_gimnasiayesgrimajujuy_20260806"
  );
  assert.deepEqual(
    quilmes.suppressedRepositoryFixtureIds,
    ["cid_arg2_quilmes_gimnasiajujuy_20260806"]
  );
});

test("conflicting duplicate fixture decision fails closed", () => {
  const primary = load("production-identity-extension-ledger.v1.json");
  const supplement = structuredClone(load("production-identity-recovery-supplement.v1.json"));
  const overlap = supplement.fixtureLineageDecisions.find(row =>
    primary.fixtureLineageDecisions.some(
      current => current.fixtureRetentionDecisionId === row.fixtureRetentionDecisionId
    )
  );

  if (!overlap) return;
  overlap.homeGlobalClubId = "gcid_conflict";
  assert.throws(
    () => mergeProductionIdentityExtensionLedgers({
      primary,
      supplement,
      baseResolver: loadBaseResolver(),
    }),
    /production_identity_fixture_decision_conflict/u,
  );
});
