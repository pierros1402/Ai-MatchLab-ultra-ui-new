/**
 * season.js
 *
 * THE single source of truth for "which season is current" across the value
 * pipeline — model-priors, history-index, standings, value evaluation. Before
 * this, the season label "2025-2026" was hardcoded in ~11 places, so nothing
 * advanced when a season ended: the just-finished season stayed the current one
 * and never rolled into the historical (priors) source set. Everything now derives
 * from here, so a completed season becomes history AUTOMATICALLY, no manual edit.
 *
 * Season label format is "YYYY-YYYY" (matches history-archive / model-priors /
 * history-index filenames), NOT the "YYYY-YY" form used by the per-league
 * standings calendar.
 *
 * Rollover boundary = 1 August. European leagues start early-mid August, so the
 * global "current season" holds the just-finished label through the summer gap
 * (Jun–Jul) and advances on 1 Aug when the new season genuinely begins. During
 * the early weeks the new season has little form data — value degrades gracefully
 * to the (now 5-season) priors, which is correct, not a break.
 */

const ROLLOVER_MONTH = 8; // 1 August

/** Current global season label, e.g. "2025-2026". */
export function currentSeason(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1; // 1-12
  const startYear = m >= ROLLOVER_MONTH ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
}

/** The season label immediately before `label` ("2025-2026" → "2024-2025"). */
export function seasonBefore(label) {
  const startYear = Number(String(label).slice(0, 4));
  if (!Number.isFinite(startYear)) return null;
  return `${startYear - 1}-${startYear}`;
}

/**
 * The N completed seasons before the current one, oldest-first — the source set
 * for model-priors. When `currentSeason()` advances (1 Aug), the just-finished
 * season automatically enters this list, so priors pick it up with no code change.
 */
export function priorSeasons(n = 5, now = new Date()) {
  const startYear = Number(currentSeason(now).slice(0, 4));
  const out = [];
  for (let i = n; i >= 1; i--) out.push(`${startYear - i}-${startYear - i + 1}`);
  return out;
}
