import test from "node:test";
import assert from "node:assert/strict";

import {
  contentHash,
  exportFixturesSnapshotDay
} from "./export-fixtures-snapshot-day.js";

function fixture(overrides = {}) {
  return {
    matchId: "accepted-1",
    home: "Home FC",
    away: "Away FC",
    country: "World",
    leagueName: "World Championship",
    leaguePath:
      "/football/world/world-championship/",
    leagueId: "world-cup-id",
    kickoffUtc:
      "2026-07-29T18:00:00.000Z",
    dayKey: "2026-07-29",
    ...overrides
  };
}

test(
  "exporter excludes and quarantines rows before canonical registration",
  async () => {
    const registered = [];

    const rows = [
      fixture(),
      fixture({
        matchId: "women-afcon",
        home: "Ghana W",
        away: "Cape Verde W",
        country: "Africa",
        leagueName:
          "Africa Cup of Nations Women",
        leaguePath:
          "/football/africa/africa-cup-of-nations-women/",
        leagueId: "dvoOvsMc"
      }),
      fixture({
        matchId: "kings-world",
        home: "No Rules FC",
        away: "Karasu",
        leagueName:
          "Kings World Cup Clubs - Round 2",
        leaguePath:
          "/football/world/kings-world-cup-clubs/",
        leagueId: "xYvXlFc4"
      }),
      fixture({
        matchId: "unknown-world",
        home: "Unknown A",
        away: "Unknown B",
        leagueName:
          "Some World Cup Tournament",
        leaguePath:
          "/football/world/unknown-world-cup/",
        leagueId: "unknown-id"
      })
    ];

    const result =
      await exportFixturesSnapshotDay(
        "2026-07-29",
        {
          fetchFixtures:
            async () => ({
              rows
            }),

          registerCanonicalMatch:
            (dayKey, row) => {
              registered.push({
                dayKey,
                row
              });
            },

          writeArtifact: false
        }
      );

    assert.equal(
      result.count,
      1
    );

    assert.equal(
      result.excludedCompetitionCount,
      2
    );

    assert.equal(
      result.quarantinedCompetitionCount,
      1
    );

    assert.equal(
      result.artifact.matches.length,
      1
    );

    assert.equal(
      result.artifact.matches[0]
        .leagueSlug,
      "fifa.world"
    );

    assert.deepEqual(
      result.artifact
        .excludedCompetitions
        .map(row => row.reasonCode)
        .sort(),
      [
        "out_of_scope_non_fifa_competition",
        "out_of_scope_womens_competition"
      ]
    );

    assert.equal(
      result.artifact
        .quarantinedCompetitions[0]
        .reasonCode,
      "unmapped_provider_competition"
    );

    assert.equal(
      registered.length,
      1
    );

    assert.equal(
      registered[0].row.sourceId,
      "accepted-1"
    );

    assert.equal(
      registered.some(entry =>
        entry.row.sourceId ===
          "women-afcon" ||
        entry.row.sourceId ===
          "kings-world" ||
        entry.row.sourceId ===
          "unknown-world"
      ),
      false
    );
  }
);

test(
  "diagnostic identity state participates in artifact hash",
  () => {
    const accepted = [
      {
        id: "accepted-1",
        home: "Home",
        away: "Away",
        kickoffUtc:
          "2026-07-29T18:00:00Z",
        leagueSlug:
          "fifa.world"
      }
    ];

    const base = contentHash({
      matches: accepted,
      excludedCompetitions: [],
      quarantinedCompetitions: []
    });

    const withExcluded =
      contentHash({
        matches: accepted,
        excludedCompetitions: [
          {
            status: "excluded",
            reasonCode:
              "out_of_scope_womens_competition",
            provider:
              "flashscore",
            providerCompetitionId:
              "dvoOvsMc",
            rawLeaguePath:
              "/football/africa/africa-cup-of-nations-women/",
            sourceId:
              "women-afcon"
          }
        ],
        quarantinedCompetitions: []
      });

    const withQuarantined =
      contentHash({
        matches: accepted,
        excludedCompetitions: [],
        quarantinedCompetitions: [
          {
            status: "quarantined",
            reasonCode:
              "unmapped_provider_competition",
            provider:
              "flashscore",
            providerCompetitionId:
              "unknown-id",
            rawLeaguePath:
              "/football/world/unknown-world-cup/",
            sourceId:
              "unknown-world"
          }
        ]
      });

    assert.notEqual(
      base,
      withExcluded
    );

    assert.notEqual(
      base,
      withQuarantined
    );

    assert.notEqual(
      withExcluded,
      withQuarantined
    );
  }
);

test(
  "same accepted and diagnostic state produces deterministic hash",
  () => {
    const input = {
      matches: [
        {
          id: "fixture-1",
          home: "A",
          away: "B",
          kickoffUtc:
            "2026-07-29T18:00:00Z",
          leagueSlug: "test.1"
        }
      ],
      excludedCompetitions: [
        {
          status: "excluded",
          reasonCode:
            "out_of_scope_non_fifa_competition",
          provider:
            "flashscore",
          sourceId:
            "excluded-1"
        }
      ],
      quarantinedCompetitions: []
    };

    assert.equal(
      contentHash(input),
      contentHash(input)
    );
  }
);
