import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/plan-c-shadow-daily.yml", "utf8");
const syncTool = fs.readFileSync("tools/sync-public-plan-c-shadow.sh", "utf8");

test("Plan C has an independent daily shadow-only publication path", () => {
  assert.match(workflow, /cron: "30 4 \* \* \*"/u);
  assert.match(workflow, /group: ai-matchlab-data-writer/u);
  assert.match(workflow, /refresh-clubelo-shadow-registry\.js/u);
  assert.match(workflow, /generate-plan-c-shadow-predictions\.js/u);
  assert.match(workflow, /settle-plan-c-shadow\.js/u);
  assert.match(workflow, /build-plan-c-shadow-day\.js/u);
  assert.match(workflow, /--allow="\^data\/plan-c-shadow\/"/u);
  assert.doesNotMatch(workflow, /deploy-snapshots\/latest\.json/u);
  assert.doesNotMatch(workflow, /value-plans/u);
  assert.match(workflow, /sync-public-plan-c-shadow\.sh/u);
});

test("public shadow sync is commit-pinned and verifies the non-production endpoint", () => {
  assert.match(syncTool, /immutable 40-hex Git ref required/u);
  assert.match(syncTool, /\/ops\/sync-plan-c-shadow\?date=/u);
  assert.match(syncTool, /productionEligible!==false/u);
  assert.match(syncTool, /\/plan-c-shadow\?date=/u);
});
