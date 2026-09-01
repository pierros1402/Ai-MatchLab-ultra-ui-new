import test from "node:test";
import assert from "node:assert/strict";

import {
  selectIntelligenceValuePicksForPublication,
} from "../ai-match-intelligence/load-intelligence-support.js";

test(
  "explicit current Value cannot leak into Details intelligence when frozen publication is empty",
  () => {
    const currentPick = {
      matchId: "cid_test_home_away_20990101",
      market: "1X2",
      pick: "HOME",
    };

    const selected = selectIntelligenceValuePicksForPublication(
      "2099-01-01",
      currentPick.matchId,
      [currentPick],
      {
        publicationResolver: () => ({
          ok: true,
          authority: "frozen_plan_a_observation",
          payload: {
            date: "2099-01-01",
            count: 0,
            picks: [],
          },
        }),
      },
    );

    assert.deepEqual(selected, []);
  },
);

test(
  "Details intelligence keeps the frozen publication pick for the requested fixture",
  () => {
    const frozenPick = {
      matchId: "cid_test_home_away_20990101",
      market: "Over / Under 2.5",
      pick: "Over 2.5",
    };

    const selected = selectIntelligenceValuePicksForPublication(
      "2099-01-01",
      frozenPick.matchId,
      [],
      {
        publicationResolver: () => ({
          ok: true,
          authority: "frozen_plan_a_observation",
          payload: {
            date: "2099-01-01",
            count: 1,
            picks: [frozenPick],
          },
        }),
      },
    );

    assert.deepEqual(selected, [frozenPick]);
  },
);
