import test from "node:test";
import assert from "node:assert/strict";
import { inspectResultsMemoryPreservation as inspect } from "./results-memory-preservation.js";
const row = (matchId, gf = 2, ga = 1) => ({ matchId, ha: "H", gf, ga, date: "2026-08-20T19:00:00Z" });
const pack = entries => ({ teams: { Home: entries } });
test("preserves existing result while allowing additive rows", () => {
  const result = inspect(pack([row("one")]), pack([row("one"), row("two")]));
  assert.equal(result.ok, true);
  assert.equal(result.candidateRows, 2);
});
test("rejects silent loss of an existing match", () => {
  assert.deepEqual(inspect(pack([row("one")]), pack([])).violations.map(v => v.reason), ["missing_existing_record"]);
});
test("rejects unadjudicated final-score replacement", () => {
  assert.deepEqual(inspect(pack([row("one")]), pack([row("one", 0, 1)])).violations.map(v => v.reason), ["existing_score_changed_without_adjudication"]);
});
test("rejects invalid or ambiguous identity", () => {
  assert.throws(() => inspect(pack([row("")]), pack([])), /unbound_identity/);
  assert.throws(() => inspect(pack([row("one"), row("one")]), pack([])), /duplicate_identity/);
});

test("rejects malformed candidate even when its rows would appear additive", () => {
  assert.throws(() => inspect(pack([row("one")]), { teams: { Home: {} } }), /invalid_entries/);
  assert.throws(() => inspect(pack([row("one")]), null), /invalid_shape/);
});
test("rejects duplicate identities in candidate as well as baseline", () => {
  assert.throws(() => inspect(pack([row("one")]), pack([row("one"), row("one")])), /duplicate_identity/);
});
test("allows preserving an unresolved score and subsequent verified scoring", () => {
  const old = pack([{...row("one"), gf: null, ga: null}]);
  assert.equal(inspect(old, pack([row("one")])).ok, true);
});
