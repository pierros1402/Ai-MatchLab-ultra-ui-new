import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalBufferSha256,
  computeDeploySnapshotManifestHash,
  validateDeploySnapshotManifest,
} from "../core/deploy-snapshot-release-contract.js";
import {
  buildP0CP4DeploySnapshotManifest,
} from "./p0c-p4-build-deploy-snapshot-manifest.js";

const DAY = "2026-07-08";
const ID = "cid_plan_c_bundle_test_20260708";

function prettyBytes(value, trailingNewline = true) {
  return Buffer.from(
    `${JSON.stringify(value, null, 2)}${trailingNewline ? "\n" : ""}`,
    "utf8",
  );
}

function identityOverlay() {
  return {
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
}

function planCShadow() {
  return {
    schema: "ai-matchlab.plan-c-shadow-day.v1",
    ok: true,
    available: false,
    mode: "SHADOW",
    productionEligible: false,
    date: DAY,
    generatedAt: null,
    sourcePredictionSetHash: null,
    count: 0,
    pickCount: 0,
    entries: [],
    reason: "missing_plan_c_shadow_day_artifact",
  };
}

function planCShadowAudit() {
  return {
    schema: "ai-matchlab.plan-c-shadow-export-audit.v1",
    ok: true,
    date: DAY,
    exportedAt: "2026-08-04T17:00:00.000Z",
    mode: "SHADOW",
    productionEligible: false,
    source: "missing_optional_source",
    sourcePath: `data/plan-c-shadow/${DAY}.json`,
    sourceSha256: null,
    available: false,
    count: 0,
    pickCount: 0,
    officialPlansUnaffected: true,
  };
}

function sourceManifest({ planC = true } = {}) {
  const manifest = {
    ok: true,
    date: DAY,
    generatedAt: "2026-07-08T23:00:00.000Z",
    startedAt: "2026-07-08T22:59:00.000Z",
    source: "local_canonical_export",
    version: "deploy-snapshot-v2",
    fixturesSource: "canonical",
    files: {
      fixtures: "fixtures.json",
      value: "value.json",
      valueAudit: null,
      ...(planC
        ? {
            planCShadow: "plan-c-shadow.json",
            planCShadowAudit: "plan-c-shadow-audit.json",
          }
        : {}),
      detailsDir: "details",
    },
    fileHashes: {
      "fixtures.json": "0".repeat(64),
      "value.json": "1".repeat(64),
      ...(planC
        ? {
            "plan-c-shadow.json": "2".repeat(64),
            "plan-c-shadow-audit.json": "3".repeat(64),
          }
        : {}),
    },
    counts: {
      fixtures: 1,
      valuePicks: 0,
      ...(planC
        ? {
            planCShadowPredictions: 0,
            planCShadowPicks: 0,
          }
        : {}),
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
    fixturesByLeague: {
      "test.1": 1,
    },
    coverage: {},
    sizes: {
      fixturesMb: 0,
      valueMb: 0,
      ...(planC ? { planCShadowMb: 0 } : {}),
      detailsTotalMb: 0,
      largestDetail: {
        file: null,
        bytes: 0,
        mb: 0,
      },
    },
    details: [],
  };

  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  return manifest;
}

function buildInput({ planC = true, ...overrides } = {}) {
  const fixtureDocument = {
    ok: true,
    date: DAY,
    count: 1,
    fixtures: [
      {
        canonicalId: ID,
        matchId: ID,
        leagueSlug: "test.1",
      },
    ],
  };

  const valueDocument = {
    ok: true,
    date: DAY,
    source: "local_value_file",
    count: 0,
    picks: [],
  };

  const planCBytes = prettyBytes(planCShadow(), false);
  const planCAuditBytes = prettyBytes(planCShadowAudit(), false);

  return {
    relativePath:
      `data/deploy-snapshots/${DAY}/manifest.json`,
    dayKey: DAY,
    sourceManifestBytes:
      prettyBytes(sourceManifest({ planC })),
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
      content: fixtureDocument,
    },
    valueOutput: {
      relativePath:
        `data/deploy-snapshots/${DAY}/value.json`,
      action: "write",
      content: prettyBytes(valueDocument),
    },
    valueAuditOutput: null,
    planCShadowOutput: planC
      ? {
          relativePath:
            `data/deploy-snapshots/${DAY}/plan-c-shadow.json`,
          action: "write",
          content: planCBytes,
        }
      : null,
    planCShadowAuditOutput: planC
      ? {
          relativePath:
            `data/deploy-snapshots/${DAY}/plan-c-shadow-audit.json`,
          action: "write",
          content: planCAuditBytes,
        }
      : null,
    detailOutputs: [
      {
        relativePath:
          `data/deploy-snapshots/${DAY}/details/${ID}.json`,
        action: "write",
        content: {
          matchId: ID,
          basic: {
            canonicalId: ID,
            matchId: ID,
          },
          valueSummary: {
            count: 0,
            picks: [],
          },
          meta: {
            valueSynced: false,
          },
        },
      },
    ],
    completeDayDetailSet: true,
    overlay: identityOverlay(),
    buildTimestamp: "2026-08-04T17:00:00.000Z",
    ...overrides,
  };
}

test("binds the complete Plan C shadow pair into the deploy manifest", () => {
  const input = buildInput();
  const result = buildP0CP4DeploySnapshotManifest(input);
  const manifest = JSON.parse(result.content.toString("utf8"));

  assert.equal(manifest.files.planCShadow, "plan-c-shadow.json");
  assert.equal(
    manifest.files.planCShadowAudit,
    "plan-c-shadow-audit.json",
  );
  assert.equal(
    manifest.fileHashes["plan-c-shadow.json"],
    canonicalBufferSha256(input.planCShadowOutput.content),
  );
  assert.equal(
    manifest.fileHashes["plan-c-shadow-audit.json"],
    canonicalBufferSha256(input.planCShadowAuditOutput.content),
  );
  assert.equal(manifest.counts.planCShadowPredictions, 0);
  assert.equal(manifest.counts.planCShadowPicks, 0);
  assert.equal(result.diagnostics.planCShadowBound, true);
  assert.equal(result.diagnostics.planCShadowPredictionCount, 0);
  assert.equal(result.diagnostics.planCShadowPickCount, 0);

  const validation = validateDeploySnapshotManifest(manifest, DAY);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});

test("uses exact production-style Plan C JSON bytes without newline churn", () => {
  const input = buildInput();

  assert.equal(
    input.planCShadowOutput.content.toString("utf8").endsWith("\n"),
    false,
  );
  assert.equal(
    input.planCShadowAuditOutput.content.toString("utf8").endsWith("\n"),
    false,
  );

  const left = buildP0CP4DeploySnapshotManifest(input);
  const right = buildP0CP4DeploySnapshotManifest(buildInput());

  assert.equal(left.outputSha256, right.outputSha256);
  assert.deepEqual(left.content, right.content);
});

test("fails closed when a manifest-declared Plan C pair is incomplete or invalid", () => {
  assert.throws(
    () =>
      buildP0CP4DeploySnapshotManifest(
        buildInput({
          planCShadowOutput: null,
        }),
      ),
    /plan_c_shadow_output_required/u,
  );

  assert.throws(
    () =>
      buildP0CP4DeploySnapshotManifest(
        buildInput({
          planCShadowAuditOutput: {
            relativePath:
              `data/deploy-snapshots/${DAY}/plan-c-shadow-audit.json`,
            action: "write",
            content: prettyBytes(
              {
                ...planCShadowAudit(),
                productionEligible: true,
              },
              false,
            ),
          },
        }),
      ),
    /plan_c_shadow_audit_invalid/u,
  );
});

test("keeps legacy source manifests without Plan C compatible", () => {
  const result = buildP0CP4DeploySnapshotManifest(
    buildInput({ planC: false }),
  );
  const manifest = JSON.parse(result.content.toString("utf8"));

  assert.equal(manifest.files.planCShadow, undefined);
  assert.equal(manifest.files.planCShadowAudit, undefined);
  assert.equal(manifest.fileHashes["plan-c-shadow.json"], undefined);
  assert.equal(
    manifest.fileHashes["plan-c-shadow-audit.json"],
    undefined,
  );

  const validation = validateDeploySnapshotManifest(manifest, DAY);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.errors, []);
});