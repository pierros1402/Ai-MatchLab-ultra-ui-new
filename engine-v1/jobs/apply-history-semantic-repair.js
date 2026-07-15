/**
 * apply-history-semantic-repair.js
 *
 * Phase 4 deterministic executor for current-history repair plans.
 *
 * Safety contract:
 * - dry-run by default
 * - applies only deterministic current-history deduplication/day-normalization actions
 * - refuses score/orientation/H2H resolution
 * - exact row selectors; any source drift fails closed
 * - write mode requires expected SHA-256 hashes and explicit scope confirmation
 * - atomic history writes with backups
 * - post-write semantic audit; automatic rollback on invariant failure
 *
 * Dry-run:
 *   node engine-v1/jobs/apply-history-semantic-repair.js \
 *     --plan=C:\\...\\AI_MATCHLAB_PHASE3_REPAIR_PLAN_2026-07-15.json \
 *     --report=C:\\...\\AI_MATCHLAB_PHASE4_DRY_RUN.json
 *
 * Write (only after reviewing dry-run hashes):
 *   node engine-v1/jobs/apply-history-semantic-repair.js \
 *     --plan=C:\\...\\AI_MATCHLAB_PHASE3_REPAIR_PLAN_2026-07-15.json \
 *     --write \
 *     --confirm-scope=current-history-deterministic-only \
 *     --expected-plan-sha256=<hash> \
 *     --expected-history-sha256=<hash> \
 *     --report=C:\\...\\AI_MATCHLAB_PHASE4_WRITE_REPORT.json
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { buildSemanticHistoryAudit } from "./audit-history-semantic-integrity.js";

const __filename = fileURLToPath(import.meta.url);
const PLAN_SCHEMA = "ai-matchlab.history-semantic-repair-plan.v1";
const REPORT_SCHEMA = "ai-matchlab.history-semantic-repair-execution.v1";
const CONFIRM_SCOPE = "current-history-deterministic-only";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function sha256Json(value) {
  return sha256Buffer(Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8"));
}

function normalizeContainer(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
}

function canonicalJsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function kickoffMs(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function sameText(a, b) {
  return String(a ?? "") === String(b ?? "");
}

function selectorMatchesRow(selector, row) {
  if (!selector || !row) return false;
  if (!sameText(selector.id, row.id)) return false;
  if (!sameText(selector.homeTeam, row.homeTeam)) return false;
  if (!sameText(selector.awayTeam, row.awayTeam)) return false;
  if (Number(selector.scoreHome) !== Number(row.scoreHome)) return false;
  if (Number(selector.scoreAway) !== Number(row.scoreAway)) return false;

  const selectorKickoff = kickoffMs(selector.kickoff);
  const rowKickoff = kickoffMs(row.kickoff);
  if (selectorKickoff === null || rowKickoff === null || selectorKickoff !== rowKickoff) {
    return false;
  }
  return true;
}

function locationKey(container, dayIndex, rowIndex) {
  return `${container}|${dayIndex}|${rowIndex}`;
}

function flattenHistoryDocument(container, document) {
  const out = [];
  const days = Array.isArray(document?.days) ? document.days : [];
  days.forEach((day, dayIndex) => {
    const rows = Array.isArray(day?.rows) ? day.rows : [];
    rows.forEach((row, rowIndex) => {
      out.push({
        container,
        dayIndex,
        rowIndex,
        dayKey: day?.dayKey || null,
        key: locationKey(container, dayIndex, rowIndex),
        row
      });
    });
  });
  return out;
}

function findExactLocation(container, document, selector, label) {
  const matches = flattenHistoryDocument(container, document)
    .filter(item => {
      if (!selectorMatchesRow(selector, item.row)) return false;
      if (selector?.declaredDay) {
        return item.dayKey === selector.declaredDay
          && String(item.row?.dayKey || "") === selector.declaredDay;
      }
      return true;
    });

  if (matches.length !== 1) {
    throw new Error(
      `${label}: expected exactly one source row, found ${matches.length}; `
      + `id=${selector?.id || "null"}, container=${container}`
    );
  }
  return matches[0];
}

function validatePlanShape(plan) {
  if (!plan || plan.schema !== PLAN_SCHEMA) {
    throw new Error(`Unsupported plan schema: ${plan?.schema || "missing"}`);
  }
  if (plan.ok !== true) throw new Error("Repair plan must have ok=true.");
  if (!Array.isArray(plan?.actions?.currentHistoryDedup)) {
    throw new Error("Repair plan is missing currentHistoryDedup actions.");
  }
  if (!Array.isArray(plan?.actions?.currentHistoryDayNormalization)) {
    throw new Error("Repair plan is missing currentHistoryDayNormalization actions.");
  }

  for (const action of plan.actions.currentHistoryDedup) {
    if (action?.actionType !== "deduplicate_current_history_same_score") {
      throw new Error(`Unsupported action type: ${action?.actionType || "missing"}`);
    }
    if (action?.confidence !== "deterministic") {
      throw new Error(`Non-deterministic dedup action rejected: ${action?.actionId}`);
    }
    if (!action?.retainRow || !Array.isArray(action?.removeRows) || action.removeRows.length === 0) {
      throw new Error(`Incomplete dedup action: ${action?.actionId}`);
    }
  }

  for (const action of plan.actions.currentHistoryDayNormalization) {
    if (action?.actionType !== "normalize_current_history_operational_day") {
      throw new Error(`Unsupported action type: ${action?.actionType || "missing"}`);
    }
    if (action?.confidence !== "deterministic_timezone_contract") {
      throw new Error(`Non-deterministic day action rejected: ${action?.actionId}`);
    }
    if (!action?.row || !action?.fromDay || !action?.toDay || action.fromDay === action.toDay) {
      throw new Error(`Incomplete day-normalization action: ${action?.actionId}`);
    }
  }
}

function collectPlanContainers(plan) {
  const containers = new Set();
  for (const action of plan.actions.currentHistoryDedup) {
    containers.add(normalizeContainer(action?.retainRow?.container));
    for (const row of action.removeRows) containers.add(normalizeContainer(row?.container));
  }
  for (const action of plan.actions.currentHistoryDayNormalization) {
    containers.add(normalizeContainer(action?.row?.container));
  }
  containers.delete("");
  return [...containers].sort();
}

function ensureContainerScope(container) {
  if (!container.startsWith("history/") || !container.endsWith(".json")) {
    throw new Error(`Out-of-scope truth container rejected: ${container}`);
  }
}

function resolveContainerPath(container) {
  ensureContainerScope(container);
  return resolveDataPath(...container.split("/"));
}

function collectOperations(plan, documents) {
  const removeKeys = new Set();
  const moveTargets = new Map();
  const touchedBy = new Map();
  const actionResults = [];

  function claim(key, actionId, role) {
    const previous = touchedBy.get(key);
    if (previous) {
      throw new Error(
        `Overlapping repair actions rejected for ${key}: `
        + `${previous.actionId}/${previous.role} and ${actionId}/${role}`
      );
    }
    touchedBy.set(key, { actionId, role });
  }

  for (const action of plan.actions.currentHistoryDedup) {
    const retainContainer = normalizeContainer(action.retainRow.container);
    const retainDocument = documents.get(retainContainer);
    if (!retainDocument) throw new Error(`Missing document: ${retainContainer}`);

    const retain = findExactLocation(
      retainContainer,
      retainDocument,
      action.retainRow,
      `${action.actionId}/retain`
    );
    claim(retain.key, action.actionId, "retain");

    const removed = [];
    for (const selector of action.removeRows) {
      const container = normalizeContainer(selector.container);
      if (container !== retainContainer) {
        throw new Error(`${action.actionId}: cross-container deduplication is not allowed.`);
      }
      const located = findExactLocation(
        container,
        documents.get(container),
        selector,
        `${action.actionId}/remove`
      );
      claim(located.key, action.actionId, "remove");
      removeKeys.add(located.key);
      removed.push(located);
    }

    if (action.normalizeRetainedDay) {
      const from = action.normalizeRetainedDay.from;
      const to = action.normalizeRetainedDay.to;
      if (retain.row.dayKey !== from || retain.dayKey !== from) {
        throw new Error(
          `${action.actionId}: retained row day drift; expected ${from}, `
          + `found row=${retain.row.dayKey}, bucket=${retain.dayKey}`
        );
      }
      moveTargets.set(retain.key, to);
    }

    actionResults.push({
      actionId: action.actionId,
      actionType: action.actionType,
      retain: { container: retain.container, dayKey: retain.dayKey, id: retain.row.id },
      removed: removed.map(item => ({
        container: item.container,
        dayKey: item.dayKey,
        id: item.row.id
      })),
      normalizedToDay: moveTargets.get(retain.key) || null,
      status: "validated_for_execution"
    });
  }

  for (const action of plan.actions.currentHistoryDayNormalization) {
    const container = normalizeContainer(action.row.container);
    const document = documents.get(container);
    if (!document) throw new Error(`Missing document: ${container}`);
    const located = findExactLocation(
      container,
      document,
      action.row,
      `${action.actionId}/normalize`
    );
    claim(located.key, action.actionId, "normalize_day");

    if (located.row.dayKey !== action.fromDay || located.dayKey !== action.fromDay) {
      throw new Error(
        `${action.actionId}: source day drift; expected ${action.fromDay}, `
        + `found row=${located.row.dayKey}, bucket=${located.dayKey}`
      );
    }
    moveTargets.set(located.key, action.toDay);
    actionResults.push({
      actionId: action.actionId,
      actionType: action.actionType,
      row: { container, dayKey: located.dayKey, id: located.row.id },
      normalizedToDay: action.toDay,
      status: "validated_for_execution"
    });
  }

  return { removeKeys, moveTargets, actionResults };
}

function sortRows(rows) {
  rows.sort((a, b) => {
    const aMs = Number.isFinite(Number(a?.kickoff_ms))
      ? Number(a.kickoff_ms)
      : kickoffMs(a?.kickoff) ?? Number.MAX_SAFE_INTEGER;
    const bMs = Number.isFinite(Number(b?.kickoff_ms))
      ? Number(b.kickoff_ms)
      : kickoffMs(b?.kickoff) ?? Number.MAX_SAFE_INTEGER;
    return aMs - bMs || String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

function transformHistoryDocument(container, source, removeKeys, moveTargets, planGeneratedAt) {
  const document = deepClone(source);
  const sourceDays = Array.isArray(source?.days) ? source.days : [];
  const metadataByDay = new Map();
  const rowsByDay = new Map();
  const changedDays = new Set();
  let rowsBefore = 0;
  let rowsRemoved = 0;
  let rowsMoved = 0;

  sourceDays.forEach((day, dayIndex) => {
    const dayKey = String(day?.dayKey || "");
    metadataByDay.set(dayKey, deepClone(day));
    if (!rowsByDay.has(dayKey)) rowsByDay.set(dayKey, []);
    const rows = Array.isArray(day?.rows) ? day.rows : [];
    rowsBefore += rows.length;

    rows.forEach((row, rowIndex) => {
      const key = locationKey(container, dayIndex, rowIndex);
      if (removeKeys.has(key)) {
        rowsRemoved += 1;
        changedDays.add(dayKey);
        return;
      }

      const targetDay = moveTargets.get(key) || dayKey;
      const nextRow = deepClone(row);
      if (targetDay !== dayKey) {
        nextRow.dayKey = targetDay;
        rowsMoved += 1;
        changedDays.add(dayKey);
        changedDays.add(targetDay);
      }
      if (!rowsByDay.has(targetDay)) rowsByDay.set(targetDay, []);
      rowsByDay.get(targetDay).push(nextRow);
    });
  });

  const planTimestamp = Date.parse(String(planGeneratedAt || ""));
  const fallbackUpdatedAt = Number.isFinite(planTimestamp) ? planTimestamp : 0;
  const allDayKeys = [...rowsByDay.keys()].sort();
  const days = [];

  for (const dayKey of allDayKeys) {
    const rows = rowsByDay.get(dayKey) || [];
    if (rows.length === 0) continue;
    sortRows(rows);
    const previous = metadataByDay.get(dayKey) || {};
    days.push({
      ...previous,
      dayKey,
      matchCount: rows.length,
      rows,
      updatedAt: previous.updatedAt ?? fallbackUpdatedAt
    });
  }

  document.days = days;
  const rowsAfter = days.reduce((sum, day) => sum + day.rows.length, 0);
  return {
    document,
    stats: {
      rowsBefore,
      rowsAfter,
      rowsRemoved,
      rowsMoved,
      changedDays: [...changedDays].sort()
    }
  };
}

export function buildDeterministicHistoryExecution(options = {}) {
  const plan = options.planReport;
  const documentsInput = options.historyDocuments;
  validatePlanShape(plan);

  const containers = collectPlanContainers(plan);
  if (containers.length === 0) throw new Error("Repair plan contains no history containers.");

  const documents = new Map();
  for (const container of containers) {
    ensureContainerScope(container);
    const value = documentsInput instanceof Map
      ? documentsInput.get(container)
      : documentsInput?.[container];
    if (!value) throw new Error(`Missing history document input: ${container}`);
    documents.set(container, value);
  }

  const operations = collectOperations(plan, documents);
  const outputs = new Map();
  const files = [];

  for (const container of containers) {
    const transformed = transformHistoryDocument(
      container,
      documents.get(container),
      operations.removeKeys,
      operations.moveTargets,
      plan.generatedAt
    );
    outputs.set(container, transformed.document);
    files.push({ container, ...transformed.stats });
  }

  const expectedRemoved = plan.actions.currentHistoryDedup.reduce(
    (sum, action) => sum + action.removeRows.length,
    0
  );
  const actualRemoved = files.reduce((sum, file) => sum + file.rowsRemoved, 0);
  const expectedMoved = plan.actions.currentHistoryDayNormalization.length
    + plan.actions.currentHistoryDedup.filter(action => action.normalizeRetainedDay).length;
  const actualMoved = files.reduce((sum, file) => sum + file.rowsMoved, 0);

  if (actualRemoved !== expectedRemoved) {
    throw new Error(`Removal count mismatch: expected ${expectedRemoved}, got ${actualRemoved}`);
  }
  if (actualMoved !== expectedMoved) {
    throw new Error(`Move count mismatch: expected ${expectedMoved}, got ${actualMoved}`);
  }

  return {
    outputs,
    files,
    actionResults: operations.actionResults,
    summary: {
      dedupActionsValidated: plan.actions.currentHistoryDedup.length,
      dayNormalizationActionsValidated: plan.actions.currentHistoryDayNormalization.length,
      rowsToRemove: actualRemoved,
      rowsToMove: actualMoved,
      blockedItemsPreserved: Number(plan?.summary?.blocked?.total || 0),
      deferredItemsUntouched: {
        historyArchiveSemanticDuplicateGroups:
          Number(plan?.summary?.deferred?.historyArchiveSemanticDuplicateGroups || 0),
        resultsMemorySemanticDuplicateGroups:
          Number(plan?.summary?.deferred?.resultsMemorySemanticDuplicateGroups || 0),
        resultsMemoryOrphanMatchIds:
          Number(plan?.summary?.deferred?.resultsMemoryOrphanMatchIds || 0)
      }
    }
  };
}

function readPlan(planPath) {
  const raw = fs.readFileSync(planPath);
  return {
    raw,
    sha256: sha256Buffer(raw),
    report: JSON.parse(raw.toString("utf8"))
  };
}

function readHistoryDocuments(plan) {
  const documents = new Map();
  const sourceFiles = [];
  for (const container of collectPlanContainers(plan)) {
    const filePath = resolveContainerPath(container);
    const raw = fs.readFileSync(filePath);
    documents.set(container, JSON.parse(raw.toString("utf8")));
    sourceFiles.push({
      container,
      filePath,
      sha256: sha256Buffer(raw),
      bytes: raw.length
    });
  }
  return { documents, sourceFiles };
}

function makeExecutionReport({
  mode,
  planPath,
  planSha256,
  plan,
  sourceFiles,
  execution,
  postAudit = null,
  backups = [],
  rolledBack = false
}) {
  const fileReports = execution.files.map(file => {
    const source = sourceFiles.find(item => item.container === file.container);
    const output = execution.outputs.get(file.container);
    const outputBuffer = canonicalJsonBuffer(output);
    return {
      ...file,
      sourcePath: source?.filePath || null,
      sourceSha256: source?.sha256 || null,
      sourceBytes: source?.bytes || null,
      outputSha256: sha256Buffer(outputBuffer),
      outputBytes: outputBuffer.length
    };
  });

  return {
    ok: true,
    schema: REPORT_SCHEMA,
    mode,
    generatedAt: new Date().toISOString(),
    scope: CONFIRM_SCOPE,
    plan: {
      path: planPath,
      sha256: planSha256,
      schema: plan.schema,
      generatedAt: plan.generatedAt,
      readyToApply: plan.readyToApply,
      blockedItemsPreserved: Number(plan?.summary?.blocked?.total || 0)
    },
    safety: {
      dryRunDefault: true,
      sourceHashRequiredForWrite: true,
      planHashRequiredForWrite: true,
      atomicWrite: true,
      backupBeforeWrite: true,
      postAuditRequired: true,
      rollbackOnPostAuditFailure: true,
      blockedAndDeferredTruthWrites: 0
    },
    summary: execution.summary,
    files: fileReports,
    actions: execution.actionResults,
    backups,
    postAudit,
    rolledBack
  };
}

function writeJsonAtomic(filePath, value) {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, canonicalJsonBuffer(value));
  fs.renameSync(tempPath, filePath);
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupSourceFiles(sourceFiles, backupDir) {
  ensureDir(backupDir);
  const backups = [];
  const stamp = timestampSlug();
  for (const source of sourceFiles) {
    const base = path.basename(source.filePath, ".json");
    const backupPath = path.join(
      backupDir,
      `${base}.${stamp}.${source.sha256.slice(0, 12)}.json`
    );
    fs.copyFileSync(source.filePath, backupPath);
    backups.push({
      container: source.container,
      sourcePath: source.filePath,
      backupPath,
      sourceSha256: source.sha256
    });
  }
  return backups;
}

function restoreBackups(backups) {
  for (const backup of backups) {
    fs.copyFileSync(backup.backupPath, backup.sourcePath);
  }
}

function verifyExpectedHashes(args, planSha256, sourceFiles) {
  if (args.expectedPlanSha256 !== planSha256) {
    throw new Error(
      `Plan SHA-256 mismatch: expected ${args.expectedPlanSha256 || "missing"}, `
      + `actual ${planSha256}`
    );
  }
  if (sourceFiles.length !== 1) {
    throw new Error(
      "Write mode currently requires exactly one current-history source file."
    );
  }
  if (args.expectedHistorySha256 !== sourceFiles[0].sha256) {
    throw new Error(
      `History SHA-256 mismatch: expected ${args.expectedHistorySha256 || "missing"}, `
      + `actual ${sourceFiles[0].sha256}`
    );
  }
  if (args.confirmScope !== CONFIRM_SCOPE) {
    throw new Error(
    `    --confirm-scope=${CONFIRM_SCOPE}`,
    );
  }
}

function buildPostAuditSummary(audit) {
  return {
    ok: audit.ok,
    clean: audit.clean,
    issueCounts: audit.issueCounts,
    currentHistory: {
      rows: audit.currentHistory.rowCount,
      semanticDuplicateGroups: audit.currentHistory.semantic.duplicateGroups,
      duplicateIds: audit.currentHistory.duplicateIdCount,
      operationalDayMismatches: audit.currentHistory.operationalDayMismatchCount,
      scoreConflictGroups: audit.currentHistory.semantic.scoreConflictGroups,
      flippedOrientationGroups: audit.currentHistory.semantic.flippedOrientationGroups
    },
    h2h: {
      degradedPairKeys: audit.h2h.degradedPairKeyCount
    }
  };
}

function assertPostAudit(plan, execution, audit) {
  const expectedRows = execution.files.reduce((sum, file) => sum + file.rowsAfter, 0);
  const expectedScoreConflicts = Number(
    plan?.summary?.blocked?.currentHistoryScoreConflicts || 0
  );
  const expectedOrientation = Number(
    plan?.summary?.blocked?.currentHistoryFlippedOrientationGroups || 0
  );
  const expectedH2HDegraded = Number(plan?.summary?.blocked?.h2hDegradedPairKeys || 0);

  const failures = [];
  if (audit.currentHistory.rowCount !== expectedRows) {
    failures.push(`rows=${audit.currentHistory.rowCount}, expected=${expectedRows}`);
  }
  if (audit.currentHistory.semantic.duplicateGroups !== 0) {
    failures.push(`semanticDuplicateGroups=${audit.currentHistory.semantic.duplicateGroups}`);
  }
  if (audit.currentHistory.duplicateIdCount !== 0) {
    failures.push(`duplicateIds=${audit.currentHistory.duplicateIdCount}`);
  }
  if (audit.currentHistory.operationalDayMismatchCount !== 0) {
    failures.push(
      `operationalDayMismatches=${audit.currentHistory.operationalDayMismatchCount}`
    );
  }
  if (audit.currentHistory.semantic.scoreConflictGroups !== expectedScoreConflicts) {
    failures.push(
      `scoreConflicts=${audit.currentHistory.semantic.scoreConflictGroups}, `
      + `expected=${expectedScoreConflicts}`
    );
  }
  if (audit.currentHistory.semantic.flippedOrientationGroups !== expectedOrientation) {
    failures.push(
      `orientationConflicts=${audit.currentHistory.semantic.flippedOrientationGroups}, `
      + `expected=${expectedOrientation}`
    );
  }
  if (audit.h2h.degradedPairKeyCount !== expectedH2HDegraded) {
    failures.push(
      `h2hDegraded=${audit.h2h.degradedPairKeyCount}, expected=${expectedH2HDegraded}`
    );
  }
  if (failures.length) {
    throw new Error(`Post-repair semantic audit failed: ${failures.join("; ")}`);
  }
}

function parseArgs(argv) {
  const out = {
    plan: null,
    report: null,
    write: false,
    confirmScope: null,
    expectedPlanSha256: null,
    expectedHistorySha256: null,
    backupDir: null,
    help: false
  };
  for (const arg of argv) {
    if (arg.startsWith("--plan=")) out.plan = arg.slice("--plan=".length);
    else if (arg.startsWith("--report=")) out.report = arg.slice("--report=".length);
    else if (arg === "--write") out.write = true;
    else if (arg.startsWith("--confirm-scope=")) {
      out.confirmScope = arg.slice("--confirm-scope=".length);
    } else if (arg.startsWith("--expected-plan-sha256=")) {
      out.expectedPlanSha256 = arg.slice("--expected-plan-sha256=".length);
    } else if (arg.startsWith("--expected-history-sha256=")) {
      out.expectedHistorySha256 = arg.slice("--expected-history-sha256=".length);
    } else if (arg.startsWith("--backup-dir=")) {
      out.backupDir = arg.slice("--backup-dir=".length);
    } else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    "Usage (dry-run):",
    "  node engine-v1/jobs/apply-history-semantic-repair.js --plan=<repair-plan.json> [--report=<report.json>]",
    "",
    "Usage (write):",
    "  node engine-v1/jobs/apply-history-semantic-repair.js --plan=<repair-plan.json> --write \\",
    `    --confirm-scope=${CONFIRM_SCOPE}`,
    "    --expected-plan-sha256=<dry-run plan hash> \\",
    "    --expected-history-sha256=<dry-run source history hash> [--report=<report.json>]",
    "",
    "Write scope is limited to deterministic current-history dedup/day normalization.",
    "Blocked score/orientation/H2H and all deferred layers are preserved."
  ].join("\n");
}

function compactCli(report) {
  return {
    ok: report.ok,
    mode: report.mode,
    schema: report.schema,
    generatedAt: report.generatedAt,
    planSha256: report.plan.sha256,
    blockedItemsPreserved: report.plan.blockedItemsPreserved,
    summary: report.summary,
    files: report.files.map(file => ({
      container: file.container,
      rowsBefore: file.rowsBefore,
      rowsAfter: file.rowsAfter,
      rowsRemoved: file.rowsRemoved,
      rowsMoved: file.rowsMoved,
      sourceSha256: file.sourceSha256,
      outputSha256: file.outputSha256,
      changedDays: file.changedDays.length
    })),
    postAudit: report.postAudit,
    backups: report.backups,
    rolledBack: report.rolledBack
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  let report = null;
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    if (!args.plan) throw new Error("Missing required --plan=<path>.");

    const planPath = path.resolve(args.plan);
    const planInput = readPlan(planPath);
    validatePlanShape(planInput.report);
    const historyInput = readHistoryDocuments(planInput.report);
    const execution = buildDeterministicHistoryExecution({
      planReport: planInput.report,
      historyDocuments: historyInput.documents
    });

    if (!args.write) {
      report = makeExecutionReport({
        mode: "dry-run",
        planPath,
        planSha256: planInput.sha256,
        plan: planInput.report,
        sourceFiles: historyInput.sourceFiles,
        execution
      });
    } else {
      verifyExpectedHashes(args, planInput.sha256, historyInput.sourceFiles);
      const backupDir = args.backupDir
        ? path.resolve(args.backupDir)
        : resolveDataPath("history-integrity", "backups");
      const backups = backupSourceFiles(historyInput.sourceFiles, backupDir);
      let rolledBack = false;
      let postAudit = null;
      try {
        for (const source of historyInput.sourceFiles) {
          writeJsonAtomic(source.filePath, execution.outputs.get(source.container));
        }
        const audit = buildSemanticHistoryAudit({ maxExamples: 100000 });
        assertPostAudit(planInput.report, execution, audit);
        postAudit = buildPostAuditSummary(audit);
      } catch (error) {
        restoreBackups(backups);
        rolledBack = true;
        throw new Error(`${error.message}; history files restored from backup.`);
      }
      report = makeExecutionReport({
        mode: "write",
        planPath,
        planSha256: planInput.sha256,
        plan: planInput.report,
        sourceFiles: historyInput.sourceFiles,
        execution,
        postAudit,
        backups,
        rolledBack
      });
    }

    if (args.report) {
      writeJsonAtomic(path.resolve(args.report), report);
    }
    console.log(JSON.stringify(compactCli(report), null, 2));
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({
      ok: false,
      schema: REPORT_SCHEMA,
      error: error?.message || String(error),
      rolledBack: Boolean(report?.rolledBack)
    }, null, 2));
    process.exit(1);
  }
}
