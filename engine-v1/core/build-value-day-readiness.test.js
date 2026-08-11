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

function readinessEntry({
  rawSample,
  sample,
  priorSample = 0
}) {
  return {
    rawSample,
    sample,
    priorSample,
    freshnessScore: 1,
    continuityScore: 1,
    formContinuityWeight: 0.76
  };
}

test(
  "readiness sample component follows raw current-season evidence",
  () => {
    const lowRaw =
      readinessEntry({
        rawSample: 1,
        sample: 4,
        priorSample: 40
      });

    const highRaw =
      readinessEntry({
        rawSample: 4,
        sample: 4,
        priorSample: 40
      });

    const lowReadiness =
      computeStatisticalReadiness(
        valueWithRecency(
          [lowRaw, lowRaw, lowRaw, lowRaw],
          3
        ),
        0.8
      );

    const highReadiness =
      computeStatisticalReadiness(
        valueWithRecency(
          [highRaw, highRaw, highRaw, highRaw],
          3
        ),
        0.8
      );

    assert.ok(
      highReadiness > lowReadiness + 0.13,
      `raw form must materially change readiness: low=${lowReadiness} high=${highReadiness}`
    );
  }
);

test(
  "prior-blended sample cannot inflate readiness when raw evidence is unchanged",
  () => {
    const noPriorBoost =
      readinessEntry({
        rawSample: 1,
        sample: 1,
        priorSample: 0
      });

    const heavyPriorBoost =
      readinessEntry({
        rawSample: 1,
        sample: 4,
        priorSample: 100
      });

    const withoutPrior =
      computeStatisticalReadiness(
        valueWithRecency(
          [
            noPriorBoost,
            noPriorBoost,
            noPriorBoost,
            noPriorBoost
          ],
          3
        ),
        0.8
      );

    const withPrior =
      computeStatisticalReadiness(
        valueWithRecency(
          [
            heavyPriorBoost,
            heavyPriorBoost,
            heavyPriorBoost,
            heavyPriorBoost
          ],
          3
        ),
        0.8
      );

    assert.equal(
      withPrior,
      withoutPrior,
      "changing blended/prior sample alone must not change readiness"
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
