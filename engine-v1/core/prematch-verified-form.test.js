import test from "node:test";
import assert from "node:assert/strict";
import { verifiedFormRates } from "./prematch-verified-form.js";

test("early form excludes future results, other competitions and ambiguous team names", () => {
  const row = { homeTeam: "Exact", awayTeam: "Opponent", leagueSlug: "egy.2", status: "FT", scoreHome: 2, scoreAway: 1, kickoffUtc: "2026-09-30T12:00:00Z" };
  const index = { Exact: { matches: [row, { ...row, leagueSlug: "egy.1" },
    { ...row, kickoffUtc: "2026-10-02T12:00:00Z" }, { ...row, homeTeam: "Other" }] } };
  assert.deepEqual(verifiedFormRates(index, "egy.2", "Exact", Date.parse("2026-10-01T00:00:00Z")),
    { sample: 1, gfRate: 2, gaRate: 1, ppg: 3 });
  assert.equal(verifiedFormRates(index, "egy.2", "exact", Date.parse("2026-10-01T00:00:00Z")).sample, 0);
});
