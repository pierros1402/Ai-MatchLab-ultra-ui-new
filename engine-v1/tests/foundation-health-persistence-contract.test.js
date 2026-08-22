import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dailyPath = ".github/workflows/daily-deploy-snapshot.yml";
const intradayPath = ".github/workflows/intraday-deploy-snapshot-refresh.yml";

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function section(text, start, end) {
  const a = text.indexOf(start);
  assert.notEqual(a, -1, `missing start marker: ${start}`);
  const b = text.indexOf(end, a + start.length);
  assert.notEqual(b, -1, `missing end marker: ${end}`);
  return text.slice(a, b);
}

test("daily persists source-bound derived foundations and foundation diagnostics", () => {
  const text = read(dailyPath);

  for (const required of [
    "git add data/history-index",
    "git add data/h2h",
    "git add data/h2h-foundation/current.json",
    "git add data/model-priors",
    `git add "data/foundation-integrity/${DAY_KEY}.json"`,
    `git add "data/foundation-integrity/latest.json"`
  ]) {
    assert.ok(text.includes(required), `missing daily persistence: ${required}`);
  }

  const truth = section(
    text,
    "--label=daily-deploy-truth",
    "Artifact freshness gate (self-heal, pre-publish)"
  );
  for (const required of [
    "data/history-index/",
    "data/h2h/",
    "data/h2h-foundation/",
    "data/model-priors/"
  ]) {
    assert.ok(truth.includes(required), `daily truth boundary missing ${required}`);
  }

  const publishStage = section(
    text,
    "Stage allowed snapshot files only",
    "Commit and push snapshot"
  );
  assert.ok(publishStage.includes("data/foundation-integrity/${DAY_KEY}.json"));
  assert.ok(publishStage.includes("data/foundation-integrity/latest.json"));
});

test("intraday public truth checkpoint never publishes a transient build report", () => {
  const text = read(intradayPath);
  const early = section(
    text,
    "Commit independent LIVE/FT snapshot checkpoint",
    "Promote independent LIVE/FT public checkpoint"
  );

  assert.equal(
    early.includes("data/build-reports/${DAY_KEY}.json"),
    false,
    "early LIVE/FT checkpoint must not stage/restore/allow build-report"
  );
});

test("intraday refresh gates foundation before final health publication", () => {
  const text = read(intradayPath);
  const foundationIndex = text.indexOf("Refresh and enforce intraday foundation health");
  const configureIndex = text.indexOf("- name: Configure git author");
  const stageIndex = text.indexOf("- name: Stage allowed generated files only");

  assert.ok(foundationIndex >= 0, "missing intraday foundation gate");
  assert.ok(configureIndex > foundationIndex, "foundation gate must precede configure/stage");
  assert.ok(stageIndex > configureIndex, "generated-file stage must follow foundation gate");

  const gate = section(
    text,
    "Refresh and enforce intraday foundation health",
    "- name: Configure git author"
  );
  assert.ok(gate.includes("build-foundation-integrity-report.js"));
  assert.ok(gate.includes("--gate"));
  assert.ok(gate.includes("build-day-report.js"));

  const stage = section(
    text,
    "Stage allowed generated files only",
    "Sync System Health GitHub issue"
  );
  assert.ok(stage.includes("data/foundation-integrity/${DAY_KEY}.json"));
  assert.ok(stage.includes("data/foundation-integrity/latest.json"));
  assert.ok(stage.includes("data/build-reports/${DAY_KEY}.json"));
  assert.ok(stage.includes("build-system-health-alerts-day.js"));
});

test("intraday failure health records foundation and build diagnostics coherently", () => {
  const text = read(intradayPath);
  const failure = section(
    text,
    "Persist intraday failure System Health",
    "Refresh and enforce snapshot invariant report"
  );

  const foundation = failure.indexOf("build-foundation-integrity-report.js");
  const build = failure.indexOf("build-day-report.js");
  const health = failure.indexOf("build-system-health-alerts-day.js");

  assert.ok(foundation >= 0);
  assert.ok(build > foundation);
  assert.ok(health > build);
  assert.ok(failure.includes("data/foundation-integrity/${DAY_KEY}.json"));
  assert.ok(failure.includes("data/build-reports/${DAY_KEY}.json"));
});

test("intraday health path never performs late model-foundation mutation", () => {
  const text = read(intradayPath);
  for (const forbidden of [
    "rebuild-indexes-for-season.js",
    "rebuild-h2h-foundation-from-current-history.js",
    "build-model-priors.js"
  ]) {
    assert.equal(text.includes(forbidden), false, `forbidden intraday foundation mutation: ${forbidden}`);
  }
});
