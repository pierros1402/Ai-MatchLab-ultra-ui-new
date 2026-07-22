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
 *  - deploy-snapshots/<day>/odds.json and fixtures-all.json → ENRICHMENT-ONLY
 *      artifacts. They may enrich rows already present in the authoritative
 *      fixture universe, but can never create match existence or result state.
 *  - data/fixtures.json (json-db) → regenerable OPERATIONAL BRIDGE/CACHE, NOT a
 *      statistical truth store. Frozen openings/assessments are mirrored to
 *      data/assessments/<day>.json, so the bridge can be rebuilt without loss.
 *  - Statistical truth = league-memory (results / standings / history). Deploy
 *      snapshots and the bridge must never overwrite or contaminate it.
 *
 * ── Firewall ────────────────────────────────────────────────────────────────
 *  Odds never influence the value-panel value or the per-match detail
 *  assessment. Rows carry `assessment` (value, statistical) and odds/drift as
 *  strictly separate blocks. Enrichment artifacts require exact membership
 *  in an existing canonical/snapshot fixture and can never add existence.
 */

// Order in which sources are layered into the display universe. Earlier sources
// win a league/pair; later sources only fill gaps they don't already cover.
export const DISPLAY_SOURCE_PRIORITY = Object.freeze([
  "snapshot-fixtures", // deploy-snapshots/<day>/fixtures.json  (ESPN canonical)
  "snapshot-odds",     // deploy-snapshots/<day>/odds.json        (enrichment only)
  "fixtures-all",      // deploy-snapshots/<day>/fixtures-all.json (enrichment only)
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

// ── Panel-mode display rule ─────────────────────────────────────────────────
// The shared builder (`buildDisplayMatchesForDate`) defines the match UNIVERSE
// for a day. The panel MODE defines which statuses within that universe are
// shown — these are two separate concerns and must never be collapsed, or the
// panels lose their product meaning:
//   today  = PRE + LIVE          upcoming + currently running. A match LEAVES
//                                the today panel the moment it finishes (FT).
//   active = PRE + LIVE(as PRE) + FINAL + SPECIAL  the day's per-league mirror of
//                                the WHOLE slate (also for days moved forward/back).
//                                It is NOT the live panel, so a currently-running
//                                match must not vanish — it stays visible but is
//                                PROJECTED to PRE (kickoff time, no score/minute).
//                                So active never SHOWS live status, yet never drops
//                                a live match either.
// Any other mode = no filter (full universe). UNKNOWN-status rows are excluded
// from both panels rather than guessed into LIVE/FT.
export const PANEL_MODES = Object.freeze(["today", "active"]);

// ── Stale-LIVE display guard (today panel) ──────────────────────────────────
// A row can sit LIVE forever when the source that marked it live went silent —
// the audit found SECOND_HALF rows with ~18h-old lastSeenAt still served as
// "now playing". The live-ft-verifier tags such rows `statusUnconfirmed` when
// NO independent source has an opinion (it never fakes FT). This guard is the
// DISPLAY consequence: an unconfirmed live row far past kickoff leaves the
// today panel (exactly as it would on FT), and any live row past a hard sanity
// floor leaves regardless (no real match runs 8h, delays included). The stored
// status is NOT touched — no fabricated FT; the active/day-mirror panel keeps
// the row (projected to PRE) and the truth-store overlay delivers the real FT
// when the result lands.
export const STALE_LIVE_UNCONFIRMED_MIN = 300; // 5h past kickoff + unconfirmed
export const STALE_LIVE_HARD_MIN = 480;        // 8h past kickoff, unconditional

function minutesSinceKickoffMs(row, nowMs) {
  const ts = row?.kickoffUtc ? new Date(row.kickoffUtc).getTime() : NaN;
  if (!Number.isFinite(ts)) return null;
  return (nowMs - ts) / 60000;
}

export function isStaleLiveForDisplay(row, nowMs = Date.now()) {
  const rank = statusRankFromParts(
    row?.status, row?.rawStatus, row?.statusType, row?.statusName
  );
  if (rank !== STATUS_RANK.LIVE) return false;

  const mins = minutesSinceKickoffMs(row, nowMs);
  if (mins == null) return false; // no kickoff → cannot judge, keep showing

  if (mins >= STALE_LIVE_HARD_MIN) return true;
  return row?.statusUnconfirmed === true && mins >= STALE_LIVE_UNCONFIRMED_MIN;
}

export function panelModeAllowsRow(mode, row) {
  const rank = statusRankFromParts(
    row?.status, row?.rawStatus, row?.statusType, row?.statusName
  );
  if (mode === "today") {
    if (rank === STATUS_RANK.LIVE && isStaleLiveForDisplay(row)) return false;
    return rank === STATUS_RANK.PRE || rank === STATUS_RANK.LIVE;
  }
  if (mode === "active") {
    // LIVE included too — it is projected to PRE (see projectLiveToPreForActive),
    // so the day mirror stays complete without ever showing live status.
    return (
      rank === STATUS_RANK.PRE ||
      rank === STATUS_RANK.LIVE ||
      rank === STATUS_RANK.FINAL ||
      rank === STATUS_RANK.SPECIAL
    );
  }
  return true; // unknown mode → do not filter
}

// Present a live row as its scheduled (PRE) self for the active/day-mirror panel:
// keep the fixture, drop everything live (status blob, score, minute). The
// `displayedAsPre` flag is an audit breadcrumb (was LIVE, shown as PRE).
function projectLiveToPreForActive(row) {
  return {
    ...row,
    status: "PRE",
    statusType: "PRE",
    rawStatus: "PRE",
    statusName: null,
    state: null,
    phase: null,
    scoreHome: null,
    scoreAway: null,
    minute: null,
    live: false,
    isLive: false,
    displayedAsPre: true,
  };
}

/**
 * Project a shared display universe down to a panel. Callers build the universe
 * once (so /fixtures-runtime and /api/matches-for-date can never disagree about
 * which matches exist) and shape it per panel here. `active` keeps live matches
 * but renders them as PRE so the day mirror is never missing a running match.
 */
export function filterByPanelMode(matches, mode) {
  if (mode !== "today" && mode !== "active") return matches || [];
  const out = [];
  for (const row of (matches || [])) {
    if (!panelModeAllowsRow(mode, row)) continue;
    if (mode === "active") {
      const rank = statusRankFromParts(row?.status, row?.rawStatus, row?.statusType, row?.statusName);
      out.push(rank === STATUS_RANK.LIVE ? projectLiveToPreForActive(row) : row);
    } else {
      out.push(row);
    }
  }
  return out;
}

/**
 * Exact fixture identity used to join display enrichment artifacts.
 *
 * Odds and fixtures-all rows may enrich an existing fixture, but a missing,
 * ambiguous, or name-only identity can never create a new display fixture.
 */
export function displayFixtureIdentity(row) {
  return String(
    row?.canonicalId ??
    row?.matchId ??
    row?.id ??
    ""
  ).trim();
}

/**
 * Partition enrichment rows by exact membership in the authoritative fixture
 * universe. Team names, league slugs, and kickoff proximity are deliberately
 * insufficient.
 */
export function partitionDisplaySupplementsByFixtureIdentity(
  fixtureRows = [],
  supplementRows = []
) {
  const fixtureIds = new Set(
    (fixtureRows || [])
      .map(displayFixtureIdentity)
      .filter(Boolean)
  );

  const matched = [];
  const ignored = [];

  for (const row of (supplementRows || [])) {
    const identity = displayFixtureIdentity(row);

    if (identity && fixtureIds.has(identity)) {
      matched.push(row);
    } else {
      ignored.push(row);
    }
  }

  return {
    fixtureIds,
    matched,
    ignored
  };
}

/**
 * Build the authoritative display existence universe.
 *
 * Snapshot/canonical fixtures define which matches exist. Odds and fixtures-all
 * rows are diagnostic/enrichment inputs only and are never appended as matches.
 */
export function selectAuthoritativeDisplayUniverse(
  fixtureRows = [],
  oddsRows = [],
  fixturesAllRows = []
) {
  const fixtures = Array.isArray(fixtureRows)
    ? [...fixtureRows]
    : [];

  const odds = Array.isArray(oddsRows)
    ? oddsRows
    : [];

  const fixturesAll = Array.isArray(fixturesAllRows)
    ? fixturesAllRows
    : [];

  const oddsMembership =
    partitionDisplaySupplementsByFixtureIdentity(
      fixtures,
      odds
    );

  const fixturesAllMembership =
    partitionDisplaySupplementsByFixtureIdentity(
      fixtures,
      fixturesAll
    );

  return {
    matches: fixtures,
    membership: {
      authoritativeSource:
        "deploy-snapshot-fixtures",
      authoritativeFixtureCount:
        fixtures.length,
      supplementsMayCreateFixture:
        false,
      oddsRowsSeen:
        odds.length,
      oddsExactFixtureMembers:
        oddsMembership.matched.length,
      oddsRowsIgnoredForExistence:
        odds.length,
      fixturesAllRowsSeen:
        fixturesAll.length,
      fixturesAllExactFixtureMembers:
        fixturesAllMembership.matched.length,
      fixturesAllRowsIgnoredForExistence:
        fixturesAll.length
    }
  };
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
