import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, resolveDataPath, getProjectRoot } from "../storage/data-root.js";
import {
  H2H_REPAIR_EXECUTION_SCHEMA,
  H2H_REPAIR_EXECUTION_POLICY,
  sha256File,
  validateH2HRepairPlan,
  applyH2HRepairPlan
} from "../core/h2h-canonical-key-repair-executor.js";

const __filename = fileURLToPath(import.meta.url);
const WRITE_SCOPE = "h2h-canonical-key-renames-only";

export function parseArgs(argv) {
  const out = { write: false, h2hDir: null, plan: null, report: null, backupDir: null, confirmScope: null, expectedInventorySha256: null, expectedPlanSha256: null, expectedOutputSha256: null };
  for (const arg of argv) {
    if (arg === "--write") out.write = true;
    else if (arg.startsWith("--h2h-dir=")) out.h2hDir = arg.slice(10);
    else if (arg.startsWith("--plan=")) out.plan = arg.slice(7);
    else if (arg.startsWith("--report=")) out.report = arg.slice(9);
    else if (arg.startsWith("--backup-dir=")) out.backupDir = arg.slice(13);
    else if (arg.startsWith("--confirm-scope=")) out.confirmScope = arg.slice(16);
    else if (arg.startsWith("--expected-inventory-sha256=")) out.expectedInventorySha256 = arg.slice(28).toLowerCase();
    else if (arg.startsWith("--expected-plan-sha256=")) out.expectedPlanSha256 = arg.slice(23).toLowerCase();
    else if (arg.startsWith("--expected-output-sha256=")) out.expectedOutputSha256 = arg.slice(25).toLowerCase();
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function assertOutsideTruthAndInputs(reportPath, h2hDir, planPath) {
  const out = path.resolve(reportPath);
  const root = path.resolve(h2hDir);
  const plan = path.resolve(planPath);
  if (out === root || out.startsWith(`${root}${path.sep}`)) throw new Error("report_must_be_outside_h2h_truth");
  if (out === plan) throw new Error("report_must_not_overwrite_plan");
  return out;
}

function assertExternalBackupDir(backupDir) {
  const root = path.resolve(getProjectRoot());
  const target = path.resolve(backupDir);
  if (target === root || target.startsWith(`${root}${path.sep}`)) throw new Error("backup_dir_must_be_outside_repository");
  return target;
}

function writeReport(reportPath, report) {
  ensureDir(path.dirname(reportPath));
  const temp = `${reportPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temp, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.renameSync(temp, reportPath);
}

export function runH2HCanonicalKeyRepair(args) {
  if (!args.plan || !args.report) throw new Error("plan_and_report_required");
  const h2hDir = path.resolve(args.h2hDir || resolveDataPath("h2h"));
  const planPath = path.resolve(args.plan);
  const reportPath = assertOutsideTruthAndInputs(args.report, h2hDir, planPath);
  if (!fs.existsSync(planPath)) throw new Error("plan_not_found");
  const planHash = sha256File(planPath);
  if (!args.expectedPlanSha256 || planHash !== args.expectedPlanSha256) throw new Error("plan_hash_mismatch");
  if (!args.expectedInventorySha256) throw new Error("expected_inventory_hash_required");
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  const validated = validateH2HRepairPlan({ h2hDir, plan, expectedInventorySha256: args.expectedInventorySha256 });
  if (args.expectedOutputSha256 && validated.projected.sha256 !== args.expectedOutputSha256) throw new Error("projected_output_hash_mismatch");

  const base = {
    ok: true,
    status: args.write ? "applied" : "ready_for_hash_verified_write",
    mode: args.write ? "write" : "dry-run",
    schema: H2H_REPAIR_EXECUTION_SCHEMA,
    policyVersion: H2H_REPAIR_EXECUTION_POLICY,
    generatedAt: new Date().toISOString(),
    scope: WRITE_SCOPE,
    sourceArtifacts: {
      plan: { path: planPath, sha256: planHash, bytes: fs.statSync(planPath).size },
      h2hInventory: validated.inventory
    },
    projectedInventory: validated.projected,
    summary: {
      actionsValidated: validated.actions.length,
      sourceFilesAffected: validated.actions.length,
      targetFiles: validated.actions.length,
      matchesPreserved: validated.actions.reduce((n, action) => n + Number(action.matchCount || 0), 0),
      payloadRewrites: validated.actions.filter(action => action.payloadRewriteRequired).length,
      fileCountBefore: validated.inventory.fileCount,
      fileCountAfter: validated.projected.fileCount,
      bytesBefore: validated.inventory.bytes,
      bytesAfter: validated.projected.bytes
    },
    actions: validated.actions.map(action => ({
      actionId: action.actionId,
      sourceFileName: action.sourceFileName,
      targetFileName: action.targetFileName,
      sourceSha256: action.sourceSha256,
      sourceBytes: action.sourceBytes,
      matchCount: action.matchCount,
      payloadRewriteRequired: action.payloadRewriteRequired,
      status: args.write ? "applied" : "validated_for_hash_verified_application"
    })),
    postAudit: null,
    backups: [],
    rolledBack: false,
    guarantees: {
      h2hWrites: args.write ? validated.actions.length : 0,
      h2hFilesRenamed: args.write ? validated.actions.length : 0,
      payloadRewrites: 0,
      historyWrites: 0,
      archiveWrites: 0,
      resultsMemoryWrites: 0,
      sourceReliabilityWrites: 0,
      automaticUnreviewedRepairs: 0
    }
  };

  if (!args.write) {
    writeReport(reportPath, base);
    return { report: base, reportPath };
  }
  if (args.confirmScope !== WRITE_SCOPE) throw new Error("explicit_write_scope_required");
  if (!args.backupDir) throw new Error("backup_dir_required");
  const backupDir = assertExternalBackupDir(args.backupDir);
  const applied = applyH2HRepairPlan({
    h2hDir,
    plan,
    backupDir,
    expectedInventorySha256: args.expectedInventorySha256,
    expectedOutputSha256: args.expectedOutputSha256 || validated.projected.sha256
  });
  const report = {
    ...base,
    postAudit: {
      ok: applied.postAudit.ok,
      clean: applied.postAudit.clean,
      status: applied.postAudit.status,
      inventory: applied.postAudit.inventory,
      summary: applied.postAudit.summary
    },
    outputInventory: applied.outputInventory,
    backups: applied.backups,
    rolledBack: applied.rolledBack
  };
  writeReport(reportPath, report);
  return { report, reportPath };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log("Usage: node engine-v1/jobs/apply-h2h-canonical-key-repair.js --plan=<plan.json> --report=<report.json> --expected-inventory-sha256=<hash> --expected-plan-sha256=<hash> [--expected-output-sha256=<hash>] [--write --confirm-scope=h2h-canonical-key-renames-only --backup-dir=<external-dir>]");
      process.exit(0);
    }
    const { report, reportPath } = runH2HCanonicalKeyRepair(args);
    console.log(JSON.stringify({ ...report, reportPath }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: String(error?.message || error), rolledBack: Boolean(error?.rolledBack), backups: error?.backups || [] }, null, 2));
    process.exit(1);
  }
}
