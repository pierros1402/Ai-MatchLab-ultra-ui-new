import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildPlanAIdentityOverlay,
  planAIdentityOverlayRelativePath,
  sha256CanonicalValue,
  writePlanAIdentityOverlay,
} from "./p0c-plan-a-identity-migration.js";

function overlayStub() {
  return {
    resolveEvidenceFixtureMembership({
      repositoryFixtureId,
      canonicalFixtureIds,
    }) {
      const resolvedFixtureId = repositoryFixtureId === "suppressed"
        ? "retained"
        : repositoryFixtureId;
      const set = canonicalFixtureIds instanceof Set
        ? canonicalFixtureIds
        : new Set(canonicalFixtureIds);
      if (!set.has(resolvedFixtureId)) {
        return {
          ok: false,
          status: "RESOLVED_FIXTURE_NOT_IN_CANONICAL_UNIVERSE",
        };
      }
      return {
        ok: true,
        sourceFixtureId: repositoryFixtureId,
        resolvedFixtureId,
        sourceRole: repositoryFixtureId === "suppressed"
          ? "suppressed_lineage_alias"
          : "retained",
        managed: true,
      };
    },
  };
}

test("build creates additive identity overlay without mutating immutable plan", () => {
  const plan = {
    schema: "immutable-plan-a",
    picks: [
      { matchId: "suppressed", market: "Over 2.5", result: "WIN" },
      { matchId: "other", market: "Home", result: "LOSS" },
    ],
  };
  const before = JSON.stringify(plan);
  const artifact = buildPlanAIdentityOverlay({
    dayKey: "2026-08-01",
    immutablePlan: plan,
    canonicalFixtureIds: ["retained", "other"],
    overlay: overlayStub(),
  });

  assert.equal(artifact.pickCount, 2);
  assert.equal(artifact.changedFixtureIdCount, 1);
  assert.equal(artifact.entries[0].resolvedFixtureId, "retained");
  assert.equal(artifact.entries[0].market, "Over 2.5");
  assert.equal(artifact.source.immutable, true);
  assert.equal(artifact.source.rewritten, false);
  assert.equal(artifact.invariants.pickSettlementChanged, false);
  assert.equal(JSON.stringify(plan), before);
});

test("canonical hash is stable across object key order", () => {
  assert.equal(
    sha256CanonicalValue({ b: 2, a: 1 }),
    sha256CanonicalValue({ a: 1, b: 2 }),
  );
});

test("pick outside canonical membership fails closed", () => {
  assert.throws(
    () => buildPlanAIdentityOverlay({
      dayKey: "2026-08-01",
      immutablePlan: { picks: [{ matchId: "missing" }] },
      canonicalFixtureIds: ["retained"],
      overlay: overlayStub(),
    }),
    /p0c_plan_a_pick_identity_resolution_failed:0:/,
  );
});

test("versioned output path never replaces plan-a.json", () => {
  assert.equal(
    planAIdentityOverlayRelativePath("2026-08-01"),
    "data/value-plans/2026-08-01/plan-a.identity-overlay.v1.json",
  );
});

test("writer materializes overlay only and refuses implicit overwrite", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "aiml-p0c-plan-a-"),
  );
  const output = path.join(root, "plan-a.identity-overlay.v1.json");
  try {
    const artifact = buildPlanAIdentityOverlay({
      dayKey: "2026-08-01",
      immutablePlan: { picks: [{ matchId: "retained" }] },
      canonicalFixtureIds: ["retained"],
      overlay: overlayStub(),
    });
    const report = writePlanAIdentityOverlay({
      artifact,
      outputPath: output,
    });
    assert.equal(report.immutablePlanOverwriteAuthorized, false);
    assert.throws(
      () => writePlanAIdentityOverlay({ artifact, outputPath: output }),
      /p0c_plan_a_overlay_output_exists/,
    );
  }
  finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
