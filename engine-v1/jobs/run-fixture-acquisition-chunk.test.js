import test from "node:test";
import assert from "node:assert/strict";

import { mergeCanonicalFixtures } from "./run-fixture-acquisition-chunk.js";

test("explicit final evidence cannot be downgraded by a scheduled acquisition row", () => {
  const previous = {
    matchId: "fixture-1",
    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    minute: "FT",
    scoreHome: 2,
    scoreAway: 1
  };

  const incoming = {
    matchId: "fixture-1",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED",
    minute: null,
    scoreHome: 0,
    scoreAway: 0
  };

  const [merged] = mergeCanonicalFixtures([previous], [incoming]);

  assert.equal(merged.status, "FT");
  assert.equal(merged.rawStatus, "STATUS_FINAL");
  assert.equal(merged.statusType, "STATUS_FINAL");
  assert.equal(merged.minute, "FT");
  assert.equal(merged.scoreHome, 2);
  assert.equal(merged.scoreAway, 1);
});

test("explicit final metadata repairs a mixed scheduled-final canonical row", () => {
  const previous = {
    matchId: "fixture-2",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED",
    statusType: "STATUS_FINAL",
    minute: "FT",
    scoreHome: 0,
    scoreAway: 0
  };

  const incoming = {
    matchId: "fixture-2",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED"
  };

  const [merged] = mergeCanonicalFixtures([previous], [incoming]);

  assert.equal(merged.status, "FT");
  assert.equal(merged.rawStatus, "STATUS_FINAL");
  assert.equal(merged.statusType, "STATUS_FINAL");
  assert.equal(merged.minute, "FT");
});

test("authoritative incoming final evidence upgrades a scheduled row", () => {
  const previous = {
    matchId: "fixture-3",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED",
    scoreHome: null,
    scoreAway: null
  };

  const incoming = {
    matchId: "fixture-3",
    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    minute: "FT",
    scoreHome: 3,
    scoreAway: 0
  };

  const [merged] = mergeCanonicalFixtures([previous], [incoming]);

  assert.equal(merged.status, "FT");
  assert.equal(merged.rawStatus, "STATUS_FINAL");
  assert.equal(merged.scoreHome, 3);
  assert.equal(merged.scoreAway, 0);
});