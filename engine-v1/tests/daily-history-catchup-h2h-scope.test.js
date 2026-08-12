import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs
  .readFileSync(
    new URL("../jobs/run-daily-cycle.js", import.meta.url),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

test("history catch-up state stays in runDailyCycle scope through H2H refresh", () => {
  const declarationIndex = source.indexOf(
    "  let historyCatchUp = [];"
  );
  const finalizeMarkerIndex = source.indexOf(
    'console.log("[daily-cycle] finalize-live-status-refresh:start"'
  );
  const resetIndex = source.indexOf(
    "    historyCatchUp = [];",
    finalizeMarkerIndex
  );
  const h2hIndex = source.indexOf(
    "historyCatchUp.some(row => row?.appended === true)"
  );

  assert.ok(declarationIndex >= 0, "run-scope historyCatchUp state is missing");
  assert.ok(finalizeMarkerIndex > declarationIndex, "historyCatchUp must be declared before finalization");
  assert.ok(resetIndex > finalizeMarkerIndex, "historyCatchUp must be reset inside finalization without redeclaration");
  assert.ok(h2hIndex > resetIndex, "H2H refresh must consume the same run-scope historyCatchUp state");
  assert.doesNotMatch(source, /\bconst historyCatchUp = \[\];/u);
});
