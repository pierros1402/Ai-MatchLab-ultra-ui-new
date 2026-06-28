/**
 * update-league-state-from-results.js
 *
 * Derives league active/break/finished state from TWO observation signals —
 * no calendar guessing, no manual entries.  Runs daily AFTER accumulateResults.
 *
 * Signal 1 — Feed appearances (fixtures-all.json):
 *   A league appearing in TODAY's fixtures-all snapshot is definitively active
 *   (Flashscore is the schedule source of truth).  We track lastSeenInFeed per
 *   slug; this covers ALL leagues the feed exports, even those with no accumulated
 *   FT results yet.
 *
 * Signal 2 — FT results (league-memory/results/):
 *   Last confirmed FT match date from our accumulation.  Lags by one day but
 *   is the authoritative historical signal for leagues no longer in the feed.
 *
 * Combined decision (most recent of the two signals wins):
 *   age ≤ 14 days  → "active"   (playing or just played)
 *   age 14–60 days → "break"    (mid-season or international break)
 *   age  > 60 days → "finished" (season over)
 *   no signal      → leave calendar decision unchanged (unknown leagues)
 *
 * Observation always wins over calendar when we have evidence.  Calendar is
 * only the floor for leagues we have never seen in the feed.
 *
 * Self-learning: after each daily run the system knows empirically when every
 * league plays.  No Wikipedia, no manual calendar edits ever needed.
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { writeLeagueState, readLeagueState } from "../storage/league-memory-db.js";

const RESULTS_DIR = resolveDataPath("league-memory", "results");

const ACTIVE_THRESHOLD_DAYS = 14;
const BREAK_THRESHOLD_DAYS  = 60;

function log(...a) { console.log("[update-league-state]", ...a); }

/**
 * Signal 1 — Scan recent fixtures-all.json snapshots and return a map of
 * leagueSlug → most recent dayKey when that league appeared in the feed.
 * Covers ALL leagues the Flashscore export knows, not only the ones we
 * actively accumulate results for.
 */
function buildFeedActivityIndex(daysBack = 10) {
  const lastSeen = new Map(); // slug → ISO date string of last feed appearance
  const nowMs = Date.now();

  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(nowMs - i * 86400000);
    const key = d.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
    try {
      const p = resolveDataPath("deploy-snapshots", key, "fixtures-all.json");
      if (!fs.existsSync(p)) continue;
      const faj = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const m of (faj.matches || [])) {
        const slug = m.leagueSlug;
        if (!slug || !m.dayKey) continue;
        // Keep the earliest match kickoff as the "last seen" signal for that snapshot
        // date.  dayKey in fixtures-all is the Athens match date.
        const matchDate = m.kickoffUtc || `${m.dayKey}T12:00:00Z`;
        const prev = lastSeen.get(slug);
        if (!prev || matchDate > prev) lastSeen.set(slug, matchDate);
      }
    } catch { /* snapshot missing or corrupt */ }
  }
  return lastSeen;
}

/** Signal 2 — Most recent FT result date from league-memory/results. */
function latestResultDate(resultsData) {
  let latest = null;
  for (const matches of Object.values(resultsData.teams || {})) {
    for (const m of matches) {
      if (m.date && (!latest || m.date > latest)) latest = m.date;
    }
  }
  return latest;
}

function countDistinctMatches(resultsData) {
  const seen = new Set();
  for (const matches of Object.values(resultsData.teams || {})) {
    for (const m of matches) { if (m.matchId) seen.add(m.matchId); }
  }
  return seen.size;
}

/**
 * Classify state from the age (in days) of the most recent observation signal.
 * "active" confidence is high because we have real evidence the league is playing.
 */
function classifyFromAge(ageDays, signalType) {
  if (ageDays <= ACTIVE_THRESHOLD_DAYS) {
    const reason = signalType === "feed"
      ? "observation_seen_in_feed"
      : "observation_recent_result";
    return { state: "active", confidence: 0.95, reason };
  }
  if (ageDays <= BREAK_THRESHOLD_DAYS) {
    return { state: "break",    confidence: 0.82, reason: "observation_mid_break" };
  }
  return   { state: "finished", confidence: 0.90, reason: "observation_long_silence" };
}

export function updateLeagueStateFromResults(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const nowMs = now.getTime();

  // --- Signal 1: feed activity from fixtures-all.json snapshots ---
  const feedActivity = buildFeedActivityIndex(10);
  log("feed-activity-index", { leaguesInFeed: feedActivity.size });

  // --- Signal 2: accumulated FT results ---
  const resultFiles = fs.existsSync(RESULTS_DIR)
    ? fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith(".json"))
    : [];

  // Collect all slugs we have any signal for
  const allSlugs = new Set([
    ...feedActivity.keys(),
    ...resultFiles.map(f => path.basename(f, ".json")),
  ]);

  let updated = 0, skipped = 0, overrode = 0;
  const summary = { active: [], break: [], finished: [] };

  for (const slug of allSlugs) {
    const existing = readLeagueState(slug) || {};
    if (existing.state === "disabled") { skipped++; continue; }

    // Signal 1: when did this league last appear in the Flashscore feed?
    const lastFeedDate  = feedActivity.get(slug) || null;
    const feedAgeDays   = lastFeedDate ? (nowMs - Date.parse(lastFeedDate)) / 86400000 : Infinity;

    // Signal 2: when was the most recent FT result we accumulated?
    let lastResultDate = null, matchCount = 0;
    try {
      const rf = path.join(RESULTS_DIR, `${slug}.json`);
      if (fs.existsSync(rf)) {
        const data = JSON.parse(fs.readFileSync(rf, "utf8"));
        lastResultDate = latestResultDate(data);
        matchCount     = countDistinctMatches(data);
      }
    } catch { /* unreadable */ }
    const resultAgeDays = lastResultDate ? (nowMs - Date.parse(lastResultDate)) / 86400000 : Infinity;

    // Use the MOST RECENT of the two signals (smallest age = freshest evidence)
    const ageDays    = Math.min(feedAgeDays, resultAgeDays);
    const signalType = feedAgeDays <= resultAgeDays ? "feed" : "result";

    if (!Number.isFinite(ageDays)) { skipped++; continue; }  // no evidence at all

    const obs = classifyFromAge(ageDays, signalType);
    const calendarState = existing.state;
    if (obs.state !== calendarState) overrode++;

    writeLeagueState(slug, {
      state:               obs.state,
      confidence:          obs.confidence,
      decisionReason:      obs.reason,
      lastSeenInFeed:      lastFeedDate,
      lastResultDate:      lastResultDate,
      lastResultMatchCount: matchCount || undefined,
      observedState:       obs.state,
      observedAt:          now.toISOString(),
    });

    summary[obs.state]?.push(slug);
    updated++;
  }

  log("done", {
    leaguesWithSignal: allSlugs.size,
    updated,
    skipped,
    overriddenCalendar: overrode,
    active:   summary.active.length,
    break:    summary.break.length,
    finished: summary.finished.length,
  });

  return {
    ok: true,
    updated,
    skipped,
    overriddenCalendar: overrode,
    byObservedState: {
      active:   summary.active,
      break:    summary.break,
      finished: summary.finished,
    },
  };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const result = updateLeagueStateFromResults();
  console.log(JSON.stringify(result, null, 2));
}
