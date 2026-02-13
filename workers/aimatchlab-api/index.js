import { runAiEngine } from "./modules/ai-core/index.js";

// AIMATCHLAB – UNIFIED API WORKER (FULL PRODUCTION)

import { handleValue } from "./modules/valueEngine.js";
import { handleOdds } from "./modules/oddsEngine.js";

export default {
  async fetch(request, env) {

    // UNIVERSAL CORS HANDLER (LOCAL + PROD SAFE)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    const url = new URL(request.url);
    const pathname = url.pathname;

    // VERSION
    if (pathname === "/version.json") {
      return json({
        ok: true,
        service: "aimatchlab-api",
        version: "v2.3.8-production"
      });
    }

    // FIXTURES
    if (pathname === "/fixtures") {
      return handleFixtures(url, env);
    }

    if (pathname === "/fixtures-runtime") {
      return handleFixturesRuntime(url, env);
    }

    // VALUE READ
    if (pathname === "/value-picks") {
      return handleValuePicks(url, env);
    }

    // VALUE ENGINE
    if (pathname.startsWith("/value/")) {
      return handleValue(request, env);
    }

    // ODDS ENGINE
    if (pathname === "/odds" || pathname.startsWith("/odds/")) {
      return handleOdds(request, env);
    }

    // HEALTH
    if (pathname === "/aiml-health.json") {
      return handleHealth(url, env);
    }

    

    // =====================================================
    // AI-FIRST MATCH DETAILS
    // =====================================================
    if (url.pathname === "/v1/match/details" && request.method === "GET") {

      const id = url.searchParams.get("id");
      if (!id) return json({ ok:false, error:"missing_id" }, 400);

      const list = await env.AIML_INGESTION_KV.list({ prefix: "FIXTURES:" });
      let match = null;

      for (const k of list.keys) {
        const bucket = await env.AIML_INGESTION_KV.get(k.name, "json");
        if (!bucket || !bucket.matches) continue;

        const found = bucket.matches.find(m => String(m.id) === String(id));
        if (found) {
          match = found;
          break;
        }
      }

      if (!match) return json({ ok:false, error:"match_not_found" }, 404);

      let aiProfile = null;
      try {
        if (typeof runAiEngine === "function") {
          console.log("AI INPUT", {
            league: match.leagueSlug,
            season: "2025-2026"
        });

           aiProfile = await runAiEngine({
             id: match.id,
             league: match.leagueSlug,
             home: match.home,
             away: match.away,
             status: match.status,
             minute: match.minute || null,
             scoreHome: match.scoreHome,
             scoreAway: match.scoreAway,
             season: "2025-2026"
           }, env);

        }
      } catch (e) {
        console.error("AI ENGINE ERROR:", e);
        return json({ ok:false, error:"ai_engine_failed", message:String(e) }, 500);
      }  
      return json({
        ok: true,
        basic: match,
        fullAiProfile: aiProfile
      });
    }

    if (url.pathname === "/v1/match/details/seed" && request.method === "POST") {
      return json({ ok:true, seeded:true });
    }

    // =====================================================
    // AI PERFORMANCE EXPORT (R2)
    // =====================================================
    if (url.pathname === "/v1/ai/performance/export/range" && request.method === "GET") {

      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!from || !to) return json({ ok:false, error:"missing_range" }, 400);

      const rows = ["date,matchId"];
      const list = await env.AIMATCHLAB_INTEL.list({ prefix:"evaluation/" });

      for (const obj of (list.objects || [])) {
        const parts = obj.key.split("/");
        if (parts.length < 3) continue;

        const date = parts[1];
        if (date < from || date > to) continue;

        rows.push(`${date},${parts[2].replace(".json","")}`);
      }

      return new Response(rows.join("\n"), {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "text/csv",
          "Content-Disposition": "attachment; filename=ai-performance.csv"
        }
      });
    }


    return json({ ok: false, error: "Not found" }, 404);
  }
};

async function handleFixtures(url, env) {
  const dayKey = url.searchParams.get("date") || dayKeyGR();

  const raw =
    await safeKVGet(env, `FIXTURES:DATE:${dayKey}`) ||
    await safeKVGet(env, `FIXTURES:STAGING:DATE:${dayKey}`);

  if (!raw || !Array.isArray(raw.matches)) {
    return json({ ok: true, date: dayKey, total: 0, matches: [] });
  }

  return json({
    ok: true,
    date: dayKey,
    total: raw.matches.length,
    matches: raw.matches
  });
}

async function handleFixturesRuntime(url, env) {
  const mode = (url.searchParams.get("mode") || "today").toLowerCase();
  const dayKey = url.searchParams.get("date") || dayKeyGR();

  const raw =
    await safeKVGet(env, `FIXTURES:DATE:${dayKey}`) ||
    await safeKVGet(env, `FIXTURES:STAGING:DATE:${dayKey}`);

  if (!raw || !Array.isArray(raw.matches)) {
    return json({ ok: true, mode, date: dayKey, total: 0, matches: [] });
  }

  const now = Date.now();
  const out = [];

  for (const m of raw.matches) {
    const status = String(m.status || "").toUpperCase();
    const kickoff = Number(m.kickoff_ms || 0);

    const isLive = status.includes("IN_PROGRESS");
    const isFinal = status.includes("FINAL");
    const isScheduled = status.includes("SCHEDULED");

    if (mode === "live" && isLive) out.push(m);
    else if (mode === "active" && (isScheduled || isFinal)) out.push(m);
    else if (mode === "today") {
      if (isScheduled || isLive) out.push(m);
      if (isFinal && now - kickoff < 10 * 60 * 1000) out.push(m);
    }
  }

  return json({ ok: true, mode, date: dayKey, total: out.length, matches: out });
}

async function handleValuePicks(url, env) {
  const dayKey = url.searchParams.get("date") || dayKeyGR();
  const raw = await safeKVGet(env, `VALUE:SUMMARY:${dayKey}`);

  if (raw && Array.isArray(raw.items)) {
    return json({
      ok: true,
      date: dayKey,
      total: raw.items.length,
      items: raw.items
    });
  }

  return json({ ok: true, date: dayKey, total: 0, items: [] });
}

async function handleHealth(url, env) {
  const dayKey = url.searchParams.get("date") || dayKeyGR();
  const raw =
    await safeKVGet(env, `FIXTURES:DATE:${dayKey}`) ||
    await safeKVGet(env, `FIXTURES:STAGING:DATE:${dayKey}`);

  return json({
    ok: true,
    date: dayKey,
    fixtures: raw?.matches?.length || 0
  });
}

async function safeKVGet(env, key) {
  try {
    const str = await env.AIML_INGESTION_KV.get(key);
    if (!str) return null;
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function dayKeyGR(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Athens",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}


function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
