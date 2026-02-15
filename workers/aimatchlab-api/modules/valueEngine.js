// ============================================================
// AIMATCHLAB — VALUE ENGINE v6.8 (R2 CORRECT PATH)
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

async function runValueEngine(env, url) {

  const date = url.searchParams.get("date") || isoToday();
  const force = url.searchParams.get("force") === "1";

  const summaryKey = `VALUE:SUMMARY:${date}`;
  const statKey = `VALUE:STAT:DATE:${date}`;

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

  for (const m of matches) {

    if (!m) continue;

    const st = String(m.status || "").toUpperCase();
    if (st.includes("FINAL")) continue;

    let aiData = null;

    try {
      const aiRaw = await env.R2_INTEL.get(
        `intel/context/${m.id}/latest.json`
      );

      if (!aiRaw) continue;

      const txt = await aiRaw.text();
      if (!txt) continue;

      aiData = JSON.parse(txt);

    } catch {
      continue;
    }

    const modeling = aiData?.profile?.modeling;
    if (!modeling) continue;

    const picks = buildDeterministicPicks(modeling);

    for (const p of picks) {
      items.push({
        matchId: String(m.id),
        leagueSlug: m.leagueSlug || "",
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
  }

  const payload = {
    date,
    createdAt: Date.now(),
    totalMatches: matches.length,
    producedItems: items.length,
    items
  };

  let kvWritten = true;

  try {
    await env.AIML_INGESTION_KV.put(summaryKey, JSON.stringify(payload));
    await env.AIML_INGESTION_KV.put(statKey, JSON.stringify(payload));
  } catch (e) {
    kvWritten = false;
    console.log("KV write skipped:", String(e));
  }

  return json({
    ok: true,
    date,
    produced: items.length,
    kvWritten
  });
}

function buildDeterministicPicks(modeling) {

  const picks = [];

  const ppgDiff = modeling.ppgDiff || 0;
  const scoringBias = modeling.scoringBias || 0;
  const defensiveBias = modeling.defensiveBias || 0;
  const gdDelta = modeling.gdDelta || 0;
  const positionGap = modeling.positionGap || 0;

  const msi =
      (ppgDiff * 2)
    + (gdDelta * 0.5)
    + (positionGap * 0.3)
    + (scoringBias * 0.2)
    + (defensiveBias * 0.2);

  const absMsi = Math.abs(msi);

  if (absMsi >= 3.5) {
    picks.push({
      market: "1X2",
      side: msi > 0 ? "HOME" : "AWAY",
      tier: absMsi >= 5.5 ? "HIGH" : absMsi >= 3.8 ? "MEDIUM" : "LOW",
      percent: calibrate(absMsi)
    });
  }

  return picks;
}

function calibrate(edge) {
  const normalized = Math.min(edge / 6, 1);
  return Math.round(70 + normalized * 20);
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
