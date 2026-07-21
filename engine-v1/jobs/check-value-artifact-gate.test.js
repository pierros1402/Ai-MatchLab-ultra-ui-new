import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { checkValueArtifactGate } from "./check-value-artifact-gate.js";
import { resolveDataPath } from "../storage/data-root.js";

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function setupDay(dayKey, { sourceContract, membership }) {
  const snapshotDir = resolveDataPath("deploy-snapshots", dayKey);
  const planDir = resolveDataPath("value-plans", dayKey);

  writeJson(path.join(snapshotDir, "manifest.json"), {
    counts: { fixtures: 1 },
    valueGate: {
      fixtures: 1,
      valuePicks: 1,
      valueSource: "canonical_fixtures",
      ok: true,
      valueFreshAgainstCanonical: true
    }
  });

  writeJson(path.join(planDir, "plan-b.json"), {
    ok: true,
    date: dayKey,
    count: 1,
    sourceContract,
    picks: [
      {
        canonicalId: "cid_test",
        matchId: "cid_test",
        market: "OU25",
        pick: "over"
      }
    ]
  });

  writeJson(path.join(planDir, "plan-b-audit.json"), {
    date: dayKey,
    sourceContract,
    membership
  });

  return () => {
    fs.rmSync(snapshotDir, { recursive: true, force: true });
    fs.rmSync(planDir, { recursive: true, force: true });
  };
}

const canonicalContract = {
  valueInput: "canonical_fixture_universe_joined_with_odds_memory_ai_assessment",
  fixtureUniverse: "canonical_fixtures",
  canonicalFixtureUniverseRequired: true,
  exactIdentityJoinOnly: true,
  oddsMemoryCanCreateFixture: false,
  deploySnapshotInput: false,
  realBookmakerOddsUsed: false
};

test("value gate rejects a populated Plan B artifact without the canonical membership contract", t => {
  const dayKey = "2099-01-01";
  const cleanup = setupDay(dayKey, {
    sourceContract: {
      valueInput: "odds_memory_ai_assessment",
      deploySnapshotInput: false,
      realBookmakerOddsUsed: false
    },
    membership: {}
  });
  t.after(cleanup);

  const result = checkValueArtifactGate(dayKey);
  assert.equal(result.ok, false);
  assert.equal(result.code, 2);
  assert.equal(result.reason, "plan_b_canonical_membership_contract_missing");
});

test("value gate rejects Plan B output membership violations", t => {
  const dayKey = "2099-01-02";
  const cleanup = setupDay(dayKey, {
    sourceContract: canonicalContract,
    membership: {
      outputOrphanPicks: 1,
      outputAmbiguousPicks: 0,
      outputOrphanPickIds: ["cid_test"]
    }
  });
  t.after(cleanup);

  const result = checkValueArtifactGate(dayKey);
  assert.equal(result.ok, false);
  assert.equal(result.code, 2);
  assert.equal(result.reason, "plan_b_canonical_membership_failed");
  assert.deepEqual(result.planB.outputOrphanPickIds, ["cid_test"]);
});

test("value gate accepts a populated Plan B artifact with zero output membership violations", t => {
  const dayKey = "2099-01-03";
  const cleanup = setupDay(dayKey, {
    sourceContract: canonicalContract,
    membership: {
      outputOrphanPicks: 0,
      outputAmbiguousPicks: 0
    }
  });
  t.after(cleanup);

  const result = checkValueArtifactGate(dayKey);
  assert.equal(result.ok, true);
  assert.equal(result.code, 0);
});
