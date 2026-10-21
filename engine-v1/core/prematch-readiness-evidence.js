import {validateProductionRecord} from '../value/unified-production-journal.js';

const idOf = row => String(row?.canonicalId || row?.matchId || '');
const assessmentReasons = new Set(['missing_model_assessment','ambiguous_model_assessment']);
export function needsPrematchReadinessEvidence(row, now) {
  return row.status === 'INSUFFICIENT_DATA' && Array.isArray(row.reasons) &&
    row.reasons.includes('minimum_recent_sample') &&
    row.reasons.every(reason => reason === 'minimum_recent_sample' || assessmentReasons.has(reason)) &&
    (row.modelAssessmentAvailable === true || row.reasons.some(reason => assessmentReasons.has(reason))) &&
    Number.isFinite(Date.parse(row.kickoffUtc)) && Date.parse(row.kickoffUtc) <= Date.parse(now);
}

// This preserves diagnostic evidence at decision time. It never supplies model
// inputs, changes a selector result, or edits a signed historical observation.
export function applyPrematchReadinessEvidence(report, fixtures, records = []) {
  const candidates = new Map(report.rows.filter(row => needsPrematchReadinessEvidence(row, report.generatedAt)).map(row => [row.canonicalId, row]));
  if (!candidates.size || !records.length) return report;
  const currentFixtures = new Map(), duplicates = new Set();
  for (const fixture of fixtures) {
    const id = idOf(fixture);
    if (currentFixtures.has(id)) duplicates.add(id);
    currentFixtures.set(id, fixture);
  }
  const preserved = new Map();
  let invalidRecords = 0;
  for (const raw of records) {
    let record, capturedFixtures;
    try {
      record = validateProductionRecord(raw, report.date);
      if (!Array.isArray(record.readiness.rows)) throw Error('readiness_rows_invalid');
      if (record.readiness.fixtureUniverse?.hash !== report.fixtureUniverse.hash) continue;
      const copies = record.observation.inputFiles.filter(file => file.path === 'canonical-fixture-read-view.json');
      if (copies.length !== 1) continue;
      capturedFixtures = JSON.parse(copies[0].rawUtf8);
      if (!Array.isArray(capturedFixtures)) continue;
    } catch { invalidRecords++; continue; }
    const observed = Date.parse(record.observation.generatedAt);
    const assessed = Date.parse(record.readiness.generatedAt);
    if (!Number.isFinite(observed) || !Number.isFinite(assessed) || assessed > observed || observed > Date.parse(report.generatedAt)) continue;
    for (const [id, current] of candidates) {
      if (duplicates.has(id) || observed > Date.parse(current.kickoffUtc) - 60000) continue;
      const fixture = currentFixtures.get(id);
      const oldRows = record.readiness.rows.filter(row => row.canonicalId === id);
      const oldFixtures = capturedFixtures.filter(row => idOf(row) === id);
      if (!fixture?.homeTeam || !fixture.awayTeam || oldRows.length !== 1 || oldFixtures.length !== 1) continue;
      const old = oldRows[0], captured = oldFixtures[0];
      if (!Array.isArray(old.reasons) || !old.reasons.every(reason => assessmentReasons.has(reason)) ||
          old.status !== (old.reasons.length ? 'INSUFFICIENT_DATA' : 'READY') ||
          (!old.reasons.length && old.modelAssessmentAvailable !== true)) continue;
      if (old.leagueSlug !== current.leagueSlug || captured.leagueSlug !== fixture.leagueSlug ||
          Date.parse(old.kickoffUtc) !== Date.parse(current.kickoffUtc) ||
          Date.parse(captured.kickoffUtc) !== Date.parse(fixture.kickoffUtc) ||
          fixture.homeTeam !== captured.homeTeam || fixture.awayTeam !== captured.awayTeam) continue;
      if (preserved.has(id) && Date.parse(preserved.get(id).prematchEvidence.observedAt) >= observed) continue;
      const reasons = current.reasons.filter(reason => reason !== 'minimum_recent_sample');
      preserved.set(id, {...current, status: reasons.length ? 'INSUFFICIENT_DATA' : 'READY', reasons, recentHistory: old.recentHistory || null,
        readinessBasis: 'signed_prematch_observation',
        prematchEvidence: {recordSignature: record.recordSignature, observedAt: record.observation.generatedAt,
          kickoffUtc: current.kickoffUtc, scope: 'diagnostics_only_no_selector_inputs_changed'},
        currentDiagnostic: {generatedAt: report.generatedAt, status: current.status,
          reasons: [...current.reasons], recentHistory: current.recentHistory}});
    }
  }
  const rows = report.rows.map(row => preserved.get(row.canonicalId) || row);
  const applicable = rows.filter(row => row.status !== 'NOT_APPLICABLE');
  const ready = applicable.filter(row => row.status === 'READY');
  const byReason = {};
  for (const row of applicable) for (const reason of row.reasons) byReason[reason] = (byReason[reason] || 0) + 1;
  const complete = applicable.length > 0 && ready.length === applicable.length;
  return {...report, rows, complete, status: complete ? 'COMPLETE' : ready.length ? 'PARTIAL' : 'INSUFFICIENT_DATA',
    summary: {...report.summary, ready: ready.length, insufficient: applicable.length - ready.length, byReason},
    readinessTimeBasis: 'signed_prematch_evidence_for_started_fixtures_current_diagnostics_for_future_fixtures',
    prematchEvidence: {preservedRows: preserved.size, invalidRecords, predictionCreated: false}};
}
