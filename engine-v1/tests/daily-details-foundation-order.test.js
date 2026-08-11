import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(
  new URL(
    "../../.github/workflows/daily-deploy-snapshot.yml",
    import.meta.url,
  ),
  "utf8",
).replace(/\r\n/g, "\n");

test("daily workflow ensures the target-season history index before the daily cycle builds details", () => {
  const priorSettlementIndex = workflow.indexOf(
    "- name: Promote prior Value settlement checkpoint",
  );
  const foundationIndex = workflow.indexOf(
    "- name: Ensure details history-index foundation",
  );
  const dailyCycleIndex = workflow.indexOf(
    "- name: Run daily cycle",
  );

  assert.ok(priorSettlementIndex >= 0);
  assert.ok(foundationIndex > priorSettlementIndex);
  assert.ok(dailyCycleIndex > foundationIndex);
  assert.match(
    workflow,
    /node \.\/engine-v1\/jobs\/ensure-details-history-index-foundation-day\.js "\$DAY_KEY"/,
  );
  assert.match(
    workflow,
    /node \.\/engine-v1\/jobs\/run-daily-cycle\.js "\$DAY_KEY"/,
  );
});
