import test from "node:test";
import assert from "node:assert/strict";

import {
  overlayResultsTruth,
} from "./results-truth-overlay.js";

test("repairs an already-final match whose rawStatus is still scheduled", () => {
  const input = [{
    canonicalId: "cid_test_final_raw_status",
    leagueSlug: "test.1",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "FT",
    statusType: "FT",
    rawStatus: "STATUS_SCHEDULED",
    scoreHome: 0,
    scoreAway: 1,
  }];

  const [result] = overlayResultsTruth(input, "2026-07-28");

  assert.equal(result.status, "FT");
  assert.equal(result.statusType, "FT");
  assert.equal(result.rawStatus, "STATUS_FINAL");
  assert.equal(result.scoreHome, 0);
  assert.equal(result.scoreAway, 1);
});

test("leaves an already-consistent final match unchanged", () => {
  const input = [{
    canonicalId: "cid_test_consistent_final",
    leagueSlug: "test.1",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "FT",
    statusType: "FT",
    rawStatus: "STATUS_FINAL",
    scoreHome: 2,
    scoreAway: 0,
  }];

  const [result] = overlayResultsTruth(input, "2026-07-28");

  assert.deepEqual(result, input[0]);
});

test("does not convert a special non-played state into final", () => {
  const input = [{
    canonicalId: "cid_test_postponed",
    leagueSlug: "test.1",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "SPECIAL",
    statusType: "SPECIAL",
    rawStatus: "STATUS_POSTPONED",
    scoreHome: null,
    scoreAway: null,
  }];

  const [result] = overlayResultsTruth(input, "2026-07-28");

  assert.deepEqual(result, input[0]);
});

function identityResolver() {
  return {
    resolveFixtureId(value) {
      if (value === "cid_test_retained") {
        return {
          ok: true,
          resolvedFixtureId:
            "cid_test_retained",
          sourceRole:
            "retained",
          fixtureRetentionDecisionId:
            "frd_test",
          homeGlobalClubId:
            "gcid_home",
          awayGlobalClubId:
            "gcid_away",
        };
      }

      if (value === "cid_test_suppressed") {
        return {
          ok: true,
          resolvedFixtureId:
            "cid_test_retained",
          sourceRole:
            "suppressed_lineage_alias",
          fixtureRetentionDecisionId:
            "frd_test",
          homeGlobalClubId:
            "gcid_home",
          awayGlobalClubId:
            "gcid_away",
        };
      }

      return {
        ok: false,
        status:
          "UNKNOWN_FIXTURE_ID",
      };
    },
  };
}

test(
  "adds identity metadata to a retained final without changing truth",
  () => {
    const input = [{
      canonicalId:
        "cid_test_retained",
      leagueSlug:
        "test.1",
      homeTeam:
        "Home",
      awayTeam:
        "Away",
      status:
        "FT",
      statusType:
        "FT",
      rawStatus:
        "STATUS_FINAL",
      scoreHome:
        2,
      scoreAway:
        1,
    }];

    const [result] =
      overlayResultsTruth(
        input,
        "2026-07-28",
        {
          resolver:
            identityResolver(),
        },
      );

    assert.equal(
      result.matchId,
      "cid_test_retained",
    );
    assert.equal(
      result.homeGlobalClubId,
      "gcid_home",
    );
    assert.equal(
      result.awayGlobalClubId,
      "gcid_away",
    );
    assert.equal(
      result.scoreHome,
      2,
    );
    assert.equal(
      result.scoreAway,
      1,
    );
    assert.equal(
      result.status,
      "FT",
    );
  },
);

test(
  "suppressed lineage row cannot enter result truth overlay",
  () => {
    const input = [{
      canonicalId:
        "cid_test_suppressed",
      leagueSlug:
        "test.1",
      homeTeam:
        "Home",
      awayTeam:
        "Away",
      status:
        "PRE",
      rawStatus:
        "STATUS_SCHEDULED",
      scoreHome:
        null,
      scoreAway:
        null,
    }];

    const [result] =
      overlayResultsTruth(
        input,
        "2026-07-28",
        {
          resolver:
            identityResolver(),
        },
      );

    assert.equal(
      result,
      input[0],
    );
  },
);
