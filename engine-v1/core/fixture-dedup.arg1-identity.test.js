import test from "node:test";
import assert from "node:assert/strict";

import {
  dedupeLeagueDayFixtures,
  sameTeamName
} from "./fixture-dedup.js";
import {
  normalizeSourceRows
} from "../jobs/run-live-status-refresh-day.js";

test("arg.1 resolves Estudiantes L.P. to Estudiantes de La Plata", () => {
  assert.equal(
    sameTeamName(
      "arg.1",
      "Estudiantes L.P.",
      "Estudiantes de La Plata"
    ),
    true
  );
});

test("Boca Juniors v Estudiantes cross-source rows collapse to one canonical row", () => {
  const flashscore = {
    canonicalId: "cid_arg1_bocajuniors_estudianteslp_20260806",
    matchId: "cid_arg1_bocajuniors_estudianteslp_20260806",
    source: "flashscore",
    sourceId: "0hpMzPx3",
    sourceMatchId: "0hpMzPx3",
    leagueSlug: "arg.1",
    dayKey: "2026-08-06",
    kickoffUtc: "2026-08-05T22:00:00.000Z",
    homeTeam: "Boca Juniors",
    awayTeam: "Estudiantes L.P.",
    scoreHome: 1,
    scoreAway: 0,
    status: "FT"
  };

  const espn = {
    canonicalId: "cid_arg1_bocajuniors_estudianteslaplata_20260806",
    matchId: "401841460",
    source: "espn",
    sourceId: "401841460",
    sourceMatchId: "401841460",
    leagueSlug: "arg.1",
    dayKey: "2026-08-06",
    kickoffUtc: "2026-08-05T22:00:00.000Z",
    homeTeam: "Boca Juniors",
    awayTeam: "Estudiantes de La Plata",
    scoreHome: 1,
    scoreAway: 0,
    status: "FT"
  };

  const result = dedupeLeagueDayFixtures(
    [flashscore, espn],
    { slug: "arg.1" }
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.removed.length, 1);

  const [row] = result.rows;
  assert.equal(
    row.canonicalId,
    "cid_arg1_bocajuniors_estudianteslaplata_20260806"
  );
  assert.equal(row.matchId, row.canonicalId);
  assert.equal(row.sourceId, "401841460");
  assert.equal(row.sourceMatchId, "401841460");
});

test("canonical identity normalization preserves squad separation", () => {
  assert.equal(
    sameTeamName("arg.1", "Estudiantes L.P.", "Estudiantes de La Plata W"),
    false
  );
  assert.equal(
    sameTeamName("arg.1", "Estudiantes L.P. U20", "Estudiantes de La Plata"),
    false
  );
});

test("unrelated Estudiantes clubs are not merged outside arg.1", () => {
  assert.equal(
    sameTeamName("mex.1", "Estudiantes L.P.", "Estudiantes de La Plata"),
    false
  );
});
test("ESPN normalization separates canonical matchId from provider identity", () => {
  const event = {
    id: "401841460",
    date: "2026-08-05T22:00:00.000Z",
    competitions: [
      {
        date: "2026-08-05T22:00:00.000Z",
        status: {
          type: {
            name: "STATUS_FULL_TIME",
            state: "post",
            completed: true
          },
          displayClock: "FT"
        },
        competitors: [
          {
            homeAway: "home",
            score: "1",
            team: {
              displayName: "Boca Juniors"
            }
          },
          {
            homeAway: "away",
            score: "0",
            team: {
              displayName: "Estudiantes de La Plata"
            }
          }
        ]
      }
    ]
  };

  const rows = normalizeSourceRows(
    [event],
    "arg.1",
    "2026-08-06",
    {
      canonicalSlug: "arg.1"
    }
  );

  const row = rows.get("401841460");

  assert.ok(row);
  assert.equal(row.matchId, row.canonicalId);
  assert.notEqual(row.matchId, "401841460");
  assert.equal(row.sourceId, "401841460");
  assert.equal(row.sourceMatchId, "401841460");
  assert.equal(row.status, "FT");
  assert.equal(row.scoreHome, 1);
  assert.equal(row.scoreAway, 0);
});
