import test from "node:test";
import assert from "node:assert/strict";

import {
  computeStandingsCompleteness,
  scoreStandingsConfidence
} from "./build-standings-day.js";

// A clean table: one unique row per team, sequential positions.
function table(n, prefix = "T") {
  return Array.from({ length: n }, (_, i) => ({
    team: `${prefix}${i + 1}`,
    position: i + 1,
    played: 10
  }));
}

test("oversized table (rows far exceed team set) fails closed", () => {
  // aus.1 185/20, arg.2 43/18, swe.1 29/16 — cumulative/multi-group aggregates.
  for (const [slug, n] of [["aus.1", 185], ["arg.2", 43], ["swe.1", 29]]) {
    const c = computeStandingsCompleteness(table(n), slug);
    assert.equal(c.oversized, true, `${slug} ${n} should be oversized`);
    assert.equal(c.completeness, 0, `${slug} completeness must fail closed`);

    const scored = scoreStandingsConfidence(table(n), slug, 0.9);
    assert.equal(scored.confidence, 0, `${slug} confidence must be 0`);
    assert.ok(scored.reasons.includes("oversized_table"), `${slug} reason surfaced`);
  }
});

test("normal and slightly-off tables are NOT flagged oversized", () => {
  // exact size, and an unmapped 24-team league estimated at 20 (within slack).
  assert.equal(computeStandingsCompleteness(table(20), "eng.1").oversized, false);
  assert.equal(computeStandingsCompleteness(table(24), "unmapped").oversized, false);
  // a healthy full table keeps full completeness and non-zero confidence.
  const scored = scoreStandingsConfidence(table(20), "eng.1", 0.9);
  assert.equal(scored.completeness, 1);
  assert.ok(scored.confidence >= 0.4);
});
