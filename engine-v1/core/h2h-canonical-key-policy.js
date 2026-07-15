/**
 * h2h-canonical-key-policy.js
 *
 * H2H-specific, collision-aware team and pair keys.
 *
 * The global normalizeTeamKey() intentionally removes generic football affixes
 * such as FC/AFC/SC. That is correct for ordinary composite club names, but a
 * legitimate club whose complete name is only "AFC" would collapse to an empty
 * key and create filenames such as "~eemdijk.json". H2H persistence must never
 * admit an empty pair half.
 *
 * Policy:
 *   1. Resolve the global canonical display name when one exists.
 *   2. Keep normalizeTeamKey() unchanged for every non-empty result.
 *   3. Only when that result is empty, fall back to a conservative compact raw
 *      identity key (e.g. "AFC" -> "afc").
 *   4. Report, rather than silently merge, two distinct canonical names that
 *      collapse to the same final key.
 *
 * This module is pure/read-only. It does not read or write data/h2h itself.
 */

import { globalCanonicalTeamName } from "../storage/team-aliases-db.js";

export const H2H_CANONICAL_KEY_POLICY_VERSION =
  "h2h-canonical-key-policy-v1";

const LEGACY_TEAM_AFFIX_RE =
  /\b(fc|afc|cf|sc|ac|cd|ca|ec|se|ad|sv|fk|if|bk|aif|club|calcio|fodbold|futebol|footballclub|dos|das|de|do|da|e)\b/g;

/**
 * Byte-for-policy equivalent of the existing normalizeTeamKey() behaviour,
 * kept local so the H2H policy does not pull fixture/config dependencies into
 * read-only integrity tooling.
 */
export function legacyCompatibleNormalizeTeamKey(name = "") {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'`’]/g, "")
    .replace(LEGACY_TEAM_AFFIX_RE, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ /g, "");
}

export function compactRawIdentityKey(name = "") {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[.'`’]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function isDegradedH2HPairKey(key = "") {
  const text = String(key || "");
  if (!text || text === "~") return true;
  const parts = text.split("~");
  return parts.length !== 2 || !parts[0] || !parts[1];
}

export function canonicalH2HTeamIdentity(
  name,
  { resolveCanonical = globalCanonicalTeamName } = {}
) {
  const inputName = String(name || "").trim();
  const resolved = inputName
    ? String(resolveCanonical?.(inputName) || inputName).trim()
    : "";
  const primaryKey = resolved ? legacyCompatibleNormalizeTeamKey(resolved) : "";
  const fallbackKey = resolved ? compactRawIdentityKey(resolved) : "";
  const key = primaryKey || fallbackKey;
  const keyMode = primaryKey
    ? "normalized_primary"
    : fallbackKey
      ? "raw_identity_fallback"
      : "invalid_empty_identity";

  return {
    inputName,
    canonicalName: resolved || null,
    primaryKey,
    fallbackKey,
    key,
    keyMode,
    usedFallback: !primaryKey && Boolean(fallbackKey),
    legacyWouldDegrade: !primaryKey,
    valid: Boolean(key)
  };
}

export function legacyH2HPairIdentity(
  teamA,
  teamB,
  { resolveCanonical = globalCanonicalTeamName } = {}
) {
  const aName = String(resolveCanonical?.(teamA) || teamA || "").trim();
  const bName = String(resolveCanonical?.(teamB) || teamB || "").trim();
  const aKey = legacyCompatibleNormalizeTeamKey(aName);
  const bKey = legacyCompatibleNormalizeTeamKey(bName);
  const key = aKey <= bKey ? `${aKey}~${bKey}` : `${bKey}~${aKey}`;
  return {
    key,
    teamA: aName || null,
    teamB: bName || null,
    aKey,
    bKey,
    degraded: isDegradedH2HPairKey(key)
  };
}

export function canonicalH2HPairIdentity(
  teamA,
  teamB,
  { resolveCanonical = globalCanonicalTeamName } = {}
) {
  const left = canonicalH2HTeamIdentity(teamA, { resolveCanonical });
  const right = canonicalH2HTeamIdentity(teamB, { resolveCanonical });

  if (!left.valid || !right.valid) {
    return {
      valid: false,
      key: null,
      degraded: true,
      collision: false,
      collisionReason: null,
      teamA: left.canonicalName,
      teamB: right.canonicalName,
      left,
      right,
      reasonCode: "invalid_empty_h2h_team_identity"
    };
  }

  const sameKey = left.key === right.key;
  const sameCanonicalName = compactRawIdentityKey(left.canonicalName)
    === compactRawIdentityKey(right.canonicalName);
  const collision = sameKey && !sameCanonicalName;

  const ordered = left.key <= right.key
    ? { first: left, second: right }
    : { first: right, second: left };
  const key = `${ordered.first.key}~${ordered.second.key}`;

  return {
    valid: !collision && !isDegradedH2HPairKey(key),
    key,
    degraded: isDegradedH2HPairKey(key),
    collision,
    collisionReason: collision
      ? "distinct_canonical_names_share_h2h_team_key"
      : null,
    teamA: ordered.first.canonicalName,
    teamB: ordered.second.canonicalName,
    left,
    right,
    fallbackHalfCount: Number(left.usedFallback) + Number(right.usedFallback),
    reasonCode: collision
      ? "h2h_team_key_collision_requires_review"
      : isDegradedH2HPairKey(key)
        ? "degraded_h2h_pair_key"
        : null
  };
}
