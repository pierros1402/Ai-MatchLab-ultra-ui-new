/**
 * live-ft-verifier.js
 *
 * Cross-source confirmation of a stuck-LIVE → FT transition. A match may sit
 * LIVE long past its plausible end simply because the source that marked it live
 * went silent (no update, feed dropped it, provider lag). Time alone must NEVER
 * conclude FT — a match can be delayed, suspended, or in extra time. So instead
 * of guessing from the clock, when a row looks stuck we actively re-query
 * INDEPENDENT sources and only finalize on a real confirmation:
 *
 *   - FT is written ONLY when a source reports the match finished WITH a numeric
 *     score. The score comes from that source (never fabricated).
 *   - A source reporting the match still in-progress (fresh fetch, now) keeps it
 *     LIVE — that is real evidence it is ongoing, not a clock guess.
 *   - When NO independent source has an opinion, the row is left LIVE but tagged
 *     `statusUnconfirmed` so the UI can freeze the runaway clock WITHOUT ever
 *     asserting a false FT or score. Honest "we don't know yet" beats a fake final.
 *
 * Independent sources consulted (re-fetched live, short-TTL cached, and only when
 * stuck candidates actually exist, so normal loads pay nothing):
 *   - Flashscore offset=0 feed (shared cache with flashscore-live-overlay).
 *   - ESPN per-league scoreboard (the same feed the intraday status job uses).
 *
 * Runs LAST in the display overlay pipeline (after flashscore-live + results-
 * truth), so anything those already resolved from real data is untouched here.
 */

import { ESPN_BASE, leagueName } from "../config.js";
import { normalizeFixture, normalizeTeamKey } from "./normalize.js";
import { STATUS_RANK, statusRankFromParts } from "./display-contract.js";
import { getFlashscoreLiveIndex } from "../odds/flashscore-live-overlay.js";

// Only bother verifying once a match is past any normal length — below this it is
// plausibly still being played and the live state is trusted as-is. This is a
// TRIGGER to go check, never a conclusion on its own.
export const STUCK_TRIGGER_MIN = 125;

// Cap live ESPN fetches per request so a huge stuck backlog can't fan out into a
// fetch storm; the remainder is verified on the next load.
const MAX_ESPN_SLUGS_PER_RUN = 8;

const ESPN_TTL_MS = 60 * 1000;
const __espnCache = new Map(); // slug → { ts, byPair: Map<pairKey, rows[]> }

function pairKey(home, away) {
  return normalizeTeamKey(home) + "|" + normalizeTeamKey(away);
}

function minutesSinceKickoff(kickoffUtc, now) {
  const ts = kickoffUtc ? new Date(kickoffUtc).getTime() : NaN;
  if (!Number.isFinite(ts)) return null;
  return (now - ts) / 60000;
}

const FINAL_RE = /\b(FT|FULL_TIME|STATUS_FULL_TIME|FINAL|STATUS_FINAL|AET|PEN|POST)\b/i;
const LIVE_RE = /\b(LIVE|FIRST_HALF|SECOND_HALF|HALF_TIME|IN_PROGRESS|STATUS_IN_PROGRESS)\b/i;

function espnStatusBlob(row) {
  return [row?.status, row?.statusType, row?.rawStatus].filter(Boolean).join(" ").toUpperCase();
}

async function fetchEspnLeagueIndex(slug, dayKey) {
  const now = Date.now();
  const cached = __espnCache.get(slug);
  if (cached && now - cached.ts < ESPN_TTL_MS) return cached.byPair;

  const yyyymmdd = String(dayKey || "").replace(/-/g, "");
  const url = `${ESPN_BASE}/${slug}/scoreboard?dates=${yyyymmdd}`;

  let byPair = new Map();
  // Hard per-fetch timeout: on a datacenter IP (Render) ESPN can hang the socket
  // open indefinitely. Without this, the whole /fixtures-runtime request hangs
  // past the client's abort budget and the UI shows "loading error". 4s is plenty
  // for a live scoreboard; on timeout we return an empty index (verify is best-effort).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0 Ai-MatchLab ft-verifier", "accept": "application/json,text/plain,*/*" }
    });
    if (res.ok) {
      const json = await res.json();
      for (const event of Array.isArray(json?.events) ? json.events : []) {
        const n = normalizeFixture(event, slug);
        if (!n) continue;
        const blob = espnStatusBlob(n);
        const key = pairKey(n.homeTeam, n.awayTeam);
        if (!byPair.has(key)) byPair.set(key, []);
        byPair.get(key).push({
          kickoffTs: n.kickoffUtc ? new Date(n.kickoffUtc).getTime() : NaN,
          scoreHome: n.scoreHome,
          scoreAway: n.scoreAway,
          finished: FINAL_RE.test(blob),
          live: LIVE_RE.test(blob),
        });
      }
    } else {
      await res.body?.cancel?.();
    }
  } catch {
    // network/parse failure or 4s timeout → no opinion from ESPN this run
  } finally {
    clearTimeout(timer);
  }

  __espnCache.set(slug, { ts: now, byPair });
  return byPair;
}

// Nearest by kickoff. All candidates carry `kickoffTs` in MILLISECONDS.
function pickNearest(candidates, kickoffUtc) {
  if (!candidates || !candidates.length) return null;
  if (candidates.length === 1) return candidates[0];
  const target = kickoffUtc ? new Date(kickoffUtc).getTime() : NaN;
  if (!Number.isFinite(target)) return candidates[0];
  let best = candidates[0], bestDiff = Infinity;
  for (const c of candidates) {
    if (!Number.isFinite(c.kickoffTs)) continue;
    const diff = Math.abs(c.kickoffTs - target);
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }
  return best;
}

// Normalize a Flashscore feed row (kickoffTs in seconds) to the verifier shape.
function fsRowToObservation(row) {
  if (!row) return null;
  return {
    kickoffTs: Number.isFinite(row.kickoffTs) ? row.kickoffTs * 1000 : NaN,
    scoreHome: row.scoreHome,
    scoreAway: row.scoreAway,
    finished: !!row.finished,
    live: !row.finished && (row.scoreHome != null || row.scoreAway != null),
  };
}

function isStuckLive(m, now) {
  const rank = statusRankFromParts(m?.status, m?.rawStatus, m?.statusType, m?.statusName);
  if (rank !== STATUS_RANK.LIVE) return false;
  const elapsed = minutesSinceKickoff(m?.kickoffUtc, now);
  return elapsed != null && elapsed >= STUCK_TRIGGER_MIN;
}

/**
 * Verify stuck-LIVE rows against independent sources. Async; never throws.
 * Returns a possibly-new array (input not mutated). No fetches occur unless at
 * least one stuck-LIVE candidate exists.
 */
export async function verifyStuckLiveFinals(matches, dayKey, options = {}) {
  const list = Array.isArray(matches) ? matches : [];
  if (!list.length) return list;

  const now = options.now instanceof Date ? options.now.getTime() : Date.now();
  const day = String(dayKey || "").slice(0, 10);

  const stuckIdx = [];
  for (let i = 0; i < list.length; i++) if (isStuckLive(list[i], now)) stuckIdx.push(i);
  if (!stuckIdx.length) return list; // nothing stuck → zero extra work

  // Flashscore index (shared cache). May be null if the feed is unavailable.
  let fsByPair = null;
  try { fsByPair = await getFlashscoreLiveIndex(); } catch { fsByPair = null; }

  // ESPN: fetch per unique league slug among stuck rows, capped.
  const slugs = [];
  for (const i of stuckIdx) {
    const slug = String(list[i]?.leagueSlug || "");
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  const espnIndexBySlug = new Map();
  for (const slug of slugs.slice(0, MAX_ESPN_SLUGS_PER_RUN)) {
    espnIndexBySlug.set(slug, await fetchEspnLeagueIndex(slug, day));
  }

  const out = list.slice();
  for (const i of stuckIdx) {
    const m = list[i];
    const key = pairKey(m.homeTeam, m.awayTeam);
    const observations = []; // { source, finished, live, scoreHome, scoreAway }

    // Flashscore observation (normalize raw feed rows to ms-based observations
    // BEFORE picking nearest, so the kickoff units line up with ESPN's).
    if (fsByPair && fsByPair.get(key)) {
      const fsCands = fsByPair.get(key).map(fsRowToObservation).filter(Boolean);
      const obs = pickNearest(fsCands, m.kickoffUtc);
      if (obs) observations.push({ source: "flashscore", ...obs });
    }
    // ESPN observation
    const espnIdx = espnIndexBySlug.get(String(m.leagueSlug || ""));
    if (espnIdx && espnIdx.get(key)) {
      const obs = pickNearest(espnIdx.get(key), m.kickoffUtc);
      if (obs) observations.push({ source: "espn", ...obs });
    }

    // A confirmation needs finished + a numeric score (never fabricate a score).
    const finals = observations.filter(o => o.finished && o.scoreHome != null && o.scoreAway != null);
    const lives = observations.filter(o => o.live);

    if (finals.length) {
      const pick = finals[0]; // priority: flashscore pushed first, then espn
      out[i] = {
        ...m,
        status: "FT",
        statusType: "FT",
        rawStatus: m.rawStatus || m.status || "",
        statusName: null,
        minute: null,
        live: false,
        isLive: false,
        scoreHome: pick.scoreHome,
        scoreAway: pick.scoreAway,
        ftSource: "verified",
        ftVerifiedBy: finals.map(o => o.source),
      };
    } else if (lives.length) {
      // A source freshly reports it in-progress → genuinely ongoing, keep LIVE.
      out[i] = { ...m, statusUnconfirmed: false };
    } else {
      // No independent source has an opinion → do NOT fake FT. Flag as
      // unconfirmed so the UI freezes the clock; the real FT arrives later.
      out[i] = { ...m, statusUnconfirmed: true };
    }
  }

  return out;
}

// Test/ops helper — drop the ESPN per-league cache.
export function _clearFtVerifierCache() {
  __espnCache.clear();
}
