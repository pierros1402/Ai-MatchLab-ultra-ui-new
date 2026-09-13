import test from "node:test";
import assert from "node:assert/strict";

import { resolveValueCoverageSource } from "../jobs/build-value-coverage-report-day.js";

test("Value coverage uses the exact canonical Value universe and never snapshot fallback", () => {
  const fixtures = [
    { canonicalId: "cid_a", matchId: "cid_a" },
    { canonicalId: "cid_b", matchId: "cid_b" }
  ];
  const universe = {
    schema: "ai-matchlab.value-fixture-universe.v1",
    source: "canonical_fixtures",
    count: 2,
    hash: "abc123",
    canonicalIds: ["cid_a", "cid_b"],
    fixtures
  };

  const resolved = resolveValueCoverageSource("2026-09-12", {
    buildUniverse: dayKey => {
      assert.equal(dayKey, "2026-09-12");
      return universe;
    }
  });

  assert.equal(resolved.inputSource, "canonical_fixtures");
  assert.strictEqual(resolved.valueUniverse, universe);
  assert.strictEqual(resolved.canonicalMatches, fixtures);
  assert.strictEqual(resolved.sourceMatches, fixtures);
});

test("Value coverage reports empty when canonical Value universe is empty", () => {
  const resolved = resolveValueCoverageSource("2026-09-12", {
    buildUniverse: () => ({
      schema: "ai-matchlab.value-fixture-universe.v1",
      source: "canonical_fixtures",
      count: 0,
      hash: "empty-hash",
      canonicalIds: [],
      fixtures: []
    })
  });

  assert.equal(resolved.inputSource, "empty");
  assert.deepEqual(resolved.sourceMatches, []);
});

test("Value coverage fails closed on malformed or non-canonical universe", () => {
  assert.throws(
    () => resolveValueCoverageSource("2026-09-12", {
      buildUniverse: () => ({ source: "deploy_snapshot", count: 1, hash: "x", fixtures: [{}] })
    }),
    /VALUE_COVERAGE_FIXTURE_UNIVERSE_INVALID/
  );

  assert.throws(
    () => resolveValueCoverageSource("2026-09-12", {
      buildUniverse: () => ({ source: "canonical_fixtures", count: 2, hash: "x", fixtures: [{}] })
    }),
    /VALUE_COVERAGE_FIXTURE_UNIVERSE_INVALID/
  );
});
