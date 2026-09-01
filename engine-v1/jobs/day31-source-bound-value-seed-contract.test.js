import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflow = fs.readFileSync(
  new URL(
    "../../.github/workflows/tmp-p0-day31-source-bound-value-seed-20260831.yml",
    import.meta.url
  ),
  "utf8"
);

test("Day31 recovery freezes all four plans from one committed cohort", () => {
  const adjustedBuild = workflow.indexOf(
    "Bootstrap missing Day31 adjusted observations"
  );
  const sourceCommit = workflow.indexOf(
    "P0: Seed Day31 adjusted observations from current foundations"
  );
  const replay = workflow.indexOf(
    "Replay Day31 Plan A and B from exact adjusted checkpoint"
  );
  const immutableFreeze = workflow.indexOf(
    "bootstrap-historical-plan-a-observation-day.js"
  );
  const dispatch = workflow.indexOf(
    "Dispatch full Day31 publication while holding writer order"
  );

  assert.ok(adjustedBuild >= 0);
  assert.ok(sourceCommit > adjustedBuild);
  assert.ok(replay > sourceCommit);
  assert.ok(immutableFreeze > replay);
  assert.ok(dispatch > immutableFreeze);

  assert.match(workflow, /SOURCE_REF="\$\(git rev-parse HEAD\)"/u);
  assert.match(workflow, /assertValueFixtureUniverseParity/u);
  assert.match(workflow, /--source-ref="\$SOURCE_REF"/u);
  assert.match(workflow, /day31-source-bound-value-seed/u);
  assert.match(workflow, /-f dayKey=2026-08-31/u);
});

test("Day31 recovery preserves writer serialization", () => {
  assert.match(workflow, /group: ai-matchlab-data-writer/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(
    workflow,
    /Dispatch full Day31 publication while holding writer order/u
  );
});
