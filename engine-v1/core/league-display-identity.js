/**
 * Fail-closed presentation metadata for a fixture whose acquisition partition
 * slug can be broader than the real provider competition.
 *
 * A provider row carrying "Isthmian League Premier Division" under eng.1 must
 * keep its real competition name, but must NOT inherit Premier League tier or
 * standings-derived matchday merely because the partition slug says eng.1.
 */

export function normalizeLeagueLabel(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function leagueLabelCompatible(rawName, canonicalName, slug = "") {
  const raw = normalizeLeagueLabel(rawName);
  const canonical = normalizeLeagueLabel(canonicalName);
  const slugKey = normalizeLeagueLabel(slug);

  if (!raw || raw === slugKey) return true;
  if (!canonical) return false;
  if (raw === canonical) return true;

  return (
    raw.includes(canonical) ||
    canonical.includes(raw)
  );
}

export function applyTrustedLeaguePresentation(
  match = {},
  meta = null,
  derivedMatchday = null
) {
  const m = { ...match };

  if (!meta) {
    return derivedMatchday == null
      ? m
      : {
          ...m,
          matchday: m.matchday ?? derivedMatchday
        };
  }

  const rawName = String(m.leagueName || "").trim();
  const slug = String(m.leagueSlug || "").trim();

  const compatible =
    m.competitionIdentityMismatch !== true &&
    leagueLabelCompatible(rawName, meta.name, slug);

  const country =
    meta.country && meta.country !== "Unknown"
      ? meta.country
      : null;

  const leagueName =
    (!rawName || rawName === slug) && meta.name
      ? meta.name
      : m.leagueName;

  if (!compatible) {
    return {
      ...m,
      leagueName,
      country: m.country || country,
      leagueTier: null,
      matchday: null,
      competitionIdentityMismatch: true
    };
  }

  return {
    ...m,
    leagueName,
    country: m.country || country,
    leagueTier: m.leagueTier ?? meta.tier ?? null,
    matchday: m.matchday ?? derivedMatchday,
    competitionIdentityMismatch: false
  };
}
