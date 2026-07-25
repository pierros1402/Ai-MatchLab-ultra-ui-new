import test from "node:test";
import assert from "node:assert/strict";

import {
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
      null
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
