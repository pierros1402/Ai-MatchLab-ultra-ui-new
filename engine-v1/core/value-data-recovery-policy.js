const REPAIRABLE_DETAIL_CODES = new Set([
  "DETAIL_HISTORY_INDEX_FINGERPRINT_STALE", "DETAIL_H2H_FINGERPRINT_STALE",
  "DETAIL_KICKOFF_MISMATCH", "DETAIL_FORM_CUTOFF_MISMATCH",
  "DETAIL_LEAGUE_FORM_CUTOFF_MISMATCH", "DETAIL_H2H_CUTOFF_MISMATCH"
]);

export function planValueDataRecovery(audit, fixtures, { maxFixtures = 500 } = {}) {
  const issues = Array.isArray(audit?.issues) ? audit.issues : [];
  const validUniverse = Array.isArray(fixtures) && fixtures.length > 0 && fixtures.every(row => /^cid_[a-zA-Z0-9_]+$/.test(String(row?.canonicalId || row?.matchId || ""))) && new Set(fixtures.map(row => row.canonicalId || row.matchId)).size === fixtures.length;
  if (!validUniverse) return { status: "BLOCKED", fixtureIds: [], reasons: ["invalid_publication_identity"] };
  if (audit?.ok === true && issues.length === 0) return { status: "HEALTHY", fixtureIds: [], reasons: [] };
  if (!issues.length) return { status: "BLOCKED", fixtureIds: [], reasons: ["audit_missing_or_inconsistent"] };
  const reasons = [...new Set(issues.filter(issue => !REPAIRABLE_DETAIL_CODES.has(issue.code)).map(issue => issue.code || "unknown_issue"))];
  const ids = fixtures.map(row => String(row?.canonicalId || row?.matchId || ""));
  const universe = new Set(ids);
  if (ids.some(id => !/^cid_[a-zA-Z0-9_]+$/.test(id)) || universe.size !== ids.length) reasons.push("invalid_or_ambiguous_publication_identity");
  const fixtureIds = [...new Set(issues.map(issue => issue.id).filter(Boolean))].sort();
  if (issues.some(issue => !issue.id || !universe.has(issue.id))) reasons.push("repair_outside_published_universe");
  if (fixtureIds.length > maxFixtures) reasons.push("repair_budget_exceeded");
  return { status: reasons.length ? "BLOCKED" : "REPAIRABLE", fixtureIds: reasons.length ? [] : fixtureIds,
    reasons: [...new Set(reasons)], issueCodes: [...new Set(issues.map(issue => issue.code))].sort() };
}

export function missingUpcomingAssessmentFixtures(fixtures, join, nowMs) {
  const joined = new Set(join.joinedMatches.map(row => row.canonicalId));
  const ambiguous = new Set(join.ambiguousCanonicalMatches.map(row => row.canonicalId));
  return fixtures.filter(row => {
    const id = row.canonicalId || row.matchId;
    const kickoff = Date.parse(row.kickoffUtc || row.kickoff || "");
    return id && Number.isFinite(kickoff) && kickoff > nowMs && !joined.has(id) && !ambiguous.has(id);
  });
}
