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
import { computeDrift } from "./compute-drift.js";
import { computeValueBias } from "./intel-value-core.js";
import { computeStructuralValue } from "../value/value-structural.js";
import { detectMatchRegime } from "./match-regime.js";
import { detectGamePressure } from "./game-pressure.js";
import { predictNextPhase } from "./phase-predictor.js";
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

  let statusStr = "UNKNOWN";

  if (typeof match.status === "string") {
    statusStr = match.status;
  } else if (typeof match.status === "object" && match.status) {
    statusStr =
      match.status.type?.name ||
      match.status.type?.state ||
      match.status.description ||
      "UNKNOWN";
  }

  return [
    statusStr,
    match.scoreHome ?? 0,
    match.scoreAway ?? 0,
    match.minute ??
    match.clock ??
    match.clock?.displayValue ??
    0
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

    // append only if real state change happened
    if (
      !last ||
      last.phase !== entry.phase ||
      last.stateSignature !== entry.stateSignature ||
      last.scoreHome !== entry.scoreHome ||
      last.scoreAway !== entry.scoreAway
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
  const forceIntel =
    typeof matchId === "string" &&
    matchId.includes("|force");

  if (forceIntel) {
    matchId = matchId.replace("|force", "");
  }
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

// ------------------------------------------------------------
// PARALLEL R2 LOAD (performance optimization)
// ------------------------------------------------------------
const [matchRaw, metaRaw, tableRaw] = await Promise.all([
  readJsonR2(env, `${base}matches/${matchId}.json`),
  readJsonR2(env, `${base}meta.json`),
  readJsonR2(env, `${base}table.json`)
]);

const match = matchRaw;

// attach force flag (non-persistent runtime only)
if (match && forceIntel) {
  match.__forceIntel = true;
}

if (!match) {
  return { ok:false, error:"match_not_found", matchId, league, season };
}

const meta  = metaRaw  || {};
const table = tableRaw || [];

const leagueVersion = meta.leagueVersion ?? 0;

  /* ============================================================
     CACHE CHECK
  ============================================================ */

  const cacheKey = `intel/context/${matchId}/latest.json`;
  const cached = await readJsonR2(env, cacheKey);

  const signature = buildStateSignature(match);

  const force = match?.__forceIntel === true;

  if (
    !force &&
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
    metrics:{
      tempo: matchup?.tempoIndex ?? 0,
      volatility: matchup?.riskIndex ?? 0,
      control: matchup?.stabilityDelta ?? 0
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

const minute = Number(match.minute ?? match.clock ?? 0);

const delta = computeIntelDelta(
  previousIntel,
  evolvedOut,
  minute
);

if (delta) {
  evolvedOut.delta = delta;

  const narrative = buildNarrative(delta, evolvedOut.meta?.phase);
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

  const baseSignals =
    Array.isArray(evolvedOut.signals)
      ? evolvedOut.signals
      : [];

  evolvedOut.signals = [
    ...baseSignals,
    ...emittedSignals
  ];

}

// ------------------------------------------------------------
// BASELINE RESOLUTION (PRE SNAPSHOT LOCK)
// ------------------------------------------------------------
let baselineIntel = null;

try {

  const baselineKey =
    `intel/context/${matchId}/baseline.json`;

  const baselineObj =
    await env.AI_STATE.get(baselineKey);

  if (baselineObj) {
    baselineIntel =
      JSON.parse(await baselineObj.text());
  }

  const currentPhase =
    (evolvedOut?.meta?.phase || "PRE").toUpperCase();

  // If entering LIVE and no baseline yet → lock PRE
  if (!baselineIntel && currentPhase === "LIVE") {

    const latestPre =
      previousIntel?.meta?.phase === "PRE"
        ? previousIntel
        : evolvedOut;

    if (latestPre) {
      await env.AI_STATE.put(
        baselineKey,
        JSON.stringify(latestPre),
        { httpMetadata: { contentType: "application/json" } }
      );

      baselineIntel = latestPre;
    }
  }

} catch (e) {
  console.log("[BASELINE RESOLVE FAIL]", e);
}

// ------------------------------------------------------------
// SIGNAL REACTIVE REFRESH (ASYNC SELF-TRIGGER + LOOP GUARD)
// ------------------------------------------------------------
try {

  const REACTIVE_SIGNAL_TYPES = new Set([
    "GOAL_EVENT",
    "VOLATILITY_SPIKE"
  ]);

  const shouldReact =
    !forceIntel &&  // <---- LOOP GUARD
    emittedSignals.some(
      s =>
        REACTIVE_SIGNAL_TYPES.has(s.type) &&
        evolvedOut.meta?.phase === "LIVE"
    );

  if (shouldReact) {

    const guardKey = `INTEL:REACTIVE:${matchId}`;

    let locked = null;
    try {
      locked = await env.AIML_INGESTION_KV.get(guardKey);
    } catch (_) {}

    // prevent rapid self-trigger loops
    if (!locked) {

      try {
        await env.AIML_INGESTION_KV.put(
          guardKey,
          String(Date.now()),
          { expirationTtl: 30 } // 30s guard window
        );
      } catch (_) {}

      const url =
        `https://aimatchlab-ai-engine.pierros1402.workers.dev` +
        `/ai/match-intel?id=${matchId}|force`;

      fetch(url).catch(()=>{});

      console.log("[REACTIVE REFRESH TRIGGERED]", matchId);
    }
  }

} catch (e) {
  console.log("[REACTIVE REFRESH FAIL]", e);
}

// ------------------------------------------------------------
// FINAL DRIFT ATTACH (after all mutations)
// baseline = previousIntel snapshot (PRE expectation)
// live     = evolvedOut current state (LIVE reality)
// ------------------------------------------------------------
try {
  const baselineSource = baselineIntel || previousIntel;

  const baselineMetrics = {
    tempo: Number(baselineSource?.metrics?.tempo ?? 0),
    volatility: Number(baselineSource?.metrics?.volatility ?? 0),
    control: Number(baselineSource?.metrics?.control ?? 0)
  };;

  const liveMetrics = {
    tempo: Number(evolvedOut?.metrics?.tempo ?? 0),
    volatility: Number(evolvedOut?.metrics?.volatility ?? 0),
    control: Number(evolvedOut?.metrics?.control ?? 0)
  };

  const drift = computeDrift(baselineMetrics, liveMetrics);

  // ΠΑΝΤΑ γράφουμε drift για να το “δει” το UI (ακόμα και μηδενικό)
  evolvedOut.drift = drift || {
    ok: true,
    magnitude: 0,
    direction: "NEUTRAL",
    components: { tempo: 0, volatility: 0, control: 0 }
  };

} catch (e) {
  console.log("[DRIFT FINAL FAIL]", e);
}

// ==============================
// DRIFT → HYBRID DELTA (Unified)
// ==============================
try {
  const drift = evolvedOut?.drift || {};

  const tempo = Number(drift.tempo || 0);
  const volatility = Number(drift.volatility || 0);
  const control = Number(drift.control || 0);

  const tempoPct = Math.round(tempo * 100);
  const volatilityPct = Math.round(volatility * 100);
  const controlPct = Math.round(control * 100);

  const driftScore =
    Math.round((Math.abs(tempo) + Math.abs(volatility) + Math.abs(control)) * 33.3);

  const prevDelta = evolvedOut?.delta || {};

  evolvedOut.delta = {
    // existing deviation metrics (signals depend on these)
    tempoDeviationPct: tempoPct,
    volatilityDeviationPct: volatilityPct,
    controlDeviationPct: controlPct,
    driftScore,

    // hybrid extension (new intelligence layer)
    structuralShift: prevDelta.structuralShift ?? 0,
    strength: prevDelta.strength ?? 0,
    phase: evolvedOut?.meta?.phase ?? "PRE",
    goalShock: prevDelta.goalShock ?? false
  };

} catch (_) {}

// ------------------------------------------------------------
// MATCH REGIME DETECTION
// ------------------------------------------------------------
try {

  const regime = detectMatchRegime(evolvedOut);

  if (regime) {
    evolvedOut.regime = regime;
  }

} catch (_) {}

// ------------------------------------------------------------
// GAME PRESSURE ENGINE
// ------------------------------------------------------------
try {

  const pressure = detectGamePressure(evolvedOut);

  if (pressure) {
    evolvedOut.pressure = pressure;
  }

} catch (_) {}

// ------------------------------------------------------------
// PHASE PREDICTOR
// ------------------------------------------------------------
try {

  const phasePrediction =
    predictNextPhase(evolvedOut);

  if (phasePrediction) {
    evolvedOut.phasePrediction = phasePrediction;
  }

} catch (_) {}

// ==============================
// MODEL STABILITY (Phase 3.1)
// ==============================
try {
  const confVal = Number(evolvedOut?.confidence?.value ?? 50);
  const confNorm = Math.max(0, Math.min(1, confVal / 100));

  const driftScore = Number(evolvedOut?.delta?.driftScore ?? 0);
  const driftNorm = Math.max(0, Math.min(1, driftScore / 100));

  const stability = Math.max(0, Math.min(1, confNorm * (1 - driftNorm)));
  const risk = Math.max(0, Math.min(1, 1 - stability));

  evolvedOut.model = {
    stability: Number(stability.toFixed(3)),
    risk: Number(risk.toFixed(3)),
    method: "stability_conf_x_drift_v1"
  };
} catch (_) {}

// ------------------------------------------------------------
// VALUE BIAS LAYER (v1)
// ------------------------------------------------------------
try {
  const valueBias = computeValueBias(evolvedOut);
  if (valueBias) {
    evolvedOut.value = valueBias;
  }
} catch (e) {
  console.log("[VALUE CORE FAIL]", e);
}

// ------------------------------------------------------------
// STRUCTURAL VALUE ENGINE (v1)
// ------------------------------------------------------------
try {
  const structural = computeStructuralValue(evolvedOut);
  if (structural) {
    evolvedOut.valueStructural = structural;
  }
} catch (e) {
  console.log("[STRUCTURAL VALUE FAIL]", e);
}


// ------------------------------------------------------------
// DRIFT → SIGNAL AMPLIFICATION
// ------------------------------------------------------------
try {

  const driftMag = evolvedOut?.drift?.magnitude ?? 0;

  if (driftMag > 0.6) {
    for (const s of evolvedOut.signals || []) {
      if (s.severity === "LOW") s.severity = "MEDIUM";
      else if (s.severity === "MEDIUM") s.severity = "HIGH";
    }
  }

} catch (e) {
  console.log("[DRIFT SIGNAL BOOST FAIL]", e);
}

// ------------------------------------------------------------
// DRIFT → CONFIDENCE MODULATION (post-adjust)
// Purpose: when drift grows, confidence should drop (model uncertainty).
// Notes: we keep computeConfidence() deterministic, and apply a drift penalty here,
// after FINAL DRIFT ATTACH so drift is available.
// ------------------------------------------------------------
try {
  const driftMag = Number(evolvedOut?.drift?.magnitude ?? 0);

  if (!evolvedOut.confidence) {
    evolvedOut.confidence = { value: 50, level: "NEUTRAL" };
  }

  const pre = Number(evolvedOut.confidence?.value ?? 50);

  let penalty = 0;

  // 0.60–1.20 => up to 10 points penalty
  if (driftMag > 0.6) {
    const t = Math.min(1, Math.max(0, (driftMag - 0.6) / 0.6));
    penalty += 10 * t;
  }

  // >1.20 => up to +15 points penalty (total cap 25)
  if (driftMag > 1.2) {
    const t2 = Math.min(1, Math.max(0, (driftMag - 1.2) / 1.2));
    penalty += 15 * t2;
  }

  penalty = Math.min(25, Math.round(penalty));

  const post = Math.max(0, Math.min(100, Math.round(pre - penalty)));

  function levelFromScore(v) {
    if (v >= 80) return "STRONG";
    if (v >= 65) return "STABLE";
    if (v >= 45) return "NEUTRAL";
    if (v >= 30) return "UNSTABLE";
    return "CHAOTIC";
  }

  evolvedOut.confidence = {
    ...evolvedOut.confidence,
    preDriftValue: pre,
    driftMagnitude: driftMag,
    driftPenalty: penalty,
    value: post,
    level: levelFromScore(post),
    method: "drift_post_adjust_v1"
  };
} catch (e) {
  console.log("[DRIFT CONFIDENCE MOD FAIL]", e);
}


// ==============================
// DRIFT → TYPED SIGNALS
// ==============================
// Adds explicit drift signals for UI/Value Engine attention model.
// Thresholds:
//  - >0.6  => MODEL_DRIFT_MED
//  - >1.2  => MODEL_DRIFT_HIGH
try {
  const mag = Number(evolvedOut?.drift?.magnitude ?? 0);

  if (!Array.isArray(evolvedOut.signals)) evolvedOut.signals = [];

  // avoid duplicates
  const hasMed  = evolvedOut.signals.includes("MODEL_DRIFT_MED");
  const hasHigh = evolvedOut.signals.includes("MODEL_DRIFT_HIGH");

  if (mag > 1.2) {
    if (!hasHigh) evolvedOut.signals.push("MODEL_DRIFT_HIGH");
    // if HIGH, drop MED if present (keep it clean)
    if (hasMed) evolvedOut.signals = evolvedOut.signals.filter(s => s !== "MODEL_DRIFT_MED");
  } else if (mag > 0.6) {
    if (!hasMed && !hasHigh) evolvedOut.signals.push("MODEL_DRIFT_MED");
  }
} catch (_) {}



// ------------------------------------------------------------
// PHASE MEMORY PERSIST
// ------------------------------------------------------------
const finalPhase = (evolvedOut?.meta?.phase || phase || "PRE").toUpperCase();
const phaseKey = phaseKeyFor(matchId, finalPhase);
const latestKey = cacheKey; // intel/context/<matchId>/latest.json

// ------------------------------------------------------------
// INTEL WRITE GUARD (reduce R2 writes)
// ------------------------------------------------------------
const intelSignature = [
  evolvedOut.basic?.scoreHome ?? 0,
  evolvedOut.basic?.scoreAway ?? 0,
  evolvedOut.meta?.phase ?? "PRE",
  evolvedOut.context?.momentum ?? "UNKNOWN",
  evolvedOut.context?.volatility ?? "UNKNOWN"
].join("|");

const sigKey = `intel/context/${matchId}/last-sig.txt`;

let prevSig = null;

try {
  prevSig = await env.AI_STATE.get(sigKey);
} catch (_) {}

if (prevSig === intelSignature) {
  return evolvedOut;
}

// ensure meta.phase is consistent
evolvedOut.meta = evolvedOut.meta || {};
evolvedOut.meta.phase = finalPhase;

try {
  await env.AI_STATE.put(
    latestKey,
    JSON.stringify(evolvedOut),
    { httpMetadata: { contentType: "application/json" } }
  );
try {
  await env.AI_STATE.put(sigKey, intelSignature);
} catch (_) {}
  console.log("[DRIFT]", matchId, JSON.stringify(evolvedOut.drift));
  await env.AI_STATE.put(
    phaseKey,
    JSON.stringify(evolvedOut),
    { httpMetadata: { contentType: "application/json" } }
  );

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

// ------------------------------------------------------------
// BASELINE CLEANUP ON FINAL
// ------------------------------------------------------------
if (finalPhase === "FINAL") {
  try {
    await env.AI_STATE.delete(
      `intel/context/${matchId}/baseline.json`
    );
    console.log("[BASELINE CLEARED]", matchId);
  } catch (e) {
    console.log("[BASELINE CLEAR FAIL]", e);
  }
}

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