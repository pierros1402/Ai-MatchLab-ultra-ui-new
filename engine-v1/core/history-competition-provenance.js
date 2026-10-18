import { LEAGUES_COVERAGE } from '../../workers/_shared/leagues-coverage.js';
import { resolveSlugFromPath } from '../odds/flashscore-league-map.js';
import { domesticCompetitionNameContradiction } from './competition-name-scope.js';

export const HISTORY_COMPETITION_POLICY = 'explicit_competition_provenance_v1';
const countries = new Map(LEAGUES_COVERAGE.map(row => [row.slug, row.country]));

export function historyCompetitionDecision(row = {}) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { accepted: false, status: 'INVALID', reason: 'INVALID_HISTORY_ROW', leagueSlug: null };
  const slug = String(row.leagueSlug || '').trim();
  const name = String(row.leagueName || '').trim();
  const reason = domesticCompetitionNameContradiction(countries.get(slug), name);
  if (reason && countries.has(slug)) return { accepted: false, status: 'CONTRADICTION', reason, leagueSlug: slug, leagueName: name };
  const resolved = row.competitionResolution?.canonicalSlug;
  if (resolved && resolved !== slug) return { accepted: false, status: 'CONTRADICTION', reason: 'EXPLICIT_RESOLVED_SLUG_MISMATCH', leagueSlug: slug, resolvedSlug: resolved };
  const path = row.providerLeaguePath || row.leaguePath || row.competitionResolution?.rawLeaguePath;
  if (path) {
    const resolved = resolveSlugFromPath(String(path));
    if (!resolved || resolved !== slug) return { accepted: false, status: 'CONTRADICTION', reason: resolved ? 'EXACT_PROVIDER_PATH_SLUG_MISMATCH' : 'UNMAPPED_EXPLICIT_PROVIDER_PATH', leagueSlug: slug, leagueName: name, providerPath: path, resolvedSlug: resolved };
    return { accepted: true, status: 'EXACT_PATH_VERIFIED', leagueSlug: slug };
  }
  // A surviving legacy row is not promoted to externally verified coverage.
  return { accepted: true, status: 'NO_EXPLICIT_CONTRADICTION', leagueSlug: slug };
}

export function filterHistoryCompetitionRows(rows = []) {
  const accepted = [], excluded = [], byLeague = {};
  for (const row of rows) {
    const decision = historyCompetitionDecision(row);
    const slug = decision.leagueSlug || 'unknown';
    const stats = byLeague[slug] ||= { accepted: 0, excluded: 0, externallyCertified: false };
    if (decision.accepted) { accepted.push(row); stats.accepted++; }
    else { excluded.push({ id: row?.canonicalId || row?.matchId || row?.id || null, ...decision, homeTeam: row?.homeTeam, awayTeam: row?.awayTeam, kickoff: row?.kickoff || row?.kickoffUtc || null }); stats.excluded++; }
  }
  return { rows: accepted, summary: { policy: HISTORY_COMPETITION_POLICY, inputRows: rows.length, acceptedRows: accepted.length, excludedRows: excluded.length, byLeague, excluded, historicalFilesChanged: false, allLeagueDataCertified: false } };
}
