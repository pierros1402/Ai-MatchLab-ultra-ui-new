import assert from "node:assert/strict";
import test from "node:test";
import { shouldRefreshStableHealthAlert } from "./build-system-health-alerts-day.js";

const now = "2026-11-13T09:35:00.000Z";

test("refreshes unchanged alerts after the manifest exceeds the nine-minute threshold", () => {
  assert.equal(shouldRefreshStableHealthAlert({
    previousGeneratedAt: "2026-11-13T00:59:45.633Z",
    manifestGeneratedAt: "2026-11-13T04:01:39.279Z",
    now
  }), true);
});

test("does not create intraday timestamp churn when existing alert is fresh", () => {
  assert.equal(shouldRefreshStableHealthAlert({
    previousGeneratedAt: "2026-11-13T09:20:00Z",
    manifestGeneratedAt: "2026-11-13T09:29:00Z",
    now
  }), false);
});

test("invalid manifest cannot be silently certified", () => {
  assert.equal(shouldRefreshStableHealthAlert({
    previousGeneratedAt: "2026-11-13T08:00:00Z",
    manifestGeneratedAt: null,
    now
  }), false);
});

test("future manifest cannot be certified by an earlier alert run", () => {
  assert.equal(shouldRefreshStableHealthAlert({
    previousGeneratedAt: "2026-11-13T07:00:00Z",
    manifestGeneratedAt: "2026-11-13T10:00:00Z",
    now
  }), false);
});

test("missing prior timestamp refreshes when manifest and clock are valid", () => {
  assert.equal(shouldRefreshStableHealthAlert({
    previousGeneratedAt: null,
    manifestGeneratedAt: "2026-11-13T08:00:00Z",
    now
  }), true);
});
