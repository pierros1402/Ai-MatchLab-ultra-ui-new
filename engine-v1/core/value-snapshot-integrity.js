import { athensDayKey } from './daykey.js';
import { isFrozenValueGateReleaseSafe } from './frozen-value-release-contract.js';
import { planAObservationSignature, PLAN_A_OBSERVATION_SCHEMA } from '../value/plan-a-observation.js';

// This validator rejects inconsistent evidence. It never creates observations,
// changes timestamps, or upgrades an artifact's publication authority.
export function validateValuePublicationIntegrity({ day, fixtures, value, audit, gate, today = athensDayKey() }) {
  const errors = [];
  const ids = fixtures.map(row => String(row.canonicalId || row.matchId || ''));
  const members = new Set(ids);
  if (ids.some(id => !id) || members.size !== ids.length) errors.push('fixture_identity_invalid');
  if (!value || value.ok === false || value.date !== day || !Array.isArray(value.picks) || value.count !== value.picks.length) errors.push('value_day_or_count_invalid');
  if (value?.source !== 'canonical_fixtures') errors.push('value_source_invalid');
  for (const pick of value?.picks || []) {
    if (!pick?.matchId || !members.has(String(pick.matchId))) errors.push(`value_noncanonical_pick:${pick?.matchId || 'missing'}`);
  }
  if (day < today && value?.publicationAuthority === 'current_value_artifact_first_freeze') errors.push('historical_first_freeze_forbidden');
  const time = x => typeof x === 'number' ? x : Date.parse(x);
  const times = [value?.createdAt,value?.updatedAt,value?.generatedAt,audit?.generatedAt].map(time).filter(Number.isFinite);
  const canonicalTime = time(gate?.latestCanonicalUpdatedAt);
  const stale = gate?.valueFreshAgainstCanonical === false || (Number.isFinite(canonicalTime) && times.length > 0 && Math.max(...times) < canonicalTime);
  if (stale && !isFrozenValueGateReleaseSafe(gate)) errors.push('stale_value_without_verified_frozen_binding');
  const signedObservation = value?.immutable === true && value?.schema === PLAN_A_OBSERVATION_SCHEMA &&
    value.observationSignature === planAObservationSignature(day, value);
  if (value?.immutable === true && !signedObservation) errors.push('frozen_observation_signature_invalid');
  if (stale && !signedObservation) errors.push('stale_value_without_signed_observation');
  if (!audit || typeof audit !== 'object' || Array.isArray(audit) || audit.ok !== true || audit.date !== day) errors.push('value_audit_missing_or_invalid');
  else {
    if (audit.source !== 'canonical_fixtures' || audit.sourceContract?.canonicalOnly !== true) errors.push('value_audit_source_invalid');
    const universe = audit.fixtureUniverse;
    if (!universe || !Array.isArray(universe.canonicalIds) || universe.count !== universe.canonicalIds.length ||
        new Set(universe.canonicalIds).size !== universe.count || universe.count !== members.size ||
        universe.canonicalIds.some(id => !members.has(String(id)))) errors.push('value_audit_universe_mismatch');
    if (!Number.isInteger(audit.universe?.approved) || audit.universe.approved !== value?.picks?.length) errors.push('value_audit_pick_count_mismatch');
    if (audit.evaluationAccounting?.unaccountedFixtureCount !== 0 || audit.evaluationAccounting?.duplicateOutcomeCount !== 0) errors.push('value_audit_accounting_incomplete');
    if (audit.decisionInputEvidence?.targetDay && audit.decisionInputEvidence.targetDay !== day) errors.push('value_audit_execution_day_mismatch');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
