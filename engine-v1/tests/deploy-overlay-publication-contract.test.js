import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateDeployOverlayPublicationEligibility
} from "../core/deploy-overlay-publication-contract.js";

const DAY = "2026-09-08";
const HASH = "a".repeat(64);

test("mutable deploy overlay is blocked before immutable publication exists", () => {
  const result = evaluateDeployOverlayPublicationEligibility(DAY, {
    manifest: null,
    fixturesPresent: false,
    valuePresent: false
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "published_core_manifest_missing_or_invalid");
});

test("mutable deploy overlay rejects a manifest for another day", () => {
  const result = evaluateDeployOverlayPublicationEligibility(DAY, {
    manifest: { ok: true, date: "2026-09-07", hash: HASH },
    fixturesPresent: true,
    valuePresent: true
  });

  assert.equal(result.eligible, false);
  assert.equal(result.reason, "published_core_manifest_missing_or_invalid");
});

test("mutable deploy overlay requires both immutable core payloads", () => {
  const manifest = { ok: true, date: DAY, hash: HASH };

  assert.deepEqual(
    evaluateDeployOverlayPublicationEligibility(DAY, {
      manifest,
      fixturesPresent: false,
      valuePresent: true
    }),
    {
      eligible: false,
      dayKey: DAY,
      reason: "published_core_fixtures_missing"
    }
  );

  assert.deepEqual(
    evaluateDeployOverlayPublicationEligibility(DAY, {
      manifest,
      fixturesPresent: true,
      valuePresent: false
    }),
    {
      eligible: false,
      dayKey: DAY,
      reason: "published_core_value_missing"
    }
  );
});

test("mutable deploy overlay is admitted only after a valid immutable core release exists", () => {
  const result = evaluateDeployOverlayPublicationEligibility(DAY, {
    manifest: { ok: true, date: DAY, hash: HASH },
    fixturesPresent: true,
    valuePresent: true
  });

  assert.deepEqual(result, {
    eligible: true,
    dayKey: DAY,
    reason: "published_core_release_present"
  });
});
