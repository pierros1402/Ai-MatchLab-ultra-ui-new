import test from "node:test";
import assert from "node:assert/strict";

import {
  P0C_P4_FAMILY_ADAPTER_CONTRACT_SCHEMA,
  P0C_P4_FAMILY_ADAPTER_DISCOVERY_BINDING,
  buildP0CP4FamilyRunnerRegistry,
  getP0CP4FamilyAdapterContract,
  validateP0CP4FamilyAdapterInventory,
  validateP0CP4ProducerEvidence,
} from "./p0c-p4-family-adapter-contract.js";

const FAMILY_COUNTS = Object.freeze({
  DEPLOY_SNAPSHOT_DETAILS: 628,
  DEPLOY_SNAPSHOT_FIXTURES: 61,
  DEPLOY_SNAPSHOT_FIXTURES_ALL: 40,
  DEPLOY_SNAPSHOT_MANIFEST: 15,
  DEPLOY_SNAPSHOT_ODDS: 34,
  DEPLOY_SNAPSHOT_VALUE: 12,
  DEPLOY_SNAPSHOT_VALUE_AUDIT: 10,
  EXPECTED_MATCH_VIEW: 25,
  H2H_INDEX: 425,
  LEGACY_FIXTURES_AGGREGATE: 1,
  VALUE_AUDIT_ARTIFACT: 10,
  VALUE_COMPARISON: 3,
  VALUE_PLAN_ARTIFACT: 27,
});

const PATH_FACTORIES = Object.freeze({
  DEPLOY_SNAPSHOT_DETAILS:
    index =>
      `data/deploy-snapshots/2026-05-02/details/id-${index}.json`,
  DEPLOY_SNAPSHOT_FIXTURES:
    index =>
      `data/deploy-snapshots/2026-05-${String(index + 1).padStart(2, "0")}/fixtures.json`,
  DEPLOY_SNAPSHOT_FIXTURES_ALL:
    index =>
      `data/deploy-snapshots/2026-06-${String(index + 1).padStart(2, "0")}/fixtures-all.json`,
  DEPLOY_SNAPSHOT_MANIFEST:
    index =>
      `data/deploy-snapshots/2026-07-${String(index + 1).padStart(2, "0")}/manifest.json`,
  DEPLOY_SNAPSHOT_ODDS:
    index =>
      `data/deploy-snapshots/2026-08-${String(index + 1).padStart(2, "0")}/odds.json`,
  DEPLOY_SNAPSHOT_VALUE:
    index =>
      `data/deploy-snapshots/2026-09-${String(index + 1).padStart(2, "0")}/value.json`,
  DEPLOY_SNAPSHOT_VALUE_AUDIT:
    index =>
      `data/deploy-snapshots/2026-10-${String(index + 1).padStart(2, "0")}/value-audit.json`,
  EXPECTED_MATCH_VIEW:
    index =>
      `data/expected-matches/2026-11-${String(index + 1).padStart(2, "0")}.json`,
  H2H_INDEX:
    index =>
      `data/h2h/team-${index}~opponent-${index}.json`,
  LEGACY_FIXTURES_AGGREGATE:
    () => "data/fixtures.json",
  VALUE_AUDIT_ARTIFACT:
    index =>
      `data/value/_audit/2026-12-${String(index + 1).padStart(2, "0")}.json`,
  VALUE_COMPARISON:
    index =>
      `data/value-comparison/2027-01-${String(index + 1).padStart(2, "0")}.json`,
  VALUE_PLAN_ARTIFACT:
    index => {
      const names = [
        "plan-a.json",
        "plan-b.json",
        "plan-a2.json",
        "plan-a2-audit.json",
        "plan-b-audit.json",
        "plan-b2.json",
        "plan-b2-audit.json",
      ];
      const day = String(Math.floor(index / names.length) + 1)
        .padStart(2, "0");
      return `data/value-plans/2027-02-${day}/${names[index % names.length]}`;
    },
});

function inventoryRows() {
  const rows = [];
  for (const [family, count] of Object.entries(FAMILY_COUNTS)) {
    for (let index = 0; index < count; index++) {
      rows.push({
        file: PATH_FACTORIES[family](index),
        rebuildFamily: family,
        phase: "P4_DERIVED_REBUILD",
        rebuildRequired: true,
        directFileEditAuthorized: false,
        manualEditAuthorized: false,
        producerDiscoveryRequired: true,
        applicationAuthorized: false,
      });
    }
  }
  return rows;
}

test("publishes the exact source-bound 13-family contract", () => {
  const contract = getP0CP4FamilyAdapterContract();

  assert.equal(
    contract.schema,
    P0C_P4_FAMILY_ADAPTER_CONTRACT_SCHEMA,
  );
  assert.equal(contract.families.length, 13);
  assert.equal(
    contract.families.reduce(
      (sum, row) => sum + row.inventoryPathCount,
      0,
    ),
    1291,
  );
  assert.equal(
    P0C_P4_FAMILY_ADAPTER_DISCOVERY_BINDING.unresolvedRelativeImportCount,
    0,
  );
  assert.equal(
    contract.invariants.repositoryApplicationAuthorized,
    false,
  );
  assert.equal(
    contract.invariants.directArtifactEditingAuthorized,
    false,
  );
});

test("validates the exact 1291-row family inventory", () => {
  const result = validateP0CP4FamilyAdapterInventory({
    inventoryRows: inventoryRows(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.inventoryPathCount, 1291);
  assert.equal(result.familyCount, 13);
  assert.equal(
    result.repositoryApplicationAuthorized,
    false,
  );
});

test("rejects count, family, path and authorization drift", () => {
  const rows = inventoryRows();

  assert.throws(
    () => validateP0CP4FamilyAdapterInventory({
      inventoryRows: rows.slice(1),
    }),
    /inventory_count_mismatch/,
  );

  const unknown = inventoryRows();
  unknown[0] = {
    ...unknown[0],
    rebuildFamily: "UNKNOWN",
  };
  assert.throws(
    () => validateP0CP4FamilyAdapterInventory({
      inventoryRows: unknown,
    }),
    /family_unknown/,
  );

  const wrongPath = inventoryRows();
  wrongPath[0] = {
    ...wrongPath[0],
    file: "data/value-comparison/2026-08-01.json",
  };
  assert.throws(
    () => validateP0CP4FamilyAdapterInventory({
      inventoryRows: wrongPath,
    }),
    /path_family_mismatch/,
  );

  const authorized = inventoryRows();
  authorized[0] = {
    ...authorized[0],
    applicationAuthorized: true,
  };
  assert.throws(
    () => validateP0CP4FamilyAdapterInventory({
      inventoryRows: authorized,
    }),
    /fail_closed_violation/,
  );
});

test("pins all required producer source hashes", () => {
  const contract = getP0CP4FamilyAdapterContract();
  const sourceRecords = Object.values(
    contract.sourceBindings,
  ).map(row => ({
    path: row.path,
    sha256: row.sha256,
  }));

  const result = validateP0CP4ProducerEvidence({
    sourceRecords,
  });

  assert.equal(result.ok, true);
  assert.equal(result.requiredSourceCount, 15);

  const drifted = sourceRecords.map(row => ({ ...row }));
  drifted[0].sha256 = "0".repeat(64);
  assert.throws(
    () => validateP0CP4ProducerEvidence({
      sourceRecords: drifted,
    }),
    /source_hash_mismatch/,
  );
});

test("builds only an exact 13-runner registry", () => {
  const implementations = Object.fromEntries(
    Object.keys(FAMILY_COUNTS).map(family => [
      family,
      () => ({
        completeFamilyOutput: true,
        outputs: [],
      }),
    ]),
  );

  const registry = buildP0CP4FamilyRunnerRegistry({
    implementations,
  });

  assert.equal(registry.familyCount, 13);
  assert.equal(
    Object.keys(registry.familyRunners).length,
    13,
  );
  assert.equal(
    registry.repositoryApplicationAuthorized,
    false,
  );

  const missing = { ...implementations };
  delete missing.H2H_INDEX;
  assert.throws(
    () => buildP0CP4FamilyRunnerRegistry({
      implementations: missing,
    }),
    /implementation_missing:H2H_INDEX/,
  );

  assert.throws(
    () => buildP0CP4FamilyRunnerRegistry({
      implementations: {
        ...implementations,
        UNKNOWN: () => [],
      },
    }),
    /implementation_unknown:UNKNOWN/,
  );
});

test("marks only the three existing P0-C pure builders as ready", () => {
  const contract = getP0CP4FamilyAdapterContract();
  const ready = contract.families
    .filter(row => row.adapterState === "PURE_BUILDER_READY")
    .map(row => row.family)
    .sort();

  assert.deepEqual(ready, [
    "DEPLOY_SNAPSHOT_FIXTURES_ALL",
    "H2H_INDEX",
    "LEGACY_FIXTURES_AGGREGATE",
  ]);
});
