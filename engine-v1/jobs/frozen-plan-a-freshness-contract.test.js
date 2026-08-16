import test from "node:test";
import assert from "node:assert/strict";

import {
  snapshotValueFreshnessTime
} from "./verify-artifact-freshness-day.js";

test("frozen Plan A snapshot freshness follows snapshot publication time", () => {
  const at = snapshotValueFreshnessTime({
    snapshotValue: {
      immutable: true,
      planId: "plan-a",
      outputMode: "plan-a-observation",
      publicationAuthority: "frozen_plan_a_observation",
      updatedAt: "2026-08-15T07:00:00.000Z"
    },
    manifest: {
      generatedAt: "2026-08-15T17:07:21.842Z",
      valueGate: {
        valueArtifactAt: "2026-08-15T17:07:21.838Z"
      }
    }
  });

  assert.equal(
    at,
    Date.parse("2026-08-15T17:07:21.842Z")
  );
});

test("mutable snapshot freshness still follows the mutable Value timestamp", () => {
  const at = snapshotValueFreshnessTime({
    snapshotValue: {
      publicationAuthority: "current_value_artifact",
      updatedAt: "2026-08-15T09:00:00.000Z"
    },
    manifest: {
      generatedAt: "2026-08-15T17:00:00.000Z",
      valueGate: {
        valueArtifactAt: "2026-08-15T16:59:59.000Z"
      }
    }
  });

  assert.equal(
    at,
    Date.parse("2026-08-15T09:00:00.000Z")
  );
});
