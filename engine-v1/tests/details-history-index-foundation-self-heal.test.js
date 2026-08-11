import test from "node:test";
import assert from "node:assert/strict";

import {
  ensureDetailsHistoryIndexFoundationDay,
} from "../jobs/ensure-details-history-index-foundation-day.js";

test("current details history-index foundation skips rebuild", async () => {
  let rebuildCalls = 0;

  const result = await ensureDetailsHistoryIndexFoundationDay(
    "2026-08-11",
    {
      validate: season => ({
        ok: true,
        artifact: {
          season,
          foundationFingerprint: "current-fingerprint",
        },
      }),
      rebuild: async () => {
        rebuildCalls += 1;
        return { ok: true };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.season, "2026-2027");
  assert.equal(result.rebuilt, false);
  assert.equal(result.foundationFingerprint, "current-fingerprint");
  assert.equal(rebuildCalls, 0);
});

test("missing season foundation rebuilds once and revalidates", async () => {
  let validateCalls = 0;
  let rebuildCalls = 0;

  const result = await ensureDetailsHistoryIndexFoundationDay(
    "2026-08-11",
    {
      validate: season => {
        validateCalls += 1;
        if (validateCalls === 1) {
          return {
            ok: false,
            reason: "missing_or_invalid_history_index_foundation",
          };
        }
        return {
          ok: true,
          artifact: {
            season,
            foundationFingerprint: "rebuilt-fingerprint",
          },
        };
      },
      rebuild: async dayKey => {
        rebuildCalls += 1;
        assert.equal(dayKey, "2026-08-11");
        return {
          ok: true,
          dayKey,
          season: "2026-2027",
        };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(result.season, "2026-2027");
  assert.equal(result.rebuilt, true);
  assert.equal(
    result.previousReason,
    "missing_or_invalid_history_index_foundation",
  );
  assert.equal(result.foundationFingerprint, "rebuilt-fingerprint");
  assert.equal(validateCalls, 2);
  assert.equal(rebuildCalls, 1);
});

test("failed rebuild remains fail-closed", async () => {
  await assert.rejects(
    ensureDetailsHistoryIndexFoundationDay(
      "2026-08-11",
      {
        validate: () => ({
          ok: false,
          reason: "missing_or_invalid_history_index_foundation",
        }),
        rebuild: async () => ({
          ok: false,
          reason: "index_build_failed",
        }),
      },
    ),
    error => {
      assert.equal(
        error.message,
        "details_history_index_foundation_rebuild_failed",
      );
      assert.equal(error.details.season, "2026-2027");
      assert.equal(
        error.details.previousReason,
        "missing_or_invalid_history_index_foundation",
      );
      return true;
    },
  );
});

test("rebuild that does not produce a valid foundation remains fail-closed", async () => {
  let validateCalls = 0;

  await assert.rejects(
    ensureDetailsHistoryIndexFoundationDay(
      "2026-08-11",
      {
        validate: () => {
          validateCalls += 1;
          return {
            ok: false,
            reason:
              validateCalls === 1
                ? "missing_or_invalid_history_index_foundation"
                : "history_index_foundation_stale",
          };
        },
        rebuild: async () => ({
          ok: true,
          season: "2026-2027",
        }),
      },
    ),
    error => {
      assert.equal(
        error.message,
        "details_history_index_foundation_not_ready_after_rebuild",
      );
      assert.equal(error.details.season, "2026-2027");
      assert.equal(
        error.details.currentReason,
        "history_index_foundation_stale",
      );
      return true;
    },
  );
});

test("invalid day fails before validation or rebuild", async () => {
  let calls = 0;

  await assert.rejects(
    ensureDetailsHistoryIndexFoundationDay(
      "2026-02-30",
      {
        validate: () => {
          calls += 1;
          return { ok: true };
        },
        rebuild: async () => {
          calls += 1;
          return { ok: true };
        },
      },
    ),
    /details_history_index_foundation_invalid_day/,
  );

  assert.equal(calls, 0);
});
