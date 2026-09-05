import test from "node:test";
import assert from "node:assert/strict";

import {
  applyProductionIdentityMembershipGate,
  backfillCanonicalFixtureIds,
  fixtureBelongsToAthensDay,
  mergeCanonicalWithRuntimeOverlay
} from "./day-fixture-universe.js";

import {
  canonicalTeamName
} from "../storage/team-aliases-db.js";

function canonicalFixture(
  overrides = {}
) {
  return {
    canonicalId:
      "cid_col2_quindio_bocajuniors_20260725",

    matchId:
      "FS-QUINDIO",

    source:
      "flashscore",

    sourceId:
      "FS-QUINDIO",

    sourceMatchId:
      "FS-QUINDIO",

    leagueSlug:
      "col.2",

    dayKey:
      "2026-07-25",

    kickoffUtc:
      "2026-07-24T21:05:00.000Z",

    homeTeam:
      "Quindio",

    awayTeam:
      "Boca Juniors",

    status:
      "STATUS_SCHEDULED",

    rawStatus:
      "STATUS_SCHEDULED",

    scoreHome: null,
    scoreAway: null,

    ...overrides
  };
}

test(
  "canonical read path derives missing canonicalId without mutating stored truth row",
  () => {
    const source = {
      matchId:
        "401907192",

      sourceId:
        "401907192",

      sourceMatchId:
        "401907192",

      leagueSlug:
        "ned.cup",

      dayKey:
        "2026-09-01",

      homeTeam:
        "Be Quick 1887",

      awayTeam:
        "AFC"
    };

    const result =
      backfillCanonicalFixtureIds(
        [source],
        "2026-09-01"
      );

    assert.equal(
      source.canonicalId,
      undefined
    );

    assert.equal(
      result.length,
      1
    );

    assert.equal(
      result[0].canonicalId,
      "cid_nedcup_bequick1887_afc_20260901"
    );

    assert.equal(
      result[0].matchId,
      "401907192"
    );
  }
);

test(
  "canonical read path preserves an existing canonicalId",
  () => {
    const source = {
      canonicalId:
        "cid_existing_authoritative_identity",

      matchId:
        "provider-1",

      leagueSlug:
        "ned.cup",

      homeTeam:
        "Example Home",

      awayTeam:
        "Example Away",

      dayKey:
        "2026-09-01"
    };

    const [result] =
      backfillCanonicalFixtureIds(
        [source],
        "2026-09-01"
      );

    assert.strictEqual(
      result,
      source
    );

    assert.equal(
      result.canonicalId,
      "cid_existing_authoritative_identity"
    );
  }
);

test(
  "derived canonicalId collision fails closed",
  () => {
    assert.throws(
      () =>
        backfillCanonicalFixtureIds(
          [
            {
              matchId:
                "provider-a",

              leagueSlug:
                "ned.cup",

              homeTeam:
                "Be Quick 1887",

              awayTeam:
                "AFC"
            },
            {
              matchId:
                "provider-b",

              leagueSlug:
                "ned.cup",

              homeTeam:
                "Be Quick 1887",

              awayTeam:
                "AFC"
            }
          ],
          "2026-09-01"
        ),
      /canonical_fixture_identity_collision/
    );
  }
);


test(
  "kickoff Athens day overrides an incorrect stored dayKey",
  () => {
    assert.equal(
      fixtureBelongsToAthensDay(
        {
          dayKey:
            "2026-07-25",

          kickoffUtc:
            "2026-07-25T21:30:00.000Z"
        },
        "2026-07-25"
      ),
      false
    );

    assert.equal(
      fixtureBelongsToAthensDay(
        {
          dayKey:
            "2026-07-24",

          kickoffUtc:
            "2026-07-24T21:30:00.000Z"
        },
        "2026-07-25"
      ),
      true
    );
  }
);

test(
  "missing or malformed kickoff fails closed even when stored dayKey matches",
  () => {
    assert.equal(
      fixtureBelongsToAthensDay(
        {
          dayKey:
            "2026-07-25",

          kickoffUtc: null
        },
        "2026-07-25"
      ),
      false
    );

    assert.equal(
      fixtureBelongsToAthensDay(
        {
          dayKey:
            "2026-07-25",

          kickoffUtc:
            "not-a-date"
        },
        "2026-07-25"
      ),
      false
    );
  }
);

test(
  "runtime-only fixtures cannot enter the canonical day universe",
  () => {
    const canonical = [
      canonicalFixture()
    ];

    const runtime = [
      {
        ...canonicalFixture(),

        status:
          "FT",

        rawStatus:
          "STATUS_FULL_TIME",

        scoreHome: 0,
        scoreAway: 1,

        updatedAt: 20
      },

      {
        canonicalId:
          "cid_col2_future_runtime_only_20260725",

        matchId:
          "401999999",

        source:
          "espn",

        sourceId:
          "401999999",

        sourceMatchId:
          "401999999",

        leagueSlug:
          "col.2",

        dayKey:
          "2026-07-25",

        kickoffUtc:
          "2026-07-25T18:00:00.000Z",

        homeTeam:
          "Future Home",

        awayTeam:
          "Future Away",

        status:
          "PRE",

        rawStatus:
          "STATUS_SCHEDULED"
      }
    ];

    const result =
      mergeCanonicalWithRuntimeOverlay(
        canonical,
        runtime,
        "2026-07-25"
      );

    assert.equal(
      result.fixtures.length,
      1
    );

    assert.equal(
      result.runtimeOverlayCount,
      1
    );

    assert.equal(
      result.runtimeOnlyExcludedCount,
      1
    );

    assert.deepEqual(
      result.runtimeOnlyExcludedIds,
      [
        "cid_col2_future_runtime_only_20260725"
      ]
    );

    assert.equal(
      result.fixtures[0].status,
      "FT"
    );

    assert.equal(
      result.fixtures[0].scoreHome,
      0
    );

    assert.equal(
      result.fixtures[0].scoreAway,
      1
    );
  }
);

test(
  "canonical identity and Colombia display names remain authoritative",
  () => {
    const result =
      mergeCanonicalWithRuntimeOverlay(
        [
          canonicalFixture()
        ],
        [
          {
            ...canonicalFixture(),

            homeTeam:
              "Wrong Runtime Home",

            awayTeam:
              "Wrong Runtime Away",

            kickoffUtc:
              "2026-07-25T18:00:00.000Z",

            status:
              "FT",

            rawStatus:
              "STATUS_FULL_TIME",

            scoreHome: 0,
            scoreAway: 1
          }
        ],
        "2026-07-25"
      );

    const [row] =
      result.fixtures;

    assert.equal(
      row.canonicalId,
      "cid_col2_quindio_bocajuniors_20260725"
    );

    assert.equal(
      row.kickoffUtc,
      "2026-07-24T21:05:00.000Z"
    );

    assert.equal(
      row.homeTeam,
      "Deportes Quindío"
    );

    assert.equal(
      row.awayTeam,
      "Boca Juniors de Cali"
    );
  }
);

test(
  "Colombia aliases are league-scoped",
  () => {
    assert.equal(
      canonicalTeamName(
        "col.2",
        "Boca Juniors"
      ),
      "Boca Juniors de Cali"
    );

    assert.equal(
      canonicalTeamName(
        "arg.1",
        "Boca Juniors"
      ),
      "Boca Juniors"
    );

    assert.equal(
      canonicalTeamName(
        "col.2",
        "Tigres"
      ),
      "Tigres FC"
    );

    assert.equal(
      canonicalTeamName(
        "col.2",
        "Leones"
      ),
      "Itagüí Leones"
    );
  }
);

test(
  "ambiguous canonical provider identity fails closed",
  () => {
    const canonical = [
      canonicalFixture({
        canonicalId:
          "cid_one",

        sourceId:
          "SHARED-ID",

        sourceMatchId:
          "SHARED-ID"
      }),

      canonicalFixture({
        canonicalId:
          "cid_two",

        matchId:
          "OTHER-ID",

        sourceId:
          "SHARED-ID",

        sourceMatchId:
          "SHARED-ID",

        homeTeam:
          "Other Home",

        awayTeam:
          "Other Away"
      })
    ];

    const runtime = [
      {
        ...canonicalFixture(),

        canonicalId: null,
        matchId:
          "SHARED-ID",

        sourceId:
          "SHARED-ID",

        sourceMatchId:
          "SHARED-ID",

        status:
          "FT",

        rawStatus:
          "STATUS_FULL_TIME",

        scoreHome: 1,
        scoreAway: 0
      }
    ];

    const result =
      mergeCanonicalWithRuntimeOverlay(
        canonical,
        runtime,
        "2026-07-25"
      );

    assert.equal(
      result.runtimeOverlayCount,
      0
    );

    assert.equal(
      result.runtimeOnlyExcludedCount,
      1
    );

    assert.ok(
      result
        .ambiguousCanonicalAliasCount >
      0
    );
  }
);


function fakeProductionIdentityResolver() {
  const retained =
    "cid_test_retained_20260725";

  const suppressed =
    "cid_test_suppressed_20260725";

  return {
    resolveFixtureId(fixtureId) {
      if (fixtureId === retained) {
        return {
          ok: true,
          status:
            "RETAINED_FIXTURE_IDEMPOTENT",
          sourceFixtureId: fixtureId,
          resolvedFixtureId: retained,
          sourceRole: "retained",
          fixtureRetentionDecisionId:
            "p0cret_test",
          dayKey: "2026-07-25",
          leagueSlug: "test.1",
          homeGlobalClubId:
            "gcid_test_home",
          awayGlobalClubId:
            "gcid_test_away",
        };
      }

      if (fixtureId === suppressed) {
        return {
          ok: true,
          status:
            "SUPPRESSED_FIXTURE_LINEAGE_ALIAS_RESOLVED",
          sourceFixtureId: fixtureId,
          resolvedFixtureId: retained,
          sourceRole:
            "suppressed_lineage_alias",
          fixtureRetentionDecisionId:
            "p0cret_test",
          dayKey: "2026-07-25",
          leagueSlug: "test.1",
          homeGlobalClubId:
            "gcid_test_home",
          awayGlobalClubId:
            "gcid_test_away",
        };
      }

      return {
        ok: false,
        status: "UNKNOWN_FIXTURE_ID",
        sourceFixtureId: fixtureId,
      };
    }
  };
}

test(
  "unmanaged fixtures pass through the production identity gate",
  () => {
    const row =
      canonicalFixture({
        canonicalId:
          "cid_unmanaged_fixture_20260725"
      });

    const result =
      applyProductionIdentityMembershipGate(
        [row],
        {
          resolver:
            fakeProductionIdentityResolver()
        }
      );

    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0], row);
    assert.equal(
      result.diagnostics.unmanagedRows,
      1
    );
  }
);

test(
  "managed retained fixture receives an additive identity overlay",
  () => {
    const result =
      applyProductionIdentityMembershipGate(
        [
          canonicalFixture({
            canonicalId:
              "cid_test_retained_20260725"
          })
        ],
        {
          resolver:
            fakeProductionIdentityResolver()
        }
      );

    assert.equal(result.rows.length, 1);
    assert.equal(
      result.rows[0].homeGlobalClubId,
      "gcid_test_home"
    );
    assert.equal(
      result.rows[0].awayGlobalClubId,
      "gcid_test_away"
    );
    assert.equal(
      result.diagnostics.identityOverlayRows,
      1
    );
  }
);

test(
  "suppressed alias is excluded when its retained target is present",
  () => {
    const result =
      applyProductionIdentityMembershipGate(
        [
          canonicalFixture({
            canonicalId:
              "cid_test_suppressed_20260725"
          }),
          canonicalFixture({
            canonicalId:
              "cid_test_retained_20260725",
            matchId:
              "RETAINED"
          })
        ],
        {
          resolver:
            fakeProductionIdentityResolver()
        }
      );

    assert.equal(result.rows.length, 1);
    assert.equal(
      result.rows[0].canonicalId,
      "cid_test_retained_20260725"
    );
    assert.equal(
      result.diagnostics
        .suppressedWithRetainedTarget,
      1
    );
    assert.equal(
      result.diagnostics
        .suppressedWithoutRetainedTarget,
      0
    );
  }
);

test(
  "suppressed-only alias fails closed and cannot create membership",
  () => {
    const result =
      applyProductionIdentityMembershipGate(
        [
          canonicalFixture({
            canonicalId:
              "cid_test_suppressed_20260725"
          })
        ],
        {
          resolver:
            fakeProductionIdentityResolver()
        }
      );

    assert.equal(result.rows.length, 0);
    assert.equal(
      result.diagnostics
        .suppressedWithoutRetainedTarget,
      1
    );
    assert.deepEqual(
      result.diagnostics
        .suppressedWithoutTargetFixtureIds,
      [
        "cid_test_suppressed_20260725"
      ]
    );
  }
);

test(
  "conflicting pre-existing global club IDs fail closed",
  () => {
    assert.throws(
      () =>
        applyProductionIdentityMembershipGate(
          [
            canonicalFixture({
              canonicalId:
                "cid_test_retained_20260725",
              homeGlobalClubId:
                "gcid_wrong_home"
            })
          ],
          {
            resolver:
              fakeProductionIdentityResolver()
          }
        ),
      /production_identity_overlay_conflict/
    );
  }
);
