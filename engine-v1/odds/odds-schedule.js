/**
 * odds-schedule.js
 *
 * Decides WHEN to re-scrape bookmaker odds. Policy (user spec):
 *   - baseline: refresh every 8 hours
 *   - ramp-up:  refresh every hour during the last 4 hours before a match kicks off
 *
 * One scrape updates every tracked match at once (the opening stays frozen, only
 * current + drift change), so the decision is just "is a scrape due now?".
 *
 * Pure logic — no fetch, no fs.
 */

const HOUR = 3600 * 1000;
const BASELINE_INTERVAL = 8 * HOUR;
const RAMP_INTERVAL = 1 * HOUR;
const RAMP_WINDOW = 4 * HOUR;   // hourly within 4h before kickoff
const GRACE_AFTER_KO = 2 * HOUR; // keep refreshing a bit past kickoff (live drift)

/**
 * BetExplorer kickoff strings ("YYYY-MM-DDTHH:MM") are in the listing's local
 * timezone (≈ CET/CEST). Convert to a UTC epoch using a fixed offset.
 */
export function kickoffToUtcMs(kickoffLocal, tzOffsetHours = 2) {
  if (!kickoffLocal) return null;
  const m = String(kickoffLocal).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  return Date.UTC(y, mo - 1, d, h - tzOffsetHours, mi);
}

/**
 * @param {object} p
 * @param {number|null} p.lastScrapeAt  epoch ms of the last scrape (null if never)
 * @param {number[]}    p.kickoffsUtc    upcoming match kickoff epochs (ms)
 * @param {number}      [p.now]
 * @returns {{ due:boolean, reason:string, hoursSinceLast:number|null }}
 */
export function oddsUpdateDecision({ lastScrapeAt, kickoffsUtc = [], now = Date.now() }) {
  if (!lastScrapeAt) {
    return { due: true, reason: "first_run", hoursSinceLast: null };
  }

  const sinceMs = now - lastScrapeAt;
  const hoursSinceLast = Number((sinceMs / HOUR).toFixed(2));

  const inRamp = kickoffsUtc.some(ko => {
    const dt = ko - now;
    return dt <= RAMP_WINDOW && dt >= -GRACE_AFTER_KO;
  });

  if (inRamp && sinceMs >= RAMP_INTERVAL) {
    return { due: true, reason: "ramp_hourly_pre_kickoff", hoursSinceLast };
  }

  if (sinceMs >= BASELINE_INTERVAL) {
    return { due: true, reason: "baseline_8h", hoursSinceLast };
  }

  return { due: false, reason: inRamp ? "ramp_not_yet" : "baseline_not_yet", hoursSinceLast };
}

export { BASELINE_INTERVAL, RAMP_INTERVAL, RAMP_WINDOW };
