import test from "node:test";
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
