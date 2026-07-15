import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { computeH2HInventoryHash } from "./audit-h2h-canonical-key-integrity.js";
import { sha256File, computeProjectedInventoryHash } from "../core/h2h-canonical-key-repair-executor.js";
import { parseArgs, runH2HCanonicalKeyRepair } from "./apply-h2h-canonical-key-repair.js";

function tempDir(prefix = "aiml-h2h-job-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function setup() {
  const root = tempDir();
  const h2hDir = path.join(root, "h2h");
  const backupDir = tempDir("aiml-h2h-job-backup-");
  fs.mkdirSync(h2hDir);
  const rows = [
    ["~eemdijk.json", "afc~eemdijk.json", "Eemdijk", "759210"],
    ["~necnijmegen.json", "afc~necnijmegen.json", "NEC Nijmegen", "760398"]
  ];
  for (const [source, , teamB, matchId] of rows) {
    const data = { teamA: "AFC", teamB, matches: [{ matchId, date: "2025-10-30", homeTeam: teamB, awayTeam: "AFC", scoreHome: 1, scoreAway: 2, leagueSlug: "ned.cup" }] };
    fs.writeFileSync(path.join(h2hDir, source), `${JSON.stringify(data, null, 2)}\n`);
  }
  const inventory = computeH2HInventoryHash(h2hDir);
  const actions = rows.map(([sourceFileName, targetFileName], i) => {
    const sourcePath = path.join(h2hDir, sourceFileName);
    return { blocked: false, actionId: `action-${i + 1}`, actionType: "rename_h2h_file_to_canonical_key", status: "planned_not_applied", confidence: "deterministic", sourceFileName, targetFileName, sourceSha256: sha256File(sourcePath), sourceBytes: fs.statSync(sourcePath).size, matchCount: 1, payloadRewriteRequired: false, automaticApplyAllowed: false };
  });
  const plan = { ok: true, readyToApply: true, status: "ready_for_separate_hash_verified_executor", schema: "ai-matchlab.h2h-canonical-key-repair-plan.v1", sourceAudit: { inventory }, summary: { deterministicActions: 2, blockedActions: 0 }, actions, blocked: [] };
  const planPath = path.join(root, "plan.json");
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`);
  return { root, h2hDir, backupDir, plan, planPath, planHash: sha256File(planPath), inventory, projected: computeProjectedInventoryHash(h2hDir, actions) };
}

test("CLI parser keeps dry-run default and accepts hash locks", () => {
  const args = parseArgs(["--plan=x", "--report=y", "--expected-inventory-sha256=AA", "--expected-plan-sha256=BB"]);
  assert.equal(args.write, false);
  assert.equal(args.expectedInventorySha256, "aa");
  assert.equal(args.expectedPlanSha256, "bb");
});

test("dry-run report is additive and leaves H2H bytes unchanged", () => {
  const f = setup();
  const reportPath = path.join(f.root, "dry-run.json");
  const before = computeH2HInventoryHash(f.h2hDir);
  const { report } = runH2HCanonicalKeyRepair({ write: false, h2hDir: f.h2hDir, plan: f.planPath, report: reportPath, expectedInventorySha256: f.inventory.sha256, expectedPlanSha256: f.planHash, expectedOutputSha256: f.projected.sha256 });
  assert.equal(report.status, "ready_for_hash_verified_write");
  assert.equal(report.guarantees.h2hWrites, 0);
  assert.equal(report.projectedInventory.sha256, f.projected.sha256);
  assert.deepEqual(computeH2HInventoryHash(f.h2hDir), before);
});

test("write mode requires explicit scope", () => {
  const f = setup();
  assert.throws(() => runH2HCanonicalKeyRepair({ write: true, h2hDir: f.h2hDir, plan: f.planPath, report: path.join(f.root, "write.json"), backupDir: f.backupDir, expectedInventorySha256: f.inventory.sha256, expectedPlanSha256: f.planHash, expectedOutputSha256: f.projected.sha256 }), /explicit_write_scope_required/);
});

test("write mode applies exact renames and emits clean post-audit", () => {
  const f = setup();
  const { report } = runH2HCanonicalKeyRepair({ write: true, confirmScope: "h2h-canonical-key-renames-only", h2hDir: f.h2hDir, plan: f.planPath, report: path.join(f.root, "write.json"), backupDir: f.backupDir, expectedInventorySha256: f.inventory.sha256, expectedPlanSha256: f.planHash, expectedOutputSha256: f.projected.sha256 });
  assert.equal(report.status, "applied");
  assert.equal(report.postAudit.clean, true);
  assert.equal(report.guarantees.h2hWrites, 2);
  assert.equal(report.guarantees.payloadRewrites, 0);
  assert.equal(report.backups.length, 2);
});

test("plan hash mismatch fails before report generation", () => {
  const f = setup();
  const reportPath = path.join(f.root, "bad.json");
  assert.throws(() => runH2HCanonicalKeyRepair({ write: false, h2hDir: f.h2hDir, plan: f.planPath, report: reportPath, expectedInventorySha256: f.inventory.sha256, expectedPlanSha256: "0".repeat(64) }), /plan_hash_mismatch/);
  assert.equal(fs.existsSync(reportPath), false);
});

test("report cannot be written inside H2H truth directory", () => {
  const f = setup();
  assert.throws(() => runH2HCanonicalKeyRepair({ write: false, h2hDir: f.h2hDir, plan: f.planPath, report: path.join(f.h2hDir, "report.json"), expectedInventorySha256: f.inventory.sha256, expectedPlanSha256: f.planHash }), /outside_h2h_truth/);
});
