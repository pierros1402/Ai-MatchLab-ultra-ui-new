import test from "node:test";
import assert from "node:assert/strict";

import {
  computeStatisticalReadiness
} from "./build-value-day.js";

function valueWithRecency(entries, matchupSample = 0) {
  const [
    homeOverall,
    awayOverall,
    homeSide,
    awaySide
  ] = entries;

  return {
    meta: {
      recency: {
        homeOverall,
        awayOverall,
        homeSide,
        awaySide
      },
      matchupSample
    }
  };
}

test(
  "readiness counts the engine-capped effective sample at season rollover",
  () => {
    const entry = {
      rawSample: 1,
      sample: 4,
      priorSample: 40,
      freshnessScore: 1,
      continuityScore: 1,
      formContinuityWeight: 0.76
    };

    const readiness =
      computeStatisticalReadiness(
        valueWithRecency(
          [entry, entry, entry, entry],
          3
        ),
        0.8
      );

    assert.ok(
      readiness > 0.75,
      `expected capped priors to bridge rollover readiness, got ${readiness}`
    );
  }
);

test(
  "priors alone cannot make a fixture statistically ready",
  () => {
    const priorOnly = {
      rawSample: 0,
      sample: 3,
      priorSample: 100,
      freshnessScore: 0.2,
      continuityScore: 0.2,
      formContinuityWeight: 0
    };

    const readiness =
      computeStatisticalReadiness(
        valueWithRecency(
          [
            priorOnly,
            priorOnly,
            priorOnly,
            priorOnly
          ],
          3
        ),
        0.9
      );

    assert.ok(
      readiness < 0.5,
      `prior-only fixture must remain below panel thresholds, got ${readiness}`
    );
  }
);
