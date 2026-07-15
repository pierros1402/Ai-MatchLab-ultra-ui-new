/**
 * Phase 8 hash-verified authoritative history resolution executor.
 *
 * Dry-run is the default. Write mode requires explicit scope confirmation,
 * exact hashes for every reviewed input and the projected output hash, an
 * external backup directory, atomic write, post-write audit and rollback.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildHistoryEvidenceFoundation
} from "../core/history-evidence-foundation.js";
import {
  reasonAboutHistoryEvidence
} from "../core/history-evidence-reasoner.js";
import {
  buildAuthoritativeResolutionReport
} from "../core/history-authoritative-resolution.js";
import {
  buildAuthoritativeHistoryResolutionExecution,
  canonicalJsonBuffer,
  HISTORY_AUTHORITATIVE_RESOLUTION_EXECUTION_SCHEMA,
  sha256Buffer,
  stableDigest
} from "../core/history-authoritative-resolution-executor.js";
import { auditHistoryRows } from "./audit-history-semantic-integrity.js";
import { ensureDir, getProjectRoot } from "../storage/data-root.js";

const __filename = fileURLToPath(import.meta.url);
export const AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE =
  "current-history-authoritative-resolutions-only";

const EXPECTED_PLAN_SCHEMA = "ai-matchlab.history-semantic-repair-plan.v1";
const EXPECTED_BUNDLE_SCHEMA =
  "ai-matchlab.history-authoritative-resolution-bundle.v1";
const EXPECTED_MANIFEST_SCHEMA = "ai-matchlab.authoritative-evidence-manifest.v1";

function readJsonWithHash(filePath) {
  const raw = fs.readFileSync(filePath);
  return {
    path: filePath,
    raw,
    bytes: raw.length,
    sha256: sha256Buffer(raw),
    value: JSON.parse(raw.toString("utf8"))
  };
}

function assertHash(label, actual, expected, required = false) {
  if (required && !expected) throw new Error(`${label}_expected_sha256_required`);
  if (expected && actual !== String(expected).toLowerCase()) {
    throw new Error(`${label}_sha256_mismatch:expected=${expected}:actual=${actual}`);
  }
}

function canonicalHistoryPath() {
  return path.resolve(getProjectRoot(), "data", "history", "2025-2026.json");
}

export function assertCanonicalHistoryPath(historyPath) {
  const resolved = path.resolve(historyPath);
  const expected = canonicalHistoryPath();
  if (resolved !== expected) {
    throw new Error(`history_path_out_of_scope:expected=${expected}:actual=${resolved}`);
  }
  return resolved;
}

export function assertSafeArtifactPath(filePath) {
  if (!filePath) throw new Error("report_path_required");
  const root = path.resolve(getProjectRoot());
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved).replace(/\\/g, "/");
  const forbidden = [
    "data/history/",
    "data/history-archive/",
    "data/league-memory/results/",
    "data/h2h/"
  ];
  if (
    relative === "data/history" ||
    relative === "data/history-archive" ||
    relative === "data/league-memory/results" ||
    relative === "data/h2h" ||
    relative === "data/source-reliability.json" ||
    forbidden.some(prefix => relative.startsWith(prefix))
  ) {
    throw new Error(`unsafe_truth_layer_artifact_path:${resolved}`);
  }
  return resolved;
}

export function assertExternalBackupDir(backupDir) {
  if (!backupDir) throw new Error("external_backup_dir_required_for_write");
  const root = path.resolve(getProjectRoot());
  const resolved = path.resolve(backupDir);
  const relative = path.relative(root, resolved);
  if (!relative.startsWith("..") && !path.isAbsolute(relative)) {
    throw new Error(`backup_dir_must_be_outside_repository:${resolved}`);
  }
  return resolved;
}

function writeBufferAtomic(filePath, buffer) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  const fd = fs.openSync(tempPath, "w");
  try {
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tempPath, filePath);
}

function writeJsonAtomic(filePath, value) {
  writeBufferAtomic(filePath, canonicalJsonBuffer(value));
}

function flattenRows(document) {
  return (document?.days || []).flatMap(day =>
    (day?.rows || []).map(row => ({
      ...row,
      __bucketDay: day?.dayKey || null,
      __container: "history/2025-2026.json"
    }))
  );
}

function currentAudit(document) {
  return auditHistoryRows(flattenRows(document), { maxExamples: 100 });
}

function compactCurrentAudit(audit) {
  return {
    rows: audit.rowCount,
    validRows: audit.validRowCount,
    invalidRows: audit.invalidRowCount,
    duplicateIds: audit.duplicateIdCount,
    selfPairs: audit.selfPairCount,
    operationalDayMismatches: audit.operationalDayMismatchCount,
    semanticDuplicateGroups: audit.semantic.duplicateGroups,
    scoreConflictGroups: audit.semantic.scoreConflictGroups,
    flippedOrientationGroups: audit.semantic.flippedOrientationGroups,
    crossOperationalDayGroups: audit.semantic.crossOperationalDayGroups
  };
}

function assertPreExecutionAudit(audit) {
  const failures = [];
  if (audit.invalidRowCount !== 0) failures.push(`invalidRows=${audit.invalidRowCount}`);
  if (audit.duplicateIdCount !== 0) failures.push(`duplicateIds=${audit.duplicateIdCount}`);
  if (audit.operationalDayMismatchCount !== 0) {
    failures.push(`operationalDayMismatches=${audit.operationalDayMismatchCount}`);
  }
  if (audit.semantic.duplicateGroups !== 0) {
    failures.push(`semanticDuplicateGroups=${audit.semantic.duplicateGroups}`);
  }
  if (audit.semantic.scoreConflictGroups !== 1) {
    failures.push(`scoreConflictGroups=${audit.semantic.scoreConflictGroups}:expected=1`);
  }
  if (audit.semantic.flippedOrientationGroups !== 1) {
    failures.push(
      `flippedOrientationGroups=${audit.semantic.flippedOrientationGroups}:expected=1`
    );
  }
  if (failures.length) {
    throw new Error(`pre_execution_history_state_unexpected:${failures.join(";")}`);
  }
}

function selectedResolutionShape(row) {
  return {
    resolutionId: row?.resolutionId,
    resolutionType: row?.resolutionType,
    blockIds: row?.blockIds,
    targetFactIds: row?.targetFactIds,
    proposalStatus: row?.proposalStatus,
    candidate: row?.candidate,
    confidenceClass: row?.confidenceClass,
    automaticApplyAllowed: row?.automaticApplyAllowed,
    explicitResolutionManifestRequiredForWrite:
      row?.explicitResolutionManifestRequiredForWrite,
    contradictoryEvidenceCount: row?.contradictoryEvidenceCount,
    evidenceDigest: row?.evidenceDigest
  };
}

function assertBundleSourceContracts({
  historyInput,
  planInput,
  resolutionInput,
  manifestInput,
  reliabilityInput
}) {
  const source = resolutionInput.value?.sourceArtifacts || {};
  const mismatches = [];
  if (source.history?.sha256 !== historyInput.sha256) mismatches.push("history");
  if (source.repairPlan?.sha256 !== planInput.sha256) mismatches.push("repairPlan");
  if (source.authoritativeManifest?.sha256 !== manifestInput.sha256) {
    mismatches.push("authoritativeManifest");
  }
  if (source.sourceReliability?.sha256 !== reliabilityInput.sha256) {
    mismatches.push("sourceReliability");
  }
  if (mismatches.length) {
    throw new Error(`resolution_bundle_source_contract_mismatch:${mismatches.join(",")}`);
  }
}

function buildRegeneratedResolution({
  history,
  plan,
  manifest,
  reliability
}) {
  const foundation = buildHistoryEvidenceFoundation({
    historyPayload: history,
    repairPlan: plan,
    sourceReliability: reliability,
    includeFacts: true,
    maxExamples: 100
  });
  if (!foundation.ok) {
    throw new Error("evidence_foundation_not_safe_for_resolution_application");
  }
  const reasoning = reasonAboutHistoryEvidence({
    evidenceFoundation: foundation,
    includeFacts: true,
    maxExamples: 100
  });
  const report = buildAuthoritativeResolutionReport({
    reasoning,
    manifest,
    includeResolvedFacts: true
  });
  return { foundation, reasoning, report };
}

function assertResolutionBundleParity(bundle, regenerated) {
  const bundleRows = bundle?.resolution?.resolutions || [];
  const regeneratedRows = regenerated?.resolutions || [];
  if (bundleRows.length !== regeneratedRows.length) {
    throw new Error(
      `resolution_count_regeneration_mismatch:bundle=${bundleRows.length}:regenerated=${regeneratedRows.length}`
    );
  }
  const byId = new Map(regeneratedRows.map(row => [row.resolutionId, row]));
  for (const bundleRow of bundleRows) {
    const regeneratedRow = byId.get(bundleRow.resolutionId);
    if (!regeneratedRow) {
      throw new Error(`resolution_missing_from_regeneration:${bundleRow.resolutionId}`);
    }
    if (
      stableDigest(selectedResolutionShape(bundleRow)) !==
      stableDigest(selectedResolutionShape(regeneratedRow))
    ) {
      throw new Error(`resolution_regeneration_drift:${bundleRow.resolutionId}`);
    }
  }
}

function assertPostWriteAudit({
  outputSha256,
  historyPath,
  execution,
  inputArtifacts
}) {
  const raw = fs.readFileSync(historyPath);
  const actualOutputHash = sha256Buffer(raw);
  if (actualOutputHash !== outputSha256) {
    throw new Error(
      `post_write_history_hash_mismatch:expected=${outputSha256}:actual=${actualOutputHash}`
    );
  }
  const document = JSON.parse(raw.toString("utf8"));
  const current = currentAudit(document);
  const projected = execution.projectedAudit;
  const failures = [];
  if (current.rowCount !== projected.rows) failures.push(`rows=${current.rowCount}`);
  if (current.invalidRowCount !== 0) failures.push(`invalidRows=${current.invalidRowCount}`);
  if (current.duplicateIdCount !== 0) failures.push(`duplicateIds=${current.duplicateIdCount}`);
  if (current.operationalDayMismatchCount !== 0) {
    failures.push(`operationalDayMismatches=${current.operationalDayMismatchCount}`);
  }
  if (current.semantic.duplicateGroups !== 0) {
    failures.push(`semanticDuplicateGroups=${current.semantic.duplicateGroups}`);
  }
  if (current.semantic.scoreConflictGroups !== 0) {
    failures.push(`scoreConflictGroups=${current.semantic.scoreConflictGroups}`);
  }
  if (current.semantic.flippedOrientationGroups !== 0) {
    failures.push(`flippedOrientationGroups=${current.semantic.flippedOrientationGroups}`);
  }

  const byteIdentity = {};
  for (const [label, artifact] of Object.entries(inputArtifacts)) {
    const currentHash = sha256Buffer(fs.readFileSync(artifact.path));
    byteIdentity[label] = currentHash === artifact.sha256;
    if (!byteIdentity[label]) failures.push(`${label}_changed_during_write`);
  }

  if (failures.length) {
    throw new Error(`post_write_authoritative_resolution_audit_failed:${failures.join(";")}`);
  }
  return {
    ok: true,
    currentHistory: compactCurrentAudit(current),
    inputArtifactsByteIdentical: byteIdentity,
    h2hDeferredBlocksPreservedByNoWriteScope: execution.summary.h2hDeferredBlocks,
    outputSha256: actualOutputHash
  };
}

function backupHistory(historyInput, backupDir) {
  ensureDir(backupDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    backupDir,
    `2025-2026.before-authoritative-resolution.${stamp}.${historyInput.sha256.slice(0, 12)}.json`
  );
  fs.copyFileSync(historyInput.path, backupPath);
  const backupHash = sha256Buffer(fs.readFileSync(backupPath));
  if (backupHash !== historyInput.sha256) {
    throw new Error(`backup_hash_mismatch:expected=${historyInput.sha256}:actual=${backupHash}`);
  }
  return {
    sourcePath: historyInput.path,
    backupPath,
    sourceSha256: historyInput.sha256,
    backupSha256: backupHash,
    bytes: historyInput.bytes
  };
}

function restoreBackup(backup) {
  const raw = fs.readFileSync(backup.backupPath);
  writeBufferAtomic(backup.sourcePath, raw);
  const restoredHash = sha256Buffer(fs.readFileSync(backup.sourcePath));
  if (restoredHash !== backup.sourceSha256) {
    throw new Error(
      `rollback_hash_mismatch:expected=${backup.sourceSha256}:actual=${restoredHash}`
    );
  }
}

export function writeHistoryWithRollback({
  historyInput,
  outputBuffer,
  backupDir,
  verifyAfterWrite
}) {
  const backup = backupHistory(historyInput, backupDir);
  try {
    writeBufferAtomic(historyInput.path, outputBuffer);
    const verification = verifyAfterWrite();
    return { backup, verification, rolledBack: false };
  } catch (error) {
    restoreBackup(backup);
    const wrapped = new Error(error?.message || String(error));
    wrapped.rollback = { backup, rolledBack: true };
    throw wrapped;
  }
}

function makeReport({
  mode,
  inputs,
  execution,
  preAudit,
  postAudit = null,
  backups = [],
  rolledBack = false
}) {
  const writeMode = mode === "write";
  return {
    ok: true,
    status: writeMode ? "applied" : "ready_for_hash_verified_write",
    schema: HISTORY_AUTHORITATIVE_RESOLUTION_EXECUTION_SCHEMA,
    policyVersion: "history-authoritative-resolution-execution-policy-v1",
    generatedAt: new Date().toISOString(),
    mode,
    scope: AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE,
    summary: execution.summary,
    actions: execution.actions,
    preAudit: compactCurrentAudit(preAudit),
    projectedAudit: execution.projectedAudit,
    postAudit,
    sourceArtifacts: {
      history: {
        path: inputs.history.path,
        sha256: inputs.history.sha256,
        bytes: inputs.history.bytes
      },
      repairPlan: {
        path: inputs.plan.path,
        sha256: inputs.plan.sha256,
        bytes: inputs.plan.bytes
      },
      resolutionBundle: {
        path: inputs.resolution.path,
        sha256: inputs.resolution.sha256,
        bytes: inputs.resolution.bytes
      },
      authoritativeManifest: {
        path: inputs.manifest.path,
        sha256: inputs.manifest.sha256,
        bytes: inputs.manifest.bytes
      },
      sourceReliability: {
        path: inputs.reliability.path,
        sha256: inputs.reliability.sha256,
        bytes: inputs.reliability.bytes
      }
    },
    outputHistory: {
      path: inputs.history.path,
      sha256: execution.outputSha256,
      bytes: execution.outputBuffer.length,
      deterministic: true
    },
    safety: {
      dryRunDefault: true,
      exactInputHashesRequiredForWrite: true,
      exactProjectedOutputHashRequiredForWrite: true,
      explicitScopeConfirmationRequired: true,
      backupOutsideRepositoryRequired: true,
      atomicWrite: true,
      postWriteAuditRequired: true,
      rollbackOnPostWriteFailure: true,
      suppressedClaimsEmbeddedAsLineage: true
    },
    guarantees: {
      truthWrites: writeMode ? 1 : 0,
      truthFilesChanged: writeMode ? 1 : 0,
      historyFilesChanged: writeMode ? 1 : 0,
      h2hWrites: 0,
      sourceReliabilityWrites: 0,
      archiveWrites: 0,
      resultsMemoryWrites: 0,
      suppressedClaimsPreserved: execution.summary.suppressedClaimsPreserved,
      automaticUnreviewedResolutions: 0
    },
    backups,
    rolledBack
  };
}

function validateInputSchemas(inputs) {
  if (inputs.plan.value?.schema !== EXPECTED_PLAN_SCHEMA) {
    throw new Error(`unexpected_repair_plan_schema:${inputs.plan.value?.schema}`);
  }
  if (inputs.resolution.value?.schema !== EXPECTED_BUNDLE_SCHEMA) {
    throw new Error(`unexpected_resolution_bundle_schema:${inputs.resolution.value?.schema}`);
  }
  if (inputs.manifest.value?.schema !== EXPECTED_MANIFEST_SCHEMA) {
    throw new Error(`unexpected_authoritative_manifest_schema:${inputs.manifest.value?.schema}`);
  }
  if (inputs.resolution.value?.summary?.authoritativelySupportedResolutions !== 2) {
    throw new Error("resolution_bundle_does_not_have_exactly_two_supported_resolutions");
  }
  if (inputs.resolution.value?.summary?.unresolvedResolutionGroups !== 0) {
    throw new Error("resolution_bundle_contains_unresolved_history_groups");
  }
  if (inputs.resolution.value?.summary?.h2hDeferredBlocks !== 2) {
    throw new Error("resolution_bundle_h2h_deferred_contract_changed");
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    historyPath: null,
    planPath: null,
    resolutionBundlePath: null,
    manifestPath: null,
    sourceReliabilityPath: null,
    reportPath: null,
    backupDir: null,
    write: false,
    confirmScope: null,
    expectedHistorySha256: null,
    expectedPlanSha256: null,
    expectedResolutionSha256: null,
    expectedManifestSha256: null,
    expectedReliabilitySha256: null,
    expectedOutputSha256: null,
    enforceCanonicalHistoryPath: true,
    help: false
  };
  for (const arg of argv) {
    if (arg.startsWith("--history=")) out.historyPath = path.resolve(arg.slice(10));
    else if (arg.startsWith("--plan=")) out.planPath = path.resolve(arg.slice(7));
    else if (arg.startsWith("--resolution-bundle=")) {
      out.resolutionBundlePath = path.resolve(arg.slice("--resolution-bundle=".length));
    } else if (arg.startsWith("--manifest=")) out.manifestPath = path.resolve(arg.slice(11));
    else if (arg.startsWith("--source-reliability=")) {
      out.sourceReliabilityPath = path.resolve(arg.slice("--source-reliability=".length));
    } else if (arg.startsWith("--report=")) out.reportPath = path.resolve(arg.slice(9));
    else if (arg.startsWith("--backup-dir=")) out.backupDir = path.resolve(arg.slice(13));
    else if (arg === "--write") out.write = true;
    else if (arg.startsWith("--confirm-scope=")) {
      out.confirmScope = arg.slice("--confirm-scope=".length);
    } else if (arg.startsWith("--expected-history-sha256=")) {
      out.expectedHistorySha256 = arg.slice("--expected-history-sha256=".length).toLowerCase();
    } else if (arg.startsWith("--expected-plan-sha256=")) {
      out.expectedPlanSha256 = arg.slice("--expected-plan-sha256=".length).toLowerCase();
    } else if (arg.startsWith("--expected-resolution-sha256=")) {
      out.expectedResolutionSha256 = arg
        .slice("--expected-resolution-sha256=".length)
        .toLowerCase();
    } else if (arg.startsWith("--expected-manifest-sha256=")) {
      out.expectedManifestSha256 = arg
        .slice("--expected-manifest-sha256=".length)
        .toLowerCase();
    } else if (arg.startsWith("--expected-reliability-sha256=")) {
      out.expectedReliabilitySha256 = arg
        .slice("--expected-reliability-sha256=".length)
        .toLowerCase();
    } else if (arg.startsWith("--expected-output-sha256=")) {
      out.expectedOutputSha256 = arg
        .slice("--expected-output-sha256=".length)
        .toLowerCase();
    } else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`unknown_argument:${arg}`);
  }
  return out;
}

function requirePaths(options) {
  const required = [
    ["history", options.historyPath],
    ["plan", options.planPath],
    ["resolution-bundle", options.resolutionBundlePath],
    ["manifest", options.manifestPath],
    ["source-reliability", options.sourceReliabilityPath],
    ["report", options.reportPath]
  ];
  for (const [label, value] of required) {
    if (!value) throw new Error(`missing_required_${label}_path`);
    if (label !== "report" && !fs.existsSync(value)) {
      throw new Error(`${label}_file_not_found:${value}`);
    }
  }
}

function verifyWriteContract(options, inputs, outputSha256) {
  if (options.confirmScope !== AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE) {
    throw new Error(
      `write_scope_confirmation_mismatch:expected=${AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE}`
    );
  }
  assertHash("history", inputs.history.sha256, options.expectedHistorySha256, true);
  assertHash("plan", inputs.plan.sha256, options.expectedPlanSha256, true);
  assertHash(
    "resolution_bundle",
    inputs.resolution.sha256,
    options.expectedResolutionSha256,
    true
  );
  assertHash("manifest", inputs.manifest.sha256, options.expectedManifestSha256, true);
  assertHash(
    "source_reliability",
    inputs.reliability.sha256,
    options.expectedReliabilitySha256,
    true
  );
  assertHash("projected_output", outputSha256, options.expectedOutputSha256, true);
}

export function runAuthoritativeResolutionExecution(options = {}) {
  requirePaths(options);
  const historyPath = options.enforceCanonicalHistoryPath === false
    ? path.resolve(options.historyPath)
    : assertCanonicalHistoryPath(options.historyPath);
  const reportPath = assertSafeArtifactPath(options.reportPath);

  const inputs = {
    history: readJsonWithHash(historyPath),
    plan: readJsonWithHash(path.resolve(options.planPath)),
    resolution: readJsonWithHash(path.resolve(options.resolutionBundlePath)),
    manifest: readJsonWithHash(path.resolve(options.manifestPath)),
    reliability: readJsonWithHash(path.resolve(options.sourceReliabilityPath))
  };
  validateInputSchemas(inputs);

  assertHash("history", inputs.history.sha256, options.expectedHistorySha256);
  assertHash("plan", inputs.plan.sha256, options.expectedPlanSha256);
  assertHash(
    "resolution_bundle",
    inputs.resolution.sha256,
    options.expectedResolutionSha256
  );
  assertHash("manifest", inputs.manifest.sha256, options.expectedManifestSha256);
  assertHash(
    "source_reliability",
    inputs.reliability.sha256,
    options.expectedReliabilitySha256
  );
  assertBundleSourceContracts({
    historyInput: inputs.history,
    planInput: inputs.plan,
    resolutionInput: inputs.resolution,
    manifestInput: inputs.manifest,
    reliabilityInput: inputs.reliability
  });

  const preAudit = currentAudit(inputs.history.value);
  assertPreExecutionAudit(preAudit);

  const regenerated = buildRegeneratedResolution({
    history: inputs.history.value,
    plan: inputs.plan.value,
    manifest: inputs.manifest.value,
    reliability: inputs.reliability.value
  });
  assertResolutionBundleParity(inputs.resolution.value, regenerated.report);

  const execution = buildAuthoritativeHistoryResolutionExecution({
    historyPayload: inputs.history.value,
    repairPlan: inputs.plan.value,
    resolutionBundle: inputs.resolution.value,
    regeneratedResolutionReport: regenerated.report,
    manifestSha256: inputs.manifest.sha256,
    resolutionBundleSha256: inputs.resolution.sha256
  });

  if (!options.write) {
    const report = makeReport({
      mode: "dry-run",
      inputs,
      execution,
      preAudit
    });
    writeJsonAtomic(reportPath, report);
    return report;
  }

  verifyWriteContract(options, inputs, execution.outputSha256);
  const backupDir = assertExternalBackupDir(options.backupDir);
  let backup = null;
  let rolledBack = false;
  try {
    const writeResult = writeHistoryWithRollback({
      historyInput: inputs.history,
      outputBuffer: execution.outputBuffer,
      backupDir,
      verifyAfterWrite: () => assertPostWriteAudit({
        outputSha256: execution.outputSha256,
        historyPath,
        execution,
        inputArtifacts: {
          repairPlan: inputs.plan,
          resolutionBundle: inputs.resolution,
          authoritativeManifest: inputs.manifest,
          sourceReliability: inputs.reliability
        }
      })
    });
    backup = writeResult.backup;
    const postAudit = writeResult.verification;
    const report = makeReport({
      mode: "write",
      inputs,
      execution,
      preAudit,
      postAudit,
      backups: [backup],
      rolledBack
    });
    writeJsonAtomic(reportPath, report);
    return report;
  } catch (error) {
    backup = error?.rollback?.backup || backup;
    rolledBack = Boolean(error?.rollback?.rolledBack);
    if (!rolledBack && backup) {
      restoreBackup(backup);
      rolledBack = true;
    }
    const failureReport = {
      ok: false,
      status: "rolled_back",
      schema: HISTORY_AUTHORITATIVE_RESOLUTION_EXECUTION_SCHEMA,
      generatedAt: new Date().toISOString(),
      mode: "write",
      scope: AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE,
      error: error?.message || String(error),
      sourceHistorySha256: inputs.history.sha256,
      projectedOutputSha256: execution.outputSha256,
      backups: backup ? [backup] : [],
      rolledBack,
      guarantees: {
        finalTruthWrites: 0,
        finalTruthFilesChanged: 0,
        h2hWrites: 0,
        sourceReliabilityWrites: 0
      }
    };
    try {
      writeJsonAtomic(reportPath, failureReport);
    } catch {
      // The original error and successful rollback remain authoritative.
    }
    const wrapped = new Error(
      `${error?.message || error}; history restored from verified external backup`
    );
    wrapped.executionReport = failureReport;
    throw wrapped;
  }
}

function compactCli(report) {
  return {
    ok: report.ok,
    status: report.status,
    mode: report.mode,
    schema: report.schema,
    generatedAt: report.generatedAt,
    summary: report.summary,
    sourceArtifacts: report.sourceArtifacts,
    outputHistory: report.outputHistory,
    preAudit: report.preAudit,
    projectedAudit: report.projectedAudit,
    postAudit: report.postAudit,
    guarantees: report.guarantees,
    backups: report.backups,
    rolledBack: report.rolledBack
  };
}

function usage() {
  return [
    "Dry-run:",
    "  node engine-v1/jobs/apply-history-authoritative-resolution.js \\",
    "    --history=<data/history/2025-2026.json> --plan=<phase3-plan.json> \\",
    "    --resolution-bundle=<phase7-summary.json> --manifest=<phase7-manifest.json> \\",
    "    --source-reliability=<data/source-reliability.json> --report=<dry-run-report.json>",
    "",
    "Write requires all five reviewed input hashes, the dry-run output hash,",
    `--confirm-scope=${AUTHORITATIVE_RESOLUTION_CONFIRM_SCOPE}, and an external --backup-dir.`
  ].join("\n");
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  try {
    const args = parseArgs();
    if (args.help) {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    const report = runAuthoritativeResolutionExecution(args);
    process.stdout.write(`${JSON.stringify(compactCli(report), null, 2)}\n`);
    process.exitCode = report.ok ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      schema: HISTORY_AUTHORITATIVE_RESOLUTION_EXECUTION_SCHEMA,
      error: error?.message || String(error),
      rolledBack: Boolean(error?.executionReport?.rolledBack)
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
