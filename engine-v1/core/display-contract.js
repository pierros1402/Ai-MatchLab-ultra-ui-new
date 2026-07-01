/**
 * display-contract.js
 *
 * THE single, shared contract for "what matches exist for a given day and what
 * is authoritative about each one". Both /api/matches-for-date and
 * /fixtures-runtime MUST agree because both derive their match universe from
 * `buildDisplayMatchesForDate` (engine-v1/index.js), which is governed by the
 * primitives defined here. Any consumer that needs to dedupe rows, rank status
 * authority, or reason about source priority imports from THIS file so the rules
 * can never drift between endpoints again.
 *
 * ── Data classification (decided 2026-07-01) ────────────────────────────────
 *  - deploy-snapshots/<day>/fixtures.json  → PREFERRED display source when a
 *      complete snapshot exists (ESPN canonical status/scores). NOT statistical
 *      truth on its own — a regenerable deploy artifact.
 *  - deploy-snapshots/<day>/odds.json, fixtures-all.json → SUPPLEMENTS: they add
 *      rows/existence + (odds) drift display. They are NEVER a result/status
 *      authority and NEVER an input to the value assessment (odds↔value firewall).
 *  - data/fixtures.json (json-db) → regenerable OPERATIONAL BRIDGE/CACHE, NOT a
 *      statistical truth store. Frozen openings/assessments are mirrored to
 *      data/assessments/<day>.json, so the bridge can be rebuilt without loss.
 *  - Statistical truth = league-memory (results / standings / history). Deploy
 *      snapshots and the bridge must never overwrite or contaminate it.
 *
 * ── Firewall ────────────────────────────────────────────────────────────────
 *  Odds never influence the value-panel value or the per-match detail
 *  assessment. Rows carry `assessment` (value, statistical) and odds/drift as
 *  strictly separate blocks. The supplement paths may add existence, never value.
 */

// Order in which sources are layered into the display universe. Earlier sources
// win a league/pair; later sources only fill gaps they don't already cover.
export const DISPLAY_SOURCE_PRIORITY = Object.freeze([
  "snapshot-fixtures", // deploy-snapshots/<day>/fixtures.json  (ESPN canonical)
  "snapshot-odds",     // deploy-snapshots/<day>/odds.json        (supplement)
  "fixtures-all",      // deploy-snapshots/<day>/fixtures-all.json (supplement)
  "canonical-fixtures",// canonical-fixtures/<day>/*.json         (future-day fallback)
]);

// Status authority hierarchy — higher wins when two rows describe the same match.
// Truth results (past days) and ESPN FT sit at the top; PRE/SCHEDULED lowest.
export const STATUS_RANK = Object.freeze({
  FINAL: 50,     // FT / FULL_TIME / FINAL / AET / PEN
  SPECIAL: 40,   // POSTPONED / CANCELED / ABANDONED / SUSPENDED
  LIVE: 30,      // LIVE / FIRST_HALF / SECOND_HALF / HALF_TIME / IN_PROGRESS
  PRE: 20,       // PRE / SCHEDULED / NOT_STARTED
  UNKNOWN: 10,
});

/**
 * Rank the status authority of a match from its (possibly concatenated) status
 * fields. Token-aware so a blob like "FT SECOND_HALF FT" still reads as FINAL.
 */
export function statusRankFromParts(status, rawStatus, statusType, statusName) {
  const s = String([status, rawStatus, statusType, statusName].filter(Boolean).join(" ")).toUpperCase();
  // Token match: a short code like FT/PEN/PRE only counts as its own word, so a
  // concatenated blob "FT SECOND_HALF FT" reads FINAL (not LIVE) and "AFTER"
  // never matches "FT". Longer, unambiguous words stay as substring checks.
  const has = (tok) => new RegExp(`(^|[^A-Z])${tok}([^A-Z]|$)`).test(s);
  if (has("FT") || s.includes("FULL_TIME") || s.includes("FINAL") || has("AET") || has("PEN")) return STATUS_RANK.FINAL;
  if (s.includes("POSTPON") || s.includes("CANCEL") || s.includes("ABANDON") || s.includes("SUSPEND")) return STATUS_RANK.SPECIAL;
  if (has("LIVE") || s.includes("FIRST_HALF") || s.includes("SECOND_HALF") || s.includes("HALF_TIME") || s.includes("IN_PROGRESS")) return STATUS_RANK.LIVE;
  if (has("PRE") || s.includes("SCHEDULED") || s.includes("NOT_STARTED")) return STATUS_RANK.PRE;
  return STATUS_RANK.UNKNOWN;
}

/**
 * Canonical team-name key for display dedupe: lowercase, strip diacritics, keep
 * only [a-z0-9]. This is THE dedupe primitive — every endpoint uses it so the
 * same match never appears twice across snapshot / odds / fixtures-all sources.
 */
export function normalizeDisplayTeam(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Normalized home|away pair key for same-day dedupe. */
export function displayPairKey(home, away) {
  return `${normalizeDisplayTeam(home)}|${normalizeDisplayTeam(away)}`;
}
