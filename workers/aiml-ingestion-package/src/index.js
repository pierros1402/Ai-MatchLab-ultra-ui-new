import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

/* ============================================================
   AIMATCHLAB — SCHEDULER + FIXTURES INGEST (ALL-IN-ONE)
   - Eliminates worker->worker HTTP calls (avoids workers.dev 1042)
   - Writes SAME KV keys as fixtures-ingest
============================================================ */


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


function getR2(env) {
  if (!env?.AIML_ARCHIVE) return null;
  return env.AIML_ARCHIVE;
}

function r2PutJson(r2, key, obj) {
  if (!r2) return Promise.resolve(false);
  const body = JSON.stringify(obj, null, 2);
  return r2.put(key, body, { httpMetadata: { contentType: "application/json; charset=utf-8" } })
    .then(() => true)
    .catch(() => false);
}

function r2KeyStandingsLatest(leagueSlug, season) {
  return `standings/${leagueSlug}/${season}/latest.json`;
}
function r2KeyStandingsByDate(leagueSlug, season, dayYmd) {
  return `standings/${leagueSlug}/${season}/date=${dayYmd}.json`;
}
function r2KeyRefereeIndex() {
  return `referees/index.json`;
}

function getKV(env) {
  if (!env?.AIML_INGESTION_KV) {
    throw new Error("Missing KV binding AIML_INGESTION_KV");
  }
  return env.AIML_INGESTION_KV;
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

async function resumableRun(env, dayYmd, chunkOverride) {
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
  // R2 SNAPSHOTS (MVP placeholders) - Standings/Referees DB
  // =====================================================
  try {
    const r2 = getR2(env);
    const season = String(env.SEASON || "2025-2026");
    const matchesArr = Array.isArray(finalPayload.matches) ? finalPayload.matches : [];
    const leaguesToday = Array.from(new Set(matchesArr.map(m => String(m.leagueSlug || "").trim()).filter(Boolean)));

    // Standings placeholders per league (we will enrich later)
    for (const lg of leaguesToday) {
      const stub = {
        ok: true,
        leagueSlug: lg,
        season,
        date: dayYmd,
        type: "standings_snapshot",
        status: "PLACEHOLDER",
        table: [],
        note: "Snapshot placeholder (to be enriched by trusted sources).",
        createdAt: Date.now(),
      };
      await r2PutJson(r2, r2KeyStandingsByDate(lg, season, dayYmd), stub);
      await r2PutJson(r2, r2KeyStandingsLatest(lg, season), stub);
    }

    // Referee index placeholder (global)
    const refIndex = {
      ok: true,
      type: "referee_index",
      status: "PLACEHOLDER",
      updatedAt: Date.now(),
      referees: []
    };
    await r2PutJson(r2, r2KeyRefereeIndex(), refIndex);
  } catch (_) {}
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


// ------------------------------
// SCHEDULER + FETCH (single export)
// ------------------------------
// =====================================================
// INTERNAL: ENRICH (manual trigger) -> writes R2 placeholders SAFELY
// GET /internal/enrich?date=YYYY-MM-DD
// =====================================================
async function handleInternalEnrich(request, env) {
  const date = ymdFromQueryOrToday(request.url, DEFAULT_TZ);
  const kv = getKV(env);

  const fixturesKey = `FIXTURES:DATE:${date}`;
  let fixtures = null;

  try {
    const raw = await kv.get(fixturesKey);
    fixtures = raw ? JSON.parse(raw) : null;
  } catch (e) {
    return jsonResponse(
      { ok: false, error: "fixtures_parse_failed", fixturesKey, message: String(e?.message || e) },
      500
    );
  }

  if (!fixtures || !Array.isArray(fixtures.matches)) {
    return jsonResponse({ ok: false, error: "missing_fixtures_final", fixturesKey }, 404);
  }

  const matches = fixtures.matches;
  const leagues = Array.from(
    new Set(matches.map((m) => String(m?.leagueSlug || "").trim()).filter(Boolean))
  );

  const r2 = getR2(env);
  if (!r2) {
    return jsonResponse({ ok: false, error: "missing_r2_binding", need: "AIML_ARCHIVE" }, 500);
  }

  const season = String(env.SEASON || "2025-2026");
  const nowMs = Date.now();
  const wrote = [];

  // Referee index placeholder (global)
  await r2PutJson(r2, r2KeyRefereeIndex(), {
    ok: true,
    type: "referee_index",
    status: "PLACEHOLDER",
    updatedAt: nowMs,
    referees: []
  }).then((ok) => {
    if (ok) wrote.push(r2KeyRefereeIndex());
  });

  // Standings placeholders per league
  for (const lg of leagues) {
    const stub = {
      ok: true,
      leagueSlug: lg,
      season,
      date,
      type: "standings_snapshot",
      status: "PLACEHOLDER",
      table: [],
      note: "Snapshot placeholder (to be enriched by trusted sources).",
      createdAt: nowMs
    };

    await r2PutJson(r2, r2KeyStandingsByDate(lg, season, date), stub).then((ok) => {
      if (ok) wrote.push(r2KeyStandingsByDate(lg, season, date));
    });

    await r2PutJson(r2, r2KeyStandingsLatest(lg, season), stub).then((ok) => {
      if (ok) wrote.push(r2KeyStandingsLatest(lg, season));
    });
  }

  return jsonResponse({
    ok: true,
    service: "aimatchlab-scheduler",
    version: "v1.5-enrich-safe",
    date,
    fixturesKey,
    matchesCount: matches.length,
    leagues,
    wrote
  });
}


export default {

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Health
    if (url.pathname === "/") {
      return jsonResponse({
        ok: true,
        service: "aimatchlab-scheduler-allinone",
        version: "v1-allinone",
        note: "This worker runs scheduled fixtures ingest without worker->worker HTTP."
      });
    }

    // Optional manual debug endpoints (same as fixtures-ingest)
    if (url.pathname === "/internal/run") {
      const dayYmd = ymdFromQueryOrToday(request.url, DEFAULT_TZ);
      const burst = Math.max(1, Math.min(5, parseInt(url.searchParams.get("burst") || "1", 10)));

      let last = null;
      for (let i = 0; i < burst; i++) {
        last = await resumableRun(env, dayYmd);
      }
      return jsonResponse(last);
    }

    if (url.pathname === "/internal/finalize") {
      const dayYmd = ymdFromQueryOrToday(request.url, DEFAULT_TZ);
      const out = await finalizeDay(env, dayYmd);
      return jsonResponse(out, out.ok ? 200 : 409);
    }

    if (url.pathname === "/internal/enrich") {
      return handleInternalEnrich(request, env);
    }

    if (url.pathname === "/internal/start") {
      const dayYmd = ymdFromQueryOrToday(request.url, DEFAULT_TZ);

      ctx.waitUntil((async () => {
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
        note: "Ingest started in background. Check FIXTURES:DEBUG:* keys."
      });
    }

    return jsonResponse({ ok: false, error: "not_found" }, 404);
  }
};

// =====================================================
// STANDINGS ENRICHMENT (SEASON-LEVEL, INDEPENDENT OF DAY)
// =====================================================
// Uses the SAME cron as this scheduler.
// Safe: if provider returns no data, nothing is written.


async function runSeasonStandings(env) {
  const season = String(env.SEASON || "2025-2026");

  // Use canonical registry (single source of truth)
  const STANDINGS_LEAGUES = Array.isArray(LEAGUE_SEEDS)
    ? LEAGUE_SEEDS.filter(slug =>
        typeof slug === "string" &&
        (slug.endsWith(".1") || slug.endsWith(".2"))
      )
    : [];

  for (const lg of STANDINGS_LEAGUES) {
    try {
      
      await fetch(env.STANDINGS_WORKER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": env.INTERNAL_ENRICH_TOKEN
        },
        body: JSON.stringify({
          league: lg,
          season
        })
      });
    } catch (_) {}
  }
}

