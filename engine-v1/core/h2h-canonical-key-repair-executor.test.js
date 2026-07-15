import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  computeH2HInventoryHash,
  buildH2HCanonicalKeyAudit
} from "../jobs/audit-h2h-canonical-key-integrity.js";
import {
  sha256File,
  computeProjectedInventoryHash,
  validateH2HRepairPlan,
  applyH2HRepairPlan
} from "./h2h-canonical-key-repair-executor.js";

function tempDir(prefix = "aiml-h2h-exec-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function payload(teamB, id) {
  return {
    teamA: "AFC",
    teamB,
    matches: [{
      matchId: id,
      date: "2025-10-30",
      homeTeam: teamB,
      awayTeam: "AFC",
      scoreHome: 1,
      scoreAway: 2,
      leagueSlug: "ned.cup"
    }]
  };
}

function fixture() {
  const h2hDir = tempDir();
  const backupDir = tempDir("aiml-h2h-backup-");
  const rows = [
    ["~eemdijk.json", "afc~eemdijk.json", payload("Eemdijk", "759210")],
    ["~necnijmegen.json", "afc~necnijmegen.json", payload("NEC Nijmegen", "760398")]
  ];
  for (const [source, , data] of rows) {
    fs.writeFileSync(path.join(h2hDir, source), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }
  const inventory = computeH2HInventoryHash(h2hDir);
  const actions = rows.map(([sourceFileName, targetFileName, data], i) => {
    const sourcePath = path.join(h2hDir, sourceFileName);
    return {
      blocked: false,
      actionId: `repair-${i + 1}`,
      actionType: "rename_h2h_file_to_canonical_key",
      status: "planned_not_applied",
      confidence: "deterministic",
      sourceFileName,
      targetFileName,
      sourceSha256: sha256File(sourcePath),
      sourceBytes: fs.statSync(sourcePath).size,
      matchCount: data.matches.length,
      payloadRewriteRequired: false,
      automaticApplyAllowed: false
    };
  });
  const plan = {
    ok: true,
    readyToApply: true,
    status: "ready_for_separate_hash_verified_executor",
    schema: "ai-matchlab.h2h-canonical-key-repair-plan.v1",
    sourceAudit: { inventory },
    summary: { deterministicActions: 2, blockedActions: 0 },
    actions,
    blocked: []
  };
  return { h2hDir, backupDir, plan, inventory };
}

test("projected inventory changes filenames but preserves count and bytes", () => {
  const f = fixture();
  const projected = computeProjectedInventoryHash(f.h2hDir, f.plan.actions);
  assert.equal(projected.fileCount, f.inventory.fileCount);
  assert.equal(projected.bytes, f.inventory.bytes);
  assert.notEqual(projected.sha256, f.inventory.sha256);
});

test("plan validation is read-only and deterministic", () => {
  const f = fixture();
  const before = computeH2HInventoryHash(f.h2hDir);
  const a = validateH2HRepairPlan({ h2hDir: f.h2hDir, plan: f.plan, expectedInventorySha256: before.sha256 });
  const b = validateH2HRepairPlan({ h2hDir: f.h2hDir, plan: f.plan, expectedInventorySha256: before.sha256 });
  assert.deepEqual(a.projected, b.projected);
  assert.deepEqual(computeH2HInventoryHash(f.h2hDir), before);
});

test("hash-verified apply performs two atomic renames with no payload rewrite", () => {
  const f = fixture();
  const projected = computeProjectedInventoryHash(f.h2hDir, f.plan.actions);
  const result = applyH2HRepairPlan({
    h2hDir: f.h2hDir,
    plan: f.plan,
    backupDir: f.backupDir,
    expectedInventorySha256: f.inventory.sha256,
    expectedOutputSha256: projected.sha256
  });
  assert.equal(result.rolledBack, false);
  assert.equal(result.backups.length, 2);
  assert.equal(result.postAudit.clean, true);
  assert.equal(result.postAudit.summary.nonCanonicalFileNameCount, 0);
  assert.equal(result.postAudit.summary.legacyDegradedPairKeyCount, 0);
  assert.equal(result.outputInventory.sha256, projected.sha256);
  assert.equal(fs.existsSync(path.join(f.h2hDir, "~eemdijk.json")), false);
  assert.equal(fs.existsSync(path.join(f.h2hDir, "afc~eemdijk.json")), true);
});

test("backup files are byte-identical to source files", () => {
  const f = fixture();
  const sourceHashes = new Map(f.plan.actions.map(a => [a.sourceFileName, a.sourceSha256]));
  const result = applyH2HRepairPlan({ h2hDir: f.h2hDir, plan: f.plan, backupDir: f.backupDir, expectedInventorySha256: f.inventory.sha256 });
  for (const backup of result.backups) {
    assert.equal(sha256File(backup.backupPath), backup.backupSha256);
    assert.equal(backup.backupSha256, sourceHashes.get(path.basename(backup.sourcePath)));
  }
});

test("forced post-audit failure restores exact original inventory", () => {
  const f = fixture();
  assert.throws(() => applyH2HRepairPlan({
    h2hDir: f.h2hDir,
    plan: f.plan,
    backupDir: f.backupDir,
    expectedInventorySha256: f.inventory.sha256,
    forcePostAuditFailure: true
  }), /forced_post_audit_failure/);
  assert.deepEqual(computeH2HInventoryHash(f.h2hDir), f.inventory);
  assert.equal(fs.existsSync(path.join(f.h2hDir, "~eemdijk.json")), true);
});

test("inventory drift fails before any rename", () => {
  const f = fixture();
  fs.appendFileSync(path.join(f.h2hDir, "~eemdijk.json"), " ");
  assert.throws(() => validateH2HRepairPlan({ h2hDir: f.h2hDir, plan: f.plan, expectedInventorySha256: f.inventory.sha256 }), /inventory_hash_mismatch/);
});

test("per-file source hash drift fails closed", () => {
  const f = fixture();
  f.plan.sourceAudit.inventory = computeH2HInventoryHash(f.h2hDir);
  f.plan.actions[0].sourceSha256 = "0".repeat(64);
  assert.throws(() => validateH2HRepairPlan({ h2hDir: f.h2hDir, plan: f.plan, expectedInventorySha256: f.inventory.sha256 }), /source_hash_mismatch/);
});

test("existing target collision is rejected", () => {
  const f = fixture();
  fs.copyFileSync(path.join(f.h2hDir, "~eemdijk.json"), path.join(f.h2hDir, "afc~eemdijk.json"));
  const now = computeH2HInventoryHash(f.h2hDir);
  f.plan.sourceAudit.inventory = now;
  assert.throws(() => validateH2HRepairPlan({ h2hDir: f.h2hDir, plan: f.plan, expectedInventorySha256: now.sha256 }), /target_exists/);
});

test("post-repair audit is clean under the dedicated H2H policy", () => {
  const f = fixture();
  applyH2HRepairPlan({ h2hDir: f.h2hDir, plan: f.plan, backupDir: f.backupDir, expectedInventorySha256: f.inventory.sha256 });
  const audit = buildH2HCanonicalKeyAudit({ h2hDir: f.h2hDir });
  assert.equal(audit.ok, true);
  assert.equal(audit.clean, true);
  assert.equal(audit.summary.fallbackTeamIdentityCount, 2);
  assert.equal(audit.summary.legacyDegradedPairKeyCount, 0);
});
