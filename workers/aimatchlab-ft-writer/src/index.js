function seasonFromKickoffMs(ms) {
  const d = new Date(Number(ms));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1; // 1..12
  // season rollover: July (7)
  if (m >= 7) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // health
    if (url.pathname === "/health") {
      return json({ ok: true, service: "aimatchlab-ft-writer" });
    }

    // route
    if (req.method !== "POST" || url.pathname !== "/internal/ft/write") {
      return json({ ok: false, error: "not_found" }, 404);
    }

    // 🔒 secret gate
    const secret = req.headers.get("X-AIML-SECRET");
    if (!env.AIML_FT_SECRET || secret !== env.AIML_FT_SECRET) {
      return json({ ok: false, error: "forbidden" }, 403);
    }

    // body
    let payload;
    try {
      payload = await req.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }

    const id = String(payload?.id || "").trim();
    const leagueSlug = String(payload?.leagueSlug || "").trim();
    const kickoff_ms = Number(payload?.kickoff_ms || 0);

    if (!id) return json({ ok: false, error: "missing_id" }, 400);
    if (!leagueSlug) return json({ ok: false, error: "missing_leagueSlug" }, 400);
    if (!kickoff_ms) return json({ ok: false, error: "missing_kickoff_ms" }, 400);

    const season = seasonFromKickoffMs(kickoff_ms);

    // keys
    const kvKey = `MATCH:FT:${id}`;
    const r2Key = `ft/${leagueSlug}/${season}/matches/${id}.json`;

    const nowIso = new Date().toISOString();
    const out = {
      ...payload,
      migratedAt: payload.migratedAt || nowIso,
      kvKey,
      _archive: { r2Key, season, wroteAt: nowIso },
    };

    // 1) KV write (hot cache)
    await env.AIMATCHLAB_KV_CORE.put(kvKey, JSON.stringify(out));

    // 2) R2 write (archive)
    await env.AIML_ARCHIVE.put(r2Key, JSON.stringify(out, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });

    return json({
      ok: true,
      id,
      leagueSlug,
      season,
      kvKey,
      r2Key,
    });
  },
};
