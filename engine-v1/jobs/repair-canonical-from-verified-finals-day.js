import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolveDataPath } from "../storage/data-root.js";
import {
  classifyMatchState,
  MATCH_STATE_CLASS,
} from "../core/non-played-state.js";
import { teamPairMatches } from "../core/team-identity.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";

const ACCEPTED_FINAL_VERDICTS = new Set([
  "verified_final_result",
  "verified_final_result_truth",
  "manual_two_source_final_score_validated",
  "manual_official_url_validated",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function strictScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finalScore(row) {
  return {
    home: strictScore(row?.scoreHome ?? row?.homeScore ?? row?.finalScore?.homeScore ?? row?.finalScore?.home),
    away: strictScore(row?.scoreAway ?? row?.awayScore ?? row?.finalScore?.awayScore ?? row?.finalScore?.away),
  };
}

function parseScoreKey(value) {
  const match = clean(value).match(/^(\d+)\s*-\s*(\d+)$/u);
  if (!match) return null;
  return {
    home: Number(match[1]),
    away: Number(match[2]),
  };
}

function sameScore(a, b) {
  return (
    a?.home !== null &&
    a?.home !== undefined &&
    a?.away !== null &&
    a?.away !== undefined &&
    b?.home !== null &&
    b?.home !== undefined &&
    b?.away !== null &&
    b?.away !== undefined &&
    Number(a.home) === Number(b.home) &&
    Number(a.away) === Number(b.away)
  );
}

export function authorizeAppliedTerminalScoreRevision(
  canonicalRow,
  finalRow,
) {
  const revision = finalRow?.terminalScoreRevision;
  if (!revision || typeof revision !== "object") {
    return { ok: false, reason: "TERMINAL_REVISION_MISSING" };
  }

  if (clean(revision.state).toUpperCase() !== "APPLIED") {
    return { ok: false, reason: "TERMINAL_REVISION_NOT_APPLIED" };
  }

  if (clean(revision.policyVersion) !== "flashscore-terminal-revision-v1") {
    return { ok: false, reason: "TERMINAL_REVISION_POLICY_NOT_ALLOWED" };
  }

  const canonicalProvider = clean(canonicalRow?.source).toLowerCase();
  const revisionProvider = clean(revision.provider).toLowerCase();
  if (
    canonicalProvider !== "flashscore" ||
    revisionProvider !== "flashscore"
  ) {
    return { ok: false, reason: "TERMINAL_REVISION_PROVIDER_NOT_ALLOWED" };
  }

  const canonicalProviderMatchId = clean(
    canonicalRow?.sourceMatchId ||
      canonicalRow?.sourceId ||
      canonicalRow?.providerMatchId,
  );
  const revisionProviderMatchId = clean(revision.providerMatchId);
  if (
    !canonicalProviderMatchId ||
    canonicalProviderMatchId !== revisionProviderMatchId
  ) {
    return { ok: false, reason: "TERMINAL_REVISION_PROVIDER_ID_MISMATCH" };
  }

  const canonicalScore = {
    home: strictScore(canonicalRow?.scoreHome),
    away: strictScore(canonicalRow?.scoreAway),
  };
  const verifiedScore = finalScore(finalRow);
  const previousScore = parseScoreKey(revision.previousScore);
  const correctedScore = parseScoreKey(revision.correctedScore);

  if (!previousScore || !sameScore(previousScore, canonicalScore)) {
    return { ok: false, reason: "TERMINAL_REVISION_PREVIOUS_SCORE_MISMATCH" };
  }
  if (!correctedScore || !sameScore(correctedScore, verifiedScore)) {
    return { ok: false, reason: "TERMINAL_REVISION_CORRECTED_SCORE_MISMATCH" };
  }

  const observationCount = Number(revision.observationCount);
  const stableForMs = Number(revision.stableForMs);
  if (!Number.isInteger(observationCount) || observationCount < 2) {
    return { ok: false, reason: "TERMINAL_REVISION_OBSERVATIONS_INSUFFICIENT" };
  }
  if (!Number.isFinite(stableForMs) || stableForMs < 300000) {
    return { ok: false, reason: "TERMINAL_REVISION_STABILITY_INSUFFICIENT" };
  }

  return {
    ok: true,
    reason: null,
    method: "validated_applied_terminal_score_revision",
    policyVersion: revision.policyVersion,
    provider: revisionProvider,
    providerMatchId: revisionProviderMatchId,
    previousScore,
    correctedScore,
    observationCount,
    stableForMs,
    firstObservedAt: revision.firstObservedAt ?? null,
    lastObservedAt: revision.lastObservedAt ?? null,
    appliedAt: revision.appliedAt ?? null,
    oddsUsed: revision.oddsUsed === true,
  };
}

function isVerifiedFinal(row) {
  const verdict = clean(
    row?.finalTruthVerdict ||
    row?.verdict ||
    row?.verification?.finalTruthVerdict ||
    row?.verification?.verdict ||
    row?.settlement?.finalTruthVerdict,
  ).toLowerCase();
  return row?.verifiedFinalTruth === true && ACCEPTED_FINAL_VERDICTS.has(verdict);
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, payload) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function readCanonicalDay(dayKey, canonicalRoot) {
  const dayDir = path.join(canonicalRoot, dayKey);
  const entries = [];
  if (!fs.existsSync(dayDir)) return entries;

  for (const name of fs.readdirSync(dayDir).filter(name => name.endsWith(".json")).sort()) {
    const filePath = path.join(dayDir, name);
    const payload = loadJson(filePath);
    const rows = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.fixtures)
        ? payload.fixtures
        : Array.isArray(payload?.matches)
          ? payload.matches
          : Array.isArray(payload?.rows)
            ? payload.rows
            : [];
    rows.forEach((row, index) => entries.push({ filePath, name, payload, row, index }));
  }
  return entries;
}

function readFinalResultsDay(dayKey, finalResultsRoot) {
  const dayDir = path.join(finalResultsRoot, dayKey);
  const rows = [];
  if (!fs.existsSync(dayDir)) return rows;
  for (const name of fs.readdirSync(dayDir).filter(name => name.endsWith(".json")).sort()) {
    const filePath = path.join(dayDir, name);
    rows.push({ filePath, name, row: loadJson(filePath) });
  }
  return rows;
}

function normalizeTerminalStatus(finalRow) {
  const values = [
    finalRow?.status,
    finalRow?.statusType,
    finalRow?.rawStatus,
    finalRow?.verification?.status,
  ].map(value => clean(value).toUpperCase()).filter(Boolean);

  if (values.some(value => value.includes("PEN"))) return "PEN";
  if (values.some(value => value.includes("AET") || value.includes("EXTRA_TIME"))) return "AET";
  return "FT";
}

function repairedCanonicalRow(
  canonicalRow,
  finalRow,
  dayKey,
  repairedAt,
  repairAuthorization = null,
) {
  const score = finalScore(finalRow);
  const terminalStatus = normalizeTerminalStatus(finalRow);
  const previousState = classifyMatchState(canonicalRow);

  return {
    ...canonicalRow,
    scoreHome: score.home,
    scoreAway: score.away,
    status: terminalStatus,
    rawStatus: terminalStatus === "FT" ? "STATUS_FINAL" : `STATUS_${terminalStatus}`,
    statusType: terminalStatus === "FT" ? "STATUS_FINAL" : `STATUS_${terminalStatus}`,
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    finalized: 1,
    state: "final",
    isDisplayFinal: true,
    canonicalTruthRepair: {
      schema: "ai-matchlab.canonical-verified-final-repair.v1",
      repairedAt,
      dayKey,
      canonicalId: clean(canonicalRow?.canonicalId || canonicalRow?.matchId || canonicalRow?.id),
      method:
        repairAuthorization?.method ||
        "exact_identity_verified_final_truth_repair",
      previousState,
      previousStatus: canonicalRow?.status ?? null,
      previousRawStatus: canonicalRow?.rawStatus ?? null,
      previousStatusType: canonicalRow?.statusType ?? null,
      previousOperationalState: canonicalRow?.operationalState ?? null,
      previousScore: {
        home: strictScore(canonicalRow?.scoreHome),
        away: strictScore(canonicalRow?.scoreAway),
      },
      verifiedFinalTruth: true,
      verifiedFinalVerdict: clean(finalRow?.finalTruthVerdict || finalRow?.verdict || finalRow?.verification?.verdict),
      verifiedFinalScore: score,
      verifiedFinalSource: clean(finalRow?.source) || null,
      verifiedFinalSources: Array.isArray(finalRow?.sources) ? finalRow.sources : [],
      scoreWasCopiedFromVerifiedFinal: true,
      statusWasNormalizedToTerminal: true,
      terminalScoreRevisionAuthorization:
        repairAuthorization?.method ===
        "validated_applied_terminal_score_revision"
          ? repairAuthorization
          : null,
    },
  };
}

function exactIdentityCheck(canonicalRow, finalRow, dayKey) {
  const canonicalId = clean(canonicalRow?.canonicalId || canonicalRow?.matchId || canonicalRow?.id);
  const finalId = clean(finalRow?.matchId || finalRow?.canonicalId || finalRow?.id);
  if (!canonicalId || canonicalId !== finalId) return "MATCH_ID_MISMATCH";
  if (clean(canonicalRow?.dayKey) !== dayKey || clean(finalRow?.dayKey || finalRow?.date) !== dayKey) {
    return "DAY_MISMATCH";
  }
  if (!teamPairMatches(
    canonicalRow?.homeTeam,
    canonicalRow?.awayTeam,
    finalRow?.homeTeam,
    finalRow?.awayTeam,
  )) {
    return "TEAM_PAIR_MISMATCH";
  }
  const score = finalScore(finalRow);
  if (score.home === null || score.away === null) return "FINAL_SCORE_MISSING";
  if (!isVerifiedFinal(finalRow)) return "FINAL_TRUTH_NOT_VERIFIED";
  return null;
}

export function planCanonicalVerifiedFinalRepair({ dayKey, canonicalEntries, finalEntries, resolvedCanonicalRows = null, repairedAt = new Date().toISOString() }) {
  const finalById = new Map();
  const duplicateFinalIds = new Set();
  for (const entry of finalEntries) {
    const id = clean(entry?.row?.matchId || entry?.row?.canonicalId || entry?.row?.id);
    if (!id) continue;
    if (finalById.has(id)) duplicateFinalIds.add(id);
    else finalById.set(id, entry);
  }

  const actions = [];
  const blocked = [];
  const rawEntryById = new Map();
  for (const entry of canonicalEntries) {
    const id = clean(entry?.row?.canonicalId || entry?.row?.matchId || entry?.row?.id);
    if (!id) continue;
    if (rawEntryById.has(id)) {
      blocked.push({ matchId: id, reason: "DUPLICATE_RAW_CANONICAL_ID" });
      continue;
    }
    rawEntryById.set(id, entry);
  }

  const effectiveRows = Array.isArray(resolvedCanonicalRows)
    ? resolvedCanonicalRows
    : canonicalEntries.map(entry => entry.row);
  for (const row of effectiveRows) {
    const id = clean(row?.canonicalId || row?.matchId || row?.id);
    if (!id || duplicateFinalIds.has(id)) {
      if (duplicateFinalIds.has(id)) blocked.push({ matchId: id, reason: "DUPLICATE_FINAL_ID" });
      continue;
    }
    const entry = rawEntryById.get(id);
    if (!entry) {
      blocked.push({ matchId: id, reason: "RESOLVED_CANONICAL_MISSING_RAW_ROW" });
      continue;
    }
    const finalEntry = finalById.get(id);
    if (!finalEntry) continue;

    const state = classifyMatchState(row);
    const canonicalScore = {
      home: strictScore(row?.scoreHome),
      away: strictScore(row?.scoreAway),
    };
    const verifiedScore = finalScore(finalEntry.row);
    const scoreMatches = canonicalScore.home === verifiedScore.home && canonicalScore.away === verifiedScore.away;

    if (state === MATCH_STATE_CLASS.PLAYED_FINAL) {
      if (scoreMatches) continue;

      const identityProblem = exactIdentityCheck(
        row,
        finalEntry.row,
        dayKey,
      );
      if (identityProblem) {
        blocked.push({ matchId: id, reason: identityProblem });
        continue;
      }

      const revisionAuthorization =
        authorizeAppliedTerminalScoreRevision(
          row,
          finalEntry.row,
        );

      if (!revisionAuthorization.ok) {
        blocked.push({
          matchId: id,
          reason: "PLAYED_FINAL_SCORE_CONFLICT_NEEDS_ADJUDICATION",
          canonicalScore,
          verifiedScore,
          terminalRevisionReason:
            revisionAuthorization.reason,
        });
        continue;
      }

      const after = repairedCanonicalRow(
        entry.row,
        finalEntry.row,
        dayKey,
        repairedAt,
        revisionAuthorization,
      );
      if (
        classifyMatchState(after) !==
        MATCH_STATE_CLASS.PLAYED_FINAL
      ) {
        blocked.push({
          matchId: id,
          reason: "REPAIRED_ROW_NOT_PLAYED_FINAL",
        });
        continue;
      }

      actions.push({
        matchId: id,
        leagueFile: entry.name,
        filePath: entry.filePath,
        rowIndex: entry.index,
        reason:
          "CANONICAL_TERMINAL_SCORE_REVISED_BY_VERIFIED_PROVIDER_EVIDENCE",
        before: row,
        after,
      });
      continue;
    }

    if (
      state !== MATCH_STATE_CLASS.CONFLICT &&
      state !== MATCH_STATE_CLASS.PRE_KICKOFF_SCHEDULED &&
      state !== MATCH_STATE_CLASS.UNKNOWN
    ) {
      blocked.push({ matchId: id, reason: `NON_REPAIRABLE_CANONICAL_STATE:${state}` });
      continue;
    }

    const identityProblem = exactIdentityCheck(row, finalEntry.row, dayKey);
    if (identityProblem) {
      blocked.push({ matchId: id, reason: identityProblem });
      continue;
    }

    const after = repairedCanonicalRow(entry.row, finalEntry.row, dayKey, repairedAt);
    if (classifyMatchState(after) !== MATCH_STATE_CLASS.PLAYED_FINAL) {
      blocked.push({ matchId: id, reason: "REPAIRED_ROW_NOT_PLAYED_FINAL" });
      continue;
    }

    actions.push({
      matchId: id,
      leagueFile: entry.name,
      filePath: entry.filePath,
      rowIndex: entry.index,
      reason: state === MATCH_STATE_CLASS.CONFLICT
        ? "CANONICAL_STATUS_CONFLICT_WITH_EXACT_VERIFIED_FINAL"
        : "CANONICAL_NONTERMINAL_WITH_EXACT_VERIFIED_FINAL",
      before: row,
      after,
    });
  }

  return {
    schema: "ai-matchlab.canonical-verified-final-repair-plan.v1",
    dayKey,
    repairedAt,
    canonicalRows: canonicalEntries.length,
    finalRows: finalEntries.length,
    actionCount: actions.length,
    blockedCount: blocked.length,
    actions,
    blocked,
  };
}

export function repairCanonicalFromVerifiedFinalsDay(
  dayKey,
  {
    canonicalRoot = resolveDataPath("canonical-fixtures"),
    finalResultsRoot = resolveDataPath("final-results"),
    write = false,
    repairedAt = new Date().toISOString(),
  } = {},
) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean(dayKey))) {
    throw new Error(`canonical_verified_final_repair_invalid_day:${dayKey}`);
  }

  const canonicalEntries = readCanonicalDay(dayKey, canonicalRoot);
  const finalEntries = readFinalResultsDay(dayKey, finalResultsRoot);
  const resolvedCanonicalRows = canonicalFixturesForDay(dayKey);
  const plan = planCanonicalVerifiedFinalRepair({
    dayKey,
    canonicalEntries,
    finalEntries,
    resolvedCanonicalRows,
    repairedAt,
  });

  if (!write) return { ...plan, writeApplied: false };

  const actionsByPath = new Map();
  for (const action of plan.actions) {
    if (!actionsByPath.has(action.filePath)) actionsByPath.set(action.filePath, []);
    actionsByPath.get(action.filePath).push(action);
  }

  for (const [filePath, actions] of actionsByPath.entries()) {
    const payload = loadJson(filePath);
    const key = Array.isArray(payload)
      ? null
      : Array.isArray(payload?.fixtures)
        ? "fixtures"
        : Array.isArray(payload?.matches)
          ? "matches"
          : Array.isArray(payload?.rows)
            ? "rows"
            : null;
    const rows = Array.isArray(payload) ? payload : key ? payload[key] : null;
    if (!Array.isArray(rows)) throw new Error(`canonical_verified_final_repair_rows_missing:${filePath}`);

    for (const action of actions) {
      const current = rows[action.rowIndex];
      const currentId = clean(current?.canonicalId || current?.matchId || current?.id);
      if (currentId !== action.matchId) {
        throw new Error(`canonical_verified_final_repair_prewrite_identity_changed:${action.matchId}`);
      }
      rows[action.rowIndex] = action.after;
    }

    if (!Array.isArray(payload)) {
      payload[key] = rows;
      if (Object.prototype.hasOwnProperty.call(payload, "count")) payload.count = rows.length;
      payload.updatedAt = repairedAt;
    }
    writeJsonAtomic(filePath, payload);
  }

  return {
    ...plan,
    writeApplied: true,
    filesWritten: actionsByPath.size,
  };
}

function parseArgs(argv) {
  const out = { dayKey: "", write: false };
  for (const token of argv) {
    if (/^\d{4}-\d{2}-\d{2}$/u.test(token)) out.dayKey = token;
    else if (token === "--write") out.write = true;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dayKey) {
    console.error("usage: node repair-canonical-from-verified-finals-day.js YYYY-MM-DD [--write]");
    process.exit(2);
  }
  const result = repairCanonicalFromVerifiedFinalsDay(args.dayKey, { write: args.write });
  console.log(JSON.stringify({
    schema: result.schema,
    dayKey: result.dayKey,
    canonicalRows: result.canonicalRows,
    finalRows: result.finalRows,
    actionCount: result.actionCount,
    blockedCount: result.blockedCount,
    blocked: result.blocked,
    writeApplied: result.writeApplied,
    filesWritten: result.filesWritten || 0,
  }, null, 2));
  if (result.blocked.some(row => String(row.reason).startsWith("FINAL_TRUTH_NOT_VERIFIED") || row.reason === "TEAM_PAIR_MISMATCH" || row.reason === "DAY_MISMATCH")) {
    process.exitCode = 1;
  }
}
