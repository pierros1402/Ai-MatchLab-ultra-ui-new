export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const key = `FIXTURES:DATE:${date}`;
    const raw = await env.AIML_INGESTION_KV.get(key);

    if (!raw) {
      return new Response(JSON.stringify({
        ok: false,
        message: "No fixtures found",
        date
      }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    return new Response(raw, {
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
};
