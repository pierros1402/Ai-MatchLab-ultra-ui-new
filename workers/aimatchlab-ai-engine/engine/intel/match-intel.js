// ============================================================
// MATCH INTEL LAYER – v1.0
// - Reads AI_STATE memory (matches/table/meta)
// - Uses match-index/{matchId}.json pointer for fast resolve
// - Reuses Team Context v2 + Matchup Context v2
// - Caches output in AI_STATE: intel/context/{matchId}/latest.json
// ============================================================

import { buildTeamContext } from "../context/team-context.js";
import { buildMatchupContext } from "../context/matchup-context.js";

// --------------------------------------------------
// INTEL PHASE DETECTION
// --------------------------------------------------
function deriveIntelPhase(status) {
  if (!status) return "PRE";

  const s = String(status).toUpperCase();

  // FINAL STATES
  if (
    s.includes("FULL_TIME") ||
    s.includes("FT") ||
    s.includes("AFTER_EXTRA_TIME") ||
    s.includes("PENALTIES")
  ) {
    return "FINAL";
  }

  // LIVE STATES
  if (
    s.includes("LIVE") ||
    s.includes("IN_PROGRESS") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("HALF_TIME")
  ) {
    return "LIVE";
  }

  return "PRE";
}

function buildStateSignature(match) {
  return [
    match.status || "UNKNOWN",
    match.scoreHome ?? 0,
    match.scoreAway ?? 0,
    (match.minute ?? match.clock ?? 0)
  ].join("|");
}
export async function buildMatchIntel(env, matchId) {
  if (!matchId) {
    return { ok: false, error: "missing_id" };
  }

  // ------------------------------------------------------------
  // Resolve league/season from match-index
  // ------------------------------------------------------------
  const idxKey = `match-index/${matchId}.json`;

  const raw = await env.AI_STATE.get(idxKey);
  const idx = raw ? JSON.parse(await raw.text()) : null;

  if (!idx || !idx.league || !idx.season) {
    return { ok: false, error: "no_match_index", matchId };
  }

  const league = idx.league;
  const season = idx.season;

  const statePrefix = `league/${league}/${season}/`;
  const matchKey = `${statePrefix}matches/${matchId}.json`;
  const metaKey  = `${statePrefix}meta.json`;
  const tableKey = `${statePrefix}table.json`;

  const match = await readJsonR2(env, matchKey);
  if (!match) {
    return { ok: false, error: "match_not_found", matchId, league, season };
  }

  const meta = (await readJsonR2(env, metaKey)) || {};
  const table = (await readJsonR2(env, tableKey)) || [];

  const leagueVersion = meta.leagueVersion ?? 0;

  // ------------------------------------------------------------
  // Cache (invalidate by leagueVersion)
  // ------------------------------------------------------------
  const cacheKey = `intel/context/${matchId}/latest.json`;
  const cached = await readJsonR2(env, cacheKey);

  const currentSignature = buildStateSignature(match);

  if (
    cached &&
    cached.leagueVersion === leagueVersion &&
    cached.meta?.stateSignature === currentSignature
  ) {
    return { ...cached, cache: "HIT" };
  }

    const phase = deriveIntelPhase(match.status);
// ------------------------------------------------------------
  // Context Builders
  // ------------------------------------------------------------
  const home = match.home;
  const away = match.away;

  // build matchup FIRST (it already loads core data)
  const matchup = await buildMatchupContext(env, league, season, home, away);

  // reuse contexts if provided, otherwise fallback
  const homeCtx = matchup?.homeContext || null;
  const awayCtx = matchup?.awayContext || null;

  // ------------------------------------------------------------
  // League pressure from table positions
  // ------------------------------------------------------------
  const positions = buildPositions(table);
  const homePos = positions[home]?.pos ?? null;
  const awayPos = positions[away]?.pos ?? null;

  const pressureHome = classifyPressure(homePos, table);
  const pressureAway = classifyPressure(awayPos, table);

  // ------------------------------------------------------------
  // Table impact (deterministic proxy)
  // ------------------------------------------------------------
  const impact = computeTableImpact({ table, positions, home, away });

  // ------------------------------------------------------------
  // High-level context labels
  // ------------------------------------------------------------
  const momentum = classifyMomentum(matchup?.momentumDelta);
  const volatility = classifyVolatility(matchup?.riskIndex);
  const control = classifyControl(matchup);

  // ------------------------------------------------------------
  // Signals
  // ------------------------------------------------------------
  const signals = buildSignals({
    momentumDelta: matchup?.momentumDelta,
    homeCtx,
    awayCtx,
    pressureHome,
    pressureAway,
    volatility,
    impact
  });

  const out = {
    ok: true,
    matchId,
    league,
    season,
    leagueVersion,
    rankingHash: meta.rankingHash ?? null,

    meta: {
      stateSignature: currentSignature
    },

    phase,

    basic: {
      home,
      away,
      kickoff: match.date ?? null,
      status: match.status ?? null,
      scoreHome: match.scoreHome ?? null,
      scoreAway: match.scoreAway ?? null
    },

    context: {
      momentum,
      volatility,
      control,
      gameProfile: matchup?.gameProfile ?? "UNKNOWN",
      overLean: matchup?.overLean ?? "NEUTRAL",
      bttsLean: matchup?.bttsLean ?? "NEUTRAL"
    },

    teams: {
      home: simplifyTeam(homeCtx),
      away: simplifyTeam(awayCtx)
    },

    leaguePressure: {
      home: pressureHome,
      away: pressureAway,
      homePos,
      awayPos
    },

    tableImpact: impact,

    signals,

    cache: "MISS",
    version: 1,
    generatedAt: Date.now()
  };

  // persist cache (best-effort)
  try {
    await env.AI_STATE.put(cacheKey, JSON.stringify(out));
  } catch (_) {}

  return out;
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

async function readJsonR2(env, key) {
  try {
    const obj = await env.AI_STATE.get(key);
    if (!obj) return null;
    const text = await obj.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function simplifyTeam(ctx) {
  if (!ctx || !ctx.ok) {
    return { dataReady: false };
  }
  if (!ctx.matches) {
    return { dataReady: false, matches: 0 };
  }
  return {
    dataReady: true,
    matches: ctx.matches,
    goalsForRate: ctx.goalsForRate ?? null,
    goalsAgainstRate: ctx.goalsAgainstRate ?? null,
    winRate: ctx.winRate ?? null,
    drawRate: ctx.drawRate ?? null,
    lossRate: ctx.lossRate ?? null,
    over25Rate: ctx.over25Rate ?? null,
    bttsRate: ctx.bttsRate ?? null,
    cleanSheetRate: ctx.cleanSheetRate ?? null,
    failToScoreRate: ctx.failToScoreRate ?? null,
    momentumIndex: ctx.momentumIndex ?? null,
    volatilityIndex: ctx.volatilityIndex ?? null,
    consistencyScore: ctx.consistencyScore ?? null,
    formTrend: ctx.formTrend ?? null
  };
}

function buildPositions(table) {
  const map = {};
  if (!Array.isArray(table)) return map;
  for (let i = 0; i < table.length; i++) {
    const t = table[i]?.team;
    if (!t) continue;
    map[t] = { pos: i + 1, row: table[i] };
  }
  return map;
}

function classifyPressure(pos, table) {
  const n = Array.isArray(table) ? table.length : 0;
  if (!pos || !n) return "UNKNOWN";

  if (pos <= 3) return "TOP_RACE";
  if (pos <= 6) return "EURO_RACE";
  if (pos >= n - 2) return "SURVIVAL";
  return "MID_SAFE";
}

function computeTableImpact({ table, positions, home, away }) {
  const n = Array.isArray(table) ? table.length : 0;
  if (!n) {
    return { swingPotential: "UNKNOWN", rankingSensitivity: null };
  }

  const hp = positions[home]?.pos ?? null;
  const ap = positions[away]?.pos ?? null;

  // sensitivity proxy: high when either team is in TOP_RACE or SURVIVAL bands
  const band = (p) => {
    if (!p) return "UNK";
    if (p <= 3) return "TOP";
    if (p <= 6) return "EURO";
    if (p >= n - 2) return "BOT";
    return "MID";
  };

  const hb = band(hp);
  const ab = band(ap);

  let swingPotential = "MED";
  if (hb === "TOP" || hb === "BOT" || ab === "TOP" || ab === "BOT") swingPotential = "HIGH";
  if (hb === "MID" && ab === "MID") swingPotential = "LOW";

  // numeric proxy 0..1
  let rankingSensitivity = 0.5;
  if (swingPotential === "HIGH") rankingSensitivity = 0.75;
  if (swingPotential === "LOW") rankingSensitivity = 0.25;

  return { swingPotential, rankingSensitivity, homeBand: hb, awayBand: ab };
}

function classifyMomentum(momentumDelta) {
  if (typeof momentumDelta !== "number") return "UNKNOWN";
  if (momentumDelta > 0.35) return "HOME_ADV";
  if (momentumDelta < -0.35) return "AWAY_ADV";
  return "NEUTRAL";
}

function classifyVolatility(riskIndex) {
  if (typeof riskIndex !== "number") return "UNKNOWN";
  if (riskIndex >= 1.4) return "HIGH";
  if (riskIndex <= 1.1) return "LOW";
  return "MED";
}

function classifyControl(matchup) {
  const stabilityDelta = matchup?.stabilityDelta;
  if (typeof stabilityDelta !== "number") return "BALANCED";
  if (stabilityDelta > 0.35) return "HOME_CONTROL";
  if (stabilityDelta < -0.35) return "AWAY_CONTROL";
  return "BALANCED";
}

function buildSignals({ momentumDelta, homeCtx, awayCtx, pressureHome, pressureAway, volatility, impact }) {
  const s = [];

  if (typeof momentumDelta === "number") {
    if (momentumDelta > 0.35) s.push("HOME_MOMENTUM_EDGE");
    else if (momentumDelta < -0.35) s.push("AWAY_MOMENTUM_EDGE");
  }

  if (pressureHome && pressureHome !== "UNKNOWN") s.push(`PRESSURE_HOME_${pressureHome}`);
  if (pressureAway && pressureAway !== "UNKNOWN") s.push(`PRESSURE_AWAY_${pressureAway}`);

  if (volatility && volatility !== "UNKNOWN") s.push(`VOLATILITY_${volatility}`);

  if (impact?.swingPotential) s.push(`TABLE_SWING_${impact.swingPotential}`);

  // opportunistic signal: defensive fragility
  if (homeCtx?.goalsAgainstRate != null && awayCtx?.goalsAgainstRate != null) {
    if (homeCtx.goalsAgainstRate > 1.4) s.push("HOME_DEFENSE_LEAKY");
    if (awayCtx.goalsAgainstRate > 1.4) s.push("AWAY_DEFENSE_LEAKY");
  }

  return s;
}
