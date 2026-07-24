import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function read(file) {
  return fs.readFileSync(
    file,
    "utf8"
  );
}

test(
  "day report fails closed on stale exact-provider open fixtures",
  () => {
    const source = read(
      "engine-v1/jobs/build-day-report.js"
    );

    assert.match(
      source,
      /buildLiveStatusCompleteness/u
    );

    assert.match(
      source,
      /live_status_stale_open_exact_provider_ids:/u
    );
  }
);

test(
  "System Health exposes an explicit live-status completeness error",
  () => {
    const source = read(
      "engine-v1/jobs/build-system-health-alerts-day.js"
    );

    assert.match(
      source,
      /live-status-completeness/u
    );

    assert.match(
      source,
      /stale_open_exact_provider_ids/u
    );
  }
);

test(
  "daily D-2 through D-7 catch-up performs exact-provider live refresh",
  () => {
    const source = read(
      "engine-v1/jobs/run-daily-cycle.js"
    );

    assert.match(
      source,
      /reason:\s*"recent_day_catch_up"/u
    );

    const liveIndex =
      source.indexOf(
        "recent_day_catch_up"
      );

    const sweepIndex =
      source.indexOf(
        "applyResultsTruthToCanonicalDay(day)",
        liveIndex
      );

    assert.ok(liveIndex >= 0);
    assert.ok(sweepIndex > liveIndex);
  }
);
