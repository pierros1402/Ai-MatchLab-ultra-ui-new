import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoricalStatusMembership }
  from "./build-historical-status-membership.js";

test("mixed historical day keeps postponed row and upgrades verified final", () => {
  const oldDay = "2026-11-08";
  const moved = {
    canonicalId: "old-moved",
    dayKey: oldDay,
    sourceId: "401877770",
    leagueSlug: "col.1",
    homeTeam: "Águilas Doradas",
    awayTeam: "Independiente Medellín",
    status: "PRE",
    scoreHome: 0,
    scoreAway: 0
  };
  const live = {
    canonicalId: "played",
    dayKey: oldDay,
    leagueSlug: "col.1",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "SECOND_HALF",
    scoreHome: 1,
    scoreAway: 0
  };
  const finished = {
    ...live,
    status: "FT",
    scoreHome: 2,
    scoreAway: 1
  };

  const plan = {
    fixtureIds: ["old-moved", "played"],
    upgrades: ["played"],
    retainedReschedules: [{
      originalId: "old-moved",
      candidateId: "new-moved",
      originalDay: oldDay,
      candidateDay: "2026-11-14",
      providerId: "401877770"
    }]
  };

  const result = buildHistoricalStatusMembership({
    published: [moved, live],
    canonical: [finished],
    plan,
    results: new Map([["played", {
      matchId: "played",
      verifiedFinalTruth: true,
      scoreHome: 2,
      scoreAway: 1
    }]])
  });

  assert.deepEqual(result.fixtureIds, ["old-moved", "played"]);
  assert.deepEqual(result.carried, ["old-moved"]);
  assert.deepEqual(result.upgraded, ["played"]);
  assert.deepEqual(result.fixtures[0], moved);
  assert.equal(result.fixtures[1].status, "FT");
  assert.equal(result.changed, true);
  assert.equal(result.publicationAuthorized, false);
  assert.equal(moved.status, "PRE");
  assert.equal(live.status, "SECOND_HALF");
});

test("missing reschedule proof and unverified final fail closed", () => {
  const previous = {
    canonicalId: "old",
    dayKey: "2026-11-08",
    sourceId: "123",
    leagueSlug: "col.1",
    homeTeam: "A",
    awayTeam: "B",
    status: "PRE"
  };
  const plan = {
    fixtureIds: ["old"],
    upgrades: [],
    retainedReschedules: [{
      originalId: "old",
      candidateId: "new",
      originalDay: "2026-11-08",
      candidateDay: "2026-11-14",
      providerId: "wrong"
    }]
  };

  assert.throws(() => buildHistoricalStatusMembership({
    published: [previous],
    canonical: [],
    plan
  }), /carry_unbound/);
});

test("builder never grants publication authority", () => {
  const previous = {
    canonicalId: "id",
    leagueSlug: "test.1",
    homeTeam: "A",
    awayTeam: "B",
    status: "PRE"
  };
  const result = buildHistoricalStatusMembership({
    published: [previous],
    canonical: [previous],
    plan: {
      fixtureIds: ["id"],
      upgrades: [],
      retainedReschedules: []
    }
  });
  assert.equal(result.publicationAuthorized, false);
  assert.equal(result.changed, false);
});