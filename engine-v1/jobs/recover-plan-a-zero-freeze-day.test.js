import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ensurePlanAObservationAtPaths } from "../value/plan-a-observation.js";
import { recoverPlanAZeroFreezeAtPaths } from "./recover-plan-a-zero-freeze-day.js";

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-plan-a-recovery-"));
  return {
    dir,
    observationFile: path.join(dir, "plan-a.json"),
    auditFile: path.join(dir, "plan-a-audit.json"),
    archiveDir: path.join(dir, "recovery")
  };
}

function freeze(paths, picks) {
  return ensurePlanAObservationAtPaths({
    dayKey: "2026-08-08",
    sourcePayload: {
      ok: true,
      date: "2026-08-08",
      source: "canonical_fixtures",
      count: picks.length,
      picks
    },
    observationFile: paths.observationFile,
    auditFile: paths.auditFile,
    frozenAt: "2026-08-07T23:38:17.389Z"
  });
}

function candidate() {
  return {
    ok: true,
    date: "2026-08-08",
    source: "canonical_fixtures",
    count: 1,
    picks: [{ matchId: "m1", market: "OU25", pick: "Over 2.5" }]
  };
}

test("explicit signed recovery archives a defective zero freeze and replaces it", () => {
  const paths = fixture();
  const original = freeze(paths, []);
  assert.equal(original.ok, true);

  const result = recoverPlanAZeroFreezeAtPaths({
    dayKey: "2026-08-08",
    expectedObservationSignature: original.observationSignature,
    sourcePayload: candidate(),
    sourcePath: "data/value/2026-08-08.json",
    ...paths,
    recoveredAt: "2026-08-08T12:00:00.000Z"
  });

  assert.equal(result.ok, true);
  assert.equal(result.previousCount, 0);
  assert.equal(result.replacementCount, 1);
  assert.equal(fs.existsSync(result.observationArchive), true);
  assert.equal(fs.existsSync(result.auditArchive), true);

  const replaced = JSON.parse(fs.readFileSync(paths.observationFile, "utf8"));
  const archived = JSON.parse(fs.readFileSync(result.observationArchive, "utf8"));
  assert.equal(archived.count, 0);
  assert.equal(replaced.count, 1);
  assert.equal(replaced.immutable, true);
  assert.equal(replaced.provenance.kind, "defect_recovery");
  assert.equal(
    replaced.provenance.supersedesObservationSignature,
    original.observationSignature
  );
});

test("recovery rejects the wrong expected immutable signature without mutation", () => {
  const paths = fixture();
  const original = freeze(paths, []);
  const before = fs.readFileSync(paths.observationFile, "utf8");

  const result = recoverPlanAZeroFreezeAtPaths({
    dayKey: "2026-08-08",
    expectedObservationSignature: "f".repeat(64),
    sourcePayload: candidate(),
    ...paths
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "expected_observation_signature_mismatch");
  assert.equal(fs.readFileSync(paths.observationFile, "utf8"), before);
  assert.equal(fs.existsSync(paths.archiveDir), false);
  assert.equal(original.count, 0);
});

test("recovery cannot rewrite a legitimate nonzero frozen observation", () => {
  const paths = fixture();
  const original = freeze(paths, [{ matchId: "existing", market: "1X2", pick: "HOME" }]);

  const result = recoverPlanAZeroFreezeAtPaths({
    dayKey: "2026-08-08",
    expectedObservationSignature: original.observationSignature,
    sourcePayload: candidate(),
    ...paths
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "existing_observation_is_not_zero");
  assert.equal(fs.existsSync(paths.archiveDir), false);
});

test("recovery cannot replace a zero freeze with another zero result", () => {
  const paths = fixture();
  const original = freeze(paths, []);

  const result = recoverPlanAZeroFreezeAtPaths({
    dayKey: "2026-08-08",
    expectedObservationSignature: original.observationSignature,
    sourcePayload: { ok: true, date: "2026-08-08", count: 0, picks: [] },
    ...paths
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "recovery_candidate_has_no_picks");
  assert.equal(fs.existsSync(paths.archiveDir), false);
});
