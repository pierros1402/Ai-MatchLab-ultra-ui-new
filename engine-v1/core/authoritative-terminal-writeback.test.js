import test from "node:test";
import assert from "node:assert/strict";

import {
  applyAuthoritativeTerminalWriteback,
  evaluateAuthoritativeTerminalWriteback
} from "./authoritative-terminal-writeback.js";

function canonical(overrides = {}) {
  return {
    canonicalId:
      "cid_test_home_away_20260729",
    matchId:
      "401841449",
    source:
      "espn",
    sourceId:
      "401841449",
    sourceMatchId:
      "401841449",
    leagueSlug:
      "test.1",
    kickoffUtc:
      "2026-07-29T00:15:00Z",
    homeTeam:
      "Home Club",
    awayTeam:
      "Away Club",
    status:
      "PRE",
    rawStatus:
      "STATUS_SCHEDULED",
    scoreHome:
      null,
    scoreAway:
      null,
    ...overrides
  };
}

function terminal(overrides = {}) {
  return {
    canonicalId:
      "cid_test_home_away_20260729",
    matchId:
      "cid_test_home_away_20260729",
    providerMatchId:
      "401841449",
    source:
      "reconciled",
    kickoffUtc:
      "2026-07-29T00:15:00Z",
    homeTeam:
      "Home Club",
    awayTeam:
      "Away Club",
    status:
      "FT",
    statusType:
      "STATUS_FINAL",
    rawStatus:
      "STATUS_FULL_TIME",
    minute:
      "FT",
    scoreHome:
      3,
    scoreAway:
      0,
    ...overrides
  };
}

test(
  "promotes an exact authoritative terminal observation",
  () => {
    const result =
      applyAuthoritativeTerminalWriteback({
        canonicalRow:
          canonical(),
        observationRow:
          terminal(),
        dayKey:
          "2026-07-29",
        promotedAt:
          "2026-07-29T05:30:00.000Z"
      });

    assert.equal(
      result.changed,
      true
    );

    assert.equal(
      result.row.status,
      "FT"
    );

    assert.equal(
      result.row.scoreHome,
      3
    );

    assert.equal(
      result.row.scoreAway,
      0
    );

    assert.equal(
      result.row.source,
      "espn"
    );

    assert.equal(
      result.row
        .authoritativeTerminalWriteback
        .providerMatchId,
      "401841449"
    );
  }
);

test(
  "rejects a different provider ID",
  () => {
    const result =
      evaluateAuthoritativeTerminalWriteback({
        canonicalRow:
          canonical(),
        observationRow:
          terminal({
            providerMatchId:
              "999999999"
          }),
        dayKey:
          "2026-07-29"
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "exact_provider_id_mismatch"
    );
  }
);

test(
  "rejects an observation from another Athens day",
  () => {
    const result =
      evaluateAuthoritativeTerminalWriteback({
        canonicalRow:
          canonical(),
        observationRow:
          terminal({
            kickoffUtc:
              "2026-07-30T00:15:00Z"
          }),
        dayKey:
          "2026-07-29"
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "athens_day_mismatch"
    );
  }
);

test(
  "rejects reversed home and away identity",
  () => {
    const result =
      evaluateAuthoritativeTerminalWriteback({
        canonicalRow:
          canonical(),
        observationRow:
          terminal({
            homeTeam:
              "Away Club",
            awayTeam:
              "Home Club"
          }),
        dayKey:
          "2026-07-29"
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "ordered_team_identity_mismatch"
    );
  }
);

test(
  "rejects a scheduled observation",
  () => {
    const result =
      evaluateAuthoritativeTerminalWriteback({
        canonicalRow:
          canonical(),
        observationRow:
          terminal({
            status:
              "PRE",
            statusType:
              "STATUS_SCHEDULED",
            rawStatus:
              "STATUS_SCHEDULED"
          }),
        dayKey:
          "2026-07-29"
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "explicit_terminal_status_required"
    );
  }
);

test(
  "rejects exact production regression FT/final with scheduled raw status",
  () => {
    const result = evaluateAuthoritativeTerminalWriteback({
      canonicalRow: canonical(),
      observationRow: terminal({
        status: "FT",
        statusType: "STATUS_FINAL",
        rawStatus: "STATUS_SCHEDULED",
        scoreHome: 1,
        scoreAway: 1
      }),
      dayKey: "2026-07-29"
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "conflicting_match_state_evidence");
  }
);

test(
  "rejects a missing or invalid score",
  () => {
    const result =
      evaluateAuthoritativeTerminalWriteback({
        canonicalRow:
          canonical(),
        observationRow:
          terminal({
            scoreHome:
              null,
            scoreAway:
              -1
          }),
        dayKey:
          "2026-07-29"
      });

    assert.equal(result.ok, false);
    assert.equal(
      result.reason,
      "valid_numeric_score_required"
    );
  }
);

test(
  "is idempotent when canonical status and score already match",
  () => {
    const result =
      applyAuthoritativeTerminalWriteback({
        canonicalRow:
          canonical({
            status:
              "FT",
            statusType:
              "STATUS_FINAL",
            rawStatus:
              "STATUS_FULL_TIME",
            scoreHome:
              3,
            scoreAway:
              0
          }),
        observationRow:
          terminal(),
        dayKey:
          "2026-07-29"
      });

    assert.equal(
      result.changed,
      false
    );
  }
);

test(
  "rejects mixed scheduled and final evidence",
  () => {
    const result = evaluateAuthoritativeTerminalWriteback({
      canonicalRow: canonical(),
      observationRow: terminal({
        status: "STATUS_SCHEDULED",
        statusType: "FINAL",
        rawStatus: "STATUS_FULL_TIME"
      }),
      dayKey: "2026-07-29"
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "conflicting_match_state_evidence");
  }
);

test(
  "normalizes a secondary-only terminal observation to primary FT",
  () => {
    const result = applyAuthoritativeTerminalWriteback({
      canonicalRow: canonical(),
      observationRow: terminal({
        status: "SPECIAL",
        statusType: "STATUS_FINAL",
        rawStatus: "STATUS_FULL_TIME"
      }),
      dayKey: "2026-07-29"
    });

    assert.equal(result.changed, true);
    assert.equal(result.row.status, "FT");
    assert.equal(result.row.scoreHome, 3);
    assert.equal(result.row.scoreAway, 0);
  }
);