import test from "node:test";
import assert from "node:assert/strict";
import {
  historicalFormRowsBeforeKickoff,
  isH2HRowBeforeKickoff,
} from "./details-rich-blocks.js";

test("historical form rows exclude the fixture itself, future results, non-finals and scoreless rows", () => {
  const entry = { matches: [
    { status: "FT", kickoff: "2026-08-01T12:00:00Z", scoreHome: 2, scoreAway: 1 },
    { status: "FT", kickoff: "2026-08-05T12:00:00Z", scoreHome: 1, scoreAway: 0 },
    { status: "STATUS_SCHEDULED", statusType: "FINAL", kickoff: "2026-08-06T10:00:00Z", scoreHome: 0, scoreAway: 0 },
    { status: "FT", kickoff: "2026-08-06T18:00:00Z", scoreHome: 3, scoreAway: 2 },
    { status: "FT", kickoff: "2026-08-07T12:00:00Z", scoreHome: 4, scoreAway: 0 },
    { status: "FT", kickoff: "2026-08-04T12:00:00Z", scoreHome: null, scoreAway: 0 },
  ] };
  const rows = historicalFormRowsBeforeKickoff(entry, "2026-08-06T18:00:00Z");
  assert.deepEqual(rows.map(row => row.kickoff), ["2026-08-01T12:00:00Z", "2026-08-05T12:00:00Z"]);
});

test("H2H cutoff excludes same-day day-only rows and all later rows", () => {
  assert.equal(isH2HRowBeforeKickoff({ date: "2026-08-05" }, "2026-08-06T18:00:00Z"), true);
  assert.equal(isH2HRowBeforeKickoff({ date: "2026-08-06" }, "2026-08-06T18:00:00Z"), false);
  assert.equal(isH2HRowBeforeKickoff({ date: "2026-08-06T12:00:00Z" }, "2026-08-06T18:00:00Z"), true);
  assert.equal(isH2HRowBeforeKickoff({ date: "2026-08-06T19:00:00Z" }, "2026-08-06T18:00:00Z"), false);
});
