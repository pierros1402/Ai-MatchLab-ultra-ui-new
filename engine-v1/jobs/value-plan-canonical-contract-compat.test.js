import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const files = [
  "build-value-plan-comparison-day.js",
  "build-day-report.js",
  "check-value-artifact-gate.js"
];

for (const file of files) {
  test(`${file} accepts structured canonical fixture-universe contracts`, () => {
    const source = fs.readFileSync(
      new URL(`./${file}`, import.meta.url),
      "utf8"
    );

    assert.match(
      source,
      /fixtureUniverse\?\.source\s*===\s*"canonical_fixtures"/u
    );

    assert.match(
      source,
      /fixtureUniverse\s*===\s*"canonical_fixtures"/u
    );
  });
}