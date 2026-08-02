import test from "node:test";
import assert from "node:assert/strict";

import {
  bindVerifiedFinalResultPayloadIdentity,
  resolveTerminalScoreConvergence,
  buildConvergedVerifiedFinalResult
} from "../jobs/export-verified-final-results-day.js";

const dayKey =
  "2026-07-29";

function targetWithCanonical({
  canonicalHome = 1,
  canonicalAway = 4,
  status = "FT",
  rawStatus = "STATUS_FULL_TIME",
  statusType = "STATUS_FINAL",
  operationalState = "FT"
} = {}) {
  return {
    matchId:
      "cid_uefachampions_lechpoznan_agf_20260729",

    leagueSlug:
      "uefa.champions",

    leagueName:
      "UEFA Champions League",

    country:
      "Europe",

    homeTeam:
      "Lech Poznan",

    awayTeam:
      "AGF",

    kickoffUtc:
      "2026-07-29T18:30:00.000Z",

    canonicalFixture: {
      canonicalId:
        "cid_uefachampions_lechpoznan_agf_20260729",

      source:
        "espn",

      sourceId:
        "401877766",

      providerMatchId:
        "401877766",

      leagueSlug:
        "uefa.champions",

      leagueName:
        "UEFA Champions League",

      dayKey,

      kickoffUtc:
        "2026-07-29T18:30:00.000Z",

      homeTeam:
        "Lech Poznan",

      awayTeam:
        "AGF",

      scoreHome:
        canonicalHome,

      scoreAway:
        canonicalAway,

      status,
      rawStatus,
      statusType,
      operationalState,

      lastSeenAt:
        "2026-07-29T21:15:00.000Z"
    }
  };
}

function flashscoreMatch({
  homeScore,
  awayScore
}) {
  return {
    ok:
      true,

    matchTier:
      "token",

    row: {
      matchId:
        "QFe0V8qQ",

      country:
        "Europe",

      leagueName:
        "UEFA Champions League",

      leaguePath:
        "europe/champions-league",

      home:
        "Lech Poznan",

      away:
        "Aarhus",

      scoreHome:
        homeScore,

      scoreAway:
        awayScore,

      kickoffUtc:
        "2026-07-29T18:30:00.000Z"
    }
  };
}

test(
  "holds settlement when Flashscore and canonical ESPN terminal scores disagree",
  () => {
    const result =
      resolveTerminalScoreConvergence({
        target:
          targetWithCanonical({
            canonicalHome:
              1,

            canonicalAway:
              4
          }),

        dayKey,

        flashscoreMatch:
          flashscoreMatch({
            homeScore:
              1,

            awayScore:
              5
          })
      });

    assert.equal(
      result.state,
      "pending_recheck"
    );

    assert.equal(
      result.reason,
      "terminal_score_conflict_pending_recheck"
    );

    assert.equal(
      result.flashscoreScoreKey,
      "1-5"
    );

    assert.equal(
      result.canonicalScoreKey,
      "1-4"
    );
  }
);

test(
  "promotes the shared score after both terminal sources converge",
  () => {
    const target =
      targetWithCanonical();

    const found =
      flashscoreMatch({
        homeScore:
          1,

        awayScore:
          4
      });

    const convergence =
      resolveTerminalScoreConvergence({
        target,
        dayKey,
        flashscoreMatch:
          found
      });

    assert.equal(
      convergence.state,
      "converged"
    );

    const payload =
      buildConvergedVerifiedFinalResult(
        dayKey,
        target,
        found.row,
        convergence
      );

    assert.equal(
      payload.scoreKey,
      "1-4"
    );

    assert.equal(
      payload.source,
      "terminal_score_sources_converged"
    );

    assert.equal(
      payload.sourceCount,
      2
    );

    assert.equal(
      payload.independentSourceCount,
      2
    );

    assert.deepEqual(
      payload.sources.map(
        source =>
          source.provider
      ),
      [
        "espn",
        "flashscore"
      ]
    );

    assert.equal(
      payload.verification
        .checks
        .terminalScoresConverged,
      true
    );

    assert.equal(
      payload.settlement
        .convergenceState,
      "converged"
    );
  }
);

test(
  "keeps Flashscore-only fallback when ESPN is not explicitly terminal",
  () => {
    const result =
      resolveTerminalScoreConvergence({
        target:
          targetWithCanonical({
            status:
              "SCHEDULED",

            rawStatus:
              "STATUS_SCHEDULED",

            statusType:
              "STATUS_SCHEDULED",

            operationalState:
              "PRE"
          }),

        dayKey,

        flashscoreMatch:
          flashscoreMatch({
            homeScore:
              2,

            awayScore:
              0
          })
      });

    assert.equal(
      result.state,
      "flashscore_only"
    );

    assert.equal(
      result.flashscoreScoreKey,
      "2-0"
    );

    assert.equal(
      result.reason,
      "canonical_espn_status_not_terminal"
    );
  }
);


test(
  "identity binding is orthogonal to converged terminal score truth",
  () => {
    const target =
      targetWithCanonical();

    const convergence =
      resolveTerminalScoreConvergence({
        target,
        dayKey,
        flashscoreMatch:
          flashscoreMatch({
            homeScore:
              1,
            awayScore:
              4,
          }),
      });

    assert.equal(
      convergence.state,
      "converged",
    );

    const payload =
      buildConvergedVerifiedFinalResult(
        dayKey,
        target,
        flashscoreMatch({
          homeScore:
            1,
          awayScore:
            4,
        }).row,
        convergence,
      );

    const resolver = {
      resolveFixtureId(value) {
        if (
          value ===
          target.matchId
        ) {
          return {
            ok: true,
            resolvedFixtureId:
              target.matchId,
            sourceRole:
              "retained",
            fixtureRetentionDecisionId:
              "frd_test",
            homeGlobalClubId:
              "gcid_lech",
            awayGlobalClubId:
              "gcid_agf",
          };
        }

        return {
          ok: false,
          status:
            "UNKNOWN_FIXTURE_ID",
        };
      },
    };

    const bound =
      bindVerifiedFinalResultPayloadIdentity(
        payload,
        { resolver },
      );

    assert.equal(
      bound.scoreKey,
      "1-4",
    );
    assert.equal(
      bound.scoreHome,
      1,
    );
    assert.equal(
      bound.scoreAway,
      4,
    );
    assert.equal(
      bound.homeGlobalClubId,
      "gcid_lech",
    );
    assert.equal(
      bound.awayGlobalClubId,
      "gcid_agf",
    );
  },
);
