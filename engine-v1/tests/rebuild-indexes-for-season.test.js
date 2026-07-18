import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveSeasonFromDay,
  collectIndexRebuildTargets
} from "../jobs/rebuild-indexes-for-season.js";

import {
  resolveTargetDateFromDay,
  resolveGlobalSeasonBounds,
  archiveLabelsForGlobalSeason,
  isTerminalHistoryRow,
  rowHasFiniteScore,
  rowFixtureIdentityKey,
  rowSemanticIdentityKey,
  rowPairScoreIdentityKey,
  mergeIdentityStableRows,
  applyLegacyIdentityLineage
} from "../jobs/build-current-season-indexes.js";

test(
  "July remains in the Aug-to-Jul global season",
  () => {
    assert.equal(
      resolveSeasonFromDay("2026-07-01"),
      "2025-2026"
    );

    assert.equal(
      resolveSeasonFromDay("2026-07-31"),
      "2025-2026"
    );
  }
);

test(
  "global season rolls on 1 August",
  () => {
    assert.equal(
      resolveSeasonFromDay("2026-08-01"),
      "2026-2027"
    );
  }
);

test(
  "winter date resolves to the active cross-year season",
  () => {
    assert.equal(
      resolveSeasonFromDay("2026-01-15"),
      "2025-2026"
    );
  }
);

test(
  "invalid dates fail closed",
  () => {
    assert.equal(
      resolveSeasonFromDay("2026-02-30"),
      "unknown-season"
    );

    assert.equal(
      resolveSeasonFromDay("not-a-date"),
      "unknown-season"
    );
  }
);

test(
  "catch-up rebuild targets are unique per season",
  () => {
    assert.deepEqual(
      collectIndexRebuildTargets([
        {
          day: "2026-07-16",
          season: "2025-2026",
          appended: true
        },
        {
          day: "2026-07-15",
          season: "2025-2026",
          appended: true
        },
        {
          day: "2026-08-02",
          season: "2026-2027",
          appended: true
        },
        {
          day: "2026-07-14",
          season: "2025-2026",
          appended: false
        }
      ]),
      [
        {
          season: "2025-2026",
          day: "2026-07-16"
        },
        {
          season: "2026-2027",
          day: "2026-08-02"
        }
      ]
    );
  }
);
test(
  "index target day is parsed exactly",
  () => {
    assert.equal(
      resolveTargetDateFromDay(
        "2026-07-18"
      )?.toISOString(),
      "2026-07-18T00:00:00.000Z"
    );
  }
);

test(
  "invalid index target days fail closed",
  () => {
    assert.equal(
      resolveTargetDateFromDay(
        "2026-02-30"
      ),
      null
    );

    assert.equal(
      resolveTargetDateFromDay(
        "invalid"
      ),
      null
    );
  }
);
test(
  "global season bounds use August through July",
  () => {
    assert.deepEqual(
      resolveGlobalSeasonBounds(
        "2025-2026"
      ),
      {
        startYear: 2025,
        endYear: 2026,
        startDay: "2025-08-01",
        endDay: "2026-07-31"
      }
    );

    assert.equal(
      resolveGlobalSeasonBounds(
        "2025-2027"
      ),
      null
    );
  }
);

test(
  "calendar leagues read both years touched by global season",
  () => {
    assert.deepEqual(
      archiveLabelsForGlobalSeason(
        "nor.1",
        "2025-2026"
      ),
      [
        "2025",
        "2026"
      ]
    );
  }
);

test(
  "cross-year leagues read one archive season",
  () => {
    assert.deepEqual(
      archiveLabelsForGlobalSeason(
        "eng.1",
        "2025-2026"
      ),
      [
        "2025-2026"
      ]
    );
  }
);

test(
  "non-terminal archive rows are rejected",
  () => {
    assert.equal(
      isTerminalHistoryRow({
        status: "STATUS_SCHEDULED",
        scoreHome: 0,
        scoreAway: 0
      }),
      false
    );

    assert.equal(
      isTerminalHistoryRow({
        status: "FT",
        scoreHome: 0,
        scoreAway: 0
      }),
      true
    );

    assert.equal(
      isTerminalHistoryRow({
        operationalState:
          "TERMINAL_CONFIRMED"
      }),
      true
    );
  }
);
test(
  "score validation rejects missing and malformed values",
  () => {
    assert.equal(
      rowHasFiniteScore({
        scoreHome: null,
        scoreAway: 0
      }),
      false
    );

    assert.equal(
      rowHasFiniteScore({
        scoreHome: "",
        scoreAway: "0"
      }),
      false
    );

    assert.equal(
      rowHasFiniteScore({
        scoreHome: " ",
        scoreAway: 0
      }),
      false
    );

    assert.equal(
      rowHasFiniteScore({
        scoreHome: -1,
        scoreAway: 0
      }),
      false
    );

    assert.equal(
      rowHasFiniteScore({
        scoreHome: 1.5,
        scoreAway: 0
      }),
      false
    );

    assert.equal(
      rowHasFiniteScore({
        scoreHome: "0",
        scoreAway: "0"
      }),
      true
    );

    assert.equal(
      rowHasFiniteScore({
        scoreHome: 3,
        scoreAway: 1
      }),
      true
    );
  }
);
test(
  "canonical terminal status strings are accepted",
  () => {
    assert.equal(
      isTerminalHistoryRow({
        status:
          "STATUS_FULL_TIME"
      }),
      true
    );

    assert.equal(
      isTerminalHistoryRow({
        status:
          "STATUS_FINAL"
      }),
      true
    );

    assert.equal(
      isTerminalHistoryRow({
        status:
          "STATUS_AET"
      }),
      true
    );

    assert.equal(
      isTerminalHistoryRow({
        status:
          "STATUS_PENALTIES"
      }),
      true
    );

    assert.equal(
      isTerminalHistoryRow({
        status:
          "STATUS_SCHEDULED"
      }),
      false
    );

    assert.equal(
      isTerminalHistoryRow({
        status:
          "STATUS_FIRST_HALF"
      }),
      false
    );
  }
);
test(
  "archive supplements missing matches inside history-covered leagues",
  () => {
    const history = [
      {
        id: "history-1",
        leagueSlug: "nor.1",
        dayKey: "2026-07-16",
        homeTeam: "Alpha",
        awayTeam: "Beta",
        scoreHome: 1,
        scoreAway: 0
      }
    ];

    const archive = [
      {
        id: "archive-2",
        leagueSlug: "nor.1",
        dayKey: "2026-07-17",
        homeTeam: "Gamma",
        awayTeam: "Delta",
        scoreHome: 2,
        scoreAway: 1
      }
    ];

    const result =
      mergeIdentityStableRows(
        history,
        archive
      );

    assert.equal(
      result.rows.length,
      2
    );

    assert.equal(
      result.metrics.historyAccepted,
      1
    );

    assert.equal(
      result.metrics.archiveAccepted,
      1
    );
  }
);

test(
  "history identity wins over semantic archive duplicates",
  () => {
    const history = [
      {
        id: "stable-history-id",
        leagueSlug: "fin.1",
        dayKey: "2026-07-10",
        homeTeam: "VPS",
        awayTeam: "SJK",
        scoreHome: 1,
        scoreAway: 0
      }
    ];

    const archive = [
      {
        id: "different-archive-id",
        leagueSlug: "fin.1",
        dayKey: "2026-07-10",
        homeTeam: "VPS",
        awayTeam: "SJK",
        scoreHome: 1,
        scoreAway: 0
      }
    ];

    const result =
      mergeIdentityStableRows(
        history,
        archive
      );

    assert.deepEqual(
      result.rows.map(
        row => row.id
      ),
      [
        "stable-history-id"
      ]
    );

    assert.equal(
      result.metrics.semanticDuplicateRejected,
      1
    );
  }
);

test(
  "duplicate IDs are rejected during archive supplementation",
  () => {
    const history = [
      {
        id: "same-id",
        leagueSlug: "swe.1",
        dayKey: "2026-07-10",
        homeTeam: "One",
        awayTeam: "Two",
        scoreHome: 2,
        scoreAway: 0
      }
    ];

    const archive = [
      {
        id: "same-id",
        leagueSlug: "swe.1",
        dayKey: "2026-07-11",
        homeTeam: "Three",
        awayTeam: "Four",
        scoreHome: 1,
        scoreAway: 1
      }
    ];

    const result =
      mergeIdentityStableRows(
        history,
        archive
      );

    assert.equal(
      result.rows.length,
      1
    );

    assert.equal(
      result.metrics.duplicateIdRejected,
      1
    );
  }
);

test(
  "archive score conflicts are rejected fail closed",
  () => {
    const history = [
      {
        id: "history-result",
        leagueSlug: "irl.1",
        dayKey: "2026-07-12",
        homeTeam: "Home",
        awayTeam: "Away",
        scoreHome: 3,
        scoreAway: 1
      }
    ];

    const archive = [
      {
        id: "archive-conflict",
        leagueSlug: "irl.1",
        dayKey: "2026-07-12",
        homeTeam: "Home",
        awayTeam: "Away",
        scoreHome: 0,
        scoreAway: 0
      }
    ];

    const result =
      mergeIdentityStableRows(
        history,
        archive
      );

    assert.equal(
      result.rows.length,
      1
    );

    assert.equal(
      result.metrics.scoreConflictRejected,
      1
    );

    assert.equal(
      result.rows[0].scoreHome,
      3
    );
  }
);

test(
  "fixture and semantic keys normalize casing and whitespace",
  () => {
    const left = {
      leagueSlug: "NOR.1",
      dayKey: "2026-07-17",
      homeTeam: "  Viking  FK ",
      awayTeam: "Molde",
      scoreHome: 2,
      scoreAway: 1
    };

    const right = {
      leagueSlug: "nor.1",
      dayKey: "2026-07-17",
      homeTeam: "viking fk",
      awayTeam: " MOLDE ",
      scoreHome: "2",
      scoreAway: "1"
    };

    assert.equal(
      rowFixtureIdentityKey(left),
      rowFixtureIdentityKey(right)
    );

    assert.equal(
      rowSemanticIdentityKey(left),
      rowSemanticIdentityKey(right)
    );
  }
);
test(
  "history wins over adjacent-day archive duplicate",
  () => {
    const history = [
      {
        id: "history-id",
        leagueSlug: "ecu.1",
        dayKey: "2026-07-02",
        homeTeam: "Liga de Quito",
        awayTeam: "Orense",
        scoreHome: 3,
        scoreAway: 0
      }
    ];

    const archive = [
      {
        id: "archive-id",
        leagueSlug: "ecu.1",
        dayKey: "2026-07-01",
        homeTeam: "Liga de Quito",
        awayTeam: "Orense",
        scoreHome: 3,
        scoreAway: 0
      }
    ];

    const result =
      mergeIdentityStableRows(
        history,
        archive
      );

    assert.equal(
      result.rows.length,
      1
    );

    assert.equal(
      result.rows[0].id,
      "history-id"
    );

    assert.equal(
      result.metrics
        .adjacentDayHistoryDuplicateRejected,
      1
    );
  }
);

test(
  "pair-score identity ignores day but preserves teams and score",
  () => {
    assert.equal(
      rowPairScoreIdentityKey({
        leagueSlug: "ECU.1",
        homeTeam: " Liga de Quito ",
        awayTeam: "ORENSE",
        scoreHome: 3,
        scoreAway: 0
      }),
      rowPairScoreIdentityKey({
        leagueSlug: "ecu.1",
        homeTeam: "liga de quito",
        awayTeam: "Orense",
        scoreHome: "3",
        scoreAway: "0"
      })
    );
  }
);

test(
  "exact legacy ID survives adjacent-day truth correction",
  () => {
    const truth = [
      {
        id: "stable-id",
        leagueSlug: "usa.2",
        dayKey: "2026-07-02",
        homeTeam: "Alpha",
        awayTeam: "Beta",
        scoreHome: 2,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const legacy = [
      {
        id: "stable-id",
        leagueSlug: "usa.2",
        dayKey: "2026-07-01",
        homeTeam: "Alpha",
        awayTeam: "Beta",
        scoreHome: 2,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const result =
      applyLegacyIdentityLineage(
        truth,
        legacy,
        {
          startDay: "2025-08-01",
          endDay: "2026-07-31"
        }
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.rows[0].id,
      "stable-id"
    );

    assert.equal(
      result.rows[0].dayKey,
      "2026-07-02"
    );
  }
);

test(
  "placeholder legacy identity is replaced by terminal truth facts",
  () => {
    const truth = [
      {
        id: "cup-final-id",
        leagueSlug:
          "uefa.champions",
        dayKey: "2026-05-30",
        homeTeam:
          "Paris Saint-Germain",
        awayTeam: "Arsenal",
        scoreHome: 1,
        scoreAway: 1,
        status: "FT"
      }
    ];

    const legacy = [
      {
        id: "cup-final-id",
        leagueSlug:
          "uefa.champions",
        dayKey: "2026-05-30",
        homeTeam:
          "Semifinal 1 Winner",
        awayTeam:
          "Semifinal 2 Winner",
        scoreHome: 0,
        scoreAway: 0,
        status: "PRE"
      }
    ];

    const result =
      applyLegacyIdentityLineage(
        truth,
        legacy,
        {
          startDay: "2025-08-01",
          endDay: "2026-07-31"
        }
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.rows[0].id,
      "cup-final-id"
    );

    assert.equal(
      result.rows[0].homeTeam,
      "Paris Saint-Germain"
    );

    assert.equal(
      result.rows[0].scoreHome,
      1
    );
  }
);

test(
  "single legacy alias becomes the stable output ID",
  () => {
    const truth = [
      {
        id: "new-provider-id",
        leagueSlug: "nor.1",
        dayKey: "2026-07-10",
        homeTeam: "VPS",
        awayTeam: "SJK",
        scoreHome: 1,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const legacy = [
      {
        id: "old-stable-id",
        leagueSlug: "nor.1",
        dayKey: "2026-07-10",
        homeTeam: "VPS",
        awayTeam: "SJK",
        scoreHome: 1,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const result =
      applyLegacyIdentityLineage(
        truth,
        legacy,
        {
          startDay: "2025-08-01",
          endDay: "2026-07-31"
        }
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.rows[0].id,
      "old-stable-id"
    );

    assert.deepEqual(
      result.rows[0].sourceMatchIds,
      [
        "old-stable-id",
        "new-provider-id"
      ]
    );
  }
);

test(
  "score-updated fixture keeps its legacy identity",
  () => {
    const truth = [
      {
        id: "new-result-id",
        leagueSlug: "irl.1",
        dayKey: "2026-07-12",
        homeTeam: "Home",
        awayTeam: "Away",
        scoreHome: 3,
        scoreAway: 1,
        status: "FT"
      }
    ];

    const legacy = [
      {
        id: "old-fixture-id",
        leagueSlug: "irl.1",
        dayKey: "2026-07-12",
        homeTeam: "Home",
        awayTeam: "Away",
        scoreHome: 0,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const result =
      applyLegacyIdentityLineage(
        truth,
        legacy,
        {
          startDay: "2025-08-01",
          endDay: "2026-07-31"
        }
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.rows[0].id,
      "old-fixture-id"
    );

    assert.equal(
      result.rows[0].scoreHome,
      3
    );
  }
);

test(
  "multiple legacy IDs collapse into lineage aliases",
  () => {
    const truth = [
      {
        id:
          "cid_nor1_sandefjord_hamkam_20260712",
        leagueSlug: "nor.1",
        dayKey: "2026-07-12",
        homeTeam: "Sandefjord",
        awayTeam: "HamKam",
        scoreHome: 2,
        scoreAway: 2,
        status: "FT"
      }
    ];

    const legacy = [
      {
        id: "401843375",
        leagueSlug: "nor.1",
        dayKey: "2026-07-12",
        homeTeam: "Sandefjord",
        awayTeam: "HamKam",
        scoreHome: 2,
        scoreAway: 2,
        status: "FT"
      },
      {
        id: "ChZtuELH",
        leagueSlug: "nor.1",
        dayKey: "2026-07-12",
        homeTeam: "Sandefjord",
        awayTeam: "HamKam",
        scoreHome: 2,
        scoreAway: 2,
        status: "FT"
      }
    ];

    const result =
      applyLegacyIdentityLineage(
        truth,
        legacy,
        {
          startDay: "2025-08-01",
          endDay: "2026-07-31"
        }
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.rows.length,
      1
    );

    assert.equal(
      result.rows[0].id,
      "cid_nor1_sandefjord_hamkam_20260712"
    );

    assert.deepEqual(
      result.rows[0].legacyMatchIds,
      [
        "401843375",
        "ChZtuELH"
      ]
    );

    assert.equal(
      result.metrics
        .eventsWithMultipleLegacyIds,
      1
    );
  }
);

test(
  "outside-season and orphan nonterminal rows are intentionally excluded",
  () => {
    const truth = [
      {
        id: "new-current-id",
        leagueSlug: "test.1",
        dayKey: "2026-07-17",
        homeTeam: "Current Home",
        awayTeam: "Current Away",
        scoreHome: 1,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const legacy = [
      {
        id: "previous-season-id",
        leagueSlug: "test.1",
        dayKey: "2025-07-20",
        homeTeam: "Old Home",
        awayTeam: "Old Away",
        scoreHome: 2,
        scoreAway: 1,
        status: "FT"
      },
      {
        id: "orphan-pre-id",
        leagueSlug: "test.1",
        dayKey: "2026-05-01",
        homeTeam: "TBD",
        awayTeam: "TBD Away",
        scoreHome: 0,
        scoreAway: 0,
        status: "PRE"
      }
    ];

    const result =
      applyLegacyIdentityLineage(
        truth,
        legacy,
        {
          startDay: "2025-08-01",
          endDay: "2026-07-31"
        }
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.metrics
        .excludedOutsideSeason,
      1
    );

    assert.equal(
      result.metrics
        .excludedNonTerminalWithoutTruth,
      1
    );
  }
);

test(
  "unmatched terminal current-season identity fails closed",
  () => {
    const result =
      applyLegacyIdentityLineage(
        [],
        [
          {
            id: "unmatched-terminal",
            leagueSlug: "test.1",
            dayKey: "2026-06-01",
            homeTeam: "Home",
            awayTeam: "Away",
            scoreHome: 1,
            scoreAway: 0,
            status: "FT"
          }
        ],
        {
          startDay: "2025-08-01",
          endDay: "2026-07-31"
        }
      );

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.unresolved.length,
      1
    );
  }
);
test(
  "single-alias lineage is idempotent",
  () => {
    const truth = [
      {
        id: "provider-new",
        leagueSlug: "nor.1",
        dayKey: "2026-07-10",
        homeTeam: "VPS",
        awayTeam: "SJK",
        scoreHome: 1,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const originalLegacy = [
      {
        id: "stable-old",
        leagueSlug: "nor.1",
        dayKey: "2026-07-10",
        homeTeam: "VPS",
        awayTeam: "SJK",
        scoreHome: 1,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const bounds = {
      startDay: "2025-08-01",
      endDay: "2026-07-31"
    };

    const first =
      applyLegacyIdentityLineage(
        truth,
        originalLegacy,
        bounds
      );

    const second =
      applyLegacyIdentityLineage(
        truth,
        first.rows,
        bounds
      );

    assert.equal(
      first.ok,
      true
    );

    assert.equal(
      second.ok,
      true
    );

    assert.deepEqual(
      second.rows,
      first.rows
    );
  }
);

test(
  "multiple-alias lineage is idempotent",
  () => {
    const truth = [
      {
        id: "provider-canonical",
        leagueSlug: "nor.1",
        dayKey: "2026-07-12",
        homeTeam: "Sandefjord",
        awayTeam: "HamKam",
        scoreHome: 2,
        scoreAway: 2,
        status: "FT"
      }
    ];

    const originalLegacy = [
      {
        id: "401843375",
        leagueSlug: "nor.1",
        dayKey: "2026-07-12",
        homeTeam: "Sandefjord",
        awayTeam: "HamKam",
        scoreHome: 2,
        scoreAway: 2,
        status: "FT"
      },
      {
        id: "ChZtuELH",
        leagueSlug: "nor.1",
        dayKey: "2026-07-12",
        homeTeam: "Sandefjord",
        awayTeam: "HamKam",
        scoreHome: 2,
        scoreAway: 2,
        status: "FT"
      }
    ];

    const bounds = {
      startDay: "2025-08-01",
      endDay: "2026-07-31"
    };

    const first =
      applyLegacyIdentityLineage(
        truth,
        originalLegacy,
        bounds
      );

    const second =
      applyLegacyIdentityLineage(
        truth,
        first.rows,
        bounds
      );

    assert.equal(
      first.ok,
      true
    );

    assert.equal(
      second.ok,
      true
    );

    assert.deepEqual(
      second.rows,
      first.rows
    );

    assert.deepEqual(
      second.rows[0].legacyMatchIds,
      [
        "401843375",
        "ChZtuELH"
      ]
    );

    assert.equal(
      second.metrics
        .eventsWithMultipleLegacyIds,
      1
    );
  }
);
test(
  "unchanged truth rows remain metadata-free",
  () => {
    const truth = [
      {
        id: "same-id",
        leagueSlug: "test.1",
        dayKey: "2026-07-17",
        homeTeam: "Home",
        awayTeam: "Away",
        scoreHome: 2,
        scoreAway: 1,
        status: "FT"
      }
    ];

    const bounds = {
      startDay: "2025-08-01",
      endDay: "2026-07-31"
    };

    const first =
      applyLegacyIdentityLineage(
        truth,
        truth,
        bounds
      );

    const second =
      applyLegacyIdentityLineage(
        truth,
        first.rows,
        bounds
      );

    assert.equal(
      first.ok,
      true
    );

    assert.equal(
      second.ok,
      true
    );

    assert.deepEqual(
      first.rows,
      truth
    );

    assert.deepEqual(
      second.rows,
      truth
    );

    assert.equal(
      Object.hasOwn(
        first.rows[0],
        "matchId"
      ),
      false
    );

    assert.equal(
      Object.hasOwn(
        first.rows[0],
        "sourceMatchIds"
      ),
      false
    );

    assert.equal(
      Object.hasOwn(
        first.rows[0],
        "legacyMatchIds"
      ),
      false
    );
  }
);

test(
  "single provider replacement does not create a self legacy alias",
  () => {
    const truth = [
      {
        id: "provider-new",
        leagueSlug: "test.1",
        dayKey: "2026-07-17",
        homeTeam: "Home",
        awayTeam: "Away",
        scoreHome: 1,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const legacy = [
      {
        id: "stable-old",
        leagueSlug: "test.1",
        dayKey: "2026-07-17",
        homeTeam: "Home",
        awayTeam: "Away",
        scoreHome: 1,
        scoreAway: 0,
        status: "FT"
      }
    ];

    const bounds = {
      startDay: "2025-08-01",
      endDay: "2026-07-31"
    };

    const first =
      applyLegacyIdentityLineage(
        truth,
        legacy,
        bounds
      );

    const second =
      applyLegacyIdentityLineage(
        truth,
        first.rows,
        bounds
      );

    assert.equal(
      first.ok,
      true
    );

    assert.equal(
      second.ok,
      true
    );

    assert.equal(
      first.rows[0].id,
      "stable-old"
    );

    assert.deepEqual(
      first.rows[0].sourceMatchIds,
      [
        "stable-old",
        "provider-new"
      ]
    );

    assert.deepEqual(
      first.rows[0].legacyMatchIds,
      []
    );

    assert.deepEqual(
      second.rows,
      first.rows
    );
  }
);