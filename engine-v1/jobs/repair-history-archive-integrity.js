/**
 * repair-history-archive-integrity.js
 *
 * Narrow, fail-closed repair for the history-archive layer.
 *
 * Repairs ONLY:
 *  1. same-truth semantic duplicate rows (same league/orientation, kickoff window, score)
 *  2. declared dayKey values that disagree with Europe/Athens operational day
 *
 * Retention policy for duplicate rows:
 *  - if exactly one duplicate id is still retained by clean results-memory, keep it
 *  - otherwise prefer cid_, then fdn_, then espn_, then stable deterministic row
 *
 * Safety:
 *  - dry-run by default
 *  - refuses to write if the pre-audit has score/orientation/invalid/id/self-pair errors
 *  - exact expected counts may be supplied for write mode
 *  - backs up every changed file before write
 *  - atomic writes
 *  - independent post-write archive audit
 *  - automatic rollback if any post invariant fails
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { auditHistoryRows, semanticTeamKey } from "./audit-history-semantic-integrity.js";
import { buildHistoryArchiveFastAudit } from "./build-history-archive-fast-audit.js";

const __filename = fileURLToPath(import.meta.url);
const ARCHIVE_ROOT = resolveDataPath("history-archive");
const RESULTS_ROOT = resolveDataPath("league-memory", "results");
const MAX_EXAMPLES = 100000;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256Bytes(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function fileSha256(file) {
  return sha256Bytes(fs.readFileSync(file));
}

function listArchiveFiles() {
  const out = [];
  if (!fs.existsSync(ARCHIVE_ROOT)) return out;
  for (const slug of fs.readdirSync(ARCHIVE_ROOT).sort()) {
    const dir = path.join(ARCHIVE_ROOT, slug);
    let st;
    try { st = fs.statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".json")).sort()) {
      out.push(path.join(dir, name));
    }
  }
  return out;
}

function loadArchiveState() {
  const byContainer = new Map();
  const rows = [];
  for (const file of listArchiveFiles()) {
    const payload = readJson(file);
    const container = path.relative(resolveDataPath(), file).replaceAll("\\", "/");
    const matches = Array.isArray(payload?.matches) ? payload.matches : [];
    byContainer.set(container, { file, payload, matches });
    for (const row of matches) rows.push({ ...row, __container: container });
  }
  return { byContainer, rows };
}

function loadResultsIdsByLeague() {
  const out = new Map();
  if (!fs.existsSync(RESULTS_ROOT)) return out;
  for (const name of fs.readdirSync(RESULTS_ROOT).filter(x => x.endsWith(".json")).sort()) {
    const slug = path.basename(name, ".json");
    const payload = readJson(path.join(RESULTS_ROOT, name));
    const ids = new Set();
    for (const list of Object.values(payload?.teams || {})) {
      for (const entry of Array.isArray(list) ? list : []) {
        const id = String(entry?.matchId || "").trim();
        if (id) ids.add(id);
      }
    }
    out.set(slug, ids);
  }
  return out;
}

function idPriority(id) {
  const text = String(id || "").toLowerCase();
  if (text.startsWith("cid_")) return 0;
  if (text.startsWith("fdn_")) return 1;
  if (text.startsWith("espn_")) return 2;
  return 3;
}

function stableSelectorKey(row) {
  return [
    row?.container || "",
    row?.id || "",
    row?.kickoff || "",
    row?.homeTeam || "",
    row?.awayTeam || "",
    row?.scoreHome ?? "",
    row?.scoreAway ?? ""
  ].join("|");
}

export function chooseArchiveDuplicateRetainedRow(group, resultsIdsByLeague) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  if (!rows.length) return null;
  const slug = String(group?.pair || "").split("|", 1)[0];
  const retainedIds = resultsIdsByLeague.get(slug) || new Set();
  const hits = rows.filter(row => retainedIds.has(String(row?.id || "")));
  if (hits.length === 1) {
    return { row: hits[0], reason: "exact_clean_results_memory_match_id" };
  }
  if (hits.length > 1) {
    throw new Error(`duplicate_group_has_multiple_clean_results_ids:${group?.pair}:${group?.score}`);
  }

  const ordered = [...rows].sort((a, b) => {
    const idDelta = idPriority(a?.id) - idPriority(b?.id);
    if (idDelta) return idDelta;
    return stableSelectorKey(a).localeCompare(stableSelectorKey(b));
  });
  const winner = ordered[0];
  const p = idPriority(winner?.id);
  return {
    row: winner,
    reason: p === 0 ? "expired_fallback_canonical_id"
      : p === 1 ? "expired_fallback_fdn_id"
        : p === 2 ? "expired_fallback_prefixed_espn_id"
          : "expired_fallback_stable_id"
  };
}

function selectorKey(row) {
  return [
    row?.container || row?.__container || "",
    row?.id || row?.matchId || "",
    row?.kickoff || row?.kickoffUtc || row?.date || "",
    row?.homeTeam || "",
    row?.awayTeam || "",
    row?.scoreHome ?? "",
    row?.scoreAway ?? ""
  ].join("|");
}

function fastAuditArchiveState(state) {
  const teamKeyCache = new Map();
  const keyOfTeam = (slug, name) => {
    const cacheKey = `${slug}\u0000${name}`;
    if (!teamKeyCache.has(cacheKey)) teamKeyCache.set(cacheKey, semanticTeamKey(slug, name));
    return teamKeyCache.get(cacheKey);
  };
  const oriented = new Map();
  const unordered = new Map();
  const ids = new Set();
  let invalidRowCount = 0;
  let duplicateIdCount = 0;
  let selfPairCount = 0;
  let operationalDayMismatchCount = 0;
  let validRowCount = 0;

  for (const row of state.rows) {
    const slug = String(row?.leagueSlug || "unknown");
    const home = String(row?.homeTeam || "").trim();
    const away = String(row?.awayTeam || "").trim();
    const sh = Number(row?.scoreHome);
    const sa = Number(row?.scoreAway);
    const kickoffText = row?.kickoff || row?.kickoffUtc || row?.date || row?.startTime || null;
    const ts = kickoffText ? Date.parse(kickoffText) : NaN;
    if (!home || !away || !Number.isFinite(sh) || !Number.isFinite(sa) || !Number.isFinite(ts)) {
      invalidRowCount += 1;
      continue;
    }
    validRowCount += 1;
    const id = String(row?.id || row?.matchId || "").trim();
    if (id) {
      const idKey = `${slug}|${id}`;
      if (ids.has(idKey)) duplicateIdCount += 1;
      else ids.add(idKey);
    }
    const hk = keyOfTeam(slug, home);
    const ak = keyOfTeam(slug, away);
    if (hk === ak) selfPairCount += 1;
    let operationalDay = null;
    try { operationalDay = athensDayFromKickoff(kickoffText); } catch { operationalDay = null; }
    const declaredDay = String(row?.dayKey || "").slice(0, 10) || null;
    if (declaredDay && operationalDay && declaredDay !== operationalDay) operationalDayMismatchCount += 1;
    const record = { slug, hk, ak, ts, sh, sa, operationalDay, declaredDay };
    const oKey = `${slug}|${hk}|${ak}`;
    const uKey = hk <= ak ? `${slug}|${hk}|${ak}` : `${slug}|${ak}|${hk}`;
    if (!oriented.has(oKey)) oriented.set(oKey, []);
    if (!unordered.has(uKey)) unordered.set(uKey, []);
    oriented.get(oKey).push(record);
    unordered.get(uKey).push(record);
  }

  const windowMs = 6 * 60 * 60 * 1000;
  const clusters = list => {
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    const out = [];
    let current = null;
    for (const row of sorted) {
      if (!current || row.ts - current.anchor > windowMs) {
        current = { anchor: row.ts, rows: [] };
        out.push(current);
      }
      current.rows.push(row);
    }
    return out;
  };

  let duplicateGroups = 0;
  let duplicateExtraRecords = 0;
  let scoreConflictGroups = 0;
  let crossOperationalDayGroups = 0;
  for (const list of oriented.values()) {
    for (const cluster of clusters(list)) {
      if (cluster.rows.length < 2) continue;
      const byScore = new Map();
      for (const row of cluster.rows) {
        const score = `${row.sh}|${row.sa}`;
        if (!byScore.has(score)) byScore.set(score, []);
        byScore.get(score).push(row);
      }
      if (byScore.size > 1) scoreConflictGroups += 1;
      for (const rows of byScore.values()) {
        if (rows.length < 2) continue;
        duplicateGroups += 1;
        duplicateExtraRecords += rows.length - 1;
        const op = new Set(rows.map(x => x.operationalDay).filter(Boolean));
        const dec = new Set(rows.map(x => x.declaredDay).filter(Boolean));
        if (op.size > 1 || dec.size > 1) crossOperationalDayGroups += 1;
      }
    }
  }

  let flippedOrientationGroups = 0;
  for (const list of unordered.values()) {
    for (const cluster of clusters(list)) {
      if (cluster.rows.length < 2) continue;
      const orientations = new Set(cluster.rows.map(row => `${row.slug}|${row.hk}|${row.ak}`));
      if (orientations.size > 1) flippedOrientationGroups += 1;
    }
  }

  return {
    rowCount: state.rows.length,
    validRowCount,
    invalidRowCount,
    duplicateIdCount,
    selfPairCount,
    operationalDayMismatchCount,
    semantic: {
      duplicateGroups,
      duplicateExtraRecords,
      scoreConflictGroups,
      flippedOrientationGroups,
      crossOperationalDayGroups,
      examples: { semanticDuplicates: [], scoreConflicts: [], flippedOrientation: [], crossOperationalDay: [] }
    },
    examples: { invalidRows: [], duplicateIds: [], selfPairs: [], operationalDayMismatch: [] }
  };
}

function auditArchiveState(state, maxExamples = MAX_EXAMPLES) {
  return auditHistoryRows(state.rows, { maxExamples });
}

function assertRepairableAudit(audit) {
  const hard = {
    invalidRowCount: audit.invalidRowCount,
    duplicateIdCount: audit.duplicateIdCount,
    selfPairCount: audit.selfPairCount,
    scoreConflictGroups: audit.semantic?.scoreConflictGroups || 0,
    flippedOrientationGroups: audit.semantic?.flippedOrientationGroups || 0
  };
  const bad = Object.entries(hard).filter(([, value]) => Number(value) !== 0);
  if (bad.length) {
    throw new Error(`archive_not_repairable:${bad.map(([k, v]) => `${k}=${v}`).join(",")}`);
  }
}

function buildRepairPlan(state, resultsIdsByLeague, suppliedAudit = null) {
  const audit = suppliedAudit || buildHistoryArchiveFastAudit();
  assertRepairableAudit(audit);
  if (Number(audit.rowCount) !== state.rows.length) {
    throw new Error(`archive_source_drift_row_count:${audit.rowCount}/${state.rows.length}`);
  }
  const selectorCounts = new Map();
  for (const row of state.rows) {
    const key = selectorKey(row);
    selectorCounts.set(key, (selectorCounts.get(key) || 0) + 1);
  }

  const groups = audit.semantic?.examples?.semanticDuplicates || [];
  if (groups.length !== audit.semantic?.duplicateGroups) {
    throw new Error(`duplicate_examples_truncated:${groups.length}/${audit.semantic?.duplicateGroups}`);
  }
  for (const group of groups) {
    for (const row of group?.rows || []) {
      const count = selectorCounts.get(selectorKey(row)) || 0;
      if (count !== 1) throw new Error(`archive_source_drift_selector:${count}:${selectorKey(row)}`);
    }
  }

  const removeKeys = new Set();
  const duplicateActions = [];
  const retentionReasons = {};

  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const chosen = chooseArchiveDuplicateRetainedRow(group, resultsIdsByLeague);
    if (!chosen?.row) throw new Error(`no_retained_row_for_duplicate_group:${i}`);
    const retainKey = selectorKey(chosen.row);
    let retained = false;
    const removed = [];
    for (const row of group.rows || []) {
      const key = selectorKey(row);
      if (!retained && key === retainKey) {
        retained = true;
        continue;
      }
      if (removeKeys.has(key)) throw new Error(`row_planned_for_removal_twice:${key}`);
      removeKeys.add(key);
      removed.push(row);
    }
    if (!retained) throw new Error(`retained_selector_not_found:${retainKey}`);
    retentionReasons[chosen.reason] = (retentionReasons[chosen.reason] || 0) + 1;
    duplicateActions.push({
      actionId: `archive-dedup-${String(i + 1).padStart(4, "0")}`,
      pair: group.pair,
      score: group.score,
      retain: chosen.row,
      remove: removed,
      reason: chosen.reason
    });
  }

  const perFile = new Map();
  let dayNormalizations = 0;
  let rowsRemoved = 0;
  const normalizationSamples = [];

  for (const [container, info] of state.byContainer) {
    const nextMatches = [];
    let fileRemoved = 0;
    let fileNormalized = 0;
    for (const raw of info.matches) {
      const wrapped = { ...raw, __container: container };
      if (removeKeys.has(selectorKey(wrapped))) {
        fileRemoved += 1;
        rowsRemoved += 1;
        continue;
      }
      let next = raw;
      const kickoff = raw?.kickoff || raw?.kickoffUtc || raw?.date || raw?.startTime || null;
      let operationalDay = null;
      try { if (kickoff) operationalDay = athensDayFromKickoff(kickoff); } catch { operationalDay = null; }
      const declaredDay = String(raw?.dayKey || "").slice(0, 10) || null;
      if (operationalDay && declaredDay && operationalDay !== declaredDay) {
        next = { ...raw, dayKey: operationalDay };
        fileNormalized += 1;
        dayNormalizations += 1;
        if (normalizationSamples.length < 30) {
          normalizationSamples.push({ container, id: raw?.id || raw?.matchId || null, from: declaredDay, to: operationalDay, kickoff });
        }
      }
      nextMatches.push(next);
    }

    if (fileRemoved || fileNormalized) {
      const nextPayload = { ...info.payload, matches: nextMatches };
      if (nextPayload?.stats && typeof nextPayload.stats === "object") {
        nextPayload.stats = { ...nextPayload.stats, kept: nextMatches.length };
      }
      perFile.set(container, {
        ...info,
        nextPayload,
        rowsBefore: info.matches.length,
        rowsAfter: nextMatches.length,
        rowsRemoved: fileRemoved,
        dayNormalizations: fileNormalized
      });
    }
  }

  return {
    auditBefore: audit,
    duplicateActions,
    retentionReasons,
    removeKeys,
    perFile,
    rowsRemoved,
    dayNormalizations,
    normalizationSamples
  };
}

function atomicWriteJson(file, payload) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function parseCliArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;

    const eq = arg.indexOf("=");
    if (eq >= 0) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }

    const key = arg.slice(2);
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      out[key] = argv[++i];
    } else {
      out[key] = true;
    }
  }
  return out;
}

function compactAudit(audit) {
  return {
    rowCount: audit.rowCount,
    validRowCount: audit.validRowCount,
    invalidRowCount: audit.invalidRowCount,
    duplicateIdCount: audit.duplicateIdCount,
    selfPairCount: audit.selfPairCount,
    operationalDayMismatchCount: audit.operationalDayMismatchCount,
    semantic: {
      duplicateGroups: audit.semantic?.duplicateGroups || 0,
      duplicateExtraRecords: audit.semantic?.duplicateExtraRecords || 0,
      scoreConflictGroups: audit.semantic?.scoreConflictGroups || 0,
      flippedOrientationGroups: audit.semantic?.flippedOrientationGroups || 0,
      crossOperationalDayGroups: audit.semantic?.crossOperationalDayGroups || 0
    }
  };
}

function verifyPostAudit(audit) {
  const values = [
    audit.invalidRowCount,
    audit.duplicateIdCount,
    audit.selfPairCount,
    audit.operationalDayMismatchCount,
    audit.semantic?.duplicateGroups,
    audit.semantic?.duplicateExtraRecords,
    audit.semantic?.scoreConflictGroups,
    audit.semantic?.flippedOrientationGroups,
    audit.semantic?.crossOperationalDayGroups
  ];
  return values.every(value => Number(value || 0) === 0);
}

export function repairHistoryArchiveIntegrity(options = {}) {
  const write = Boolean(options.write);

  // Fresh complete audit first. This is both the fail-closed safety gate and
  // the fixed-point fast path: a clean archive must not pay the cost of
  // reconstructing selector/repair maps when there is nothing to repair.
  const freshAudit = buildHistoryArchiveFastAudit();
  assertRepairableAudit(freshAudit);
  const duplicateGroups = Number(freshAudit.semantic?.duplicateGroups || 0);
  const dayNormalizations = Number(freshAudit.operationalDayMismatchCount || 0);
  const alreadyClean = duplicateGroups === 0 && dayNormalizations === 0;

  if (alreadyClean) {
    const compact = compactAudit(freshAudit);
    if (!verifyPostAudit(freshAudit)) {
      throw new Error(`clean_archive_fast_audit_invariant_failed:${JSON.stringify(compact)}`);
    }
    return {
      ok: true,
      schema: "ai-matchlab.history-archive-integrity-repair.v1",
      mode: write ? "write" : "dry-run",
      generatedAt: new Date().toISOString(),
      auditBefore: compact,
      plan: {
        duplicateGroups: 0,
        rowsRemoved: 0,
        dayNormalizations: 0,
        filesChanged: 0,
        retentionReasons: {},
        normalizationSamples: []
      },
      write: write ? {
        applied: true,
        fixedPointNoOp: true,
        backupDir: options.backupDir || null,
        filesWritten: 0,
        files: []
      } : null,
      auditAfter: compact
    };
  }

  const state = loadArchiveState();
  const resultsIds = loadResultsIdsByLeague();
  const plan = buildRepairPlan(state, resultsIds, freshAudit);

  const report = {
    ok: true,
    schema: "ai-matchlab.history-archive-integrity-repair.v1",
    mode: write ? "write" : "dry-run",
    generatedAt: new Date().toISOString(),
    auditBefore: compactAudit(plan.auditBefore),
    plan: {
      duplicateGroups: plan.duplicateActions.length,
      rowsRemoved: plan.rowsRemoved,
      dayNormalizations: plan.dayNormalizations,
      filesChanged: plan.perFile.size,
      retentionReasons: plan.retentionReasons,
      normalizationSamples: plan.normalizationSamples
    },
    write: null,
    auditAfter: null
  };

  if (!write) return report;

  if (options.expectedDuplicateGroups != null && Number(options.expectedDuplicateGroups) !== plan.duplicateActions.length) {
    throw new Error(`expected_duplicate_groups_mismatch:${options.expectedDuplicateGroups}/${plan.duplicateActions.length}`);
  }
  if (options.expectedRowsRemoved != null && Number(options.expectedRowsRemoved) !== plan.rowsRemoved) {
    throw new Error(`expected_rows_removed_mismatch:${options.expectedRowsRemoved}/${plan.rowsRemoved}`);
  }
  if (options.expectedDayNormalizations != null && Number(options.expectedDayNormalizations) !== plan.dayNormalizations) {
    throw new Error(`expected_day_normalizations_mismatch:${options.expectedDayNormalizations}/${plan.dayNormalizations}`);
  }

  const backupDir = ensureDir(options.backupDir || path.resolve("history-archive-integrity-backup"));
  const written = [];
  try {
    for (const [container, action] of plan.perFile) {
      const relative = container.replace(/^history-archive\//, "");
      const backupFile = path.join(backupDir, relative);
      ensureDir(path.dirname(backupFile));
      fs.copyFileSync(action.file, backupFile);
      const beforeSha256 = fileSha256(action.file);
      atomicWriteJson(action.file, action.nextPayload);
      const afterSha256 = fileSha256(action.file);
      written.push({
        container,
        backupFile,
        rowsBefore: action.rowsBefore,
        rowsAfter: action.rowsAfter,
        rowsRemoved: action.rowsRemoved,
        dayNormalizations: action.dayNormalizations,
        beforeSha256,
        afterSha256
      });
    }

    const afterAudit = buildHistoryArchiveFastAudit();
    report.auditAfter = compactAudit(afterAudit);
    if (!verifyPostAudit(afterAudit)) {
      throw new Error(`post_audit_failed:${JSON.stringify(report.auditAfter)}`);
    }
    report.write = { applied: true, backupDir, filesWritten: written.length, files: written };
    return report;
  } catch (error) {
    for (const item of [...written].reverse()) {
      try { fs.copyFileSync(item.backupFile, path.join(resolveDataPath(), item.container)); } catch { /* best effort */ }
    }
    report.ok = false;
    report.write = { applied: false, rolledBack: true, backupDir, filesTouchedBeforeRollback: written.length };
    report.error = String(error?.message || error);
    throw Object.assign(error, { repairReport: report });
  }
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isCli) {
  const args = parseCliArgs(process.argv.slice(2));
  try {
    const report = repairHistoryArchiveIntegrity({
      write: Boolean(args.write),
      auditReportFile: args["audit-report"] || args.auditReport || null,
      backupDir: args["backup-dir"] || args.backupDir || null,
      expectedDuplicateGroups: args["expected-duplicate-groups"],
      expectedRowsRemoved: args["expected-rows-removed"],
      expectedDayNormalizations: args["expected-day-normalizations"]
    });
    const text = JSON.stringify(report, null, 2);
    if (args.report) {
      ensureDir(path.dirname(path.resolve(args.report)));
      fs.writeFileSync(path.resolve(args.report), text, "utf8");
    }
    console.log(text);
  } catch (error) {
    const report = error?.repairReport || { ok: false, error: String(error?.message || error) };
    const text = JSON.stringify(report, null, 2);
    if (args.report) {
      ensureDir(path.dirname(path.resolve(args.report)));
      fs.writeFileSync(path.resolve(args.report), text, "utf8");
    }
    console.error(text);
    process.exitCode = 1;
  }
}
