import { athensDayFromKickoff, athensDayKey } from "../core/daykey.js";
import { isDisabledLeague } from "../source-discovery/disabled-leagues.js";
import { resolveSlugFromPath } from "../odds/flashscore-league-map.js";
import { resolveInternational } from "../odds/international-competitions.js";
import { LEAGUES_BY_SLUG } from "../../workers/_shared/leagues-coverage.js";

// The shared Flashscore path registry intentionally focuses on the global
// top-two domestic contract. AI MatchLab's declared depth is wider in two
// countries, so keep the extra admitted paths explicit here rather than
// allowing fuzzy league-name matching to decide canonical identity.
const EXTRA_DECLARED_DOMESTIC_PATHS = Object.freeze({
  "/football/england/league-one/": "eng.3",
  "/football/england/league-two/": "eng.4",
  "/football/england/national-league/": "eng.5",
  "/football/germany/3-liga/": "ger.3"
});

function normalizeProviderPath(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  let pathname = raw;
  try {
    if (/^https?:\/\//i.test(raw)) {
      pathname = new URL(raw).pathname;
    }
  } catch {
    return "";
  }

  pathname = pathname.split("?")[0].split("#")[0].trim();
  if (!pathname.startsWith("/")) pathname = `/${pathname}`;
  if (!pathname.endsWith("/")) pathname += "/";
  return pathname.toLowerCase();
}

function isDeclaredEnabledSlug(slug) {
  const key = String(slug || "").trim();
  return Boolean(key && LEAGUES_BY_SLUG[key] && !isDisabledLeague(key));
}

export function resolveFlashscoreAcquisitionIdentity(row) {
  const providerPath = normalizeProviderPath(row?.leaguePath);
  if (!providerPath) {
    return {
      ok: false,
      slug: null,
      providerPath: null,
      identityMode: null,
      reason: "missing_provider_league_path"
    };
  }

  // Exact provider path is authoritative for domestic competitions and for
  // every competition represented by flashscore-league-map.js. Crucially,
  // this path never calls resolveSlug(), whose fuzzy Jaccard fallback can map
  // child leagues such as National League North to their parent competition.
  const exactPathSlug =
    resolveSlugFromPath(providerPath) ||
    EXTRA_DECLARED_DOMESTIC_PATHS[providerPath] ||
    null;

  if (exactPathSlug) {
    if (!isDeclaredEnabledSlug(exactPathSlug)) {
      return {
        ok: false,
        slug: null,
        providerPath,
        identityMode: "exact_path",
        reason: "exact_path_slug_not_declared_or_disabled"
      };
    }

    return {
      ok: true,
      slug: exactPathSlug,
      providerPath,
      identityMode: "exact_path",
      reason: null
    };
  }

  // Preserve the existing explicit international-competition classifier as a
  // narrowly-scoped fallback. It does not classify domestic league hierarchy.
  const international = resolveInternational(row?.leagueName, row?.country);
  const internationalSlug = String(international?.slug || "").trim();
  if (internationalSlug && isDeclaredEnabledSlug(internationalSlug)) {
    return {
      ok: true,
      slug: internationalSlug,
      providerPath,
      identityMode: "explicit_international_classifier",
      reason: null
    };
  }

  return {
    ok: false,
    slug: null,
    providerPath,
    identityMode: null,
    reason: "unadmitted_provider_competition"
  };
}

function dayOrdinal(dayKey) {
  const text = String(dayKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  const [year, month, day] = text.split("-").map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const d = new Date(ms);

  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  return Math.floor(ms / 86_400_000);
}

export function flashscoreOffsetsForRequestedDay(
  requestedDayKey,
  referenceDayKey = athensDayKey()
) {
  const requested = dayOrdinal(requestedDayKey);
  const reference = dayOrdinal(referenceDayKey);

  if (requested === null || reference === null) {
    throw new Error("invalid_flashscore_requested_day_key");
  }

  const delta = requested - reference;

  // Flashscore day feeds are offset-based rather than calendar-date based.
  // Fetch the neighbouring feeds as a timezone-boundary safety margin, then
  // apply an exact Athens-day predicate before any row can be normalized.
  return [delta - 1, delta, delta + 1];
}

export function flashscoreRowMatchesRequestedAthensDay(row, requestedDayKey) {
  const requested = String(requestedDayKey || "").trim();
  if (dayOrdinal(requested) === null) return false;

  const fixtureDay = athensDayFromKickoff(row?.kickoffUtc);
  return fixtureDay === requested;
}

export function evaluateFlashscoreCanonicalAdmission({
  row,
  requestedSlug,
  normalizedSlug
} = {}) {
  const identity = resolveFlashscoreAcquisitionIdentity(row);
  const requested = String(requestedSlug || "").trim();
  const normalized = String(normalizedSlug || "").trim();

  if (!identity.ok) {
    return {
      ok: false,
      reason: identity.reason,
      identity
    };
  }

  if (!requested || identity.slug !== requested) {
    return {
      ok: false,
      reason: "provider_competition_requested_slug_mismatch",
      identity
    };
  }

  if (!normalized || identity.slug !== normalized) {
    return {
      ok: false,
      reason: "provider_competition_normalized_slug_mismatch",
      identity
    };
  }

  return {
    ok: true,
    reason: null,
    identity
  };
}
