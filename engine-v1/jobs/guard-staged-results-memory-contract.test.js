import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

test("staged results-memory preservation is fail-closed and opt-in only", () => {
  const source = fs.readFileSync(fileURLToPath(new URL("./guard-staged-data-boundary.js", import.meta.url)), "utf8");
  assert.match(source, /hasFlag\("enforce-results-preservation"\)/);
  assert.match(source, /inspectResultsMemoryPreservation\(before, after\)/);
  assert.match(source, /git\(\["show", `HEAD:\$\{p\}`\]\)/);
  assert.match(source, /git\(\["show", `:\$\{p\}`\]\)/);
  assert.match(source, /results_memory_preservation_unverifiable/);
  assert.match(source, /enforceResultsPreservation && statusLetter === "M"/);
  assert.doesNotMatch(source, /allow-results-memory-shrink/);
});
