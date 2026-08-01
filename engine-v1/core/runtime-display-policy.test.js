import assert from "node:assert/strict";
import test from "node:test";
import {
  requestTimeDisplayOverlaysEnabled,
  reusableDisplayRevision,
  reusableRuntimeDisplayEntry
} from "./runtime-display-policy.js";

test("Render and snapshot-only services disable request-time overlays by default", () => {
  assert.equal(requestTimeDisplayOverlaysEnabled({ renderRuntime: true }), false);
  assert.equal(requestTimeDisplayOverlaysEnabled({ snapshotOnly: true }), false);
  assert.equal(requestTimeDisplayOverlaysEnabled({ renderRuntime: false, snapshotOnly: false }), true);
});

test("explicit overlay policy remains fail-closed and reviewable", () => {
  assert.equal(requestTimeDisplayOverlaysEnabled({ renderRuntime: true, explicitValue: "true" }), true);
  assert.equal(requestTimeDisplayOverlaysEnabled({ explicitValue: "false" }), false);
  assert.equal(requestTimeDisplayOverlaysEnabled({ renderRuntime: true, explicitValue: "garbage" }), false);
  assert.equal(requestTimeDisplayOverlaysEnabled({ renderRuntime: false, snapshotOnly: false, explicitValue: "garbage" }), false);
});

test("display base cache is bound only to promoted manifest revision", () => {
  const hit = { revision: "100:200", value: { matches: [] } };
  assert.equal(reusableDisplayRevision(hit, "100:200"), true);
  assert.equal(reusableDisplayRevision(hit, "101:201"), false);
});

test("runtime cache measures live TTL from completion and never expires snapshot-only entries", () => {
  const inFlight = { revision: "r1", promise: Promise.resolve({}), completedAt: null };
  assert.equal(reusableRuntimeDisplayEntry(inFlight, { revision: "r1", overlaysEnabled: true }), true);

  const completed = { revision: "r1", promise: Promise.resolve({}), completedAt: 1000 };
  assert.equal(reusableRuntimeDisplayEntry(completed, {
    revision: "r1", overlaysEnabled: true, now: 12999, overlayTtlMs: 12000
  }), true);
  assert.equal(reusableRuntimeDisplayEntry(completed, {
    revision: "r1", overlaysEnabled: true, now: 13001, overlayTtlMs: 12000
  }), false);
  assert.equal(reusableRuntimeDisplayEntry(completed, {
    revision: "r1", overlaysEnabled: false, now: 999999
  }), true);
});
