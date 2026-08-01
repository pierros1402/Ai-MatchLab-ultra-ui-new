import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveGenesisGlobalClubId,
  loadJson,
  sha256Canonical,
  validateFinalizedIdentityRetention,
} from "./production-identity-retention-decisions.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const registryPath = path.join(
  root,
  "data/identity-decisions/production-global-club-id-registry.v1.json",
);
const retentionPath = path.join(
  root,
  "data/identity-decisions/fixture-retention-decision-ledger.v1.json",
);
const sourceLedgerPath = path.join(
  root,
  "data/identity-decisions/semantic-duplicate-decision-ledger.v1.json",
);

function loadAll() {
  return {
    registry: loadJson(registryPath),
    retentionLedger: loadJson(retentionPath),
    sourceLedger: loadJson(sourceLedgerPath),
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rehashObject(value, field) {
  const copy = clone(value);
  delete copy[field];
  value[field] = sha256Canonical(copy);
}

test("finalized production identity and retention decisions validate exactly", () => {
  const report = validateFinalizedIdentityRetention(loadAll());
  assert.equal(report.ok, true);
  assert.equal(report.issueCount, 0);
  assert.deepEqual(report.summary, {
    identityBindingsFinalized: 70,
    uniqueGlobalClubIds: 70,
    retentionDecisionsFinalized: 53,
    sourceFixtureIdsCovered: 106,
    truthDominantDecisions: 7,
    lineageDominantDecisions: 46,
    retainedClaimA: 50,
    retainedClaimB: 3,
    productionArtifactsUpdated: 0,
    fixtureRowsDeleted: 0,
  });
});

test("all allocated globalClubIds are unique and match one-time genesis derivation", () => {
  const { registry, sourceLedger } = loadAll();
  const sourceByKey = new Map(
    sourceLedger.teamIdentities.map(team => [
      team.ledgerTeamIdentityKey,
      team,
    ]),
  );
  const ids = new Set();
  for (const binding of registry.bindings) {
    assert.equal(
      binding.globalClubId,
      deriveGenesisGlobalClubId(sourceByKey.get(binding.ledgerTeamIdentityKey)),
    );
    ids.add(binding.globalClubId);
  }
  assert.equal(ids.size, 70);
});

test("future alias changes are forbidden from reallocating the finalized ID", () => {
  const { registry } = loadAll();
  for (const binding of registry.bindings) {
    assert.equal(binding.globalClubIdImmutable, true);
    assert.equal(binding.futureAliasChangesMustNotReallocateId, true);
  }
});

test("duplicate globalClubId is rejected even after recomputing hashes", () => {
  const input = loadAll();
  input.registry = clone(input.registry);
  input.registry.bindings[1].globalClubId =
    input.registry.bindings[0].globalClubId;
  rehashObject(
    input.registry.bindings[1],
    "immutableBindingDecisionHash",
  );
  rehashObject(input.registry, "immutableRegistryHash");
  const report = validateFinalizedIdentityRetention(input);
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some(issue => issue.code === "GLOBAL_CLUB_ID_NOT_UNIQUE"),
  );
});

test("binding tampering is rejected by immutable hashes", () => {
  const input = loadAll();
  input.registry = clone(input.registry);
  input.registry.bindings[0].preferredDisplayName = "Tampered";
  const report = validateFinalizedIdentityRetention(input);
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some(issue => issue.code === "BINDING_HASH_INVALID"),
  );
});

test("authoritative truth remains stronger than repository lineage", () => {
  const input = loadAll();
  input.retentionLedger = clone(input.retentionLedger);
  const decision = input.retentionLedger.decisions.find(
    item =>
      item.selectionPolicy ===
      "AUTHORITATIVE_TRUTH_MATCH_DOMINATES_RETENTION",
  );
  const originalRetained = decision.retainedRepositoryFixtureId;
  decision.retainedRepositoryFixtureId =
    decision.suppressedRepositoryFixtureIds[0];
  decision.suppressedRepositoryFixtureIds = [originalRetained];
  rehashObject(
    decision,
    "immutableFixtureRetentionDecisionHash",
  );
  rehashObject(input.retentionLedger, "immutableLedgerHash");
  const report = validateFinalizedIdentityRetention(input);
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some(issue => issue.code === "TRUTH_RETENTION_INVALID"),
  );
});

test("lineage continuity selection rejects a reference-count tie", () => {
  const input = loadAll();
  input.retentionLedger = clone(input.retentionLedger);
  const decision = input.retentionLedger.decisions.find(
    item =>
      item.selectionPolicy === "UNIQUE_REPOSITORY_LINEAGE_DOMINANCE",
  );
  const rows = decision.selectionEvidence.sourceReferenceCounts;
  rows[1].referenceCount = rows[0].referenceCount;
  rehashObject(
    decision,
    "immutableFixtureRetentionDecisionHash",
  );
  rehashObject(input.retentionLedger, "immutableLedgerHash");
  const report = validateFinalizedIdentityRetention(input);
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some(issue => issue.code === "LINEAGE_RETENTION_INVALID"),
  );
});

test("suppressed fixture deletion authorization is always rejected", () => {
  const input = loadAll();
  input.retentionLedger = clone(input.retentionLedger);
  const decision = input.retentionLedger.decisions[0];
  decision.suppressedFixtureLineageAliases[0].deletionAuthorized = true;
  rehashObject(
    decision.suppressedFixtureLineageAliases[0],
    "immutableAliasDecisionHash",
  );
  rehashObject(
    decision,
    "immutableFixtureRetentionDecisionHash",
  );
  rehashObject(input.retentionLedger, "immutableLedgerHash");
  const report = validateFinalizedIdentityRetention(input);
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some(issue => issue.code === "LINEAGE_ALIAS_INVALID"),
  );
});

test("production application authorization is rejected", () => {
  const input = loadAll();
  input.registry = clone(input.registry);
  input.registry.authorization.productionArtifactRebindingAuthorized = true;
  rehashObject(input.registry, "immutableRegistryHash");
  const report = validateFinalizedIdentityRetention(input);
  assert.equal(report.ok, false);
  assert.ok(
    report.issues.some(issue => issue.code === "AUTHORIZATION_STATE_INVALID"),
  );
});
