import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const here =
  path.dirname(
    fileURLToPath(import.meta.url)
  );

const root =
  path.resolve(
    here,
    "..",
    ".."
  );

const workflowFile =
  path.join(
    root,
    ".github",
    "workflows",
    "daily-deploy-snapshot.yml"
  );

function workflowText() {
  return fs.readFileSync(
    workflowFile,
    "utf8"
  );
}

function commandLines(
  text,
  needle
) {
  return text
    .split(/\r?\n/u)
    .filter(line =>
      line.includes(needle)
    );
}

function indexOfRequired(
  text,
  needle
) {
  const index =
    text.indexOf(needle);

  assert.notEqual(
    index,
    -1,
    `missing workflow anchor: ${needle}`
  );

  return index;
}

test(
  "all daily exporter and Value refresh calls are prepublication",
  () => {
    const text =
      workflowText();

    const exporters =
      commandLines(
        text,
        'export-deploy-snapshot-day.js "$DAY_KEY"'
      );

    const refreshes =
      commandLines(
        text,
        'refresh-value-artifacts-day.js --date="$DAY_KEY"'
      );

    assert.equal(
      exporters.length,
      5
    );

    assert.equal(
      refreshes.length,
      4
    );

    for (const line of exporters) {
      assert.match(
        line,
        /--no-update-latest/u
      );
    }

    for (const line of refreshes) {
      assert.match(
        line,
        /--no-update-latest/u
      );
    }

    assert.equal(
      commandLines(
        text,
        "--update-latest"
      ).length,
      0
    );
  }
);

test(
  "normal daily path synchronizes Details only after final Plan A authority",
  () => {
    const text =
      workflowText();

    const refresh =
      indexOfRequired(
        text,
        "- name: Refresh value artifacts after final canonical snapshot"
      );

    const recovery =
      indexOfRequired(
        text,
        "- name: Recover explicitly signed defective Plan A zero freeze"
      );

    const sync =
      indexOfRequired(
        text,
        "- name: Synchronize Details with Plan A publication authority"
      );

    const reexport =
      indexOfRequired(
        text,
        "- name: Re-export deploy snapshot from synchronized Details"
      );

    const mirror =
      indexOfRequired(
        text,
        "- name: Details Value mirror gate after Plan A freeze"
      );

    const planB =
      indexOfRequired(
        text,
        "- name: Enforce Value Plans B/B2 assessment input"
      );

    assert.ok(refresh < recovery);
    assert.ok(recovery < sync);
    assert.ok(sync < reexport);
    assert.ok(reexport < mirror);
    assert.ok(mirror < planB);

    assert.equal(
      commandLines(
        text,
        "verify-details-value-mirror-day.js"
      ).length,
      3
    );

    assert.equal(
      commandLines(
        text,
        "--replace-details --no-build-missing-details --fail-on-missing-details"
      ).length,
      3
    );
  }
);

test(
  "late self-heals return through the Details Value mirror gate",
  () => {
    const text =
      workflowText();

    const safeSequence =
      /build-details-day\.js "\$DAY_KEY" --rebuild[\s\S]*?export-deploy-snapshot-day\.js "\$DAY_KEY" --no-update-latest --replace-details --no-build-missing-details --fail-on-missing-details[\s\S]*?refresh-value-artifacts-day\.js --date="\$DAY_KEY" --no-update-latest[\s\S]*?verify-details-value-mirror-day\.js --date="\$DAY_KEY" --gate/gu;

    const matches =
      [...text.matchAll(safeSequence)];

    assert.ok(
      matches.length >= 2,
      `expected at least two safe late self-heal sequences, got ${matches.length}`
    );
  }
);

test(
  "latest promotion occurs only after the complete prepublish contract",
  () => {
    const text =
      workflowText();

    const report =
      indexOfRequired(
        text,
        "- name: Build day report"
      );

    const health =
      indexOfRequired(
        text,
        "- name: Build system health alert artifact"
      );

    const prepublish =
      indexOfRequired(
        text,
        "- name: Complete daily prepublish contract gate"
      );

    const promote =
      indexOfRequired(
        text,
        "- name: Promote deploy snapshot latest after prepublish gates"
      );

    const finalContract =
      indexOfRequired(
        text,
        "- name: Complete daily publish contract gate"
      );

    const stage =
      indexOfRequired(
        text,
        "- name: Stage allowed snapshot files only"
      );

    assert.ok(report < health);
    assert.ok(health < prepublish);
    assert.ok(prepublish < promote);
    assert.ok(promote < finalContract);
    assert.ok(finalContract < stage);

    assert.equal(
      commandLines(
        text,
        "verify-daily-publish-contract.js --date=\"$DAY_KEY\" --prepublish --gate"
      ).length,
      1
    );

    assert.equal(
      commandLines(
        text,
        "promote-deploy-snapshot-latest-day.js --date=\"$DAY_KEY\""
      ).length,
      1
    );
  }
);