// Cross-check published claims against per-fixture diagnostics. Partial input
// coverage is a reported state, never a reason to invent inputs or hide picks.
export function auditValuePublication(payload) {
  const errors = [];
  const readiness = payload?.dataReadiness;
  const plan = payload?.unifiedPlan;
  const rows = readiness?.rows;
  const fail = code => errors.push(code);
  if (!Array.isArray(rows) || !plan) return {ok:false, errors:['PUBLICATION_INPUTS_MISSING']};
  if (readiness.date !== payload.date || plan.date !== payload.date) fail('PUBLICATION_DAY_MISMATCH');
  const ids = rows.map(row => row.canonicalId);
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) fail('READINESS_IDENTITIES_NOT_UNIQUE');
  const universe = readiness.fixtureUniverse;
  if (!universe || universe.count !== rows.length || !Array.isArray(universe.canonicalIds)
      || JSON.stringify([...universe.canonicalIds].sort()) !== JSON.stringify([...ids].sort())) fail('READINESS_UNIVERSE_MISMATCH');
  const byReason = {};
  for (const row of rows) {
    if (!Array.isArray(row.reasons) || !['READY','INSUFFICIENT_DATA','NOT_APPLICABLE'].includes(row.status)) {
      fail('READINESS_ROW_INVALID'); continue;
    }
    if (row.status === 'READY' && row.reasons.length || row.status === 'INSUFFICIENT_DATA' && !row.reasons.length) fail('READINESS_STATUS_REASON_MISMATCH');
    if (row.status !== 'NOT_APPLICABLE') for (const reason of row.reasons) byReason[reason] = (byReason[reason] || 0) + 1;
  }
  const applicable = rows.filter(row => row.status !== 'NOT_APPLICABLE');
  const ready = applicable.filter(row => row.status === 'READY').length;
  const complete = applicable.length > 0 && ready === applicable.length;
  const summary = {fixtures:rows.length,applicable:applicable.length,ready,insufficient:applicable.length-ready,byReason};
  for (const key of ['fixtures','applicable','ready','insufficient']) if (readiness.summary?.[key] !== summary[key]) fail('READINESS_SUMMARY_'+key.toUpperCase());
  const sorted = object => JSON.stringify(Object.entries(object || {}).sort(([a],[b])=>a.localeCompare(b)));
  if (sorted(readiness.summary?.byReason) !== sorted(byReason)) fail('READINESS_REASON_COUNTS_MISMATCH');
  if (readiness.complete !== complete) fail('READINESS_COMPLETENESS_MISMATCH');
  const available = plan.status === 'AVAILABLE';
  if (plan.analysisComplete !== (available && complete)) fail('ANALYSIS_COMPLETENESS_MISMATCH');
  const picks = Array.isArray(plan.picks) ? plan.picks : [];
  if (plan.count !== picks.length) fail('PUBLICATION_PICK_COUNT_MISMATCH');
  if (plan.zeroPicksCertified !== (available && complete && picks.length === 0)) fail('ZERO_PICKS_CERTIFICATION_MISMATCH');
  const selected = new Set(), markets = new Map();
  for (const pick of picks) {
    const id = pick.canonicalMatchId || pick.matchId;
    const key = [id,pick.market,pick.pick].join('|');
    if (!ids.includes(id) || selected.has(key)) fail('PUBLICATION_PICK_IDENTITY_INVALID');
    selected.add(key);
    const market = [id,pick.market].join('|');
    if (markets.has(market) && markets.get(market) !== pick.pick) fail('PUBLICATION_OPPOSING_SELECTIONS');
    markets.set(market,pick.pick);
    const scores = pick.sourceScores || {};
    const pair = (a,b) => Number.isFinite(scores[a]) && Number.isFinite(scores[b]) && scores[a] >= .75 && scores[b] >= .75;
    if (!pair('A','A2') && !pair('B','B2')) fail('PUBLICATION_U1_SCORE_FLOOR_VIOLATED');
    const observed = Date.parse(pick.firstObservedAt), kickoff = Date.parse(pick.kickoffUtc);
    if (!Number.isFinite(observed) || !Number.isFinite(kickoff) || observed > kickoff - 60000) fail('PUBLICATION_PREMATCH_EVIDENCE_MISSING');
    const references = (plan.records || []).filter(r=>r.signature === pick.publicationRecord);
    if (!/^[a-f0-9]{64}$/.test(pick.publicationRecord || '') || references.length !== 1) fail('PUBLICATION_RECORD_REFERENCE_MISSING');
    else if (!Number.isFinite(Date.parse(references[0].generatedAt)) || Date.parse(references[0].generatedAt) !== observed) fail('PUBLICATION_OBSERVATION_TIME_MISMATCH');
  }
  return {ok:errors.length===0,errors:[...new Set(errors)],date:payload.date,
    coverageStatus:complete?'COMPLETE':'INCOMPLETE',summary,publishedPicks:picks.length,
    zeroPicksCertified:available&&complete&&picks.length===0,
    certifies:'publication_consistency_only_not_upstream_model_accuracy',predictionsChanged:false};
}

export function requireValuePublicationIntegrity(payload) {
  const audit = auditValuePublication(payload);
  if (!audit.ok) throw new Error('VALUE_PUBLICATION_INTEGRITY:'+audit.errors.join(','));
  return audit;
}
