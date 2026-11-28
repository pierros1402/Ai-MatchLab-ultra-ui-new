import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { publishedSnapshotState } from "../jobs/run-intraday-snapshot-refresh.js";
import { canBootstrapIntradayPublication, resolveIntradayPublishedUniverse } from "../core/intraday-publication-universe.js";

const fixture = id => ({ canonicalId: id });
function decision(root, currentFixtures = [fixture("a")]) {
  const previous = publishedSnapshotState("2026-11-28", root);
  const lock = resolveIntradayPublishedUniverse({ ...previous, currentFixtures });
  return { previous, lock, bootstrap: canBootstrapIntradayPublication(previous, lock) };
}
function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "intraday-bootstrap-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("clean first-day publication bootstraps, then returns to the status-only lock", t => {
  const root = temporaryRoot(t);
  assert.equal(decision(root).bootstrap, true);
  fs.mkdirSync(path.join(root, "details"));
  assert.equal(decision(root).bootstrap, true);
  fs.writeFileSync(path.join(root, "fixtures.json"), JSON.stringify([fixture("a")]));
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify({ date: "2026-11-28" }));
  fs.writeFileSync(path.join(root, "details", "a.json"), "{}");
  const result = decision(root, [fixture("a"), fixture("b")]);
  assert.equal(result.bootstrap, false);
  assert.equal(result.lock.ok, true);
  assert.deepEqual(result.lock.allowedFixtureIds, ["a"]);
  assert.deepEqual(result.lock.deferredFixtureIds, ["b"]);
});

for (const name of ["fixtures.json", "manifest.json"]) {
  for (const content of ["", "{broken", "null", "[]", "{}"]) {
    test(`existing ${name} containing ${JSON.stringify(content)} never bootstraps`, t => {
      const root = temporaryRoot(t);
      fs.writeFileSync(path.join(root, name), content);
      const result = decision(root);
      assert.equal(result.previous.hasPublicationArtifacts, true);
      assert.equal(result.bootstrap, false);
      assert.equal(result.lock.ok, false);
    });
  }
}

test("orphan Details, ambiguous IDs and empty acquisition fail closed", t => {
  const root = temporaryRoot(t);
  assert.equal(decision(root, [fixture("a"), fixture("a")]).bootstrap, false);
  assert.equal(decision(root, [fixture("a"), {}]).bootstrap, false);
  assert.equal(decision(root, []).bootstrap, false);
  fs.mkdirSync(path.join(root, "details"));
  fs.writeFileSync(path.join(root, "details", "a.json"), "{broken");
  assert.equal(decision(root).bootstrap, false);
});
