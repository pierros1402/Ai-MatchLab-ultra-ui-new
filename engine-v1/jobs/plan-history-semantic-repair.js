/**
 * plan-history-semantic-repair.js
 *
 * Builds a deterministic, read-only repair plan from the semantic history audit.
 * It never edits results memory, history archives, current history or H2H data.
 * `--write` writes only the generated plan artifact.
 *
 * Usage:
 *   node engine-v1/jobs/plan-history-semantic-repair.js
 *   node engine-v1/jobs/plan-history-semantic-repair.js --write
 *   node engine-v1/jobs/plan-history-semantic-repair.js --output=data/history-integrity/repair-plan.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { buildSemanticHistoryAudit } from "./audit-history-semantic-integrity.js";

const __filename = fileURLToPath(import.meta.url);
const FULL_AUDIT_EXAMPLE_LIMIT = 100000;

function isCanonicalId(value) {
  return String(value || "").toLowerCase().startsWith("cid_");
}

function declaredDayMatchesOperational(row) {
  return Boolean(
    row?.declaredDay
    && row?.operationalDay
    && row.declaredDay === row.operationalDay
  );
}

function rowStableKey(row) {
  return [
    row?.id || "",
    row?.kickoff || "",
    row?.homeTeam || "",
    row?.awayTeam || "",
    row?.scoreHome ?? "",
    row?.scoreAway ?? "",
    row?.declaredDay || "",
    row?.sourceFamily || ""
  ].join("|");
}

function compactRowSelector(row) {
  return {
    id: row?.id || null,
    sourceFamily: row?.sourceFamily || null,
    declaredDay: row?.declaredDay || null,
    operationalDay: row?.operationalDay || null,
    kickoff: row?.kickoff || null,
    homeTeam: row?.homeTeam || null,
    awayTeam: row?.awayTeam || null,
    scoreHome: row?.scoreHome ?? null,
    scoreAway: row?.scoreAway ?? null,
    container: row?.container || null
  };
}

export function selectRetainedDuplicateRow(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const canonicalDelta = Number(isCanonicalId(b?.id)) - Number(isCanonicalId(a?.id));
    if (canonicalDelta) return canonicalDelta;

    const dayDelta = Number(declaredDayMatchesOperational(b))
      - Number(declaredDayMatchesOperational(a));
    if (dayDelta) return dayDelta;

    return rowStableKey(a).localeCompare(rowStableKey(b));
  })[0];
}

function duplicateGroupKey(group) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  const first = rows[0] || {};
  return [
    group?.pair || "unknown",
    group?.score || "unknown",
    first?.operationalDay || "unknown",
    first?.kickoff || "unknown"
  ].join("|");
}

function rowIdentity(row) {
  return [
    row?.id || "",
    row?.kickoff || "",
    row?.homeTeam || "",
    row?.awayTeam || "",
    row?.scoreHome ?? "",
    row?.scoreAway ?? ""
  ].join("|");
}

function planCurrentHistoryDedup(group, index) {
  const rows = Array.isArray(group?.rows) ? group.rows : [];
  const retain = selectRetainedDuplicateRow(rows);
  const removeRows = [];
  let retained = false;

  for (const row of rows) {
    if (!retained && row === retain) {
      retained = true;
      continue;
    }
    removeRows.push(compactRowSelector(row));
  }

  const normalizeRetainedDay = Boolean(
    retain?.declaredDay
    && retain?.operationalDay
    && retain.declaredDay !== retain.operationalDay
  );

  return {
    actionId: `current-history-dedup-${String(index + 1).padStart(4, "0")}`,
    actionType: "deduplicate_current_history_same_score",
    status: "planned_not_applied",
    confidence: "deterministic",
    semanticGroupKey: duplicateGroupKey(group),
    pair: group?.pair || null,
    score: group?.score || null,
    kickoff: retain?.kickoff || rows[0]?.kickoff || null,
    operationalDay: retain?.operationalDay || rows[0]?.operationalDay || null,
    retainRow: compactRowSelector(retain),
    removeRows,
    normalizeRetainedDay: normalizeRetainedDay
      ? {
          from: retain.declaredDay,
          to: retain.operationalDay,
          moveDayBucket: true
        }
      : null,
    mergeProvenance: rows.map(row => ({
      id: row?.id || null,
      sourceFamily: row?.sourceFamily || null
    })),
    policyReason: isCanonicalId(retain?.id)
      ? "canonical_id_retained"
      : declaredDayMatchesOperational(retain)
        ? "operational_day_aligned_row_retained"
        : "stable_deterministic_row_retained",
    truthWrites: 0
  };
}

function collectDuplicateCoveredRows(duplicateGroups) {
  return new Set(
    duplicateGroups.flatMap(group =>
      (Array.isArray(group?.rows) ? group.rows : []).map(rowIdentity)
    )
  );
}

function planStandaloneDayNormalization(row, index) {
  return {
    actionId: `current-history-day-normalization-${String(index + 1).padStart(4, "0")}`,
    actionType: "normalize_current_history_operational_day",
    status: "planned_not_applied",
    confidence: "deterministic_timezone_contract",
    row: compactRowSelector(row),
    fromDay: row?.declaredDay || null,
    toDay: row?.operationalDay || null,
    moveDayBucket: true,
    policyReason: "history_day_must_follow_europe_athens_operational_day",
    truthWrites: 0
  };
}

function flattenResultOrphans(resultsMemory) {
  const out = [];
  for (const league of resultsMemory?.affectedLeagues || []) {
    for (const orphan of league?.examples?.orphanMatchIds || []) {
      out.push({
        leagueSlug: league?.slug || orphan?.slug || null,
        matchId: orphan?.matchId || null,
        side: orphan?.side || null
      });
    }
  }
  return out;
}

export function buildHistorySemanticRepairPlan(options = {}) {
  const audit = options.auditReport || buildSemanticHistoryAudit({
    maxExamples: FULL_AUDIT_EXAMPLE_LIMIT,
    nowMs: options.nowMs
  });

  const currentSemantic = audit?.currentHistory?.semantic || {};
  const duplicateGroups = currentSemantic?.examples?.semanticDuplicates || [];
  const scoreConflicts = currentSemantic?.examples?.scoreConflicts || [];
  const flippedOrientation = currentSemantic?.examples?.flippedOrientation || [];
  const mismatchRows = audit?.currentHistory?.examples?.operationalDayMismatch || [];
  const coveredByDedup = collectDuplicateCoveredRows(duplicateGroups);

  const currentHistoryDedup = duplicateGroups.map(planCurrentHistoryDedup);
  const standaloneDayRows = mismatchRows.filter(row => !coveredByDedup.has(rowIdentity(row)));
  const currentHistoryDayNormalization = standaloneDayRows.map(planStandaloneDayNormalization);

  const blockedScoreConflicts = scoreConflicts.map((group, index) => ({
    blockId: `score-conflict-${String(index + 1).padStart(4, "0")}`,
    blockType: "current_history_score_conflict",
    status: "blocked_pending_authoritative_resolution",
    pair: group?.pair || null,
    alternatives: (group?.scores || []).map(candidate => ({
      score: candidate?.score || null,
      rows: (candidate?.rows || []).map(compactRowSelector)
    })),
    requiredEvidence: [
      "trusted final-status source",
      "verified final score",
      "explicit resolution manifest"
    ],
    automaticResolutionAllowed: false,
    truthWrites: 0
  }));

  const blockedOrientationConflicts = flippedOrientation.map((group, index) => ({
    blockId: `orientation-conflict-${String(index + 1).padStart(4, "0")}`,
    blockType: "current_history_flipped_orientation",
    status: "blocked_pending_fixture_identity_resolution",
    pair: group?.pair || null,
    rows: (group?.rows || []).map(compactRowSelector),
    automaticResolutionAllowed: false,
    truthWrites: 0
  }));

  const blockedH2HKeys = (audit?.h2h?.examples?.degradedPairKeys || []).map((row, index) => ({
    blockId: `h2h-degraded-key-${String(index + 1).padStart(4, "0")}`,
    blockType: "h2h_degraded_pair_key",
    status: "blocked_pending_team_key_policy_fix",
    actual: row?.actual || null,
    expected: row?.expected || null,
    teamA: row?.teamA || null,
    teamB: row?.teamB || null,
    automaticResolutionAllowed: false,
    truthWrites: 0
  }));

  const resultOrphans = flattenResultOrphans(audit?.resultsMemory);
  const duplicateIdGroups = audit?.currentHistory?.examples?.duplicateIds || [];

  const blockedCount = blockedScoreConflicts.length
    + blockedOrientationConflicts.length
    + blockedH2HKeys.length;

  return {
    ok: true,
    readyToApply: blockedCount === 0,
    schema: "ai-matchlab.history-semantic-repair-plan.v1",
    generatedAt: new Date().toISOString(),
    sourceAudit: {
      schema: audit?.schema || null,
      generatedAt: audit?.generatedAt || null,
      ok: audit?.ok ?? null,
      clean: audit?.clean ?? null,
      issueCounts: audit?.issueCounts || null
    },
    sourceContract: {
      readOnlyTruthLayers: true,
      truthWrites: 0,
      planWriteOnly: true,
      automaticApply: false,
      timezone: audit?.sourceContract?.timezone || "Europe/Athens"
    },
    policy: {
      currentHistorySameScoreDuplicates: "deterministic_candidate_only",
      currentHistoryDayMismatch: "normalize_to_europe_athens_operational_day_candidate_only",
      scoreConflicts: "block_until_authoritative_resolution_manifest",
      flippedOrientation: "block_until_fixture_identity_resolution",
      historyArchiveDuplicates: "deferred_until_current_history_is_clean",
      resultsMemoryDuplicates: "deferred_due_to_mirrored_team_side_storage",
      resultsMemoryOrphans: "deferred_until_counterpart_reconstruction_is_proven",
      h2hDegradedKeys: "block_until_team_key_policy_is_fixed",
      expiredResults: "no_action"
    },
    summary: {
      deterministicCandidates: {
        currentHistoryDedupGroups: currentHistoryDedup.length,
        currentHistoryRowsToRemove: currentHistoryDedup.reduce(
          (sum, action) => sum + action.removeRows.length,
          0
        ),
        currentHistoryDayNormalizationsStandalone: currentHistoryDayNormalization.length,
        currentHistoryDayNormalizationsCoveredByDedup:
          mismatchRows.length - standaloneDayRows.length,
        currentHistoryDuplicateIdGroups: duplicateIdGroups.length
      },
      blocked: {
        currentHistoryScoreConflicts: blockedScoreConflicts.length,
        currentHistoryFlippedOrientationGroups: blockedOrientationConflicts.length,
        h2hDegradedPairKeys: blockedH2HKeys.length,
        total: blockedCount
      },
      deferred: {
        historyArchiveSemanticDuplicateGroups:
          audit?.historyArchive?.semantic?.duplicateGroups || 0,
        resultsMemorySemanticDuplicateGroups:
          audit?.resultsMemory?.semantic?.duplicateGroups || 0,
        resultsMemoryOrphanMatchIds:
          audit?.resultsMemory?.orphanMatchIdCount || 0,
        resultsMemoryOrphanExamplesCaptured: resultOrphans.length,
        expiredResultEntries: audit?.resultsMemory?.expiredEntryCount || 0
      }
    },
    actions: {
      currentHistoryDedup,
      currentHistoryDayNormalization
    },
    blocked: {
      scoreConflicts: blockedScoreConflicts,
      orientationConflicts: blockedOrientationConflicts,
      h2hDegradedKeys: blockedH2HKeys
    },
    deferred: {
      historyArchive: {
        semanticDuplicateGroups:
          audit?.historyArchive?.semantic?.duplicateGroups || 0,
        reason: "Current production history must be repaired and re-audited first."
      },
      resultsMemory: {
        semanticDuplicateGroups:
          audit?.resultsMemory?.semantic?.duplicateGroups || 0,
        orphanMatchIds: audit?.resultsMemory?.orphanMatchIdCount || 0,
        orphanExamples: resultOrphans,
        reason: "Mirrored team-side storage requires a separate reconstruction-safe repair path."
      }
    },
    guarantees: {
      truthWrites: 0,
      truthFilesChanged: 0
    }
  };
}

function parseArgs(argv) {
  const out = { write: false, output: null };
  for (const arg of argv) {
    if (arg === "--write") out.write = true;
    else if (arg.startsWith("--output=")) out.output = arg.slice("--output=".length);
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/plan-history-semantic-repair.js",
    "  node engine-v1/jobs/plan-history-semantic-repair.js --write",
    "  node engine-v1/jobs/plan-history-semantic-repair.js --output=data/history-integrity/repair-plan.json",
    "",
    "Guarantee: truthWrites=0. --write writes only the repair-plan artifact."
  ].join("\n");
}

function compactCliSummary(plan, outputPath = null) {
  return {
    ok: plan.ok,
    readyToApply: plan.readyToApply,
    schema: plan.schema,
    generatedAt: plan.generatedAt,
    outputPath,
    summary: plan.summary,
    guarantees: plan.guarantees
  };
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  const plan = buildHistorySemanticRepairPlan();
  let outputPath = null;
  if (args.write || args.output) {
    outputPath = args.output
      ? path.resolve(args.output)
      : resolveDataPath("history-integrity", "repair-plan-latest.json");
    ensureDir(path.dirname(outputPath));
    fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(compactCliSummary(plan, outputPath), null, 2));
  process.exit(0);
}
