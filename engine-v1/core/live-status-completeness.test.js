import test from "node:test";
import assert from "node:assert/strict";

import {
  buildLiveStatusCompleteness,
  classifyStaleOpenFixture
} from "./live-status-completeness.js";

function fixture(overrides = {}) {
  return {
    canonicalId:
      "cid_uefaeuropaconf_rigasfutbolaskola_vestri_20260723",
    matchId: "401896232",
    source: "espn",
    sourceId: "401896232",
    sourceMatchId: "401896232",
    leagueSlug: "uefa.europa.conf",
    providerLeagueSlug:
      "uefa.europa.conf_qual",
    kickoffUtc:
      "2026-07-23T16:30:00.000Z",
    status: "PRE",
    rawStatus: "STATUS_SCHEDULED",
    statusType: "STATUS_SCHEDULED",
    ...overrides
  };
}

test(
  "flags an exact-ID ESPN fixture after the conservative stale window",
  () => {
    const row = fixture();

    const result =
      classifyStaleOpenFixture(
        row,
        {
          now:
            "2026-07-23T21:00:00.000Z"
        }
      );

    assert.equal(
      result?.classification,
      "stale_open_exact_provider_id"
    );

    assert.equal(
      result?.providerId,
      "401896232"
    );

    assert.equal(
      result?.providerLeagueSlug,
      "uefa.europa.conf_qual"
    );
  }
);

test(
  "does not flag the same fixture before the stale window",
  () => {
    assert.equal(
      classifyStaleOpenFixture(
        fixture(),
        {
          now:
            "2026-07-23T19:00:00.000Z"
        }
      ),
      null
    );
  }
);

test(
  "never treats explicit final evidence as stale-open",
  () => {
    assert.equal(
      classifyStaleOpenFixture(
        fixture({
          status: "FT",
          rawStatus: "STATUS_FULL_TIME",
          statusType: "STATUS_FINAL"
        }),
        {
          now:
            "2026-07-24T00:00:00.000Z"
        }
      ),
      null
    );
  }
);

test(
  "never treats explicit non-played terminal evidence as stale-open",
  () => {
    assert.equal(
      classifyStaleOpenFixture(
        fixture({
          status: "POSTPONED",
          rawStatus: "STATUS_POSTPONED",
          statusType:
            "STATUS_POSTPONED"
        }),
        {
          now:
            "2026-07-24T00:00:00.000Z"
        }
      ),
      null
    );
  }
);

test(
  "ignores non-ESPN rows rather than applying a cross-provider heuristic",
  () => {
    assert.equal(
      classifyStaleOpenFixture(
        fixture({
          source: "flashscore"
        }),
        {
          now:
            "2026-07-24T00:00:00.000Z"
        }
      ),
      null
    );
  }
);

test(
  "completeness reporting is deterministic and does not mutate fixtures",
  () => {
    const first = fixture({
      canonicalId: "cid_b"
    });

    const second = fixture({
      canonicalId: "cid_a",
      sourceId: "401896233",
      sourceMatchId: "401896233",
      matchId: "401896233"
    });

    const original =
      JSON.parse(
        JSON.stringify([
          first,
          second
        ])
      );

    const report =
      buildLiveStatusCompleteness(
        [
          first,
          second
        ],
        {
          now:
            "2026-07-24T00:00:00.000Z"
        }
      );

    assert.equal(report.ok, false);
    assert.equal(
      report.staleOpenCount,
      2
    );

    assert.deepEqual(
      report.staleOpenCanonicalIds,
      [
        "cid_a",
        "cid_b"
      ]
    );

    assert.equal(
      report.policy
        .heuristicFinalPromotion,
      false
    );

    assert.deepEqual(
      [
        first,
        second
      ],
      original
    );
  }
);
