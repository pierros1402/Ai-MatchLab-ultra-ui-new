import test from "node:test";
import assert from "node:assert/strict";

import {
  isEspnRefreshCandidate
} from "./run-live-status-refresh-day.js";

const now =
  new Date("2026-09-15T18:00:00.000Z");

function espnRow(extra = {}) {
  return {
    source: "espn",
    sourceId: "provider-1",
    kickoffUtc: "2026-09-15T17:00:00.000Z",
    ...extra
  };
}

test(
  "penalty final is not an ESPN refresh candidate",
  () => {
    assert.equal(
      isEspnRefreshCandidate(
        espnRow({
          status: "FT",
          rawStatus: "STATUS_FINAL_PEN",
          scoreHome: 1,
          scoreAway: 1
        }),
        now,
        { includeAllOpenStates: true }
      ),
      false
    );
  }
);

test(
  "plain played final is not an ESPN refresh candidate",
  () => {
    assert.equal(
      isEspnRefreshCandidate(
        espnRow({
          status: "FT",
          rawStatus: "STATUS_FINAL",
          scoreHome: 2,
          scoreAway: 0
        }),
        now,
        { includeAllOpenStates: true }
      ),
      false
    );
  }
);

test(
  "scheduled ESPN fixture remains refreshable when all open states are requested",
  () => {
    assert.equal(
      isEspnRefreshCandidate(
        espnRow({
          status: "PRE",
          rawStatus: "STATUS_SCHEDULED"
        }),
        now,
        { includeAllOpenStates: true }
      ),
      true
    );
  }
);

test(
  "live ESPN fixture remains a refresh candidate",
  () => {
    assert.equal(
      isEspnRefreshCandidate(
        espnRow({
          status: "LIVE",
          rawStatus: "STATUS_IN_PROGRESS"
        }),
        now
      ),
      true
    );
  }
);
