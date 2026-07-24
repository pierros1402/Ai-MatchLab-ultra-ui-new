import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSourceRows } from "./run-live-status-refresh-day.js";

function espnEvent({
  id = "401896232",
  date = "2026-07-23T16:30:00.000Z",
  statusName = "STATUS_FINAL",
  homeScore = "4",
  awayScore = "1"
} = {}) {
  return {
    id,
    date,
    competitions: [
      {
        date,
        status: {
          type: { name: statusName },
          displayClock: "FT"
        },
        competitors: [
          {
            homeAway: "home",
            score: homeScore,
            team: { displayName: "Rigas Futbola Skola" }
          },
          {
            homeAway: "away",
            score: awayScore,
            team: { displayName: "Vestri" }
          }
        ],
        venue: { fullName: "LNK Sports Park" }
      }
    ]
  };
}

test("qualifier provider rows retain provider slug and write to canonical parent", () => {
  const rows = normalizeSourceRows(
    [espnEvent()],
    "uefa.europa.conf_qual",
    "2026-07-23",
    { canonicalSlug: "uefa.europa.conf" }
  );

  const row = rows.get("401896232");

  assert.ok(row);
  assert.equal(row.providerLeagueSlug, "uefa.europa.conf_qual");
  assert.equal(row.leagueSlug, "uefa.europa.conf");
  assert.equal(
    row.canonicalId,
    "cid_uefaeuropaconf_rigasfutbolaskola_vestri_20260723"
  );
  assert.equal(row.status, "FT");
  assert.equal(row.scoreHome, 4);
  assert.equal(row.scoreAway, 1);
});

test("source rows outside the requested Athens day are rejected", () => {
  const rows = normalizeSourceRows(
    [espnEvent({ date: "2026-07-22T16:30:00.000Z" })],
    "uefa.europa.conf_qual",
    "2026-07-23",
    { canonicalSlug: "uefa.europa.conf" }
  );

  assert.equal(rows.size, 0);
});
