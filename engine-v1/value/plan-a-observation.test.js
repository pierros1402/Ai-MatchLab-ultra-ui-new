import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ensurePlanAObservationAtPaths,
  isPlanAObservationDay,
  PLAN_A_OBSERVATION_SCHEMA
} from "./plan-a-observation.js";

function tempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-a-"));
  return {
    dir,
    observationFile: path.join(dir, "plan-a.json"),
    auditFile: path.join(dir, "plan-a-audit.json")
  };
}

test("trial period starts on 2026-07-05", () => {
  assert.equal(isPlanAObservationDay("2026-07-04"), false);
  assert.equal(isPlanAObservationDay("2026-07-05"), true);
  assert.equal(isPlanAObservationDay("2026-07-16"), true);
});

test("creates one immutable Plan A observation", () => {
  const paths = tempPaths();
  const source = {
    ok: true,
    date: "2026-07-05",
    source: "canonical_fixtures",
    count: 1,
    picks: [{ matchId: "m1", market: "OU25", pick: "Over 2.5" }]
  };

  const result = ensurePlanAObservationAtPaths({
    dayKey: "2026-07-05",
    sourcePayload: source,
    sourcePath: "data/deploy-snapshots/2026-07-05/value.json",
    observationFile: paths.observationFile,
    auditFile: paths.auditFile,
    frozenAt: "2026-07-05T10:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.created, true);
  const saved = JSON.parse(fs.readFileSync(paths.observationFile, "utf8"));
  assert.equal(saved.schema, PLAN_A_OBSERVATION_SCHEMA);
  assert.equal(saved.immutable, true);
  assert.equal(saved.count, 1);
  assert.equal(saved.picks[0].matchId, "m1");
  assert.equal(fs.existsSync(paths.auditFile), true);
});

test("preserves frozen observation when a later rebuild changes picks", () => {
  const paths = tempPaths();
  const first = {
    ok: true,
    date: "2026-07-06",
    source: "canonical_fixtures",
    count: 1,
    picks: [{ matchId: "m1", market: "OU25", pick: "Over 2.5" }]
  };
  const later = {
    ok: true,
    date: "2026-07-06",
    source: "canonical_fixtures",
    count: 0,
    picks: []
  };

  const created = ensurePlanAObservationAtPaths({
    dayKey: "2026-07-06",
    sourcePayload: first,
    observationFile: paths.observationFile,
    auditFile: paths.auditFile,
    frozenAt: "2026-07-06T10:00:00.000Z"
  });
  const preserved = ensurePlanAObservationAtPaths({
    dayKey: "2026-07-06",
    sourcePayload: later,
    observationFile: paths.observationFile,
    auditFile: paths.auditFile,
    frozenAt: "2026-07-14T10:00:00.000Z"
  });

  assert.equal(created.created, true);
  assert.equal(preserved.ok, true);
  assert.equal(preserved.created, false);
  assert.equal(preserved.preservedExisting, true);
  assert.equal(preserved.conflict, true);
  assert.equal(preserved.reason, "plan_a_observation_conflict_preserved");

  const saved = JSON.parse(fs.readFileSync(paths.observationFile, "utf8"));
  assert.equal(saved.count, 1);
  assert.equal(saved.picks[0].matchId, "m1");
});


test("rejects an immutable observation with no signature", () => {
  const paths = tempPaths();
  fs.writeFileSync(paths.observationFile, JSON.stringify({
    ok: true,
    schema: PLAN_A_OBSERVATION_SCHEMA,
    date: "2026-07-07",
    immutable: true,
    count: 0,
    picks: []
  }), "utf8");

  const result = ensurePlanAObservationAtPaths({
    dayKey: "2026-07-07",
    sourcePayload: { ok: true, date: "2026-07-07", count: 0, picks: [] },
    observationFile: paths.observationFile,
    auditFile: paths.auditFile
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "plan_a_observation_signature_missing_or_invalid");
});

test("rejects pick tampering when the frozen signature no longer matches", () => {
  const paths = tempPaths();
  const source = {
    ok: true,
    date: "2026-07-08",
    count: 1,
    picks: [{ matchId: "m1", market: "OU25", pick: "Over 2.5" }]
  };

  const created = ensurePlanAObservationAtPaths({
    dayKey: "2026-07-08",
    sourcePayload: source,
    observationFile: paths.observationFile,
    auditFile: paths.auditFile,
    frozenAt: "2026-07-08T10:00:00.000Z"
  });
  assert.equal(created.ok, true);

  const saved = JSON.parse(fs.readFileSync(paths.observationFile, "utf8"));
  saved.picks[0].matchId = "tampered";
  fs.writeFileSync(paths.observationFile, JSON.stringify(saved), "utf8");

  const result = ensurePlanAObservationAtPaths({
    dayKey: "2026-07-08",
    sourcePayload: source,
    observationFile: paths.observationFile,
    auditFile: paths.auditFile
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "plan_a_observation_signature_mismatch");
});

test("rejects a stale or modified observation audit", () => {
  const paths = tempPaths();
  const source = {
    ok: true,
    date: "2026-07-09",
    count: 0,
    picks: []
  };

  const created = ensurePlanAObservationAtPaths({
    dayKey: "2026-07-09",
    sourcePayload: source,
    observationFile: paths.observationFile,
    auditFile: paths.auditFile,
    frozenAt: "2026-07-09T10:00:00.000Z"
  });
  assert.equal(created.ok, true);

  const audit = JSON.parse(fs.readFileSync(paths.auditFile, "utf8"));
  audit.count = 99;
  fs.writeFileSync(paths.auditFile, JSON.stringify(audit), "utf8");

  const result = ensurePlanAObservationAtPaths({
    dayKey: "2026-07-09",
    sourcePayload: source,
    observationFile: paths.observationFile,
    auditFile: paths.auditFile
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "plan_a_observation_audit_mismatch");
  assert.equal(result.field, "count");
});
