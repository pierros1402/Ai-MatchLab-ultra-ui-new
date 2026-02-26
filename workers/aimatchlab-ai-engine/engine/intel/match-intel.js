// ============================================================
// MATCH INTEL LAYER – v1.1 (LIVE EVOLUTION READY)
// - Reads AI_STATE memory
// - Uses match-index pointer
// - Team Context v2 + Matchup Context v2
// - Intelligent cache invalidation
// - LIVE state evolution support
// ============================================================
import { computeConfidence } from "./intel-confidence.js";
import { buildTeamContext } from "../context/team-context.js";
import { buildMatchupContext } from "../context/matchup-context.js";
import { applyLiveEvolution } from "./live-evolution.js";
import { computeIntelDelta } from "./intel-delta.js";
import { buildNarrative } from "./intel-narrator.js";
import { generateSignals } from "./intel-signals.js";
import { filterAndPersistSignals } from "./intel-signal-store.js";
/* ============================================================
   PHASE DETECTION
============================================================ */

function deriveIntelPhase(status) {
  if (!status) return "PRE";

  const s = String(status).toUpperCase();

  if (
    s.includes("FULL_TIME") ||
    s.includes("FT") ||
    s.includes("AET") ||
    s.includes("PEN")
  ) return "FINAL";

  if (
    s.includes("LIVE") ||
    s.includes("IN_PROGRESS") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("HALF_TIME")
  ) return "LIVE";

  return "PRE";
}

/* ============================================================
   STATE SIGNATURE (CACHE INVALIDATION CORE)
============================================================ */

function buildStateSignature(match) {
  return [
    match.status || "UNKNOWN",
    match.scoreHome ?? 0,
    match.scoreAway ?? 0,
    match.minute ?? match.clock ?? 0
  ].join("|");
}

function phaseKeyFor(matchId, phase) {
  const p = String(phase || "PRE").toUpperCase();
  if (p === "LIVE") return `intel/context/${matchId}/live.json`;
  if (p === "FINAL") return `intel/context/${matchId}/final.json`;
  return `intel/context/${matchId}/pre.json`;
}

async function readTimeline(env, matchId) {
  try {
    const key = `intel/context/${matchId}/timeline.json`;
    const obj = await env.AI_STATE.get(key);
    if (!obj) return [];
    const parsed = JSON.parse(await obj.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeTimeline(env, matchId, entry) {
  try {
    const key = `intel/context/${matchId}/timeline.json`;
    const timeline = await readTimeline(env, matchId);

    const last = timeline[timeline.length - 1];

    // append only if phase/signature changed
    if (
      !last ||
      last.phase !== entry.phase ||
      last.stateSignature !== entry.stateSignature
    ) {
      timeline.push(entry);

      // keep it bounded (last 50)
      const trimmed = timeline.length > 50 ? timeline.slice(-50) : timeline;

      await env.AI_STATE.put(
        key,
        JSON.stringify(trimmed),
        { httpMetadata: { contentType: "application/json" } }
      );
    }
  } catch (_) {}
}

/* ============================================================
   MAIN BUILDER
============================================================ */

export async function buildMatchIntel(env, matchId) {

  if (!matchId) {
    return { ok:false, error:"missing_id" };
  }

  // ------------------------------------------------------------
  // Resolve league + season from index
  // ------------------------------------------------------------

  const idxObj = await env.AI_STATE.get(`match-index/${matchId}.json`);
  const idx = idxObj ? JSON.parse(await idxObj.text()) : null;

  if (!idx?.league || !idx?.season) {
    return { ok:false, error:"no_match_index", matchId };
  }

  const { league, season } = idx;

  const base = `league/${league}/${season}/`;

  const match = await readJsonR2(env, `${base}matches/${matchId}.json`);
  if (!match) {
    return { ok:false, error:"match_not_found", matchId, league, season };
  }

  const meta  = await readJsonR2(env, `${base}meta.json`)  || {};
  const table = await readJsonR2(env, `${base}table.json`) || [];

  const leagueVersion = meta.leagueVersion ?? 0;

  /* ============================================================
     CACHE CHECK
  ============================================================ */

  const cacheKey = `intel/context/${matchId}/latest.json`;
  const cached = await readJsonR2(env, cacheKey);

  const signature = buildStateSignature(match);

  if (
    cached &&
    cached.leagueVersion === leagueVersion &&
    cached.meta?.stateSignature === signature
  ) {
    return { ...cached, cache:"HIT" };
  }

  /* ============================================================
     CONTEXT BUILD
  ============================================================ */

  const phase = deriveIntelPhase(match.status);

  const home = match.home;
  const away = match.away;

  const matchup = await buildMatchupContext(env, league, season, home, away);

  const homeCtx = matchup?.homeContext || null;
  const awayCtx = matchup?.awayContext || null;

  /* ============================================================
     TABLE POSITIONS
  ============================================================ */

  const positions = buildPositions(table);

  const homePos = positions[home]?.pos ?? null;
  const awayPos = positions[away]?.pos ?? null;

  const pressureHome = classifyPressure(homePos, table);
  const pressureAway = classifyPressure(awayPos, table);

  const impact = computeTableImpact({
    table,
    positions,
    home,
    away
  });

  /* ============================================================
     HIGH LEVEL LABELS
  ============================================================ */

  const momentum   = classifyMomentum(matchup?.momentumDelta);
  const volatility = classifyVolatility(matchup?.riskIndex);
  const control    = classifyControl(matchup);

  const signals = buildSignals({
    momentumDelta: matchup?.momentumDelta,
    homeCtx,
    awayCtx,
    pressureHome,
    pressureAway,
    volatility,
    impact
  });

  /* ============================================================
     OUTPUT
  ============================================================ */

  const out = {
    ok:true,
    matchId,
    league,
    season,
    leagueVersion,
    rankingHash: meta.rankingHash ?? null,

    meta:{
      stateSignature: signature,
      phase
    },

    phase,

    basic:{
      home,
      away,
      kickoff: match.date ?? null,
      status: match.status ?? null,
      scoreHome: match.scoreHome ?? null,
      scoreAway: match.scoreAway ?? null
    },

    context:{
      momentum,
      volatility,
      control,
      gameProfile: matchup?.gameProfile ?? "UNKNOWN",
      overLean: matchup?.overLean ?? "NEUTRAL",
      bttsLean: matchup?.bttsLean ?? "NEUTRAL"
    },

    teams:{
      home: simplifyTeam(homeCtx),
      away: simplifyTeam(awayCtx)
    },

    leaguePressure:{
      home: pressureHome,
      away: pressureAway,
      homePos,
      awayPos
    },

    tableImpact: impact,

    signals,

    cache:"MISS",
    version:1,
    generatedAt: Date.now()
  };
// ------------------------------------------------------------
// LIVE EVOLUTION HOOK
// ------------------------------------------------------------
// defensive guards (future-safe)
out.context = out.context || {};
out.meta = out.meta || {};

const evolvedOut = applyLiveEvolution(out);

// ------------------------------------------------------------
// DELTA COMPUTATION
// ------------------------------------------------------------
let previousIntel = null;

try {
  const prevObj =
    await env.AI_STATE.get(`intel/context/${matchId}/latest.json`);

  if (prevObj) {
    previousIntel = JSON.parse(await prevObj.text());
  }
} catch (_) {}

const delta = computeIntelDelta(previousIntel, evolvedOut);

if (delta) {
  evolvedOut.delta = delta;

  const narrative = buildNarrative(delta);
  if (narrative) {
    evolvedOut.narrative = narrative;
  }
}

// ------------------------------------------------------------
// CONFIDENCE SCORE
// ------------------------------------------------------------
const confidence = computeConfidence(evolvedOut);

if (confidence) {
  evolvedOut.confidence = confidence;
}

// ------------------------------------------------------------
// LIVE SIGNALS (COOLDOWN + PERSIST)
// ------------------------------------------------------------
let rawSignals = [];

try {
  rawSignals = generateSignals(previousIntel, evolvedOut);
} catch (_) {}

let emittedSignals = [];
try {
  emittedSignals = await filterAndPersistSignals(
    env,
    matchId,
    evolvedOut,
    rawSignals
  );
} catch (_) {}

if (emittedSignals.length) {
  // only signals that passed cooldown
  evolvedOut.signals = emittedSignals;
}// ------------------------------------------------------------
// PHASE MEMORY PERSIST
// ------------------------------------------------------------
const finalPhase = (evolvedOut?.meta?.phase || phase || "PRE").toUpperCase();
const phaseKey = phaseKeyFor(matchId, finalPhase);
const latestKey = cacheKey; // intel/context/<matchId>/latest.json

// ensure meta.phase is consistent
evolvedOut.meta = evolvedOut.meta || {};
evolvedOut.meta.phase = finalPhase;

try {
  // 1) write latest (current behavior)
  await env.AI_STATE.put(latestKey, JSON.stringify(evolvedOut));

  // 2) write phase snapshot
  await env.AI_STATE.put(phaseKey, JSON.stringify(evolvedOut));

  // 3) write timeline entry
  await writeTimeline(env, matchId, {
    ts: Date.now(),
    phase: finalPhase,
    leagueVersion: evolvedOut.leagueVersion ?? null,
    stateSignature: evolvedOut.meta?.stateSignature ?? null,
    scoreHome: evolvedOut.basic?.scoreHome ?? null,
    scoreAway: evolvedOut.basic?.scoreAway ?? null,
    status: evolvedOut.basic?.status ?? null
  });

} catch (_) {}
  // persist cache

  return evolvedOut;
}

/* ============================================================
   HELPERS
============================================================ */

async function readJsonR2(env, key) {
  try {
    const obj = await env.AI_STATE.get(key);
    if (!obj) return null;
    return JSON.parse(await obj.text());
  } catch {
    return null;
  }
}

function simplifyTeam(ctx) {
  if (!ctx?.ok) return { dataReady:false };

  return {
    dataReady:true,
    matches:ctx.matches ?? 0,
    goalsForRate:ctx.goalsForRate ?? null,
    goalsAgainstRate:ctx.goalsAgainstRate ?? null,
    winRate:ctx.winRate ?? null,
    drawRate:ctx.drawRate ?? null,
    lossRate:ctx.lossRate ?? null,
    over25Rate:ctx.over25Rate ?? null,
    bttsRate:ctx.bttsRate ?? null,
    momentumIndex:ctx.momentumIndex ?? null,
    volatilityIndex:ctx.volatilityIndex ?? null,
    consistencyScore:ctx.consistencyScore ?? null
  };
}

function buildPositions(table) {
  const map = {};
  if (!Array.isArray(table)) return map;

  for (let i=0;i<table.length;i++) {
    const t = table[i]?.team;
    if (!t) continue;
    map[t] = { pos:i+1, row:table[i] };
  }
  return map;
}

function classifyPressure(pos, table) {
  const n = table?.length || 0;
  if (!pos || !n) return "UNKNOWN";

  if (pos <= 3) return "TOP_RACE";
  if (pos <= 6) return "EURO_RACE";
  if (pos >= n-2) return "SURVIVAL";

  return "MID_SAFE";
}

function computeTableImpact({table,positions,home,away}) {
  const n = table?.length || 0;
  if (!n) return { swingPotential:"UNKNOWN", rankingSensitivity:null };

  const hp = positions[home]?.pos;
  const ap = positions[away]?.pos;

  const band = p=>{
    if (!p) return "UNK";
    if (p<=3) return "TOP";
    if (p>=n-2) return "BOT";
    if (p<=6) return "EURO";
    return "MID";
  };

  const hb = band(hp);
  const ab = band(ap);

  let swing="MED";
  if (hb==="MID" && ab==="MID") swing="LOW";
  if (hb==="TOP"||hb==="BOT"||ab==="TOP"||ab==="BOT") swing="HIGH";

  return {
    swingPotential:swing,
    rankingSensitivity:
      swing==="HIGH"?0.75:
      swing==="LOW"?0.25:0.5,
    homeBand:hb,
    awayBand:ab
  };
}

function classifyMomentum(d){
  if(typeof d!=="number") return "UNKNOWN";
  if(d>0.35) return "HOME_ADV";
  if(d<-0.35) return "AWAY_ADV";
  return "NEUTRAL";
}

function classifyVolatility(r){
  if(typeof r!=="number") return "UNKNOWN";
  if(r>=1.4) return "HIGH";
  if(r<=1.1) return "LOW";
  return "MED";
}

function classifyControl(m){
  const d=m?.stabilityDelta;
  if(typeof d!=="number") return "BALANCED";
  if(d>0.35) return "HOME_CONTROL";
  if(d<-0.35) return "AWAY_CONTROL";
  return "BALANCED";
}

function buildSignals({
  momentumDelta,
  pressureHome,
  pressureAway,
  volatility,
  impact
}) {
  const s=[];

  if(momentumDelta>0.35) s.push("HOME_MOMENTUM_EDGE");
  else if(momentumDelta<-0.35) s.push("AWAY_MOMENTUM_EDGE");

  if(pressureHome!=="UNKNOWN") s.push(`PRESSURE_HOME_${pressureHome}`);
  if(pressureAway!=="UNKNOWN") s.push(`PRESSURE_AWAY_${pressureAway}`);

  if(volatility!=="UNKNOWN") s.push(`VOLATILITY_${volatility}`);

  if(impact?.swingPotential)
    s.push(`TABLE_SWING_${impact.swingPotential}`);

  return s;
}