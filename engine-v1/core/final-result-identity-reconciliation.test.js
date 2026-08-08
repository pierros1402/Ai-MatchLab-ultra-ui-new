import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { reconcileFinalResultIdentityAliasesDay } from "./final-result-identity-reconciliation.js";

function resolver() {
  return {
    resolveFixtureId(id) {
      if (id === "drop-id") return {
        ok: true,
        sourceRole: "suppressed_lineage_alias",
        resolvedFixtureId: "keep-id",
        fixtureRetentionDecisionId: "decision-1",
        homeGlobalClubId: "gcid-home",
        awayGlobalClubId: "gcid-away",
      };
      if (id === "keep-id") return {
        ok: true,
        sourceRole: "retained",
        resolvedFixtureId: "keep-id",
        fixtureRetentionDecisionId: "decision-1",
        homeGlobalClubId: "gcid-home",
        awayGlobalClubId: "gcid-away",
      };
      return { ok: false, status: "UNKNOWN_FIXTURE_ID" };
    },
  };
}

function final(matchId, scoreHome = 0, scoreAway = 2, provider = "espn") {
  return {
    schema: "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth: true,
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    matchId,
    scoreHome,
    scoreAway,
    homeScore: scoreHome,
    awayScore: scoreAway,
    scoreKey: `${scoreHome}-${scoreAway}`,
    source: `${provider}_verified_final`,
    sources: [{ provider, providerMatchId: `${provider}-123` }],
    sourceCount: 1,
    independentSourceCount: 1,
  };
}

function setup(retainedScore = [0, 2]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-final-id-reconcile-"));
  const day = path.join(root, "2026-08-08");
  fs.mkdirSync(day, { recursive: true });
  fs.writeFileSync(path.join(day, "drop-id.json"), JSON.stringify(final("drop-id", 0, 2, "flashscore")));
  fs.writeFileSync(
    path.join(day, "keep-id.json"),
    JSON.stringify(final("keep-id", retainedScore[0], retainedScore[1], "espn")),
  );
  return { root, day };
}

test("verified duplicate final is reconciled without score loss and alias evidence is preserved", () => {
  const { root, day } = setup();
  const result = reconcileFinalResultIdentityAliasesDay("2026-08-08", {
    finalResultsRoot: root,
    resolver: resolver(),
    write: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reconciled.length, 1);
  assert.equal(fs.existsSync(path.join(day, "drop-id.json")), false);
  const retained = JSON.parse(fs.readFileSync(path.join(day, "keep-id.json"), "utf8"));
  assert.equal(retained.scoreHome, 0);
  assert.equal(retained.scoreAway, 2);
  assert.equal(retained.productionIdentityReconciliation.scoreTruthChanged, false);
  assert.equal(
    retained.productionIdentityReconciliation.suppressedArtifacts[0].sources[0].provider,
    "flashscore",
  );
});

test("conflicting verified scores fail closed and neither file is changed", () => {
  const { root, day } = setup([1, 2]);
  const beforeDrop = fs.readFileSync(path.join(day, "drop-id.json"), "utf8");
  const beforeKeep = fs.readFileSync(path.join(day, "keep-id.json"), "utf8");
  const result = reconcileFinalResultIdentityAliasesDay("2026-08-08", {
    finalResultsRoot: root,
    resolver: resolver(),
    write: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.blocked[0].reason, "VERIFIED_FINAL_TRUTH_CONFLICT");
  assert.equal(fs.readFileSync(path.join(day, "drop-id.json"), "utf8"), beforeDrop);
  assert.equal(fs.readFileSync(path.join(day, "keep-id.json"), "utf8"), beforeKeep);
});
