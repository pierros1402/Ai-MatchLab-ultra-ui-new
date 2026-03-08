// ============================================================
// AIMATCHLAB — VALUE ENGINE CORE v3 (Full AI Qualitative)
// + INTEL STABILITY FUSION (v3.1)
// Deterministic inference with uncertainty weighting
// ============================================================

export async function runValueEngineCore(env, date, options = {}) {

  const force = options.force === true;

  const summaryKey = `VALUE:SUMMARY:${date}`;
  const statKey = `VALUE:STAT:DATE:${date}`;
// ------------------------------------------------------------
// LOAD FIXTURES FROM KV
// ------------------------------------------------------------
const raw =
  await env.AIML_INGESTION_KV.get(`FIXTURES:STAGING:DATE:${date}`)
  || await env.AIML_INGESTION_KV.get(`FIXTURES:DATE:${date}`);

if (!raw) {
  return { ok:false, error:"fixtures_missing", date };
}

const fixtures = JSON.parse(raw);
const matches = fixtures.matches || [];
  if (!force) {
    const exists = await env.AIML_INGESTION_KV.get(summaryKey);
    if (exists) {
      return { ok: true, skipped: "already_generated", date };
    }
  }

  

  const items = [];
  const counters = {
    total: matches.length,
    noR2: 0,
    noModeling: 0,
    produced: 0
  };

  // ============================================================
  // MAIN LOOP
  // ============================================================

  const month = date.slice(0, 7);

  for (const m of matches) {

    if (!m || m.status !== "STATUS_SCHEDULED") continue;
    const r2Key = `intel/context/${m.id}/latest.json`;

    const aiRaw = await env.AI_STATE.get(r2Key);

    if (!aiRaw || !aiRaw.body) {
      counters.noR2++;
      continue;
    }

    let aiData;

    try {
      const text = await aiRaw.text();
      if (!text) {
        counters.noR2++;
        continue;
      }
      aiData = JSON.parse(text);
    } catch {
      counters.noR2++;
      continue;
    }

    const modeling = aiData?.modeling;

    if (!modeling) {
      counters.noModeling++;
      continue;
    }
    
    // Skip weak modeling tiers early
    if (modeling?.tier && modeling.tier < 4) {
      counters.noModeling++;
      continue;
    }
// ------------------------------------------------------------
// LOAD MATCH INTEL (stability + drift fusion - SAFE)
// ------------------------------------------------------------
let stability = 1;
let driftMag = 0;
let modelEdgeScore = 25;

try {
  const intelKey = `intel/context/${m.id}/latest.json`;
  const intelObj = await env.AI_STATE.get(intelKey);

  if (intelObj) {
    const intel = await intelObj.json();

    const s = Number(intel?.model?.stability);
    if (!isNaN(s)) {
      stability = Math.max(0, Math.min(1, s));
    }

    const d = Number(intel?.drift?.magnitude);
    if (!isNaN(d)) {
      driftMag = d;
    }

    const edge = Number(intel?.valueStructural?.modelEdgeScore);
    if (!isNaN(edge)) {
      modelEdgeScore = edge;
    }
  }
} catch (_) {}

 // ------------------------------------------------------------
 // BUILD PICKS (AI QUALITATIVE POLICY)
 // ------------------------------------------------------------
    const picks = buildPicksPolicyV3(modeling);

    if (!picks.length) continue;

    // limit picks per match
    const limitedPicks = picks.slice(0, 3);

    for (const p of limitedPicks) {

// -------------------------------
  // BASE SCORE
  // -------------------------------
  let baseScore = p.percent;
  let finalTier = p.tier || "MEDIUM";
  // -------------------------------
  // STRUCTURAL EDGE MODULATION
  // -------------------------------
  if (modelEdgeScore < 15) {
    continue; // weak structural edge
  }

  if (modelEdgeScore > 60) {
    baseScore = baseScore * 1.10;
  } else if (modelEdgeScore > 35) {
    baseScore = baseScore * 1.05;
  }

  // -------------------------------
  // DRIFT GATE (REGIME CONTROL)
  // -------------------------------
  if (driftMag > 1.2) {
    continue;
  }

  if (driftMag > 0.8) {
    if (finalTier === "HIGH") {
      finalTier = "MEDIUM";
    } else if (finalTier === "MEDIUM") {
      continue;
    }
  }

  // -------------------------------
  // STABILITY GATE
  // -------------------------------
  if (stability < 0.55) {
    continue;
  }

  if (stability < 0.75 && finalTier === "HIGH") {
    finalTier = "MEDIUM";
  }

  let finalScore = Math.round(baseScore * stability);

  // reject weak borderline edges
  if (finalScore < 72 && modelEdgeScore < 25) {
    continue;
  }

  items.push({
    matchId: m.id,
    leagueSlug: m.leagueSlug,
    home: m.home,
    away: m.away,
    market: p.market,
    pick: p.side,
    confidence: finalTier,
    score: finalScore,
    stability,
    driftMagnitude: driftMag,
    modelEdgeScore
  });
  }

}
counters.produced = items.length;

const payload = {
  date,
  totalMatches: counters.total,
  producedItems: counters.produced,
  debug: counters,
  items
};

try {
  await env.AIML_INGESTION_KV.put(summaryKey, JSON.stringify(payload));
  await env.AIML_INGESTION_KV.put(statKey, JSON.stringify(payload));
} catch (err) {
  console.warn("KV quota reached — skipping persist");
}

return {
  ok: true,
  date,
  produced: counters.produced,
  debug: counters
};
}


// ============================================================
// QUALITATIVE AI INFERENCE POLICY
// ============================================================

function buildPicksPolicyV3(modeling) {

  if (!modeling) return [];

  const picks = [];

  const {
    tier = 0,
    dna = {},
    risk = {},
    momentum = {},
    winPaths = {}
  } = modeling;

  if (tier < 4) return [];

  const tempo = dna.tempo || "balanced";
  const volatility = dna.volatility || "medium";
  const pressure = dna.pressure || "neutral";

  const goalRisk = risk.goalRisk || "balanced";
  const upsetIndex = risk.upsetIndex || 0;
  const drawIndex = risk.drawIndex || 0;

  // =========================
  // TOTALS INFERENCE
  // =========================

  let underSignals = 0;
  let overSignals = 0;

  if (goalRisk === "controlled") underSignals++;
  if (tempo === "slow") underSignals++;
  if (volatility === "low") underSignals++;

  if (goalRisk === "aggressive") overSignals++;
  if (goalRisk === "chaotic") overSignals += 2;
  if (tempo === "fast") overSignals++;
  if (volatility === "high") overSignals++;
  // =========================
  // O1.5
  // =========================

  if (overSignals >= 2 && underSignals === 0) {
    picks.push({
      market: "O1.5",
      side: "OVER",
      percent: 78 + overSignals * 3,
      tier: overSignals >= 3 ? "HIGH" : "MEDIUM"
    });
  }
  if (underSignals >= 2 && overSignals === 0) {
    picks.push({
      market: "O2.5",
      side: "UNDER",
      percent: 76 + underSignals * 4,
      tier: underSignals >= 3 ? "HIGH" : "MEDIUM"
    });
  }

  if (overSignals >= 2 && underSignals === 0) {
    picks.push({
      market: "O2.5",
      side: "OVER",
      percent: 76 + overSignals * 4,
      tier: overSignals >= 3 ? "HIGH" : "MEDIUM"
    });
  }
  // =========================
  // O3.5
  // =========================

  if (overSignals >= 3) {
    picks.push({
      market: "O3.5",
      side: "OVER",
      percent: Math.min(88, 82 + overSignals * 3),
      tier: overSignals >= 4 ? "HIGH" : "MEDIUM"
    });
  }

  if (underSignals >= 3 && overSignals === 0) {
    picks.push({
      market: "O3.5",
      side: "UNDER",
      percent: 78 + underSignals * 3,
      tier: underSignals >= 4 ? "HIGH" : "MEDIUM"
    });
  }
// =========================
// BTTS
// =========================

let bttsSignals = 0;

if (goalRisk === "aggressive") bttsSignals++;
if (goalRisk === "chaotic") bttsSignals += 2;
if (volatility === "high") bttsSignals++;

if (bttsSignals >= 2) {
  picks.push({
    market: "BTTS",
    side: "YES",
    percent: volatility === "high" ? 86 : 80,
    tier: volatility === "high" ? "HIGH" : "MEDIUM"
  });
}

  // =========================
  // 1X2
  // =========================

  if (winPaths?.home && upsetIndex < 45 && pressure === "high") {
    picks.push({
      market: "1X2",
      side: "HOME",
      percent: tier >= 5 ? 86 : 80,
      tier: tier >= 5 ? "HIGH" : "MEDIUM"
    });
  }

  if (drawIndex >= 80 && volatility === "low" && pressure !== "high") {
    picks.push({
      market: "1X2",
      side: "DRAW",
      percent: 78,
      tier: "MEDIUM"
    });
  }

  return resolveQualitativeConflicts(picks);
}


// ============================================================
// CONFLICT RESOLUTION
// ============================================================

function resolveQualitativeConflicts(picks) {

  if (!picks.length) return picks;

  // remove duplicate picks (same market + side)
  const unique = new Map();

  for (const p of picks) {
    const key = `${p.market}:${p.side}`;
    if (!unique.has(key)) {
      unique.set(key, p);
    }
  }

  let filtered = Array.from(unique.values());;

  const hasUnder =
    filtered.find(p => p.market === "O2.5" && p.side === "UNDER");

  const hasOver =
    filtered.find(p => p.market === "O2.5" && p.side === "OVER");

  const hasBtts =
    filtered.find(p => p.market === "BTTS");

  if (hasUnder && hasBtts) {
    filtered = filtered.filter(p => p.market !== "BTTS");
  }

  if (hasOver && hasOver.tier === "MEDIUM" && hasBtts?.tier === "MEDIUM") {
    filtered = filtered.filter(p => p.market !== "BTTS");
  }

  // ------------------------------------------------------------
  // KEEP STRONGEST PICK PER MARKET
  // ------------------------------------------------------------
  const bestByMarket = new Map();

  for (const p of filtered) {

    const prev = bestByMarket.get(p.market);

    if (!prev) {
      bestByMarket.set(p.market, p);
      continue;
    }

    // choose stronger inference
    if ((p.score ?? p.percent ?? 0) > (prev.score ?? prev.percent ?? 0)) {
      bestByMarket.set(p.market, p);
    }

  }

  return Array.from(bestByMarket.values());
}

