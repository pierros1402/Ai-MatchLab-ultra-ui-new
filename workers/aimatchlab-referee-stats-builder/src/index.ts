export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    const refId = url.searchParams.get("refId");
    if (!refId) {
      return new Response(JSON.stringify({ ok: false, reason: "missing refId" }), { status: 400 });
    }

    // --- Load referee match history (from KV or external preloaded source)
    const raw = await env.AIMATCHLAB_KV_CORE.get(`REFEREE:MATCHES:${refId}`);
    if (!raw) {
      return new Response(JSON.stringify({ ok: false, reason: "referee_history_not_found" }), { status: 404 });
    }

    let matches;
    try {
      matches = JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_referee_history" }), { status: 500 });
    }

    let total = 0, cards = 0, penalties = 0, homeWins = 0, awayWins = 0;

    for (const m of matches) {
      if (!m) continue;
      total++;
      cards += Number(m.cards || 0);
      penalties += Number(m.penalties || 0);
      if (m.result === "H") homeWins++;
      if (m.result === "A") awayWins++;
    }

    const stats = {
      refId,
      generatedAt: Date.now(),
      matches: total,
      avgCards: total ? +(cards / total).toFixed(2) : 0,
      avgPenalties: total ? +(penalties / total).toFixed(2) : 0,
      homeWinRate: total ? +(homeWins / total).toFixed(2) : 0,
      awayWinRate: total ? +(awayWins / total).toFixed(2) : 0,
      tendency: (cards / (total || 1)) >= 5 ? "STRICT" : "NORMAL"
    };

    const key = `stats/referee/${refId}.json`;
    await env.AIMATCHLAB_INTEL.put(key, JSON.stringify(stats, null, 2));

    return new Response(JSON.stringify({ ok: true, stats }, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
};
