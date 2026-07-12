/**
 * season-model.js
 *
 * Per-league ARCHIVE season model — which season label a match date belongs to
 * for history-archive partitioning and model-priors sourcing.
 *
 * The 2026-07-12 data audit found the single worst structural defect in the
 * historical layer: build-history-archive applied ONE universal July–June split
 * to every league, so calendar-year leagues (Scandinavia, South America, East
 * Asia… — 60+ leagues) had each real season sliced across two "YYYY-YYYY"
 * files. This module derives the season model from the SAME deterministic
 * source the awareness brain already trusts (season-calendar's seasonWindow):
 *
 *   window.start <= window.end  → calendar-year league → label "YYYY"
 *   window.start  > window.end  → cross-year league    → label "YYYY-YYYY"
 *                                  (July-1 split, unchanged from before)
 *
 * Slugs with NO coverage meta (a handful of fs.* long-tail dirs) keep the old
 * cross-year behavior — never reclassify what we can't identify.
 *
 * Cross-year label math stays delegated to core/season.js (global rollover);
 * calendar-year labels roll on Jan 1 by construction.
 */

import { seasonWindow } from "../source-discovery/season-calendar.js";
import { getLeagueMeta, getLeagueMetaMap } from "../source-discovery/league-awareness-service.js";
import { currentSeason, priorSeasons } from "./season.js";

const __modelCache = new Map();

/** "calendar" | "cross" for a league slug. Unknown slugs → "cross" (legacy). */
export function seasonModelFor(slug) {
  const key = String(slug || "");
  if (__modelCache.has(key)) return __modelCache.get(key);

  let model = "cross";
  if (getLeagueMetaMap()[key]) {
    const w = seasonWindow(key, getLeagueMeta(key));
    model = w.start <= w.end ? "calendar" : "cross";
  }
  __modelCache.set(key, model);
  return model;
}

export function isCalendarYearLeague(slug) {
  return seasonModelFor(slug) === "calendar";
}

/** Archive season label for a match date, per the league's model. */
export function archiveSeasonForDate(slug, dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();

  if (seasonModelFor(slug) === "calendar") return String(y);

  const m = d.getUTCMonth() + 1; // 1-12, July-1 split (legacy cross-year rule)
  const startYear = m >= 7 ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}

/** The league's current (in-progress) archive season label. */
export function currentArchiveSeason(slug, now = new Date()) {
  if (seasonModelFor(slug) === "calendar") return String(now.getUTCFullYear());
  return currentSeason(now);
}

/**
 * The N completed archive seasons before the current one, oldest-first —
 * the per-league source set for model-priors.
 */
export function priorArchiveSeasons(slug, n = 5, now = new Date()) {
  if (seasonModelFor(slug) === "calendar") {
    const y = now.getUTCFullYear();
    const out = [];
    for (let i = n; i >= 1; i--) out.push(String(y - i));
    return out;
  }
  return priorSeasons(n, now);
}

/** Priors window + current season: the labels the archive builder maintains. */
export function archiveSeasonLabels(slug, n = 5, now = new Date()) {
  return [...priorArchiveSeasons(slug, n, now), currentArchiveSeason(slug, now)];
}
