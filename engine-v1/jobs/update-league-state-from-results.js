/**
 * update-league-state-from-results.js
 *
 * Derives league active/break/finished state from OBSERVED match results rather
 * than calendar guesses.  Runs daily AFTER accumulateResults so the observation
 * window is fresh.
 *
 * Decision rules (observation wins over calendar when observation is available):
 *   lastResultAge ≤ 14 days  → "active"   (we literally just saw a match)
 *   lastResultAge 14–60 days → "break"    (mid-season or international break)
 *   lastResultAge  > 60 days → "finished" (season over)
 *   no results accumulated   → leave calendar decision unchanged
 *
 * Writes observation fields into state.json via writeLeagueState (merge, not
 * overwrite) so calendar metadata is preserved alongside observed truth:
 *   lastResultDate  – ISO string of most recent FT match
 *   observedState   – "active" | "break" | "finished" | "unknown"
 *   observedAt      – when this derivation ran
 *   decisionReason  – updated to "observation_recent_result" etc.
 *
 * Self-learning effect: after a few weeks the system knows empirically which
 * leagues play on which cadence, needs no external calendar for active leagues.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { writeLeagueState, readLeagueState } from "../storage/league-memory-db.js";

const RESULTS_DIR = resolveDataPath("league-memory", "results");

// How old the last result can be before we consider the league in a break/done.
const ACTIVE_THRESHOLD_DAYS = 14;
const BREAK_THRESHOLD_DAYS  = 60;

function log(...a) { console.log("[update-league-state]", ...a); }

/**
 * Find the most recent match date across all teams in a results file.
 * Returns null if no results yet.
 */
function latestResultDate(resultsData) {
  let latest = null;
  for (const matches of Object.values(resultsData.teams || {})) {
    for (const m of matches) {
      if (m.date && (!latest || m.date > latest)) latest = m.date;
    }
  }
  return latest;
}

/**
 * Count distinct matchIds in a results file (proxy for total FT matches).
 */
function countDistinctMatches(resultsData) {
  const seen = new Set();
  for (const matches of Object.values(resultsData.teams || {})) {
    for (const m of matches) { if (m.matchId) seen.add(m.matchId); }
  }
  return seen.size;
}

/**
 * Classify observed state from last-result age in days.
 */
function classifyFromAge(ageDays) {
  if (ageDays <= ACTIVE_THRESHOLD_DAYS) return { state: "active",   confidence: 0.92, reason: "observation_recent_result" };
  if (ageDays <= BREAK_THRESHOLD_DAYS)  return { state: "break",    confidence: 0.80, reason: "observation_mid_break" };
  return                                        { state: "finished", confidence: 0.88, reason: "observation_long_silence" };
}

export function updateLeagueStateFromResults(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();

  if (!fs.existsSync(RESULTS_DIR)) {
    log("results dir missing — nothing to observe");
    return { ok: true, updated: 0, skipped: 0 };
  }

  const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json"));
  let updated = 0, skipped = 0, overrode = 0;

  const summary = { activeByObservation: [], breakByObservation: [], finishedByObservation: [] };

  for (const file of files) {
    const slug = path.basename(file, ".json");
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), "utf8"));
    } catch { skipped++; continue; }

    const lastDate = latestResultDate(data);
    if (!lastDate) { skipped++; continue; }  // no results yet for this league

    const matchCount = countDistinctMatches(data);
    const ageDays = (nowMs - Date.parse(lastDate)) / 86400000;
    const obs = classifyFromAge(ageDays);

    const existing = readLeagueState(slug) || {};
    const calendarState = existing.state;

    // Determine whether to override the calendar state.
    // Observation wins when:
    //   - obs=active (we have real evidence of play) → always override
    //   - obs=break/finished + calendar=active → trust observation (calendar is stale)
    // Observation defers when:
    //   - no results → never called (guard above)
    //   - calendar state is "disabled" → never override
    if (calendarState === "disabled") { skipped++; continue; }

    const stateChanged = obs.state !== calendarState;
    if (stateChanged) overrode++;

    writeLeagueState(slug, {
      state:          obs.state,
      confidence:     obs.confidence,
      decisionReason: obs.reason,
      lastResultDate: lastDate,
      lastResultMatchCount: matchCount,
      observedState:  obs.state,
      observedAt:     now.toISOString(),
      // Preserve recheckAfter only when state didn't change (don't reset the calendar timer)
      ...(stateChanged ? {} : {}),
    });

    summary[`${obs.state}ByObservation`]?.push(slug);
    updated++;
  }

  // Leagues NOT in results dir keep their calendar-based state — that's correct;
  // we haven't seen them play yet (new addition or too long ago to have data).

  log("done", {
    filesScanned: files.length,
    updated,
    skipped,
    overriddenCalendar: overrode,
    active: summary.activeByObservation.length,
    break: summary.breakByObservation.length,
    finished: summary.finishedByObservation.length,
  });

  return {
    ok: true,
    updated,
    skipped,
    overriddenCalendar: overrode,
    byObservedState: {
      active:   summary.activeByObservation,
      break:    summary.breakByObservation,
      finished: summary.finishedByObservation,
    }
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const result = updateLeagueStateFromResults();
  console.log(JSON.stringify(result, null, 2));
}
