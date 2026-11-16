import { getLeagueCoverage } from '../../workers/_shared/leagues-coverage.js';

// Competition identity comes exclusively from the approved registry. Unknown
// slugs retain the domestic rule; a display name cannot grant an exception.
export function formMaximumAgeDays(leagueSlug, domesticMaximum = 35) {
  const type = getLeagueCoverage(leagueSlug)?.type;
  return type === 'continental' || type === 'national' ? null : domesticMaximum;
}

export function isEligibleFormDate(matchDate, fixtureDate, leagueSlug, domesticMaximum = 35) {
  if (!(matchDate instanceof Date) || !(fixtureDate instanceof Date)) return false;
  const played = Number(matchDate), kickoff = Number(fixtureDate);
  if (!Number.isFinite(played) || !Number.isFinite(kickoff) || played >= kickoff) return false;
  const maximum = formMaximumAgeDays(leagueSlug, domesticMaximum);
  return maximum === null || Math.floor((kickoff - played) / 86400000) <= maximum;
}
