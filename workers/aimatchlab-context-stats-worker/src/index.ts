export default {
  async fetch(request: Request, env: any) {
    const url = new URL(request.url);
    const date = url.searchParams.get("date") || new Date().toISOString().slice(0,10);

    // Collect all context objects for the date
    const list = await env.AIMATCHLAB_INTEL.list({
      prefix: "intel/context/"
    });

    const bySignal: any = {
      importance: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      fatigue: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      absences: { HIGH: 0, MEDIUM: 0, LOW: 0 },
      rotationRisk: { HIGH: 0, MEDIUM: 0, LOW: 0 }
    };

    let matches = 0;

    for (const obj of list.objects || []) {
      if (!obj.key.endsWith("/latest.json")) continue;

      const raw = await env.AIMATCHLAB_INTEL.get(obj.key);
      if (!raw) continue;

      let ctx;
      try { ctx = JSON.parse(raw); } catch { continue; }

      // Exclude cups & friendlies by leagueSlug if present
      const slug = String(ctx?.leagueSlug || "");
      if (/(cup|copa|coppa|taca|beker|friendly)/i.test(slug)) continue;

      matches++;

      for (const sig of Object.keys(bySignal)) {
        const v = ctx.signals?.[sig];
        if (v && bySignal[sig][v] !== undefined) {
          bySignal[sig][v]++;
        }
      }
    }

    const payload = {
      date,
      matches,
      bySignal,
      generatedAt: Date.now()
    };

    // Write to KV with TTL (72 hours)
    await env.AIMATCHLAB_KV_CORE.put(
      `CONTEXT:STATS:DATE:${date}`,
      JSON.stringify(payload, null, 2),
      { expirationTtl: 72 * 3600 }
    );

    return new Response(JSON.stringify({ ok: true, payload }, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
};
