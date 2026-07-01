/**
 * flashscore-live-overlay.js
 *
 * Runtime live-score overlay for odds-only leagues (aus.1, gab.1, tan.1, …) that
 * have no ESPN/canonical coverage and therefore get no live/FT status from the
 * snapshot pipeline. Instead of a batch job that commits + redeploys every cycle
 * (deploy-count death on the free plan), the engine fetches the Flashscore
 * offset=0 feed ITSELF, caches it in-memory for a short TTL, and overlays live/FT
 * status onto the response at request time. Zero extra deploys; ~TTL freshness.
 *
 * Safety rules:
 *   - Only applies to the current Athens day (offset=0 feed is today-only).
 *   - Only upgrades PRE-like rows. Never touches a row already FT / LIVE /
 *     postponed (those come from a trusted source — ESPN canonical or past-date
 *     league-memory truth) so it can never downgrade or contradict them.
 *   - Matched by normalized team-pair, disambiguated by nearest kickoff.
 */

import { normalizeTeamKey } from "../core/normalize.js";
import { athensDayKey } from "../core/daykey.js";
import { fetchFlashscoreFixtures } from "./flashscore-fixtures-source.js";

const TTL_MS = 90 * 1000;

let CACHE = { ts: 0, byPair: null };

function pairKey(home, away) {
  return normalizeTeamKey(home) + "|" + normalizeTeamKey(away);
}

// PRE / STALE_PRE / SCHEDULED / unknown are upgradeable; anything already
// final, live, or postponed is authoritative and left untouched.
function isUpgradeable(match) {
  const s = String(
    [match?.status, match?.rawStatus, match?.statusType, match?.statusName]
      .filter(Boolean)
      .join(" ")
  ).toUpperCase();

  if (!s) return true;
  if (s === "FT" || s.includes("FULL_TIME") || s.includes("FINAL") || s.includes("AET") || s.includes("PEN")) return false;
  if (s.includes("LIVE") || s.includes("FIRST_HALF") || s.includes("SECOND_HALF") || s.includes("HALF_TIME") || s.includes("IN_PROGRESS")) return false;
  if (s.includes("POSTPON") || s.includes("CANCEL") || s.includes("ABANDON") || s.includes("SUSPEND")) return false;
  return true;
}

async function getLiveIndex() {
  const now = Date.now();
  if (CACHE.byPair && now - CACHE.ts < TTL_MS) return CACHE.byPair;

  try {
    const feed = await fetchFlashscoreFixtures({ offsets: [0] });
    if (feed.ok) {
      const byPair = new Map();
      for (const row of feed.rows) {
        const key = pairKey(row.home, row.away);
        if (!byPair.has(key)) byPair.set(key, []);
        byPair.get(key).push(row);
      }
      CACHE = { ts: now, byPair };
    }
  } catch {
    // keep whatever we had — stale live data beats none
  }

  return CACHE.byPair;
}

function pickNearest(byPair, home, away, kickoffUtc) {
  const candidates = byPair.get(pairKey(home, away));
  if (!candidates || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const targetTs = kickoffUtc ? new Date(kickoffUtc).getTime() : NaN;
  if (!Number.isFinite(targetTs)) return candidates[0];

  let best = candidates[0];
  let bestDiff = Infinity;
  for (const c of candidates) {
    const ts = Number.isFinite(c.kickoffTs) ? c.kickoffTs * 1000 : NaN;
    if (!Number.isFinite(ts)) continue;
    const diff = Math.abs(ts - targetTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }
  return best;
}

/**
 * Overlay live/FT status from Flashscore onto a list of matches for `requestedDay`.
 * Returns a possibly-new array (input is not mutated). No-op for non-today dates
 * or when the feed is unavailable.
 */
export async function overlayFlashscoreLive(matches, requestedDay) {
  const list = Array.isArray(matches) ? matches : [];
  if (!list.length) return list;
  if (String(requestedDay || "").slice(0, 10) !== athensDayKey()) return list;

  const byPair = await getLiveIndex();
  if (!byPair || !byPair.size) return list;

  return list.map(m => {
    if (!isUpgradeable(m)) return m;

    const found = pickNearest(byPair, m.homeTeam, m.awayTeam, m.kickoffUtc);
    if (!found) return m;

    if (found.finished) {
      return {
        ...m,
        status: "FT",
        statusType: "FT",
        rawStatus: m.rawStatus || m.status || "",
        scoreHome: found.scoreHome,
        scoreAway: found.scoreAway,
        liveSource: "flashscore-offset0",
      };
    }

    if (found.scoreHome != null || found.scoreAway != null) {
      return {
        ...m,
        status: "LIVE",
        statusType: "LIVE",
        rawStatus: found.statusCode || "LIVE",
        scoreHome: found.scoreHome ?? 0,
        scoreAway: found.scoreAway ?? 0,
        liveSource: "flashscore-offset0",
      };
    }

    return m;
  });
}

// Test/ops helper — force the next overlay call to refetch.
export function _clearLiveOverlayCache() {
  CACHE = { ts: 0, byPair: null };
}
