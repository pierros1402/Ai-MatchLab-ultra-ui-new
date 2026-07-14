/**
 * odds-fixture-bridge.js
 *
 * Reconciles the two identity universes that never met: the display FIXTURES
 * come from ESPN (slugs like `sco.tennents`, `uefa.champions`; names "Ayr
 * United", "Greenock Morton"), while the AI opening odds / assessment come from
 * Flashscore (slugs like `fs.scotland.league-cup`; names "Ayr", "Morton",
 * "KuPS (Fin)"). Because the canonical id is derived from slug + names, the two
 * mint DIFFERENT cids for the SAME match, so an exact-id lookup joined only the
 * handful of fixtures whose cids happened to coincide (2/36 on 2026-07-14).
 *
 * This bridge joins them the same matchId-agnostic way results-truth-overlay
 * matches results: by kickoff proximity + team-token overlap on BOTH sides,
 * ignoring slug entirely. It is DISPLAY-ONLY — it attaches an existing frozen
 * assessment/opening onto the fixture the UI already shows; it never mints
 * fixtures, never feeds the value engine (odds↔value firewall), and never
 * overrides a status/result.
 *
 * Honesty: a fixture with NO odds entry stays unmatched — the bridge recovers
 * mis-identified odds, it does not fabricate odds for matches the AI never
 * priced (roughly half of a cup-heavy day is genuinely unpriced).
 */

import { normalizeTeamTokens } from "../core/normalize.js";

// Default kickoff tolerance: the same match reported by two sources should be
// within a couple of hours; wider than clock-skew, tight enough that a home/away
// rematch on another day can never collide.
const DEFAULT_KICKOFF_TOLERANCE_MS = 3 * 60 * 60 * 1000;

/**
 * Flashscore odds names carry a trailing country code — "KuPS (Fin)", "Drita
 * (Kos)". Strip it before tokenizing so it does not leak a bogus token ("fin")
 * or, worse, a real one ("(And)" → "and").
 */
export function stripCountrySuffix(name = "") {
  return String(name || "").replace(/\s*\([a-z]{2,4}\)\s*$/i, "").trim();
}

function tokenSet(name) {
  return new Set(
    normalizeTeamTokens(stripCountrySuffix(name)).split(" ").filter(Boolean)
  );
}

function overlapCount(a, b) {
  let n = 0;
  for (const t of a) if (b.has(t)) n++;
  return n;
}

function kickoffMs(value) {
  const t = new Date(value || 0).getTime();
  return Number.isFinite(t) && t > 0 ? t : null;
}

function idOf(row) {
  return String(row?.canonicalId || row?.matchId || row?.id || "").trim() || null;
}

function teamsOf(row) {
  return {
    home: row?.homeTeam ?? row?.home ?? "",
    away: row?.awayTeam ?? row?.away ?? ""
  };
}

/**
 * Score a candidate (fixture, oddsEntry) pair. Returns null when it is not a
 * plausible same-match pair (a side shares no token, or kickoffs are too far
 * apart). Otherwise a higher score = a stronger match:
 *   +token overlap on each side, +1 bonus per side that matches exactly (same
 *   token set), so "Ayr United"↔"Ayr" (subset) ranks below an exact hit.
 */
export function scorePair(fixture, odds, { kickoffToleranceMs = DEFAULT_KICKOFF_TOLERANCE_MS } = {}) {
  const f = teamsOf(fixture);
  const o = teamsOf(odds);
  const fh = tokenSet(f.home), fa = tokenSet(f.away);
  const oh = tokenSet(o.home), oa = tokenSet(o.away);
  if (!fh.size || !fa.size || !oh.size || !oa.size) return null;

  const homeOverlap = overlapCount(fh, oh);
  const awayOverlap = overlapCount(fa, oa);
  if (homeOverlap < 1 || awayOverlap < 1) return null; // both sides must agree

  const fk = kickoffMs(fixture?.kickoffUtc ?? fixture?.kickoff);
  const ok = kickoffMs(odds?.kickoffUtc ?? odds?.kickoff);
  let delta = 0;
  if (fk != null && ok != null) {
    delta = Math.abs(fk - ok);
    if (delta > kickoffToleranceMs) return null;
  } else {
    // No kickoff on one side: fall back to same Athens dayKey when available so
    // a nameless-time row still can't cross days.
    const fd = String(fixture?.dayKey || "");
    const od = String(odds?.dayKey || "");
    if (fd && od && fd !== od) return null;
  }

  const exactBonus =
    (setsEqual(fh, oh) ? 1 : 0) + (setsEqual(fa, oa) ? 1 : 0);

  return { score: homeOverlap + awayOverlap + exactBonus, delta };
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

/**
 * Resolve odds entries onto fixtures, matchId-agnostic and 1:1.
 *
 * @param {Array} fixtures  display fixtures ({canonicalId|matchId, homeTeam, awayTeam, kickoffUtc, dayKey})
 * @param {Array} oddsMatches  odds.json `matches` ({canonicalId|matchId, home, away, kickoffUtc, aiAssessment, …})
 * @returns {{ byFixtureId: Map<string,object>, matched: number, ceiling: number, pairs: Array }}
 *   byFixtureId maps a fixture's id → its resolved odds entry. `ceiling` is the
 *   number of fixtures that had ANY plausible odds candidate (matched ≤ ceiling
 *   only if a greedy conflict stole one, which the 1:1 pass avoids).
 */
export function resolveOddsForFixtures(fixtures, oddsMatches, opts = {}) {
  const fx = Array.isArray(fixtures) ? fixtures : [];
  const od = Array.isArray(oddsMatches) ? oddsMatches : [];

  // All plausible pairs, strongest first. Greedy 1:1 assignment over them means
  // each fixture claims its best available odds entry and no entry is reused.
  const candidates = [];
  const fixturesWithCandidate = new Set();
  for (let fi = 0; fi < fx.length; fi++) {
    const fid = idOf(fx[fi]);
    if (!fid) continue;
    for (let oi = 0; oi < od.length; oi++) {
      const s = scorePair(fx[fi], od[oi], opts);
      if (!s) continue;
      candidates.push({ fi, oi, fid, score: s.score, delta: s.delta });
      fixturesWithCandidate.add(fi);
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.delta - b.delta);

  const byFixtureId = new Map();
  const takenFixtures = new Set();
  const takenOdds = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (takenFixtures.has(c.fi) || takenOdds.has(c.oi)) continue;
    takenFixtures.add(c.fi);
    takenOdds.add(c.oi);
    byFixtureId.set(c.fid, od[c.oi]);
    pairs.push(c);
  }

  return {
    byFixtureId,
    matched: byFixtureId.size,
    ceiling: fixturesWithCandidate.size,
    pairs
  };
}
