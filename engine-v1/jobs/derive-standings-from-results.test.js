import test from "node:test";
import assert from "node:assert/strict";

import { currentSeasonBounds } from "./derive-standings-from-results.js";

// A calendar-year league (start<=end months) plays inside one civil year; the
// bounds must span exactly that year's window and exclude prior seasons.
test("calendar-year season bounds cover only the current civil year", () => {
  // Southern-hemisphere leagues get a calendar-year window (Feb→Dec); evaluated
  // mid-2026 the season is entirely within 2026.
  const { from, to } = currentSeasonBounds("x.1", { hemisphere: "southern" }, new Date("2026-07-13T00:00:00Z"));
  assert.equal(new Date(from).getUTCFullYear(), 2026);
  // A match from the prior year (Nov 2025) must fall OUTSIDE the window.
  assert.ok(Date.parse("2025-11-01T00:00:00Z") < from);
  // A match this year (May 2026) is inside; next year (Jan 2027) is outside.
  const may = Date.parse("2026-05-01T00:00:00Z");
  assert.ok(may >= from && may < to);
  assert.ok(Date.parse("2027-01-15T00:00:00Z") >= to);
});

test("cross-year season is identified by its start year and wraps the new year", () => {
  // Premier-League-style Aug(8)→May(5), evaluated in October 2025 → 2025-26.
  const oct = currentSeasonBounds("eng.1", { country: "England", region: "europe" }, new Date("2025-10-01T00:00:00Z"));
  assert.equal(new Date(oct.from).getUTCFullYear(), 2025);
  // `to` is the first day after the end month of the following year (2026).
  assert.equal(new Date(oct.to).getUTCFullYear(), 2026);
  assert.ok(oct.from < oct.to);
  // A match from the previous season (April 2025) is BEFORE the window.
  assert.ok(Date.parse("2025-04-20T00:00:00Z") < oct.from);
  // A match in the current season (Sept 2025) is inside the window.
  const sept = Date.parse("2025-09-20T00:00:00Z");
  assert.ok(sept >= oct.from && sept < oct.to);
});

test("cross-year season before the start month rolls back to the prior start year", () => {
  // Evaluated in March 2026 (m=3 < start=8) → season started 2025.
  const mar = currentSeasonBounds("eng.1", { country: "England", region: "europe" }, new Date("2026-03-01T00:00:00Z"));
  assert.equal(new Date(mar.from).getUTCFullYear(), 2025);
});
