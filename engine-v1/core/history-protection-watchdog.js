// This controller can request only an existing-byte backup/restore drill.
// It has no forecast, publication, model, historical replay or repair-kernel authority.
export const HISTORY_CANARY_WORKFLOW = "history-preservation-canary.yml";
export const HISTORY_REPOSITORY = "pierros1402/Ai-MatchLab-ultra-ui-new";
const HOUR = 3600000;

function timestamp(value, nowMs) {
  const time = typeof value === "string" ? Date.parse(value) : NaN;
  if (!Number.isFinite(time) || time > nowMs + 300000) throw new Error("history_watchdog_invalid_clock");
  return time;
}

export function validateHistoryLocator(locator, nowMs) {
  if (locator?.schema !== "ai-matchlab.history-locator.v1" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(locator.dayKey || "") ||
      !/^\d+$/.test(locator.runId || "") || !/^[1-9]\d*$/.test(locator.attempt || "") ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(locator.stage || "") ||
      !/^[a-f0-9]{64}$/.test(locator.fingerprint || "") ||
      locator.manifestPath !== `checkpoints/${locator.dayKey}/${locator.runId}/${locator.attempt}/${locator.stage}/manifest.json`) {
    throw new Error("history_watchdog_invalid_locator");
  }
  timestamp(locator.capturedAt, nowMs);
  return locator;
}

export function planHistoryProtection({ nowMs = Date.now(), locator, manifestAvailable, runs,
  archiveMaxAgeMs = 3 * HOUR, restoreMaxAgeMs = 24 * HOUR, retryCooldownMs = 6 * HOUR } = {}) {
  if (!Number.isFinite(nowMs) || !Array.isArray(runs) || runs.length > 1000 ||
      [archiveMaxAgeMs, restoreMaxAgeMs, retryCooldownMs].some(n => !Number.isFinite(n) || n <= 0)) {
    throw new Error("history_watchdog_invalid_observation");
  }
  if (locator) validateHistoryLocator(locator, nowMs);
  const scoped = runs.filter(r => r.head_branch === "main" && r.head_repository?.full_name === HISTORY_REPOSITORY);
  for (const r of scoped) {
    if (!Number.isSafeInteger(r.id) || r.id <= 0 || r.path !== `.github/workflows/${HISTORY_CANARY_WORKFLOW}` ||
        !["completed", "queued", "in_progress", "waiting", "pending", "requested"].includes(r.status)) {
      throw new Error("history_watchdog_invalid_canary_run");
    }
    timestamp(r.run_started_at || r.created_at, nowMs);
    if (r.status === "completed" && !["success", "failure", "cancelled", "timed_out", "skipped", "action_required", "neutral", "stale", "startup_failure"].includes(r.conclusion)) {
      throw new Error("history_watchdog_invalid_canary_conclusion");
    }
  }
  const reasons = [];
  if (!locator || !manifestAvailable) reasons.push("ARCHIVE_CHECKPOINT_UNAVAILABLE");
  else if (nowMs - timestamp(locator.capturedAt, nowMs) > archiveMaxAgeMs) reasons.push("ARCHIVE_CHECKPOINT_STALE");
  const successes = scoped.filter(r => r.status === "completed" && r.conclusion === "success");
  const lastRestore = Math.max(-Infinity, ...successes.map(r => timestamp(r.run_started_at || r.created_at, nowMs)));
  if (nowMs - lastRestore > restoreMaxAgeMs) reasons.push("RESTORE_DRILL_OVERDUE");
  const active = scoped.filter(r => r.status !== "completed");
  let action = "NONE", status = "HEALTHY";
  if (active.some(r => nowMs - timestamp(r.run_started_at || r.created_at, nowMs) > 45 * 60000)) {
    reasons.push("RESTORE_DRILL_STUCK"); status = "BLOCKED"; action = "WAIT";
  } else if (reasons.length) {
    const latestAttempt = Math.max(-Infinity, ...scoped.map(r => timestamp(r.run_started_at || r.created_at, nowMs)));
    if (active.length) { status = "WAITING_FOR_RESTORE"; action = "WAIT"; }
    else if (nowMs - latestAttempt < retryCooldownMs) { status = "BLOCKED_COOLDOWN"; action = "WAIT"; }
    else { status = "RESTORE_REQUIRED"; action = "DISPATCH_CANARY"; }
  }
  return { schema: "ai-matchlab.history-protection-watchdog.v1", observedAt: new Date(nowMs).toISOString(),
    status, action, reasons, archiveCapturedAt: locator?.capturedAt || null,
    lastSuccessfulRestoreStartedAt: Number.isFinite(lastRestore) ? new Date(lastRestore).toISOString() : null,
    activeCanaryRunIds: active.map(r => r.id),
    archiveMaxAgeHours: archiveMaxAgeMs / HOUR, restoreMaxAgeHours: restoreMaxAgeMs / HOUR,
    retryCooldownHours: retryCooldownMs / HOUR,
    metadataAvailabilityOnly: true, restoreVerificationBasis: "SUCCESSFUL_MAIN_CANARY_RUN",
    recentSuccessfulRestore: nowMs - lastRestore <= restoreMaxAgeMs,
    allProducerInputsPreservedCertified: false, historicalReplay: false,
    frozenForecastMutationAuthorized: false, publicationAuthorized: false };
}
