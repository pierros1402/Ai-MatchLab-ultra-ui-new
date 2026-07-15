import test from "node:test";
import assert from "node:assert/strict";

import {
  dedupeHistoryMatches,
  getRecentTeamMatches,
  isSameTeamName
} from "./history-layer.js";
import { buildFormGuide } from "./form-guide.js";
import { buildHeadToHeadGuide } from "./head-to-head-guide.js";

const rows = [
  {
    id: "flashscore_native",
    leagueSlug: "arg.2",
    dayKey: "2026-07-05",
    kickoff: "2026-07-05T18:00:00.000Z",
    homeTeam: "Atlanta",
    awayTeam: "Quilmes",
    scoreHome: 2,
    scoreAway: 0,
    status: "FT",
    source: "flashscore"
  },
  {
    id: "espn_duplicate",
    leagueSlug: "arg.2",
    dayKey: "2026-07-06",
    kickoff: "2026-07-05T18:05:00.000Z",
    homeTeam: "Atletico Atlanta",
    awayTeam: "Quilmes",
    scoreHome: 2,
    scoreAway: 0,
    status: "FT",
    source: "espn"
  },
  {
    id: "older",
    leagueSlug: "arg.2",
    dayKey: "2026-06-28",
    kickoff: "2026-06-28T18:00:00.000Z",
    homeTeam: "Colegiales",
    awayTeam: "Atletico Atlanta",
    scoreHome: 0,
    scoreAway: 1,
    status: "FT",
    source: "flashscore"
  }
];

test("Atlanta alias resolves to Atletico Atlanta", () => {
  assert.equal(isSameTeamName("Atlanta", "Atletico Atlanta"), true);
  assert.equal(isSameTeamName("Atlanta United FC", "Atletico Atlanta"), false);
});

test("history dedup collapses cross-provider alias duplicate", () => {
  const deduped = dedupeHistoryMatches(rows);
  assert.equal(deduped.length, 2);
  assert.deepEqual(deduped.map(r => r.id), ["flashscore_native", "older"]);
});

test("recent form counts a duplicated real match only once", () => {
  const matches = getRecentTeamMatches(rows, "Atletico Atlanta", { limit: 5, leagueSlug: "arg.2" });
  assert.equal(matches.length, 2);

  const guide = buildFormGuide(
    { homeTeam: "Atlanta", awayTeam: "Colegiales" },
    { homeMatches: matches, awayMatches: [rows[2]], meta: {} }
  );
  assert.equal(guide.homeTeam.sampleSize, 2);
  assert.equal(guide.homeTeam.record.wins, 2);
});

test("H2H orientation uses canonical identity rather than literal text", () => {
  const guide = buildHeadToHeadGuide(
    { homeTeam: "Atlanta", awayTeam: "Colegiales" },
    { headToHeadMatches: [rows[2]], meta: { h2hSampleMerged: 1 } }
  );

  assert.equal(guide.stats.homeWins, 1);
  assert.equal(guide.stats.awayWins, 0);
  assert.equal(guide.matches[0].resultFromCurrentPerspective, "HOME_WIN");
});
