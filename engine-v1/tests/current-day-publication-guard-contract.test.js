import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const guardWorkflow = fs
  .readFileSync(
    new URL("../../.github/workflows/current-day-publication-guard.yml", import.meta.url),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

const dailyWorkflow = fs
  .readFileSync(
    new URL("../../.github/workflows/daily-deploy-snapshot.yml", import.meta.url),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

const dailyCycle = fs
  .readFileSync(
    new URL("../jobs/run-daily-cycle.js", import.meta.url),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

test("current-day guard validates TODAY independently from latest pointer", () => {
  assert.match(
    guardWorkflow,
    /CURRENT_MANIFEST="data\/deploy-snapshots\/\$\{CALENDAR_DAY\}\/manifest\.json"/u
  );
  assert.match(
    guardWorkflow,
    /validateDeploySnapshotManifest\(manifest,day\)/u
  );
  assert.match(
    guardWorkflow,
    /if \[\[ "\$\{CURRENT_VALID\}" == "true" \]\]; then[\s\S]*?mode=healthy/u
  );
});

test("missing TODAY with latest on TOMORROW recovers by rerunning TOMORROW", () => {
  assert.match(
    guardWorkflow,
    /if \[\[ "\$\{LATEST_DAY\}" == "\$\{NEXT_DAY\}" \]\]; then\n\s+RECOVERY_DAY="\$\{NEXT_DAY\}"/u
  );
  assert.match(
    guardWorkflow,
    /current_missing_latest_next_day/u
  );
  assert.match(
    guardWorkflow,
    /actions\/workflows\/daily-deploy-snapshot\.yml\/dispatches/u
  );
});

test("existing Daily D-1 path can rebuild TODAY without backward latest promotion", () => {
  assert.match(
    dailyCycle,
    /exportDeploySnapshotDay\(finalizeDayKey, \{[\s\S]*?updateLatest: false,[\s\S]*?preserveValue: true/u
  );
  assert.match(
    dailyWorkflow,
    /for back in 1 2 3 4 5 6 7; do/u
  );
  assert.match(
    dailyWorkflow,
    /git add "data\/deploy-snapshots\/\$k\/"/u
  );
});

test("current-day guard never writes publication artifacts directly", () => {
  assert.doesNotMatch(guardWorkflow, /\bgit add\b/u);
  assert.doesNotMatch(guardWorkflow, /\bgit commit\b/u);
  assert.doesNotMatch(guardWorkflow, /promote-deploy-snapshot-latest-day/u);
});
