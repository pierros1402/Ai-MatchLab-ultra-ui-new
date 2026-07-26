import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveExpectedCanonicalOutcome
} from "../jobs/verify-results-day.js";

const dayKey = "2026-07-25";

function expected(overrides = {}) {
  return {
    matchId: "cid_test_expected_20260725",
    leagueSlug: "test.1",
    home: "Home",
    away: "Away",
    kickoffUtc: "2026-07-25T15:00:00.000Z",
    ...overrides
  };
}

function canonical(overrides = {}) {
  return {
    canonicalId: "cid_test_canonical_20260725",
    matchId: "cid_test_canonical_20260725",
    source: "espn",
    sourceId: "123456",
    sourceMatchId: "123456",
    leagueSlug: "test.1",
    dayKey,
    kickoffUtc: "2026-07-25T15:00:00.000Z",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    statusType: "STATUS_FINAL",
    scoreHome: 2,
    scoreAway: 1,
    ...overrides
  };
}

test("accepts an exact canonical terminal result", () => {
  const result = resolveExpectedCanonicalOutcome(
    expected({
      matchId: "cid_ecu2_cuencajuniors_atletico_20260725",
      leagueSlug: "ecu.2",
      home: "Cuenca Juniors",
      away: "Atletico FC",
      kickoffUtc: "2026-07-24T21:30:00.000Z"
    }),
    [
      canonical({
        canonicalId:
          "cid_ecu2_cuencajuniors_atletico_20260725",
        matchId:
          "cid_ecu2_cuencajuniors_atletico_20260725",
        source: "flashscore",
        sourceId: "xjWLXvZ4",
        sourceMatchId: "xjWLXvZ4",
        leagueSlug: "ecu.2",
        homeTeam: "Cuenca Juniors",
        awayTeam: "Atletico FC",
        kickoffUtc: "2026-07-24T21:30:00.000Z",
        status: "FT",
        rawStatus: "STATUS_FINAL",
        statusType: "STATUS_FINAL",
        scoreHome: 0,
        scoreAway: 0
      })
    ],
    dayKey
  );

  assert.equal(result.ok, true);
  assert.equal(result.classification, "verified_terminal");
  assert.equal(result.scoreKey, "0-0");
  assert.equal(result.matchMethod, "exact_canonical_id");
});

test("uses the shared fail-closed team identity matcher for a unique canonical row", () => {
  const result = resolveExpectedCanonicalOutcome(
    expected({
      matchId: "cid_nor1_kristiansund_start_20260725",
      leagueSlug: "nor.1",
      home: "Kristiansund",
      away: "Start",
      kickoffUtc: "2026-07-25T14:00:00.000Z"
    }),
    [
      canonical({
        canonicalId:
          "cid_nor1_kristiansund_ikstart_20260725",
        matchId:
          "401873924",
        sourceId:
          "401873924",
        sourceMatchId:
          "401873924",
        leagueSlug:
          "nor.1",
        homeTeam:
          "Kristiansund BK",
        awayTeam:
          "IK Start",
        kickoffUtc:
          "2026-07-25T14:00Z",
        scoreHome:
          1,
        scoreAway:
          2
      })
    ],
    dayKey
  );

  assert.equal(result.ok, true);
  assert.equal(result.classification, "verified_terminal");
  assert.equal(result.scoreKey, "1-2");
  assert.equal(
    result.matchMethod,
    "unique_league_kickoff_team_identity"
  );
});

test("recognises an explicit canonical postponed outcome", () => {
  const result = resolveExpectedCanonicalOutcome(
    expected({
      matchId:
        "cid_chi1_coquimbo_uconcepcion_20260725",
      leagueSlug:
        "chi.1",
      home:
        "Coquimbo",
      away:
        "U. De Concepcion",
      kickoffUtc:
        "2026-07-25T19:00:00.000Z"
    }),
    [
      canonical({
        canonicalId:
          "cid_chi1_coquimbounido_universidadconcepcion_20260725",
        matchId:
          "hURr4uXQ",
        source:
          "flashscore",
        sourceId:
          "hURr4uXQ",
        sourceMatchId:
          "hURr4uXQ",
        leagueSlug:
          "chi.1",
        homeTeam:
          "Coquimbo Unido",
        awayTeam:
          "Universidad de Concepción",
        kickoffUtc:
          "2026-07-25T19:00Z",
        status:
          "SPECIAL",
        rawStatus:
          "STATUS_POSTPONED",
        statusType:
          "STATUS_POSTPONED",
        scoreHome:
          null,
        scoreAway:
          null
      })
    ],
    dayKey
  );

  assert.equal(result.ok, true);
  assert.equal(result.classification, "verified_non_played");
  assert.equal(result.nonPlayedStatus, "POSTPONED");
  assert.equal(result.scoreKey, null);
});

test("does not accept PRE, LIVE or SECOND_HALF as terminal", () => {
  for (const row of [
    canonical({
      status: "PRE",
      rawStatus: "STATUS_SCHEDULED",
      statusType: "STATUS_SCHEDULED",
      scoreHome: 0,
      scoreAway: 0
    }),
    canonical({
      status: "LIVE",
      rawStatus: "STATUS_IN_PROGRESS",
      statusType: "STATUS_IN_PROGRESS",
      scoreHome: 1,
      scoreAway: 0
    }),
    canonical({
      status: "SECOND_HALF",
      rawStatus: "STATUS_SECOND_HALF",
      statusType: "STATUS_SECOND_HALF",
      scoreHome: 2,
      scoreAway: 0
    })
  ]) {
    const result = resolveExpectedCanonicalOutcome(
      expected(),
      [row],
      dayKey
    );

    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "matched_canonical_fixture_not_terminal"
    );
  }
});

test("fails closed when canonical identity matching is ambiguous", () => {
  const first = canonical({
    canonicalId: "cid_test_a_20260725"
  });

  const second = canonical({
    canonicalId: "cid_test_b_20260725"
  });

  const result = resolveExpectedCanonicalOutcome(
    expected(),
    [first, second],
    dayKey
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "ambiguous_canonical_fixture_match"
  );
  assert.equal(result.candidateCount, 2);
});

test("fails closed when league and kickoff contain multiple explicit non-played rows without an identity decision", () => {
  const rows = [
    canonical({
      canonicalId:
        "cid_test_postponed_a_20260725",
      matchId:
        "provider-postponed-a",
      homeTeam:
        "Different Home A",
      awayTeam:
        "Different Away A",
      status:
        "SPECIAL",
      rawStatus:
        "STATUS_POSTPONED",
      statusType:
        "STATUS_POSTPONED",
      scoreHome:
        null,
      scoreAway:
        null
    }),
    canonical({
      canonicalId:
        "cid_test_postponed_b_20260725",
      matchId:
        "provider-postponed-b",
      homeTeam:
        "Different Home B",
      awayTeam:
        "Different Away B",
      status:
        "SPECIAL",
      rawStatus:
        "STATUS_POSTPONED",
      statusType:
        "STATUS_POSTPONED",
      scoreHome:
        null,
      scoreAway:
        null
    })
  ];

  const result =
    resolveExpectedCanonicalOutcome(
      expected({
        home:
          "Unmatched Expected Home",
        away:
          "Unmatched Expected Away"
      }),
      rows,
      dayKey
    );

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "no_canonical_fixture_match"
  );
  assert.equal(result.candidateCount, 0);
});


test("uses immutable day-scoped identity decisions for known canonical CID transitions", () => {
  const cases = [
    {
      expectedMatchId:
        "cid_col1_depcali_jaguarescordoba_20260725",
      canonicalId:
        "cid_col1_deportivocali_jaguarescordoba_20260725",
      leagueSlug:
        "col.1",
      home:
        "Dep. Cali",
      away:
        "Jaguares de Cordoba",
      canonicalHome:
        "Deportivo Cali",
      canonicalAway:
        "Jaguares de Córdoba",
      kickoffUtc:
        "2026-07-25T01:15:00.000Z",
      scoreHome: 2,
      scoreAway: 0
    },

    {
      expectedMatchId:
        "cid_per1_udeportes_cusco_20260725",
      canonicalId:
        "cid_per1_universitario_cusco_20260725",
      leagueSlug:
        "per.1",
      home:
        "U. de Deportes",
      away:
        "Cusco",
      canonicalHome:
        "Universitario",
      canonicalAway:
        "Cusco FC",
      kickoffUtc:
        "2026-07-25T01:30:00.000Z",
      scoreHome: 2,
      scoreAway: 1
    },

    {
      expectedMatchId:
        "cid_uru1_centralesp_cerrolargo_20260725",
      canonicalId:
        "cid_uru1_centralespanolfutbol_cerrolargo_20260725",
      leagueSlug:
        "uru.1",
      home:
        "Central Esp.",
      away:
        "Cerro Largo",
      canonicalHome:
        "Central Español Fútbol Club",
      canonicalAway:
        "Cerro Largo",
      kickoffUtc:
        "2026-07-25T18:00:00.000Z",
      scoreHome: 0,
      scoreAway: 1
    }
  ];

  for (const item of cases) {
    const result =
      resolveExpectedCanonicalOutcome(
        expected({
          matchId:
            item.expectedMatchId,
          leagueSlug:
            item.leagueSlug,
          home:
            item.home,
          away:
            item.away,
          kickoffUtc:
            item.kickoffUtc
        }),
        [
          canonical({
            canonicalId:
              item.canonicalId,
            matchId:
              item.canonicalId,
            leagueSlug:
              item.leagueSlug,
            dayKey,
            kickoffUtc:
              item.kickoffUtc,
            homeTeam:
              item.canonicalHome,
            awayTeam:
              item.canonicalAway,
            status:
              "FT",
            rawStatus:
              "STATUS_FULL_TIME",
            scoreHome:
              item.scoreHome,
            scoreAway:
              item.scoreAway
          })
        ],
        dayKey
      );

    assert.equal(result.ok, true);
    assert.equal(
      result.matchMethod,
      "immutable_day_scoped_canonical_identity"
    );
    assert.equal(
      result.canonicalMatchId,
      item.canonicalId
    );
  }
});

test("never applies an immutable identity decision outside its pinned day", () => {
  const result =
    resolveExpectedCanonicalOutcome(
      expected({
        matchId:
          "cid_col1_depcali_jaguarescordoba_20260725",
        leagueSlug:
          "col.1",
        home:
          "Dep. Cali",
        away:
          "Jaguares de Cordoba",
        kickoffUtc:
          "2026-07-26T01:15:00.000Z"
      }),
      [
        canonical({
          canonicalId:
            "cid_col1_deportivocali_jaguarescordoba_20260725",
          matchId:
            "cid_col1_deportivocali_jaguarescordoba_20260725",
          leagueSlug:
            "col.1",
          dayKey:
            "2026-07-26",
          kickoffUtc:
            "2026-07-26T01:15:00.000Z",
          homeTeam:
            "Deportivo Cali",
          awayTeam:
            "Jaguares de Córdoba",
          status:
            "FT",
          rawStatus:
            "STATUS_FULL_TIME",
          scoreHome: 2,
          scoreAway: 0
        })
      ],
      "2026-07-26"
    );

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "no_canonical_fixture_match"
  );
});
