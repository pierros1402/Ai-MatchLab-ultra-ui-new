import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFlashscoreFeed
} from "../odds/flashscore-fixtures-source.js";

import {
  isExactFlashscoreFinalRow
} from "../jobs/run-live-status-refresh-day.js";

import {
  isScored
} from "../jobs/export-verified-final-results-day.js";

function record(fields) {
  return Object.entries(fields)
    .map(([key, value]) =>
      `${key}÷${value}`
    )
    .join("¬");
}

function feed(matchFields) {
  const league = record({
    ZA: "KAZAKHSTAN: Premier League",
    ZY: "Kazakhstan",
    ZL: "/football/kazakhstan/premier-league/"
  });

  return `${league}~${record(matchFields)}`;
}

test(
  "AB=3 AC=4 without AG/AH is non-played terminal",
  () => {
    const rows = parseFlashscoreFeed(
      feed({
        AA: "ldvtm1Wg",
        AD: "1784469600",
        AB: "3",
        AC: "4",
        AE: "Ertis Pavlodar",
        AF: "FC Astana"
      })
    );

    assert.equal(rows.length, 1);

    const row = rows[0];

    assert.equal(row.statusCode, "3");
    assert.equal(
      row.statusDetailCode,
      "4"
    );
    assert.equal(row.scoreHome, null);
    assert.equal(row.scoreAway, null);
    assert.equal(
      row.hasCompleteScore,
      false
    );
    assert.equal(
      row.playedFinal,
      false
    );
    assert.equal(
      row.nonPlayedTerminal,
      true
    );
    assert.equal(row.finished, false);
  }
);

test(
  "AB=3 with explicit scores is classified as played final",
  () => {
    const rows = parseFlashscoreFeed(
      feed({
        AA: "playedFinal01",
        AD: "1784440800",
        AB: "3",
        AC: "3",
        AG: "2",
        AH: "1",
        AE: "Home",
        AF: "Away"
      })
    );

    assert.equal(rows.length, 1);

    const row = rows[0];

    assert.equal(row.scoreHome, 2);
    assert.equal(row.scoreAway, 1);
    assert.equal(
      row.hasCompleteScore,
      true
    );
    assert.equal(
      row.playedFinal,
      true
    );
    assert.equal(
      row.nonPlayedTerminal,
      false
    );
    assert.equal(row.finished, true);
  }
);

test(
  "invalid or partial scores never create a played final",
  () => {
    const rows = parseFlashscoreFeed(
      feed({
        AA: "partialScore01",
        AD: "1784440800",
        AB: "3",
        AC: "3",
        AG: "0",
        AH: "",
        AE: "Home",
        AF: "Away"
      })
    );

    assert.equal(rows.length, 1);

    const row = rows[0];

    assert.equal(row.scoreHome, 0);
    assert.equal(row.scoreAway, null);
    assert.equal(
      row.hasCompleteScore,
      false
    );
    assert.equal(
      row.playedFinal,
      false
    );
    assert.equal(
      row.nonPlayedTerminal,
      true
    );
    assert.equal(row.finished, false);
  }
);

test(
  "live-status guard rejects non-played and future final rows",
  () => {
    const nowMs = Date.parse(
      "2026-07-19T10:00:00.000Z"
    );

    const nonPlayed = {
      finished: false,
      playedFinal: false,
      nonPlayedTerminal: true,
      statusCode: "3",
      statusDetailCode: "4",
      scoreHome: null,
      scoreAway: null,
      kickoffUtc:
        "2026-07-19T14:00:00.000Z"
    };

    assert.equal(
      isExactFlashscoreFinalRow(
        nonPlayed,
        "2026-07-19",
        nowMs
      ),
      false
    );

    const impossibleFutureFinal = {
      finished: true,
      playedFinal: true,
      nonPlayedTerminal: false,
      statusCode: "3",
      statusDetailCode: "3",
      scoreHome: 1,
      scoreAway: 0,
      kickoffUtc:
        "2026-07-19T14:00:00.000Z"
    };

    assert.equal(
      isExactFlashscoreFinalRow(
        impossibleFutureFinal,
        "2026-07-19",
        nowMs
      ),
      false
    );

    const validPastFinal = {
      ...impossibleFutureFinal,
      kickoffUtc:
        "2026-07-19T08:00:00.000Z"
    };

    assert.equal(
      isExactFlashscoreFinalRow(
        validPastFinal,
        "2026-07-19",
        nowMs
      ),
      true
    );
  }
);

test(
  "verified-final exporter rejects null scores and future kickoff",
  () => {
    const nowMs = Date.parse(
      "2026-07-19T10:00:00.000Z"
    );

    assert.equal(
      isScored({
        finished: true,
        playedFinal: false,
        nonPlayedTerminal: true,
        statusCode: "3",
        scoreHome: null,
        scoreAway: null,
        kickoffUtc:
          "2026-07-19T14:00:00.000Z"
      }, nowMs),
      false
    );

    assert.equal(
      isScored({
        finished: true,
        playedFinal: true,
        nonPlayedTerminal: false,
        statusCode: "3",
        scoreHome: 0,
        scoreAway: 0,
        kickoffUtc:
          "2026-07-19T14:00:00.000Z"
      }, nowMs),
      false
    );

    assert.equal(
      isScored({
        finished: true,
        playedFinal: true,
        nonPlayedTerminal: false,
        statusCode: "3",
        scoreHome: 0,
        scoreAway: 0,
        kickoffUtc:
          "2026-07-19T08:00:00.000Z"
      }, nowMs),
      true
    );
  }
);
