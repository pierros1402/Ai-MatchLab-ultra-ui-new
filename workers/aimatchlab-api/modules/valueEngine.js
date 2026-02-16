// ============================================================
// AIMATCHLAB — VALUE ENGINE v7.0 (AI CORE 2.5 COMPATIBLE)
// Month-based R2 schema + Tier/Risk modeling
// ============================================================

export async function handleValue(req, env) {

  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname.endsWith("/run")) {
    return runValueEngine(env, url);
  }

  if (pathname.endsWith("/eval")) {
    return json({ ok: true, eval: true });
  }

  return json({ ok: false, error: "invalid_value_route" }, 404);
}

// ------------------------------------------------------------

async function runValueEngine(env, url) {

  const date = url.searchParams.get("date") || isoToday();
  const force = url.searchParams.get("force") === "1";

  const summaryKey = `VALUE:SUMMARY:${date}`;
  const statKey    = `VALUE:STAT:DATE:${date}`;

  if (!force) {
    const exists = await env.AIML_INGESTION_KV.get(summaryKey);
    if (exists) {
      return json({ ok: true, skipped: "already_generated", date });
    }
  }

  const fixturesRaw =
    await env.AIML_INGESTION_KV.get(`FIXTURES:DATE:${date}`)
    || await env.AIML_INGESTION_KV.get(`FIXTURES:STAGING:DATE:${date}`);

  if (!fixturesRaw) {
    return json({ ok: false, reason: "no_fixtures" });
  }

  let fixtures;
  try {
    fixtures = JSON.parse(fixturesRaw);
  } catch {
    return json({ ok: false, reason: "invalid_fixtures_json" });
  }

  const matches = Array.isArray(fixtures.matches) ? fixtures.matches : [];

  const items = [];
  const counters = {
    total: matches.length,
    noR2: 0,
    noModeling: 0,
    skippedFinal: 0,
    produced: 0
  };

  const month = date.slice(0, 7); // YYYY-MM

  for (const m of matches) {

    if (!m || !m.id || !m.leagueSlug) continue;

    const status = String(m.status || "").toUpperCase();

    if (status.includes("FINAL")) {
      counters.skippedFinal++;
      continue;
    }

    const base = `ai/context/${month}/${m.leagueSlug}/${m.id}/`;

    let aiRaw =
      await env.R2_INTEL.get(base + "pre.json")
      || await env.R2_INTEL.get(base + "final.json");

    if (!aiRaw) {
      counters.noR2++;
      continue;
    }

    let aiData;
    try {
      aiData = JSON.parse(await aiRaw.text());
    } catch {
      counters.noModeling++;
      continue;
    }

    const modeling = aiData?.profile?.modeling;

    if (!modeling) {
      counters.noModeling++;
      continue;
    }

    const picks = buildPicksFromTier(modeling);

    for (const p of picks) {
      items.push({
        matchId: String(m.id),
        leagueSlug: m.leagueSlug,
        leagueName: m.leagueName || "",
        kickoff: m.kickoff || "",
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
    createdAt: Date.now(),
    totalMatches: counters.total,
    producedItems: counters.produced,
    debug: counters,
    items
  };

  await env.AIML_INGESTION_KV.put(summaryKey, JSON.stringify(payload));
  await env.AIML_INGESTION_KV.put(statKey, JSON.stringify(payload));

  return json({
    ok: true,
    date,
    produced: counters.produced,
    debug: counters
  });
}

// ------------------------------------------------------------
// AI CORE 2.5 Modeling Logic
// ------------------------------------------------------------

function buildPicksFromTier(modeling) {

  const picks = [];

  const tier = modeling.tier || 0;
  const upset = modeling?.risk?.upsetIndex ?? 50;
  const draw  = modeling?.risk?.drawIndex ?? 50;

  // Strong structural edge
  if (tier >= 4 && upset < 45) {
    picks.push({
      market: "1X2",
      side: "AWAY",
      tier: tier >= 5 ? "HIGH" : "MEDIUM",
      percent: calibrate(tier)
    });
  }

  // High draw probability scenario
  if (draw >= 60) {
    picks.push({
      market: "DRAW",
      side: "DRAW",
      tier: draw >= 70 ? "HIGH" : "MEDIUM",
      percent: 72
    });
  }

  return picks;
}

function calibrate(tier) {
  return Math.min(75 + tier * 3, 90);
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
