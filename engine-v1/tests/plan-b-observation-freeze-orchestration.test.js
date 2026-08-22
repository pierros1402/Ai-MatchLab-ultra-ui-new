import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const source = fs.readFileSync(
  path.join(root, "engine-v1", "jobs", "refresh-value-artifacts-day.js"),
  "utf8"
);

test("Plan B refresh imports the shared observation freeze boundary", () => {
  assert.match(source, /shouldFreezeAdjustedValueObservations/);
  assert.match(source, /from ["']\.\/build-value-a2-b2-day\.js["']/);
});

test("Plan B current-day refresh uses the freeze primitive instead of unconditional rewrite", () => {
  assert.match(
    source,
    /freeze\s*:\s*shouldFreezeAdjustedValueObservations\(date,\s*athensDayKey\(\)\)/
  );

  const planBBlock = source.match(
    /const\s+planB\s*=\s*options\.skipPlanB\s*===\s*true[\s\S]*?outputMode\s*:\s*["']plan-b-observation["'][\s\S]*?\}\);/
  );

  assert.ok(planBBlock, "Plan B observation block must exist");
  assert.doesNotMatch(planBBlock[0], /freeze\s*:\s*false/);
});
