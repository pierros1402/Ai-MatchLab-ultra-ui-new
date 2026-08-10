import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import { createProductionEvidenceIdentityOverlay } from "../core/production-evidence-identity-overlay.js";
import { canonicalH2HTeamIdentity } from "../core/h2h-canonical-key-policy.js";
import { auditHistoryRows } from "./audit-history-semantic-integrity.js";

export const CURRENT_HISTORY_IDENTITY_ALIAS_REPAIR_SCHEMA =
  "ai-matchlab.current-history-identity-alias-repair.v1";

const HISTORY_FILES = Object.freeze([
  "2025-2026.json",
  "2026-2027.json",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function atomicWriteJson(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function listResultMemoryIds(resultsDir) {
  const ids = new Set();
  for (const name of fs.readdirSync(resultsDir).filter(name => name.endsWith(".json")).sort()) {
    const payload = readJson(path.join(resultsDir, name));
    for (const entries of Object.values(payload?.teams || {})) {
      for (const entry of Array.isArray(entries) ? entries : []) {
        const id = clean(entry?.matchId || entry?.id);
        if (id) ids.add(id);
      }
    }
  }
  return ids;
}

function canonicalizedHistoryView(row, overlay) {
  const overlaid = overlay.overlayEvidenceMatchRow(row);
  if (!overlaid?.ok) {
    throw new Error(`current_history_identity_overlay_failed:${clean(row?.id)}:${overlaid?.status || "unknown"}`);
  }
  const home = canonicalH2HTeamIdentity(overlaid.homeResolution.preferredDisplayName);
  const away = canonicalH2HTeamIdentity(overlaid.awayResolution.preferredDisplayName);
  if (!home.valid || !away.valid) {
    throw new Error(`current_history_h2h_team_identity_invalid:${clean(row?.id)}`);
  }
  return {
    ...clone(row),
    homeTeam: home.canonicalName || overlaid.homeResolution.preferredDisplayName,
    awayTeam: away.canonicalName || overlaid.awayResolution.preferredDisplayName,
  };
}

function chooseRetainedId(groupRows, sourceById, resultMemoryIds, overlay) {
  const enriched = groupRows.map(example => {
    const id = clean(example?.id);
    const source = sourceById.get(id);
    if (!source) throw new Error(`current_history_duplicate_source_row_missing:${id}`);
    const resolution = overlay.overlayEvidenceMatchRow(source.row);
    if (!resolution?.ok) {
      throw new Error(`current_history_duplicate_identity_overlay_failed:${id}:${resolution?.status || "unknown"}`);
    }
    return {
      id,
      sourceRole: clean(resolution.fixtureResolution?.sourceRole),
      fixtureManaged: resolution.fixtureResolution?.managed === true,
      inResultsMemory: resultMemoryIds.has(id),
      repositoryCanonicalId: id.startsWith("cid_"),
    };
  });

  const retained = enriched.filter(x => x.sourceRole === "retained");
  if (retained.length === 1) {
    return { keepId: retained[0].id, reason: "production_fixture_retained_lineage", enriched };
  }
  if (retained.length > 1) {
    throw new Error(`current_history_duplicate_multiple_retained_lineage:${retained.map(x => x.id).join(",")}`);
  }

  const inResults = enriched.filter(x => x.inResultsMemory);
  if (inResults.length === 1) {
    return { keepId: inResults[0].id, reason: "clean_results_memory_retained_id", enriched };
  }
  if (inResults.length > 1) {
    throw new Error(`current_history_duplicate_multiple_results_retained_ids:${inResults.map(x => x.id).join(",")}`);
  }

  const canonicalIds = enriched.filter(x => x.repositoryCanonicalId);
  if (canonicalIds.length === 1) {
    return { keepId: canonicalIds[0].id, reason: "repository_canonical_id_over_provider_id", enriched };
  }

  throw new Error(`current_history_duplicate_retention_ambiguous:${enriched.map(x => x.id).join(",")}`);
}

export function buildCurrentHistoryIdentityAliasRepairPlan({
  historyRoot = resolveDataPath("history"),
  resultsRoot = resolveDataPath("league-memory", "results"),
  overlay = createProductionEvidenceIdentityOverlay(),
} = {}) {
  const documents = HISTORY_FILES.map(name => ({
    name,
    filePath: path.join(historyRoot, name),
    payload: readJson(path.join(historyRoot, name)),
  }));
  const sourceById = new Map();
  const transformed = [];

  for (const doc of documents) {
    for (let dayIndex = 0; dayIndex < (doc.payload?.days || []).length; dayIndex++) {
      const day = doc.payload.days[dayIndex];
      for (let rowIndex = 0; rowIndex < (day?.rows || []).length; rowIndex++) {
        const row = day.rows[rowIndex];
        const id = clean(row?.id || row?.matchId);
        if (!id) throw new Error(`current_history_row_id_required:${doc.name}:${dayIndex}:${rowIndex}`);
        if (sourceById.has(id)) throw new Error(`current_history_duplicate_id_precondition_failed:${id}`);
        sourceById.set(id, { doc: doc.name, dayIndex, rowIndex, row });
        transformed.push({
          ...canonicalizedHistoryView(row, overlay),
          __container: doc.name,
        });
      }
    }
  }

  const audit = auditHistoryRows(transformed, { maxExamples: 10000 });
  if (audit.invalidRowCount || audit.duplicateIdCount || audit.operationalDayMismatchCount ||
      audit.semantic.scoreConflictGroups || audit.semantic.flippedOrientationGroups ||
      audit.semantic.crossOperationalDayGroups) {
    throw new Error("current_history_identity_alias_repair_precondition_failed");
  }
  if (audit.semantic.duplicateGroups !== audit.semantic.examples.semanticDuplicates.length) {
    throw new Error("current_history_identity_alias_duplicate_examples_incomplete");
  }

  const resultMemoryIds = listResultMemoryIds(resultsRoot);
  const removals = [];
  const groups = [];
  const reasonCounts = {};

  for (const group of audit.semantic.examples.semanticDuplicates) {
    const selection = chooseRetainedId(group.rows, sourceById, resultMemoryIds, overlay);
    const removeIds = group.rows.map(row => clean(row.id)).filter(id => id !== selection.keepId);
    if (removeIds.length !== group.rows.length - 1) {
      throw new Error(`current_history_identity_alias_removal_count_invalid:${selection.keepId}`);
    }
    reasonCounts[selection.reason] = (reasonCounts[selection.reason] || 0) + 1;
    groups.push({
      pair: group.pair,
      score: group.score,
      keepId: selection.keepId,
      removeIds,
      reason: selection.reason,
      candidates: selection.enriched,
    });
    removals.push(...removeIds);
  }

  const uniqueRemovals = new Set(removals);
  if (uniqueRemovals.size !== removals.length) {
    throw new Error("current_history_identity_alias_removal_overlap");
  }

  return {
    schema: CURRENT_HISTORY_IDENTITY_ALIAS_REPAIR_SCHEMA,
    ok: true,
    historyRoot,
    resultsRoot,
    sourceRows: transformed.length,
    duplicateGroups: audit.semantic.duplicateGroups,
    rowsToRemove: removals.length,
    groups,
    removals: [...uniqueRemovals].sort(),
    reasonCounts,
    sourceById,
    documents,
    authorization: {
      writeAuthorized: false,
      sourceTruthMutationAuthorized: false,
    },
  };
}

export function applyCurrentHistoryIdentityAliasRepair({
  plan,
  backupDir,
} = {}) {
  if (!plan?.ok || !Array.isArray(plan.removals)) {
    throw new Error("current_history_identity_alias_repair_plan_required");
  }
  if (!clean(backupDir)) {
    throw new Error("current_history_identity_alias_backup_dir_required");
  }
  fs.mkdirSync(backupDir, { recursive: true });

  const removalSet = new Set(plan.removals);
  let removed = 0;
  const written = [];

  for (const doc of plan.documents) {
    const current = readJson(doc.filePath);
    const backupPath = path.join(backupDir, doc.name);
    fs.copyFileSync(doc.filePath, backupPath);
    const output = clone(current);
    for (const day of output.days || []) {
      const before = (day.rows || []).length;
      day.rows = (day.rows || []).filter(row => !removalSet.has(clean(row?.id || row?.matchId)));
      const delta = before - day.rows.length;
      if (delta) {
        removed += delta;
        day.matchCount = day.rows.length;
      }
    }
    atomicWriteJson(doc.filePath, output);
    written.push({ filePath: doc.filePath, backupPath });
  }

  if (removed !== plan.rowsToRemove) {
    throw new Error(`current_history_identity_alias_write_count_mismatch:${removed}:${plan.rowsToRemove}`);
  }

  return {
    ok: true,
    status: "CURRENT_HISTORY_IDENTITY_ALIAS_DUPLICATES_REMOVED",
    removed,
    written,
  };
}

function parseArgs(argv) {
  const out = { write: false, backupDir: null, report: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--write") out.write = true;
    else if (argv[i] === "--backup-dir") out.backupDir = argv[++i];
    else if (argv[i] === "--report") out.report = argv[++i];
  }
  return out;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  const plan = buildCurrentHistoryIdentityAliasRepairPlan();
  const printable = {
    schema: plan.schema,
    ok: plan.ok,
    sourceRows: plan.sourceRows,
    duplicateGroups: plan.duplicateGroups,
    rowsToRemove: plan.rowsToRemove,
    reasonCounts: plan.reasonCounts,
    groups: plan.groups,
    removals: plan.removals,
  };
  if (args.write) {
    printable.write = applyCurrentHistoryIdentityAliasRepair({ plan, backupDir: args.backupDir });
  }
  const text = `${JSON.stringify(printable, null, 2)}\n`;
  if (args.report) fs.writeFileSync(args.report, text, "utf8");
  process.stdout.write(text);
}
