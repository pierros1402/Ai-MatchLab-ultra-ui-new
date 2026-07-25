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

test(
  "suppresses an older stale-open occurrence when the same exact provider ID has a later kickoff",
  () => {
    const older = fixture({
      canonicalId:
        "cid_chi1_unionlacalera_everton_20260725",
      providerMatchId:
        "401850602",
      sourceId:
        "401850602",
      sourceMatchId:
        "401850602",
      matchId:
        "401850602",
      kickoffUtc:
        "2026-07-24T22:00:00.000Z"
    });

    const newer = fixture({
      canonicalId:
        "cid_chi1_unionlacalera_everton_20260728",
      providerMatchId:
        "401850602",
      sourceId:
        "401850602",
      sourceMatchId:
        "401850602",
      matchId:
        "401850602",
      kickoffUtc:
        "2026-07-27T23:00:00.000Z"
    });

    const report =
      buildLiveStatusCompleteness(
        [older],
        {
          now:
            "2026-07-25T07:00:00.000Z",
          lineageRows:
            [older, newer]
        }
      );

    assert.equal(
      report.ok,
      true
    );

    assert.equal(
      report.staleOpenCount,
      0
    );

    assert.equal(
      report.supersededOpenCount,
      1
    );

    assert.deepEqual(
      report.supersededOpenCanonicalIds,
      [
        "cid_chi1_unionlacalera_everton_20260725"
      ]
    );

    assert.equal(
      report.supersededOpenFixtures[0]
        .supersededByCanonicalId,
      "cid_chi1_unionlacalera_everton_20260728"
    );

    assert.equal(
      report.policy
        .heuristicFinalPromotion,
      false
    );
  }
);

test(
  "supports multiple consecutive exact-provider reschedules",
  () => {
    const first = fixture({
      canonicalId:
        "cid_uru1_nacional_progreso_20260725",
      providerMatchId:
        "401872732",
      sourceId:
        "401872732",
      sourceMatchId:
        "401872732",
      matchId:
        "401872732",
      kickoffUtc:
        "2026-07-24T22:30:00.000Z"
    });

    const second = fixture({
      canonicalId:
        "cid_uru1_nacional_progreso_20260801",
      providerMatchId:
        "401872732",
      sourceId:
        "401872732",
      sourceMatchId:
        "401872732",
      matchId:
        "401872732",
      kickoffUtc:
        "2026-08-01T18:00:00.000Z"
    });

    const third = fixture({
      canonicalId:
        "cid_uru1_nacional_progreso_20260803",
      providerMatchId:
        "401872732",
      sourceId:
        "401872732",
      sourceMatchId:
        "401872732",
      matchId:
        "401872732",
      kickoffUtc:
        "2026-08-02T21:30:00.000Z"
    });

    const report =
      buildLiveStatusCompleteness(
        [first, second],
        {
          now:
            "2026-08-02T00:00:00.000Z",
          lineageRows:
            [first, second, third]
        }
      );

    assert.equal(
      report.staleOpenCount,
      0
    );

    assert.equal(
      report.supersededOpenCount,
      2
    );

    assert.deepEqual(
      report.supersededOpenCanonicalIds,
      [
        "cid_uru1_nacional_progreso_20260725",
        "cid_uru1_nacional_progreso_20260801"
      ]
    );
  }
);

test(
  "keeps the latest exact-provider occurrence subject to the stale-open gate",
  () => {
    const older = fixture({
      canonicalId:
        "cid_old",
      providerMatchId:
        "401900001",
      sourceId:
        "401900001",
      sourceMatchId:
        "401900001",
      matchId:
        "401900001",
      kickoffUtc:
        "2026-07-20T16:00:00.000Z"
    });

    const latest = fixture({
      canonicalId:
        "cid_latest",
      providerMatchId:
        "401900001",
      sourceId:
        "401900001",
      sourceMatchId:
        "401900001",
      matchId:
        "401900001",
      kickoffUtc:
        "2026-07-21T16:00:00.000Z"
    });

    const report =
      buildLiveStatusCompleteness(
        [older, latest],
        {
          now:
            "2026-07-22T00:00:00.000Z",
          lineageRows:
            [older, latest]
        }
      );

    assert.deepEqual(
      report.staleOpenCanonicalIds,
      ["cid_latest"]
    );

    assert.deepEqual(
      report.supersededOpenCanonicalIds,
      ["cid_old"]
    );
  }
);

test(
  "does not supersede a stale fixture from a different provider ID",
  () => {
    const stale = fixture({
      canonicalId:
        "cid_stale",
      providerMatchId:
        "401900010",
      sourceId:
        "401900010",
      sourceMatchId:
        "401900010",
      matchId:
        "401900010",
      kickoffUtc:
        "2026-07-20T16:00:00.000Z"
    });

    const unrelated = fixture({
      canonicalId:
        "cid_unrelated",
      providerMatchId:
        "401900011",
      sourceId:
        "401900011",
      sourceMatchId:
        "401900011",
      matchId:
        "401900011",
      kickoffUtc:
        "2026-07-25T16:00:00.000Z"
    });

    const report =
      buildLiveStatusCompleteness(
        [stale],
        {
          now:
            "2026-07-21T00:00:00.000Z",
          lineageRows:
            [stale, unrelated]
        }
      );

    assert.deepEqual(
      report.staleOpenCanonicalIds,
      ["cid_stale"]
    );

    assert.equal(
      report.supersededOpenCount,
      0
    );
  }
);
