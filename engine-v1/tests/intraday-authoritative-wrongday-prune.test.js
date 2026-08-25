import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  collectAuthoritativeWrongDayPublishedFixtureIds,
  resolveIntradayPublishedUniverse
} from "../core/intraday-publication-universe.js";

const day =
  "2026-08-25";

function publishedRow({
  id,
  providerId,
  source = "espn",
  leagueSlug = "test.1",
  rowDay = day
}) {
  return {
    canonicalId: id,
    matchId: id,
    source,
    sourceId: providerId,
    sourceMatchId: providerId,
    providerIds: {
      espn: providerId
    },
    leagueSlug,
    dayKey: rowDay
  };
}

function strictLeaguePayload({
  removedIds = ["1001", "1002"],
  wrongDayMatches = removedIds.length,
  wrongDayRemovedRows = removedIds.length,
  wrongDayIdentityRejectedRows = 0,
  requestedDayKey = day,
  payloadDayKey = day,
  policyOverride = {},
  authoritativeDayKey = "2026-08-26"
} = {}) {
  return {
    dayKey: payloadDayKey,
    leagueSlug: "test.1",
    sourceMeta: {
      acquisitionProvider:
        "espn_direct_league_status",
      requestedLeagueSlug:
        "test.1",
      requestedDayKey,
      providerFetchSlugs: [
        "test.1"
      ],
      exactEventSummaryReconciliation: {
        candidates:
          Math.max(
            removedIds.length,
            wrongDayMatches
          ),
        sameDayMatches: 0,
        wrongDayMatches,
        wrongDayRemovedRows,
        wrongDayIdentityRejectedRows,
        fetches:
          removedIds.map(
            providerMatchId => ({
              providerSlug:
                "test.1",
              providerMatchId,
              ok: true,
              kind:
                "other_day",
              authoritativeDayKey,
              reason: null
            })
          ),
        policy: {
          exactProviderIdOnly: true,
          authoritativeEventDayOnly: true,
          teamIdentityRequired: true,
          homeAwayOrientationRequired: true,
          crossDayStatusPromotion: false,
          heuristicFinalPromotion: false,
          ...policyOverride
        }
      }
    },
    fixtures: []
  };
}

test(
  "strict exact provider-day proof may prune only the proven stale published rows",
  () => {
    const publishedFixtures = [
      publishedRow({
        id: "keep",
        providerId: "9000"
      }),
      publishedRow({
        id: "stale-a",
        providerId: "1001"
      }),
      publishedRow({
        id: "stale-b",
        providerId: "1002"
      })
    ];

    const currentFixtures = [
      publishedRow({
        id: "keep",
        providerId: "9000"
      }),
      publishedRow({
        id: "new-current",
        providerId: "9001"
      })
    ];

    const authoritative =
      collectAuthoritativeWrongDayPublishedFixtureIds({
        dayKey: day,
        publishedFixtures,
        canonicalLeaguePayloads: [
          strictLeaguePayload()
        ]
      });

    assert.deepEqual(
      authoritative,
      [
        "stale-a",
        "stale-b"
      ]
    );

    const result =
      resolveIntradayPublishedUniverse({
        publishedFixtures,
        currentFixtures,
        publishedDetailIds: [
          "keep",
          "stale-a",
          "stale-b"
        ],
        authoritativelyRemovedFixtureIds:
          authoritative
      });

    assert.equal(
      result.ok,
      true
    );

    assert.deepEqual(
      result.allowedFixtureIds,
      ["keep"]
    );

    assert.deepEqual(
      result.authoritativelyRemovedFixtureIds,
      [
        "stale-a",
        "stale-b"
      ]
    );

    assert.deepEqual(
      result.unauthorizedMissingCurrentFixtureIds,
      []
    );

    assert.deepEqual(
      result.deferredFixtureIds,
      ["new-current"]
    );

    assert.deepEqual(
      result.missingPublishedDetailIds,
      []
    );
  }
);

test(
  "unknown published shrink remains a hard failure",
  () => {
    const publishedFixtures = [
      publishedRow({
        id: "keep",
        providerId: "9000"
      }),
      publishedRow({
        id: "stale-proven",
        providerId: "1001"
      }),
      publishedRow({
        id: "missing-unknown",
        providerId: "7777"
      })
    ];

    const authoritative =
      collectAuthoritativeWrongDayPublishedFixtureIds({
        dayKey: day,
        publishedFixtures,
        canonicalLeaguePayloads: [
          strictLeaguePayload({
            removedIds: ["1001"]
          })
        ]
      });

    const result =
      resolveIntradayPublishedUniverse({
        publishedFixtures,
        currentFixtures: [
          publishedRow({
            id: "keep",
            providerId: "9000"
          })
        ],
        publishedDetailIds: [
          "keep",
          "stale-proven",
          "missing-unknown"
        ],
        authoritativelyRemovedFixtureIds:
          authoritative
      });

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "published_fixture_missing_from_current_universe"
    );

    assert.deepEqual(
      result.authoritativelyRemovedFixtureIds,
      ["stale-proven"]
    );

    assert.deepEqual(
      result.unauthorizedMissingCurrentFixtureIds,
      ["missing-unknown"]
    );
  }
);

test(
  "identity-rejected reconciliation grants zero removal authority",
  () => {
    const publishedFixtures = [
      publishedRow({
        id: "stale-a",
        providerId: "1001"
      })
    ];

    const result =
      collectAuthoritativeWrongDayPublishedFixtureIds({
        dayKey: day,
        publishedFixtures,
        canonicalLeaguePayloads: [
          strictLeaguePayload({
            removedIds: ["1001"],
            wrongDayIdentityRejectedRows: 1
          })
        ]
      });

    assert.deepEqual(
      result,
      []
    );
  }
);

test(
  "count mismatch grants zero removal authority",
  () => {
    const publishedFixtures = [
      publishedRow({
        id: "stale-a",
        providerId: "1001"
      })
    ];

    const result =
      collectAuthoritativeWrongDayPublishedFixtureIds({
        dayKey: day,
        publishedFixtures,
        canonicalLeaguePayloads: [
          strictLeaguePayload({
            removedIds: ["1001"],
            wrongDayMatches: 1,
            wrongDayRemovedRows: 2
          })
        ]
      });

    assert.deepEqual(
      result,
      []
    );
  }
);

test(
  "weak identity or day policy grants zero removal authority",
  () => {
    const publishedFixtures = [
      publishedRow({
        id: "stale-a",
        providerId: "1001"
      })
    ];

    for (
      const policyOverride
      of [
        {
          exactProviderIdOnly: false
        },
        {
          authoritativeEventDayOnly: false
        },
        {
          teamIdentityRequired: false
        },
        {
          homeAwayOrientationRequired: false
        },
        {
          crossDayStatusPromotion: true
        },
        {
          heuristicFinalPromotion: true
        }
      ]
    ) {
      const result =
        collectAuthoritativeWrongDayPublishedFixtureIds({
          dayKey: day,
          publishedFixtures,
          canonicalLeaguePayloads: [
            strictLeaguePayload({
              removedIds: ["1001"],
              policyOverride
            })
          ]
        });

      assert.deepEqual(
        result,
        []
      );
    }
  }
);

test(
  "same-day evidence cannot authorize removal",
  () => {
    const result =
      collectAuthoritativeWrongDayPublishedFixtureIds({
        dayKey: day,
        publishedFixtures: [
          publishedRow({
            id: "fixture",
            providerId: "1001"
          })
        ],
        canonicalLeaguePayloads: [
          strictLeaguePayload({
            removedIds: ["1001"],
            authoritativeDayKey: day
          })
        ]
      });

    assert.deepEqual(
      result,
      []
    );
  }
);

test(
  "non-ESPN or ambiguous provider identity cannot authorize published deletion",
  () => {
    const flashscore =
      publishedRow({
        id: "flashscore",
        providerId: "1001",
        source: "flashscore"
      });

    const ambiguous = {
      ...publishedRow({
        id: "ambiguous",
        providerId: "1001"
      }),
      sourceId: "9999"
    };

    const result =
      collectAuthoritativeWrongDayPublishedFixtureIds({
        dayKey: day,
        publishedFixtures: [
          flashscore,
          ambiguous
        ],
        canonicalLeaguePayloads: [
          strictLeaguePayload({
            removedIds: ["1001"]
          })
        ]
      });

    assert.deepEqual(
      result,
      []
    );
  }
);

test(
  "runner wires authoritative reconciliation into fail-closed publication lock",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-intraday-snapshot-refresh.js",
          import.meta.url
        ),
        "utf8"
      ).replace(
        /\r\n/gu,
        "\n"
      );

    assert.match(
      source,
      /collectAuthoritativeWrongDayPublishedFixtureIds/
    );

    assert.match(
      source,
      /canonicalLeaguePayloadsForDay/
    );

    assert.match(
      source,
      /authoritativelyRemovedFixtureIds/
    );

    assert.match(
      source,
      /unauthorizedMissingCurrentFixtureIds/
    );

    assert.match(
      source,
      /fixtureIdAllowlist:\s*publicationLock\.allowedFixtureIds/
    );
  }
);
