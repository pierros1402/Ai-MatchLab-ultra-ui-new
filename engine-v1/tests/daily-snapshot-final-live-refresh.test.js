import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow =
  fs.readFileSync(
    new URL(
      "../../.github/workflows/daily-deploy-snapshot.yml",
      import.meta.url
    ),
    "utf8"
  );

test(
  "daily snapshot refreshes authoritative live state before final export and Value",
  () => {
    const live =
      workflow.indexOf(
        "- name: Refresh final authoritative live status"
      );

    const details =
      workflow.indexOf(
        "- name: Rebuild details after final live refresh"
      );

    const exportStep =
      workflow.indexOf(
        "- name: Export deploy snapshot",
        live
      );

    const value =
      workflow.indexOf(
        "- name: Refresh value artifacts after final canonical snapshot"
      );

    assert.ok(live >= 0);
    assert.ok(details > live);
    assert.ok(exportStep > details);
    assert.ok(value > exportStep);

    assert.match(
      workflow,
      /run-live-status-refresh-day\.js "\$DAY_KEY"/
    );

    assert.match(
      workflow,
      /build-details-day\.js "\$DAY_KEY" --rebuild/
    );

    assert.match(
      workflow,
      /export-deploy-snapshot-day\.js "\$DAY_KEY"/
    );
  }
);
