
// AIMATCHLAB – UNIFIED API WORKER (FULL PRODUCTION)

import { handleValue } from "./modules/valueEngine.js";
import { handleOdds } from "./modules/oddsEngine.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // VERSION
    if (pathname === "/version.json") {
      return json({
        ok: true,
        service: "aimatchlab-api",
        version: "v2.3.0-production"
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

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
