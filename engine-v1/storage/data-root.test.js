import test from "node:test";
import assert from "node:assert/strict";

import { normalizeFixtureRows } from "./data-root.js";

// Regression guard for the fixtures.json shape mismatch: the file is persisted as
// `{ fixtures: [...] }`, but consumers used to read it as a top-level array and
// silently received an empty list. normalizeFixtureRows must accept either shape.
test("object { fixtures: [...] } yields the rows (was silently empty before)", () => {
  const rows = normalizeFixtureRows({ fixtures: [{ id: 1 }, { id: 2 }] });
  assert.equal(rows.length, 2);
});

test("top-level array passes through unchanged", () => {
  const arr = [{ id: 1 }, { id: 2 }, { id: 3 }];
  assert.equal(normalizeFixtureRows(arr), arr);
});

test("null / undefined / non-fixture object degrade to empty array", () => {
  assert.deepEqual(normalizeFixtureRows(null), []);
  assert.deepEqual(normalizeFixtureRows(undefined), []);
  assert.deepEqual(normalizeFixtureRows({ foo: 1 }), []);
  assert.deepEqual(normalizeFixtureRows({ fixtures: "nope" }), []);
});
