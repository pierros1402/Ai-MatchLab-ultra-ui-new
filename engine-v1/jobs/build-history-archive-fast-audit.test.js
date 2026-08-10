import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./build-history-archive-fast-audit.js", import.meta.url), "utf8");

test("fast archive audit is read-only", () => {
  assert.doesNotMatch(source, /renameSync\s*\(/u);
  assert.doesNotMatch(source, /copyFileSync\s*\(/u);
  assert.doesNotMatch(source, /rmSync\s*\(/u);
});

test("fast archive audit emits complete duplicate examples contract", () => {
  assert.match(source, /semanticDuplicates/u);
  assert.match(source, /scoreConflicts/u);
  assert.match(source, /flippedOrientation/u);
  assert.match(source, /crossOperationalDay/u);
});
