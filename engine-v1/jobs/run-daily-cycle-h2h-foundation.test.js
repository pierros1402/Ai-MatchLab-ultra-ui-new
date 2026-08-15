import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  ensureH2HFoundationBeforeDetails,
} from "./run-daily-cycle.js";

test("daily cycle heals a stale H2H foundation before details", () => {
  let rebuildCalls = 0;
  const result = ensureH2HFoundationBeforeDetails({
    validate: () => ({ ok: false, reason: "h2h_foundation_stale" }),
    rebuild: () => {
      rebuildCalls += 1;
      return {
        ok: true,
        artifactCount: 12,
        foundation: { foundationFingerprint: "fresh-h2h" },
        validation: { ok: true },
      };
    },
  });

  assert.equal(rebuildCalls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.rebuilt, true);
  assert.equal(result.previousReason, "h2h_foundation_stale");
  assert.equal(result.foundationFingerprint, "fresh-h2h");
});

test("daily cycle keeps a current H2H foundation before details", () => {
  let rebuildCalls = 0;
  const result = ensureH2HFoundationBeforeDetails({
    validate: () => ({ ok: true }),
    rebuild: () => {
      rebuildCalls += 1;
      return { ok: true, validation: { ok: true } };
    },
  });

  assert.equal(rebuildCalls, 0);
  assert.equal(result.ok, true);
  assert.equal(result.rebuilt, false);
});

test("daily cycle places H2H self-heal before the details build", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("./run-daily-cycle.js", import.meta.url)), "utf8");
  const historyIndex = source.indexOf("details-history-index-foundation:done");
  const h2h = source.indexOf("details-h2h-foundation:start");
  const details = source.indexOf("details-build:start");

  assert.ok(historyIndex >= 0);
  assert.ok(h2h > historyIndex);
  assert.ok(details > h2h);
});

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
