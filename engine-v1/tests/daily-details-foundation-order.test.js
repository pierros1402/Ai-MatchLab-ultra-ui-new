import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(
  new URL(
    "../jobs/run-daily-cycle.js",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");

test("daily cycle ensures the target-season history index before building details", () => {
  const foundationImportIndex = source.indexOf(
    "ensureDetailsHistoryIndexFoundationDay",
  );
  const foundationCallIndex = source.indexOf(
    "await ensureDetailsHistoryIndexFoundationDay(dayKey)",
  );
  const detailsBuildIndex = source.indexOf(
    "const detailsBuild = await buildDetailsDay(dayKey",
  );

  assert.ok(foundationImportIndex >= 0);
  assert.ok(foundationCallIndex > foundationImportIndex);
  assert.ok(detailsBuildIndex > foundationCallIndex);
  assert.match(
    source,
    /details-history-index-foundation:start/,
  );
  assert.match(
    source,
    /details-history-index-foundation:done/,
  );
});
