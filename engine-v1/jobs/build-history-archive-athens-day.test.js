import assert from "node:assert/strict";
import test from "node:test";

import { athensDayFromKickoff } from "../core/daykey.js";
import { archiveSeasonForDate, seasonModelFor } from "../core/season-model.js";
import { bucketLeagueMatches } from "./build-history-archive-from-results.js";
import { rowDayKey } from "./build-current-season-indexes.js";

function buildOne(slug, utc, day, matchId = "event-1") {
  const season = archiveSeasonForDate(slug, `${day}T12:00:00Z`);
  const payload = { teams: {
    Home: [{ ha: "H", date: utc, matchId, opp: "Away", gf: 2, ga: 1 }],
    Away: [{ ha: "A", date: utc, matchId, opp: "Home", gf: 1, ga: 2 }],
  }};
  const rows = [...(bucketLeagueMatches(slug, payload, new Set([season])).get(season)?.values() || [])];
  assert.equal(rows.length, 1, "one real event must produce one archived match");
  const [row] = rows;
  assert.equal(row.dayKey, day);
  assert.equal(row.season, season);
  assert.equal(row.kickoff, utc);
  assert.equal(row.id, matchId);
  assert.equal(row.scoreHome, 2);
  assert.equal(row.scoreAway, 1);
  assert.equal(rowDayKey(row), day);
}

test("both production index and archive resolve the Athens calendar day", () => {
  buildOne("usa.1", "2026-08-19T23:30:00Z", "2026-08-20", "orlando-chicago");
  buildOne("mex.1", "2026-08-22T23:07:00Z", "2026-08-23", "chivas-tijuana");
  assert.equal(rowDayKey({ kickoffUtc: "2026-08-19T23:30:00Z" }), "2026-08-20");
  assert.equal(rowDayKey({ kickoff: "2026-08-22T23:07:00Z" }), "2026-08-23");
});

test("explicit historical day remains authoritative on the index read boundary", () => {
  assert.equal(rowDayKey({ dayKey: "2026-08-19", kickoff: "2026-08-19T23:30:00Z" }), "2026-08-19");
  assert.equal(rowDayKey({ kickoff: "invalid" }), null);
});

test("calendar-year league partition uses Athens January 1", () => {
  assert.equal(seasonModelFor("nor.1"), "calendar");
  const utc = "2026-12-31T22:30:00Z";
  assert.equal(athensDayFromKickoff(utc), "2027-01-01");
  assert.equal(archiveSeasonForDate("nor.1", utc), "2026");
  buildOne("nor.1", utc, "2027-01-01", "year-rollover");
});

test("cross-year league partition uses Athens July 1", () => {
  assert.equal(seasonModelFor("eng.1"), "cross");
  const utc = "2026-06-30T21:30:00Z";
  assert.equal(athensDayFromKickoff(utc), "2026-07-01");
  assert.equal(archiveSeasonForDate("eng.1", utc), "2025-2026");
  buildOne("eng.1", utc, "2026-07-01", "archive-rollover");
});

test("Athens DST and explicit-offset inputs are stable", () => {
  for (const [utc, day] of [
    ["2026-03-28T21:30:00Z", "2026-03-28"],
    ["2026-03-28T22:30:00Z", "2026-03-29"],
    ["2026-10-24T20:30:00Z", "2026-10-24"],
    ["2026-10-24T21:30:00Z", "2026-10-25"],
    ["2026-10-25T22:30:00Z", "2026-10-26"],
  ]) {
    assert.equal(rowDayKey({ kickoff: utc }), day);
    buildOne("eng.1", utc, day, utc);
  }
  assert.equal(rowDayKey({ kickoff: "2026-08-20T02:30:00+03:00" }), "2026-08-20");
});

test("results-memory archive rejects naive timestamps rather than using the runner timezone", () => {
  for (const date of ["2026-08-20T02:30:00", "2026-08-20", "2026-08-20 02:30:00", "invalid"]) {
    assert.throws(
      () => bucketLeagueMatches("eng.1", { teams: {
        Home: [{ ha: "H", date, matchId: "ambiguous", opp: "Away", gf: 2, ga: 1 }],
      } }, new Set(["2026-2027"])),
      /results_memory_timestamp_/,
    );
  }
});
