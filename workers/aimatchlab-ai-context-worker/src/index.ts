export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] !== "context" || !parts[1]) {
      return new Response(JSON.stringify({ ok: false, reason: "use /context/:matchId" }), { status: 400 });
    }

    const matchId = parts[1];
    const force = url.searchParams.get("force") === "true";

    const latestKey = `intel/context/${matchId}/latest.json`;
    const historyKey = `intel/context/${matchId}/history/${Date.now()}.json`;

    if (!force) {
      const existing = await env.AIMATCHLAB_INTEL.get(latestKey);
      if (existing) {
        return new Response(existing, { headers: { "content-type": "application/json" } });
      }
    }

    // ---- AI Context (baseline – extendable later) ----
    const context = {
      matchId,
      generatedAt: Date.now(),
      aiGenerated: true,
      confidence: "MEDIUM",
      signals: {
        importance: "MEDIUM",
        fatigue: "LOW",
        absences: "LOW",
        rotationRisk: "LOW",
        derby: false
      },
      notes: {
        importance: "No strong league pressure indicators",
        fatigue: "Normal rest window",
        absences: "No strong indicators of multiple absences",
        rotationRisk: "Rotation not expected"
      }
    };

    await env.AIMATCHLAB_INTEL.put(latestKey, JSON.stringify(context, null, 2));
    await env.AIMATCHLAB_INTEL.put(historyKey, JSON.stringify(context, null, 2));

    return new Response(JSON.stringify({ ok: true, context }, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
};
