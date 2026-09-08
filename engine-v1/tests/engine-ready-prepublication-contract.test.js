import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("engine readiness accepts current or next-day atomic publication only", () => {
  const source = fs.readFileSync(
    new URL("../index.js", import.meta.url),
    "utf8"
  ).replace(/\r\n/g, "\n");

  const start = source.indexOf(
    'app.get("/ready", (_req, res) => {'
  );

  const end = source.indexOf(
    'app.get("/deploy-snapshot",',
    start
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const route = source.slice(start, end);

  assert.match(
    route,
    /const calendarDay = athensDayKey\(\);/
  );

  assert.match(
    route,
    /const nextDay = shiftDay\(calendarDay,\s*1\);/
  );

  assert.match(
    route,
    /latestDay === calendarDay\s*\|\|\s*latestDay === nextDay/
  );

  assert.match(
    route,
    /next_day_prepublished/
  );

  assert.match(
    route,
    /future_invalid/
  );

  assert.match(
    route,
    /latest_pointer_mismatch/
  );

  assert.doesNotMatch(
    route,
    /String\(latest\.date \|\| ""\) === day/
  );
});