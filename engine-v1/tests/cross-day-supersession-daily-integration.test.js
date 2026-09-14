import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs
  .readFileSync(
    new URL("../jobs/run-daily-cycle.js", import.meta.url),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

test("daily cycle runs verified cross-day supersession before recent history catch-up", () => {
  const importIndex = source.indexOf(
    'import { applyCrossDayVerifiedFinalSupersessionWindow } from "./apply-cross-day-verified-final-supersession.js";'
  );
  const startIndex = source.indexOf(
    '[daily-cycle] cross-day-verified-final-supersession:start'
  );
  const applyIndex = source.indexOf(
    'applyCrossDayVerifiedFinalSupersessionWindow(dayKey, {'
  );
  const catchUpResetIndex = source.indexOf(
    '    historyCatchUp = [];'
  );
  const catchUpLoopIndex = source.indexOf(
    '    for (let back = 1; back <= 7; back++) {'
  );
  const returnIndex = source.indexOf(
    '    crossDayVerifiedFinalSupersession,'
  );

  assert.ok(importIndex >= 0, "cross-day convergence import is missing");
  assert.ok(startIndex > importIndex, "cross-day convergence marker must be inside runDailyCycle");
  assert.ok(applyIndex > startIndex, "cross-day convergence call must follow its start marker");
  assert.ok(catchUpResetIndex > applyIndex, "cross-day convergence must run before history catch-up reset");
  assert.ok(catchUpLoopIndex > catchUpResetIndex, "history catch-up loop must remain after convergence");
  assert.ok(returnIndex > catchUpLoopIndex, "daily-cycle result must expose convergence evidence");

  const callSlice = source.slice(applyIndex, catchUpResetIndex);
  assert.match(callSlice, /daysBack:\s*7/u);
  assert.match(callSlice, /write:\s*true/u);
  assert.match(callSlice, /CROSS_DAY_VERIFIED_FINAL_SUPERSESSION_FAILED/u);
});

test("daily integration preserves D-1 through D-7 history retry contract", () => {
  assert.match(source, /for \(let back = 1; back <= 7; back\+\+\) \{/u);
  assert.doesNotMatch(source, /for \(let back = 2; back <= 7; back\+\+\) \{/u);
});
