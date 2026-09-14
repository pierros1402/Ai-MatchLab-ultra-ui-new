import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  recoverHistoricalValueObservationsAtPaths,
  HISTORICAL_VALUE_OBSERVATION_RECOVERY_SOURCE
} from "./recover-historical-value-observations-day.js";
import {
  buildValueFixtureUniverse,
  valueFixtureUniverseContract
} from "../core/value-fixture-universe.js";

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function fixture(id, home, away, kickoff = "2026-09-13T12:00:00.000Z") {
  return {
    canonicalId: id,
    leagueSlug: "tst.1",
    homeTeam: home,
    awayTeam: away,
    kickoffUtc: kickoff
  };
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-historical-value-recovery-"));
  const day = "2026-09-13";
  const current = [
    fixture("cid_tst1_alpha_beta_20260913", "Alpha", "Beta"),
    fixture("cid_tst1_gamma_delta_20260913", "Gamma", "Delta", "2026-09-13T15:00:00.000Z")
  ];
  const historical = [
    ...current,
    fixture("cid_tst1_old_removed_20260913", "Old", "Removed", "2026-09-13T18:00:00.000Z")
  ];

  const snapshotValueFile = path.join(root, "snapshot", "value.json");
  const snapshotValueAuditFile = path.join(root, "snapshot", "value-audit.json");
  const snapshotValue = {
    date: day,
    source: "canonical_fixtures",
    count: 1,
    picks: [{
      matchId: current[0].canonicalId,
      leagueSlug: "tst.1",
      homeTeam: "Alpha",
      awayTeam: "Beta",
      market: "BTTS",
      pick: "Yes",
      score: 0.71
    }]
  };
  const historicalUniverse = valueFixtureUniverseContract(
    buildValueFixtureUniverse(day, { fixtures: historical })
  );
  const snapshotValueAudit = {
    ok: true,
    date: day,
    policyVersion: "statistical-value-policy-v2.3",
    source: "canonical_fixtures",
    planId: "plan-a",
    outputMode: "production",
    fixtureUniverse: historicalUniverse
  };
  writeJson(snapshotValueFile, snapshotValue);
  writeJson(snapshotValueAuditFile, snapshotValueAudit);

  const manifest = {
    ok: true,
    date: day,
    canonicalFixtureCount: current.length,
    publicationUniverse: {
      mode: "full_current_universe",
      currentFixtureCount: current.length,
      publishedFixtureCount: current.length,
      deferredFixtureCount: 0
    },
    counts: {
      fixtures: current.length,
      details: current.length,
      detailsMissingForFixtures: 0,
      valuePicks: 1
    },
    valueGate: {
      ok: true,
      mode: "frozen_snapshot",
      frozenIdentityBound: true,
      frozenReleaseSafe: true,
      frozenPickCount: 1,
      orphanPickCount: 0
    },
    fileHashes: {
      "value.json": sha256(snapshotValueFile),
      "value-audit.json": sha256(snapshotValueAuditFile)
    }
  };

  const plans = path.join(root, "value-plans", day);
  const paths = {
    planAObservationFile: path.join(plans, "plan-a.json"),
    planAObservationAuditFile: path.join(plans, "plan-a-audit.json"),
    planBFile: path.join(plans, "plan-b.json"),
    planBAuditFile: path.join(plans, "plan-b-audit.json"),
    planB2File: path.join(plans, "plan-b2.json"),
    planB2AuditFile: path.join(plans, "plan-b2-audit.json")
  };

  const args = {
    dayKey: day,
    currentAthensDay: "2026-09-14",
    canonicalFixtures: current,
    manifest,
    snapshotValue,
    snapshotValueAudit,
    snapshotValueFile,
    snapshotValueAuditFile,
    ...paths,
    recoveredAt: "2026-09-14T09:00:00.000Z"
  };

  return { root, day, current, historical, manifest, snapshotValue, snapshotValueAudit, paths, args };
}

function cleanup(ctx) {
  fs.rmSync(ctx.root, { recursive: true, force: true });
}

test("recovers authentic Plan A and writes only unavailable B/B2 sentinels", () => {
  const ctx = setup();
  try {
    const result = recoverHistoricalValueObservationsAtPaths(ctx.args);
    assert.equal(result.ok, true);
    assert.equal(result.alreadyRecovered, false);
    assert.equal(result.planAPicks, 1);
    assert.equal(result.authenticPlanAAssessmentUniverse.count, 3);
    assert.equal(result.recoveryUniverse.count, 2);
    assert.deepEqual(result.unavailablePlans, ["plan-b", "plan-b2"]);
    assert.equal(result.guarantees.retrospectivePlanAScoringUsed, false);
    assert.equal(result.guarantees.retrospectivePlanBScoringUsed, false);
    assert.equal(result.guarantees.retrospectivePlanB2ScoringUsed, false);
    assert.equal(result.guarantees.inventedHistoricalPicks, false);

    const planA = JSON.parse(fs.readFileSync(ctx.paths.planAObservationFile, "utf8"));
    assert.equal(planA.immutable, true);
    assert.equal(planA.count, 1);
    assert.deepEqual(planA.picks, ctx.snapshotValue.picks);
    assert.equal(planA.provenance.kind, "authentic_release_observation_recovery");
    assert.equal(planA.provenance.sourceAssessmentFixtureUniverseCount, 3);
    assert.equal(planA.provenance.retrospectivePredictionGeneration, false);

    for (const [planFile, auditFile, planId] of [
      [ctx.paths.planBFile, ctx.paths.planBAuditFile, "plan-b"],
      [ctx.paths.planB2File, ctx.paths.planB2AuditFile, "plan-b2"]
    ]) {
      const plan = JSON.parse(fs.readFileSync(planFile, "utf8"));
      const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
      assert.equal(plan.source, HISTORICAL_VALUE_OBSERVATION_RECOVERY_SOURCE);
      assert.equal(plan.planId, planId);
      assert.equal(plan.authenticObservationUnavailable, true);
      assert.equal(plan.frozen, true);
      assert.equal(plan.count, 0);
      assert.deepEqual(plan.picks, []);
      assert.equal(plan.sourceContract.fixtureUniverse.count, 2);
      assert.equal(plan.sourceContract.recoveryObservation, true);
      assert.equal(plan.sourceContract.retrospectiveModelOutputUsed, false);
      assert.equal(plan.recoveryContract.authenticPayloadRecovered, false);
      assert.equal(plan.recoveryContract.retrospectivePredictionGeneration, false);
      assert.equal(plan.recoveryContract.inventedHistoricalPicks, false);
      assert.equal(audit.membership.canonicalFixtures, 2);
      assert.equal(audit.membership.assessmentRows, 0);
      assert.equal(audit.membership.joinedMatches, 0);
      assert.equal(audit.membership.outputPicks, 0);
    }
  } finally {
    cleanup(ctx);
  }
});

test("exact rerun is idempotent and never rewrites recovered artifacts", () => {
  const ctx = setup();
  try {
    const first = recoverHistoricalValueObservationsAtPaths(ctx.args);
    assert.equal(first.ok, true);
    const before = Object.values(ctx.paths).map(file => [file, sha256(file)]);

    const second = recoverHistoricalValueObservationsAtPaths({
      ...ctx.args,
      recoveredAt: "2026-09-14T10:00:00.000Z"
    });
    assert.equal(second.ok, true);
    assert.equal(second.alreadyRecovered, true);
    for (const [file, hash] of before) assert.equal(sha256(file), hash);
  } finally {
    cleanup(ctx);
  }
});

test("refuses current or future day recovery", () => {
  const ctx = setup();
  try {
    const result = recoverHistoricalValueObservationsAtPaths({
      ...ctx.args,
      currentAthensDay: ctx.day
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "recovery_requires_past_day");
    for (const file of Object.values(ctx.paths)) assert.equal(fs.existsSync(file), false);
  } finally {
    cleanup(ctx);
  }
});

test("refuses release artifacts whose manifest hash does not match the authentic file", () => {
  const ctx = setup();
  try {
    const result = recoverHistoricalValueObservationsAtPaths({
      ...ctx.args,
      manifest: {
        ...ctx.manifest,
        fileHashes: {
          ...ctx.manifest.fileHashes,
          "value.json": "0".repeat(64)
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "authentic_release_file_hash_mismatch");
  } finally {
    cleanup(ctx);
  }
});

test("refuses unsafe frozen release membership", () => {
  const ctx = setup();
  try {
    const result = recoverHistoricalValueObservationsAtPaths({
      ...ctx.args,
      manifest: {
        ...ctx.manifest,
        valueGate: {
          ...ctx.manifest.valueGate,
          frozenReleaseSafe: false
        }
      }
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "manifest_frozen_plan_a_release_not_safe");
  } finally {
    cleanup(ctx);
  }
});

test("refuses partial pre-existing recovery state instead of overwriting", () => {
  const ctx = setup();
  try {
    writeJson(ctx.paths.planBFile, { stale: true });
    const result = recoverHistoricalValueObservationsAtPaths(ctx.args);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "partial_recovery_artifacts_exist_refusing_overwrite");
    assert.deepEqual(JSON.parse(fs.readFileSync(ctx.paths.planBFile, "utf8")), { stale: true });
  } finally {
    cleanup(ctx);
  }
});
