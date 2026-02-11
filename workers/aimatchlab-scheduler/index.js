
// ============================================================
// AIMATCHLAB — STABLE SCHEDULER v4.6 (FINAL PRODUCTION)
// - Per-Kickoff Day Buckets
// - Safe Finalize (only when all matches FINAL/POSTPONED)
// - Full v4.3 Endpoints Preserved
// - Odds / Value Time-Controlled
// ============================================================

import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const DEFAULT_TZ = "Europe/Athens";

const RUN_CHUNK_SIZE = 10;
const BETWEEN_LEAGUES_DELAY_MS = 180;

function keysForDay(dayYmd) {
  return {
    queueKey:   `FIXTURES:QUEUE:DATE:${dayYmd}`,
    stagingKey: `FIXTURES:STAGING:DATE:${dayYmd}`,
    finalKey:   `FIXTURES:DATE:${dayYmd}`,
    lockKey:    `FIXTURES:LOCK:DATE:${dayYmd}`,
    progressKey:`SCHEDULER:PROGRESS:${dayYmd}`
  };
}

function getKV(env) {
  if (!env?.AIML_INGESTION_KV) {
    throw new Error("Missing KV binding AIML_INGESTION_KV");
  }
  return env.AIML_INGESTION_KV;
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function jsonResponse(obj,status=200){
  return new Response(JSON.stringify(obj,null,2),{
    status,
    headers:{ "content-type":"application/json; charset=utf-8" }
  });
}

function todayYMD(){
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:DEFAULT_TZ,
    year:"numeric",month:"2-digit",day:"2-digit"
  }).format(new Date());
}

function hourGR(){
  return new Intl.DateTimeFormat("en-GB",{
    timeZone:DEFAULT_TZ,
    hour:"2-digit",
    hour12:false
  }).format(new Date());
}

function ymdCompact(ymd){ return String(ymd).replaceAll("-",""); }

function kickoffDayGR(kickoff){
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:DEFAULT_TZ,
    year:"numeric",month:"2-digit",day:"2-digit"
  }).format(new Date(kickoff));
}

function normalizeEspnEvent(evt, leagueSlug, leagueName){
  const id = String(evt?.id || evt?.uid || "");
  if (!id) return null;

  const competitors = evt?.competitions?.[0]?.competitors || [];
  const home = competitors.find(c => c?.homeAway === "home") || {};
  const away = competitors.find(c => c?.homeAway === "away") || {};

  const kickoff = evt?.date || null;
  const kickoff_ms = kickoff ? Date.parse(kickoff) : null;

  const espnStatusRaw = String(evt?.status?.type?.name || "").toUpperCase();
  let status = "STATUS_SCHEDULED";

  if (espnStatusRaw.includes("FINAL")) {
    status = "STATUS_FINAL";
  }
  else if (espnStatusRaw.includes("IN_PROGRESS")) {
    status = "STATUS_IN_PROGRESS";
  }
  else if (
    espnStatusRaw.includes("POSTPONED") ||
    espnStatusRaw.includes("CANCEL") ||
    espnStatusRaw.includes("ABANDON") ||
    espnStatusRaw.includes("SUSPENDED")
  ) {
    status = "STATUS_POSTPONED";
  }

  let scoreHome = Number(home?.score ?? 0) || 0;
  let scoreAway = Number(away?.score ?? 0) || 0;

  // IMPORTANT: Postponed must NOT carry 0-0
  if (status === "STATUS_POSTPONED") {
    scoreHome = null;
    scoreAway = null;
  }

  return {
    id,
    home: home?.team?.displayName || "Home",
    away: away?.team?.displayName || "Away",
    kickoff,
    kickoff_ms,
    scoreHome,
    scoreAway,
    status,
    leagueSlug,
    leagueName,
    dayKey: kickoff ? kickoffDayGR(kickoff) : null
  };
}

async function fetchLeague(leagueSlug,dayYmd){
  const compact=ymdCompact(dayYmd);
  const url=`${ESPN_BASE}/${leagueSlug}/scoreboard?dates=${compact}`;

  const res=await fetch(url,{headers:{accept:"application/json"}});
  if(!res.ok) return [];

  const json=await res.json();
  const events=Array.isArray(json?.events)?json.events:[];
  const leagueName=LEAGUE_NAME_MAP?.[leagueSlug]||leagueSlug;

  return events
    .map(e=>normalizeEspnEvent(e,leagueSlug,leagueName))
    .filter(Boolean);
}

async function ensureQueueInitialized(env,dayYmd){
  const kv=getKV(env);
  const {queueKey}=keysForDay(dayYmd);
  const existing=await kv.get(queueKey);
  if(existing) return;
  await kv.put(queueKey,JSON.stringify([...LEAGUE_SEEDS]));
}

async function resumableRun(env,dayYmd){
  const kv=getKV(env);
  const {queueKey,progressKey}=keysForDay(dayYmd);

  await ensureQueueInitialized(env,dayYmd);

  const queueRaw=await kv.get(queueKey);
  const queue=queueRaw?JSON.parse(queueRaw):[];
  if(!queue.length) return { done:true };

  const chunk=queue.slice(0,RUN_CHUNK_SIZE);
  const remaining=queue.slice(RUN_CHUNK_SIZE);

  for(const league of chunk){
    const matches=await fetchLeague(league,dayYmd);

    for(const m of matches){
      if(!m.dayKey) continue;

      const {stagingKey} = keysForDay(m.dayKey);
      const existingRaw = await kv.get(stagingKey);
      const staging = existingRaw ? JSON.parse(existingRaw) : {date:m.dayKey,matches:[]};

      const map = new Map(staging.matches.map(x=>[x.id,x]));
      map.set(m.id,m);

      staging.matches = [...map.values()];
      await kv.put(stagingKey,JSON.stringify(staging));
    }

    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  await kv.put(queueKey,JSON.stringify(remaining));

  await kv.put(progressKey, JSON.stringify({
    phase:"ingest",
    remainingLeagues: remaining.length,
    ts: Date.now()
  }));

  return { done:false };
}

async function finalizeDayIfSafe(env,dayYmd){
  const kv=getKV(env);
  const {stagingKey,finalKey,progressKey,queueKey,lockKey}=keysForDay(dayYmd);

  const stagingRaw=await kv.get(stagingKey);
  if(!stagingRaw) return false;

  const staging=JSON.parse(stagingRaw);

  const allFinal = staging.matches.length > 0 &&
    staging.matches.every(m =>
      m.status === "STATUS_FINAL" ||
      m.status === "STATUS_POSTPONED"
    );

  if(!allFinal) return false;

  await kv.put(finalKey,JSON.stringify({
    ok:true,
    date:dayYmd,
    total:staging.matches.length,
    matches:staging.matches
  }));

  await kv.delete(stagingKey);
  await kv.delete(queueKey);
  await kv.put(lockKey,"1");

  await kv.put(progressKey, JSON.stringify({
    phase:"finalized",
    totalMatches: staging.matches.length,
    ts: Date.now()
  }));

  return true;
}

export default {
  async scheduled(event,env,ctx){
    const kv=getKV(env);
    const dayYmd=todayYMD();
    const {lockKey}=keysForDay(dayYmd);

    await kv.put("SCHEDULER:LAST_RUN", JSON.stringify({
      ts: Date.now(),
      iso: new Date().toISOString()
    }));

    const locked=await kv.get(lockKey);

    if(!locked){
      await resumableRun(env,dayYmd);
      await finalizeDayIfSafe(env,dayYmd);
    }

    const d = new Date(event.scheduledTime);
const hourUTC = d.getUTCHours();

if (hourUTC === 4 || hourUTC === 13) {

  const oddsFlag = `ODDS:RUN:${dayYmd}:${hourUTC}`;
  const ran = await kv.get(oddsFlag);

  if (!ran) {
    try {
      const res = await fetch(
        `${API_BASE}/api/odds/internal/run?date=${dayYmd}&days=0`
      );

      if (res.ok) {
        await kv.put(oddsFlag, "1", { expirationTtl: 86400 });
      } else {
        console.error("Odds run failed", res.status);
      }

    } catch (e) {
      console.error("Odds fetch error", e);
    }
  }
}


    if (hour === "05") {
      const valueFlag = `VALUE:RUN:${dayYmd}`;
      const ran = await kv.get(valueFlag);
      if (!ran) {
        try {
          await fetch(`${API_BASE}/api/value/run?date=${dayYmd}`);
        } catch {}
        await kv.put(valueFlag, "1", { expirationTtl: 86400 });
      }
    }
  },

  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const dayYmd=todayYMD();
    const kv=getKV(env);
    const {progressKey,finalKey,lockKey}=keysForDay(dayYmd);

    if(url.pathname==="/run-now"){
      await kv.delete(lockKey);
      await kv.delete(finalKey);
      await this.scheduled(null,env,ctx);
      return jsonResponse({ ok:true, message:"Manual run executed" });
    }

    if(url.pathname==="/finalize-now"){
      const result = await finalizeDayIfSafe(env,dayYmd);
      return jsonResponse({ ok:true, finalized: result });
    }

    if(url.pathname==="/status"){
      const progress = await kv.get(progressKey);
      const lastRun = await kv.get("SCHEDULER:LAST_RUN");
      return jsonResponse({
        ok:true,
        progress: progress ? JSON.parse(progress) : null,
        lastRun: lastRun ? JSON.parse(lastRun) : null
      });
    }

    if(url.pathname==="/"){
      return jsonResponse({
        ok:true,
        service:"aimatchlab-scheduler-v4.6",
        mode:"FINAL_PRODUCTION"
      });
    }

    return jsonResponse({ok:false,error:"not_found"},404);
  }
};
