import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveIntradayPublishedUniverse
} from "../core/intraday-publication-universe.js";

const fixture = id => ({ canonicalId: id, matchId: id });

test("status-only publication defers newly discovered canonical fixtures", () => {
  const result = resolveIntradayPublishedUniverse({
    publishedFixtures: [fixture("a"), fixture("b")],
    currentFixtures: [fixture("a"), fixture("b"), fixture("c")],
    publishedDetailIds: ["a", "b"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, null);
  assert.deepEqual(result.allowedFixtureIds, ["a", "b"]);
  assert.deepEqual(result.deferredFixtureIds, ["c"]);
});

test("status-only publication fails closed when a published detail is missing", () => {
  const result = resolveIntradayPublishedUniverse({
    publishedFixtures: [fixture("a"), fixture("b")],
    currentFixtures: [fixture("a"), fixture("b"), fixture("c")],
    publishedDetailIds: ["a"]
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "published_fixture_detail_missing");
  assert.deepEqual(result.missingPublishedDetailIds, ["b"]);
});

test("status-only publication fails closed when a previously published fixture disappears", () => {
  const result = resolveIntradayPublishedUniverse({
    publishedFixtures: [fixture("a"), fixture("b")],
    currentFixtures: [fixture("a"), fixture("c")],
    publishedDetailIds: ["a", "b"]
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "published_fixture_missing_from_current_universe");
  assert.deepEqual(result.missingCurrentFixtureIds, ["b"]);
});

test("status-only publication requires a prior published baseline", () => {
  const result = resolveIntradayPublishedUniverse({
    publishedFixtures: [],
    currentFixtures: [fixture("a")],
    publishedDetailIds: []
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "published_fixture_universe_missing");
});
