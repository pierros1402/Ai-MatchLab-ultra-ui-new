// ============================================================
// AIMATCHLAB — SCHEDULER v5.1 (CLEAN QUEUE-DRIVEN VALUE)
// - Queue-based ingest per day
// - Safe finalize when ALL matches FINAL/POSTPONED
// - Self-heal LOCK
// - Value runs ONLY when today's ingest queue is finished
// ============================================================

import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const TZ = "Europe/Athens";

const RUN_CHUNK_SIZE = 10;
const BETWEEN_LEAGUES_DELAY_MS = 180;

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function keys(dayYmd) {
  return {
    queue: `FIXTURES:QUEUE:DATE:${dayYmd}`,
    staging: `FIXTURES:STAGING:DATE:${dayYmd}`,
    final: `FIXTURES:DATE:${dayYmd}`,
    lock: `FIXTURES:LOCK:DATE:${dayYmd}`,
    lastIngest: `FIXTURES:LAST_INGEST:${dayYmd}`,
  };
}

function kv(env) {
  return env.AIML_INGESTION_KV || env.AIMATCHLAB_INGESTION_KV || env.KV;
}

function isoDayInTZ(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const map = {};
  for (const p of parts) map[p.type] = p.value;

  return `${map.year}-${map.month}-${map.day}`;
}

function addDays(ymd, delta) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return isoDayInTZ(d, "UTC");
}

function isFinalish(status) {
  const s = String(status || "").toUpperCase();
  return s.includes("FINAL") || s.includes("POSTPONED");
}

// ------------------------------------------------------------
// Normalize ESPN
// ------------------------------------------------------------

function normalize(evt, slug, name, dayYmd) {
  const id = String(evt?.id || "");
  if (!id) return null;

  const comps = evt?.competitions?.[0]?.competitors || [];
  const home = comps.find(c => c.homeAway === "home") || {};
  const away = comps.find(c => c.homeAway === "away") || {};

  const st = evt?.status?.type || {};
  const rawName = String(st?.name || "").toUpperCase();
  const rawState = String(st?.state || "").toLowerCase();
  const completed = st?.completed === true;

  let status = "STATUS_SCHEDULED";
  if (completed || rawState === "post" || rawName.includes("FINAL"))
    status = "STATUS_FINAL";
  else if (rawState === "in")
    status = "STATUS_IN_PROGRESS";
  else if (rawName.includes("POSTPONED"))
    status = "STATUS_POSTPONED";

  return {
    id,
    home: home?.team?.displayName || "Home",
    away: away?.team?.displayName || "Away",
    kickoff: evt?.date || null,
    kickoff_ms: evt?.date ? Date.parse(evt.date) : null,
    scoreHome: Number(home?.score ?? 0),
    scoreAway: Number(away?.score ?? 0),
    minute: evt?.status?.type?.shortDetail ?? evt?.status?.displayClock ?? null,
    status,
    leagueSlug: slug,
    leagueName: name,
    dayKey: dayYmd
  };
}

async function fetchLeague(slug, dayYmd) {
  const dayKey = dayYmd.replaceAll("-", "");
  const url = `${ESPN_BASE}/${slug}/scoreboard?dates=${dayKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch_failed:${slug}`);

  const data = await res.json().catch(()=>null);
  const events = Array.isArray(data?.events) ? data.events : [];
  const name = LEAGUE_NAME_MAP[slug] || "";

  return events
    .map(evt => normalize(evt, slug, name, dayYmd))
    .filter(Boolean);
}

// ------------------------------------------------------------
// Ingest
// ------------------------------------------------------------

async function ingestDay(env, dayYmd) {
  const store = kv(env);
  const K = keys(dayYmd);

  const finalExists = await store.get(K.final);
  if (finalExists)
    return { ok:true, day:dayYmd, skipped:"final_exists" };

  if (!(await store.get(K.queue)))
    await store.put(K.queue, JSON.stringify([...LEAGUE_SEEDS]));

  const queueRaw = await store.get(K.queue);
  const queue = queueRaw ? JSON.parse(queueRaw) : [];

  if (!queue.length) {

  const stagingRaw = await store.get(K.staging);
  if (stagingRaw) {
    const staging = JSON.parse(stagingRaw);
    const hasNonFinal = staging.matches?.some(m => !isFinalish(m.status));

    if (hasNonFinal) {
      await store.put(K.queue, JSON.stringify([...LEAGUE_SEEDS]));
      return { ok:true, day:dayYmd, refilled:true };
    }
  }

  return { ok:true, day:dayYmd, skipped:"queue_empty" };
}


  const chunk = queue.slice(0, RUN_CHUNK_SIZE);
  const remaining = queue.slice(RUN_CHUNK_SIZE);

  for (const slug of chunk) {
    const matches = await fetchLeague(slug, dayYmd);

    if (matches.length) {
      const existingRaw = await store.get(K.staging);
      const staging = existingRaw
        ? JSON.parse(existingRaw)
        : { date:dayYmd, matches:[] };

      const map = new Map(staging.matches.map(x=>[x.id,x]));
      for (const m of matches) map.set(m.id, m);

      staging.matches = [...map.values()];
      await store.put(K.staging, JSON.stringify(staging));
    }

    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  await store.put(K.queue, JSON.stringify(remaining));
  return { ok:true, day:dayYmd, processed:chunk.length, remaining:remaining.length };
}

// ------------------------------------------------------------
// Finalize (archival only)
// ------------------------------------------------------------

async function finalizeIfSafe(env, dayYmd) {
  const store = kv(env);
  const K = keys(dayYmd);

  if (await store.get(K.final))
    return { ok:true, skipped:"final_exists" };

  const stagingRaw = await store.get(K.staging);
  if (!stagingRaw)
    return { ok:true, skipped:"no_staging" };

  const staging = JSON.parse(stagingRaw);
  const matches = staging.matches || [];

  if (!matches.length)
    return { ok:true, skipped:"no_matches" };

  if (!matches.every(m=>isFinalish(m.status)))
    return { ok:true, skipped:"not_all_final" };

  await store.put(K.final, JSON.stringify({
    date:dayYmd,
    finalizedAt:Date.now(),
    total:matches.length,
    matches
  }));

  await store.delete(K.queue);

  return { ok:true, finalized:true };
}

// ------------------------------------------------------------
// VALUE (QUEUE-DRIVEN)
// ------------------------------------------------------------

async function runValueWhenReady(env, dayYmd) {
  const store = kv(env);
  const API = env.API_BASE_URL;
  if (!API) return { ok:false, skipped:"no_api" };

  const K = keys(dayYmd);
  const flag = `VALUE:RUN:${dayYmd}`;

  if (await store.get(flag))
    return { ok:true, skipped:"already_ran" };

  const queueRaw = await store.get(K.queue);
  const queue = queueRaw ? JSON.parse(queueRaw) : [];

  if (queue.length > 0)
    return { ok:true, skipped:"queue_not_finished" };

  const stagingRaw = await store.get(K.staging);
  if (!stagingRaw)
    return { ok:true, skipped:"no_staging" };

  const staging = JSON.parse(stagingRaw);
  if (!staging.matches?.length)
    return { ok:true, skipped:"no_matches" };

  const res = await fetch(`${API}/value/run?date=${dayYmd}`);
  const data = await res.json().catch(()=>null);

  if (res.ok && data?.ok) {
    await store.put(flag,"1",{expirationTtl:86400});
    return { ok:true, ran:true };
  }

  return { ok:false, error:"value_failed" };
}

// ------------------------------------------------------------
// CRON
// ------------------------------------------------------------

async function cronTick(env) {
  const today = isoDayInTZ(new Date(), TZ);
  const yesterday = addDays(today,-1);

  const ingToday = await ingestDay(env,today);
  const ingYest = await ingestDay(env,yesterday);

  const finYest = await finalizeIfSafe(env,yesterday);
  const finToday = await finalizeIfSafe(env,today);

  const value = await runValueWhenReady(env,today);

  return {
    ok:true,
    today,
    yesterday,
    ingest:{today:ingToday,yesterday:ingYest},
    finalize:{today:finToday,yesterday:finYest},
    value
  };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(cronTick(env));
  }
};
