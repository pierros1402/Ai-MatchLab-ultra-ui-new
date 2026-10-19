import fs from 'node:fs';
import { canonicalFixturesForDay } from './day-fixture-universe.js';
import { athensDayFromKickoff } from './daykey.js';
import { resolveDataPath } from '../storage/data-root.js';
import { buildVerifiedHistoryDay } from '../jobs/append-finalized-day-to-history.js';
import { historyCompetitionDecision } from './history-competition-provenance.js';

// Canonical + committed verified-final parity is sufficient truth. A second
// research copy or a successful append to consolidated history is not required.
export function collectCommittedFinalForm(baseIndex, nowMs, { fixturesForDay, finalForFixture }) {
  if (!Number.isFinite(nowMs)) throw new Error('invalid_committed_final_cutoff');
  const index = {}, known = new Map(), seen = new Set();
  const summary = { policy:'committed_canonical_verified_final_v1', accepted:0, alreadyIndexed:0, rejected:{}, acceptedCanonicalIds:[] };
  const deny = reason => { summary.rejected[reason] = (summary.rejected[reason] || 0) + 1; };
  for (const entry of Object.values(baseIndex || {})) for (const row of entry.matches || []) known.set(row.canonicalId || row.matchId || row.id, row);
  const first = Date.parse(`${athensDayFromKickoff(new Date(nowMs - 35 * 86400000).toISOString())}T12:00Z`);
  for (let dayMs = first; dayMs <= nowMs + 86400000; dayMs += 86400000) {
    const day = new Date(dayMs).toISOString().slice(0,10);
    for (const canonical of fixturesForDay(day)) {
      const id = canonical.canonicalId, kickoff = Date.parse(canonical.kickoffUtc);
      if (!/^cid_[a-zA-Z0-9_]+$/.test(id || '') || seen.has(id)) continue;
      seen.add(id);
      if (!Number.isFinite(kickoff) || kickoff >= nowMs || kickoff < nowMs - 35 * 86400000) continue;
      if (canonical.hasConflict === true || !historyCompetitionDecision(canonical).accepted) { deny('CANONICAL_COMPETITION_OR_IDENTITY_CONFLICT'); continue; }
      const statuses = [canonical.status,canonical.statusType,canonical.rawStatus].filter(Boolean);
      if (!statuses.length || statuses.some(s => !['FT','STATUS_FINAL','STATUS_FULL_TIME','FINISHED'].includes(s))) { deny('REGULATION_FINAL_REQUIRED'); continue; }
      const final = finalForFixture(day,id);
      if (!final) { deny('COMMITTED_VERIFIED_FINAL_MISSING'); continue; }
      if (final.schema !== 'ai-matchlab.verified-final-result.v1' || final.matchId !== id) { deny('COMMITTED_FINAL_IDENTITY_MISMATCH'); continue; }
      const generated = Date.parse(final.generatedAt || final.verification?.generatedAt);
      if (!Number.isFinite(generated) || generated < kickoff || generated > nowMs) { deny('FINAL_AVAILABILITY_UNCONFIRMED'); continue; }
      const built = buildVerifiedHistoryDay({ dayKey:day, canonicalRows:[canonical], finalResultRows:[final], rebuiltAt:nowMs });
      if (!built.ok || built.rows.length !== 1) { deny(built.errors?.[0]?.reason || built.reason || 'CANONICAL_FINAL_PARITY_FAILED'); continue; }
      const row = { ...built.rows[0], source:'prematch_committed_verified_final', verifiedFinalGeneratedAt:new Date(generated).toISOString() };
      const old = known.get(id);
      if (old && (old.scoreHome !== row.scoreHome || old.scoreAway !== row.scoreAway)) throw new Error(`committed_final_history_score_conflict:${id}`);
      if (old) { summary.alreadyIndexed++; continue; }
      known.set(id,row);
      for (const team of [row.homeTeam,row.awayTeam]) (index[team] ||= {matches:[]}).matches.push(row);
      summary.accepted++; summary.acceptedCanonicalIds.push(id);
    }
  }
  return {index,summary};
}

export function readCommittedFinalForm(baseIndex, nowMs) {
  return collectCommittedFinalForm(baseIndex,nowMs,{
    fixturesForDay:canonicalFixturesForDay,
    finalForFixture:(day,id)=>{
      const file=resolveDataPath('final-results',day,`${id}.json`);
      return fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null;
    }
  });
}
