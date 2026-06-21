/**
 * odds-memory-db.js
 *
 * Persistent, server-side odds memory. The OPENING line is frozen the first time
 * a match is priced and never changes again ("κρατάει σταθερό το άνοιγμα"); every
 * later capture records the current line and the drift vs. the opening
 * ("δείχνει τη μεταβολή"). This is what the client-side OPENING_CACHE in
 * odds-core-bridge.js does, but durable across runs and page reloads.
 *
 * One file per match: data/odds-memory/{matchId}.json
 */

import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";

const DIR = resolveDataPath("odds-memory");
const HISTORY_CAP = 50;

function safeId(matchId) {
  // Windows filenames cannot contain : * ? " < > | — sanitise defensively.
  return String(matchId).replace(/[:*?"<>|\\/]+/g, "_");
}

function fileFor(matchId) {
  return resolveDataPath("odds-memory", `${safeId(matchId)}.json`);
}

export function readOdds(matchId) {
  try {
    return JSON.parse(fs.readFileSync(fileFor(matchId), "utf8"));
  } catch {
    return null;
  }
}

function deltaMap(open, current) {
  const out = {};
  for (const sel of Object.keys(current)) {
    const o = Number(open[sel]);
    const c = Number(current[sel]);
    out[sel] = Number.isFinite(o) && Number.isFinite(c) ? round3(c - o) : 0;
  }
  return out;
}

function round3(v) {
  return Math.round(v * 1000) / 1000;
}

/**
 * Record a freshly priced snapshot for a match.
 * @param {string} matchId
 * @param {{leagueSlug,home,away,kickoffUtc}} meta
 * @param {object} pricing  output of priceMatchFromStandings()
 * @returns {{matchId, opened:string[], moved:string[], unchanged:string[]}}
 */
export function recordOddsSnapshot(matchId, meta, pricing) {
  ensureDir(DIR);

  const now = new Date().toISOString();
  const cur = readOdds(matchId) || {
    matchId: String(matchId),
    markets: {}
  };

  cur.matchId    = String(matchId);
  cur.leagueSlug = meta.leagueSlug ?? cur.leagueSlug ?? null;
  cur.competition = meta.competition ?? cur.competition ?? null;
  cur.home       = meta.home ?? cur.home ?? null;
  cur.away       = meta.away ?? cur.away ?? null;
  cur.kickoffUtc = meta.kickoffUtc ?? cur.kickoffUtc ?? null;
  cur.kickoffLocal = meta.kickoffLocal ?? cur.kickoffLocal ?? null;
  cur.dayKey     = meta.dayKey ?? cur.dayKey ?? null;
  cur.updatedAt  = now;
  cur.openedAt   = cur.openedAt || now;

  // Our own AI assessment (fair odds from the model) — shown in match details,
  // kept separate from the displayed bookmaker market odds. Always refreshed.
  if (meta.aiAssessment !== undefined) {
    cur.aiAssessment = meta.aiAssessment;
  }
  if (meta.source !== undefined) cur.source = meta.source;
  if (meta.oddsBook !== undefined) cur.oddsBook = meta.oddsBook;

  const opened = [], moved = [], unchanged = [];

  for (const [market, data] of Object.entries(pricing.markets || {})) {
    const current = data.odds;
    const existing = cur.markets[market];

    if (!existing || !existing.open) {
      // First capture for this market → freeze the opening.
      cur.markets[market] = {
        open:    { ...current },
        current: { ...current },
        delta:   deltaMap(current, current), // all zero
        openModel: pricing.model || null,
        openedAt: now,
        updatedAt: now,
        history: [{ at: now, current: { ...current } }]
      };
      opened.push(market);
      continue;
    }

    // Subsequent capture → keep the frozen opening, update current + drift.
    const delta = deltaMap(existing.open, current);
    const changed = Object.keys(current).some(
      sel => Number(current[sel]) !== Number(existing.current?.[sel])
    );

    existing.current = { ...current };
    existing.delta = delta;
    existing.updatedAt = now;

    if (changed) {
      existing.history = [...(existing.history || []).slice(-(HISTORY_CAP - 1)),
        { at: now, current: { ...current } }];
      moved.push(market);
    } else {
      unchanged.push(market);
    }
  }

  fs.writeFileSync(fileFor(matchId), JSON.stringify(cur, null, 2), "utf8");
  return { matchId: String(matchId), opened, moved, unchanged };
}

/**
 * Frontend-shaped snapshot for one match + market, matching what
 * odds-core-bridge.js / odds-engine.js expect: a per-book map of rows carrying
 * open / current / delta. Here the "book" is the AI model itself.
 */
export function getOddsSnapshot(matchId, market = "1X2") {
  const data = readOdds(matchId);
  if (!data || !data.markets?.[market]) {
    return { ok: false, matchId: String(matchId), market, snapshot: {} };
  }

  const m = data.markets[market];
  const rows = Object.keys(m.current).map(sel => ({
    selection: sel,
    open:    m.open[sel],
    current: m.current[sel],
    delta:   m.delta[sel]
  }));

  return {
    ok: true,
    matchId: String(matchId),
    market,
    openedAt: m.openedAt,
    updatedAt: m.updatedAt,
    // Real bookmaker market line (opening frozen + drift). Our AI assessment is
    // returned separately by the endpoint, for the details view.
    snapshot: { "Market": rows }
  };
}

/**
 * All matches captured for a given Athens day, with their market odds
 * (open/current/delta) and our AI assessment. Powers the day view in the UI.
 */
export function getOddsForDay(dayKey) {
  const matches = [];
  try {
    for (const name of fs.readdirSync(DIR)) {
      if (!name.endsWith(".json")) continue;
      const d = readOdds(name.replace(/\.json$/, ""));
      if (!d) continue;
      if (dayKey && d.dayKey !== dayKey) continue;

      const m1x2 = d.markets?.["1X2"];
      matches.push({
        matchId: d.matchId,
        leagueSlug: d.leagueSlug,
        competition: d.competition || null,
        home: d.home,
        away: d.away,
        dayKey: d.dayKey,
        kickoffUtc: d.kickoffUtc || null,
        kickoffLocal: d.kickoffLocal || null,
        source: d.source || null,
        oddsBook: d.oddsBook || null,
        market: (m1x2 && m1x2.open) ? { open: m1x2.open, current: m1x2.current, delta: m1x2.delta } : null,
        aiAssessment: d.aiAssessment || null,
        updatedAt: d.updatedAt
      });
    }
  } catch {
    // dir not created yet
  }
  matches.sort((a, b) => String(a.kickoffUtc || a.kickoffLocal || "").localeCompare(String(b.kickoffUtc || b.kickoffLocal || "")));
  return { ok: true, dayKey: dayKey || null, count: matches.length, matches };
}

// ─── Deployed artifact readers (what the committed snapshot serves) ─────────────
// In production the hourly workflow commits only deploy-snapshots/{day}/odds.json
// (not the live capture store), so the served endpoints read from THAT file and
// fall back to the live store locally.

function readDeployedOddsFile(dayKey) {
  try {
    return JSON.parse(fs.readFileSync(resolveDataPath("deploy-snapshots", dayKey, "odds.json"), "utf8"));
  } catch {
    return null;
  }
}

export function getDeployedOddsDay(dayKey) {
  const snap = readDeployedOddsFile(dayKey);
  if (snap && Array.isArray(snap.matches)) {
    return { ok: true, dayKey, count: snap.count ?? snap.matches.length, matches: snap.matches, source: "deploy_snapshot" };
  }
  return { ...getOddsForDay(dayKey), source: "live_store" };
}

// Per-match snapshot (frontend shape) sourced from the deployed day file, with a
// fallback to the live store. Matches by our matchId.
export function getDeployedOddsSnapshot(matchId, market = "1X2", dayKey) {
  const id = String(matchId);
  const days = dayKey ? [dayKey] : [];
  for (const d of days) {
    const snap = readDeployedOddsFile(d);
    const m = snap?.matches?.find(x => String(x.matchId) === id);
    if (m?.market) {
      const rows = Object.keys(m.market.current).map(sel => ({
        selection: sel, open: m.market.open[sel], current: m.market.current[sel], delta: m.market.delta[sel]
      }));
      return { ok: true, matchId: id, market, snapshot: { "Market": rows }, aiAssessment: m.aiAssessment || null };
    }
  }
  // fallback to live store
  const live = getOddsSnapshot(id, market);
  const full = readOdds(id);
  return { ...live, aiAssessment: full?.aiAssessment || null };
}

export function getOddsSummary() {
  let total = 0;
  let markets = 0;
  try {
    for (const name of fs.readdirSync(DIR)) {
      if (!name.endsWith(".json")) continue;
      total++;
      const d = readOdds(name.replace(/\.json$/, ""));
      markets += Object.keys(d?.markets || {}).length;
    }
  } catch {
    // dir not created yet
  }
  return { matches: total, marketsTracked: markets };
}
