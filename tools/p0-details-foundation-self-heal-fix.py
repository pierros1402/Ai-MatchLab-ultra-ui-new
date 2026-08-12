from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"anchor mismatch for {path}: expected 1, found {count}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8", newline="\n")


rebuild = "engine-v1/jobs/rebuild-indexes-for-season.js"
replace_once(
    rebuild,
    'import { currentSeason } from "../core/season.js";\n',
    'import { currentSeason } from "../core/season.js";\n'
    'import { validateHistoryIndexFoundationSync } from "../core/derived-history-foundation.js";\n'
)

helper = r'''

export async function ensureHistoryIndexFoundationForDay(
  dayKey,
  {
    validateFoundation = validateHistoryIndexFoundationSync,
    rebuild = rebuildIndexesForSeason
  } = {}
) {
  const season = resolveSeasonFromDay(dayKey);

  if (season === "unknown-season") {
    return {
      ok: false,
      reason: "invalid_day_key",
      dayKey,
      season,
      rebuilt: false
    };
  }

  const before = validateFoundation(season);

  if (before?.ok === true) {
    return {
      ok: true,
      dayKey,
      season,
      rebuilt: false,
      previousReason: null,
      foundationFingerprint:
        before?.artifact?.foundationFingerprint || null
    };
  }

  const rebuildResult = await rebuild(dayKey);

  if (rebuildResult?.ok !== true) {
    return {
      ok: false,
      reason: "history_index_rebuild_failed",
      dayKey,
      season,
      rebuilt: false,
      previousReason: before?.reason || null,
      rebuild: rebuildResult
    };
  }

  const after = validateFoundation(season);

  if (after?.ok !== true) {
    return {
      ok: false,
      reason: "history_index_foundation_not_ready_after_rebuild",
      dayKey,
      season,
      rebuilt: true,
      previousReason: before?.reason || null,
      currentReason: after?.reason || null,
      rebuild: rebuildResult
    };
  }

  return {
    ok: true,
    dayKey,
    season,
    rebuilt: true,
    previousReason: before?.reason || null,
    foundationFingerprint:
      after?.artifact?.foundationFingerprint || null,
    rebuild: rebuildResult
  };
}
'''
p = Path(rebuild)
text = p.read_text(encoding="utf-8")
anchor = "\nexport async function rebuildIndexesForSeason(dayKey) {"
if text.count(anchor) != 1:
    raise SystemExit("rebuild helper insertion anchor mismatch")
p.write_text(text.replace(anchor, helper + anchor, 1), encoding="utf-8", newline="\n")


daily = "engine-v1/jobs/run-daily-cycle.js"
replace_once(
    daily,
    'import {\n  rebuildIndexesForSeason,\n  collectIndexRebuildTargets\n} from "./rebuild-indexes-for-season.js";',
    'import {\n  rebuildIndexesForSeason,\n  collectIndexRebuildTargets,\n  ensureHistoryIndexFoundationForDay\n} from "./rebuild-indexes-for-season.js";'
)

foundation_gate = r'''
  console.log("[daily-cycle] details-history-index-foundation:start", {
    dayKey
  });

  const detailsHistoryIndexFoundation =
    await ensureHistoryIndexFoundationForDay(dayKey);

  console.log("[daily-cycle] details-history-index-foundation:done", {
    ok: detailsHistoryIndexFoundation?.ok === true,
    dayKey,
    season: detailsHistoryIndexFoundation?.season || null,
    rebuilt: detailsHistoryIndexFoundation?.rebuilt === true,
    previousReason: detailsHistoryIndexFoundation?.previousReason || null,
    reason: detailsHistoryIndexFoundation?.reason || null,
    foundationFingerprint:
      detailsHistoryIndexFoundation?.foundationFingerprint || null
  });

  if (detailsHistoryIndexFoundation?.ok !== true) {
    const error = new Error(
      "details_history_index_foundation_not_ready"
    );
    error.code = "DETAILS_HISTORY_INDEX_FOUNDATION_NOT_READY";
    error.dayKey = dayKey;
    error.details = detailsHistoryIndexFoundation;
    throw error;
  }

'''
p = Path(daily)
text = p.read_text(encoding="utf-8")
anchor = '  console.log("[daily-cycle] details-build:start", {\n'
if text.count(anchor) != 1:
    raise SystemExit("daily details gate insertion anchor mismatch")
p.write_text(text.replace(anchor, foundation_gate + anchor, 1), encoding="utf-8", newline="\n")


Path("engine-v1/tests/details-history-index-self-heal.test.js").write_text(r'''import test from "node:test";
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
''', encoding="utf-8", newline="\n")


Path("engine-v1/tests/daily-details-foundation-order.test.js").write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("daily cycle ensures the target-season history index foundation before details", () => {
  const source = fs.readFileSync(
    new URL("../jobs/run-daily-cycle.js", import.meta.url),
    "utf8"
  ).replace(/\r\n/g, "\n");

  const ensureIndex = source.indexOf(
    "await ensureHistoryIndexFoundationForDay(dayKey)"
  );
  const failClosedIndex = source.indexOf(
    '"details_history_index_foundation_not_ready"'
  );
  const detailsIndex = source.indexOf(
    "const detailsBuild = await buildDetailsDay(dayKey"
  );

  assert.ok(ensureIndex >= 0);
  assert.ok(failClosedIndex > ensureIndex);
  assert.ok(detailsIndex > failClosedIndex);
});
''', encoding="utf-8", newline="\n")
