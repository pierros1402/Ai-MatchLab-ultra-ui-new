import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExactIdentityIndex,
  evaluatePickResult,
  resolveVerifiedFinalScore
} from "../jobs/build-value-plan-comparison-day.js";

import {
  buildDetailsSignature
} from "../jobs/build-details-day.js";

test("verified final exact provider alias resolves to canonical result", () => {
  const finalResult = {
    matchId: "cid_swe1_halmstads_hacken_20260719",
    homeScore: 0,
    awayScore: 2,
    sources: [
      {
        provider: "espn",
        providerMatchId: "401842761",
        canonicalId: "cid_swe1_halmstads_hacken_20260719"
      }
    ]
  };

  const index = buildExactIdentityIndex([finalResult]);

  assert.equal(index.byId.get("401842761"), finalResult);
  assert.equal(
    index.byId.get("cid_swe1_halmstads_hacken_20260719"),
    finalResult
  );

  assert.equal(
    evaluatePickResult(
      { market: "Over / Under 2.5", pick: "Over 2.5" },
      index.byId.get("401842761")
    ),
    false
  );
});

test("identity alias collisions fail closed", () => {
  const first = {
    matchId: "cid_a",
    sourceId: "shared-provider-id"
  };

  const second = {
    matchId: "cid_b",
    providerMatchId: "shared-provider-id"
  };

  const index = buildExactIdentityIndex([first, second]);

  assert.equal(index.byId.has("shared-provider-id"), false);
  assert.deepEqual(index.ambiguousIds, ["shared-provider-id"]);
});

test("missing or contradictory scores never coerce to zero", () => {
  assert.equal(
    resolveVerifiedFinalScore({
      homeScore: null,
      awayScore: null,
      finalScore: {
        homeScore: null,
        awayScore: null
      }
    }),
    null
  );

  assert.equal(
    resolveVerifiedFinalScore({
      homeScore: 0,
      scoreHome: 1,
      awayScore: 2,
      scoreAway: 2
    }),
    null
  );

  assert.equal(
    evaluatePickResult(
      { market: "1X2", pick: "AWAY" },
      { homeScore: null, awayScore: null }
    ),
    null
  );
});

test("details signature preserves postponed null scores", () => {
  const signature = JSON.parse(
    buildDetailsSignature(
      {
        matchId: "cid_kaz1_ertispavlodar_astana_20260719",
        kickoffUtc: "2026-07-19T14:00:00.000Z",
        status: "STATUS_POSTPONED",
        rawStatus: "STATUS_POSTPONED",
        minute: null,
        scoreHome: null,
        scoreAway: null
      },
      [],
      {}
    )
  );

  assert.equal(signature.scoreHome, null);
  assert.equal(signature.scoreAway, null);
});
