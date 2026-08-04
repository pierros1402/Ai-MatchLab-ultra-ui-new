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
    deploySnapshotDetails: ({
      dayKey,
      inventoryPaths,
      sourceDetails,
      existingDeployDetails,
      fixtureRows,
      preserveExistingDetails,
      patchedAt,
    }) => ({
      schema:
        "ai-matchlab.p0c-p4-deploy-snapshot-details.v1",
      ok:
        true,
      date:
        dayKey,
      completeFamilyOutput:
        true,
      outputs:
        inventoryPaths.map(relativePath => ({
          relativePath,
          action:
            "write",
          content: {
            dayKey,
            relativePath,
            sourceDetails:
              sourceDetails.length,
            existingDeployDetails:
              existingDeployDetails.length,
            fixtureRows:
              fixtureRows.length,
            preserveExistingDetails,
            patchedAt,
          },
          bytes:
            1,
          sha256:
            "b".repeat(64),
        })),
      diagnostics: {
        inventoryPathCount:
          inventoryPaths.length,
      },
    }),
    deploySnapshotFixturesFromArtifacts: ({
      dayKey,
      fixtureUniverse,
      fixturesAll,
    }) => ({
      ok: true,
      date: dayKey,
      count:
        fixtureUniverse.fixtures.length,
      fixtures:
        fixtureUniverse.fixtures.map(row => ({
          ...row,
          displayRows:
            fixturesAll.matches.length,
        })),
    }),
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
    deploySnapshotOdds: ({
      dayKey,
      generatedAt,
      oddsDay,
    }) => ({
      ok: true,
      date: dayKey,
      generatedAt,
      source:
        "autonomous-odds-capture",
      hash:
        "a".repeat(40),
      count:
        oddsDay.count,
      matches:
        oddsDay.matches,
    }),
    expectedMatchViewFromExisting: ({
      dayKey,
      fixturesAll,
      existingArtifact,
    }) => ({
      schema: "test-expected-match",
      dayKey,
      recordedAt:
        existingArtifact.recordedAt,
      source:
        existingArtifact.source,
      matchCount:
        fixturesAll.matches.length,
      matches:
        fixturesAll.matches,
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

test("publishes the exact twelve pure-builder-ready families", () => {
  assert.equal(
    P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
    "ai-matchlab.p0c-p4-ready-family-adapters.v1",
  );
  assert.deepEqual(
    P0C_P4_READY_FAMILY_NAMES,
    [
      "DEPLOY_SNAPSHOT_DETAILS",
      "DEPLOY_SNAPSHOT_FIXTURES",
      "DEPLOY_SNAPSHOT_FIXTURES_ALL",
      "DEPLOY_SNAPSHOT_ODDS",
      "EXPECTED_MATCH_VIEW",
      "H2H_INDEX",
      "LEGACY_FIXTURES_AGGREGATE",
      "VALUE_PLAN_ARTIFACT",
      "VALUE_AUDIT_ARTIFACT",
      "VALUE_COMPARISON",
      "DEPLOY_SNAPSHOT_VALUE",
      "DEPLOY_SNAPSHOT_VALUE_AUDIT",
    ],
  );
});

test("deploy-snapshot details adapter groups inventory by day and preserves explicit deletions", async () => {
  const calls = [];
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadSourceDetailRecordsForDay:
        async ({ dayKey }) => {
          calls.push(`source:${dayKey}`);
          return [
            {
              path:
                `data/details/${dayKey}/source.json`,
              detail: {
                matchId:
                  `source:${dayKey}`,
              },
            },
          ];
        },
      loadExistingDeployDetailRecordsForDay:
        async ({ dayKey }) => {
          calls.push(`existing:${dayKey}`);
          return [];
        },
      loadPublishedFixtureRowsForDay:
        async ({ dayKey }) => {
          calls.push(`fixtures:${dayKey}`);
          return [
            {
              canonicalId:
                `fixture:${dayKey}`,
            },
          ];
        },
      loadPreserveExistingDetailsForDay:
        async ({ dayKey }) => {
          calls.push(`preserve:${dayKey}`);
          return true;
        },
      loadDetailsPatchedAtForDay:
        async ({ dayKey }) => {
          calls.push(`patched:${dayKey}`);
          return `${dayKey}T06:00:00.000Z`;
        },
      builders: builders({
        deploySnapshotDetails: ({
          dayKey,
          inventoryPaths,
        }) => ({
          schema:
            "ai-matchlab.p0c-p4-deploy-snapshot-details.v1",
          ok:
            true,
          date:
            dayKey,
          completeFamilyOutput:
            true,
          outputs:
            inventoryPaths.map(relativePath =>
              relativePath.endsWith(
                "/stale.json",
              )
                ? {
                    relativePath,
                    action:
                      "delete",
                    reason:
                      "detail_not_retained",
                  }
                : {
                    relativePath,
                    action:
                      "write",
                    content: {
                      dayKey,
                    },
                    bytes:
                      2,
                    sha256:
                      "c".repeat(64),
                  },
            ),
          diagnostics: {
            inventoryPathCount:
              inventoryPaths.length,
          },
        }),
      }),
    });

  const result =
    await implementations
      .DEPLOY_SNAPSHOT_DETAILS(
        context(
          "DEPLOY_SNAPSHOT_DETAILS",
          [
            "data/deploy-snapshots/2026-05-02/details/alpha.json",
            "data/deploy-snapshots/2026-05-02/details/stale.json",
            "data/deploy-snapshots/2026-05-03/details/beta.json",
          ],
        ),
      );

  assert.equal(
    result.completeFamilyOutput,
    true,
  );
  assert.equal(result.outputs.length, 3);
  assert.equal(
    result.outputs[0].relativePath,
    "data/deploy-snapshots/2026-05-02/details/alpha.json",
  );
  assert.equal(
    result.outputs[1].action,
    "delete",
  );
  assert.equal(
    result.diagnostics.emittedWriteCount,
    2,
  );
  assert.equal(
    result.diagnostics.emittedDeletionCount,
    1,
  );
  assert.equal(
    result.diagnostics.detailBuildPerformed,
    false,
  );
  assert.equal(
    result.diagnostics.deletionAwareOutputSupported,
    true,
  );
  assert.deepEqual(calls, [
    "source:2026-05-02",
    "existing:2026-05-02",
    "fixtures:2026-05-02",
    "preserve:2026-05-02",
    "patched:2026-05-02",
    "source:2026-05-03",
    "existing:2026-05-03",
    "fixtures:2026-05-03",
    "preserve:2026-05-03",
    "patched:2026-05-03",
  ]);
});

test("deploy-snapshot fixtures adapter emits one exact write per inventory day", async () => {
  const calls = [];
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadFixtureUniverseArtifactForDay:
        async ({ dayKey }) => {
          calls.push(`universe:${dayKey}`);
          return {
            fixtures: [
              {
                canonicalId:
                  `cid:${dayKey}`,
              },
            ],
          };
        },
      loadFixturesAllArtifactForDay:
        async ({ dayKey }) => {
          calls.push(`fixtures-all:${dayKey}`);
          return {
            matches: [
              {
                canonicalId:
                  `cid:${dayKey}`,
              },
            ],
          };
        },
      builders: builders(),
    });

  const result =
    await implementations
      .DEPLOY_SNAPSHOT_FIXTURES(
        context(
          "DEPLOY_SNAPSHOT_FIXTURES",
          [
            "data/deploy-snapshots/2026-05-02/fixtures.json",
            "data/deploy-snapshots/2026-05-03/fixtures.json",
          ],
        ),
      );

  assert.equal(result.completeFamilyOutput, true);
  assert.equal(result.outputs.length, 2);
  assert.equal(
    result.outputs[0].relativePath,
    "data/deploy-snapshots/2026-05-02/fixtures.json",
  );
  assert.equal(result.outputs[0].action, "write");
  assert.equal(result.outputs[0].content.count, 1);
  assert.equal(
    result.outputs[0].content.fixtures[0].displayRows,
    1,
  );
  assert.deepEqual(calls, [
    "universe:2026-05-02",
    "fixtures-all:2026-05-02",
    "universe:2026-05-03",
    "fixtures-all:2026-05-03",
  ]);
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

test("deploy-snapshot odds adapter emits one exact write per inventory day", async () => {
  const calls = [];
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadOddsDayForDay:
        async ({ dayKey }) => {
          calls.push(`odds:${dayKey}`);
          return {
            count:
              7,
            matches: [
              {
                matchId:
                  `match:${dayKey}`,
              },
            ],
          };
        },
      loadOddsGeneratedAtForDay:
        async ({ dayKey }) => {
          calls.push(`generated:${dayKey}`);
          return `${dayKey}T05:00:00.000Z`;
        },
      builders: builders(),
    });

  const result =
    await implementations
      .DEPLOY_SNAPSHOT_ODDS(
        context(
          "DEPLOY_SNAPSHOT_ODDS",
          [
            "data/deploy-snapshots/2026-05-02/odds.json",
            "data/deploy-snapshots/2026-05-03/odds.json",
          ],
        ),
      );

  assert.equal(result.completeFamilyOutput, true);
  assert.equal(result.outputs.length, 2);
  assert.equal(
    result.outputs[0].relativePath,
    "data/deploy-snapshots/2026-05-02/odds.json",
  );
  assert.equal(result.outputs[0].action, "write");
  assert.equal(result.outputs[0].content.count, 7);
  assert.equal(
    result.outputs[0].content.matches.length,
    1,
  );
  assert.equal(
    result.diagnostics.oddsCapturePerformed,
    false,
  );
  assert.deepEqual(calls, [
    "odds:2026-05-02",
    "generated:2026-05-02",
    "odds:2026-05-03",
    "generated:2026-05-03",
  ]);
});

test("expected-match adapter rebuilds every inventory day from fixtures-all", async () => {
  const calls = [];
  const implementations =
    createP0CP4ReadyFamilyImplementations({
      loadFixturesAllArtifactForDay:
        async ({ dayKey }) => {
          calls.push(`fixtures:${dayKey}`);
          return {
            matches: [
              {
                matchId: `match:${dayKey}`,
              },
            ],
          };
        },
      loadExistingExpectedMatchViewForDay:
        async ({ dayKey }) => {
          calls.push(`existing:${dayKey}`);
          return {
            dayKey,
            recordedAt:
              `${dayKey}T04:30:00.000Z`,
            source:
              "fixtures-all",
          };
        },
      builders: builders(),
    });

  const result =
    await implementations.EXPECTED_MATCH_VIEW(
      context(
        "EXPECTED_MATCH_VIEW",
        [
          "data/expected-matches/2026-05-02.json",
          "data/expected-matches/2026-05-03.json",
        ],
      ),
    );

  assert.equal(result.completeFamilyOutput, true);
  assert.equal(result.outputs.length, 2);
  assert.equal(
    result.outputs[0].relativePath,
    "data/expected-matches/2026-05-02.json",
  );
  assert.equal(
    result.outputs[0].content.recordedAt,
    "2026-05-02T04:30:00.000Z",
  );
  assert.equal(
    result.outputs[0].content.matchCount,
    1,
  );
  assert.deepEqual(calls, [
    "fixtures:2026-05-02",
    "existing:2026-05-02",
    "fixtures:2026-05-03",
    "existing:2026-05-03",
  ]);
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
