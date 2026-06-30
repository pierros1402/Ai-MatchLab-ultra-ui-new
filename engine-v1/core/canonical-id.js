/**
 * canonical-id.js
 *
 * Single source of truth for canonical match identity.
 *
 * A canonical ID is provider-agnostic and derived entirely from:
 *   leagueSlug + normalizedHome + normalizedAway + dayKey
 *
 * This means the same physical match always gets the same ID regardless
 * of whether it was first seen via ESPN, Flashscore, or any future source.
 *
 * Format: cid_{leagueToken}_{homeToken}_{awayToken}_{dayKey}
 * Example: cid_bra2_fortaleza_sport_20260629
 *
 * Stability guarantees:
 *   - League slug changes → new ID (intentional: different competition = different entity)
 *   - Team name variant (FC Fortaleza vs Fortaleza) → same ID (normalizer strips affixes)
 *   - Kickoff time shift <10min → same ID (rounded to 10-min window, see normalize.js)
 *   - Provider change (ESPN→Flashscore) → same ID
 */

import { normalizeTeamKey } from "./normalize.js";

// Strips dots and non-alphanumeric from league slug for use in ID
function leagueToken(slug) {
  return String(slug || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function dayToken(dayKeyOrKickoff) {
  // Prefer explicit dayKey (YYYY-MM-DD) over UTC kickoff to avoid timezone drift
  // for matches after midnight UTC that belong to the Athens next-day slot.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(dayKeyOrKickoff || ""))) {
    return dayKeyOrKickoff.replace(/-/g, "");
  }
  // Fallback: parse as kickoffUtc
  const d = new Date(dayKeyOrKickoff || 0);
  if (Number.isNaN(d.getTime())) return "0";
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Build a stable canonical match ID from match metadata.
 *
 * IMPORTANT: pass dayKey (YYYY-MM-DD, the Athens calendar day the match belongs to)
 * as the 4th argument, NOT kickoffUtc. Kickoff times after 22:00 UTC belong to the
 * next Athens day and would produce the wrong date token if UTC date were used.
 *
 * @param {string} leagueSlug  e.g. "bra.2"
 * @param {string} homeTeam    display name, will be normalized
 * @param {string} awayTeam    display name, will be normalized
 * @param {string} dayKey      Athens calendar day "YYYY-MM-DD" (preferred) or kickoffUtc fallback
 * @returns {string}           e.g. "cid_bra2_fortaleza_sport_20260629"
 */
export function buildCanonicalId(leagueSlug, homeTeam, awayTeam, dayKey) {
  const league = leagueToken(leagueSlug);
  const home   = normalizeTeamKey(homeTeam);
  const away   = normalizeTeamKey(awayTeam);
  const day    = dayToken(dayKey);

  if (!league || !home || !away || day === "0") return null;

  return `cid_${league}_${home}_${away}_${day}`;
}

/**
 * Extract structured components from a canonical ID (for debugging/logging).
 * Returns null if the string is not a valid canonical ID.
 */
export function parseCanonicalId(cid) {
  if (typeof cid !== "string" || !cid.startsWith("cid_")) return null;
  const parts = cid.slice(4).split("_");
  // minimum: league, home, away, day (8 chars)
  if (parts.length < 4) return null;
  const day = parts[parts.length - 1];
  if (!/^\d{8}$/.test(day)) return null;
  const [league, home, away] = parts;
  return { league, home, away, day };
}

export function isCanonicalId(value) {
  return typeof value === "string" && value.startsWith("cid_") && parseCanonicalId(value) !== null;
}
