import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalBufferSha256,
  computeDeploySnapshotManifestHash,
  validateDeploySnapshotManifest,
} from "../core/deploy-snapshot-release-contract.js";
import {
  P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_SCHEMA,
  buildP0CP4DeploySnapshotManifest,
} from "./p0c-p4-build-deploy-snapshot-manifest.js";

const DAY = "2026-07-08";
const OLD_ID = "cid_test_old_20260708";
const NEW_ID = "cid_test_new_20260708";
const OTHER_ID = "cid_test_other_20260708";

function jsonBuffer(value) {
  return Buffer.from(
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

function overlay() {
  return {
    resolveEvidenceFixtureId(value) {
      const text = String(value ?? "").trim();
      if (text === OLD_ID) {
        return {
          ok: true,
          managed: true,
          sourceFixtureId: OLD_ID,
          resolvedFixtureId: NEW_ID,
          sourceRole: "suppressed",
        };
      }
      return {
        ok: true,
        managed: false,
        sourceFixtureId: text,
        resolvedFixtureId: text,
        sourceRole: "unmanaged",
      };
    },
  };
}

function detail(id, { rich = false } = {}) {
  return {
    matchId: id,
    basic: {
      canonicalId: id,
      matchId: id,
    },
    travelContext: rich ? { distanceKm: 250 } : null,
    playerUsageIntel: rich
      ? {
          home: {
            status: "ready",
            confidence: 0.9,
            sampleMatches: 4,
            expectedStarters: Array.from(
              { length: 6 },
              (_, index) => ({ name: `H${index}` }),
            ),
          },
        }
      : null,
    teamNewsIntel: rich
      ? {
          status: "ready",
          confidence: 0.8,
          absences: [{ player: "Player" }],
        }
      : null,
    valueSummary: rich
      ? {
          count: 1,
          picks: [{ matchProfileApplied: true }],
        }
      : { count: 0, picks: [] },
    meta: {
      valueSynced: rich,
    },
  };
}

function sourceManifest() {
  const manifest = {
    ok: true,
    date: DAY,
    generatedAt: "2026-07-08T23:00:00.000Z",
    startedAt: "2026-07-08T22:59:00.000Z",
    source: "local_canonical_export",
    version: "deploy-snapshot-v2",
    fixturesSource: "canonical",
    sourceFixtureJsonCount: 2,
    fixtureJsonCount: 2,
    canonicalFixtureCount: 2,
    snapshotRescuedCount: 0,
    snapshotRescuedLeagues: [],
    canonicalCoverageFixtureCount: 2,
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
      fixtures: 2,
      valuePicks: 0,
      details: 2,
      detailsMatchedToFixtures: 2,
      orphanDetailsRemoved: 1,
      detailsMissingForFixtures: 0,
    },
    valueGate: {
      fixtures: 2,
      valuePicks: 0,
      valueSource: "local_value_file",
      latestCanonicalUpdatedAt: null,
      valueArtifactAt: null,
      valueFreshAgainstCanonical: null,
      ok: true,
    },
    fixturesByLeague: { "test.1": 2 },
    orphanDetailsRemoved: [`${OLD_ID}.json`],
    detailsMissingForFixtures: [],
    coverage: {
      minTargetFixtures: 1,
      minTargetFixtureSource: "canonical_coverage",
      canonicalCoverageFixtureCount: 2,
      detailsWithTravel: 0,
      detailsWithPlayerUsage: 0,
      playerUsageUsableSides: 0,
      playerUsageTotalSides: 4,
      detailsWithTeamNews: 0,
      detailsWithValue: 0,
      matchProfileApplied: 0,
    },
    sizes: {
      fixturesMb: 0,
      valueMb: 0,
      detailsTotalMb: 0,
      largestDetail: {
        file: `${OLD_ID}.json`,
        bytes: 100,
        mb: 0,
      },
    },
    details: [
      {
        file: `${OLD_ID}.json`,
        bytes: 100,
        sha256: "3".repeat(64),
        mb: 0,
        canonicalId: OLD_ID,
        matchId: OLD_ID,
        hasTravel: false,
        hasPlayerUsage: false,
        playerUsageUsableSides: 0,
        hasTeamNews: false,
        hasValue: false,
        matchProfileApplied: false,
        valueSynced: false,
        keys: [],
      },
    ],
  };
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  return manifest;
}

function buildInput(overrides = {}) {
  const fixtures = {
    ok: true,
    date: DAY,
    count: 2,
    fixtures: [
      {
        canonicalId: NEW_ID,
        matchId: NEW_ID,
        leagueSlug: "test.1",
      },
      {
        canonicalId: OTHER_ID,
        matchId: OTHER_ID,
        leagueSlug: "test.1",
      },
    ],
  };
  const value = {
    ok: true,
    date: DAY,
    source: "local_value_file",
    count: 1,
    picks: [{ matchId: NEW_ID, market: "1X2" }],
  };
  const audit = {
    ok: true,
    date: DAY,
    generatedAt: "2026-07-08T22:00:00.000Z",
    candidates: [],
  };
  return {
    relativePath:
      `data/deploy-snapshots/${DAY}/manifest.json`,
    dayKey: DAY,
    sourceManifestBytes: jsonBuffer(sourceManifest()),
    fixedOutputSetComplete: true,
    fixedOutputFamilies: [
      "DEPLOY_SNAPSHOT_DETAILS",
      "DEPLOY_SNAPSHOT_FIXTURES",
      "DEPLOY_SNAPSHOT_VALUE",
      "DEPLOY_SNAPSHOT_VALUE_AUDIT",
    ],
    fixturesOutput: {
      relativePath:
        `data/deploy-snapshots/${DAY}/fixtures.json`,
      action: "write",
      content: fixtures,
    },
    valueOutput: {
      relativePath:
        `data/deploy-snapshots/${DAY}/value.json`,
      action: "write",
      content: jsonBuffer(value),
    },
    valueAuditOutput: {
      relativePath:
        `data/deploy-snapshots/${DAY}/value-audit.json`,
      action: "write",
      content: jsonBuffer(audit),
    },
    detailOutputs: [
      {
        relativePath:
          `data/deploy-snapshots/${DAY}/details/${NEW_ID}.json`,
        action: "write",
        content: detail(NEW_ID, { rich: true }),
      },
      {
        relativePath:
          `data/deploy-snapshots/${DAY}/details/${OTHER_ID}.json`,
        action: "write",
        content: detail(OTHER_ID),
      },
      {
        relativePath:
          `data/deploy-snapshots/${DAY}/details/${OLD_ID}.json`,
        action: "delete",
      },
    ],
    completeDayDetailSet: true,
    overlay: overlay(),
    buildTimestamp: "2026-08-04T17:00:00.000Z",
    ...overrides,
  };
}

test("builds a validated manifest from the complete fixed snapshot bundle", () => {
  const input = buildInput();
  const result = buildP0CP4DeploySnapshotManifest(input);
  const manifest = JSON.parse(result.content.toString("utf8"));

  assert.equal(
    result.schema,
    P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_SCHEMA,
  );
  assert.equal(result.ok, true);
  assert.equal(manifest.generatedAt, sourceManifest().generatedAt);
  assert.equal(manifest.startedAt, sourceManifest().startedAt);
  assert.deepEqual(manifest.counts, {
    fixtures: 2,
    valuePicks: 1,
    details: 2,
    detailsMatchedToFixtures: 2,
    orphanDetailsRemoved: 0,
    detailsMissingForFixtures: 0,
  });
  assert.deepEqual(manifest.fixturesByLeague, {
    "test.1": 2,
  });
  assert.deepEqual(
    manifest.details.map(row => row.file),
    [`${NEW_ID}.json`, `${OTHER_ID}.json`].sort(),
  );
  assert.equal(manifest.coverage.detailsWithTravel, 1);
  assert.equal(manifest.coverage.detailsWithPlayerUsage, 1);
  assert.equal(manifest.coverage.playerUsageUsableSides, 1);
  assert.equal(manifest.coverage.detailsWithTeamNews, 1);
  assert.equal(manifest.coverage.detailsWithValue, 1);
  assert.equal(manifest.coverage.matchProfileApplied, 1);
  assert.equal(
    manifest.fileHashes["fixtures.json"],
    canonicalBufferSha256(
      jsonBuffer(input.fixturesOutput.content),
    ),
  );
  assert.equal(
    manifest.fileHashes["value.json"],
    canonicalBufferSha256(input.valueOutput.content),
  );
  assert.equal(
    result.diagnostics.detailWriteCount,
    2,
  );
  assert.equal(
    result.diagnostics.detailDeleteCount,
    1,
  );
  assert.equal(
    result.diagnostics.changedFixtureIdCount > 0,
    true,
  );
  assert.equal(
    result.content.toString("utf8").includes(OLD_ID),
    false,
  );

  const validation = validateDeploySnapshotManifest(
    manifest,
    DAY,
  );
  assert.equal(validation.ok, true);
  assert.equal(validation.errors.length, 0);
});

test("is deterministic for identical fixed inputs", () => {
  const left = buildP0CP4DeploySnapshotManifest(
    buildInput(),
  );
  const right = buildP0CP4DeploySnapshotManifest(
    buildInput(),
  );

  assert.equal(
    left.outputSha256,
    right.outputSha256,
  );
  assert.deepEqual(left.content, right.content);
});

test("fails closed until all prerequisite families and the complete detail set are fixed", () => {
  assert.throws(
    () => buildP0CP4DeploySnapshotManifest(
      buildInput({
        fixedOutputFamilies: [
          "DEPLOY_SNAPSHOT_DETAILS",
          "DEPLOY_SNAPSHOT_FIXTURES",
          "DEPLOY_SNAPSHOT_VALUE",
        ],
      }),
    ),
    /prerequisite_missing:DEPLOY_SNAPSHOT_VALUE_AUDIT/u,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotManifest(
      buildInput({ completeDayDetailSet: false }),
    ),
    /complete_detail_set_required/u,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotManifest(
      buildInput({ fixedOutputSetComplete: false }),
    ),
    /fixed_output_set_incomplete/u,
  );
});

test("rejects any fixture/detail membership mismatch", () => {
  const input = buildInput();
  const detailOutputs = input.detailOutputs.filter(
    row => !row.relativePath.includes(OTHER_ID),
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotManifest({
      ...input,
      detailOutputs,
    }),
    /fixture_detail_set_mismatch/u,
  );
});
