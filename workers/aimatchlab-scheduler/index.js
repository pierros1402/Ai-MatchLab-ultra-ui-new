import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";


const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const AI_ENGINE_URL =
  "https://aimatchlab-ai-engine.pierros1402.workers.dev";
const ATHENS_TZ = "Europe/Athens";
const FORCE_CLOSE_AFTER_HOURS = 6;

function dayKeyTZ(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;

  return `${y}-${m}-${d}`;
}

/* ================= CORS ================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

/* ================= DATE HELPERS ================= */

function shiftUTC(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatUTC(date) {
  return date.toISOString().slice(0, 10);
}

function athensDayFromKickoff(iso) {
  const d = new Date(iso);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATHENS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(d);
}

/* ================= KV HELPERS ================= */

async function getJson(env, key) {
  const raw = await env.AIML_INGESTION_KV.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function putJson(env, key, obj) {
  await env.AIML_INGESTION_KV.put(key, JSON.stringify(obj));
}

function keysForDay(day) {
  return {
    staging: `FIXTURES:STAGING:DATE:${day}`,
    final:   `FIXTURES:DATE:${day}`
  };
}

/* ================= NORMALIZE ================= */

function normalize(event, slug) {
  const comp = event.competitions?.[0];
  if (!comp) return null;

  const home = comp.competitors?.find(c => c.homeAway === "home");
  const away = comp.competitors?.find(c => c.homeAway === "away");

  if (!home || !away) return null;

  return {
    id: event.id,
    home: home.team?.displayName,
    away: away.team?.displayName,
    kickoff: event.date,
    kickoff_ms: new Date(event.date).getTime(),
    scoreHome: Number(home.score ?? 0),
    scoreAway: Number(away.score ?? 0),
    status: comp.status?.type?.name || "UNKNOWN",
    minute: comp.status?.displayClock || "",
    leagueSlug: slug,
    leagueName: LEAGUE_NAME_MAP[slug] || slug
  };
}

/* ================= INGESTION ================= */

async function fetchLeagueUTC(slug, utcDate) {
  const url = `${ESPN_BASE}/${slug}/scoreboard?dates=${utcDate.replace(/-/g,"")}`;
  const r = await fetch(url);
  if (!r.ok) return null;
  return await r.json();
}

async function ingestUTCWindow(env) {
  const now = new Date();
  const utcDays = [
    formatUTC(shiftUTC(now,-1)),
    formatUTC(now),
    formatUTC(shiftUTC(now,1))
  ];

  const bucketMaps = {};

  const CHUNK_SIZE = 12;
  const totalLeagues = LEAGUE_SEEDS.length;

  let startIndex = Number(
    await env.AIML_INGESTION_KV.get("INGEST:IDX") || 0
  );

  if (startIndex >= totalLeagues) startIndex = 0;

  const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLeagues);
  const slice = LEAGUE_SEEDS.slice(startIndex, endIndex);

  for (const slug of slice) {
    for (const utcDate of utcDays) {

      try {
        const data = await fetchLeagueUTC(slug, utcDate);
        if (!data?.events?.length) continue;

        for (const event of data.events) {
          const m = normalize(event, slug);
          if (!m || !m.kickoff) continue;

          const day = athensDayFromKickoff(m.kickoff);
          const { staging } = keysForDay(day);

          if (!bucketMaps[staging])
            bucketMaps[staging] = new Map();

          const prev = bucketMaps[staging].get(m.id);

          if (
            !prev ||
            prev.status !== m.status ||
            prev.scoreHome !== m.scoreHome ||
            prev.scoreAway !== m.scoreAway
          ) {
            bucketMaps[staging].set(m.id, { ...m, dayKey: day });

            // ==============================
            // AUTO REFRESH MATCH INTEL
            // ==============================
            try {
              fetch(`${AI_ENGINE_URL}/ai/match-intel?id=${m.id}`)
                .then(r => r.body?.cancel())
                .catch(() => {});
            } catch (_) {}
          }
        } 
               } catch (_) {
                 continue;
               }

              }
            }
  let nextIndex = endIndex;
  if (nextIndex >= totalLeagues) nextIndex = 0;

  await env.AIML_INGESTION_KV.put("INGEST:IDX", String(nextIndex));

  for (const stagingKey in bucketMaps) {
    const existing = (await getJson(env, stagingKey)) || { matches: [] };
    const merged = new Map(existing.matches.map(m => [m.id, m]));

    for (const m of bucketMaps[stagingKey].values()) {
      merged.set(m.id, m);
    }

    await putJson(env, stagingKey, {
      date: stagingKey.split(":").pop(),
      matches: Array.from(merged.values())
    });
  }
}

/* ================= FINALIZE ================= */

function isTerminal(status) {
  return (
    status === "STATUS_FINAL" ||
    status === "STATUS_FULL_TIME" ||
    status === "STATUS_AET" ||
    status === "STATUS_PENALTIES" ||
    status === "STATUS_POSTPONED" ||
    status === "STATUS_CANCELED"
  );
}

async function finalizeDay(env, day) {
  const { staging, final } = keysForDay(day);
  const data = await getJson(env, staging);
  if (!data?.matches?.length) return;

  const now = Date.now();
  let allClosed = true;

  for (const m of data.matches) {
    if (isTerminal(m.status)) continue;

    const hoursSinceKickoff = (now - m.kickoff_ms) / (1000*60*60);

    if (hoursSinceKickoff > FORCE_CLOSE_AFTER_HOURS)
      continue;

    allClosed = false;
  }

  if (!allClosed) return;

  await putJson(env, final, data);
}

/* ================= RUNTIME ENDPOINT ================= */

async function handleFixturesRuntime(req, env) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const mode = url.searchParams.get("mode") || "today";

  if (!date) return jsonResponse({ ok:false, error:"missing_date" },400);

  const { staging, final } = keysForDay(date);

  const finalData = await getJson(env, final);
  const stagingData = await getJson(env, staging);

  const data = finalData || stagingData || { date, matches: [] };

  // 🔹 ACTIVE = full dataset
  if (mode === "active") {
    return jsonResponse(data);
  }

  // 🔹 TODAY = time-based view
  const now = Date.now();

  const filtered = (data.matches || []).filter(m => {
    const s = String(m.status || "").toUpperCase();

    // LIVE matches ALWAYS visible
    if (s.includes("IN_PROGRESS")) return true;

    // upcoming matches (μέχρι 4h πριν kickoff)
    if (s === "STATUS_SCHEDULED" &&
        m.kickoff_ms >= now - 4 * 60 * 60 * 1000)
      return true;

    return false;
  });

  return jsonResponse({
    date,
    matches: filtered
  });
}

/* ================= SCHEDULER ================= */

async function runScheduler(env) {
  await ingestUTCWindow(env);

  const now = new Date();
  const days = [
    formatUTC(shiftUTC(now,-1)),
    formatUTC(now)
  ];

  for (const day of days)
    await finalizeDay(env, day);
}

/* ================= EXPORT ================= */

export default {

  async fetch(req, env) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS")
      return new Response(null, { headers: corsHeaders() });

    // ---------------------------
    // FIXTURES RUNTIME ENDPOINT
    // ---------------------------
    if (url.pathname === "/fixtures-runtime") {
      return handleFixturesRuntime(req, env);
    }

    return jsonResponse({ ok:false, error:"invalid_route" }, 404);
  },

  async scheduled(event, env, ctx) {
    console.log("[scheduler] cron tick");

    ctx.waitUntil((async () => {
      try {
        await ingestUTCWindow(env);
        console.log("[scheduler] ingest done");

        const day = dayKeyTZ(ATHENS_TZ, new Date());
        await finalizeDay(env, day);

        console.log("[scheduler] finalize checked");
      } catch (err) {
        console.error("[scheduler] cron error", err);
      }
    })());
  }

};