import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGlobalReverseMap } from "./team-aliases-db.js";

test("folds variants of one club onto a single canonical", () => {
  const m = buildGlobalReverseMap([
    { "Din. Minsk": ["Dinamo Minsk"], "Neman": ["Neman Grodno"] }
  ]);
  assert.equal(m.get("dinamo minsk"), "Din. Minsk");
  assert.equal(m.get("din minsk"), "Din. Minsk"); // canonical maps to itself
  assert.equal(m.get("neman grodno"), "Neman");
});

test("drops a spelling two sources disagree on (no wrong-merge)", () => {
  const m = buildGlobalReverseMap([
    { "Arsenal FC": ["Arsenal"] },            // league A: "Arsenal" -> Arsenal FC
    { "Arsenal de Sarandi": ["Arsenal"] }     // league B: "Arsenal" -> different club
  ]);
  assert.equal(m.has("arsenal"), false); // ambiguous -> excluded, left untouched
  // the unambiguous canonicals still resolve
  assert.equal(m.get("arsenal fc"), "Arsenal FC");
  assert.equal(m.get("arsenal de sarandi"), "Arsenal de Sarandi");
});

test("a canonical that is also an alias elsewhere is ambiguous, so dropped", () => {
  const m = buildGlobalReverseMap([
    { "Vitebsk": ["FC Vitebsk"] },        // "Vitebsk" is a canonical here
    { "ML Vitebsk": ["Vitebsk"] }         // ...but an alias-to-different-club there
  ]);
  assert.equal(m.has("vitebsk"), false); // conflict -> dropped, never merged
});

test("unknown spellings are absent (caller keeps the original)", () => {
  const m = buildGlobalReverseMap([{ "Din. Minsk": ["Dinamo Minsk"] }]);
  assert.equal(m.get("real madrid"), undefined);
});

test("idempotent: re-adding the same mapping does not make it ambiguous", () => {
  const m = buildGlobalReverseMap([
    { "Din. Minsk": ["Dinamo Minsk"] },
    { "Din. Minsk": ["Dinamo Minsk", "Dinamo Minsk"] }
  ]);
  assert.equal(m.get("dinamo minsk"), "Din. Minsk");
});
