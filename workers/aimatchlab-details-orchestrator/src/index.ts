export default {
  async fetch(request: Request, env: any) {

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const matchId = url.searchParams.get("matchId");

    if (!matchId) {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing matchId" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const out: any = {
      matchId,
      generatedAt: Date.now(),
      sources: {},
      facts: null,
      context: null,
      referee: null,
      narrative: []
    };

    // ---- FACTS ----
    try {
      const factsRaw = await env.AIMATCHLAB_INTEL.get(`stats/match/${matchId}/facts.json`);
      if (factsRaw) {
        out.facts = JSON.parse(factsRaw);
        out.sources.facts = "R2:stats/match";
      }
    } catch {}

    // ---- CONTEXT ----
    try {
      const ctxRaw = await env.AIMATCHLAB_INTEL.get(`intel/context/${matchId}/latest.json`);
      if (ctxRaw) {
        out.context = JSON.parse(ctxRaw);
        out.sources.context = "R2:intel/context";
      }
    } catch {}

    // ---- REFEREE ----
    try {
      const refId = out?.facts?.refereeId;
      if (refId) {
        const refRaw = await env.AIMATCHLAB_INTEL.get(`stats/referee/${refId}.json`);
        if (refRaw) {
          out.referee = JSON.parse(refRaw);
          out.sources.referee = "R2:stats/referee";
        }
      }
    } catch {}

    // ---- NARRATIVE ----
    if (out.facts?.standings) {
      const h = out.facts.standings.homePos;
      const a = out.facts.standings.awayPos;
      if (Number.isFinite(h) && Number.isFinite(a)) {
        out.narrative.push(`Standings: Home ${h}, Away ${a}`);
      }
    }

    if (out.context?.signals) {
      for (const [k, v] of Object.entries(out.context.signals)) {
        if (v === "HIGH") {
          out.narrative.push(`High ${k} signal detected`);
        }
      }
    }

    if (out.referee?.tendency === "STRICT") {
      out.narrative.push("Referee profile: strict (above-average cards)");
    }

    return new Response(
      JSON.stringify({ ok: true, details: out }, null, 2),
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  }
};
