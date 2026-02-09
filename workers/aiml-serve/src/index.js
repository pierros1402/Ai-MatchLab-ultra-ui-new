export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const date =
      url.searchParams.get("date") ||
      new Date().toISOString().slice(0, 10);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Safety check for KV binding
      if (!env.AIML_INGESTION_KV) {
        return new Response(
          JSON.stringify({ ok: false, error: "KV_NOT_BOUND" }),
          {
            status: 500,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          }
        );
      }

      const key = `FIXTURES:DATE:${date}`;

      // Always read as JSON
      const raw = await env.AIML_INGESTION_KV.get(key, {
        type: "json"
      });

      if (!raw) {
        return new Response(
          JSON.stringify({
            ok: false,
            message: "No fixtures found",
            date
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          }
        );
      }

      return new Response(
        JSON.stringify({
          ok: true,
          date,
          total: Array.isArray(raw.matches)
            ? raw.matches.length
            : 0,
          matches: raw.matches || raw
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: err?.message || "SERVER_ERROR"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        }
      );
    }
  }
};
