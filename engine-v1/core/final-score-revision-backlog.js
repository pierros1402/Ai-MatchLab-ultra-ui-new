const POLICY_VERSION = "flashscore-terminal-revision-v1";
const MIN_OBSERVATION_GAP_MS = 60 * 1000;
const MIN_STABLE_MS = 4 * 60 * 1000;
const MIN_STABLE_OBSERVATIONS = 2;

function clean(value) {
  return String(value ?? "").trim();
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function scoreKeyOf(value) {
  if (!value || typeof value !== "object") return "";
  const direct = clean(value.scoreKey || value?.finalScore?.scoreKey);
  if (direct) return direct;
  const home = value.homeScore ?? value.scoreHome ?? value?.finalScore?.homeScore;
  const away = value.awayScore ?? value.scoreAway ?? value?.finalScore?.awayScore;
  const h = Number(home);
  const a = Number(away);
  return Number.isInteger(h) && h >= 0 && Number.isInteger(a) && a >= 0
    ? `${h}-${a}`
    : "";
}

function providerIdOf(value) {
  return clean(
    value?.providerMatchId ||
    value?.sourceId ||
    value?.sourceMatchId ||
    value?.sources?.[0]?.providerMatchId
  );
}

function providerOf(value) {
  return clean(value?.provider || value?.sources?.[0]?.provider).toLowerCase();
}

function sameInstant(a, b) {
  const left = Date.parse(clean(a));
  const right = Date.parse(clean(b));
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

function conflictIdentity(row) {
  return [
    clean(row?.matchId),
    clean(row?.existingScore),
    clean(row?.newScore),
    clean(row?.providerMatchId)
  ].join("|");
}

export function isAutoCorrectableFlashscoreRevision({
  existingArtifact,
  target,
  candidatePayload
} = {}) {
  if (existingArtifact?.verifiedFinalTruth !== true) return false;
  if (candidatePayload?.verifiedFinalTruth !== true) return false;
  if (clean(target?.canonicalFixture?.source).toLowerCase() !== "flashscore") return false;
  if (providerOf(existingArtifact) !== "flashscore") return false;
  if (providerOf(candidatePayload) !== "flashscore") return false;

  const targetProviderId = providerIdOf(target?.canonicalFixture);
  const existingProviderId = providerIdOf(existingArtifact);
  const candidateProviderId = providerIdOf(candidatePayload);

  if (!targetProviderId) return false;
  if (existingProviderId !== targetProviderId) return false;
  if (candidateProviderId !== targetProviderId) return false;

  if (clean(existingArtifact?.matchId) !== clean(target?.matchId)) return false;
  if (clean(candidatePayload?.matchId) !== clean(target?.matchId)) return false;

  if (!sameInstant(existingArtifact?.kickoffUtc, target?.kickoffUtc)) return false;
  if (!sameInstant(candidatePayload?.kickoffUtc, target?.kickoffUtc)) return false;

  const existingScore = scoreKeyOf(existingArtifact);
  const candidateScore = scoreKeyOf(candidatePayload);

  return Boolean(existingScore && candidateScore && existingScore !== candidateScore);
}

export function buildFinalScoreConflictBacklog({
  dayKey,
  previousBacklog = null,
  conflicts = [],
  nowMs = Date.now()
} = {}) {
  const previousActive = Array.isArray(previousBacklog?.activeConflicts)
    ? previousBacklog.activeConflicts
    : [];
  const previousByIdentity = new Map(
    previousActive.map(row => [conflictIdentity(row), row])
  );
  const activeConflicts = [];

  for (const conflict of conflicts) {
    const identity = conflictIdentity(conflict);
    const previous = previousByIdentity.get(identity) || null;
    const previousLastMs = Date.parse(clean(previous?.lastObservedAt));
    const previousFirstMs = Date.parse(clean(previous?.firstObservedAt));
    const firstObservedMs = Number.isFinite(previousFirstMs)
      ? previousFirstMs
      : nowMs;
    const observationGapMs = Number.isFinite(previousLastMs)
      ? Math.max(0, nowMs - previousLastMs)
      : null;
    const incrementsObservation =
      !previous ||
      !Number.isFinite(previousLastMs) ||
      observationGapMs >= MIN_OBSERVATION_GAP_MS;
    const observationCount = Math.max(
      1,
      Number(previous?.observationCount || 0) + (incrementsObservation ? 1 : 0)
    );
    const stableForMs = Math.max(0, nowMs - firstObservedMs);
    const autoCorrectionEligible = conflict?.autoCorrectionEligible === true;
    const ready =
      autoCorrectionEligible &&
      observationCount >= MIN_STABLE_OBSERVATIONS &&
      stableForMs >= MIN_STABLE_MS;

    activeConflicts.push({
      matchId: clean(conflict?.matchId),
      homeTeam: clean(conflict?.homeTeam),
      awayTeam: clean(conflict?.awayTeam),
      existingScore: clean(conflict?.existingScore),
      newScore: clean(conflict?.newScore),
      provider: clean(conflict?.provider).toLowerCase() || null,
      providerMatchId: clean(conflict?.providerMatchId) || null,
      filePath: clean(conflict?.filePath) || null,
      conflictType: clean(conflict?.type) || "verified_final_score_revision",
      reason: clean(conflict?.reason || conflict?.penaltyCorrectionReason) || null,
      policyVersion: POLICY_VERSION,
      autoCorrectionEligible,
      state: ready
        ? "READY_FOR_AUTO_CORRECTION"
        : autoCorrectionEligible
          ? "PENDING_STABILITY"
          : "PENDING_ADJUDICATION",
      firstObservedAt: iso(firstObservedMs),
      lastObservedAt: iso(nowMs),
      observationCount,
      stableForMs,
      minStableMs: MIN_STABLE_MS,
      minStableObservations: MIN_STABLE_OBSERVATIONS,
      nextRetryAt: iso(nowMs + MIN_OBSERVATION_GAP_MS)
    });
  }

  const currentIdentities = new Set(activeConflicts.map(conflictIdentity));
  const newlyResolved = previousActive
    .filter(row => !currentIdentities.has(conflictIdentity(row)))
    .map(row => ({
      ...row,
      state: "RESOLVED_NO_LONGER_ACTIVE",
      resolvedAt: iso(nowMs)
    }));
  const previousResolved = Array.isArray(previousBacklog?.resolvedConflicts)
    ? previousBacklog.resolvedConflicts
    : [];
  const resolvedConflicts = [...previousResolved, ...newlyResolved].slice(-200);

  return {
    schema: "ai-matchlab.final-score-conflict-backlog.v1",
    dayKey: clean(dayKey),
    generatedAt: iso(nowMs),
    policyVersion: POLICY_VERSION,
    summary: {
      active: activeConflicts.length,
      pendingStability: activeConflicts.filter(row => row.state === "PENDING_STABILITY").length,
      readyForAutoCorrection: activeConflicts.filter(row => row.state === "READY_FOR_AUTO_CORRECTION").length,
      pendingAdjudication: activeConflicts.filter(row => row.state === "PENDING_ADJUDICATION").length,
      resolvedRetained: resolvedConflicts.length
    },
    activeConflicts,
    resolvedConflicts,
    guarantees: {
      conflictIsPerMatch: true,
      unrelatedFinalsMayProgress: true,
      sameProviderAutoCorrectionRequiresExactProviderId: true,
      sameProviderAutoCorrectionRequiresStableRepeatedObservation: true,
      oddsUsed: false
    }
  };
}

export function markBacklogAutoCorrected(backlog, correctedRows, nowMs = Date.now()) {
  const correctedIds = new Set(
    (Array.isArray(correctedRows) ? correctedRows : [])
      .map(row => clean(row?.matchId))
      .filter(Boolean)
  );
  if (!correctedIds.size) return backlog;

  const active = [];
  const resolved = Array.isArray(backlog?.resolvedConflicts)
    ? [...backlog.resolvedConflicts]
    : [];

  for (const row of backlog?.activeConflicts || []) {
    if (!correctedIds.has(clean(row?.matchId))) {
      active.push(row);
      continue;
    }
    resolved.push({
      ...row,
      state: "AUTO_CORRECTED",
      resolvedAt: iso(nowMs)
    });
  }

  const next = {
    ...backlog,
    generatedAt: iso(nowMs),
    activeConflicts: active,
    resolvedConflicts: resolved.slice(-200)
  };
  next.summary = {
    active: active.length,
    pendingStability: active.filter(row => row.state === "PENDING_STABILITY").length,
    readyForAutoCorrection: active.filter(row => row.state === "READY_FOR_AUTO_CORRECTION").length,
    pendingAdjudication: active.filter(row => row.state === "PENDING_ADJUDICATION").length,
    resolvedRetained: next.resolvedConflicts.length
  };
  return next;
}

export function buildAutoCorrectedFinalPayload(
  candidatePayload,
  existingArtifact,
  backlogEntry,
  nowMs = Date.now()
) {
  return {
    ...candidatePayload,
    terminalScoreRevision: {
      policyVersion: POLICY_VERSION,
      state: "APPLIED",
      appliedAt: iso(nowMs),
      provider: "flashscore",
      providerMatchId: clean(backlogEntry?.providerMatchId),
      previousScore: scoreKeyOf(existingArtifact),
      correctedScore: scoreKeyOf(candidatePayload),
      firstObservedAt: backlogEntry?.firstObservedAt || null,
      lastObservedAt: backlogEntry?.lastObservedAt || null,
      observationCount: Number(backlogEntry?.observationCount || 0),
      stableForMs: Number(backlogEntry?.stableForMs || 0),
      oddsUsed: false
    }
  };
}

export const FINAL_SCORE_REVISION_POLICY = Object.freeze({
  policyVersion: POLICY_VERSION,
  minObservationGapMs: MIN_OBSERVATION_GAP_MS,
  minStableMs: MIN_STABLE_MS,
  minStableObservations: MIN_STABLE_OBSERVATIONS
});
