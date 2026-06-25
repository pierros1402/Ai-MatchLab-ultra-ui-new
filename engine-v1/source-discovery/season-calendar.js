/**
 * season-calendar.js
 *
 * Deterministic season-window model: for any league slug, when (in the year) is
 * it normally being played. This is the AUTHORITATIVE base layer for "is this
 * league active right now" — far more reliable than scraping search snippets.
 *
 * Search-based pulse (league-pulse-checker) is only used to REFINE this:
 *   - confirm an in-season league is actually playing vs. on an international /
 *     winter break (→ "pause")
 *   - confirm an off-season league has truly finished.
 *
 * Model: a window is { start, end } in months 1-12.
 *   start <= end  → single-block within the calendar year (e.g. Mar–Nov).
 *   start  > end  → wraps the new year (e.g. Aug–May, European autumn→spring).
 *
 * Windows are intentionally GENEROUS at the edges (we'd rather check a league a
 * few days early than miss its restart). They are resolved with this priority:
 *   1. explicit per-slug override
 *   2. explicit per-country override
 *   3. regional / hemisphere default
 *
 * No network, no fetch, no writes — pure static knowledge.
 */

function normCountry(country) {
  return String(country || "").toLowerCase().replace(/[\s-]+/g, "_").trim();
}

// ─── Per-slug overrides (where a tier differs from its country default) ──────────
const SLUG_WINDOWS = {
  // Mexico runs Apertura (Jul–Dec) + Clausura (Jan–May): effectively Jul–May.
  "mex.1": { start: 7, end: 5 },
  "mex.2": { start: 7, end: 5 },

  // FIFA World Cup: always held in June–July (2026, 2030, …).
  // Off-years → ESPN returns 0 fixtures harmlessly.
  "fifa.world_cup": { start: 6, end: 7 }
};

// ─── Per-country overrides ──────────────────────────────────────────────────────
// Keyed by normalized country (underscores). Anything not listed falls back to
// the regional/hemisphere default below.
const COUNTRY_WINDOWS = {
  // Nordic / Baltic / Ireland — European summer calendar (spring→autumn)
  sweden:        { start: 3, end: 11 },
  norway:        { start: 3, end: 12 },
  finland:       { start: 4, end: 11 },
  iceland:       { start: 4, end: 11 },
  ireland:       { start: 2, end: 11 },
  estonia:       { start: 3, end: 11 },
  latvia:        { start: 3, end: 11 },
  lithuania:     { start: 3, end: 11 },
  faroe_islands: { start: 3, end: 11 },

  // North America
  usa:    { start: 2, end: 11 },
  canada: { start: 4, end: 11 },

  // South / Central America — calendar-year (short Dec–Jan offseason)
  argentina:  { start: 1, end: 12 },
  brazil:     { start: 1, end: 12 },
  chile:      { start: 2, end: 12 },
  uruguay:    { start: 2, end: 12 },
  paraguay:   { start: 1, end: 12 },
  bolivia:    { start: 2, end: 12 },
  peru:       { start: 2, end: 12 },
  ecuador:    { start: 2, end: 12 },
  colombia:   { start: 1, end: 12 },
  venezuela:  { start: 1, end: 12 },

  // East Asia — calendar-year
  japan:           { start: 2, end: 12 },
  south_korea:     { start: 2, end: 11 },
  china:           { start: 3, end: 11 },
  chinese_taipei:  { start: 3, end: 11 },

  // Oceania — southern summer (wraps year)
  australia:    { start: 10, end: 5 },
  new_zealand:  { start: 10, end: 4 },

  // South Asia
  india: { start: 9, end: 4 }
};

// Middle-East / Gulf countries play a European-style autumn→spring season.
const GULF_CROSS_YEAR = new Set([
  "saudi_arabia", "uae", "qatar", "bahrain", "kuwait", "oman",
  "iran", "iraq", "jordan", "lebanon", "syria", "yemen", "palestine"
]);

// North-African countries also run autumn→spring.
const NORTH_AFRICA_CROSS_YEAR = new Set([
  "egypt", "morocco", "tunisia", "algeria", "libya"
]);

const DEFAULT_CROSS_YEAR = { start: 8, end: 5 };   // European autumn→spring
const DEFAULT_CALENDAR   = { start: 2, end: 11 };  // generic spring→autumn

/**
 * Resolve the season window for a league.
 * @param {string} slug
 * @param {{country?:string, region?:string, hemisphere?:string}} meta
 */
export function seasonWindow(slug, meta = {}) {
  if (SLUG_WINDOWS[slug]) {
    return { ...SLUG_WINDOWS[slug], source: "slug" };
  }

  const country = normCountry(meta.country);
  if (COUNTRY_WINDOWS[country]) {
    return { ...COUNTRY_WINDOWS[country], source: "country" };
  }

  if (GULF_CROSS_YEAR.has(country) || NORTH_AFRICA_CROSS_YEAR.has(country)) {
    return { ...DEFAULT_CROSS_YEAR, source: "region_cross_year" };
  }

  const region = String(meta.region || "").toLowerCase();

  if (region === "europe") {
    return { ...DEFAULT_CROSS_YEAR, source: "region_default" };
  }

  if (meta.hemisphere === "southern") {
    // Southern-hemisphere domestic leagues are predominantly calendar-year.
    return { start: 2, end: 12, source: "hemisphere_southern" };
  }

  if (region === "asia" || region === "africa") {
    // Mixed; autumn→spring is the more common pattern for the unlisted ones.
    return { ...DEFAULT_CROSS_YEAR, source: "region_default" };
  }

  return { ...DEFAULT_CALENDAR, source: "fallback" };
}

/**
 * The label of the season currently in progress (or most recently played) for a
 * league, matching how Wikipedia names the article:
 *   - calendar-year leagues (Brazil, Japan…) → "2026"
 *   - cross-year leagues (Premier League…)   → "2025-26"
 * For an off-season cross-year league we return the season that just finished.
 */
export function currentSeasonLabel(slug, meta = {}, date = new Date()) {
  const { start, end } = seasonWindow(slug, meta);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;

  if (start <= end) {
    return String(y);
  }

  // Cross-year: the season is identified by the year it started in.
  const startYear = (m >= start) ? y : y - 1;
  const yy = String(startYear + 1).slice(-2);
  return `${startYear}-${yy}`;
}

function monthInWindow(month, window) {
  const { start, end } = window;
  if (start <= end) return month >= start && month <= end;
  return month >= start || month <= end; // wraps the new year
}

/**
 * Is the league in its normal playing window on `date`?
 * @returns {{ inSeason:boolean, window:object, month:number }}
 */
export function isInSeason(slug, meta = {}, date = new Date()) {
  const window = seasonWindow(slug, meta);
  const month = date.getUTCMonth() + 1;
  return { inSeason: monthInWindow(month, window), window, month };
}

/**
 * For an OFF-season league, the next date the season is expected to start
 * (a few days before the start month). Used to schedule the next recheck so the
 * engine wakes up right when the league is about to resume — and ignores it in
 * between.
 */
export function nextSeasonStart(slug, meta = {}, date = new Date()) {
  const { start } = seasonWindow(slug, meta);
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const target = new Date(Date.UTC(d.getUTCFullYear(), start - 1, 1));

  // If the start month already passed (or is the current month), roll to next year.
  if (target <= d) target.setUTCFullYear(target.getUTCFullYear() + 1);

  // Recheck a week before the nominal start so we catch the opening fixtures.
  target.setUTCDate(target.getUTCDate() - 7);
  return target.toISOString().slice(0, 10);
}
