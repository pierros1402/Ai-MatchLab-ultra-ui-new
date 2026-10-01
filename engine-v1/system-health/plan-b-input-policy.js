export function collectPlanBInputIssues(audits = {}) {
  const issues = [];
  for (const [plan, audit] of Object.entries(audits)) {
    if (!audit || audit.source === "historical_missing_observation_recovery_sentinel") continue;
    const missing = Number(audit.membership?.canonicalRowsWithoutAssessment || 0);
    const ambiguous = Array.isArray(audit.membership?.ambiguousCanonicalMatches)
      ? audit.membership.ambiguousCanonicalMatches.length : Number(audit.membership?.ambiguousCanonicalMatches || 0);
    if (missing > 0 || ambiguous > 0) issues.push({
      severity: "warning", source: "value-input", type: `plan_${plan.toLowerCase()}_assessment_coverage_incomplete`,
      message: `Plan ${plan} ran with incomplete model-assessment coverage; its output is not proof of a fully evaluated zero-pick day.`,
      details: { plan, missing, ambiguous, canonicalFixtures: audit.membership?.canonicalFixtures,
        joinedMatches: audit.membership?.joinedMatches, orphanAssessmentRows: audit.membership?.orphanAssessmentRows,
        missingCanonicalIds: audit.membership?.canonicalRowsWithoutAssessmentIds || [] }
    });
    if (audit.evaluationAccounting?.complete === false) issues.push({
      severity: "error", source: "value-input", type: `plan_${plan.toLowerCase()}_evaluation_accounting_failed`,
      message: `Plan ${plan} did not account for every fixture exactly once.`, details: audit.evaluationAccounting
    });
    const unavailable = (audit.fixtureLedger || []).filter(row => row.opponentAdjustment?.status === "unavailable").length;
    if (unavailable > 0) issues.push({
      severity: "warning", source: "value-input", type: `plan_${plan.toLowerCase()}_opponent_adjustment_unavailable`,
      message: `Plan ${plan} lacks trusted opponent standings for ${unavailable} evaluated fixtures.`, details: { plan, fixtures: unavailable }
    });
  }
  return issues;
}
