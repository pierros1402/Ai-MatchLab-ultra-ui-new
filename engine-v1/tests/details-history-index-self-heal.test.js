import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureHistoryIndexFoundationForDay
} from "../jobs/rebuild-indexes-for-season.js";

test("details foundation ensure leaves a current foundation untouched", async () => {
  let rebuildCalls = 0;
  const result = await ensureHistoryIndexFoundationForDay(
    "2026-08-12",
    {
      validateFoundation: () => ({
        ok: true,
        artifact: { foundationFingerprint: "current-fp" }
      }),
      rebuild: async () => {
        rebuildCalls += 1;
        return { ok: true };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.rebuilt, false);
  assert.equal(result.season, "2026-2027");
  assert.equal(result.foundationFingerprint, "current-fp");
  assert.equal(rebuildCalls, 0);
});

test("details foundation ensure rebuilds a missing foundation and revalidates it", async () => {
  let validateCalls = 0;
  let rebuildCalls = 0;

  const result = await ensureHistoryIndexFoundationForDay(
    "2026-08-12",
    {
      validateFoundation: () => {
        validateCalls += 1;
        return validateCalls == 1
          ? { ok: false, reason: "missing_or_invalid_history_index_foundation" }
          : {
              ok: true,
              artifact: { foundationFingerprint: "rebuilt-fp" }
            };
      },
      rebuild: async dayKey => {
        rebuildCalls += 1;
        assert.equal(dayKey, "2026-08-12");
        return { ok: true, season: "2026-2027" };
      }
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.rebuilt, true);
  assert.equal(result.previousReason, "missing_or_invalid_history_index_foundation");
  assert.equal(result.foundationFingerprint, "rebuilt-fp");
  assert.equal(validateCalls, 2);
  assert.equal(rebuildCalls, 1);
});

test("details foundation ensure fails closed when rebuild fails", async () => {
  const result = await ensureHistoryIndexFoundationForDay(
    "2026-08-12",
    {
      validateFoundation: () => ({
        ok: false,
        reason: "history_index_foundation_stale"
      }),
      rebuild: async () => ({
        ok: false,
        error: "synthetic rebuild failure"
      })
    }
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "history_index_rebuild_failed");
  assert.equal(result.previousReason, "history_index_foundation_stale");
});

test("details foundation ensure fails closed when revalidation is still stale", async () => {
  let validateCalls = 0;
  const result = await ensureHistoryIndexFoundationForDay(
    "2026-08-12",
    {
      validateFoundation: () => {
        validateCalls += 1;
        return {
          ok: false,
          reason: validateCalls == 1
            ? "missing_or_invalid_history_index_foundation"
            : "history_index_foundation_stale"
        };
      },
      rebuild: async () => ({ ok: true })
    }
  );

  assert.equal(result.ok, false);
  assert.equal(
    result.reason,
    "history_index_foundation_not_ready_after_rebuild"
  );
  assert.equal(result.currentReason, "history_index_foundation_stale");
  assert.equal(validateCalls, 2);
});
