import {
  readLeagueState,
  writeLeagueState,
  needsRecheck,
  getLeaguesNeedingRecheck,
  getSummary,
  computeRecheckAfter
} from "../storage/league-memory-db.js";

import { checkLeaguePulse } from "./league-pulse-checker.js";
import { isInSeason, nextSeasonStart } from "./season-calendar.js";

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { leagueName } from "../../workers/_shared/leagues-registry.js";

// ─── League metadata (registry-driven) ──────────────────────────────────────────
// Single source of truth = LEAGUES_COVERAGE. We expose ONLY domestic-league
// competitions here (type === "league"); cups have no standings table and are
// out of scope for the awareness/standings brain. Names come from the canonical
// leagues-registry, countries/tier/region from the coverage entry.
//
// This is embedded knowledge — not fetched from anywhere.

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// Countries whose domestic seasons run on a calendar-year / southern-hemisphere
// rhythm (roughly spring→autumn) rather than the European autumn→spring rhythm.
// Used only as a hint for season inference; defaults to "northern".
const SOUTHERN_COUNTRIES = new Set([
  "argentina", "brazil", "chile", "uruguay", "paraguay", "bolivia",
  "peru", "ecuador", "colombia", "venezuela",
  "australia", "new zealand", "fiji", "samoa", "tonga", "vanuatu",
  "solomon islands", "papua new guinea", "tahiti", "new caledonia",
  "american samoa", "cook islands",
  "south africa", "namibia", "zimbabwe", "botswana", "lesotho",
  "eswatini", "swaziland", "mozambique", "madagascar", "angola",
  "zambia", "malawi", "mauritius"
]);

function hemisphereForCountry(country) {
  const key = String(country || "").toLowerCase().replace(/_/g, " ").trim();
  return SOUTHERN_COUNTRIES.has(key) ? "southern" : "northern";
}

// Build the domestic-league universe from the coverage registry.
const LEAGUE_META = Object.fromEntries(
  LEAGUES_COVERAGE
    .filter(entry => entry.type === "league")
    .map(entry => {
      const country = titleCase(entry.country);
      return [entry.slug, {
        name:       leagueName(entry.slug),
        country,
        tier:       entry.tier,
        region:     entry.region,
        trust:      entry.trust,
        hemisphere: hemisphereForCountry(entry.country)
      }];
    })
);

export function getLeagueMeta(slug) {
  return LEAGUE_META[slug] || { name: leagueName(slug) || slug, country: "Unknown" };
}

export function getAllKnownSlugs() {
  return Object.keys(LEAGUE_META);
}

export function getLeagueMetaMap() {
  return LEAGUE_META;
}

// ─── Skip filter ──────────────────────────────────────────────────────────────
// Returns true if we should SKIP ESPN for this slug based on memory.
// Conservative: only skip when we have HIGH confidence it's not active.

export function shouldSkipEspn(slug) {
  const state = readLeagueState(slug);
  if (!state) return false; // no info → don't skip, let ESPN try

  const { state: s, confidence } = state;

  // Only skip if we're quite confident it's paused or finished
  if (s === "pause"    && confidence >= 0.70) return true;
  if (s === "finished" && confidence >= 0.75) return true;

  return false;
}

// ─── State combination: calendar (authoritative) + search (refinement) ──────────
// The deterministic season calendar decides the active/offseason axis; the search
// pulse only refines it (detecting mid-season breaks, confirming a real finish, or
// catching a league that runs unusually late). This makes classification reliable
// even with NO search at all.

function combineState(cal, pulse) {
  const s  = pulse.state;             // active | pause | finished | unknown
  const sc = pulse.confidence || 0;

  if (!cal.inSeason) {
    // Outside the normal playing window → not playing now.
    if (s === "active" && sc >= 0.70) {
      // Strong contradicting signal (e.g. playoffs running late) → trust search.
      return { state: "active", confidence: 0.65, reason: "calendar_off_but_search_active" };
    }
    return {
      state: "finished",
      confidence: s === "finished" ? Math.max(0.85, sc) : 0.85,
      resumeDate: pulse.resumeDate || null,
      reason: s === "finished" ? "calendar_offseason_confirmed" : "calendar_offseason"
    };
  }

  // Inside the normal playing window → normally active.
  if (s === "pause") {
    // Search found a genuine in-season break (international / winter / World Cup).
    return {
      state: "pause",
      confidence: Math.max(0.70, sc),
      resumeDate: pulse.resumeDate || null,
      reason: "calendar_in_season_search_pause"
    };
  }

  if (s === "finished" && sc >= 0.70) {
    // A strong "finished" signal mid-window usually means a between-tournaments
    // gap (e.g. Apertura/Clausura), not a full offseason.
    return {
      state: "pause",
      confidence: 0.65,
      resumeDate: pulse.resumeDate || null,
      reason: "calendar_in_season_search_finished_gap"
    };
  }

  const conf = s === "active" ? Math.min(0.92, 0.75 + sc * 0.2) : 0.75;
  return {
    state: "active",
    confidence: conf,
    reason: s === "active" ? "calendar_and_search_active" : "calendar_in_season"
  };
}

// ─── Pulse update ─────────────────────────────────────────────────────────────

export async function updateLeaguePulse(slug, options = {}) {
  const meta = getLeagueMeta(slug);
  const allowSearch = options.allowSearch === true;
  const now = new Date();

  const pulse = await checkLeaguePulse(
    slug,
    meta.name,
    meta.country,
    { allowSearch, season: options.season || "2025-26" }
  );

  const cal = isInSeason(slug, meta, now);
  const combined = combineState(cal, pulse);

  // Off-season leagues are rechecked right before their next season start; all
  // others use the standard state-based schedule.
  const recheckAfter = (combined.state === "finished" && !cal.inSeason)
    ? nextSeasonStart(slug, meta, now)
    : computeRecheckAfter(combined.state, combined.resumeDate || null);

  writeLeagueState(slug, {
    state:            combined.state,
    confidence:       combined.confidence,
    resumeDate:       combined.resumeDate || null,
    recheckAfter,
    calendarInSeason: cal.inSeason,
    seasonWindow:     cal.window,
    searchState:      pulse.state,
    searchConfidence: pulse.confidence,
    signals:          pulse.signals,
    rowCount:         pulse.rowCount,
    decisionReason:   combined.reason,
    searchExecuted:   allowSearch,
    lastPulseAt:      pulse.checkedAt
  });

  return {
    ...pulse,
    state:          combined.state,
    confidence:     combined.confidence,
    resumeDate:     combined.resumeDate || null,
    recheckAfter,
    calendarInSeason: cal.inSeason,
    decisionReason: combined.reason
  };
}

// ─── Batch pulse refresh ──────────────────────────────────────────────────────

export async function refreshStaleLeagues(options = {}) {
  const allowSearch  = options.allowSearch === true;
  const maxLeagues   = options.maxLeagues  || 20;
  const dryRun       = options.dryRun      !== false;
  const slugFilter   = options.slugs       || null;

  const allStates   = getLeaguesNeedingRecheck();
  const candidates  = slugFilter
    ? allStates.filter(s => slugFilter.includes(s.slug))
    : allStates;

  const batch = candidates.slice(0, maxLeagues);

  console.log("[league-awareness] refresh-stale:start", {
    staleCount: allStates.length,
    batchSize: batch.length,
    allowSearch,
    dryRun
  });

  const results = [];

  for (const stale of batch) {
    const slug = stale.slug || stale;

    if (dryRun) {
      results.push({ slug, dryRun: true, skipped: true });
      continue;
    }

    try {
      const pulse = await updateLeaguePulse(slug, { allowSearch });
      results.push({ slug, state: pulse.state, confidence: pulse.confidence, ok: true });
    } catch (err) {
      results.push({ slug, ok: false, error: String(err?.message || err) });
    }
  }

  return {
    ok: true,
    batchSize: batch.length,
    staleCount: allStates.length,
    results,
    summary: getSummary(),
    allowSearch,
    dryRun
  };
}

// ─── Calendar-only classification (no search, all leagues) ──────────────────────
// Deterministically classifies every known league as active / finished (offseason)
// using only the season calendar. Zero network. This is the reliable foundation:
// it tells us "when is each league active" instantly, and the search layer only
// needs to refine the in-season ones (for breaks / between-tournament gaps).

export function classifyAllByCalendar(options = {}) {
  const slugFilter = options.slugs || null;
  const now = options.now ? new Date(options.now) : new Date();
  const slugs = (slugFilter || getAllKnownSlugs());

  const results = [];

  for (const slug of slugs) {
    const meta = getLeagueMeta(slug);
    const cal = isInSeason(slug, meta, now);

    // Calendar-only ⇒ no search signal; combineState treats this as the floor.
    const combined = combineState(cal, { state: "unknown", confidence: 0 });

    const recheckAfter = (combined.state === "finished" && !cal.inSeason)
      ? nextSeasonStart(slug, meta, now)
      : computeRecheckAfter(combined.state, null);

    writeLeagueState(slug, {
      state:            combined.state,
      confidence:       combined.confidence,
      resumeDate:       null,
      recheckAfter,
      calendarInSeason: cal.inSeason,
      seasonWindow:     cal.window,
      seasonWindowSource: cal.window.source,
      decisionReason:   combined.reason,
      searchExecuted:   false,
      lastCalendarAt:   now.toISOString()
    });

    results.push({ slug, state: combined.state, inSeason: cal.inSeason, window: cal.window });
  }

  return { ok: true, classified: results.length, results, summary: getSummary() };
}

// ─── Seed from known list ─────────────────────────────────────────────────────
// Initialises all known leagues as "unknown" if they have no state yet.
// This gives the pulse checker a starting point without any search calls.

export function seedKnownLeagues() {
  const slugs = getAllKnownSlugs();
  let seeded = 0;

  for (const slug of slugs) {
    const existing = readLeagueState(slug);
    if (!existing) {
      writeLeagueState(slug, {
        state:       "unknown",
        confidence:  0,
        recheckAfter: new Date().toISOString().slice(0, 10),
        seededAt:    new Date().toISOString()
      });
      seeded++;
    }
  }

  return { ok: true, seeded, total: slugs.length };
}
