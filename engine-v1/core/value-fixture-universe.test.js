import test from "node:test";
import assert from "node:assert/strict";

import {
  assertValueFixtureUniverseParity,
  buildValueFixtureUniverse
} from "./value-fixture-universe.js";

function fixture(
  canonicalId,
  overrides = {}
) {
  return {
    canonicalId,
    matchId:
      canonicalId,
    leagueSlug:
      "test.1",
    homeTeam:
      "Home",
    awayTeam:
      "Away",
    kickoffUtc:
      "2026-07-26T18:00:00.000Z",
    status:
      "STATUS_SCHEDULED",
    rawStatus:
      "STATUS_SCHEDULED",
    ...overrides
  };
}

test(
  "all canonical fixtures remain in the shared Value universe",
  () => {
    const universe =
      buildValueFixtureUniverse(
        "2026-07-26",
        {
          fixtures: [
            fixture(
              "cid_scheduled"
            ),

            fixture(
              "cid_live",
              {
                status:
                  "LIVE",
                rawStatus:
                  "STATUS_IN_PROGRESS"
              }
            ),

            fixture(
              "cid_final",
              {
                status:
                  "FT",
                rawStatus:
                  "STATUS_FULL_TIME"
              }
            ),

            fixture(
              "cid_postponed",
              {
                status:
                  "STATUS_POSTPONED",
                rawStatus:
                  "STATUS_POSTPONED"
              }
            ),

            fixture(
              "cid_missing_assessment",
              {
                aiAssessment:
                  null
              }
            )
          ]
        }
      );

    assert.equal(
      universe.count,
      5
    );

    assert.deepEqual(
      universe.canonicalIds,
      [
        "cid_final",
        "cid_live",
        "cid_missing_assessment",
        "cid_postponed",
        "cid_scheduled"
      ]
    );
  }
);

test(
  "shared Value universe is deterministic",
  () => {
    const first =
      buildValueFixtureUniverse(
        "2026-07-26",
        {
          fixtures: [
            fixture("cid_b"),
            fixture("cid_a")
          ]
        }
      );

    const second =
      buildValueFixtureUniverse(
        "2026-07-26",
        {
          fixtures: [
            fixture("cid_a"),
            fixture("cid_b")
          ]
        }
      );

    assert.equal(
      first.count,
      2
    );

    assert.deepEqual(
      first.canonicalIds,
      [
        "cid_a",
        "cid_b"
      ]
    );

    assert.equal(
      first.hash,
      second.hash
    );
  }
);

test(
  "shared Value universe fails closed on missing or duplicate canonical IDs",
  () => {
    assert.throws(
      () =>
        buildValueFixtureUniverse(
          "2026-07-26",
          {
            fixtures: [
              fixture("")
            ]
          }
        ),
      /VALUE_FIXTURE_UNIVERSE_MISSING_CANONICAL_ID/
    );

    assert.throws(
      () =>
        buildValueFixtureUniverse(
          "2026-07-26",
          {
            fixtures: [
              fixture("cid_same"),
              fixture("cid_same")
            ]
          }
        ),
      /VALUE_FIXTURE_UNIVERSE_DUPLICATE_CANONICAL_IDS/
    );
  }
);

test(
  "Plan A and Plan B parity requires identical count hash and IDs",
  () => {
    const hundred =
      Array.from(
        {
          length: 100
        },
        (_, index) =>
          fixture(
            "cid_" +
            String(index + 1)
              .padStart(3, "0")
          )
      );

    const planA =
      buildValueFixtureUniverse(
        "2026-07-26",
        {
          fixtures:
            hundred
        }
      );

    const planB =
      buildValueFixtureUniverse(
        "2026-07-26",
        {
          fixtures:
            [...hundred].reverse()
        }
      );

    const parity =
      assertValueFixtureUniverseParity(
        planA,
        planB
      );

    assert.equal(
      parity.ok,
      true
    );

    assert.equal(
      parity.count,
      100
    );

    assert.deepEqual(
      parity.canonicalIds,
      planA.canonicalIds
    );

    const ninetyNine =
      buildValueFixtureUniverse(
        "2026-07-26",
        {
          fixtures:
            hundred.slice(0, 99)
        }
      );

    assert.throws(
      () =>
        assertValueFixtureUniverseParity(
          planA,
          ninetyNine
        ),
      /VALUE_PLAN_UNIVERSE_PARITY_FAILED/
    );
  }
);
