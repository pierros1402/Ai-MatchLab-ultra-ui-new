/**
 * matchday-ledger.js
 *
 * Per-FIXTURE matchday (round) — the second half of the matchday confirmation
 * axis. Where core/matchday-axis.js writes ONE number per league (the current
 * round, = mode of standings `played`), the ledger writes a round onto EVERY
 * fixture of the season. That closes the re-audit finding
 * FULL_SEASON_MATCHDAY_LEDGER_MISSING (rolling window had 0 rowsWithRound) and
 * unlocks the "Χώρα – Λίγκα · Αγωνιστική N" label plus a per-match integrity axis.
 *
 * Deterministic, no new API / no scrape. The round is IMPUTED from the same
 * signal the axis already trusts: how many league games each team has played.
 * We order a league's matches chronologically and, for each match, take the
 * running appearance count of its two teams; the round is the higher of the two
 * (a game-in-hand should not pull a fixture back to an earlier round). Because
 * this is the same arithmetic as `played`, the ledger's latest round must agree
 * with the axis's league matchday — a built-in cross-check, not a coincidence.
 *
 * Honesty note: this is an IMPUTED round (`roundSource: "imputed_sequential"`),
 * not an authoritative round number from a feed. A postponed match played out of
 * order lands on the higher of its two teams' counts rather than its originally
 * scheduled round. That is fine for a confirmation axis and a display label; it
 * is NOT a claim of official fixture-list rounds.
 */

import { normalizeTeamKey } from "./normalize.js";

/**
 * Impute a round for each match from chronological appearance counts.
 *
 * @param {Array<{key?:string, homeTeam:string, awayTeam:string, kickoff_ms:number}>} matches
 * @param {{keyFn?:(name:string)=>string}} [opts]
 * @returns {Array<{key:string, round:number, homeCount:number, awayCount:number, kickoff_ms:number}>}
 *          chronological order, one entry per usable match.
 */
export function assignRounds(matches, { keyFn = normalizeTeamKey } = {}) {
  const ordered = (Array.isArray(matches) ? matches : [])
    .filter(m => m && Number.isFinite(m.kickoff_ms) && m.homeTeam && m.awayTeam)
    // Stable order: kickoff first, then a deterministic tiebreak so two matches
    // at the same instant always sort the same way across runs.
    .sort((a, b) =>
      a.kickoff_ms - b.kickoff_ms ||
      String(a.key ?? "").localeCompare(String(b.key ?? "")) ||
      String(a.homeTeam).localeCompare(String(b.homeTeam)));

  const counts = new Map();
  const out = [];
  for (const m of ordered) {
    const hk = keyFn(m.homeTeam);
    const ak = keyFn(m.awayTeam);
    if (!hk || !ak || hk === ak) continue; // guard: missing/degenerate identity
    const hn = (counts.get(hk) || 0) + 1;
    const an = (counts.get(ak) || 0) + 1;
    counts.set(hk, hn);
    counts.set(ak, an);
    out.push({
      key: m.key ?? `${hk}|${ak}|${m.kickoff_ms}`,
      round: Math.max(hn, an),
      homeCount: hn,
      awayCount: an,
      kickoff_ms: m.kickoff_ms
    });
  }
  return out;
}

/**
 * Summarize an assigned ledger for the per-league state/report row. `teams` is
 * the accepted team count (from standings) used to sanity-check round sizes: a
 * healthy round has floor(teams/2) matches. Rounds that are much larger than
 * that signal contaminated identity (two clubs folded to one key) or a wrong
 * team count — surfaced as a soft anomaly, never fatal here (the axis gate is
 * the hard gate).
 */
export function summarizeLedger(assigned, teams = null) {
  const rows = Array.isArray(assigned) ? assigned : [];
  if (!rows.length) {
    return {
      matchesWithRound: 0,
      latestRound: null,
      firstRound: null,
      roundsSeen: 0,
      expectedPerRound: teams ? Math.floor(teams / 2) : null,
      oversizedRounds: [],
      anomaly: { bool: false, reason: "empty" }
    };
  }

  const perRound = new Map();
  let latestRound = 0;
  let firstRound = Infinity;
  for (const r of rows) {
    perRound.set(r.round, (perRound.get(r.round) || 0) + 1);
    if (r.round > latestRound) latestRound = r.round;
    if (r.round < firstRound) firstRound = r.round;
  }

  const expectedPerRound = teams ? Math.floor(teams / 2) : null;
  // A round should not hold more than one full slate of fixtures. Allow a small
  // slack for makeup/extra games before calling it oversized.
  const oversizedRounds = [];
  if (expectedPerRound) {
    const cap = Math.max(expectedPerRound + 1, Math.ceil(expectedPerRound * 1.5));
    for (const [round, n] of perRound) {
      if (n > cap) oversizedRounds.push({ round, matches: n, expected: expectedPerRound });
    }
  }

  return {
    matchesWithRound: rows.length,
    latestRound,
    firstRound: firstRound === Infinity ? null : firstRound,
    roundsSeen: perRound.size,
    expectedPerRound,
    oversizedRounds: oversizedRounds.sort((a, b) => b.matches - a.matches),
    anomaly: {
      bool: oversizedRounds.length > 0,
      reason: oversizedRounds.length ? "oversized_round" : "ok"
    }
  };
}

/**
 * Cross-check the ledger's latest round against the axis's league matchday.
 * They are derived from the same `played` signal by different paths, so they
 * should agree within a game or two (games in hand, a just-recorded result the
 * axis mode hasn't caught up to). A larger gap means one of the two is off and
 * we should not trust the round for confirmation.
 *
 * @returns {{agrees:boolean, gap:number|null, reason:string}}
 */
export function crossCheckAgainstAxis(latestRound, axisMatchday, tolerance = 2) {
  if (!Number.isFinite(latestRound) || !Number.isFinite(axisMatchday)) {
    return { agrees: false, gap: null, reason: "missing_input" };
  }
  const gap = Math.abs(latestRound - axisMatchday);
  return {
    agrees: gap <= tolerance,
    gap,
    reason: gap <= tolerance ? "ok" : "ledger_axis_mismatch"
  };
}
