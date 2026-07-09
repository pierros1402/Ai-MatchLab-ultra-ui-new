/**
 * multi-odds-consensus.js
 *
 * Derives a single consensus 1X2 line (current + frozen opening) from the
 * per-bookmaker multi-odds store that OddsPortal already populates for free
 * across ~63 leagues. This lets the MAIN odds line / value pipeline reuse that
 * broad free coverage instead of the narrow BetExplorer listing — no new
 * scraping, no API cost, and the join is exact because multi-odds is keyed by
 * our own matchId (same key space as odds-memory).
 *
 * Consensus = average of home/draw/away across every book in every panel
 * (greek/european/asian/betfair). Opening uses each book's frozen `open{}`.
 */

import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";
import { normalizeTeamTokens } from "../core/normalize.js";
import { tokenJaccard } from "./team-league-index.js";

const PANELS = ["greek", "european", "asian", "betfair"];

export function readMultiOddsDay(dayKey) {
  try {
    return JSON.parse(fs.readFileSync(resolveDataPath("multi-odds", `${dayKey}.json`), "utf8"));
  } catch {
    return null;
  }
}

function avg(values) {
  const nums = values.filter(v => Number.isFinite(v) && v > 1);
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 100) / 100;
}

/**
 * Average 1X2 across every book/panel for one multi-odds match entry.
 * @returns {{ current:{home,draw,away}, open:{home,draw,away}, bookCount } | null}
 */
export function deriveConsensus1x2(matchEntry) {
  const x = matchEntry?.markets?.["1X2"];
  if (!x) return null;

  const cur = { home: [], draw: [], away: [] };
  const opn = { home: [], draw: [], away: [] };
  let bookCount = 0;

  for (const panel of PANELS) {
    const books = x[panel];
    if (!books) continue;
    for (const bk of Object.values(books)) {
      if (!bk) continue;
      bookCount++;
      for (const sel of ["home", "draw", "away"]) {
        if (bk[sel] != null) cur[sel].push(Number(bk[sel]));
        const o = bk.open?.[sel];
        if (o != null) opn[sel].push(Number(o));
      }
    }
  }

  if (!bookCount) return null;

  const current = { home: avg(cur.home), draw: avg(cur.draw), away: avg(cur.away) };
  if (current.home == null || current.draw == null || current.away == null) return null;

  const openHome = avg(opn.home), openDraw = avg(opn.draw), openAway = avg(opn.away);
  const open = (openHome != null && openDraw != null && openAway != null)
    ? { home: openHome, draw: openDraw, away: openAway }
    : { ...current };

  return { current, open, bookCount };
}

function marketFromConsensus(c) {
  const delta = {};
  for (const sel of ["home", "draw", "away"]) {
    delta[sel] = Math.round((c.current[sel] - c.open[sel]) * 100) / 100;
  }
  return {
    open: c.open,
    current: c.current,
    delta,
    source: "oddsportal-consensus",
    bookCount: c.bookCount,
  };
}

/**
 * Build a reusable index over a multi-odds day payload so callers can resolve a
 * match to its consensus either by exact key or, when id spaces differ across
 * sources, by fuzzy team-pair (token Jaccard ≥ 0.6 — the same threshold the rest
 * of the pipeline uses). Returns null when the day has no multi-odds.
 */
export function buildConsensusIndex(dayKey, dayPayload = null) {
  const payload = dayPayload || readMultiOddsDay(dayKey);
  const entries = payload?.matches ? Object.entries(payload.matches) : [];
  if (!entries.length) return null;

  const byId = new Map();
  const pairs = [];
  for (const [id, entry] of entries) {
    const c = deriveConsensus1x2(entry);
    if (!c) continue;
    const market = marketFromConsensus(c);
    byId.set(String(id), market);
    pairs.push({
      home: prepTeam(entry.home),
      away: prepTeam(entry.away),
      market,
    });
  }
  return { byId, pairs };
}

// Flashscore-side names carry "(Cro)"-style country suffixes and abbreviations
// ("Dyn. Kyiv") that the canonical multi-odds names don't, so plain
// normalizeTeamTokens + tokenJaccard lands just under the 0.6 join threshold
// (measured 2026-07-09: only 3/27 covered matches joined). Strip the trailing
// parenthesized suffix before normalizing, and let a token count as shared when
// one is a ≥3-char prefix of the other (dyn → dynamo). Local to this display
// join — attribution/canonical paths keep the strict shared helpers.
function prepTeam(name) {
  return normalizeTeamTokens(String(name || "").replace(/\s*\([^)]*\)\s*$/, ""));
}

function tokensMatch(a, b) {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length >= 3 && long.startsWith(short);
}

function prefixAwareJaccard(a, b) {
  const A = [...new Set(a.split(" ").filter(Boolean))];
  const B = [...new Set(b.split(" ").filter(Boolean))];
  if (!A.length || !B.length) return 0;
  const used = new Set();
  let inter = 0;
  for (const t of A) {
    const hit = B.find((u, i) => !used.has(i) && tokensMatch(t, u));
    if (hit !== undefined) { used.add(B.indexOf(hit)); inter++; }
  }
  return inter / (A.length + B.length - inter);
}

function resolveByPair(index, home, away) {
  const nh = prepTeam(home);
  const na = prepTeam(away);
  if (!nh || !na) return null;

  let best = null, bestScore = 0;
  for (const p of index.pairs) {
    const score = (prefixAwareJaccard(nh, p.home) + prefixAwareJaccard(na, p.away)) / 2;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 0.6 ? best.market : null;
}

/**
 * Resolve a match to its OddsPortal consensus market. Tries exact keys
 * (matchId / canonicalId) first, then fuzzy team-pair — so it works whether or
 * not the multi-odds store shares our id space. Returns null when uncovered.
 */
export function resolveConsensusMarket(index, { matchId, canonicalId, home, away } = {}) {
  if (!index) return null;
  if (matchId && index.byId.has(String(matchId))) return index.byId.get(String(matchId));
  if (canonicalId && index.byId.has(String(canonicalId))) return index.byId.get(String(canonicalId));
  if (home && away) return resolveByPair(index, home, away);
  return null;
}

/**
 * Consensus 1X2 for a single matchId on a given day, shaped like odds-memory's
 * `market` field ({ open, current, delta }) so callers can drop it in directly.
 * Returns null when there is no multi-odds coverage for the match.
 */
export function consensusMarketFor(matchId, dayKey, dayPayload = null) {
  const payload = dayPayload || readMultiOddsDay(dayKey);
  const entry = payload?.matches?.[String(matchId)];
  if (!entry) return null;

  const c = deriveConsensus1x2(entry);
  return c ? marketFromConsensus(c) : null;
}
