import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workflow =
  fs.readFileSync(
    new URL(
      "../../.github/workflows/intraday-deploy-snapshot-refresh.yml",
      import.meta.url
    ),
    "utf8"
  ).replace(
    /\r\n/gu,
    "\n"
  );

function requiredIndex(needle, fromIndex = 0) {
  const index =
    workflow.indexOf(
      needle,
      fromIndex
    );

  assert.notEqual(
    index,
    -1,
    "workflow contract missing: " + needle
  );

  return index;
}

test(
  "intraday ledger observes settlement foundation publication and final System Health before staging",
  () => {
    const settlement =
      requiredIndex(
        "- name: Refresh value plan comparison settlement"
      );

    const foundation =
      requiredIndex(
        "- name: Refresh and enforce intraday foundation health"
      );

    const stage =
      requiredIndex(
        "- name: Stage allowed generated files only"
      );

    const healthBuild =
      requiredIndex(
        'node ./engine-v1/jobs/build-system-health-alerts-day.js --date="${DAY_KEY}"',
        stage
      );

    const ledgerBuild =
      requiredIndex(
        'node ./engine-v1/jobs/build-day-truth-ledger-day.js --date="${DAY_KEY}" --write',
        stage
      );

    const ledgerStage =
      requiredIndex(
        'git add "data/day-truth-ledger/${DAY_KEY}.json"',
        stage
      );

    assert.ok(
      settlement < foundation,
      "settlement must precede final foundation health"
    );

    assert.ok(
      foundation < stage,
      "final foundation health must precede final staging"
    );

    assert.ok(
      stage < healthBuild,
      "System Health must be rebuilt inside the final staging transaction"
    );

    assert.ok(
      healthBuild < ledgerBuild,
      "ledger must observe final intraday System Health"
    );

    assert.ok(
      ledgerBuild < ledgerStage,
      "ledger must be built before it is staged"
    );
  }
);

test(
  "intraday uses exactly one fixed-path ledger writer and no failure-path writer",
  () => {
    const command =
      'node ./engine-v1/jobs/build-day-truth-ledger-day.js --date="${DAY_KEY}" --write';

    assert.equal(
      workflow.split(command).length - 1,
      1
    );

    assert.doesNotMatch(
      workflow,
      /build-day-truth-ledger-day\.js[^\n]*--output/u
    );

    const failureStep =
      requiredIndex(
        "- name: Persist intraday failure System Health"
      );

    const normalStage =
      requiredIndex(
        "- name: Stage allowed generated files only"
      );

    assert.ok(
      failureStep < normalStage,
      "failure health path remains separate from successful ledger publication"
    );
  }
);

test(
  "intraday ledger is staged and admitted by both staged-data boundaries",
  () => {
    assert.match(
      workflow,
      /git add "data\/day-truth-ledger\/\$\{DAY_KEY\}\.json"/u
    );

    assert.match(
      workflow,
      /Day Truth Ledger artifact missing for \$\{DAY_KEY\}/u
    );

    assert.ok(
      workflow.includes(
        "data/day-truth-ledger/${DAY_KEY}\\.json$"
      ),
      "exact-day guard must admit the ledger artifact"
    );

    assert.ok(
      workflow.includes(
        "data/day-truth-ledger/"
      ),
      "staged top-level classifier must recognize the ledger root"
    );
  }
);

test(
  "ledger is staged before material detection and therefore participates in commit gating",
  () => {
    const stage =
      requiredIndex(
        "- name: Stage allowed generated files only"
      );

    const ledgerStage =
      requiredIndex(
        'git add "data/day-truth-ledger/${DAY_KEY}.json"',
        stage
      );

    const detect =
      requiredIndex(
        "- name: Detect material intraday snapshot changes"
      );

    const stagedDiffGate =
      requiredIndex(
        '["diff", "--cached", "--quiet"]',
        detect
      );

    const commit =
      requiredIndex(
        "- name: Commit and push snapshot changes"
      );

    assert.ok(
      ledgerStage < detect,
      "ledger must be staged before material detection"
    );

    assert.ok(
      detect < stagedDiffGate,
      "material detection must inspect the staged set"
    );

    assert.ok(
      stagedDiffGate < commit,
      "staged ledger changes must be able to request the normal intraday commit"
    );
  }
);

test(
  "intraday integration never grants repair or arbitrary output authority",
  () => {
    assert.doesNotMatch(
      workflow,
      /day-truth-ledger[^\n]*(--repair|--output)/u
    );

    assert.equal(
      workflow.includes(
        "data/day-truth-ledger/${DAY_KEY}.json"
      ),
      true
    );
  }
);
