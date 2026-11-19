import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

test("Flashscore routing, canonical membership and snapshot publication", async t => {
  const repo = fileURLToPath(new URL("../../", import.meta.url));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "value-routing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.cpSync(path.join(repo, "engine-v1"), path.join(root, "engine-v1"), {
    recursive: true, filter: name => path.basename(name) !== "node_modules"
  });
  fs.cpSync(path.join(repo, "node_modules"), path.join(root, "node_modules"), { recursive: true });
  fs.cpSync(path.join(repo, "workers/_shared"), path.join(root, "workers/_shared"), { recursive: true });
  fs.copyFileSync(path.join(repo, "package.json"), path.join(root, "package.json"));
  fs.cpSync(path.join(repo, "data/identity-decisions"), path.join(root, "data/identity-decisions"), { recursive: true });
  fs.cpSync(path.join(repo, "data/team-aliases"), path.join(root, "data/team-aliases"), { recursive: true });
  const load = name => import(pathToFileURL(path.join(root, "engine-v1", name)));
  const day = "2026-11-15";
  const slug = "uefa.nations";
  const fixtureFile = path.join("data", "canonical-fixtures", day, slug + ".json");
  const fixture = JSON.parse(fs.readFileSync(path.join(repo, fixtureFile))).fixtures.find(
    row => row.canonicalId === "cid_uefanations_cyprus_montenegro_20261115"
  );
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data));
  };
  write(path.join(root, fixtureFile), { fixtures: [fixture] });
  write(path.join(root, "data/fixtures.json"), { fixtures: [fixture] });
  const { runOddsOpening } = await load("jobs/run-odds-opening.js");
  const { parseFlashscoreFeed } = await load("odds/flashscore-fixtures-source.js");
  const { exportOddsSnapshotDay, snapshotRegressionReason } = await load("jobs/export-odds-snapshot-day.js");
  const { recordOddsSnapshot } = await load("storage/odds-memory-db.js");
  const { canonicalFixturesForDay } = await load("core/day-fixture-universe.js");
  const { assessPublicationIdentity } = await load("core/assessment-publication-identity.js");
  const legacy = { ...fixture, canonicalId: "legacy-approved", aiAssessment: { markets: { test: {} } } };
  const approved = { ...fixture, canonicalAliases: [legacy.canonicalId] };
  assert.equal(assessPublicationIdentity(legacy, [approved]).status, "publish");
  assert.equal(assessPublicationIdentity(legacy, [fixture]).status, "hold");
  assert.equal(assessPublicationIdentity({ ...legacy, providerIds: {} }, [approved]).status, "quarantine");
  assert.equal(assessPublicationIdentity({ ...legacy, kickoffUtc: "2026-01-01T00:00Z" }, [approved]).status, "hold");
  assert.equal(assessPublicationIdentity(legacy, [approved, { ...approved, canonicalId: "another", providerIds: {} }]).status, "hold");
  const fields = (label, region, route, id) =>
    `ZA÷${label}¬ZY÷${region}¬ZL÷${route}~AA÷${id}¬AE÷Cyprus¬AF÷Montenegro¬AD÷${Date.parse(fixture.kickoffUtc)/1000}`;
  const rows = parseFlashscoreFeed([
    fields("CONCACAF Nations League", "Europe", "/football/europe/uefa-nations-league/", "conflict"),
    fields("Nations League", "Europe", "", "ambiguous"),
    fields("UEFA Nations League", "Europe", "/football/europe/uefa-nations-league/", fixture.providerIds.flashscore)
  ].join("~"));
  const odds = { home: 2.3, draw: 3, away: 3.1 };
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse(day + "T08:00Z") });
  await runOddsOpening({
    fetchFixtures: async () => ({ rows, attempts: [] }),
    fetchMarket: async () => ({ rows: [{ home: "Cyprus", away: "Montenegro", odds, provider: "test", book: "book" }] }),
    fetchReferees: async () => new Map()
  });
  const memory = path.join(root, "data/odds-memory");
  assert.deepEqual(fs.readdirSync(memory), [fixture.canonicalId + ".json"]);
  const recovered = JSON.parse(fs.readFileSync(path.join(memory, fixture.canonicalId + ".json")));
  assert.equal(recovered.providerIds.flashscore, fixture.providerIds.flashscore);
  assert.ok(JSON.parse(fs.readFileSync(path.join(root, "data/fixtures.json"))).fixtures[0].aiAssessment);
  recordOddsSnapshot("orphan", { ...recovered, canonicalId: "orphan", providerIds: { flashscore: "unbound" } }, { markets: { "1X2": { odds } } });
  const result = exportOddsSnapshotDay(day);
  assert.equal(result.changed, true);
  const read = () => fs.readFileSync(result.file);
  const before = read();
  const { matches, assessmentOwnership } = JSON.parse(before);
  assert.equal(assessmentOwnership.certifiedAssessmentRows, 1);
  const orphan = matches.find(row => row.canonicalId === "orphan");
  assert.equal(orphan.aiAssessment, null);
  assert.deepEqual(orphan.market.current, odds);
  const certified = matches.find(row => row.canonicalId === fixture.canonicalId);
  assert.ok(certified.aiAssessment);
  assert.deepEqual(certified.market.current, odds);
  assert.equal(exportOddsSnapshotDay(day).changed, false);
  const canonical = canonicalFixturesForDay(day);
  assert.equal(snapshotRegressionReason([certified], [orphan], canonical), "assessment_coverage_regression");
  assert.equal(snapshotRegressionReason([{ ...certified, providerIds: {} }], [orphan], canonical), null);

  recordOddsSnapshot(fixture.canonicalId, recovered, { markets: { "1X2": { odds: { ...odds, draw: 3.2 } } } });
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => {
      if (to === result.file) throw new Error("injected snapshot rename failure");
      return rename(from, to);
    };
    assert.throws(() => exportOddsSnapshotDay(day), /injected snapshot rename failure/);
  } finally { fs.renameSync = rename; }
  assert.deepEqual(read(), before);
  assert.deepEqual(fs.readdirSync(path.dirname(result.file)), ["odds.json"]);
  recordOddsSnapshot(fixture.canonicalId, { ...recovered, providerIds: { flashscore: "contradiction" } }, {});
  assert.equal(exportOddsSnapshotDay(day).ok, false);
  assert.deepEqual(read(), before);
  recordOddsSnapshot(fixture.canonicalId, recovered, {});
  fs.writeFileSync(result.file, "null");
  assert.throws(() => exportOddsSnapshotDay(day), /invalid_existing_odds_snapshot/);
  assert.equal(read().toString(), "null");
});
