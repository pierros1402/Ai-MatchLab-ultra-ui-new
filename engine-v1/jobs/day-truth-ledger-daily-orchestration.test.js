import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const workflow =
  fs.readFileSync(
    new URL(
      "../../.github/workflows/daily-deploy-snapshot.yml",
      import.meta.url
    ),
    "utf8"
  ).replace(
    /\r\n/gu,
    "\n"
  );

function requiredIndex(needle) {
  const index =
    workflow.indexOf(needle);

  assert.notEqual(
    index,
    -1,
    "workflow contract missing: " + needle
  );

  return index;
}

test(
  "daily release builds Day Truth Ledger after System Health and before prepublish contract",
  () => {
    const health =
      requiredIndex(
        "- name: Build system health alert artifact"
      );

    const ledger =
      requiredIndex(
        "- name: Build Day Truth Ledger control artifact"
      );

    const prepublish =
      requiredIndex(
        "- name: Complete daily prepublish contract gate"
      );

    const latestPromotion =
      requiredIndex(
        "- name: Promote deploy snapshot latest after prepublish gates"
      );

    assert.ok(
      health < ledger,
      "ledger must observe final System Health"
    );

    assert.ok(
      ledger < prepublish,
      "ledger must exist before the release contract"
    );

    assert.ok(
      prepublish < latestPromotion,
      "latest promotion must remain behind the prepublish gate"
    );
  }
);

test(
  "daily ledger integration uses only the fixed-path explicit writer",
  () => {
    const command =
      'node ./engine-v1/jobs/build-day-truth-ledger-day.js --date="$DAY_KEY" --write';

    assert.equal(
      workflow.split(command).length - 1,
      1
    );

    assert.doesNotMatch(
      workflow,
      /build-day-truth-ledger-day\.js[^\n]*--output/u
    );
  }
);

test(
  "daily release stages the ledger and includes it in both data boundary guards",
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
      "strict allowlist must admit only the exact DAY_KEY ledger artifact"
    );

    assert.ok(
      workflow.includes(
        "data/day-truth-ledger/"
      ),
      "disallowed-path scan must recognize the ledger root"
    );
  }
);

test(
  "Day Truth Ledger remains outside run-daily-cycle mutation authority",
  () => {
    const dailyCycle =
      fs.readFileSync(
        new URL(
          "./run-daily-cycle.js",
          import.meta.url
        ),
        "utf8"
      );

    assert.doesNotMatch(
      dailyCycle,
      /build-day-truth-ledger-day|day-truth-ledger-writer/u
    );
  }
);
