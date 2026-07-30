import test from "node:test";
import assert from "node:assert/strict";

import {
  isEspnRefreshCandidate,
  mergeStatusRow,
  finalizeLiveStatusRefreshStats
} from "./run-live-status-refresh-day.js";

import {
  resolveComparisonKickoff,
  enrichPick
} from "./build-value-plan-comparison-day.js";

test(
  "ESPN refresh ignores Flashscore canonical rows",
  () => {
    const now =
      new Date(
        "2026-07-23T18:30:00.000Z"
      );

    const openFixture = {
      matchId: "401896232",
      sourceId: "401896232",
      sourceMatchId: "401896232",
      kickoffUtc:
        "2026-07-23T16:30:00.000Z",
      status: "PRE",
      rawStatus:
        "STATUS_SCHEDULED"
    };

    assert.equal(
      isEspnRefreshCandidate(
        {
          ...openFixture,
          source: "espn"
        },
        now
      ),
      true
    );

    assert.equal(
      isEspnRefreshCandidate(
        {
          ...openFixture,
          source: "flashscore"
        },
        now
      ),
      false
    );
  }
);

test(
  "status refresh preserves canonical identity",
  () => {
    const previous = {
      canonicalId:
        "cid_uefaeuropa_dynamokyiv_paoksalonika_20260723",
      matchId: "401896234",
      matchKey:
        "dynamokyiv|paoksalonika|1784826000000",
      source: "espn",
      sourceId: "401896234",
      sourceMatchId: "401896234",
      leagueSlug: "uefa.europa",
      leagueName:
        "UEFA Europa League",
      dayKey: "2026-07-23",
      kickoffUtc:
        "2026-07-23T17:00Z",
      homeTeam: "Dynamo Kyiv",
      awayTeam: "PAOK Salonika",
      status: "PRE",
      rawStatus:
        "STATUS_SCHEDULED",
      scoreHome: null,
      scoreAway: null
    };

    const incoming = {
      matchId: "401896234",
      matchKey:
        "provider-rewritten-key",
      source:
        "espn_direct_league_status",
      sourceId: "401896234",
      sourceMatchId: "401896234",
      providerLeagueSlug:
        "uefa.europa_qual",
      leagueSlug:
        "uefa.europa_qual",
      leagueName:
        "UEFA Europa Qualifying",
      dayKey: "2026-07-24",
      fetchedDayKey:
        "2026-07-23",
      kickoffUtc:
        "2026-07-23T17:05Z",
      homeTeam: "Dynamo Kyiv",
      awayTeam: "PAOK",
      status: "FT",
      rawStatus:
        "STATUS_FULL_TIME",
      minute: "90'+5'",
      scoreHome: 2,
      scoreAway: 3
    };

    const merged =
      mergeStatusRow(
        previous,
        incoming
      );

    for (const field of [
      "canonicalId",
      "matchId",
      "matchKey",
      "source",
      "sourceId",
      "sourceMatchId",
      "leagueSlug",
      "leagueName",
      "dayKey",
      "kickoffUtc",
      "homeTeam",
      "awayTeam"
    ]) {
      assert.equal(
        merged[field],
        previous[field],
        field
      );
    }

    assert.equal(
      merged.providerLeagueSlug,
      "uefa.europa_qual"
    );

    assert.equal(
      merged.status,
      "FT"
    );

    assert.equal(
      merged.rawStatus,
      "STATUS_FULL_TIME"
    );

    assert.equal(
      merged.scoreHome,
      2
    );

    assert.equal(
      merged.scoreAway,
      3
    );
  }
);

test(
  "refresh summary fails closed on provider errors",
  () => {
    const failed =
      finalizeLiveStatusRefreshStats({
        ok: true,
        failedLeagueCount: 1,
        errors: [
          {
            slug: "example",
            error:
              "provider_failed"
          }
        ],
        flashscoreFinalRefresh: {
          attempted: false,
          ok: false
        }
      });

    assert.equal(
      failed.ok,
      false
    );

    const passed =
      finalizeLiveStatusRefreshStats({
        ok: false,
        failedLeagueCount: 0,
        errors: [],
        flashscoreFinalRefresh: {
          attempted: true,
          ok: true
        }
      });

    assert.equal(
      passed.ok,
      true
    );
  }
);

test(
  "Plan B kickoff resolves from kickoffUtc",
  () => {
    assert.equal(
      resolveComparisonKickoff(
        {
          kickoffUtc:
            "2026-07-24T13:00:00.000Z"
        },
        null,
        null
      ),
      "2026-07-24T13:00:00.000Z"
    );
  }
);

test(
  "published Plan B comparison rows expose kickoff",
  () => {
    const publishedRow =
      enrichPick(
        {
          matchId:
            "cid_test_home_away_20260724",
          homeTeam:
            "Home",
          awayTeam:
            "Away",
          leagueSlug:
            "test.1",
          kickoffUtc:
            "2026-07-24T13:00:00.000Z",
          market:
            "OU25",
          pick:
            "OVER"
        },
        null,
        null,
        "plan-b",
        null,
        null
      );

    assert.equal(
      publishedRow.kickoff,
      "2026-07-24T13:00:00.000Z"
    );

    assert.equal(
      publishedRow.planId,
      "plan-b"
    );
  }
);
