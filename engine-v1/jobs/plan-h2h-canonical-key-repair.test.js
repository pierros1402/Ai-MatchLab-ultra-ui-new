import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildH2HCanonicalKeyRepairPlan,
  writeRepairPlan
} from "./plan-h2h-canonical-key-repair.js";
import { computeH2HInventoryHash } from "./audit-h2h-canonical-key-integrity.js";

const noAliases = () => null;

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aiml-h2h-plan-"));
}

function writePair(dir, fileName, teamA, teamB, matchId) {
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify({
    teamA,
    teamB,
    matches: [{
      matchId,
      date: "2025-10-30",
      homeTeam: teamB,
      awayTeam: teamA,
      scoreHome: 1,
      scoreAway: 2,
      leagueSlug: "ned.cup"
    }]
  }, null, 2), "utf8");
}

test("planner emits two deterministic AFC rename actions", () => {
  const dir = tempDir();
  writePair(dir, "~eemdijk.json", "AFC", "Eemdijk", "759210");
  writePair(dir, "~necnijmegen.json", "AFC", "NEC Nijmegen", "760398");
  const plan = buildH2HCanonicalKeyRepairPlan({ h2hDir: dir, resolveCanonical: noAliases });
  assert.equal(plan.readyToApply, true);
  assert.equal(plan.summary.deterministicActions, 2);
  assert.deepEqual(
    plan.actions.map(row => row.targetFileName),
    ["afc~eemdijk.json", "afc~necnijmegen.json"]
  );
  assert.equal(plan.summary.matchesPreserved, 2);
  assert.equal(plan.guarantees.h2hWrites, 0);
});

test("existing target collision is blocked rather than merged automatically", () => {
  const dir = tempDir();
  writePair(dir, "~eemdijk.json", "AFC", "Eemdijk", "759210");
  writePair(dir, "afc~eemdijk.json", "AFC", "Eemdijk", "759210");
  const plan = buildH2HCanonicalKeyRepairPlan({ h2hDir: dir, resolveCanonical: noAliases });
  assert.equal(plan.readyToApply, false);
  assert.equal(plan.summary.blockedActions, 1);
  assert.equal(plan.blocked[0].reasonCode, "h2h_target_collision_requires_separate_merge_review");
});

test("expected inventory hash mismatch fails before plan acceptance", () => {
  const dir = tempDir();
  writePair(dir, "~eemdijk.json", "AFC", "Eemdijk", "759210");
  assert.throws(
    () => buildH2HCanonicalKeyRepairPlan({
      h2hDir: dir,
      resolveCanonical: noAliases,
      expectedInventorySha256: "0".repeat(64)
    }),
    /inventory SHA-256 mismatch/
  );
});

test("plan artifact write leaves H2H bytes unchanged", () => {
  const dir = tempDir();
  const outDir = tempDir();
  writePair(dir, "~eemdijk.json", "AFC", "Eemdijk", "759210");
  const before = computeH2HInventoryHash(dir);
  const plan = buildH2HCanonicalKeyRepairPlan({ h2hDir: dir, resolveCanonical: noAliases });
  const out = path.join(outDir, "plan.json");
  writeRepairPlan(out, plan, dir);
  const after = computeH2HInventoryHash(dir);
  assert.deepEqual(after, before);
  assert.equal(fs.existsSync(out), true);
});

test("already canonical directory yields a clean no-action plan", () => {
  const dir = tempDir();
  writePair(dir, "afc~eemdijk.json", "AFC", "Eemdijk", "759210");
  const plan = buildH2HCanonicalKeyRepairPlan({ h2hDir: dir, resolveCanonical: noAliases });
  assert.equal(plan.readyToApply, false);
  assert.equal(plan.status, "clean_no_actions");
  assert.equal(plan.summary.deterministicActions, 0);
  assert.equal(plan.summary.blockedActions, 0);
});
