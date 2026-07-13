import test from "node:test";
import assert from "node:assert/strict";

import { deriveMatchday, maxPlayableGames } from "./matchday-axis.js";

test("matchday is the mode of played, not the max (robust to a game in hand)", () => {
  // 18-team league, most on round 10, one team a game behind, one a game ahead.
  const played = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 9, 11];
  const r = deriveMatchday(played, 18);
  assert.equal(r.matchday, 10);
  assert.equal(r.matchdaySpread, 2);
  assert.equal(r.matchdayAnomaly.bool, false);
  assert.equal(r.matchdayAnomaly.reason, "ok");
});

test("full completed season is clean (Premier League 38)", () => {
  const played = new Array(20).fill(38);
  const r = deriveMatchday(played, 20);
  assert.equal(r.matchday, 38);
  assert.equal(r.matchdayAnomaly.bool, false);
});

test("split-season / multi-round-robin small leagues are NOT flagged", () => {
  // Scotland: 12 teams, 38 games (double round-robin 22 + split 5) — over the
  // ×2 bound (22) but under the ×4 bound (44), so must stay clean.
  const scotland = deriveMatchday(new Array(12).fill(38), 12);
  assert.equal(scotland.matchdayAnomaly.bool, false, "Scotland 38 should be clean");
  // Croatia: 10 teams, 36 games (quadruple round-robin) — exactly the ×4 bound.
  const croatia = deriveMatchday(new Array(10).fill(36), 10);
  assert.equal(croatia.matchdayAnomaly.bool, false, "Croatia 36 should be clean");
});

test("cumulative/all-time table is flagged (over-play beyond ×4)", () => {
  // mex.1-style: an 18-team table whose played counts are ~200 (all-time),
  // spanning 171..213 (spread 42 > double-bound 34).
  const played = new Array(18).fill(202);
  played[0] = 213;
  played[1] = 171;
  const r = deriveMatchday(played, 18);
  assert.equal(r.matchdayAnomaly.bool, true);
  // both clauses fire here (max beyond ×4 AND spread beyond a full season)
  assert.equal(r.matchdayAnomaly.reason, "cumulative_and_contaminated");
});

test("fresh season contaminated by stale rows is flagged (spread clause)", () => {
  // blr.2-style: 45 teams mostly on round 1, one leftover row at 160. Mode (1)
  // is in-bound and max (160) is under ×4 (176), so ONLY the spread clause
  // should catch it.
  const played = new Array(45).fill(1);
  played[0] = 160;
  const r = deriveMatchday(played, 45);
  assert.equal(r.matchday, 1);
  assert.equal(r.matchdayAnomaly.bool, true);
  assert.equal(r.matchdayAnomaly.reason, "played_spread_exceeds_season");
});

test("maxPlayableGames guards bad team counts", () => {
  assert.equal(maxPlayableGames(20, 2), 38);
  assert.equal(maxPlayableGames(20, 4), 76);
  assert.equal(maxPlayableGames(1), null);
  assert.equal(maxPlayableGames(undefined), null);
});
