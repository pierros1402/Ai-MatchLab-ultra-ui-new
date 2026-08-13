import test from "node:test";
import assert from "node:assert/strict";

import { contentHash } from "./export-odds-snapshot-day.js";

function row(prob = 0.55) {
  return {
    matchId: "cid_test_home_away_20260813",
    canonicalId: "cid_test_home_away_20260813",
    leagueSlug: "test.1",
    competition: "Test League",
    home: "Home",
    away: "Away",
    dayKey: "2026-08-13",
    kickoffUtc: "2026-08-13T18:00:00.000Z",
    market: null,
    aiAssessment: {
      model: { source: "ai_poisson" },
      markets: {
        OU25: {
          probs: { over: prob, under: 1 - prob }
        }
      }
    }
  };
}

test("odds snapshot hash is stable for identical model assessments", () => {
  assert.equal(contentHash([row()]), contentHash([row()]));
});

test("odds snapshot hash changes when only aiAssessment.markets changes", () => {
  assert.notEqual(contentHash([row(0.55)]), contentHash([row(0.61)]));
});
