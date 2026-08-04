import test from "node:test";
import assert from "node:assert/strict";

import {
  computeDeploySnapshotManifestHash,
} from "../core/deploy-snapshot-release-contract.js";
import {
  P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_ADAPTER_SCHEMA,
  createP0CP4DeploySnapshotManifestFamilyImplementation,
} from "./p0c-p4-deploy-snapshot-manifest-adapter.js";

function jsonBuffer(value) {
  return Buffer.from(
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function dayKey(index) {
  return `2026-07-${String(index + 1).padStart(2, "0")}`;
}

function fixtureId(day) {
  return `cid_manifest_${day.replaceAll("-", "")}`;
}

function sourceManifest(day, id) {
  const manifest = {
    ok: true,
    date: day,
    generatedAt: `${day}T23:00:00.000Z`,
    startedAt: `${day}T22:59:00.000Z`,
    source: "local_canonical_export",
    version: "deploy-snapshot-v2",
    fixturesSource: "canonical",
    sourceFixtureJsonCount: 1,
    fixtureJsonCount: 1,
    canonicalFixtureCount: 1,
    snapshotRescuedCount: 0,
    snapshotRescuedLeagues: [],
    canonicalCoverageFixtureCount: 1,
    staticMinTargetFixtures: 45,
    minTargetFixtures: 1,
    minTargetFixtureSource: "canonical_coverage",
    files: {
      fixtures: "fixtures.json",
      value: "value.json",
      valueAudit: "value-audit.json",
      detailsDir: "details",
    },
    fileHashes: {
      "fixtures.json": "0".repeat(64),
      "value.json": "1".repeat(64),
      "value-audit.json": "2".repeat(64),
    },
    counts: {
      fixtures: 1,
      valuePicks: 0,
      details: 1,
      detailsMatchedToFixtures: 1,
      orphanDetailsRemoved: 0,
      detailsMissingForFixtures: 0,
    },
    valueGate: {
      fixtures: 1,
      valuePicks: 0,
      valueSource: "local_value_file",
      valueFreshAgainstCanonical: null,
      ok: true,
    },
    fixturesByLeague: { "test.1": 1 },
    orphanDetailsRemoved: [],
    detailsMissingForFixtures: [],
    coverage: {
      minTargetFixtures: 1,
      minTargetFixtureSource: "canonical_coverage",
      canonicalCoverageFixtureCount: 1,
      detailsWithTravel: 0,
      detailsWithPlayerUsage: 0,
      playerUsageUsableSides: 0,
      playerUsageTotalSides: 2,
      detailsWithTeamNews: 0,
      detailsWithValue: 0,
      matchProfileApplied: 0,
    },
    sizes: {
      fixturesMb: 0,
      valueMb: 0,
      detailsTotalMb: 0,
      largestDetail: {
        file: `${id}.json`,
        bytes: 1,
        mb: 0,
      },
    },
    details: [],
  };
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  return manifest;
}

function fixedInputs(day, { complete = true } = {}) {
  const id = fixtureId(day);
  return {
    sourceManifestBytes:
      jsonBuffer(sourceManifest(day, id)),
    fixedOutputSetComplete: complete,
    fixedOutputFamilies: [
      "DEPLOY_SNAPSHOT_DETAILS",
      "DEPLOY_SNAPSHOT_FIXTURES",
      "DEPLOY_SNAPSHOT_VALUE",
      "DEPLOY_SNAPSHOT_VALUE_AUDIT",
    ],
    fixturesOutput: {
      relativePath:
        `data/deploy-snapshots/${day}/fixtures.json`,
      action: "write",
      content: {
        ok: true,
        date: day,
        count: 1,
        fixtures: [
          {
            canonicalId: id,
            matchId: id,
            leagueSlug: "test.1",
          },
        ],
      },
    },
    valueOutput: {
      relativePath:
        `data/deploy-snapshots/${day}/value.json`,
      action: "write",
      content: {
        ok: true,
        date: day,
        source: "local_value_file",
        count: 0,
        picks: [],
      },
    },
    valueAuditOutput: {
      relativePath:
        `data/deploy-snapshots/${day}/value-audit.json`,
      action: "write",
      content: {
        ok: true,
        date: day,
        candidates: [],
      },
    },
    detailOutputs: [
      {
        relativePath:
          `data/deploy-snapshots/${day}/details/${id}.json`,
        action: "write",
        content: {
          matchId: id,
          basic: {
            canonicalId: id,
            matchId: id,
          },
        },
      },
    ],
    completeDayDetailSet: true,
  };
}

function inventoryRows() {
  return Array.from({ length: 15 }, (_, index) => {
    const day = dayKey(index);
    return {
      file:
        `data/deploy-snapshots/${day}/manifest.json`,
      rebuildFamily: "DEPLOY_SNAPSHOT_MANIFEST",
      phase: "P4_DERIVED_REBUILD",
      rebuildRequired: true,
      directFileEditAuthorized: false,
      applicationAuthorized: false,
    };
  });
}

const overlay = {
  resolveEvidenceFixtureId(value) {
    const text = String(value ?? "").trim();
    return {
      ok: true,
      managed: false,
      sourceFixtureId: text,
      resolvedFixtureId: text,
      sourceRole: "unmanaged",
    };
  },
};

test("emits the complete exact 15-manifest family from fixed bundle inputs", async () => {
  const rows = inventoryRows();
  const implementation =
    createP0CP4DeploySnapshotManifestFamilyImplementation({
      loadFixedDeploySnapshotManifestInputsForDay: async ({ dayKey: day }) =>
        fixedInputs(day),
      overlay,
    });

  const result = await implementation({
    family: "DEPLOY_SNAPSHOT_MANIFEST",
    inventoryRows: rows,
    inventoryPaths: rows.map(row => row.file),
    buildTimestamp: "2026-08-04T17:30:00.000Z",
    applicationAuthorized: false,
  });

  assert.equal(
    result.schema,
    P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_ADAPTER_SCHEMA,
  );
  assert.equal(result.completeFamilyOutput, true);
  assert.equal(result.outputs.length, 15);
  assert.equal(result.diagnostics.inventoryPathCount, 15);
  assert.equal(result.diagnostics.emittedWriteCount, 15);
  assert.equal(result.diagnostics.artifacts.length, 15);
  assert.equal(
    result.outputs.every(row =>
      row.action === "write" &&
      Buffer.isBuffer(row.content),
    ),
    true,
  );
});

test("fails closed when the loader does not provide a complete fixed output set", async () => {
  const rows = inventoryRows().slice(0, 1);
  const implementation =
    createP0CP4DeploySnapshotManifestFamilyImplementation({
      loadFixedDeploySnapshotManifestInputsForDay: async ({ dayKey: day }) =>
        fixedInputs(day, { complete: false }),
      overlay,
    });

  await assert.rejects(
    implementation({
      family: "DEPLOY_SNAPSHOT_MANIFEST",
      inventoryRows: rows,
      inventoryPaths: rows.map(row => row.file),
      buildTimestamp: "2026-08-04T17:30:00.000Z",
      applicationAuthorized: false,
    }),
    /fixed_output_set_incomplete/u,
  );
});
