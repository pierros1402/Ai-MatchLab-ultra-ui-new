import test from "node:test";
import assert from "node:assert/strict";

import {
  namesLikelyMatch,
  summarizeTeamForm,
  getRecentTeamMatches,
  getH2H
} from "../core/build-match-intelligence.js";
import { dedupeValuePicks } from "../core/build-value-day.js";
import { runStandaloneValueDay } from "../jobs/build-value-standalone-day.js";

test("team matcher rejects containment poison and distinct variants", () => {
  assert.equal(namesLikelyMatch("Aris", "Larissa"), false);
  assert.equal(namesLikelyMatch("Paris", "Paris Saint-Germain"), false);
  assert.equal(namesLikelyMatch("Paris", "Paris FC"), false);
  assert.equal(namesLikelyMatch("Flora", "Flora U21"), false);
  assert.equal(namesLikelyMatch("Levadia", "Levadia U21"), false);
  assert.equal(namesLikelyMatch("Nomme Kalju U21", "Nomme United U21"), false);
  assert.equal(namesLikelyMatch("Willem II", "Willem"), false);
  assert.equal(namesLikelyMatch("Juan Pablo II", "Juan Pablo"), false);
  assert.equal(namesLikelyMatch("BATE 2 Borisov", "BATE Borisov"), false);
  assert.equal(namesLikelyMatch("CSKA Sofia", "FC CSKA 1948 Sofia"), false);
  assert.equal(namesLikelyMatch("Al Hilal", "Al Hilal Omdurman"), false);
  assert.equal(namesLikelyMatch("Al Ittihad", "Al-Ittihad Alexandria"), false);
  assert.equal(namesLikelyMatch("Real Madrid", "Real Madrid Castilla"), false);
  assert.equal(namesLikelyMatch("Athletic Bilbao", "Bilbao Athletic"), false);
  assert.equal(namesLikelyMatch("Dinamo Minsk", "Dinamo-2 Minsk"), false);
  assert.equal(namesLikelyMatch("River Plate", "River Plate Montevideo"), false);
});

test("team matcher keeps conservative equivalent naming", () => {
  assert.equal(namesLikelyMatch("FC Flora", "Flora"), true);
  assert.equal(namesLikelyMatch("Inter Miami CF", "Inter Miami"), true);
  assert.equal(namesLikelyMatch("FCI Levadia U21", "Levadia U21"), true);
  assert.equal(namesLikelyMatch("Paris Saint-Germain", "Paris Saint Germain"), true);
});

test("team form orientation follows the hardened matcher", () => {
  const result = summarizeTeamForm([
    { homeTeam: "FC Flora", awayTeam: "Tammeka", scoreHome: 2, scoreAway: 0 },
    { homeTeam: "Tammeka", awayTeam: "FC Flora", scoreHome: 1, scoreAway: 3 },
    { homeTeam: "Flora U21", awayTeam: "Tammeka U21", scoreHome: 4, scoreAway: 0 }
  ], "Flora");

  assert.deepEqual(result, {
    matches: 2,
    wins: 2,
    draws: 0,
    losses: 0,
    goalsFor: 5,
    goalsAgainst: 1
  });
});

test("recent form and H2H remain scoped to the fixture league", () => {
  const rows = [
    { id: "same", leagueSlug: "sau.1", status: "FT", homeTeam: "Al Hilal", awayTeam: "Al Nassr", scoreHome: 2, scoreAway: 1, kickoff: "2026-07-10T18:00:00Z" },
    { id: "other", leagueSlug: "sud.1", status: "FT", homeTeam: "Al Hilal", awayTeam: "Al Merrikh", scoreHome: 4, scoreAway: 0, kickoff: "2026-07-11T18:00:00Z" }
  ];

  const recent = getRecentTeamMatches(rows, "Al Hilal", "sau.1", 5, null);
  assert.deepEqual(recent.map(row => row.id), ["same"]);

  const h2h = getH2H(rows, "Al Hilal", "Al Nassr", "sau.1", 5, null);
  assert.deepEqual(h2h.map(row => row.id), ["same"]);
});

test("value dedupe preserves independent markets from the same match", () => {
  const picks = [
    { matchId: "m1", homeTeam: "A", awayTeam: "B", kickoff: "2026-07-19T18:00:00Z", market: "1X2", score: 0.81 },
    { matchId: "m1", homeTeam: "A", awayTeam: "B", kickoff: "2026-07-19T18:00:00Z", market: "Over / Under 2.5", score: 0.76 },
    { matchId: "m1", homeTeam: "A", awayTeam: "B", kickoff: "2026-07-19T18:00:00Z", market: "BTTS", score: 0.74 }
  ];

  const result = dedupeValuePicks(picks);
  assert.equal(result.length, 3);
  assert.deepEqual(new Set(result.map(row => row.market)), new Set(["1X2", "Over / Under 2.5", "BTTS"]));
});

test("value dedupe keeps only the strongest row inside the same market", () => {
  const result = dedupeValuePicks([
    { matchId: "m1", homeTeam: "A", awayTeam: "B", kickoff: "2026-07-19T18:00:00Z", market: "1X2", pick: "HOME", score: 0.75 },
    { matchId: "m1", homeTeam: "A", awayTeam: "B", kickoff: "2026-07-19T18:00:00Z", market: "1X2", pick: "AWAY", score: 0.82 }
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].pick, "AWAY");
  assert.equal(result[0].score, 0.82);
});

test("standalone production delegates only to the Plan A refresh pipeline", async () => {
  const calls = [];
  const expected = { ok: true, planA: { count: 4, source: "canonical_fixtures" } };

  const result = await runStandaloneValueDay(
    "2026-07-19",
    { rebuild: true, planBObservation: false, freeze: false },
    {
      refreshValueArtifactsDay: async (day, options) => {
        calls.push({ kind: "plan-a", day, options });
        return expected;
      },
      deriveValueFromOdds: () => {
        throw new Error("Plan B must not run in production mode");
      }
    }
  );

  assert.equal(result, expected);
  assert.deepEqual(calls, [
    { kind: "plan-a", day: "2026-07-19", options: { updateLatest: false } }
  ]);
});

test("standalone Plan B remains isolated from the production refresh", async () => {
  const calls = [];
  const expected = { ok: true, count: 2, outputMode: "plan-b-observation" };

  const result = await runStandaloneValueDay(
    "2026-07-19",
    { rebuild: false, planBObservation: true, freeze: true },
    {
      refreshValueArtifactsDay: async () => {
        throw new Error("Plan A refresh must not run in Plan B mode");
      },
      deriveValueFromOdds: (day, options) => {
        calls.push({ kind: "plan-b", day, options });
        return expected;
      }
    }
  );

  assert.equal(result, expected);
  assert.deepEqual(calls, [
    {
      kind: "plan-b",
      day: "2026-07-19",
      options: { freeze: true, outputMode: "plan-b-observation" }
    }
  ]);
});

test("standalone production rejects the Plan B-only freeze flag", async () => {
  await assert.rejects(
    () => runStandaloneValueDay("2026-07-19", { freeze: true, planBObservation: false }),
    /--freeze is supported only with --plan-b-observation/u
  );
});

test("standalone production requires an explicit rebuild flag", async () => {
  await assert.rejects(
    () => runStandaloneValueDay("2026-07-19", { rebuild: false, freeze: false, planBObservation: false }),
    /Production standalone Value requires --rebuild/u
  );
});
