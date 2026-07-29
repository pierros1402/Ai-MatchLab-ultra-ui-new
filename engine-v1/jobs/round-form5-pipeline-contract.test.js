import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function source(relative) {
  return fs.readFileSync(new URL(relative, import.meta.url), "utf8");
}

test("details builder exports leagueForm5 and display enrichment", () => {
  const text = source("./build-details-day.js");
  assert.match(text, /leagueForm5:\s*richBlocks\.leagueForm5/u);
  assert.match(text, /export function enrichFixtureRowsFromDisplaySnapshot/u);
  assert.match(text, /providerRound\.verified !== true/u);
  assert.match(text, /resolveDayFixtureRows\(dayKey\)/u);
});

test("deploy snapshot enriches only its existing fixture universe", () => {
  const text = source("./export-deploy-snapshot-day.js");
  assert.match(text, /enrichFixtureRowsFromDisplaySnapshot/u);
  assert.match(
    text,
    /const fixtures = enrichFixtureRowsFromDisplaySnapshot\([\s\S]*?fixturesSnapshot\.fixtures/u
  );
});

test("daily cycle builds provider display enrichment before details", () => {
  const text = source("./run-daily-cycle.js");
  const enrichment = text.indexOf("display-fixture-enrichment:start");
  const details = text.indexOf("details-build:start");
  assert.ok(enrichment >= 0);
  assert.ok(details > enrichment);
  assert.match(text, /await exportFixturesSnapshotDay\(dayKey\)/u);
});
