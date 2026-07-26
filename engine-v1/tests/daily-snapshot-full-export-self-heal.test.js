import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs
  .readFileSync(
    new URL(
      "../../.github/workflows/daily-deploy-snapshot.yml",
      import.meta.url
    ),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

test(
  "daily Value refresh automatically performs a full export and retries on canonical coverage drift",
  () => {
    const step = workflow.match(
      /- name: Refresh value artifacts after final canonical snapshot[\s\S]*?(?=\n      - name:)/
    )?.[0];

    assert.ok(
      step,
      "daily final Value refresh step is missing"
    );

    assert.match(
      step,
      /refresh-value-artifacts-day\.js --date="\$DAY_KEY"/
    );

    assert.match(
      step,
      /snapshot_fixtures_missing_canonical_rows_full_export_required/
    );

    assert.match(
      step,
      /build-details-day\.js "\$DAY_KEY" --rebuild/
    );

    assert.match(
      step,
      /export-deploy-snapshot-day\.js "\$DAY_KEY"/
    );

    const refreshCalls =
      step.match(
        /refresh-value-artifacts-day\.js --date="\$DAY_KEY"/g
      ) || [];

    assert.equal(
      refreshCalls.length,
      2,
      "Value refresh must run once, self-heal with a full export, then retry once"
    );
  }
);

test(
  "daily self-heal fails closed for any Value error other than the explicit full-export requirement",
  () => {
    const step = workflow.match(
      /- name: Refresh value artifacts after final canonical snapshot[\s\S]*?(?=\n      - name:)/
    )?.[0];

    assert.ok(step);

    assert.match(
      step,
      /FULL_EXPORT_REQUIRED/
    );

    assert.match(
      step,
      /exit "\$REFRESH_STATUS"/
    );

    assert.match(
      step,
      /if \[ "\$FULL_EXPORT_REQUIRED" != "true" \]/
    );
  }
);
