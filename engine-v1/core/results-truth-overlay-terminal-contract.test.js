import test from "node:test";
import assert from "node:assert/strict";

import {
  overlayResultsTruth,
} from "./results-truth-overlay.js";

test("repairs an already-final match whose rawStatus is still scheduled", () => {
  const input = [{
    canonicalId: "cid_test_final_raw_status",
    leagueSlug: "test.1",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "FT",
    statusType: "FT",
    rawStatus: "STATUS_SCHEDULED",
    scoreHome: 0,
    scoreAway: 1,
  }];

  const [result] = overlayResultsTruth(input, "2026-07-28");

  assert.equal(result.status, "FT");
  assert.equal(result.statusType, "FT");
  assert.equal(result.rawStatus, "STATUS_FINAL");
  assert.equal(result.scoreHome, 0);
  assert.equal(result.scoreAway, 1);
});

test("leaves an already-consistent final match unchanged", () => {
  const input = [{
    canonicalId: "cid_test_consistent_final",
    leagueSlug: "test.1",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "FT",
    statusType: "FT",
    rawStatus: "STATUS_FINAL",
    scoreHome: 2,
    scoreAway: 0,
  }];

  const [result] = overlayResultsTruth(input, "2026-07-28");

  assert.deepEqual(result, input[0]);
});

test("does not convert a special non-played state into final", () => {
  const input = [{
    canonicalId: "cid_test_postponed",
    leagueSlug: "test.1",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "SPECIAL",
    statusType: "SPECIAL",
    rawStatus: "STATUS_POSTPONED",
    scoreHome: null,
    scoreAway: null,
  }];

  const [result] = overlayResultsTruth(input, "2026-07-28");

  assert.deepEqual(result, input[0]);
});