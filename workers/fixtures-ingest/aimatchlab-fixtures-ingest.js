/**
 * aimatchlab-fixtures-ingest.js
 * V6.2 FINAL — RESUMABLE ALL-LEAGUES FIXTURES INGEST
 *
 * Goals:
 * - Fetch ALL league scoreboards for a given date (manual league slugs)
 * - Avoid Cloudflare "Too many subrequests" by chunking work across runs
 * - Resume progress via KV queue + staging
 * - Write FIXTURES:DATE:<day> ONLY when finished (never partial overwrite)
 *
 * KV Keys:
 * - FIXTURES:QUEUE:DATE:<day>             (remaining league slugs)
 * - FIXTURES:STAGING:DATE:<day>           (incremental merged matches)
 * - FIXTURES:DEBUG:DATE:<day>:LAST_RUN    (debug snapshot)
 * - FIXTURES:DATE:<day>                  (final fixtures payload for MAIN UI)
 */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const DEFAULT_TZ = "Europe/Athens";

/** ✅ ALL leagues you want (81) */
const LEAGUE_SEEDS = [
  "eng.1","eng.2","eng.3","eng.4","eng.5","eng.fa","eng.league_cup","eng.trophy",
  "esp.1","esp.2","esp.copa_del_rey","esp.super_cup","esp.w.1",
  "ita.1","ita.2","ita.coppa_italia",
  "fra.1","fra.2","fra.coupe_de_france","fra.super_cup","fra.w.1",
  "ger.1","ger.2",
  "sco.1","sco.2","sco.challenge","sco.tennents",
  "ned.1","ned.2","ned.3","ned.cup",
  "por.1","por.taca.portugal",
  "bel.1",
  "gre.1","cyp.1","ksa.1",
  "uefa.champions","uefa.europa","uefa.europa.conf",
  "caf.nations","caf.champions","caf.confed",
  "afc.champions","afc.cup",
  "mex.1","mex.2","usa.1","usa.w.1",
  "arg.1","bra.1","bra.2","chi.1","uru.1","par.1","per.1","ecu.1",
  "crc.1","gua.1","hon.1","jam.1","col.1",
  "tur.1","sui.1","aut.1","den.1","swe.1","nor.1",
  "sgp.1","slv.1","jpn.1","chn.1","tha.1","ind.1","aus.1","aus.w.1",
  "bra.camp.carioca","bra.camp.paulista","bra.camp.gaucho","bra.camp.mineiro",
  "club.friendly"
];

/**
 * SAFE settings:
 * - each run processes a limited chunk of leagues
 * - sequential requests to avoid subrequest limits
 */
const RUN_CHUNK_SIZE = 10;               // leagues per run
const BETWEEN_LEAGUES_DELAY_MS = 180;    // tiny delay

/** retries per league request (avoid heavy retry storms) */
const FETCH_RETRIES = 1;
const RETRY_DELAY_MS = 350;

/**
 * final write guard:
 * - write FIXTURES:DATE:<day> only if enough matches
 * - avoids writing nonsense (e.g. 22) as "final"
 *
 * NOTE: do NOT set this too high because some days are low volume.
 */
const MIN_TOTAL_MATCHES_FINAL = 20;

/* =========================
   Helpers
========================= */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function ymdFromQueryOrToday(urlStr) {
  const u = new URL(urlStr);
  const q = u.searchParams.get("date");
  if (q) return q;

  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function ymdCompact(ymd) {
  return ymd.replaceAll("-", "");
}

function dayKeyFromKickoffISO(kickoffISO, tz = DEFAULT_TZ) {
  try {
    const dt = new Date(kickoffISO);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(dt);

    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const d = parts.find((p) => p.type === "day")?.value;

    return `${y}-${m}-${d}`;
  } catch {
    const dt = new Date(kickoffISO);
    const yyyy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(dt.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
}

function normalizeEspnEvent(evt, leagueSlug, leagueName, tz, targetDayKey) {
  const id = String(evt?.id || "");
  const comp = evt?.competitions?.[0];
  const competitors = comp?.competitors || [];

  const home = competitors.find((c) => c?.homeAway === "home");
  const away = competitors.find((c) => c?.homeAway === "away");

  const kickoff = comp?.date || evt?.date || null;
  const kickoff_ms = kickoff ? new Date(kickoff).getTime() : null;

  const statusType =
    comp?.status?.type?.name ||
    evt?.status?.type?.name ||
    "PRE";

  // minute: try displayClock else fallback
  const minute = comp?.status?.displayClock
    ? parseInt(String(comp.status.displayClock).split(":")[0], 10)
    : (comp?.status?.type?.state === "in" ? 1 : 0);

  const scoreHome = home?.score != null ? Number(home.score) : 0;
  const scoreAway = away?.score != null ? Number(away.score) : 0;

  return {
    id,
    home: home?.team?.displayName || home?.team?.name || "Home",
    away: away?.team?.displayName || away?.team?.name || "Away",
    homeTeamId: home?.team?.id ? String(home.team.id) : null,
    awayTeamId: away?.team?.id ? String(away.team.id) : null,
    kickoff,
    kickoff_ms,
    status: statusType,
    minute: Number.isFinite(minute) ? minute : 0,
    scoreHome: Number.isFinite(scoreHome) ? scoreHome : 0,
    scoreAway: Number.isFinite(scoreAway) ? scoreAway : 0,
    leagueSlug,
    leagueName: leagueName || leagueSlug,
    dayKey: kickoff ? dayKeyFromKickoffISO(kickoff, tz) : targetDayKey
  };
}

function mergeUniqueById(existing, incoming) {
  const map = new Map();
  for (const m of existing || []) map.set(m.id, m);
  for (const m of incoming || []) map.set(m.id, m);
  return Array.from(map.values());
}

/* =========================
   ESPN fetch
========================= */

async function fetchLeagueOnce(leagueSlug, dayYmd, tz) {
  const url = `${ESPN_BASE}/${leagueSlug}/scoreboard?dates=${ymdCompact(dayYmd)}`;

  const r = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "aimatchlab-fixtures-ingest/v6.2-final"
    }
  });

  if (!r.ok) {
    return {
      ok: false,
      type: "fetch_failed",
      league: leagueSlug,
      status: r.status,
      error: `HTTP ${r.status}`,
      matches: []
    };
  }

  const data = await r.json();

  const leagueName =
    data?.leagues?.[0]?.name ||
    data?.leagues?.[0]?.shortName ||
    leagueSlug;

  const events = Array.isArray(data?.events) ? data.events : [];

  const out = [];
  for (const evt of events) {
    const m = normalizeEspnEvent(evt, leagueSlug, leagueName, tz, dayYmd);
    if (!m.id) continue;
    if (m.dayKey !== dayYmd) continue; // only target day in target timezone
    out.push(m);
  }

  return { ok: true, league: leagueSlug, matches: out };
}

async function fetchLeagueWithRetry(leagueSlug, dayYmd, tz) {
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetchLeagueOnce(leagueSlug, dayYmd, tz);
      if (res.ok) return res;

      // retry only on likely-transient failures
      if ([429, 500, 502, 503, 504].includes(res.status)) {
        if (attempt < FETCH_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
      }

      return res;
    } catch (e) {
      if (attempt < FETCH_RETRIES) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      return {
        ok: false,
        type: "exception",
        league: leagueSlug,
        error: String(e?.message || e),
        matches: []
      };
    }
  }

  return {
    ok: false,
    type: "exception",
    league: leagueSlug,
    error: "unknown",
    matches: []
  };
}

/* =========================
   RESUMABLE RUN (Queue + Staging)
========================= */

function getKV(env) {
  // MAIN reads from CORE, and you confirmed CORE is correct
  return env.AIMATCHLAB_KV_CORE;
}

async function resumableRun(env, dayYmd) {
  const tz = DEFAULT_TZ;
  const KV = getKV(env);

  if (!KV) {
    return {
      ok: false,
      reason: "missing_kv_binding",
      note: "Bind AIMATCHLAB_KV_CORE in this worker."
    };
  }

  const queueKey = `FIXTURES:QUEUE:DATE:${dayYmd}`;
  const stagingKey = `FIXTURES:STAGING:DATE:${dayYmd}`;
  const debugKey = `FIXTURES:DEBUG:DATE:${dayYmd}:LAST_RUN`;
  const finalKey = `FIXTURES:DATE:${dayYmd}`;

  // Load or initialize queue
  let queueRaw = await KV.get(queueKey);
  let queue = queueRaw ? JSON.parse(queueRaw) : null;

  if (!Array.isArray(queue) || queue.length === 0) {
    queue = [...LEAGUE_SEEDS];
    await KV.put(queueKey, JSON.stringify(queue));
  }

  // Load or initialize staging
  let stagingRaw = await KV.get(stagingKey);
  let stagingPayload = stagingRaw ? JSON.parse(stagingRaw) : null;

  if (!stagingPayload || !Array.isArray(stagingPayload.matches)) {
    stagingPayload = {
      date: dayYmd,
      timezone: tz,
      createdAt: Date.now(),
      source: "espn_resumable_staging",
      matches: []
    };
  }

  const startedWithQueue = queue.length;

  // chunk
  const chunk = queue.slice(0, RUN_CHUNK_SIZE);
  const rest = queue.slice(RUN_CHUNK_SIZE);

  const produced = [];
  const errors = [];

  // sequential fetch to avoid subrequest limits
  for (const leagueSlug of chunk) {
    const res = await fetchLeagueWithRetry(leagueSlug, dayYmd, tz);

    if (res.ok) {
      if (res.matches?.length) produced.push(...res.matches);
    } else {
      errors.push({
        type: res.type || "error",
        league: res.league,
        status: res.status,
        error: res.error
      });

      // push back to retry on next scheduler tick
      rest.push(leagueSlug);
    }

    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  // Merge results into staging
  stagingPayload.matches = mergeUniqueById(stagingPayload.matches, produced);
  stagingPayload.createdAt = Date.now();

  await KV.put(stagingKey, JSON.stringify(stagingPayload));
  await KV.put(queueKey, JSON.stringify(rest));

  // Finalize only when queue empty
  let finalized = false;
  let wroteFinal = false;

  if (rest.length === 0) {
    finalized = true;

    if (stagingPayload.matches.length >= MIN_TOTAL_MATCHES_FINAL) {
      const finalPayload = {
        date: dayYmd,
        timezone: tz,
        createdAt: Date.now(),
        source: "espn_resumable_final",
        matches: stagingPayload.matches
      };

      await KV.put(finalKey, JSON.stringify(finalPayload));
      wroteFinal = true;
    }
  }

  const debugPayload = {
    ok: true,
    date: dayYmd,
    timezone: tz,
    createdAt: Date.now(),
    source: "espn_resumable_batched",
    runChunkSize: RUN_CHUNK_SIZE,
    startedWithQueue,
    processedNow: chunk.length,
    queueRemaining: rest.length,
    producedMatchesNow: produced.length,
    totalUniqueMatchesStaging: stagingPayload.matches.length,
    errorsCount: errors.length,
    errors,
    finalized,
    wroteFinal,
    keys: { queueKey, stagingKey, finalKey, debugKey }
  };

  await KV.put(debugKey, JSON.stringify(debugPayload));

  return debugPayload;
}

/* =========================
   Worker
========================= */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // health
    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "aimatchlab-fixtures-ingest",
        version: "v6.2-final-resumable-all-leagues",
        leagues: LEAGUE_SEEDS.length,
        runChunkSize: RUN_CHUNK_SIZE,
        minFinal: MIN_TOTAL_MATCHES_FINAL
      });
    }

    // scheduler-compatible run routes
    const allowed =
      url.pathname === "/" ||
      url.pathname === "/internal/run" ||
      url.pathname === "/internal/ingest";

    if (!allowed) {
      return new Response("Not Found", { status: 404 });
    }

    const dayYmd = ymdFromQueryOrToday(request.url);

    // run in background, respond immediately
    ctx.waitUntil(resumableRun(env, dayYmd));

    return jsonResponse({
      ok: true,
      started: true,
      date: dayYmd,
      note: "Resumable ingest started in background (queue/staging). Check FIXTURES:DEBUG:* keys."
    });
  }
};
