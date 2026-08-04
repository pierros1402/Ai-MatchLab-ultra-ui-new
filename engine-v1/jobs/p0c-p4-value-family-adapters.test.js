import test from "node:test";
import assert from "node:assert/strict";

import {
  P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA,
} from "./p0c-p4-build-existing-value-artifact.js";
import {
  P0C_P4_VALUE_FAMILY_ADAPTERS_SCHEMA,
  P0C_P4_VALUE_FAMILY_NAMES,
  createP0CP4ValueFamilyImplementations,
} from "./p0c-p4-value-family-adapters.js";

function context(family, paths) {
  return {
    family,
    inventoryRows: paths.map(file => ({
      file,
      rebuildFamily: family,
    })),
    inventoryPaths: paths,
    applicationAuthorized: false,
  };
}

function fakeBuilder({
  relativePath,
  family,
  sourceBytes,
}) {
  const immutablePlanA =
    relativePath.endsWith("/plan-a.json");
  return {
    schema: P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA,
    ok: true,
    family,
    dayKey: relativePath.match(/\d{4}-\d{2}-\d{2}/u)[0],
    relativePath,
    immutablePlanA,
    sourceSha256: "a".repeat(64),
    outputSha256: "b".repeat(64),
    content: Buffer.from(sourceBytes),
    identityOverlay: {
      entryCount: immutablePlanA ? 0 : 2,
      changedFixtureIdCount: immutablePlanA ? 0 : 1,
    },
  };
}

test("publishes the exact five non-manifest Value families", () => {
  assert.equal(
    P0C_P4_VALUE_FAMILY_ADAPTERS_SCHEMA,
    "ai-matchlab.p0c-p4-value-family-adapters.v1",
  );
  assert.deepEqual(P0C_P4_VALUE_FAMILY_NAMES, [
    "VALUE_PLAN_ARTIFACT",
    "VALUE_AUDIT_ARTIFACT",
    "VALUE_COMPARISON",
    "DEPLOY_SNAPSHOT_VALUE",
    "DEPLOY_SNAPSHOT_VALUE_AUDIT",
  ]);
});

test("emits one existing-artifact overlay write for every planned path", async () => {
  const loaded = [];
  const implementations =
    createP0CP4ValueFamilyImplementations({
      loadExistingValueArtifact: async row => {
        loaded.push(row.relativePath);
        return Buffer.from(
          `${row.family}:${row.relativePath}`,
          "utf8",
        );
      },
      buildExistingValueArtifact: fakeBuilder,
    });

  const paths = [
    "data/value-plans/2026-08-01/plan-a.json",
    "data/value-plans/2026-08-01/plan-b.json",
  ];
  const result = await implementations.VALUE_PLAN_ARTIFACT(
    context("VALUE_PLAN_ARTIFACT", paths),
  );

  assert.equal(
    result.schema,
    P0C_P4_VALUE_FAMILY_ADAPTERS_SCHEMA,
  );
  assert.equal(result.completeFamilyOutput, true);
  assert.equal(result.outputs.length, 2);
  assert.deepEqual(
    result.outputs.map(row => row.relativePath),
    paths,
  );
  assert.ok(
    result.outputs.every(row => row.action === "write"),
  );
  assert.equal(
    result.diagnostics.immutablePlanACount,
    1,
  );
  assert.equal(
    result.diagnostics.identityEntryCount,
    2,
  );
  assert.equal(
    result.diagnostics.changedFixtureIdCount,
    1,
  );
  assert.equal(
    result.diagnostics.modelEvaluationPerformed,
    false,
  );
  assert.deepEqual(loaded, paths);
});

test("supports all five families and rejects authorization, path and loader drift", async () => {
  const implementations =
    createP0CP4ValueFamilyImplementations({
      loadExistingValueArtifact: async () =>
        Buffer.from("{}\n", "utf8"),
      buildExistingValueArtifact: fakeBuilder,
    });

  const paths = {
    VALUE_PLAN_ARTIFACT:
      "data/value-plans/2026-08-01/plan-b.json",
    VALUE_AUDIT_ARTIFACT:
      "data/value/_audit/2026-08-01.json",
    VALUE_COMPARISON:
      "data/value-comparison/2026-08-01.json",
    DEPLOY_SNAPSHOT_VALUE:
      "data/deploy-snapshots/2026-08-01/value.json",
    DEPLOY_SNAPSHOT_VALUE_AUDIT:
      "data/deploy-snapshots/2026-08-01/value-audit.json",
  };

  for (const family of P0C_P4_VALUE_FAMILY_NAMES) {
    const result = await implementations[family](
      context(family, [paths[family]]),
    );
    assert.equal(result.family, family);
    assert.equal(result.outputs.length, 1);
  }

  await assert.rejects(
    implementations.VALUE_COMPARISON({
      ...context("VALUE_COMPARISON", [
        paths.VALUE_COMPARISON,
      ]),
      applicationAuthorized: true,
    }),
    /application_forbidden/,
  );

  await assert.rejects(
    implementations.VALUE_COMPARISON(
      context("VALUE_COMPARISON", [
        paths.VALUE_AUDIT_ARTIFACT,
      ]),
    ),
    /inventory_path_mismatch/,
  );

  const missingLoader =
    createP0CP4ValueFamilyImplementations({
      buildExistingValueArtifact: fakeBuilder,
    });
  await assert.rejects(
    missingLoader.VALUE_COMPARISON(
      context("VALUE_COMPARISON", [
        paths.VALUE_COMPARISON,
      ]),
    ),
    /loader_required/,
  );
});
