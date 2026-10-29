import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

test("Daily writer propagates history timestamp-preflight failures", () => {
  const source = fs.readFileSync(
    fileURLToPath(new URL("./run-day.js", import.meta.url)), "utf8"
  );
  const start = source.indexOf('const arch = buildHistoryArchiveFromResults();');
  const end = source.indexOf('// 2h) Rebuild the CURRENT-season', start);
  assert.ok(start >= 0 && end > start);
  const block = source.slice(start, end);
  assert.match(block, /reason\.startsWith\("results_memory_preflight_failed:"\)/);
  assert.match(block, /throw e;/);
  assert.ok(block.indexOf("throw e;") < block.indexOf('log("history-archive-priors:skip"'));
});
