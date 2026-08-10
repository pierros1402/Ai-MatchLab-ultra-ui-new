import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("daily cycle rebuilds or validates H2H foundation after history mutation", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("./run-daily-cycle.js", import.meta.url)), "utf8");
  const catchup = source.indexOf("history-catch-up:done");
  const h2h = source.indexOf("h2h-foundation-rebuild:start");
  const finished = source.indexOf("const finishedAt = Date.now()");
  assert.ok(catchup >= 0);
  assert.ok(h2h > catchup);
  assert.ok(finished > h2h);
  assert.match(source, /validateH2HFoundationSync\(\)/u);
  assert.match(source, /rebuildH2HFoundationFromCurrentHistory\(\)/u);
});
