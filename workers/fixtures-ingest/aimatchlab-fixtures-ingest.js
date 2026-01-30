/**
 * aimatchlab-fixtures-ingest.js
 * V6.4 — RESUMABLE ALL-LEAGUES FIXTURES INGEST (SUBREQUEST-SAFE + FORCE FINALIZE)
 *
 * Fixes:
 * - Prevent endless queue lock when Cloudflare returns "Too many subrequests."
 * - Allow fast progress with burst=N
 * - Add /internal/finalize to write FIXTURES:DATE:<day> from staging even if queue isn't empty
 * - Keep SAME match schema as v6.2
 */

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const DEFAULT_TZ = "Europe/Athens";

/** ✅ ALL leagues you want */
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

const RUN_CHUNK_SIZE = 10;
const BETWEEN_LEAGUES_DELAY_MS = 180;

const FETCH_RETRIES = 1;
const RETRY_DELAY_MS = 350;

/** always allow finalize when queue empty */
const MIN_TOTAL_MATCHES_FINAL = 0;

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

function clampBurst(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 1;
  return Math.max(1, Math.min(6, Math.floor(x))); // IMPORTANT: keep burst low to avoid subrequest limits
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

function getKV(env) {
  return env.AIMATCHLAB_KV_CORE;
}

function isTooManySubrequestsError(errMsg) {
  const s = String(errMsg || "");
  return s.toLowerCase().includes("too many subrequests");
}

/* =========================
   ESPN fetch per league
========================= */

async function fetchLeagueOnce(leagueSlug, dayYmd, tz) {
  const url = `${ESPN_BASE}/${leagueSlug}/scoreboard?dates=${ymdCompact(dayYmd)}`;

  const r = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "aimatchlab-fixtures-ingest/v6.4-finalize-safe"
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
    if (m.dayKey !== dayYmd) continue;
    out.push(m);
  }

  return { ok: true, league: leagueSlug, matches: out };
}

async function fetchLeagueWithRetry(leagueSlug, dayYmd, tz) {
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    try {
      const res = await fetchLeagueOnce(leagueSlug, dayYmd, tz);
      if (res.ok) return res;

      if ([429, 500, 502, 503, 504].includes(res.status)) {
        if (attempt < FETCH_RETRIES) {
          await sleep(RETRY_DELAY_MS);
          continue;
        }
      }

      return res;
    } catch (e) {
      const msg = String(e?.message || e);

      if (attempt < FETCH_RETRIES && !isTooManySubrequestsError(msg)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      return {
        ok: false,
        type: "exception",
        league: leagueSlug,
        error: msg,
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
   Load helpers
========================= */

async function loadQueue(KV, dayYmd) {
  const queueKey = `FIXTURES:QUEUE:DATE:${dayYmd}`;
  let queueRaw = await KV.get(queueKey);
  let queue = queueRaw ? JSON.parse(queueRaw) : null;

  if (!Array.isArray(queue) || queue.length === 0) {
    queue = [...LEAGUE_SEEDS];
    await KV.put(queueKey, JSON.stringify(queue));
  }

  return { queueKey, queue };
}

async function loadStaging(KV, dayYmd, tz) {
  const stagingKey = `FIXTURES:STAGING:DATE:${dayYmd}`;
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

  return { stagingKey, stagingPayload };
}

async function writeFinalIfPossible(KV, dayYmd, tz, stagingPayload) {
  const finalKey = `FIXTURES:DATE:${dayYmd}`;

  const finalPayload = {
    date: dayYmd,
    timezone: tz,
    createdAt: Date.now(),
    source: "espn_resumable_final",
    matches: stagingPayload.matches
  };

  if (stagingPayload.matches.length >= MIN_TOTAL_MATCHES_FINAL) {
    await KV.put(finalKey, JSON.stringify(finalPayload));
    return { ok: true, wroteFinal: true, finalKey };
  }

  return { ok: true, wroteFinal: false, finalKey };
}

/* =========================
   Single chunk run
========================= */

async function resumableRunOnce(env, dayYmd) {
  const tz = DEFAULT_TZ;
  const KV = getKV(env);

  if (!KV) {
    return {
      ok: false,
      reason: "missing_kv_binding",
      note: "Bind AIMATCHLAB_KV_CORE in this worker."
    };
  }

  const debugKey = `FIXTURES:DEBUG:DATE:${dayYmd}:LAST_RUN`;

  const { queueKey, queue } = await loadQueue(KV, dayYmd);
  const { stagingKey, stagingPayload } = await loadStaging(KV, dayYmd, tz);

  const startedWithQueue = queue.length;

  const chunk = queue.slice(0, RUN_CHUNK_SIZE);
  let rest = queue.slice(RUN_CHUNK_SIZE);

  const produced = [];
  const errors = [];
  const skipped = []; // leagues skipped due to subrequest limit

  for (const leagueSlug of chunk) {
    const res = await fetchLeagueWithRetry(leagueSlug, dayYmd, tz);

    if (res.ok) {
      if (res.matches?.length) produced.push(...res.matches);
    } else {
      const errMsg = String(res.error || "");

      // CRITICAL FIX:
      // If we hit "Too many subrequests.", do NOT push it back to the queue,
      // otherwise queue never empties (infinite loop).
      if (isTooManySubrequestsError(errMsg)) {
        skipped.push({ league: leagueSlug, error: errMsg });
      } else {
        errors.push({
          type: res.type || "error",
          league: res.league,
          status: res.status,
          error: errMsg
        });

        // retry later (ONLY for non-subrequest errors)
        rest.push(leagueSlug);
      }
    }

    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  stagingPayload.matches = mergeUniqueById(stagingPayload.matches, produced);
  stagingPayload.createdAt = Date.now();

  await KV.put(stagingKey, JSON.stringify(stagingPayload));
  await KV.put(queueKey, JSON.stringify(rest));

  let finalized = false;
  let wroteFinal = false;

  if (rest.length === 0) {
    finalized = true;
    const w = await writeFinalIfPossible(KV, dayYmd, tz, stagingPayload);
    wroteFinal = !!w.wroteFinal;
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
    skippedCount: skipped.length,
    errors,
    skipped,
    finalized,
    wroteFinal,
    keys: {
      queueKey,
      stagingKey,
      finalKey: `FIXTURES:DATE:${dayYmd}`,
      debugKey
    }
  };

  await KV.put(debugKey, JSON.stringify(debugPayload));

  return debugPayload;
}

/* =========================
   Burst runner
========================= */

async function resumableRunBurst(env, dayYmd, burstCount) {
  const burst = clampBurst(burstCount);

  let last = null;
  const snapshots = [];

  for (let i = 0; i < burst; i++) {
    last = await resumableRunOnce(env, dayYmd);

    snapshots.push({
      i: i + 1,
      processedNow: last?.processedNow || 0,
      queueRemaining: last?.queueRemaining ?? null,
      producedMatchesNow: last?.producedMatchesNow || 0,
      totalUniqueMatchesStaging: last?.totalUniqueMatchesStaging || 0,
      finalized: !!last?.finalized,
      wroteFinal: !!last?.wroteFinal,
      skippedCount: last?.skippedCount || 0,
      errorsCount: last?.errorsCount || 0
    });

    if (last?.ok && last?.queueRemaining === 0) break;
  }

  return {
    ok: true,
    date: dayYmd,
    burst,
    done: !!(last && last.queueRemaining === 0),
    last,
    snapshots
  };
}

/* =========================
   Force finalize
========================= */

async function forceFinalize(env, dayYmd) {
  const tz = DEFAULT_TZ;
  const KV = getKV(env);

  if (!KV) {
    return {
      ok: false,
      reason: "missing_kv_binding",
      note: "Bind AIMATCHLAB_KV_CORE in this worker."
    };
  }

  const { stagingPayload } = await loadStaging(KV, dayYmd, tz);
  const w = await writeFinalIfPossible(KV, dayYmd, tz, stagingPayload);

  return {
    ok: true,
    date: dayYmd,
    forced: true,
    stagingMatches: stagingPayload.matches.length,
    wroteFinal: !!w.wroteFinal,
    finalKey: w.finalKey
  };
}

/* =========================
   Worker
========================= */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        service: "aimatchlab-fixtures-ingest",
        version: "v6.4-finalize-safe",
        leagues: LEAGUE_SEEDS.length,
        runChunkSize: RUN_CHUNK_SIZE,
        minFinal: MIN_TOTAL_MATCHES_FINAL
      });
    }

    // allow ingest run
    const isRun =
      url.pathname === "/" ||
      url.pathname === "/internal/run" ||
      url.pathname === "/internal/ingest";

    // allow finalize
    const isFinalize = url.pathname === "/internal/finalize";

    if (!isRun && !isFinalize) {
      return new Response("Not Found", { status: 404 });
    }

    const dayYmd = ymdFromQueryOrToday(request.url);

    if (isFinalize) {
      const res = await forceFinalize(env, dayYmd);
      return jsonResponse(res);
    }

    const burst = url.searchParams.get("burst") || "1";
    const res = await resumableRunBurst(env, dayYmd, burst);

    return jsonResponse(res);
  }
};
