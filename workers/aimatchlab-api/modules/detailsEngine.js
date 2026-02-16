// ============================================================
// AIMATCHLAB — VALUE ENGINE (FINAL BALANCED VERSION)
// - Explicit resultBias (HOME / AWAY / NEUTRAL)
// - 1 pick per market family
// - No result conflicts (1X2 / DNB / DC exclusive)
// - Strict DRAW (very strong only)
// - O1.5 & BTTS HIGH only
// - Unders very strict
// - O/U 2.5–3.5 with close LOW↔MED gap
// ============================================================

export async function handleValue(req, env) {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname.endsWith("/run")) {
    return runValueEngine(env, url);
  }

  return json({ ok:false, error:"invalid_route" }, 404);
}

// ------------------------------------------------------------

async function runValueEngine(env, url){

  const date = url.searchParams.get("date") || isoToday();
  const force = url.searchParams.get("force") === "1";

  const summaryKey = `VALUE:SUMMARY:${date}`;
  const statKey    = `VALUE:STAT:DATE:${date}`;

  if (!force) {
    const exists = await env.AIML_INGESTION_KV.get(summaryKey);
    if (exists) return json({ ok:true, skipped:"already_generated", date });
  }

  const fixturesRaw =
    await env.AIML_INGESTION_KV.get(`FIXTURES:DATE:${date}`) ||
    await env.AIML_INGESTION_KV.get(`FIXTURES:STAGING:DATE:${date}`);

  if (!fixturesRaw) return json({ ok:false, error:"no_fixtures" });

  const fixtures = JSON.parse(fixturesRaw);
  const matches = Array.isArray(fixtures.matches) ? fixtures.matches : [];

  const items = [];
  const counters = {
    total: matches.length,
    noR2: 0,
    noModeling: 0,
    produced: 0
  };

  const month = date.slice(0,7);

  for (const m of matches) {

    if (!m?.id || !m.leagueSlug) continue;
    if (String(m.status||"").includes("FINAL")) continue;

    const base = `ai/context/${month}/${m.leagueSlug}/${m.id}/`;

    const aiRaw =
      await env.R2_INTEL.get(base + "pre.json") ||
      await env.R2_INTEL.get(base + "final.json");

    if (!aiRaw) { counters.noR2++; continue; }

    const aiData = JSON.parse(await aiRaw.text());
    const modeling = aiData?.profile?.modeling;

    if (!modeling) { counters.noModeling++; continue; }

    const picks = buildPicksPolicy(modeling);

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

  return json({ ok:true, date, produced:counters.produced, debug:counters });
}

// ------------------------------------------------------------
// MARKET POLICY
// ------------------------------------------------------------

function buildPicksPolicy(modeling){

  const picks = [];

  const tier = modeling.tier || 0;
  const upset = modeling.risk?.upsetIndex ?? 50;
  const draw  = modeling.risk?.drawIndex ?? 50;
  const vol   = String(modeling.dna?.volatility || "").toLowerCase();
  const bias  = modeling.resultBias || "NEUTRAL";

  // ---------------------------------------------------------
  // RESULT FAMILY (1X2 / DNB / DC) – mutually exclusive
  // ---------------------------------------------------------

  const strongSide = tier >= 4 && upset <= 40;
  const veryStrongExclude = tier >= 4 && upset <= 25;

  // DC
  if (veryStrongExclude && bias !== "NEUTRAL") {
    picks.push({
      market: "DC",
      side: bias === "HOME" ? "1X" : "X2",
      tier: tier >= 5 ? "HIGH" : "MEDIUM",
      percent: 85
    });
  }

  // DNB
  else if (strongSide && draw >= 60 && bias !== "NEUTRAL") {
    picks.push({
      market: "DNB",
      side: bias === "HOME" ? "1" : "2",
      tier: tier >= 5 ? "HIGH" : "MEDIUM",
      percent: 76
    });
  }

  // 1X2 side
  else if (strongSide && bias !== "NEUTRAL") {
    picks.push({
      market: "1X2",
      side: bias === "HOME" ? "1" : "2",
      tier: tier >= 5 ? "HIGH" : tier === 4 ? "MEDIUM" : "LOW",
      percent: 72 + (tier * 2)
    });
  }

  // VERY STRICT DRAW (only when no side bias)
else if (
  bias === "NEUTRAL" &&   // 🔒 μόνο αν δεν υπάρχει κατεύθυνση
  tier >= 4 &&
  draw >= 72 &&
  upset >= 45 &&
  vol !== "high"
) {
  picks.push({
    market: "1X2",
    side: "DRAW",
    tier: "MEDIUM",
    percent: 72
  });
}

  // ---------------------------------------------------------
  // BTTS – HIGH only
  // ---------------------------------------------------------
  if (tier >= 5 && draw >= 65) {
    picks.push({
      market: "BTTS",
      side: "YES",
      tier: "HIGH",
      percent: 80
    });
  }

  // ---------------------------------------------------------
  // O1.5 – HIGH only
  // ---------------------------------------------------------
  if (tier >= 5) {
    picks.push({
      market: "O1.5",
      side: "OVER",
      tier: "HIGH",
      percent: 82
    });
  }

  // ---------------------------------------------------------
  // O/U 2.5 – close LOW/MED spectrum
  // ---------------------------------------------------------
  if (tier >= 4 && draw >= 60) {
    picks.push({
      market: "O2.5",
      side: "OVER",
      tier: tier === 4 ? "MEDIUM" : "HIGH",
      percent: 74
    });
  }
  else if (tier === 3 && draw >= 58) {
    picks.push({
      market: "O2.5",
      side: "OVER",
      tier: "LOW",
      percent: 70
    });
  }

  // ---------------------------------------------------------
  // UNDER – very strict
  // ---------------------------------------------------------
  if (tier >= 5 && draw <= 40) {
    picks.push({
      market: "U2.5",
      side: "UNDER",
      tier: "HIGH",
      percent: 79
    });
  }

  return picks;
}

// ------------------------------------------------------------

function isoToday(){
  return new Date().toISOString().slice(0,10);
}

function json(obj,status=200){
  return new Response(JSON.stringify(obj),{
    status,
    headers:{ "content-type":"application/json" }
  });
}
