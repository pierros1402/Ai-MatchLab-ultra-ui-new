import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { readFrozenPlanBObservation } from "./frozen-plan-b-observation.js";
import { deriveValueFromOdds } from "../jobs/derive-value-from-odds.js";

const dayKey = "2000-01-01";
const original = (outputMode = "plan-b-observation") => ({ok: true, date: dayKey, outputMode,
  count: 1, picks: [{canonicalId: "original-id", modelProb: 0.78}],
  sourceContract: {canonicalFixtureUniverseRequired: true, oddsMemoryCanCreateFixture: false,
    fixtureUniverse: {count: 1, hash: "original", canonicalIds: ["original-id"]}}});

function fixture(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "matchlab-frozen-b-"));
  const observationFile = path.join(dir, "observation.json"), auditFile = path.join(dir, "audit.json");
  fs.writeFileSync(observationFile, JSON.stringify(original()));
  fs.writeFileSync(auditFile, JSON.stringify({ok: true, date: dayKey}));
  try { fn({dayKey, outputMode: "plan-b-observation", observationFile, auditFile}); }
  finally {
    // Only the two files in this exact newly created fixture are removed.
    for (const file of [observationFile, auditFile]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
}

test("closed-day B and B2 return the original before reading a changed or missing canonical universe", () => {
  for (const outputMode of ["plan-b-observation", "plan-b2-observation"]) {
    const frozen = original(outputMode);
    let reads = 0;
    assert.equal(deriveValueFromOdds(dayKey, {outputMode, freeze: false,
      readFrozenObservation: () => { reads++; return frozen; }}), frozen);
    assert.equal(reads, 1);
  }
});
test("missing historical observation cannot be rebuilt from current model inputs", () => {
  assert.throws(() => deriveValueFromOdds(dayKey, {outputMode: "plan-b-observation",
    readFrozenObservation: () => null}), /missing_historical_plan_b_observation/);
});
test("a valid original pair is returned without changing either file", () => fixture(options => {
  const before = [options.observationFile, options.auditFile].map(file => fs.readFileSync(file));
  assert.deepEqual(readFrozenPlanBObservation(options), original());
  [options.observationFile, options.auditFile].forEach((file,i) => assert.deepEqual(fs.readFileSync(file), before[i]));
}));
test("partial or corrupt original pairs fail closed and retain their bytes", () => fixture(options => {
  fs.unlinkSync(options.auditFile);
  assert.throws(() => readFrozenPlanBObservation(options), /invalid_frozen_plan_b_observation_preserved/);
  fs.writeFileSync(options.auditFile, "broken original audit");
  assert.throws(() => readFrozenPlanBObservation(options), /invalid_frozen_plan_b_observation_preserved/);
  assert.equal(fs.readFileSync(options.auditFile, "utf8"), "broken original audit");
}));
test("wrong day, count, mode and missing numeric count cannot impersonate a frozen zero", () => fixture(options => {
  for (const mutation of [{date: "2000-01-02"}, {count: 0}, {outputMode: "production"}, {count: null, picks: []}]) {
    fs.writeFileSync(options.observationFile, JSON.stringify({...original(), ...mutation}));
    assert.throws(() => readFrozenPlanBObservation(options), /invalid_frozen_plan_b_observation_preserved/);
  }
}));
