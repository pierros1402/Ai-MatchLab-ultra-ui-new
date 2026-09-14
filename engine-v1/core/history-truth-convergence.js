function cleanReason(value) {
  return String(value ?? "").trim();
}

export function summarizeHistoryTruthParity(build = null, options = {}) {
  const rawLimit = Number(options?.sampleLimit ?? 12);
  const sampleLimit = Number.isInteger(rawLimit) && rawLimit >= 0 ? rawLimit : 12;
  const errors = Array.isArray(build?.errors) ? build.errors : [];
  const byReason = {};
  for (const error of errors) {
    const reason = cleanReason(error?.reason) || "unknown";
    byReason[reason] = Number(byReason[reason] || 0) + 1;
  }
  return {
    ok: build?.ok === true,
    reason: build?.reason || null,
    dayKey: build?.dayKey || null,
    season: build?.season || null,
    canonicalFixtureCount: Number(build?.canonicalFixtureCount || 0),
    canonicalPlayedFinalCount: Number(build?.canonicalPlayedFinalCount || 0),
    verifiedFinalCount: Number(build?.verifiedFinalCount || 0),
    acceptedRows: Number(build?.acceptedRows || 0),
    errorCount: errors.length,
    byReason,
    sampleErrors: errors.slice(0, sampleLimit).map(error => ({
      reason: cleanReason(error?.reason) || "unknown",
      matchId: error?.matchId || null,
      canonicalState: error?.canonicalState || null,
      actualDay: error?.actualDay || null
    }))
  };
}

export function shouldRefreshVerifiedFinalTruth(build = null) {
  if (build?.ok === true) return false;
  const errors = Array.isArray(build?.errors) ? build.errors : [];
  return errors.some(error =>
    cleanReason(error?.reason) === "canonical_final_missing_verified_final"
  );
}
