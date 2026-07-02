/**
 * stale-live-finalize.js
 *
 * Engine-side backstop that transitions a STUCK-LIVE row to FT deterministically
 * from elapsed time since kickoff. Root fix for "small-league matches stay LIVE
 * forever": once a row is marked LIVE (ESPN status-refresh persisted into
 * canonical, or an in-memory live overlay), nothing else flips it to FT
 * intraday — the flashscore overlay refuses to touch a LIVE row and the truth
 * store only has the final score after the nightly accumulator. So the match
 * dangles LIVE for hours. The display cap ("90+'") only hides the runaway
 * clock; this restores the actual FINAL state.
 *
 * This runs LAST in the overlay pipeline (after flashscore-live + results-truth),
 * so every real-data source gets first crack: if Flashscore or the truth store
 * knows the real FT + score, that already applied and this is a no-op. Only a
 * row that is STILL LIVE well past any plausible match length reaches here, and
 * we finalize it to FT keeping the last known live score — the nightly truth
 * overlay corrects the score later if it was mid-change. A wrong-but-final score
 * that self-heals beats an eternally-live match.
 *
 * Safety:
 *   - Only rows currently ranked LIVE are affected. PRE/FINAL/SPECIAL untouched.
 *   - Needs a parseable kickoffUtc; without it we cannot reason about elapsed
 *     time, so the row is left as-is.
 *   - Purely time-based, keeps the last known score, tags `ftSource` for audit.
 */

import { STATUS_RANK, statusRankFromParts } from "./display-contract.js";

// Realistic upper bound for a finished football match measured from kickoff:
//   90' + ~15' half-time + generous stoppage ≈ 115'. Cup ties with extra time
//   and penalties run ≈ 150–170'. We wait past even that (180') before force-
//   finalizing, so a genuine extra-time/penalties match is never cut short —
//   any match still "LIVE" three hours after kickoff has certainly ended and
//   simply never received its FT signal.
export const FINALIZE_STALE_LIVE_AFTER_MIN = 180;

function minutesSinceKickoff(kickoffUtc, now) {
  const ts = kickoffUtc ? new Date(kickoffUtc).getTime() : NaN;
  if (!Number.isFinite(ts)) return null;
  return (now - ts) / 60000;
}

/**
 * Finalize stale-LIVE rows to FT. Pure/synchronous; never throws. `now` is
 * injectable for tests. Returns a possibly-new array (input not mutated).
 */
export function overlayStaleLiveFinalize(matches, options = {}) {
  const list = Array.isArray(matches) ? matches : [];
  if (!list.length) return list;

  const now = options.now instanceof Date ? options.now.getTime() : Date.now();
  const thresholdMin = Number.isFinite(options.thresholdMin)
    ? options.thresholdMin
    : FINALIZE_STALE_LIVE_AFTER_MIN;

  return list.map(m => {
    try {
      const rank = statusRankFromParts(m?.status, m?.rawStatus, m?.statusType, m?.statusName);
      if (rank !== STATUS_RANK.LIVE) return m;

      const elapsed = minutesSinceKickoff(m?.kickoffUtc, now);
      if (elapsed == null || elapsed < thresholdMin) return m;

      return {
        ...m,
        status: "FT",
        statusType: "FT",
        rawStatus: m?.rawStatus || m?.status || "",
        statusName: null,
        minute: null,
        live: false,
        isLive: false,
        // last known live score is the best available; nightly truth corrects it
        scoreHome: m?.scoreHome ?? null,
        scoreAway: m?.scoreAway ?? null,
        ftSource: "stale-live-timeout",
      };
    } catch {
      return m;
    }
  });
}
