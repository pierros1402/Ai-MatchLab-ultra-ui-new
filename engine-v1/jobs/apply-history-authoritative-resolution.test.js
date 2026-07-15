import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertCanonicalHistoryPath,
  assertExternalBackupDir,
  assertSafeArtifactPath,
  AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE,
  parseArgs,
  runAuthoritativeResolutionExecution,
  writeHistoryWithRollback
} from "./apply-history-authoritative-resolution.js";
import { sha256Buffer } from "../core/history-authoritative-resolution-executor.js";

function writeJson(dir, name, value) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

test("CLI parser keeps dry-run default and accepts all hash locks", () => {
  const parsed = parseArgs([
    "--history=C:\\repo\\data\\history\\2025-2026.json",
    "--plan=C:\\out\\plan.json",
    "--resolution-bundle=C:\\out\\phase7.json",
    "--manifest=C:\\out\\manifest.json",
    "--source-reliability=C:\\repo\\data\\source-reliability.json",
    "--report=C:\\out\\dry.json",
    "--expected-history-sha256=AA",
    "--expected-plan-sha256=BB",
    "--expected-resolution-sha256=CC",
    "--expected-manifest-sha256=DD",
    "--expected-reliability-sha256=EE",
    "--expected-output-sha256=FF"
  ]);
  assert.equal(parsed.write, false);
  assert.equal(parsed.expectedHistorySha256, "aa");
  assert.equal(parsed.expectedOutputSha256, "ff");
});

test("CLI parser accepts explicit write scope and external backup directory", () => {
  const parsed = parseArgs([
    "--write",
    `--confirm-scope=${AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE}`,
    "--backup-dir=C:\\backups"
  ]);
  assert.equal(parsed.write, true);
  assert.equal(parsed.confirmScope, AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE);
  assert.match(parsed.backupDir, /backups$/i);
});

test("artifact guard rejects current-history output", () => {
  assert.throws(
    () => assertSafeArtifactPath(
      path.join(process.cwd(), "data", "history", "unsafe.json")
    ),
    /unsafe_truth_layer_artifact_path/
  );
});

test("canonical history guard rejects arbitrary history files", () => {
  assert.throws(
    () => assertCanonicalHistoryPath(path.join(os.tmpdir(), "history.json")),
    /history_path_out_of_scope/
  );
});

test("backup directory must be outside the repository", () => {
  assert.throws(
    () => assertExternalBackupDir(path.join(process.cwd(), "data", "backups")),
    /backup_dir_must_be_outside_repository/
  );
});

test("runner fails before generation when an expected source hash does not match", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-phase8-hash-"));
  try {
    const history = writeJson(dir, "history.json", { days: [] });
    const plan = writeJson(dir, "plan.json", {
      schema: "ai-matchlab.history-semantic-repair-plan.v1"
    });
    const manifest = writeJson(dir, "manifest.json", {
      schema: "ai-matchlab.authoritative-evidence-manifest.v1"
    });
    const reliability = writeJson(dir, "reliability.json", {});
    const historyHash = sha256Buffer(fs.readFileSync(history));
    const planHash = sha256Buffer(fs.readFileSync(plan));
    const manifestHash = sha256Buffer(fs.readFileSync(manifest));
    const reliabilityHash = sha256Buffer(fs.readFileSync(reliability));
    const resolution = writeJson(dir, "resolution.json", {
      ok: true,
      schema: "ai-matchlab.history-authoritative-resolution-bundle.v1",
      summary: {
        authoritativelySupportedResolutions: 2,
        unresolvedResolutionGroups: 0,
        h2hDeferredBlocks: 2
      },
      sourceArtifacts: {
        history: { sha256: historyHash },
        repairPlan: { sha256: planHash },
        authoritativeManifest: { sha256: manifestHash },
        sourceReliability: { sha256: reliabilityHash }
      }
    });
    assert.throws(
      () => runAuthoritativeResolutionExecution({
        historyPath: history,
        planPath: plan,
        resolutionBundlePath: resolution,
        manifestPath: manifest,
        sourceReliabilityPath: reliability,
        reportPath: path.join(dir, "report.json"),
        expectedHistorySha256: "0".repeat(64),
        enforceCanonicalHistoryPath: false
      }),
      /history_sha256_mismatch/
    );
    assert.equal(fs.existsSync(path.join(dir, "report.json")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("runner requires every explicit input and report path", () => {
  assert.throws(
    () => runAuthoritativeResolutionExecution({}),
    /missing_required_history_path/
  );
});


test("atomic write helper commits verified output", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-phase8-write-ok-"));
  try {
    const file = path.join(dir, "history.json");
    const original = Buffer.from("original\n");
    const output = Buffer.from("resolved\n");
    fs.writeFileSync(file, original);
    const result = writeHistoryWithRollback({
      historyInput: {
        path: file,
        raw: original,
        bytes: original.length,
        sha256: sha256Buffer(original)
      },
      outputBuffer: output,
      backupDir: path.join(dir, "external-backup"),
      verifyAfterWrite: () => ({ ok: true })
    });
    assert.equal(fs.readFileSync(file, "utf8"), "resolved\n");
    assert.equal(result.rolledBack, false);
    assert.equal(result.verification.ok, true);
    assert.equal(fs.existsSync(result.backup.backupPath), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("post-write failure restores the exact original bytes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-phase8-rollback-"));
  try {
    const file = path.join(dir, "history.json");
    const original = Buffer.from("original-truth\n");
    fs.writeFileSync(file, original);
    let caught = null;
    try {
      writeHistoryWithRollback({
        historyInput: {
          path: file,
          raw: original,
          bytes: original.length,
          sha256: sha256Buffer(original)
        },
        outputBuffer: Buffer.from("bad-output\n"),
        backupDir: path.join(dir, "external-backup"),
        verifyAfterWrite: () => {
          throw new Error("forced_post_write_audit_failure");
        }
      });
    } catch (error) {
      caught = error;
    }
    assert.match(caught.message, /forced_post_write_audit_failure/);
    assert.equal(caught.rollback.rolledBack, true);
    assert.equal(fs.readFileSync(file, "utf8"), "original-truth\n");
    assert.equal(sha256Buffer(fs.readFileSync(file)), sha256Buffer(original));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
