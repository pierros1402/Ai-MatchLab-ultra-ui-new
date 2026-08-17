import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  evaluateValueRefreshSnapshotCoverage,
  validateValuePlanPicksAgainstPublishedSnapshot
} from "./refresh-value-artifacts-day.js";

test("full canonical snapshot coverage remains accepted", () => {
  const result = evaluateValueRefreshSnapshotCoverage({
    canonicalIds: ["c1", "c2"],
    snapshotIds: ["c1", "c2"]
  });

  assert.equal(result.ok, true);
  assert.equal(result.mode, "full_canonical");
  assert.equal(
    result.deferredPublicationGapAccepted,
    false
  );
});

test("exact manifest-declared intraday deferred gap is accepted", () => {
  const result = evaluateValueRefreshSnapshotCoverage({
    canonicalIds: ["c1", "c2", "c3"],
    snapshotIds: ["c1", "c2"],
    publicationUniverse: {
      mode: "intraday_status_only",
      currentFixtureCount: 3,
      publishedFixtureCount: 2,
      deferredFixtureCount: 1,
      deferredFixtureIds: ["c3"]
    }
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.mode,
    "intraday_deferred_publication"
  );
  assert.equal(
    result.deferredPublicationGapAccepted,
    true
  );
  assert.deepEqual(
    result.missingCanonicalIds,
    ["c3"]
  );
});

test("undeclared canonical gap remains fail-closed", () => {
  const result = evaluateValueRefreshSnapshotCoverage({
    canonicalIds: ["c1", "c2", "c3", "c4"],
    snapshotIds: ["c1", "c2"],
    publicationUniverse: {
      mode: "intraday_status_only",
      currentFixtureCount: 4,
      publishedFixtureCount: 2,
      deferredFixtureCount: 1,
      deferredFixtureIds: ["c3"]
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.mode, "coverage_mismatch");
});

test("wrong publication mode cannot authorize a canonical gap", () => {
  const result = evaluateValueRefreshSnapshotCoverage({
    canonicalIds: ["c1", "c2", "c3"],
    snapshotIds: ["c1", "c2"],
    publicationUniverse: {
      mode: "full_export",
      currentFixtureCount: 3,
      publishedFixtureCount: 2,
      deferredFixtureCount: 1,
      deferredFixtureIds: ["c3"]
    }
  });

  assert.equal(result.ok, false);
});

test("deferred count mismatch remains fail-closed", () => {
  const result = evaluateValueRefreshSnapshotCoverage({
    canonicalIds: ["c1", "c2", "c3"],
    snapshotIds: ["c1", "c2"],
    publicationUniverse: {
      mode: "intraday_status_only",
      currentFixtureCount: 3,
      publishedFixtureCount: 2,
      deferredFixtureCount: 2,
      deferredFixtureIds: ["c3"]
    }
  });

  assert.equal(result.ok, false);
});

test("publication Value guard accepts picks bound to published fixtures", () => {
  const result =
    validateValuePlanPicksAgainstPublishedSnapshot(
      ["c1", "c2"],
      {
        A: {
          picks: [
            { matchId: "c1" }
          ]
        },
        B: {
          picks: [
            {
              canonicalId: "c2",
              matchId: "provider-c2"
            }
          ]
        }
      }
    );

  assert.equal(result.ok, true);
  assert.equal(result.violations.length, 0);
});

test("publication Value guard blocks a pick for a deferred fixture", () => {
  const result =
    validateValuePlanPicksAgainstPublishedSnapshot(
      ["c1", "c2"],
      {
        B2: {
          picks: [
            { canonicalId: "c3" }
          ]
        }
      }
    );

  assert.equal(result.ok, false);
  assert.equal(result.violations.length, 1);
  assert.deepEqual(
    result.violations[0].unpublishedPickIds,
    ["c3"]
  );
});

test("Value refresh preserves existing frozen valueGate metadata", () => {
  const source = fs.readFileSync(
    "engine-v1/jobs/refresh-value-artifacts-day.js",
    "utf8"
  );

  assert.ok(
    source.includes(
      "...(manifest.valueGate || {}),"
    )
  );
});
