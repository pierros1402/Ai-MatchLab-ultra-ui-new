import test from "node:test";
import assert from "node:assert/strict";

import {
  P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
  P0C_P4_READY_FAMILY_NAMES,
  buildP0CP4ReadyFamilyRunnerRegistry,
  createP0CP4ReadyFamilyImplementations,
} from "./p0c-p4-ready-family-adapters.js";
import {
  getP0CP4FamilyAdapterContract,
} from "./p0c-p4-family-adapter-contract.js";

function context(family, paths) {
  return {
    schema: "ai-matchlab.p0c-p4-composition.v1",
    family,
    inventoryRows: paths.map(file => ({
      file,
      rebuildFamily: family,
      phase: "P4_DERIVED_REBUILD",
      rebuildRequired: true,
      directFileEditAuthorized: false,
      applicationAuthorized: false,
    })),
    inventoryPaths: [...paths],
    applicationAuthorized: false,
  };
}

function builders(overrides = {}) {
  return {
    fixturesAll: ({
      dayKey,
      canonicalRows,
      providerEvidenceRows,
    }) => ({
      schema: "test-fixtures-all",
      dayKey,
      matches: canonicalRows.map(row => ({
        ...row,
        providerRows:
          providerEvidenceRows.length,
      })),
    }),
    h2h: () => ({
      ok: true,
      artifacts: [],
    }),
    legacyFixtures: () => ({
      schema: "test-legacy",
      fixtures: [],
    }),
    ...overrides,
  };
}

test("publishes the exact three pure-builder-ready families", () => {
  assert.equal(
    P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
    "ai-matchlab.p0c-p4-ready-family-adapters.v1",
  );
  assert.deepEqual(
    P0C_P4_READY_FAMILY_NAMES,
    [
      "DEPLOY_SNAPSHOT_FIXTURES_ALL",
      "H2H_INDEX",
      "LEGACY_FIXTURES_AGGREGATE",
    ],
  );
});

test("fixtures-all adapter emits one deterministic write per inventory day", async () => {
  const calls = [];
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadCanonicalRowsForDay:
        async ({ dayKey }) => {
          calls.push(`canonical:${dayKey}`);
          return [{ id: dayKey }];
        },
      loadProviderEvidenceRowsForDay:
        async ({ dayKey }) => {
          calls.push(`provider:${dayKey}`);
          return [{ id: `provider:${dayKey}` }];
        },
      builders: builders(),
    });

  const result =
    await implementations
      .DEPLOY_SNAPSHOT_FIXTURES_ALL(
        context(
          "DEPLOY_SNAPSHOT_FIXTURES_ALL",
          [
            "data/deploy-snapshots/2026-05-02/fixtures-all.json",
            "data/deploy-snapshots/2026-05-03/fixtures-all.json",
          ],
        ),
      );

  assert.equal(result.completeFamilyOutput, true);
  assert.equal(result.outputs.length, 2);
  assert.equal(result.outputs[0].action, "write");
  assert.equal(
    result.outputs[0].content.matches.length,
    1,
  );
  assert.deepEqual(
    calls,
    [
      "canonical:2026-05-02",
      "provider:2026-05-02",
      "canonical:2026-05-03",
      "provider:2026-05-03",
    ],
  );
});

test("ready adapters reject authorization and family-path drift", async () => {
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadCanonicalRowsForDay:
        async () => [],
      builders: builders(),
    });

  const authorized =
    context(
      "DEPLOY_SNAPSHOT_FIXTURES_ALL",
      [
        "data/deploy-snapshots/2026-05-02/fixtures-all.json",
      ],
    );
  authorized.applicationAuthorized = true;

  await assert.rejects(
    implementations
      .DEPLOY_SNAPSHOT_FIXTURES_ALL(
        authorized,
      ),
    /application_forbidden/,
  );

  await assert.rejects(
    implementations
      .DEPLOY_SNAPSHOT_FIXTURES_ALL(
        context(
          "DEPLOY_SNAPSHOT_FIXTURES_ALL",
          [
            "data/deploy-snapshots/2026-05-02/fixtures.json",
          ],
        ),
      ),
    /inventory_path_mismatch/,
  );
});

test("h2h adapter emits retained paths and leaves stale inventory paths for deletion", async () => {
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadHistoryDocuments:
        async () => [{ date: "2026-05-02" }],
      builders: builders({
        h2h: () => ({
          ok: true,
          artifacts: [
            {
              relativePath:
                "alpha~beta.json",
              payload: {
                teamA: "Alpha",
                teamB: "Beta",
                matches: [],
              },
            },
          ],
        }),
      }),
    });

  const result =
    await implementations.H2H_INDEX(
      context(
        "H2H_INDEX",
        [
          "data/h2h/alpha~beta.json",
          "data/h2h/stale~pair.json",
        ],
      ),
    );

  assert.equal(result.completeFamilyOutput, true);
  assert.equal(result.outputs.length, 1);
  assert.equal(
    result.outputs[0].relativePath,
    "data/h2h/alpha~beta.json",
  );
  assert.equal(
    result.diagnostics.implicitDeletionCount,
    1,
  );
});

test("h2h adapter rejects an output outside the authoritative inventory", async () => {
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadHistoryDocuments:
        async () => [],
      builders: builders({
        h2h: () => ({
          ok: true,
          artifacts: [
            {
              relativePath:
                "new~unplanned.json",
              payload: {
                matches: [],
              },
            },
          ],
        }),
      }),
    });

  await assert.rejects(
    implementations.H2H_INDEX(
      context(
        "H2H_INDEX",
        [
          "data/h2h/alpha~beta.json",
        ],
      ),
    ),
    /h2h_unplanned_output/,
  );
});

test("legacy fixture adapter emits exactly data/fixtures.json", async () => {
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadExistingLegacyAggregate:
        async () => ({
          fixtures: [{ id: "old" }],
        }),
      loadCanonicalByDay:
        async () => ({
          "2026-05-02": [{ id: "new" }],
        }),
      builders: builders({
        legacyFixtures: ({
          existingAggregate,
          canonicalByDay,
        }) => ({
          schema: "test-legacy",
          fixtures: [
            existingAggregate.fixtures[0],
            canonicalByDay["2026-05-02"][0],
          ],
        }),
      }),
    });

  const result =
    await implementations
      .LEGACY_FIXTURES_AGGREGATE(
        context(
          "LEGACY_FIXTURES_AGGREGATE",
          ["data/fixtures.json"],
        ),
      );

  assert.equal(result.completeFamilyOutput, true);
  assert.equal(result.outputs.length, 1);
  assert.equal(
    result.outputs[0].relativePath,
    "data/fixtures.json",
  );
  assert.equal(
    result.outputs[0].content.fixtures.length,
    2,
  );
});

test("ready implementations merge into an exact 13-family registry without override", () => {
  const contract =
    getP0CP4FamilyAdapterContract();
  const ready =
    new Set(P0C_P4_READY_FAMILY_NAMES);
  const otherImplementations =
    Object.fromEntries(
      contract.families
        .map(row => row.family)
        .filter(family => !ready.has(family))
        .map(family => [
          family,
          async () => ({
            completeFamilyOutput: true,
            outputs: [],
          }),
        ]),
    );

  const registry =
    buildP0CP4ReadyFamilyRunnerRegistry({
      otherImplementations,
      loadCanonicalRowsForDay:
        async () => [],
      loadHistoryDocuments:
        async () => [],
      loadExistingLegacyAggregate:
        async () => ({ fixtures: [] }),
      loadCanonicalByDay:
        async () => ({}),
      builders: builders(),
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

  assert.throws(
    () => buildP0CP4ReadyFamilyRunnerRegistry({
      otherImplementations: {
        ...otherImplementations,
        H2H_INDEX: async () => ({
          completeFamilyOutput: true,
          outputs: [],
        }),
      },
      builders: builders(),
    }),
    /override_forbidden:H2H_INDEX/,
  );
});
