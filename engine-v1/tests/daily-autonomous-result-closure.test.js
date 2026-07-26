import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs
  .readFileSync(
    new URL(
      "../../.github/workflows/daily-autonomous.yml",
      import.meta.url
    ),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

test("daily autonomous closes yesterday results before verification", () => {
  const runDayIndex =
    workflow.indexOf(
      'node ./engine-v1/jobs/run-day.js "$DAY_KEY"'
    );

  const closureIndex =
    workflow.indexOf(
      'export-verified-final-results-day.js --date="$YESTERDAY" --write --all-fixtures'
    );

  const verifyIndex =
    workflow.indexOf(
      'verify-results-day.js "$YESTERDAY"'
    );

  const reportIndex =
    workflow.indexOf(
      'verify-results-day.js --report "$YESTERDAY"'
    );

  assert.ok(runDayIndex >= 0, "run-day step missing");
  assert.ok(closureIndex >= 0, "all-fixtures closure step missing");
  assert.ok(verifyIndex >= 0, "fresh verification step missing");
  assert.ok(reportIndex >= 0, "verification report step missing");

  assert.ok(runDayIndex < closureIndex);
  assert.ok(closureIndex < verifyIndex);
  assert.ok(verifyIndex < reportIndex);
});

test("daily autonomous rebuilds settlement after result closure", () => {
  assert.match(
    workflow,
    /build-value-plan-comparison-day\.js --date="\$YESTERDAY" --write/
  );
});

test("daily autonomous preserves closure artifacts when verification still has gaps", () => {
  assert.match(
    workflow,
    /\[ -d "data\/final-results\/\$\{YESTERDAY\}" \] && git add "data\/final-results\/\$\{YESTERDAY\}"/
  );

  assert.match(
    workflow,
    /\[ -f "data\/value-comparison\/\$\{YESTERDAY\}\.json" \] && git add "data\/value-comparison\/\$\{YESTERDAY\}\.json"/
  );
});


test("daily autonomous applies results truth before final export and verification", () => {
  const apply =
    workflow.indexOf(
      'apply-results-truth-to-canonical-day.js "$YESTERDAY"'
    );

  const exportFinal =
    workflow.indexOf(
      'export-verified-final-results-day.js --date="$YESTERDAY" --write --all-fixtures'
    );

  const verify =
    workflow.indexOf(
      'verify-results-day.js "$YESTERDAY"'
    );

  const comparison =
    workflow.indexOf(
      'build-value-plan-comparison-day.js --date="$YESTERDAY" --write'
    );

  assert.ok(apply >= 0);
  assert.ok(exportFinal > apply);
  assert.ok(verify > exportFinal);
  assert.ok(comparison > verify);
});

test("daily autonomous stages canonical closure artifacts", () => {
  assert.match(
    workflow,
    /data\/canonical-fixtures\/\$\{YESTERDAY\}/u
  );
});
