/**
 * AIMatchLab Absences Worker (v1.3 - KV DETAILS shell, no worker->worker fetch)
 *
 * Fixes Cloudflare 1042 (blocked worker->worker fetch) by reading match shell directly
 * from AIMATCHLAB_DETAILS KV:
 *   key: DETAILS:match:<matchId>
 *
 * Writes absences snapshot placeholder to:
 * - KV: AIMATCHLAB_ABSENCES  key ABS:match:<matchId>
 * - R2: AIML_ARCHIVE bucket  intel/match/<matchId>/latest.json (+ dated snapshot)
 */

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") {
      return new Response("", { status: 204, headers: corsHeaders(req) });
    }

    try {
      if (path === "/health") {
        return json(
          { ok: true, service: "aimatchlab-absences-worker", version: "v1.3-kvdetails", time: new Date().toISOString() },
          200,
          corsHeaders(req)
        );
      }

      if (path === "/debug") {
        return json(
          {
            ok: true,
            service: "aimatchlab-absences-worker",
            version: "v1.3-kvdetails",
            hasABS_KV: !!env?.AIMATCHLAB_ABSENCES,
            hasDETAILS_KV: !!env?.AIMATCHLAB_DETAILS,
            hasR2: !!env?.AIML_ARCHIVE,
          },
          200,
          corsHeaders(req)
        );
      }

      if (path === "/v1/match/absences") return handleGetAbsences(req, env);

      if (path === "/v1/match/absences/enrich") {
        if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405, corsHeaders(req));
        return handleEnrichAbsences(req, env);
      }

      return json({ ok: false, error: "not_found", path }, 404, corsHeaders(req));
    } catch (e) {
      return json({ ok: false, error: "runtime_error", message: String(e?.message || e) }, 500, corsHeaders(req));
    }
  },
};

function corsHeaders(req) {
  const origin = req.headers.get("Origin") || "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400",
    "content-type": "application/json; charset=utf-8",
  };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj, null, 2), { status, headers });
}

function kvAbsKey(matchId) {
  return `ABS:match:${matchId}`;
}

function kvDetailsKey(matchId) {
  return `DETAILS:match:${matchId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function dayKeyUTC(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function r2KeyMatchIntelLatest(matchId) {
  return `intel/match/${matchId}/latest.json`;
}

function r2KeyMatchIntelDated(matchId, day) {
  return `intel/match/${matchId}/date=${day}.json`;
}

async function safeKvGetJson(ns, key) {
  try {
    if (!ns) return null;
    return await ns.get(key, "json");
  } catch {
    return null;
  }
}

async function safeKvPutJson(ns, key, value, ttlSec) {
  try {
    if (!ns) return false;
    await ns.put(key, JSON.stringify(value), ttlSec ? { expirationTtl: ttlSec } : undefined);
    return true;
  } catch {
    return false;
  }
}


async function r2GetJsonSafe(env, key) {
  try {
    if (!env?.AIML_ARCHIVE) return { ok: false, error: "no_r2_binding", key };
    const obj = await env.AIML_ARCHIVE.get(key);
    if (!obj) return { ok: false, error: "not_found", key };
    const txt = await obj.text();
    try {
      return { ok: true, key, data: JSON.parse(txt) };
    } catch (e) {
      return { ok: false, error: "invalid_json", key, message: String(e?.message || e), preview: txt.slice(0, 200) };
    }
  } catch (e) {
    return { ok: false, error: "r2_get_failed", key, message: String(e?.message || e) };
  }
}

async function r2PutJsonSafe(env, key, obj) {
  try {
    if (!env?.AIML_ARCHIVE) return { ok: false, error: "no_r2_binding", key };
    await env.AIML_ARCHIVE.put(key, JSON.stringify(obj, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    return { ok: true, key };
  } catch (e) {
    return { ok: false, error: "r2_put_failed", key, message: String(e?.message || e) };
  }
}

function buildPlaceholderAbsences({ matchId, leagueSlug, season, home, away, status, kickoff_ms }) {
  return {
    ok: true,
    type: "absences_snapshot",
    status: "PLACEHOLDER",
    updatedAt: Date.now(),
    match: {
      id: String(matchId),
      leagueSlug: leagueSlug ?? null,
      season: season ?? null,
      status: status ?? null,
      kickoff_ms: kickoff_ms ?? null,
      home: home ?? null,
      away: away ?? null,
    },
    absences: {
      home: [],
      away: [],
      uiHint: "Absences not yet available — placeholder (waiting enrichment).",
    },
    sources: [],
    note: "Placeholder absences snapshot. Enrichment from trusted sources will populate this.",
  };
}

async function handleGetAbsences(req, env) {
  const url = new URL(req.url);
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return json({ ok: false, error: "missing_id" }, 400, corsHeaders(req));

  // 1) Try KV first
  const key = kvAbsKey(id);
  const cached = await safeKvGetJson(env?.AIMATCHLAB_ABSENCES, key);

  if (cached && cached.ok) {
    return json({ ...cached, cache: "HIT" }, 200, corsHeaders(req));
  }

  // 2) Fallback to R2 (our real DB)
  const r2Key = r2KeyMatchIntelLatest(id);
  const r2 = await r2GetJsonSafe(env, r2Key);
  if (r2.ok && r2.data && r2.data.ok) {
    return json({ ...r2.data, cache: "R2" }, 200, corsHeaders(req));
  }

  // 3) Final fallback placeholder
  const placeholder = buildPlaceholderAbsences({ matchId: id });

  // Best effort KV store (not required)
  await safeKvPutJson(env?.AIMATCHLAB_ABSENCES, key, placeholder, 60 * 60 * 24 * 7);

  return json({ ...placeholder, cache: "MISS" }, 200, corsHeaders(req));
}

async function handleEnrichAbsences(req, env) {
  let body = null;
  try { body = await req.json(); } catch { body = null; }

  const matchId = String(body?.matchId || "").trim();
  if (!matchId) return json({ ok: false, error: "missing_matchId" }, 400, corsHeaders(req));

  // Read match shell from DETAILS KV
  const detailsKey = kvDetailsKey(matchId);
  const details = await safeKvGetJson(env?.AIMATCHLAB_DETAILS, detailsKey);

  if (!details || !details.ok) {
    return json(
      {
        ok: false,
        error: "details_kv_missing",
        detailsKey,
        hint: "This matchId is not seeded in AIMATCHLAB_DETAILS yet. Run scheduler seed or call details /seed.",
      },
      404,
      corsHeaders(req)
    );
  }

  const shell = {
    matchId: String(details?.id || matchId),
    leagueSlug: details?.basic?.leagueSlug || null,
    season: body?.season ? String(body.season).trim() : null,
    status: details?.basic?.status || null,
    home: details?.basic?.home || null,
    away: details?.basic?.away || null,
    kickoff_ms: details?.basic?.kickoff_ms ?? null,
  };

  const snapshot = buildPlaceholderAbsences({
    matchId: shell.matchId,
    leagueSlug: shell.leagueSlug,
    season: shell.season,
    home: shell.home,
    away: shell.away,
    status: shell.status,
    kickoff_ms: shell.kickoff_ms,
  });

  // Write KV ABSENCES
  const kvOk = await safeKvPutJson(env?.AIMATCHLAB_ABSENCES, kvAbsKey(shell.matchId), snapshot, 60 * 60 * 24 * 14);

  // Write R2
  const day = dayKeyUTC(new Date());
  const r2Latest = await r2PutJsonSafe(env, r2KeyMatchIntelLatest(shell.matchId), snapshot);
  const r2Dated = await r2PutJsonSafe(env, r2KeyMatchIntelDated(shell.matchId, day), snapshot);

  // Debug marker
  await safeKvPutJson(env?.AIMATCHLAB_ABSENCES, "ABS:DEBUG:LAST_RUN", { ok: true, iso: nowIso(), matchId: shell.matchId }, 60 * 60 * 6);

  return json(
    {
      ok: true,
      service: "aimatchlab-absences-worker",
      version: "v1.3-kvdetails",
      matchId: shell.matchId,
      wrote: { kv: kvOk, r2: [r2Latest, r2Dated] },
      snapshot,
    },
    200,
    corsHeaders(req)
  );
}
