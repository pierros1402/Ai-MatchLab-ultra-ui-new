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

test("rejects invalid score values in newly staged rows", () => {
  assert.throws(() => inspect(pack([]), pack([row("a", -1, 0)])), /invalid_score/);
  assert.throws(() => inspect(pack([]), pack([row("a", "not-a-score", 0)])), /invalid_score/);
});
test("rejects changes to previously terminal W-D-L result labels", () => {
  const old = pack([{...row("one"), res:"W"}]);
  const next = pack([{...row("one"), res:"D"}]);
  assert.deepEqual(inspect(old, next).violations.map(v=>v.reason), ["existing_result_changed_without_adjudication"]);
});

test("rejects fixture retargeting despite unchanged match ID and final score", () => {
  for (const field of ["date", "opp", "sourceMatchId"]) {
    const original = {...row("one"),opp:"Old Opponent",sourceMatchId:"source-one"};
    const revised = {...original,[field]: "changed"};
    const result = inspect(pack([original]),pack([revised]));
    assert.deepEqual(result.violations.map(v=>v.field),[field]);
    assert.equal(result.violations[0].reason,"existing_fixture_identity_changed_without_adjudication");
  }
});

test("blocks partial scored results and final-to-partial regression", () => {
  const a = {...row("one"), gf: 2, ga: null};
  assert.deepEqual(inspect(pack([row("one")]), pack([a])).violations.map(x=>x.reason),
    ["candidate_partial_score", "existing_score_changed_without_adjudication"]);
  const b = {...row("one"), gf: null, ga: 1};
  assert.deepEqual(inspect(pack([b]), pack([row("one")])).violations.map(x=>x.reason),
    ["existing_partial_score"]);
  const c = {...row("one"), gf: "", ga: 1};
  assert.deepEqual(inspect(pack([row("one")]), pack([c])).violations.map(x=>x.reason),
    ["candidate_partial_score", "existing_score_changed_without_adjudication"]);
});
