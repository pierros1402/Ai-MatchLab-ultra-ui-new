import test from "node:test";
import assert from "node:assert/strict";
import { applyMatchLevelRetention, canonicalizeLeagueResults } from "./result-dedup.js";

function side(matchId, date, opp, ha, gf, ga) {
  return { matchId, date, opp, ha, gf, ga, res: gf > ga ? "W" : gf < ga ? "L" : "D" };
}

test("match-level retention never leaves the capped match on one side only", () => {
  const teams = {
    A: [
      side("m3", "2026-08-03T12:00:00Z", "B", "H", 3, 0),
      side("m2", "2026-08-02T12:00:00Z", "C", "H", 2, 0),
      side("m1", "2026-08-01T12:00:00Z", "D", "H", 1, 0),
    ],
    B: [side("m3", "2026-08-03T12:00:00Z", "A", "A", 0, 3)],
    C: [side("m2", "2026-08-02T12:00:00Z", "A", "A", 0, 2)],
    D: [side("m1", "2026-08-01T12:00:00Z", "A", "A", 0, 1)],
  };

  const out = applyMatchLevelRetention(teams, {
    perTeamCap: 2,
    maxAgeDays: 9999,
    nowMs: Date.parse("2026-08-09T00:00:00Z"),
  });

  assert.deepEqual(out.A.map(x => x.matchId), ["m3", "m2"]);
  assert.deepEqual(out.B.map(x => x.matchId), ["m3"]);
  assert.deepEqual(out.C.map(x => x.matchId), ["m2"]);
  assert.equal(out.D, undefined);

  const sidesById = new Map();
  for (const [team, list] of Object.entries(out)) {
    for (const entry of list) {
      if (!sidesById.has(entry.matchId)) sidesById.set(entry.matchId, new Set());
      sidesById.get(entry.matchId).add(team);
    }
  }
  assert.equal(sidesById.get("m3").size, 2);
  assert.equal(sidesById.get("m2").size, 2);
  assert.equal(sidesById.has("m1"), false);
});

test("canonicalized results still emit both perspectives for every retained match", () => {
  const payload = {
    slug: "test.1",
    teams: {
      Alpha: [side("native1", "2026-08-01T12:00:00Z", "Beta", "H", 2, 1)],
      Beta: [side("native1", "2026-08-01T12:00:00Z", "Alpha", "A", 1, 2)],
    },
  };
  const { payload: out } = canonicalizeLeagueResults(payload, {
    slug: "test.1",
    aliasResolver: () => [],
  });
  assert.equal(out.teams.Alpha.length, 1);
  assert.equal(out.teams.Beta.length, 1);
  assert.equal(out.teams.Alpha[0].matchId, "native1");
  assert.equal(out.teams.Beta[0].matchId, "native1");
});
