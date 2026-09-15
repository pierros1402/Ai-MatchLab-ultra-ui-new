import test from "node:test";
import assert from "node:assert/strict";

import {
  summarizeFinalizationReadinessRows
} from "./audit-finalization-readiness-day.js";

function summarize(rows) {
  return summarizeFinalizationReadinessRows(
    "2026-09-15",
    rows,
    {
      source: "test",
      exists: true
    }
  );
}

test(
  "played final plus postponed closes safely without inventing a postponed score",
  () => {
    const result = summarize([
      {
        matchId: "played",
        leagueSlug: "test.1",
        status: "FT",
        rawStatus: "STATUS_FINAL",
        scoreHome: 2,
        scoreAway: 1
      },
      {
        matchId: "postponed",
        leagueSlug: "test.1",
        status: "SPECIAL",
        rawStatus: "STATUS_POSTPONED",
        scoreHome: null,
        scoreAway: null
      }
    ]);

    assert.equal(result.safeToFinalizeStats, true);
    assert.equal(result.terminal, 2);
    assert.equal(result.playedTerminal, 1);
    assert.equal(result.nonPlayedTerminal, 1);
    assert.equal(result.terminalWithScore, 1);
    assert.equal(result.terminalMissingScore, 0);
    assert.equal(result.open, 0);
  }
);

test(
  "played final with missing score fails closed instead of coercing null to zero",
  () => {
    const result = summarize([
      {
        matchId: "missing-score",
        leagueSlug: "test.1",
        status: "FT",
        rawStatus: "STATUS_FINAL",
        scoreHome: null,
        scoreAway: null
      }
    ]);

    assert.equal(result.safeToFinalizeStats, false);
    assert.equal(result.playedTerminal, 1);
    assert.equal(result.terminalMissingScore, 1);
    assert.equal(result.terminalWithScore, 0);
  }
);

test(
  "suspended delayed live and unresolved rows remain operationally open",
  () => {
    const result = summarize([
      {
        matchId: "suspended",
        status: "SPECIAL",
        rawStatus: "STATUS_SUSPENDED"
      },
      {
        matchId: "delayed",
        status: "LIVE",
        rawStatus: "STATUS_DELAYED"
      },
      {
        matchId: "live",
        status: "LIVE"
      },
      {
        matchId: "unknown",
        status: "SPECIAL"
      }
    ]);

    assert.equal(result.safeToFinalizeStats, false);
    assert.equal(result.terminal, 0);
    assert.equal(result.open, 4);
    assert.equal(result.unknown, 1);
  }
);

test(
  "played-final versus postponed conflict fails closed",
  () => {
    const result = summarize([
      {
        matchId: "conflict",
        status: "FT",
        rawStatus: "STATUS_POSTPONED",
        scoreHome: 1,
        scoreAway: 0
      }
    ]);

    assert.equal(result.safeToFinalizeStats, false);
    assert.equal(result.terminal, 0);
    assert.equal(result.open, 1);
    assert.equal(result.conflict, 1);
  }
);

test(
  "penalty final remains a played terminal",
  () => {
    const result = summarize([
      {
        matchId: "pens",
        status: "FT",
        rawStatus: "STATUS_FINAL_PEN",
        scoreHome: 1,
        scoreAway: 1
      }
    ]);

    assert.equal(result.safeToFinalizeStats, true);
    assert.equal(result.playedTerminal, 1);
    assert.equal(result.nonPlayedTerminal, 0);
    assert.equal(result.terminalMissingScore, 0);
  }
);

test(
  "duplicate fixture identity still blocks finalization",
  () => {
    const row = {
      matchId: "duplicate",
      status: "FT",
      rawStatus: "STATUS_FINAL",
      scoreHome: 1,
      scoreAway: 0
    };

    const result = summarize([row, { ...row }]);

    assert.equal(result.safeToFinalizeStats, false);
    assert.equal(result.duplicateIdCount, 1);
  }
);
