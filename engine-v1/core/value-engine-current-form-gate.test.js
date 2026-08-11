import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateMinimumRecentSampleGate
} from "./value-engine-v1.js";

test(
  "prior-only blended sample cannot satisfy minimum current-form eligibility",
  () => {
    const result =
      evaluateMinimumRecentSampleGate({
        rawHomeMetrics: { sample: 0 },
        rawAwayMetrics: { sample: 0 },
        homeMetrics: { sample: 3 },
        awayMetrics: { sample: 3 }
      });

    assert.equal(result.ok, false);
    assert.equal(result.basis, "current_season_raw");
    assert.equal(result.minRequiredRecentMatches, 3);
    assert.equal(result.homeRawSample, 0);
    assert.equal(result.awayRawSample, 0);
    assert.equal(result.homeBlendedSample, 3);
    assert.equal(result.awayBlendedSample, 3);
  }
);

test(
  "two real matches cannot be promoted to three by prior history",
  () => {
    const result =
      evaluateMinimumRecentSampleGate({
        rawHomeMetrics: { sample: 2 },
        rawAwayMetrics: { sample: 5 },
        homeMetrics: { sample: 5 },
        awayMetrics: { sample: 8 }
      });

    assert.equal(result.ok, false);
    assert.equal(result.homeRawSample, 2);
    assert.equal(result.homeBlendedSample, 5);
  }
);

test(
  "three real current-season matches per team satisfy the minimum-form gate",
  () => {
    const result =
      evaluateMinimumRecentSampleGate({
        rawHomeMetrics: { sample: 3 },
        rawAwayMetrics: { sample: 3 },
        homeMetrics: { sample: 6 },
        awayMetrics: { sample: 6 }
      });

    assert.equal(result.ok, true);
    assert.equal(result.homeRawSample, 3);
    assert.equal(result.awayRawSample, 3);
  }
);
