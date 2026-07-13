/**
 * matchday-axis.js
 *
 * Deterministic matchday-per-league confirmation axis (no new API, no scrape).
 *
 * The idea (user request 2026-07-13): every league should carry a written
 * "matchday" (round) so we have ONE MORE independent axis to confirm league
 * state — expected-vs-actual. If fixtures + standings + calendar + matchday all
 * agree, we have cross-confirmation; if they disagree, we flag rather than serve
 * a wrong picture (same fail-closed discipline as the standings validation work).
 *
 * Source (deterministic): the ACCEPTED standings snapshot already carries a
 * `played` count per team. The current matchday is the MODE of `played` across
 * the table (mode, not max — max is fragile to a single postponed/extra game).
 *
 * Integrity guard: a single team can have played at most (teams-1)*2 games in a
 * double round-robin season. If the MAX played exceeds that bound, the table is
 * corrupt/cumulative (e.g. an all-time or multi-season aggregate) and the
 * matchday is NOT trustworthy — we surface it as an anomaly. This is exactly
 * what catches blr.1 (played 1..150 for 34 teams) and ~19 other leagues whose
 * standings turned out to be cumulative rather than current-season.
 */

import { readStandings, hasAcceptedStandings } from "../storage/standings-memory-db.js";

/**
 * Games a single team plays in an N-times round-robin of `teamCount` teams.
 * Double (×2) is the common format; ×4 (quadruple) is the practical maximum any
 * professional league reaches (small leagues that meet 3-4 times, or split
 * seasons like Scotland). Returns null when the team count is unusable.
 */
export function maxPlayableGames(teamCount, meetings = 2) {
  if (!Number.isFinite(teamCount) || teamCount < 2) return null;
  return (teamCount - 1) * meetings;
}

/** Most frequent value; ties break toward the higher value (later matchday). */
function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestCount = -1;
  for (const [value, count] of counts) {
    if (count > bestCount || (count === bestCount && value > best)) {
      bestCount = count;
      best = value;
    }
  }
  return best;
}

/**
 * Compute the matchday axis for a single league from its accepted standings.
 * Pure read — never writes. Returns a stable-shaped object so callers can spread
 * it straight into a league-memory patch or a coverage-readiness row.
 */
export function computeMatchdayAxis(slug) {
  const base = {
    matchday: null,
    matchdayMin: null,
    matchdayMax: null,
    matchdaySpread: null,
    matchdayTeams: null,
    matchdayMaxPossible: null,
    matchdaySource: null,
    matchdayAnomaly: { bool: false, reason: null }
  };

  if (!hasAcceptedStandings(slug)) {
    return { ...base, matchdayAnomaly: { bool: false, reason: "no_validated_standings" } };
  }

  const rows = readStandings(slug)?.accepted?.rows || [];
  const played = rows.map(r => r.played).filter(Number.isFinite);
  if (!played.length) {
    return { ...base, matchdaySource: "standings_played", matchdayAnomaly: { bool: false, reason: "no_played_data" } };
  }

  return deriveMatchday(played, rows.length);
}

/**
 * Pure derivation of the matchday axis from a league's per-team `played` counts
 * and team count. No disk access — the testable core of computeMatchdayAxis.
 */
export function deriveMatchday(played, teams) {
  const matchday = mode(played);
  const matchdayMin = Math.min(...played);
  const matchdayMax = Math.max(...played);
  const matchdaySpread = matchdayMax - matchdayMin;
  const boundDouble = maxPlayableGames(teams, 2); // normal-format upper bound
  const boundQuad = maxPlayableGames(teams, 4);   // practical absolute maximum
  const matchdayMaxPossible = boundDouble;

  // Two-clause integrity guard (each catches a distinct corruption mode):
  //   1. over-play: a team played more than even a quadruple round-robin allows
  //      → the table is an all-time / multi-season CUMULATIVE aggregate
  //      (e.g. mex.1 mode 202, aze.1 max 169). Uses the ×4 bound so legitimate
  //      small/split-season leagues (Scotland 38, Croatia 36) are NOT flagged.
  //   2. contaminated spread: the played spread exceeds a whole double
  //      round-robin → the current-season table is polluted with a few stale
  //      rows from another phase/season (e.g. blr.1 mode 1 but max 150; blr.2
  //      mode 1 max 160). A healthy in-progress table has a spread of only a
  //      game or two (games in hand).
  let bool = false;
  let reason = "ok";
  const overPlay = boundQuad != null && matchdayMax > boundQuad;
  const contaminatedSpread = boundDouble != null && matchdaySpread > boundDouble;
  if (overPlay && contaminatedSpread) {
    bool = true;
    reason = "cumulative_and_contaminated";
  } else if (overPlay) {
    bool = true;
    reason = "played_exceeds_quad_round_robin";
  } else if (contaminatedSpread) {
    bool = true;
    reason = "played_spread_exceeds_season";
  }

  // Soft flag: an in-bound table with an unusually wide spread (early-season
  // byes, postponements, withdrawals). Surfaced for transparency but NOT fatal —
  // the matchday mode is still the best current-round estimate.
  const softThreshold = boundDouble != null ? Math.max(4, Math.ceil(boundDouble * 0.5)) : Infinity;
  const softSpreadFlag = !bool && matchdaySpread > softThreshold;

  return {
    matchday,
    matchdayMin,
    matchdayMax,
    matchdaySpread,
    matchdayTeams: teams,
    matchdayMaxPossible,
    matchdaySource: "standings_played_mode",
    matchdayAnomaly: { bool, reason, softSpreadFlag }
  };
}

/**
 * League integrity is "green" (safe to surface rich standings/form/H2H UI) only
 * when standings are validated AND a trustworthy matchday was derived AND no
 * hard anomaly fired. This is the single gate the details/UI layers consult so
 * the fail-closed rule lives in one place.
 */
export function isLeagueIntegrityGreen(slug) {
  const axis = computeMatchdayAxis(slug);
  return Boolean(
    hasAcceptedStandings(slug) &&
    axis.matchday != null &&
    axis.matchdayAnomaly &&
    axis.matchdayAnomaly.bool === false
  );
}
