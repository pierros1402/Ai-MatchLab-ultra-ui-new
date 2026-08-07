import test from "node:test";
import assert from "node:assert/strict";

import {
  buildProviderCompetitionDiscovery,
  discoverProviderCompetitionsDay
} from "./discover-provider-competitions-day.js";

const GENERATED_AT =
  "2026-07-29T08:00:00.000Z";

function fixture(overrides = {}) {
  return {
    matchId:
      "fixture-1",
    home:
      "Home FC",
    away:
      "Away FC",
    country:
      "World",
    leagueName:
      "World Championship",
    leaguePath:
      "/football/world/world-championship/",
    leagueId:
      "world-cup-id",
    kickoffUtc:
      "2026-08-02T18:00:00.000Z",
    ...overrides
  };
}

test(
  "future known competition is discovered as active",
  () => {
    const result =
      buildProviderCompetitionDiscovery({
        dayKey:
          "2026-07-29",

        rows: [
          fixture()
        ],

        generatedAt:
          GENERATED_AT
      });

    assert.equal(
      result.artifact.summary
        .competitionCount,
      1
    );

    assert.equal(
      result.artifact.competitions[0]
        .classification,
      "known_active"
    );

    assert.equal(
      result.artifact.competitions[0]
        .canonicalSlug,
      "fifa.world"
    );

    assert.equal(
      result.artifact.competitions[0]
        .acquisitionEligible,
      true
    );
  }
);

test(
  "discovery records exact Athens target-day fixture coverage",
  () => {
    const result =
      buildProviderCompetitionDiscovery({
        dayKey:
          "2026-08-07",

        rows: [
          fixture({
            matchId:
              "athens-target-day",
            kickoffUtc:
              "2026-08-06T22:30:00.000Z"
          }),
          fixture({
            matchId:
              "next-athens-day",
            kickoffUtc:
              "2026-08-07T22:30:00.000Z"
          }),
          fixture({
            matchId:
              "cancelled-target-day",
            kickoffUtc:
              "2026-08-07T15:00:00.000Z",
            nonPlayedTerminal: true
          })
        ],

        generatedAt:
          GENERATED_AT
      });

    const row =
      result.artifact
        .competitions[0];

    assert.equal(
      row.fixtureCount,
      3
    );

    assert.equal(
      row.targetDayFixtureCount,
      1
    );

    assert.deepEqual(
      row.targetDaySourceIds,
      ["athens-target-day"]
    );

    assert.equal(
      row.targetDayNonPlayedTerminalCount,
      1
    );

    assert.equal(
      result.artifact.summary
        .targetDayFixtureRowCount,
      1
    );

    assert.equal(
      result.artifact.summary
        .targetDayNonPlayedTerminalRowCount,
      1
    );

    assert.equal(
      result.artifact.summary
        .targetDayResolvedCompetitionCount,
      1
    );
  }
);

test(
  "new unknown competition is retained as non-publishable candidate",
  () => {
    const result =
      buildProviderCompetitionDiscovery({
        dayKey:
          "2026-07-29",

        rows: [
          fixture({
            matchId:
              "new-league-1",
            country:
              "Example Country",
            leagueName:
              "Premier Division",
            leaguePath:
              "/football/example-country/premier-division/",
            leagueId:
              "new-provider-id"
          })
        ],

        generatedAt:
          GENERATED_AT
      });

    const row =
      result.artifact
        .competitions[0];

    assert.equal(
      row.classification,
      "candidate"
    );

    assert.equal(
      row.publicationEligible,
      false
    );

    assert.equal(
      row.acquisitionEligible,
      false
    );

    assert.equal(
      row.reasonCode,
      "unmapped_provider_competition"
    );
  }
);

test(
  "out-of-scope competition is observed but never publishable",
  () => {
    const result =
      buildProviderCompetitionDiscovery({
        dayKey:
          "2026-07-29",

        rows: [
          fixture({
            matchId:
              "women-afcon",
            country:
              "Africa",
            leagueName:
              "Africa Cup of Nations Women",
            leaguePath:
              "/football/africa/africa-cup-of-nations-women/",
            leagueId:
              "dvoOvsMc"
          })
        ],

        generatedAt:
          GENERATED_AT
      });

    const row =
      result.artifact
        .competitions[0];

    assert.equal(
      row.classification,
      "out_of_scope"
    );

    assert.equal(
      row.publicationEligible,
      false
    );

    assert.equal(
      row.reasonCode,
      "out_of_scope_womens_competition"
    );
  }
);

test(
  "persistent registry remembers first observation and advances activity",
  () => {
    const first =
      buildProviderCompetitionDiscovery({
        dayKey:
          "2026-07-29",

        rows: [
          fixture()
        ],

        generatedAt:
          GENERATED_AT
      });

    const second =
      buildProviderCompetitionDiscovery({
        dayKey:
          "2026-07-30",

        rows: [
          fixture({
            matchId:
              "fixture-2",
            kickoffUtc:
              "2026-08-03T18:00:00.000Z"
          })
        ],

        previousRegistry:
          first.registry,

        generatedAt:
          "2026-07-30T08:00:00.000Z"
      });

    const row =
      second.registry
        .competitions[0];

    assert.equal(
      row.firstObservedDay,
      "2026-07-29"
    );

    assert.equal(
      row.lastObservedDay,
      "2026-07-30"
    );

    assert.equal(
      row.observationDays,
      2
    );

    assert.equal(
      row.totalObservedFixtures,
      2
    );
  }
);

test(
  "read-only daily discovery performs no artifact writes",
  async () => {
    const result =
      await discoverProviderCompetitionsDay(
        "2026-07-29",
        {
          write: false,

          generatedAt:
            GENERATED_AT,

          offsets:
            [0, 1, 2],

          fetchFixtures:
            async ({ offsets }) => {
              assert.deepEqual(
                offsets,
                [0, 1, 2]
              );

              return {
                rows: [
                  fixture()
                ]
              };
            }
        }
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.discoveryFile,
      null
    );

    assert.equal(
      result.registryFile,
      null
    );

    assert.equal(
      result.summary
        .resolvedCompetitionCount,
      1
    );
  }
);

test(
  "daily discovery fails closed when provider-wide feed fails",
  async () => {
    const result =
      await discoverProviderCompetitionsDay(
        "2026-08-07",
        {
          write: false,
          offsets: [0],
          fetchFixtures:
            async () => ({
              ok: false,
              rows: [],
              attempts: [
                {
                  offset: 0,
                  ok: false,
                  status: 503
                }
              ]
            })
        }
      );

    assert.equal(result.ok, false);
    assert.equal(
      result.error,
      "provider_competition_feed_failed"
    );
    assert.equal(result.artifact, null);
    assert.equal(result.registry, null);
  }
);
