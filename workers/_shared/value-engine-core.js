
// ============================================================
// AIMATCHLAB — VALUE ENGINE CORE v3 (Full AI Qualitative)
// No numeric rates • No market caps • Deterministic inference
// ============================================================

export async function runValueEngineCore(env, date, options = {}) {

  const force = options.force === true;

  const summaryKey = `VALUE:SUMMARY:${date}`;
  const statKey = `VALUE:STAT:DATE:${date}`;

  if (!force) {
    const exists = await env.AIML_INGESTION_KV.get(summaryKey);
    if (exists) {
      return { ok: true, skipped: "already_generated", date };
    }
  }

  let fixtures =
    await env.AIML_INGESTION_KV.get(`FIXTURES:DATE:${date}`, { type: "json" });

  if (!fixtures) {
    fixtures =
      await env.AIML_INGESTION_KV.get(`FIXTURES:STAGING:DATE:${date}`, { type: "json" });
  }

  if (!fixtures?.matches?.length) {
    return { ok: false, error: "no_fixtures", date };
  }

  const matches = fixtures.matches;

  const items = [];
  const counters = {
    total: matches.length,
    noR2: 0,
    noModeling: 0,
    produced: 0
  };

  for (const m of matches) {

    if (!m || m.status !== "STATUS_SCHEDULED") continue;

    const month = date.slice(0, 7);
    const r2Key = `ai/context/${month}/${m.leagueSlug}/${m.id}/pre.json`;

    const aiRaw = await env.R2_INTEL.get(r2Key);

    if (!aiRaw) {
      counters.noR2++;
      continue;
    }

    const aiData = await aiRaw.json();
    const modeling = aiData?.modeling;

    if (!modeling) {
      counters.noModeling++;
      continue;
    }

    const picks = buildPicksPolicyV3(modeling);

    if (!picks.length) continue;

    for (const p of picks) {
      items.push({
        matchId: m.id,
        leagueSlug: m.leagueSlug,
        home: m.home,
        away: m.away,
        market: p.market,
        pick: p.side,
        confidence: p.tier,
        score: p.percent
      });
    }

    counters.produced += picks.length;
  }

  const payload = {
    date,
    totalMatches: counters.total,
    producedItems: counters.produced,
    debug: counters,
    items
  };

  await env.AIML_INGESTION_KV.put(summaryKey, JSON.stringify(payload));
  await env.AIML_INGESTION_KV.put(statKey, JSON.stringify(payload));

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

  const momentumState = momentum.state || "neutral";

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
  // BTTS INFERENCE
  // =========================

  if (goalRisk === "aggressive" || goalRisk === "chaotic") {
    picks.push({
      market: "BTTS",
      side: "YES",
      percent: volatility === "high" ? 86 : 80,
      tier: volatility === "high" ? "HIGH" : "MEDIUM"
    });
  }

  // =========================
  // 1X2 INFERENCE
  // =========================

  if (winPaths?.home && upsetIndex < 45 && pressure === "high") {
    picks.push({
      market: "1X2",
      side: "HOME",
      percent: tier >= 5 ? 86 : 80,
      tier: tier >= 5 ? "HIGH" : "MEDIUM"
    });
  }

  if (drawIndex >= 70 && volatility !== "high") {
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

  let filtered = [...picks];

  const hasUnder =
    filtered.find(p => p.market === "O2.5" && p.side === "UNDER");

  const hasOver =
    filtered.find(p => p.market === "O2.5" && p.side === "OVER");

  const hasBtts =
    filtered.find(p => p.market === "BTTS");

  // UNDER + BTTS remove BTTS
  if (hasUnder && hasBtts) {
    filtered = filtered.filter(p => p.market !== "BTTS");
  }

  // Over medium + BTTS medium remove BTTS
  if (hasOver && hasOver.tier === "MEDIUM" && hasBtts?.tier === "MEDIUM") {
    filtered = filtered.filter(p => p.market !== "BTTS");
  }

  return filtered;
}
