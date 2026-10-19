import { readPrematchFinalForm } from './prematch-verified-final-form.js';
import { historyCompetitionDecision } from './history-competition-provenance.js';
import { currentSeason } from './season.js';

// Additional observations are a derived, prospective read view. Every result
// still passes the existing canonical + verified-final + identity validator.
// The original index, history and frozen observations remain unchanged.
export function prospectiveValueFormView(indexes, season, nowMs = Date.now(), { readFinalForm = readPrematchFinalForm } = {}) {
  if (!Number.isFinite(nowMs)) throw new Error('invalid_value_form_view_time');
  if (indexes.foundationGate) return indexes;
  const verified = readFinalForm(indexes.teamForm || {}, nowMs);
  const teamForm = { ...indexes.teamForm };
  const accepted = new Set();
  for (const [team, entry] of Object.entries(verified.index || {})) {
    const original = teamForm[team] || {};
    const originalRows = original.lastMatches || original.recentMatches || original.matches || original.form || original.history || [];
    const byId = new Map(originalRows.map(row => [row.canonicalId || row.matchId || row.id, row]));
    for (const row of entry.matches || []) {
      const id = row.canonicalId || row.matchId || row.id;
      const kickoff = Date.parse(row.kickoff || row.kickoffUtc);
      if (!id || !Number.isFinite(kickoff) || kickoff >= nowMs
        || currentSeason(new Date(kickoff)) !== season || !historyCompetitionDecision(row).accepted) continue;
      const old = byId.get(id);
      if (old && (old.scoreHome !== row.scoreHome || old.scoreAway !== row.scoreAway)) throw new Error(`value_form_view_score_conflict:${id}`);
      byId.set(id, row); accepted.add(id);
    }
    // The evaluator prefers lastMatches/recentMatches to matches. Set the
    // actual selected representation, rather than leaving a stale alias ahead.
    const field = ['lastMatches','recentMatches','matches','form','history'].find(key => Array.isArray(original[key])) || 'matches';
    teamForm[team] = { ...original, [field]: [...byId.values()] };
  }
  return { ...indexes, teamForm, prospectiveVerifiedForm: {
    policy: 'canonical_verified_final_prospective_read_view_v1', asOf: new Date(nowMs).toISOString(),
    acceptedMatches: accepted.size, acceptedCanonicalIds: [...accepted].sort(), validation: verified.summary,
    rawHistoryChanged: false, frozenPredictionsRegenerated: false
  } };
}
