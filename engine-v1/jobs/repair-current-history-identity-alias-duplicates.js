import fs from "node:fs";
import { createHash } from "node:crypto";
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

function hashBytes(raw) {
  return createHash("sha256").update(raw).digest("hex");
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

function readCanonicalRowsForDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) throw new Error("current_history_canonical_day_invalid");
  const dir = resolveDataPath("canonical-fixtures", day);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort().flatMap(name => {
    const payload = readJson(path.join(dir, name));
    if (!Array.isArray(payload.fixtures)) throw new Error("current_history_canonical_partition_invalid");
    return payload.fixtures.map(row => ({ ...row, leagueSlug: row.leagueSlug || path.basename(name, ".json") }));
  });
}

function chooseRetainedId(groupRows, sourceById, resultMemoryIds, overlay, canonicalRowsForDay) {
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

  // A repository-shaped ID is not itself proof of canonical membership.
  // Never discard it in favor of a provider memory ID without reviewed lineage.
  const canonicalIds = enriched.filter(x => x.repositoryCanonicalId);
  if (canonicalIds.length === 1) {
    const candidate = canonicalIds[0];
    const source = sourceById.get(candidate.id).row;
    const day = clean(source.dayKey);
    const matches = canonicalRowsForDay(day).filter(row =>
      clean(row.canonicalId) === candidate.id &&
      clean(row.leagueSlug) === clean(source.leagueSlug) &&
      Number.isFinite(Date.parse(source.kickoff)) &&
      Date.parse(row.kickoffUtc || row.kickoff) === Date.parse(source.kickoff) &&
      row.scoreHome != null && row.scoreAway != null &&
      Number(row.scoreHome) === Number(source.scoreHome) &&
      Number(row.scoreAway) === Number(source.scoreAway) &&
      clean(row.status).toUpperCase() === "FT" &&
      clean(source.status).toUpperCase() === "FT"
    );
    if (matches.length === 1) {
      const expected = canonicalizedHistoryView(source, overlay);
      const actual = canonicalizedHistoryView({ ...matches[0], id: candidate.id, matchId: candidate.id }, overlay);
      if (expected.homeTeam === actual.homeTeam && expected.awayTeam === actual.awayTeam) {
        return { keepId: candidate.id, reason: "verified_canonical_fixture_membership", enriched };
      }
    }
  }
  if (canonicalIds.length) {
    throw new Error(`current_history_duplicate_canonical_membership_required:${canonicalIds.map(x => x.id).join(",")}`);
  }

  const inResults = enriched.filter(x => x.inResultsMemory);
  if (inResults.length === 1) {
    return { keepId: inResults[0].id, reason: "clean_results_memory_retained_id", enriched };
  }
  if (inResults.length > 1) {
    throw new Error(`current_history_duplicate_multiple_results_retained_ids:${inResults.map(x => x.id).join(",")}`);
  }

  throw new Error(`current_history_duplicate_retention_ambiguous:${enriched.map(x => x.id).join(",")}`);
}

export function buildCurrentHistoryIdentityAliasRepairPlan({
  historyRoot = resolveDataPath("history"),
  resultsRoot = resolveDataPath("league-memory", "results"),
  overlay = createProductionEvidenceIdentityOverlay(),
  canonicalRowsForDay = readCanonicalRowsForDay,
} = {}) {
  const documents = HISTORY_FILES.map(name => ({
    name,
    filePath: path.join(historyRoot, name),
    ...(() => {
      const raw = fs.readFileSync(path.join(historyRoot, name));
      return { payload: JSON.parse(raw.toString("utf8")), sha256: hashBytes(raw) };
    })(),
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
    const selection = chooseRetainedId(group.rows, sourceById, resultMemoryIds, overlay, canonicalRowsForDay);
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
  const removalSet = new Set(plan.removals);
  let removed = 0;
  const written = [];
  const pending = [];
  if (removalSet.size !== plan.removals.length || removalSet.size !== plan.rowsToRemove) {
    throw new Error("current_history_identity_alias_removal_plan_count_invalid");
  }

  for (const doc of plan.documents) {
    const raw = fs.readFileSync(doc.filePath);
    if (hashBytes(raw) !== doc.sha256) throw new Error(`current_history_identity_alias_source_drift:${doc.name}`);
    const backupPath = path.join(backupDir, doc.name);
    const output = JSON.parse(raw.toString("utf8"));
    for (const day of output.days || []) {
      const before = (day.rows || []).length;
      day.rows = (day.rows || []).filter(row => !removalSet.has(clean(row?.id || row?.matchId)));
      const delta = before - day.rows.length;
      if (delta) {
        removed += delta;
        day.matchCount = day.rows.length;
      }
    }
    if (JSON.stringify(output) !== JSON.stringify(doc.payload)) pending.push({ doc, raw, output, backupPath });
  }

  if (removed !== plan.rowsToRemove) {
    throw new Error(`current_history_identity_alias_write_count_mismatch:${removed}:${plan.rowsToRemove}`);
  }

  for (const doc of plan.documents) {
    if (hashBytes(fs.readFileSync(doc.filePath)) !== doc.sha256) throw new Error(`current_history_identity_alias_source_drift:${doc.name}`);
  }
  fs.mkdirSync(backupDir, { recursive: true });
  for (const item of pending) fs.writeFileSync(item.backupPath, item.raw, { flag: "wx" });
  for (const item of pending) {
    if (hashBytes(fs.readFileSync(item.doc.filePath)) !== item.doc.sha256) throw new Error(`current_history_identity_alias_source_drift:${item.doc.name}`);
    atomicWriteJson(item.doc.filePath, item.output);
    written.push({ filePath: item.doc.filePath, backupPath: item.backupPath });
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
