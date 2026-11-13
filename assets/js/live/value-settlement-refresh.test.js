import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const src = fs.readFileSync(new URL("./value-adapter.js", import.meta.url), "utf8");

test("current-day settlement is rechecked periodically and on visibility return", () => {
  assert.match(src, /SETTLEMENT_POLL_MS = 90 \* 1000/);
  assert.match(src, /window\.setInterval\(refreshCurrentDaySettlement, SETTLEMENT_POLL_MS\)/);
  assert.match(src, /document\.addEventListener\("visibilitychange"/);
  assert.match(src, /selected !== today\) return/);
});
test("settlement remains exclusively backend-owned and polling never clears a verified plan on failure", () => {
  assert.match(src, /const comparison = await fetchValueComparison\(date\)/);
  assert.match(src, /preserveOnError && window\.__AIML_LAST_VALUE\?\.date === date\) return/);
  assert.doesNotMatch(src, /\bWIN\b|\bLOSS\b/);
});
