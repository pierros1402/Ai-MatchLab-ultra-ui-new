import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  P0C_P4_FAMILY_ADAPTER_CONTRACT_SCHEMA,
  P0C_P4_FAMILY_ADAPTER_DISCOVERY_BINDING,
  P0C_P4_FAMILY_ADAPTER_APPLICATION_BINDING_V2,
  buildP0CP4FamilyRunnerRegistry,
  getP0CP4FamilyAdapterContract,
  validateP0CP4FamilyAdapterInventory,
  validateP0CP4ProducerEvidence,
  P0C_P4_V35_PRODUCER_BINDING_SCHEMA,
  getP0CP4V35ProducerBinding,
  validateP0CP4V35ProducerEvidence,
  P0C_P4_V35_CHUNKED_PRODUCER_BINDING_SCHEMA,
  getP0CP4V35ChunkedProducerBinding,
  validateP0CP4V35ChunkedProducerEvidence,
} from "./p0c-p4-family-adapter-contract.js";

const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(
  path.dirname(__filename),
  "..",
  "..",
);

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function sourceBindingSha256(relativePath, expectedSha256) {
  const content = fs.readFileSync(
    path.join(PROJECT_ROOT, relativePath),
  );
  const rawSha256 = sha256(content);
  if (rawSha256 === expectedSha256) return rawSha256;

  const normalizedLfSha256 = sha256(
    Buffer.from(
      content
        .toString("utf8")
        .replaceAll("\r\n", "\n"),
      "utf8",
    ),
  );
  return normalizedLfSha256;
}

const FAMILY_COUNTS = Object.freeze({
  DEPLOY_SNAPSHOT_DETAILS: 631,
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
    1294,
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

test("pins the exact V2 application inventory and three retained detail creates", () => {
  const binding =
    P0C_P4_FAMILY_ADAPTER_APPLICATION_BINDING_V2;
  const inventoryPath = path.join(
    PROJECT_ROOT,
    binding.applicationInventoryPath,
  );
  const bytes = fs.readFileSync(inventoryPath);
  assert.equal(
    sourceBindingSha256(
      binding.applicationInventoryPath,
      binding.applicationInventorySha256,
    ),
    binding.applicationInventorySha256,
  );
  const rows = bytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(line => JSON.parse(line));

  assert.equal(rows.length, 1294);
  assert.equal(binding.originalInventoryPathCount, 1291);
  assert.equal(binding.applicationInventoryPathCount, 1294);
  assert.equal(
    binding.repositoryApplicationAuthorized,
    false,
  );

  const added = rows
    .filter(row => row.existsInRepository === false)
    .map(row => row.file)
    .sort();
  assert.deepEqual(
    added,
    [...binding.addedRetainedDetailCreatePaths].sort(),
  );

  const validation = validateP0CP4FamilyAdapterInventory({
    inventoryRows: rows,
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.inventoryPathCount, 1294);
});

test("validates the exact 1294-row family inventory", () => {
  const result = validateP0CP4FamilyAdapterInventory({
    inventoryRows: inventoryRows(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.inventoryPathCount, 1294);
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

test("pins all required current producer source hashes against the explicit V3.5 candidate binding", () => {
  const historical = getP0CP4FamilyAdapterContract();
  const current = getP0CP4V35ChunkedProducerBinding();
  assert.equal(current.schema, P0C_P4_V35_CHUNKED_PRODUCER_BINDING_SCHEMA);
  assert.equal(current.repositoryApplicationAuthorized, false);
  assert.equal(current.productionAuthorized, false);
  assert.deepEqual(Object.keys(current.sourceBindings),Object.keys(historical.sourceBindings));
  const changed = Object.keys(current.sourceBindings).filter(key =>
    current.sourceBindings[key].sha256 !== historical.sourceBindings[key].sha256);
  assert.deepEqual(changed,["valueBuilder","planBBuilder"]);
  for (const key of Object.keys(current.sourceBindings)) {
    const {sha256: oldHash, ...oldFields} = historical.sourceBindings[key];
    const {sha256: newHash, ...newFields} = current.sourceBindings[key];
    assert.deepEqual(newFields,oldFields);
  }
  assert.equal(historical.sourceBindings.valueBuilder.sha256,
    "c8edd6511df2b9ecb3b1f2d4ba162f3f5ded5d069854e147d468750a37e895e7");
  assert.equal(historical.sourceBindings.planBBuilder.sha256,
    "47cfaedfad06c441b47ab63339bfb294a3ae62a2002732da26a8193bcf4e8958");
  const sourceRecords = Object.values(current.sourceBindings).map(row => ({
    path: row.path, sha256: sourceBindingSha256(row.path,row.sha256),
  }));
  const result = validateP0CP4V35ChunkedProducerEvidence({sourceRecords});
  assert.equal(result.ok,true);
  assert.equal(result.requiredSourceCount,23);
  assert.equal(result.repositoryApplicationAuthorized,false);
  const previous=getP0CP4V35ProducerBinding();
  assert.equal(previous.schema,P0C_P4_V35_PRODUCER_BINDING_SCHEMA);
  assert.equal(previous.sourceBindings.valueBuilder.sha256,"a1d19b4657f7fe95042505e7e521e0d8a989f496ecaef73f9c8eb1fff33d9fbd");
  const previousRows=Object.values(previous.sourceBindings).map(({path,sha256})=>({path,sha256}));
  assert.equal(validateP0CP4V35ProducerEvidence({sourceRecords:previousRows}).ok,true);
  assert.throws(()=>validateP0CP4V35ChunkedProducerEvidence({sourceRecords:previousRows}),/source_hash_mismatch/);
  assert.throws(()=>validateP0CP4V35ProducerEvidence({sourceRecords}),/source_hash_mismatch/);
  // The old contract is never silently repinned or made to accept a newer source.
  assert.throws(() => validateP0CP4ProducerEvidence({sourceRecords}),/source_hash_mismatch/);
  for (let i=0;i<sourceRecords.length;i++) {
    const drifted=sourceRecords.map(row=>({...row}));
    drifted[i].sha256="0".repeat(64);
    assert.throws(()=>validateP0CP4V35ChunkedProducerEvidence({sourceRecords:drifted}),/source_hash_mismatch/);
  }
  for (const key of changed) {
    const old=historical.sourceBindings[key];
    const mixed=sourceRecords.map(row=>row.path===old.path?{path:old.path,sha256:old.sha256}:row);
    assert.throws(()=>validateP0CP4V35ChunkedProducerEvidence({sourceRecords:mixed}),/source_hash_mismatch/);
  }
  assert.throws(()=>validateP0CP4V35ChunkedProducerEvidence({sourceRecords:sourceRecords.slice(1)}),/source_missing/);
  assert.throws(()=>validateP0CP4V35ChunkedProducerEvidence({sourceRecords:[...sourceRecords,sourceRecords[0]]}),/source_record_duplicate/);
});

test("unchanged historical producer hash ledger is not a V3.5 ledger", () => {
  // This verifies the original digest ledger/validator, not a fresh historical build.
  const rows=Object.values(getP0CP4FamilyAdapterContract().sourceBindings).map(({path,sha256})=>({path,sha256}));
  assert.equal(validateP0CP4ProducerEvidence({sourceRecords:rows}).requiredSourceCount,23);
  assert.throws(()=>validateP0CP4V35ProducerEvidence({sourceRecords:rows}),/source_hash_mismatch/);
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

test("marks all thirteen integrated P0-C pure builders as ready", () => {
  const contract = getP0CP4FamilyAdapterContract();
  const ready = contract.families
    .filter(row => row.adapterState === "PURE_BUILDER_READY")
    .map(row => row.family)
    .sort();

  assert.deepEqual(ready, [
    "DEPLOY_SNAPSHOT_DETAILS",
    "DEPLOY_SNAPSHOT_FIXTURES",
    "DEPLOY_SNAPSHOT_FIXTURES_ALL",
    "DEPLOY_SNAPSHOT_MANIFEST",
    "DEPLOY_SNAPSHOT_ODDS",
    "DEPLOY_SNAPSHOT_VALUE",
    "DEPLOY_SNAPSHOT_VALUE_AUDIT",
    "EXPECTED_MATCH_VIEW",
    "H2H_INDEX",
    "LEGACY_FIXTURES_AGGREGATE",
    "VALUE_AUDIT_ARTIFACT",
    "VALUE_COMPARISON",
    "VALUE_PLAN_ARTIFACT",
  ]);
});
