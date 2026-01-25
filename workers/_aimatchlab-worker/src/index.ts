export interface Env {
  AIMATCHLAB_KV_CORE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // =====================================================
    // KV PROBE (TEST ONLY)
    // =====================================================
    if (url.pathname === "/__kv_probe") {
      const payload = {
        ok: true,
        ts: Date.now()
      };

      // write
      await env.AIMATCHLAB_KV_CORE.put(
        "__probe__",
        JSON.stringify(payload)
      );

      // read
      const raw = await env.AIMATCHLAB_KV_CORE.get("__probe__");
      const value = raw ? JSON.parse(raw) : null;

      return new Response(
        JSON.stringify(
          {
            wrote: payload,
            read: value
          },
          null,
          2
        ),
        {
          headers: { "content-type": "application/json" }
        }
      );
    }

    // =====================================================
    // DEFAULT
    // =====================================================
    return new Response(
      JSON.stringify({ ok: true, service: "aimatchlab-worker" }),
      { headers: { "content-type": "application/json" } }
    );
  }
};
