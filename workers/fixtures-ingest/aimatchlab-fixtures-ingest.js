import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

/* ============================================================
   AIMATCHLAB — FIXTURES INGEST (RESUMABLE, AUTO + CLEANUP)
   Folder: workers/fixtures-ingest/aimatchlab-fixtures-ingest.js

   Endpoints:
   - GET /                     -> health + info
   - GET /internal/run         -> process next chunk (queue/staging)
   - GET /internal/finalize    -> write FIXTURES:DATE:<day> and cleanup
   - GET /internal/start       -> start background ingest (DO)
============================================================ */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const DEFAULT_TZ = "Europe/Athens";

// Tunables
const RUN_CHUNK_SIZE = 10;             // leagues per /internal/run
const BETWEEN_LEAGUES_DELAY_MS = 180;  // tiny delay between league calls
const FETCH_RETRIES = 1;
const RETRY_DELAY_MS = 350;

// Safety: do not finalize if we have too few matches (prevents empty days)
const MIN_TOTAL_MATCHES_FINAL = 1;

// KV key helpers
function keysForDay(dayYmd) {
  return {
    queueKey:   `FIXTURES:QUEUE:DATE:${dayYmd}`,
    stagingKey: `FIXTURES:STAGING:DATE:${dayYmd}`,
    finalKey:   `FIXTURES:DATE:${dayYmd}`,
    debugKey:   `FIXTURES:DEBUG:DATE:${dayYmd}:LAST_RUN`,
  };
}

function getKV(env) {
  if (!env?.AIMATCHLAB_KV_CORE) {
    throw new Error("Missing KV binding AIMATCHLAB_KV_CORE");
  }
  return env.AIMATCHLAB_KV_CORE;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function ymdCompact(ymd) {
  return String(ymd).replaceAll("-", "");
}

function ymdFromQueryOrToday(urlStr, tz = DEFAULT_TZ) {
  const u = new URL(urlStr);
  const q = u.searchParams.get("date");
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;

  // Today in tz
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function dayKeyFromKickoffISO(kickoffISO, tz = DEFAULT_TZ) {
  if (!kickoffISO) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(kickoffISO));
}

function normalizeEspnEvent(evt, leagueSlug, leagueName, tz, targetDayYmd) {
  const id = String(evt?.id || evt?.uid || "");
  if (!id) return null;

  const competitors = evt?.competitions?.[0]?.competitors || [];
  const home = competitors.find(c => c?.homeAway === "home") || {};
  const away = competitors.find(c => c?.homeAway === "away") || {};

  const kickoff = evt?.date || null;
  const kickoff_ms = kickoff ? Date.parse(kickoff) : null;

  const statusType = evt?.status?.type?.name || evt?.status?.type?.state || "STATUS_UNKNOWN";
  const minute = Number(evt?.status?.displayClock || 0) || 0;

  const scoreHome = Number(home?.score ?? 0) || 0;
  const scoreAway = Number(away?.score ?? 0) || 0;

  // dayKey: use kickoff day in Athens; fallback to requested day
  const dayKey = kickoff ? (dayKeyFromKickoffISO(kickoff, tz) || targetDayYmd) : targetDayYmd;

  return {
    id,
    home: home?.team?.displayName || home?.team?.shortDisplayName || "Home",
    away: away?.team?.displayName || away?.team?.shortDisplayName || "Away",
    homeTeamId: String(home?.team?.id || ""),
    awayTeamId: String(away?.team?.id || ""),
    kickoff,
    kickoff_ms,
    status: statusType,
    minute,
    scoreHome,
    scoreAway,
    leagueSlug,
    leagueName,
    dayKey
  };
}

function mergeUniqueById(existing, incoming) {
  const m = new Map();
  for (const x of existing || []) {
    if (x?.id) m.set(String(x.id), x);
  }
  for (const x of incoming || []) {
    if (x?.id) m.set(String(x.id), x);
  }
  return Array.from(m.values());
}

async function fetchLeagueOnce(leagueSlug, dayYmd, tz) {
  const compact = ymdCompact(dayYmd);
  const url = `${ESPN_BASE}/${leagueSlug}/scoreboard?dates=${compact}`;

  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) return { leagueSlug, ok: false, status: res.status, events: [] };

  const json = await res.json();
  const events = Array.isArray(json?.events) ? json.events : [];
  const leagueName = LEAGUE_NAME_MAP?.[leagueSlug] || leagueSlug;

  const matches = events
    .map(e => normalizeEspnEvent(e, leagueSlug, leagueName, tz, dayYmd))
    .filter(Boolean)
    // Only keep matches that resolve to the target day (Athens dayKey)
    .filter(m => m.dayKey === dayYmd);

  return { leagueSlug, ok: true, status: 200, events: matches };
}

async function fetchLeagueWithRetry(leagueSlug, dayYmd, tz) {
  let last = null;
  for (let i = 0; i <= FETCH_RETRIES; i++) {
    last = await fetchLeagueOnce(leagueSlug, dayYmd, tz);
    if (last.ok) return last;
    await sleep(RETRY_DELAY_MS);
  }
  return last || { leagueSlug, ok: false, status: 0, events: [] };
}

async function ensureQueueInitialized(env, dayYmd) {
  const kv = getKV(env);
  const { queueKey } = keysForDay(dayYmd);

  const existing = await kv.get(queueKey);
  if (existing) return; // already there

  // fresh queue = all leagues in seeds
  const queue = Array.isArray(LEAGUE_SEEDS) ? [...LEAGUE_SEEDS] : [];
  await kv.put(queueKey, JSON.stringify(queue));
}

async function resumableRun(env, dayYmd) {
  const kv = getKV(env);
  const tz = DEFAULT_TZ;
  const { queueKey, stagingKey, debugKey } = keysForDay(dayYmd);

  await ensureQueueInitialized(env, dayYmd);

  const queueRaw = await kv.get(queueKey);
  const queue = queueRaw ? JSON.parse(queueRaw) : [];
  const startedWithQueue = Array.isArray(queue) ? queue.length : 0;

  const chunk = (queue || []).slice(0, RUN_CHUNK_SIZE);
  const remaining = (queue || []).slice(RUN_CHUNK_SIZE);

  // Read staging
  const stagingRaw = await kv.get(stagingKey);
  const staging = stagingRaw ? JSON.parse(stagingRaw) : { date: dayYmd, matches: [] };

  let producedMatchesNow = 0;
  let errors = [];

  for (const leagueSlug of chunk) {
    try {
      const out = await fetchLeagueWithRetry(leagueSlug, dayYmd, tz);
      if (out?.ok && Array.isArray(out.events)) {
        const before = staging.matches.length;
        staging.matches = mergeUniqueById(staging.matches, out.events);
        const after = staging.matches.length;
        producedMatchesNow += Math.max(0, after - before);
      }
    } catch (e) {
      errors.push({ league: leagueSlug, error: String(e?.message || e) });
    }
    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  // Write back queue + staging
  await kv.put(queueKey, JSON.stringify(remaining));
  await kv.put(stagingKey, JSON.stringify(staging));

  const debug = {
    ok: true,
    date: dayYmd,
    timezone: tz,
    createdAt: Date.now(),
    source: "espn_resumable_batched",
    runChunkSize: RUN_CHUNK_SIZE,
    startedWithQueue,
    processedNow: chunk.length,
    queueRemaining: remaining.length,
    producedMatchesNow,
    totalUniqueMatchesStaging: staging.matches.length,
    errorsCount: errors.length,
    errors,
    finalized: false,
    wroteFinal: false,
    keys: keysForDay(dayYmd)
  };

  // Debug TTL 24h
  await kv.put(debugKey, JSON.stringify(debug), { expirationTtl: 24 * 60 * 60 });

  return debug;
}

async function finalizeDay(env, dayYmd) {
  const kv = getKV(env);
  const tz = DEFAULT_TZ;
  const { queueKey, stagingKey, finalKey, debugKey } = keysForDay(dayYmd);

  const stagingRaw = await kv.get(stagingKey);
  const staging = stagingRaw ? JSON.parse(stagingRaw) : { date: dayYmd, matches: [] };

  const total = Array.isArray(staging?.matches) ? staging.matches.length : 0;

  const finalPayload = {
    ok: true,
    date: dayYmd,
    timezone: tz,
    createdAt: Date.now(),
    total,
    matches: staging.matches || []
  };

  if (total < MIN_TOTAL_MATCHES_FINAL) {
    const debug = {
      ok: false,
      date: dayYmd,
      timezone: tz,
      createdAt: Date.now(),
      message: `Not finalizing: only ${total} matches (min=${MIN_TOTAL_MATCHES_FINAL}).`,
      finalized: false,
      wroteFinal: false,
      keys: keysForDay(dayYmd)
    };
    await kv.put(debugKey, JSON.stringify(debug), { expirationTtl: 24 * 60 * 60 });
    return { ...debug, total };
  }

  await kv.put(finalKey, JSON.stringify(finalPayload));
  // =====================================================
  // DETAILS SEED (baseline record per match) - best effort
  // =====================================================
  try {
    const detailsBase = "https://aimatchlab-details-worker.pierros1402.workers.dev";
    const season = String(env.SEASON || "2025-2026");
    const matchesArr = Array.isArray(finalPayload.matches) ? finalPayload.matches : [];
    const seedBatch = matchesArr.slice(0, 250); // safety cap

    for (const m of seedBatch) {
      const matchId = String(m.id || m.matchId || "").trim();
      if (!matchId) continue;

      const url = `${detailsBase}/v1/match/details/seed`;
      const body = {
        matchId,
        leagueSlug: m.leagueSlug || m.league || "_unknown",
        leagueName: m.leagueName || null,
        season,
        home: m.home || null,
        away: m.away || null,
        kickoff_ms: m.kickoff_ms || null,
        kickoff: m.kickoff || null,
        status: m.status || null,
        scoreHome: m.scoreHome ?? null,
        scoreAway: m.scoreAway ?? null,
        source: "fixtures-ingest",
        seededAt: new Date().toISOString(),
      };

      // best-effort, never block ingest
      fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).catch(() => {});
    }
  } catch (_) {}


  // Cleanup: staging/queue are not needed after FINAL is written
  try { await kv.delete(queueKey); } catch (_) {}
  try { await kv.delete(stagingKey); } catch (_) {}

  const debug = {
    ok: true,
    date: dayYmd,
    timezone: tz,
    createdAt: Date.now(),
    source: "espn_resumable_batched",
    finalized: true,
    wroteFinal: true,
    totalUniqueMatchesFinal: total,
    keys: keysForDay(dayYmd)
  };
  await kv.put(debugKey, JSON.stringify(debug), { expirationTtl: 24 * 60 * 60 });

  return debug;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health
    if (url.pathname === "/") {
      return jsonResponse({
        ok: true,
        service: "aimatchlab-fixtures-ingest",
        version: "v3-clean-shared",
        note: "Use /internal/run or /internal/finalize. Scheduler calls these."
      });
    }

    // Run: process one chunk
    if (url.pathname === "/internal/run") {
      const dayYmd = ymdFromQueryOrToday(request.url, DEFAULT_TZ);
      const burst = Math.max(1, Math.min(5, parseInt(url.searchParams.get("burst") || "1", 10)));

      // do N runs in one request
      let last = null;
      for (let i = 0; i < burst; i++) {
        last = await resumableRun(env, dayYmd);
      }
      return jsonResponse(last);
    }

    // Finalize: write FIXTURES:DATE:<day> and cleanup
    if (url.pathname === "/internal/finalize") {
      const dayYmd = ymdFromQueryOrToday(request.url, DEFAULT_TZ);
      const out = await finalizeDay(env, dayYmd);
      return jsonResponse(out, out.ok ? 200 : 409);
    }

    // Start: background ingest (Durable Object-free)
    // NOTE: This endpoint starts it "fire and forget" via waitUntil
    if (url.pathname === "/internal/start") {
      const dayYmd = ymdFromQueryOrToday(request.url, DEFAULT_TZ);
      ctx.waitUntil((async () => {
        // drain until empty-ish; safety cap 40 loops
        for (let i = 0; i < 40; i++) {
          const d = await resumableRun(env, dayYmd);
          if (d.queueRemaining <= 0) break;
          await sleep(250);
        }
        await finalizeDay(env, dayYmd);
      })());

      return jsonResponse({
        ok: true,
        started: true,
        date: dayYmd,
        note: "Resumable ingest started in background (queue/staging). Check FIXTURES:DEBUG:* keys."
      });
    }

    return jsonResponse({ ok: false, error: "not_found" }, 404);
  }
};
