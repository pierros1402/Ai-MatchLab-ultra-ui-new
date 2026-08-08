import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function read(relativePath) {
  return fs
    .readFileSync(path.join(root, relativePath), "utf8")
    .replace(/\r\n/g, "\n");
}

function indexOfRequired(source, token) {
  const index = source.indexOf(token);

  assert.notEqual(
    index,
    -1,
    `missing required token: ${token}`
  );

  return index;
}

test(
  "daily cycle settles A, A2, B and B2 before comparison",
  () => {
    const source = read("engine-v1/jobs/run-daily-cycle.js");

    const planA = indexOfRequired(
      source,
      "`${label}-verified-final-results-plan-a`"
    );

    const loop = indexOfRequired(
      source,
      '["plan-a2.json", "plan-a2"]'
    );

    const comparison = indexOfRequired(
      source,
      "`${label}-value-plan-comparison`"
    );

    assert.ok(planA < loop);
    assert.ok(loop < comparison);

    for (const token of [
      '["plan-a2.json", "plan-a2"]',
      '["plan-b.json", "plan-b"]',
      '["plan-b2.json", "plan-b2"]'
    ]) {
      assert.ok(source.includes(token));
    }
  }
);

test(
  "intraday settlement processes all observation plans before comparison",
  () => {
    const source = read(
      ".github/workflows/intraday-deploy-snapshot-refresh.yml"
    );

    const planLoop = indexOfRequired(
      source,
      "for PLAN_FILE in plan-a2.json plan-b.json plan-b2.json; do"
    );

    const comparison = indexOfRequired(
      source,
      "node ./engine-v1/jobs/build-value-plan-comparison-day.js --date=\"$DAY_KEY\" --write"
    );

    assert.ok(planLoop < comparison);

    assert.ok(
      source.includes(
        'PLAN_PATH="data/value-plans/${DAY_KEY}/${PLAN_FILE}"'
      )
    );

    assert.ok(
      source.includes(
        'data/final-result-conflicts/${DAY_KEY}.json'
      ),
      "intraday must persist the per-match final-score conflict backlog"
    );
  }
);

test(
  "verified-final exporter isolates write-time score conflicts instead of aborting unrelated settlement",
  () => {
    const source = read(
      "engine-v1/jobs/export-verified-final-results-day.js"
    );

    for (const token of [
      "buildFinalScoreConflictBacklog",
      '"final-result-conflicts"',
      "resolveVerifiedFinalExportCompletion",
      "conflictsIsolated: completion.conflictsIsolated",
      "unresolvedScoreConflictNeverOverwritesVerifiedFinal: true"
    ]) {
      assert.ok(
        source.includes(token),
        `missing isolated-conflict contract: ${token}`
      );
    }
  }
);

test(
  "every production settlement workflow persists the final-score conflict backlog",
  () => {
    const dailyDeploy = read(
      ".github/workflows/daily-deploy-snapshot.yml"
    );
    const intraday = read(
      ".github/workflows/intraday-deploy-snapshot-refresh.yml"
    );
    const autonomous = read(
      ".github/workflows/daily-autonomous.yml"
    );

    assert.match(dailyDeploy, /data\/final-result-conflicts\//u);
    assert.match(intraday, /data\/final-result-conflicts\//u);
    assert.match(autonomous, /data\/final-result-conflicts\//u);
  }
);

test(
  "daily autonomous settlement processes all four plans",
  () => {
    const source = read(
      ".github/workflows/daily-autonomous.yml"
    );

    const planA = indexOfRequired(
      source,
      'export-verified-final-results-day.js --date="$YESTERDAY" --write'
    );

    const planLoop = indexOfRequired(
      source,
      "for PLAN_FILE in plan-a2.json plan-b.json plan-b2.json; do"
    );

    const comparison = indexOfRequired(
      source,
      'build-value-plan-comparison-day.js --date="$YESTERDAY" --write'
    );

    assert.ok(planA < planLoop);
    assert.ok(planLoop < comparison);
  }
);

test(
  "daily autonomous stages and permits A2/B2 settlement artifacts",
  () => {
    const source = read(
      ".github/workflows/daily-autonomous.yml"
    );

    for (const token of [
      '[ -d "data/value-plans/${YESTERDAY}" ] && git add "data/value-plans/${YESTERDAY}/"',
      "data/value-plans/${YESTERDAY}/",
      "data/value-plans/"
    ]) {
      assert.ok(
        source.includes(token),
        `missing autonomous staging contract: ${token}`
      );
    }
  }
);

test(
  "comparison rebuild remains after plan settlement in all paths",
  () => {
    const dailyCycle = read("engine-v1/jobs/run-daily-cycle.js");
    const intraday = read(
      ".github/workflows/intraday-deploy-snapshot-refresh.yml"
    );
    const autonomous = read(
      ".github/workflows/daily-autonomous.yml"
    );

    assert.ok(
      dailyCycle.indexOf('["plan-b2.json", "plan-b2"]') <
      dailyCycle.indexOf("`${label}-value-plan-comparison`")
    );

    assert.ok(
      intraday.indexOf(
        "for PLAN_FILE in plan-a2.json plan-b.json plan-b2.json; do"
      ) <
      intraday.indexOf(
        "build-value-plan-comparison-day.js --date=\"$DAY_KEY\" --write"
      )
    );

    assert.ok(
      autonomous.indexOf(
        "for PLAN_FILE in plan-a2.json plan-b.json plan-b2.json; do"
      ) <
      autonomous.indexOf(
        'build-value-plan-comparison-day.js --date="$YESTERDAY" --write'
      )
    );
  }
);
