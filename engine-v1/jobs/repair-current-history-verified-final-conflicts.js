import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import { createProductionEvidenceIdentityOverlay } from "../core/production-evidence-identity-overlay.js";
import { canonicalH2HTeamIdentity } from "../core/h2h-canonical-key-policy.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { auditHistoryRows, semanticTeamKey } from "./audit-history-semantic-integrity.js";

export const CURRENT_HISTORY_VERIFIED_FINAL_CONFLICT_REPAIR_SCHEMA =
  "ai-matchlab.current-history-verified-final-conflict-repair.v1";

const HISTORY_FILES = Object.freeze([
  "2025-2026.json",
  "2026-2027.json",
]);

const KICKOFF_TOLERANCE_MS = 6 * 60 * 60 * 1000;
const ACCEPTED_FINAL_VERDICTS = new Set([
  "verified_final_result",
  "verified_final_result_truth",
  "manual_two_source_final_score_validated",
  "manual_official_url_validated",
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

function strictScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function finalScoreOf(row) {
  const home = strictScore(
    row?.homeScore ?? row?.scoreHome ?? row?.finalScore?.homeScore ?? row?.finalScore?.home,
  );
  const away = strictScore(
    row?.awayScore ?? row?.scoreAway ?? row?.finalScore?.awayScore ?? row?.finalScore?.away,
  );
  return home === null || away === null ? null : { home, away };
}

function scoreKey(score) {
  return score ? `${score.home}|${score.away}` : "";
}

function kickoffMsOf(row) {
  const text = clean(row?.kickoffUtc || row?.kickoff || row?.startTime || row?.date);
  if (!text) return null;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function dayOf(row) {
  const explicit = clean(row?.dayKey || row?.date);
  if (/^\d{4}-\d{2}-\d{2}$/u.test(explicit)) return explicit;
  const kickoff = clean(row?.kickoffUtc || row?.kickoff || row?.startTime);
  if (!kickoff) return "";
  try {
    return athensDayFromKickoff(kickoff);
  }
  catch {
    return "";
  }
}

function hasVerifiedFinalVerdict(row) {
  if (row?.verifiedFinalTruth !== true) return false;
  const values = [
    row?.finalTruthVerdict,
    row?.verdict,
    row?.verification?.finalTruthVerdict,
    row?.verification?.verdict,
    row?.verification?.state,
    row?.settlement?.finalTruthVerdict,
    row?.settlement?.state,
  ].map(value => clean(value).toLowerCase()).filter(Boolean);
  return values.some(value => ACCEPTED_FINAL_VERDICTS.has(value));
}

function canonicalizedEvidenceView(row, overlay, errorPrefix) {
  const overlaid = overlay.overlayEvidenceMatchRow(row);
  if (!overlaid?.ok) {
    throw new Error(`${errorPrefix}_identity_overlay_failed:${clean(row?.id || row?.matchId)}:${overlaid?.status || "unknown"}`);
  }
  const home = canonicalH2HTeamIdentity(overlaid.homeResolution.preferredDisplayName);
  const away = canonicalH2HTeamIdentity(overlaid.awayResolution.preferredDisplayName);
  if (!home.valid || !away.valid) {
    throw new Error(`${errorPrefix}_h2h_team_identity_invalid:${clean(row?.id || row?.matchId)}`);
  }
  return {
    ...clone(row),
    homeTeam: home.canonicalName || overlaid.homeResolution.preferredDisplayName,
    awayTeam: away.canonicalName || overlaid.awayResolution.preferredDisplayName,
  };
}

function pairKey(row) {
  const slug = clean(row?.leagueSlug || "unknown");
  return `${slug}|${semanticTeamKey(slug, row?.homeTeam)}|${semanticTeamKey(slug, row?.awayTeam)}`;
}

function sameKickoffWindow(left, right) {
  const a = kickoffMsOf(left);
  const b = kickoffMsOf(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= KICKOFF_TOLERANCE_MS;
}

function loadFinalRowsForDay(dayKey, finalRoot) {
  const dir = path.join(finalRoot, dayKey);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(name => name.endsWith(".json"))
    .sort()
    .map(name => ({
      fileName: name,
      filePath: path.join(dir, name),
      row: readJson(path.join(dir, name)),
    }));
}

function loadApprovedAdjudications(adjudicationPath) {
  const payload = readJson(adjudicationPath);
  return (Array.isArray(payload?.adjudications) ? payload.adjudications : [])
    .filter(row => clean(row?.state) === "APPROVED_FOR_RECOVERY")
    .map(row => ({ ...clone(row), __sourcePath: adjudicationPath }));
}

function authoritativeScoreForConflict({
  conflict,
  overlay,
  finalRoot,
  adjudications,
} = {}) {
  const sampleRows = conflict?.scores?.flatMap(item => item?.rows || []) || [];
  if (!sampleRows.length) {
    throw new Error(`current_history_verified_final_conflict_rows_required:${conflict?.pair || "unknown"}`);
  }
  const sample = sampleRows[0];
  const dayKey = clean(sample?.operationalDay || sample?.declaredDay);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    throw new Error(`current_history_verified_final_conflict_day_required:${conflict?.pair || "unknown"}`);
  }
  const sampleKickoff = clean(sample?.kickoff);
  const sampleKickoffMs = Date.parse(sampleKickoff);
  if (!Number.isFinite(sampleKickoffMs)) {
    throw new Error(`current_history_verified_final_conflict_kickoff_required:${conflict?.pair || "unknown"}`);
  }

  const adjudicationMatches = [];
  for (const raw of adjudications) {
    const score = finalScoreOf(raw);
    if (!score) continue;
    if (clean(raw?.dayKey) !== dayKey) continue;
    const canonical = canonicalizedEvidenceView({
      id: `authority_adjudication_${clean(raw?.adjudicationId || raw?.matchId || "row")}`,
      leagueSlug: raw?.leagueSlug,
      homeTeam: raw?.homeTeam,
      awayTeam: raw?.awayTeam,
      scoreHome: score.home,
      scoreAway: score.away,
      kickoff: raw?.kickoffUtc || raw?.kickoff || sampleKickoff,
    }, overlay, "current_history_adjudication");
    // Historical adjudications may not persist kickoff. The day + exact canonical
    // pair is enough only when exactly one approved adjudication matches the pair.
    if (pairKey(canonical) !== conflict.pair) continue;
    adjudicationMatches.push({
      adjudicationId: clean(raw?.adjudicationId),
      matchId: clean(raw?.matchId || raw?.id),
      score,
      scoreKey: scoreKey(score),
      sourcePath: raw.__sourcePath,
    });
  }

  const adjudicationScores = new Set(adjudicationMatches.map(item => item.scoreKey));
  if (adjudicationScores.size > 1) {
    throw new Error(`current_history_conflicting_approved_adjudications:${conflict.pair}:${dayKey}`);
  }
  if (adjudicationScores.size === 1) {
    const chosen = adjudicationMatches[0];
    return {
      dayKey,
      pair: conflict.pair,
      score: chosen.score,
      scoreKey: chosen.scoreKey,
      authority: "approved_final_truth_adjudication",
      evidence: adjudicationMatches,
    };
  }

  const finalMatches = [];
  for (const item of loadFinalRowsForDay(dayKey, finalRoot)) {
    const raw = item.row;
    if (!hasVerifiedFinalVerdict(raw)) continue;
    const score = finalScoreOf(raw);
    if (!score) continue;
    if (dayOf(raw) !== dayKey) continue;
    const canonical = canonicalizedEvidenceView({
      id: `authority_verified_final_${clean(raw?.matchId || raw?.canonicalId || raw?.id || item.fileName)}`,
      leagueSlug: raw?.leagueSlug,
      homeTeam: raw?.homeTeam,
      awayTeam: raw?.awayTeam,
      scoreHome: score.home,
      scoreAway: score.away,
      kickoff: raw?.kickoffUtc || raw?.kickoff,
    }, overlay, "current_history_verified_final");
    if (pairKey(canonical) !== conflict.pair) continue;
    if (!sameKickoffWindow(canonical, { kickoff: sampleKickoff })) continue;
    finalMatches.push({
      fileName: item.fileName,
      filePath: item.filePath,
      matchId: clean(raw?.matchId || raw?.canonicalId || raw?.id),
      score,
      scoreKey: scoreKey(score),
      source: clean(raw?.source),
      verdict: clean(raw?.finalTruthVerdict || raw?.verdict),
    });
  }

  if (!finalMatches.length) {
    throw new Error(`current_history_verified_final_authority_missing:${conflict.pair}:${dayKey}`);
  }
  const finalScores = new Set(finalMatches.map(item => item.scoreKey));
  if (finalScores.size !== 1) {
    throw new Error(`current_history_verified_final_authority_conflicted:${conflict.pair}:${dayKey}:${[...finalScores].join(",")}`);
  }
  const chosen = finalMatches[0];
  return {
    dayKey,
    pair: conflict.pair,
    score: chosen.score,
    scoreKey: chosen.scoreKey,
    authority: "unanimous_verified_final_truth",
    evidence: finalMatches,
  };
}

function collectHistoryDocuments(historyRoot) {
  return HISTORY_FILES.map(name => ({
    name,
    filePath: path.join(historyRoot, name),
    payload: readJson(path.join(historyRoot, name)),
  }));
}

function transformedHistory(documents, overlay) {
  const sourceById = new Map();
  const transformed = [];
  for (const doc of documents) {
    for (let dayIndex = 0; dayIndex < (doc.payload?.days || []).length; dayIndex++) {
      const day = doc.payload.days[dayIndex];
      for (let rowIndex = 0; rowIndex < (day?.rows || []).length; rowIndex++) {
        const row = day.rows[rowIndex];
        const id = clean(row?.id || row?.matchId);
        if (!id) throw new Error(`current_history_verified_final_row_id_required:${doc.name}:${dayIndex}:${rowIndex}`);
        if (sourceById.has(id)) throw new Error(`current_history_verified_final_duplicate_id_precondition_failed:${id}`);
        sourceById.set(id, { doc: doc.name, dayIndex, rowIndex, row });
        transformed.push({
          ...canonicalizedEvidenceView(row, overlay, "current_history_verified_final"),
          __container: doc.name,
        });
      }
    }
  }
  return { sourceById, transformed };
}

export function buildCurrentHistoryVerifiedFinalConflictRepairPlan({
  historyRoot = resolveDataPath("history"),
  finalRoot = resolveDataPath("final-results"),
  adjudicationPath = resolveDataPath("final-truth-adjudications.v1.json"),
  overlay = createProductionEvidenceIdentityOverlay(),
} = {}) {
  const documents = collectHistoryDocuments(historyRoot);
  const { sourceById, transformed } = transformedHistory(documents, overlay);
  const audit = auditHistoryRows(transformed, { maxExamples: 10000 });

  if (audit.invalidRowCount || audit.duplicateIdCount || audit.operationalDayMismatchCount ||
      audit.semantic.flippedOrientationGroups || audit.semantic.crossOperationalDayGroups) {
    const error = new Error("current_history_verified_final_conflict_repair_precondition_failed");
    error.details = {
      invalidRowCount: audit.invalidRowCount,
      duplicateIdCount: audit.duplicateIdCount,
      operationalDayMismatchCount: audit.operationalDayMismatchCount,
      flippedOrientationGroups: audit.semantic.flippedOrientationGroups,
      crossOperationalDayGroups: audit.semantic.crossOperationalDayGroups,
    };
    throw error;
  }
  if (audit.semantic.scoreConflictGroups !== audit.semantic.examples.scoreConflicts.length) {
    throw new Error("current_history_verified_final_score_conflict_examples_incomplete");
  }

  const adjudications = loadApprovedAdjudications(adjudicationPath);
  const removals = [];
  const groups = [];
  const reasonCounts = {};

  for (const conflict of audit.semantic.examples.scoreConflicts) {
    const authority = authoritativeScoreForConflict({
      conflict,
      overlay,
      finalRoot,
      adjudications,
    });
    const rows = conflict.scores.flatMap(item => item.rows || []);
    const matching = rows.filter(row => `${row.scoreHome}|${row.scoreAway}` === authority.scoreKey);
    const contradicted = rows.filter(row => `${row.scoreHome}|${row.scoreAway}` !== authority.scoreKey);
    if (!matching.length) {
      throw new Error(`current_history_verified_final_authoritative_row_missing:${conflict.pair}:${authority.dayKey}:${authority.scoreKey}`);
    }
    if (!contradicted.length) {
      throw new Error(`current_history_verified_final_conflict_without_contradicted_rows:${conflict.pair}:${authority.dayKey}`);
    }
    const removeIds = contradicted.map(row => clean(row?.id)).filter(Boolean);
    if (removeIds.length !== contradicted.length) {
      throw new Error(`current_history_verified_final_conflict_row_id_missing:${conflict.pair}:${authority.dayKey}`);
    }
    reasonCounts[authority.authority] = (reasonCounts[authority.authority] || 0) + 1;
    groups.push({
      pair: conflict.pair,
      dayKey: authority.dayKey,
      authoritativeScore: authority.scoreKey,
      authority: authority.authority,
      evidence: authority.evidence,
      retainedIds: matching.map(row => clean(row?.id)).sort(),
      removeIds: [...removeIds].sort(),
      conflictingScores: conflict.scores.map(item => ({
        score: item.score,
        ids: (item.rows || []).map(row => clean(row?.id)).sort(),
      })),
    });
    removals.push(...removeIds);
  }

  const uniqueRemovals = new Set(removals);
  if (uniqueRemovals.size !== removals.length) {
    throw new Error("current_history_verified_final_conflict_removal_overlap");
  }

  return {
    schema: CURRENT_HISTORY_VERIFIED_FINAL_CONFLICT_REPAIR_SCHEMA,
    ok: true,
    historyRoot,
    finalRoot,
    adjudicationPath,
    sourceRows: transformed.length,
    initialDuplicateGroups: audit.semantic.duplicateGroups,
    scoreConflictGroups: audit.semantic.scoreConflictGroups,
    rowsToRemove: removals.length,
    groups,
    removals: [...uniqueRemovals].sort(),
    reasonCounts,
    documents,
    sourceById,
    authorization: {
      writeAuthorized: false,
      scoreMutationAuthorized: false,
      unverifiedConflictRemovalAuthorized: false,
    },
  };
}

export function applyCurrentHistoryVerifiedFinalConflictRepair({
  plan,
  backupDir,
  overlay = createProductionEvidenceIdentityOverlay(),
} = {}) {
  if (!plan?.ok || !Array.isArray(plan.removals)) {
    throw new Error("current_history_verified_final_conflict_repair_plan_required");
  }
  if (!clean(backupDir)) {
    throw new Error("current_history_verified_final_conflict_backup_dir_required");
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
    throw new Error(`current_history_verified_final_conflict_write_count_mismatch:${removed}:${plan.rowsToRemove}`);
  }

  const postDocuments = collectHistoryDocuments(plan.historyRoot);
  const { transformed } = transformedHistory(postDocuments, overlay);
  const postAudit = auditHistoryRows(transformed, { maxExamples: 10000 });
  if (postAudit.invalidRowCount || postAudit.duplicateIdCount || postAudit.operationalDayMismatchCount ||
      postAudit.semantic.scoreConflictGroups || postAudit.semantic.flippedOrientationGroups ||
      postAudit.semantic.crossOperationalDayGroups) {
    throw new Error("current_history_verified_final_conflict_postcondition_failed");
  }

  return {
    ok: true,
    status: "CURRENT_HISTORY_VERIFIED_FINAL_SCORE_CONFLICTS_REMOVED",
    removed,
    written,
    postcondition: {
      sourceRows: transformed.length,
      duplicateGroups: postAudit.semantic.duplicateGroups,
      scoreConflictGroups: postAudit.semantic.scoreConflictGroups,
      flippedOrientationGroups: postAudit.semantic.flippedOrientationGroups,
      crossOperationalDayGroups: postAudit.semantic.crossOperationalDayGroups,
      invalidRowCount: postAudit.invalidRowCount,
      duplicateIdCount: postAudit.duplicateIdCount,
      operationalDayMismatchCount: postAudit.operationalDayMismatchCount,
    },
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
  let printable;
  try {
    const plan = buildCurrentHistoryVerifiedFinalConflictRepairPlan();
    printable = {
      schema: plan.schema,
      ok: plan.ok,
      sourceRows: plan.sourceRows,
      initialDuplicateGroups: plan.initialDuplicateGroups,
      scoreConflictGroups: plan.scoreConflictGroups,
      rowsToRemove: plan.rowsToRemove,
      reasonCounts: plan.reasonCounts,
      groups: plan.groups,
      removals: plan.removals,
    };
    if (args.write) {
      printable.write = applyCurrentHistoryVerifiedFinalConflictRepair({
        plan,
        backupDir: args.backupDir,
      });
    }
  }
  catch (error) {
    printable = {
      schema: CURRENT_HISTORY_VERIFIED_FINAL_CONFLICT_REPAIR_SCHEMA,
      ok: false,
      error: clean(error?.message) || "unknown_error",
      details: error?.details || null,
    };
    const text = `${JSON.stringify(printable, null, 2)}\n`;
    if (args.report) {
      fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true });
      fs.writeFileSync(args.report, text, "utf8");
    }
    process.stderr.write(text);
    process.exitCode = 1;
  }

  if (printable?.ok) {
    const text = `${JSON.stringify(printable, null, 2)}\n`;
    if (args.report) {
      fs.mkdirSync(path.dirname(path.resolve(args.report)), { recursive: true });
      fs.writeFileSync(args.report, text, "utf8");
    }
    process.stdout.write(text);
  }
}
