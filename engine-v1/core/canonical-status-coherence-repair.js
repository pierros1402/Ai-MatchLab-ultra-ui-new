import { sameTeamName } from "./fixture-dedup.js";
import { classifyMatchState, MATCH_STATE_CLASS } from "./non-played-state.js";
import { findCanonicalStatusConflicts } from "./canonical-status-coherence.js";

function clean(value) {
  return String(value ?? "").trim();
}

function strictScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
}

function sameKickoff(left, right) {
  const a = Date.parse(clean(left));
  const b = Date.parse(clean(right));
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 60_000;
}

function rowId(row) {
  return clean(row?.canonicalId || row?.matchId || row?.id);
}

function scorePair(row) {
  const home = strictScore(row?.scoreHome ?? row?.homeScore ?? row?.finalScore?.homeScore ?? row?.finalScore?.home);
  const away = strictScore(row?.scoreAway ?? row?.awayScore ?? row?.finalScore?.awayScore ?? row?.finalScore?.away);
  return home === null || away === null ? null : { home, away };
}

export function evaluateCanonicalStatusCoherenceRepair({ canonicalRow, finalResult, dayKey }) {
  const conflicts = findCanonicalStatusConflicts({ fixtures: [canonicalRow] });
  if (conflicts.length === 0) {
    return { ok: false, reason: "canonical_already_coherent" };
  }

  if (finalResult?.verifiedFinalTruth !== true) {
    return { ok: false, reason: "verified_final_truth_required" };
  }

  const canonicalId = rowId(canonicalRow);
  if (!canonicalId || rowId(finalResult) !== canonicalId) {
    return { ok: false, reason: "canonical_id_mismatch" };
  }

  const requestedDay = clean(dayKey || canonicalRow?.dayKey);
  if (!requestedDay || clean(canonicalRow?.dayKey) !== requestedDay || clean(finalResult?.dayKey || finalResult?.date) !== requestedDay) {
    return { ok: false, reason: "day_key_mismatch" };
  }

  const leagueSlug = clean(canonicalRow?.leagueSlug || finalResult?.leagueSlug);
  if (clean(canonicalRow?.leagueSlug) && clean(finalResult?.leagueSlug) && clean(canonicalRow.leagueSlug) !== clean(finalResult.leagueSlug)) {
    return { ok: false, reason: "league_slug_mismatch" };
  }

  if (
    !sameTeamName(leagueSlug, canonicalRow?.homeTeam, finalResult?.homeTeam) ||
    !sameTeamName(leagueSlug, canonicalRow?.awayTeam, finalResult?.awayTeam)
  ) {
    return { ok: false, reason: "team_pair_mismatch" };
  }

  if (!sameKickoff(canonicalRow?.kickoffUtc, finalResult?.kickoffUtc)) {
    return { ok: false, reason: "kickoff_mismatch" };
  }

  const canonicalScore = scorePair(canonicalRow);
  const finalScore = scorePair(finalResult);
  if (!canonicalScore || !finalScore) {
    return { ok: false, reason: "numeric_score_required" };
  }
  if (canonicalScore.home !== finalScore.home || canonicalScore.away !== finalScore.away) {
    return { ok: false, reason: "score_mismatch" };
  }

  const canonicalProvider = clean(canonicalRow?.source).toLowerCase();
  const canonicalProviderId = clean(canonicalRow?.sourceId || canonicalRow?.sourceMatchId);
  if (!canonicalProvider || !canonicalProviderId) {
    return { ok: false, reason: "canonical_provider_identity_required" };
  }

  const sources = Array.isArray(finalResult?.sources) ? finalResult.sources : [];
  const evidence = sources.find(source =>
    clean(source?.provider).toLowerCase() === canonicalProvider &&
    clean(source?.providerMatchId) === canonicalProviderId
  );

  if (!evidence) {
    return { ok: false, reason: "exact_provider_terminal_evidence_required" };
  }

  if (classifyMatchState(evidence) !== MATCH_STATE_CLASS.PLAYED_FINAL) {
    return { ok: false, reason: "provider_evidence_not_played_final" };
  }

  const evidenceScore = scorePair(evidence);
  if (!evidenceScore || evidenceScore.home !== finalScore.home || evidenceScore.away !== finalScore.away) {
    return { ok: false, reason: "provider_evidence_score_mismatch" };
  }

  if (
    !sameTeamName(leagueSlug, canonicalRow?.homeTeam, evidence?.home ?? evidence?.homeTeam) ||
    !sameTeamName(leagueSlug, canonicalRow?.awayTeam, evidence?.away ?? evidence?.awayTeam)
  ) {
    return { ok: false, reason: "provider_evidence_team_pair_mismatch" };
  }

  if (!sameKickoff(canonicalRow?.kickoffUtc, evidence?.kickoffUtc)) {
    return { ok: false, reason: "provider_evidence_kickoff_mismatch" };
  }

  return {
    ok: true,
    reason: null,
    canonicalId,
    dayKey: requestedDay,
    provider: canonicalProvider,
    providerMatchId: canonicalProviderId,
    rawStatus: clean(evidence?.rawStatus) || "STATUS_FULL_TIME",
    statusType: clean(evidence?.statusType) || "STATUS_FINAL",
    scoreHome: finalScore.home,
    scoreAway: finalScore.away,
    finalResultGeneratedAt: finalResult?.generatedAt || null,
    evidenceObservedAt: evidence?.terminalObservedAt || null
  };
}

export function applyCanonicalStatusCoherenceRepair({ canonicalRow, finalResult, dayKey, repairedAt = new Date().toISOString() }) {
  const evaluation = evaluateCanonicalStatusCoherenceRepair({ canonicalRow, finalResult, dayKey });
  if (!evaluation.ok) {
    return { changed: false, reason: evaluation.reason, row: canonicalRow, evaluation };
  }

  const previous = {
    status: canonicalRow?.status ?? null,
    statusType: canonicalRow?.statusType ?? null,
    rawStatus: canonicalRow?.rawStatus ?? null,
    operationalState: canonicalRow?.operationalState ?? null,
    minute: canonicalRow?.minute ?? null,
    writebackObservation: canonicalRow?.authoritativeTerminalWriteback?.observation ?? null
  };

  const coherentObservation = {
    status: "FT",
    statusType: evaluation.statusType,
    rawStatus: evaluation.rawStatus,
    scoreHome: evaluation.scoreHome,
    scoreAway: evaluation.scoreAway
  };

  const row = {
    ...canonicalRow,
    status: "FT",
    statusType: evaluation.statusType,
    rawStatus: evaluation.rawStatus,
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    authoritativeTerminalWriteback: canonicalRow?.authoritativeTerminalWriteback
      ? {
          ...canonicalRow.authoritativeTerminalWriteback,
          observation: coherentObservation
        }
      : canonicalRow?.authoritativeTerminalWriteback,
    statusCoherenceRepair: {
      schema: "ai-matchlab.canonical-status-coherence-repair.v1",
      repairedAt,
      reason: "verified_final_exact_provider_terminal_evidence",
      canonicalId: evaluation.canonicalId,
      dayKey: evaluation.dayKey,
      provider: evaluation.provider,
      providerMatchId: evaluation.providerMatchId,
      finalResultGeneratedAt: evaluation.finalResultGeneratedAt,
      evidenceObservedAt: evaluation.evidenceObservedAt,
      previous,
      correctedTo: coherentObservation
    }
  };

  const remaining = findCanonicalStatusConflicts({ fixtures: [row] });
  if (remaining.length > 0) {
    const error = new Error(`canonical_status_repair_postcondition_failed:${remaining.length}`);
    error.conflicts = remaining;
    throw error;
  }

  return { changed: true, reason: null, row, evaluation };
}
