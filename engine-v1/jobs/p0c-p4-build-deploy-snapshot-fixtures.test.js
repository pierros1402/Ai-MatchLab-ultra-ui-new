import test from "node:test";
import assert from "node:assert/strict";

import {
  enrichFixtureRowsFromDisplaySnapshot,
} from "./build-details-day.js";
import {
  P0C_P4_DEPLOY_SNAPSHOT_FIXTURES_SCHEMA,
  buildP0CP4DeploySnapshotFixtures,
  buildP0CP4DeploySnapshotFixturesFromArtifacts,
} from "./p0c-p4-build-deploy-snapshot-fixtures.js";

const DAY =
  "2026-05-02";

function baseRows() {
  return [
    {
      canonicalId:
        "cid_alpha_beta_20260502",
      matchId:
        "provider-101",
      sourceMatchId:
        "source-101",
      dayKey:
        DAY,
      homeTeam:
        "Alpha",
      awayTeam:
        "Beta",
    },
    {
      canonicalId:
        "cid_gamma_delta_20260502",
      matchId:
        "cid_gamma_delta_20260502",
      providerMatchId:
        "provider-202",
      dayKey:
        DAY,
      homeTeam:
        "Gamma",
      awayTeam:
        "Delta",
    },
  ];
}

test("publishes the source-bound deploy-snapshot fixtures schema", () => {
  assert.equal(
    P0C_P4_DEPLOY_SNAPSHOT_FIXTURES_SCHEMA,
    "ai-matchlab.p0c-p4-deploy-snapshot-fixtures.v1",
  );
});

test("builds the exact fixtures.json wrapper and aligns public matchId", () => {
  const result =
    buildP0CP4DeploySnapshotFixtures({
      dayKey: DAY,
      fixtureRows:
        baseRows(),
    });

  assert.equal(result.ok, true);
  assert.equal(result.date, DAY);
  assert.equal(result.count, 2);

  assert.equal(
    result.fixtures[0].matchId,
    "cid_alpha_beta_20260502",
  );

  assert.equal(
    result.fixtures[0].providerMatchId,
    "provider-101",
  );

  assert.equal(
    result.fixtures[1].matchId,
    "cid_gamma_delta_20260502",
  );

  assert.equal(
    result.fixtures[1].providerMatchId,
    "provider-202",
  );
});

test("enriches only verified provider rounds through exact identity aliases", () => {
  const result =
    buildP0CP4DeploySnapshotFixtures({
      dayKey: DAY,
      fixtureRows:
        baseRows(),
      displayRows: [
        {
          sourceMatchId:
            "source-101",
          providerRound: {
            verified:
              true,
            roundNumber:
              7,
          },
        },
      ],
    });

  assert.deepEqual(
    result.fixtures[0].providerRound,
    {
      status:
        "ready",
      verified:
        true,
      reason:
        null,
      source:
        "flashscore_match_page",
      roundNumber:
        7,
      roundLabel:
        "Round 7",
    },
  );

  assert.equal(
    result.fixtures[0].roundNumber,
    7,
  );

  assert.equal(
    result.fixtures[0].roundLabel,
    "Round 7",
  );
});

test("ignores unverified or invalid round evidence", () => {
  const result =
    buildP0CP4DeploySnapshotFixtures({
      dayKey: DAY,
      fixtureRows:
        baseRows(),
      displayRows: [
        {
          canonicalId:
            "cid_alpha_beta_20260502",
          providerRound: {
            verified:
              false,
            roundNumber:
              4,
          },
        },
        {
          canonicalId:
            "cid_gamma_delta_20260502",
          providerRound: {
            verified:
              true,
            roundNumber:
              4.5,
          },
        },
      ],
    });

  assert.equal(
    result.fixtures[0].providerRound,
    undefined,
  );

  assert.equal(
    result.fixtures[1].providerRound,
    undefined,
  );
});

test("display rows may enrich but can never create fixtures", () => {
  const result =
    buildP0CP4DeploySnapshotFixtures({
      dayKey: DAY,
      fixtureRows:
        [baseRows()[0]],
      displayRows: [
        {
          canonicalId:
            "cid_unplanned_fixture",
          providerRound: {
            verified:
              true,
            roundNumber:
              2,
          },
        },
      ],
    });

  assert.equal(result.count, 1);

  assert.equal(
    result.fixtures.some(
      row =>
        row.canonicalId ===
        "cid_unplanned_fixture",
    ),
    false,
  );
});

test("preserves fixture order and does not mutate either input array", () => {
  const fixtureRows =
    baseRows();

  const displayRows = [
    {
      canonicalId:
        "cid_alpha_beta_20260502",
      providerRound: {
        verified:
          true,
        roundNumber:
          3,
        roundLabel:
          "Matchday 3",
        source:
          "verified_test",
      },
    },
  ];

  const beforeFixtures =
    JSON.stringify(fixtureRows);

  const beforeDisplay =
    JSON.stringify(displayRows);

  const first =
    buildP0CP4DeploySnapshotFixtures({
      dayKey: DAY,
      fixtureRows,
      displayRows,
    });

  const second =
    buildP0CP4DeploySnapshotFixtures({
      dayKey: DAY,
      fixtureRows,
      displayRows,
    });

  assert.deepEqual(first, second);

  assert.equal(
    JSON.stringify(fixtureRows),
    beforeFixtures,
  );

  assert.equal(
    JSON.stringify(displayRows),
    beforeDisplay,
  );

  assert.equal(
    first.fixtures[0].homeTeam,
    "Alpha",
  );

  assert.equal(
    first.fixtures[1].homeTeam,
    "Gamma",
  );
});

test("preserves an existing providerMatchId when public matchId is realigned", () => {
  const result =
    buildP0CP4DeploySnapshotFixtures({
      dayKey: DAY,
      fixtureRows: [
        {
          canonicalId:
            "cid_alpha_beta_20260502",
          matchId:
            "provider-match",
          providerMatchId:
            "provider-explicit",
          dayKey:
            DAY,
        },
      ],
    });

  assert.equal(
    result.fixtures[0].providerMatchId,
    "provider-explicit",
  );
});

test("builds directly from fixture-universe and fixtures-all artifacts", () => {
  const result =
    buildP0CP4DeploySnapshotFixturesFromArtifacts({
      dayKey:
        DAY,
      fixtureUniverse: {
        fixtures:
          baseRows(),
      },
      fixturesAll: {
        matches: [
          {
            canonicalId:
              "cid_gamma_delta_20260502",
            providerRound: {
              verified:
                true,
              roundNumber:
                9,
              roundLabel:
                "Round Nine",
            },
          },
        ],
      },
    });

  assert.equal(result.count, 2);

  assert.equal(
    result.fixtures[1].roundNumber,
    9,
  );

  assert.equal(
    result.fixtures[1].roundLabel,
    "Round Nine",
  );
});

test("rejects invalid day, arrays and cross-day fixture rows", () => {
  assert.throws(
    () => buildP0CP4DeploySnapshotFixtures({
      dayKey:
        "2026-5-2",
      fixtureRows:
        [],
    }),
    /day_key_invalid/,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotFixtures({
      dayKey:
        DAY,
      fixtureRows:
        {},
    }),
    /fixture_rows_invalid/,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotFixtures({
      dayKey:
        DAY,
      fixtureRows: [
        {
          canonicalId:
            "cross-day",
          dayKey:
            "2026-05-03",
        },
      ],
    }),
    /day_mismatch/,
  );
});

test("rejects missing and duplicate public fixture identities", () => {
  assert.throws(
    () => buildP0CP4DeploySnapshotFixtures({
      dayKey:
        DAY,
      fixtureRows: [
        {
          dayKey:
            DAY,
        },
      ],
    }),
    /identity_missing/,
  );

  assert.throws(
    () => buildP0CP4DeploySnapshotFixtures({
      dayKey:
        DAY,
      fixtureRows: [
        {
          canonicalId:
            "duplicate",
          dayKey:
            DAY,
        },
        {
          matchId:
            "duplicate",
          dayKey:
            DAY,
        },
      ],
    }),
    /duplicate_identity:duplicate/,
  );
});

test("matches the current exporter enrichment and public-id alignment semantics", () => {
  const fixtureRows =
    baseRows();

  const displayRows = [
    {
      sourceMatchId:
        "source-101",
      providerRound: {
        verified:
          true,
        roundNumber:
          11,
      },
    },
  ];

  const exporterEnriched =
    enrichFixtureRowsFromDisplaySnapshot(
      DAY,
      fixtureRows,
      {
        displayRows,
      },
    );

  const exporterAligned =
    exporterEnriched.map(row => {
      const canonicalId =
        String(
          row?.canonicalId ||
          "",
        ).trim();

      if (
        !canonicalId ||
        String(row?.matchId || "") ===
          canonicalId
      ) {
        return row;
      }

      return {
        ...row,
        matchId:
          canonicalId,
        providerMatchId:
          row.providerMatchId ||
          row.matchId ||
          row.sourceMatchId ||
          null,
      };
    });

  const result =
    buildP0CP4DeploySnapshotFixtures({
      dayKey:
        DAY,
      fixtureRows,
      displayRows,
    });

  assert.deepEqual(
    result,
    {
      ok:
        true,
      date:
        DAY,
      count:
        exporterAligned.length,
      fixtures:
        exporterAligned,
    },
  );
});
