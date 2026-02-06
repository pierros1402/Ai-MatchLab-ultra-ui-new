// aimatchlab-match-intel-merger
// Version: v1.0.0
// Role: Merge per-domain intel files into intel/match/<id>/latest.json
// Compute-free, source-agnostic.

export default {
  async fetch(req, env) {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    let payload;
    try {
      payload = await req.json();
    } catch {
      return json({ status: "error", error: "Invalid JSON" }, 400);
    }

    const { matchId } = payload || {};
    if (!matchId) {
      return json({ status: "error", error: "matchId required" }, 400);
    }

    const base = `intel/match/${matchId}`;

    const domains = [
      { key: "stats", path: `${base}/stats.json` },
      { key: "absences", path: `${base}/latest.json` },
      { key: "location", path: `${base}/location.json` }
    ];

    const facts = {};
    const sources = {};

    for (const d of domains) {
      try {
        const obj = await env.AIMATCHLAB_R2.get(d.path);
        if (obj) {
          facts[d.key] = JSON.parse(await obj.text());
          sources[d.key] = { key: d.path };
        }
      } catch (_) {}
    }

    const latest = {
      status: "ok",
      matchId,
      facts,
      sources,
      meta: {
        generatedBy: "aimatchlab-match-intel-merger",
        updatedAt: new Date().toISOString()
      }
    };

    const outKey = `${base}/latest.json`;

    await env.AIMATCHLAB_R2.put(outKey, JSON.stringify(latest), {
      httpMetadata: { contentType: "application/json" }
    });

    return json({ status: "ok", written: outKey, domains: Object.keys(facts) });
  }
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}
