

// ============================================================
// DETERMINISTIC TABLE BUILDER (R2 → R2 INTEL)
// ============================================================

async function listSeasons(env, league) {
  const prefix = `ft/${league}/`;
  const list = await env.AIML_ARCHIVE.list({ prefix });
  const seasons = new Set();

  for (const obj of list.objects || []) {
    const parts = obj.key.split("/");
    if (parts.length >= 3) seasons.add(parts[2]);
  }

  return Array.from(seasons);
}

async function rebuildLeagueTableFromR2(env, league, season) {
  if (!env.AIML_ARCHIVE || !env.AIMATCHLAB_INTEL) {
    throw new Error("Missing R2 bindings");
  }

  const prefix = `ft/${league}/${season}/matches/`;
  const list = await env.AIML_ARCHIVE.list({ prefix });

  if (!list.objects || !list.objects.length) return;

  const table = {};

  function init(team) {
    if (!table[team]) {
      table[team] = {
        team,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goals_for: 0,
        goals_against: 0,
        goal_diff: 0,
        points: 0,
        over15: 0,
        over25: 0,
        over35: 0,
        btts: 0
      };
    }
  }

  for (const obj of list.objects) {
    const res = await env.AIML_ARCHIVE.get(obj.key);
    if (!res) continue;

    const match = await res.json();
    const { home, away, scoreHome, scoreAway } = match;

    if (typeof scoreHome !== "number" || typeof scoreAway !== "number") continue;

    init(home);
    init(away);

    table[home].played++;
    table[away].played++;

    table[home].goals_for += scoreHome;
    table[home].goals_against += scoreAway;

    table[away].goals_for += scoreAway;
    table[away].goals_against += scoreHome;

    if (scoreHome > scoreAway) {
      table[home].wins++;
      table[home].points += 3;
      table[away].losses++;
    } else if (scoreHome < scoreAway) {
      table[away].wins++;
      table[away].points += 3;
      table[home].losses++;
    } else {
      table[home].draws++;
      table[away].draws++;
      table[home].points++;
      table[away].points++;
    }

    const total = scoreHome + scoreAway;

    if (total >= 2) {
      table[home].over15++;
      table[away].over15++;
    }
    if (total >= 3) {
      table[home].over25++;
      table[away].over25++;
    }
    if (total >= 4) {
      table[home].over35++;
      table[away].over35++;
    }
    if (scoreHome > 0 && scoreAway > 0) {
      table[home].btts++;
      table[away].btts++;
    }
  }

  const teams = Object.values(table).map(t => {
    t.goal_diff = t.goals_for - t.goals_against;
    t.points_per_game = t.played ? +(t.points / t.played).toFixed(3) : 0;
    t.over25_rate = t.played ? +(t.over25 / t.played).toFixed(3) : 0;
    t.btts_rate = t.played ? +(t.btts / t.played).toFixed(3) : 0;
    return t;
  });

  teams.sort((a, b) =>
    b.points - a.points ||
    b.goal_diff - a.goal_diff ||
    b.goals_for - a.goals_for ||
    a.team.localeCompare(b.team)
  );

  teams.forEach((t, i) => t.rank = i + 1);

  const output = {
    ok: true,
    league,
    season,
    generatedAt: new Date().toISOString(),
    teams
  };

  await env.AIMATCHLAB_INTEL.put(
    `intel/tables/${league}/${season}.json`,
    JSON.stringify(output, null, 2),
    { httpMetadata: { contentType: "application/json" } }
  );
}


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
  async scheduled(event, env, ctx) {

    // =====================================================
    // LIVE SYNC BLOCK (SERVICE BINDINGS)
    // =====================================================
    try {
      const liveIndexRes = await env.LIVE_INDEX.fetch("https://internal/api/unified-live");
      const liveIndexJson = await liveIndexRes.json();

      if (liveIndexJson?.ok && Array.isArray(liveIndexJson.matches)) {

        for (const m of liveIndexJson.matches) {

          const status = String(m.status || "").toLowerCase();
          const isLive = status.includes("in") || status.includes("progress");

          if (!isLive || !m.id) continue;

          try {
            const liveRes = await env.LIVE_MATCH.fetch("https://internal/api/match-live?id=" + m.id);
            const liveJson = await liveRes.json();

            if (!liveJson?.ok) continue;

            await env.AIML_INGESTION_KV.put(
              "LIVE:STATE:" + m.id,
              JSON.stringify(m),
              { expirationTtl: 120 }
            );

            await env.AIML_INGESTION_KV.put(
              "LIVE:INTEL:" + m.id,
              JSON.stringify(liveJson),
              { expirationTtl: 120 }
            );

          } catch (_) {}
        }
      }
    } catch (_) {}


    // ===============================
    // AUTO MONTH CLOSURE (safe / idempotent)
    // ===============================
    try {
      const tzNow = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Athens",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());

      const [y, m, d] = tzNow.split("-");

      if (d === "01") {
        const prev = new Date(Date.UTC(Number(y), Number(m) - 1, 0));
        const prevY = prev.getUTCFullYear();
        const prevM = String(prev.getUTCMonth() + 1).padStart(2, "0");
        const monthKey = `${prevY}-${prevM}`;
        const CLOSED_KEY = `MONTH:CLOSED:${monthKey}`;

        const already = await env.AIML_INGESTION_KV.get(CLOSED_KEY);
        if (!already) {
          await runMonthClosure(env, monthKey);
          await env.AIML_INGESTION_KV.put(CLOSED_KEY, "1", {
            expirationTtl: 60 * 60 * 24 * 90
          });
        }
      }
    } catch (_) {}

    const now = new Date();
    const iso = now.toISOString();

    const TICK_KEY = "SCHEDULER:LAST_TICK";
    const ERR_KEY = "SCHEDULER:LAST_ERROR";
    const OK_KEY = "SCHEDULER:FIXTURES_INGEST:LAST_OK";
    const FAIL_KEY = "SCHEDULER:FIXTURES_INGEST:LAST_FAIL";

    async function safeKvPut(key, value, ttlSeconds) {
      try {
        if (!env?.AIML_INGESTION_KV) return;
        await env.AIML_INGESTION_KV.put(
          key,
          typeof value === "string" ? value : JSON.stringify(value),
          ttlSeconds ? { expirationTtl: ttlSeconds } : undefined
        );
      } catch (_) {}
    }

    await runValueGradingIncremental(env);

      await safeKvPut(TICK_KEY, { ok: true, iso, ts: Date.now() }, 6 * 60 * 60);

    try {
      const dayYmd = new Intl.DateTimeFormat("en-CA", {
        timeZone: DEFAULT_TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(now);

      // Run gate: only start ingest after 00:00 Greece time
      const localHM = new Intl.DateTimeFormat("en-GB", {
        timeZone: DEFAULT_TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }).format(now);
      if (localHM < "00:00") {
        await safeKvPut(OK_KEY, { ok:true, iso:new Date().toISOString(), ts:Date.now(), date: dayYmd, note:"Before 00:00 GR — skip" }, 6*60*60);
        return;
      }

      const LOCK_KEY = `FIXTURES:LOCK:DATE:${dayYmd}`;
      const lock = await env.AIML_INGESTION_KV.get(LOCK_KEY);
      if (lock) {
        await safeKvPut(OK_KEY, { ok:true, iso:new Date().toISOString(), ts:Date.now(), date: dayYmd, note:"Locked (already finalized today). Skipping." }, 6*60*60);
        return;
      }

      // Drain queue in controlled bursts.
      // Goal: finish ALL leagues for the day, without hitting CF "Too many subrequests".
      // We run multiple ticks automatically via cron, so each tick does a safe amount of work.
      const TARGET_CHUNK = Math.max(1, Math.min(20, Number(env?.FIXTURES_RUN_CHUNK || 20))); // 1..20
      const MAX_CYCLES = Math.max(1, Math.min(10, Number(env?.FIXTURES_MAX_CYCLES || 6)));   // per tick safety
      const CYCLE_DELAY_MS = Math.max(150, Math.min(1500, Number(env?.FIXTURES_CYCLE_DELAY_MS || 450)));

      let last = null;

      for (let cycle = 0; cycle < MAX_CYCLES; cycle++) {
        // run one cycle with custom chunk
        last = await resumableRun(env, dayYmd, TARGET_CHUNK);

        // if queue empty, we can stop
        if (last?.queueRemaining <= 0) break;

        await sleep(CYCLE_DELAY_MS);
      }

      // Finalize only if queue is empty (otherwise we let next cron tick continue)
      let fin = null;
      if (last?.queueRemaining <= 0) {
        fin = await finalizeDay(env, dayYmd);
        if (fin?.wroteFinal === true) {
          await runValueGenerationForDay(env, dayYmd);
          await env.AIML_INGESTION_KV.put(LOCK_KEY, "1", { expirationTtl: 12 * 60 * 60 });
        }
      } else {
        fin = {
          ok: true,
          date: dayYmd,
          note: "Not finalized yet (queue not empty). Will continue next cron tick.",
          queueRemaining: last?.queueRemaining ?? null
        };
      }

      await safeKvPut(
        OK_KEY,
        { ok: true, iso: new Date().toISOString(), ts: Date.now(), date: dayYmd, lastRun: last, finalize: fin },
        6 * 60 * 60
      );

      // ===============================
      // SEASON STANDINGS ENRICH (canonical slugs)
      // ===============================
      try {
        try { await runSeasonStandings(env); } catch (_) {}
      } catch (_) {}
    } catch (e) {
      await safeKvPut(
        FAIL_KEY,
        { ok: false, iso: new Date().toISOString(), ts: Date.now(), message: String(e?.message || e) },
        24 * 60 * 60
      );
      await safeKvPut(
        ERR_KEY,
        { ok: false, iso: new Date().toISOString(), ts: Date.now(), message: String(e?.message || e) },
        24 * 60 * 60
      );
    }
  },

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

    

    // =====================================================
    // TABLE DEBUG ENDPOINTS
    // =====================================================

    if (url.pathname === "/internal/rebuild-table") {
      const league = url.searchParams.get("league");
      const season = url.searchParams.get("season");

      if (!league || !season) {
        return jsonResponse({ ok: false, error: "missing league or season" }, 400);
      }

      await rebuildLeagueTableFromR2(env, league, season);
      return jsonResponse({ ok: true, league, season });
    }

    if (url.pathname === "/internal/rebuild-league") {
      const league = url.searchParams.get("league");
      if (!league) {
        return jsonResponse({ ok: false, error: "missing league" }, 400);
      }

      const seasons = await listSeasons(env, league);
      for (const season of seasons) {
        await rebuildLeagueTableFromR2(env, league, season);
      }

      return jsonResponse({ ok: true, league, seasons });
    }

    if (url.pathname === "/internal/rebuild-all") {
      const root = await env.AIML_ARCHIVE.list({ prefix: "ft/" });
      const leagues = new Set();

      for (const obj of root.objects || []) {
        const parts = obj.key.split("/");
        if (parts.length >= 2) leagues.add(parts[1]);
      }

      const result = {};

      for (const league of leagues) {
        const seasons = await listSeasons(env, league);
        result[league] = seasons;
        for (const season of seasons) {
          await rebuildLeagueTableFromR2(env, league, season);
        }
      }

      return jsonResponse({ ok: true, result });
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



// ======================================
// MONTHLY VALUE CLOSURE HELPER
// ======================================
async function runMonthClosure(env, monthKey) {
  const kv = env.AIML_INGESTION_KV;
  const r2 = env.AIMATCHLAB_INTEL;
  if (!kv || !r2) return;

  const prefix = `VALUE:PICK:${monthKey}-`;
  let cursor;
  let picks = [];

  do {
    const list = await kv.list({ prefix, cursor });
    for (const k of list.keys) {
      const raw = await kv.get(k.name);
      if (raw) picks.push(JSON.parse(raw));
    }
    cursor = list.cursor;
  } while (cursor);

  const monthly = {
    ok: true,
    month: monthKey,
    createdAt: Date.now(),
    totalPicks: picks.length,
    picks
  };

  await kv.put(`VALUE:MONTH:${monthKey}`, JSON.stringify(monthly));

  await r2.put(
    `value/${monthKey}/archive.json`,
    JSON.stringify(monthly, null, 2),
    { httpMetadata: { contentType: "application/json" } }
  );

  cursor = undefined;
  do {
    const list = await kv.list({ prefix, cursor });
    for (const k of list.keys) {
      await kv.delete(k.name);
    }
    cursor = list.cursor;
  } while (cursor);
}




/* =====================================================
   VALUE GRADING (INCREMENTAL, SAFE, NO FULL SCAN)
===================================================== */


/* =====================================================
   VALUE GENERATION (POST-FINALIZE, IDEMPOTENT)
===================================================== */

async function runValueGenerationForDay(env, dayYmd) {
  const kv = env.AIML_INGESTION_KV;
  if (!kv) return;

  const summaryKey = `VALUE:SUMMARY:${dayYmd}`;
  const already = await kv.get(summaryKey);
  if (already) return; // idempotent

  if (!env.VALUE_ENGINE_URL) return;

  const url = `${env.VALUE_ENGINE_URL}/internal/run?date=${encodeURIComponent(dayYmd)}`;

  const res = await fetch(url, {
    method: "GET"
  });

  if (!res.ok) return;

  // Value engine writes VALUE:STAT and VALUE:SUMMARY itself.
  // Scheduler does NOT write picks directly anymore.
}


async function runValueGradingIncremental(env) {
  const kv = env.AIML_INGESTION_KV;
  if (!kv) return;

  const pending = await kv.list({ prefix: "VALUE:PENDING:" });
  if (!pending?.keys?.length) return;

  for (const key of pending.keys) {
    const matchId = key.name.split(":")[2];
    if (!matchId) continue;

    const ftRaw = await kv.get(`MATCH:FT:${matchId}`);
    if (!ftRaw) continue;

    const ft = JSON.parse(ftRaw);
    const pickRaw = await kv.get(`VALUE:PICK:${matchId}`);
    if (!pickRaw) continue;

    const pick = JSON.parse(pickRaw);

    const already = await kv.get(`VALUE:GRADED:${matchId}`);
    if (already) continue;

    const graded = gradePick(pick, ft);

    await kv.put(`VALUE:GRADED:${matchId}`, JSON.stringify(graded));
    await updateMonthlyPerformance(env, graded);
    await kv.delete(`VALUE:PENDING:${matchId}`);
  }
}

function gradePick(pick, ft) {
  const home = Number(ft.scoreHome ?? 0);
  const away = Number(ft.scoreAway ?? 0);
  const total = home + away;

  let result = "LOSS";

  switch (pick.market) {

    case "1X2_HOME":
      if (home > away) result = "WIN";
      break;

    case "1X2_DRAW":
      if (home === away) result = "WIN";
      break;

    case "1X2_AWAY":
      if (away > home) result = "WIN";
      break;

    case "OVER_2_5":
      if (total >= 3) result = "WIN";
      break;

    case "UNDER_2_5":
      if (total <= 2) result = "WIN";
      break;

    case "OVER_3_5":
      if (total >= 4) result = "WIN";
      break;

    case "UNDER_3_5":
      if (total <= 3) result = "WIN";
      break;

    case "DNB_HOME":
      if (home > away) result = "WIN";
      else if (home === away) result = "VOID";
      break;

    case "DNB_AWAY":
      if (away > home) result = "WIN";
      else if (home === away) result = "VOID";
      break;

    case "DC_1X":
      if (home >= away) result = "WIN";
      break;

    case "DC_X2":
      if (away >= home) result = "WIN";
      break;

    case "DC_12":
      if (home !== away) result = "WIN";
      break;
  }

  const roi = result === "WIN"
    ? (pick.odds ?? 1) - 1
    : result === "VOID"
      ? 0
      : -1;

  return {
    matchId: pick.matchId,
    market: pick.market,
    selection: pick.selection,
    result,
    roi,
    confidence: pick.confidence,
    edge: pick.edge,
    modelVersion: pick.modelVersion,
    gradedAt: Date.now()
  };
}

async function updateMonthlyPerformance(env, graded) {
  const kv = env.AIML_INGESTION_KV;
  const month = new Date().toISOString().slice(0,7);
  const key = `VALUE:PERFORMANCE:${month}`;

  const raw = await kv.get(key);
  const current = raw ? JSON.parse(raw) : {
    total: 0,
    wins: 0,
    losses: 0,
    roiSum: 0
  };

  current.total += 1;
  if (graded.result === "WIN") current.wins += 1;
  if (graded.result === "LOSS") current.losses += 1;
  current.roiSum += graded.roi;

  await kv.put(key, JSON.stringify(current));
}
