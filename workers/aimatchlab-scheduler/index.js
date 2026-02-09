
// ============================================================
// AIMATCHLAB — CLEAN SCHEDULER (INGEST ONLY)
// ============================================================

import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const DEFAULT_TZ = "Europe/Athens";

const RUN_CHUNK_SIZE = 10;
const BETWEEN_LEAGUES_DELAY_MS = 180;
const FETCH_RETRIES = 1;
const RETRY_DELAY_MS = 350;
const MIN_TOTAL_MATCHES_FINAL = 1;

function keysForDay(dayYmd) {
  return {
    queueKey:   `FIXTURES:QUEUE:DATE:${dayYmd}`,
    stagingKey: `FIXTURES:STAGING:DATE:${dayYmd}`,
    finalKey:   `FIXTURES:DATE:${dayYmd}`,
    debugKey:   `FIXTURES:DEBUG:DATE:${dayYmd}:LAST_RUN`,
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

function ymdFromQueryOrToday(urlStr,tz=DEFAULT_TZ){
  const u=new URL(urlStr);
  const q=u.searchParams.get("date");
  if(q&&/^\d{4}-\d{2}-\d{2}$/.test(q)) return q;

  return new Intl.DateTimeFormat("en-CA",{
    timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"
  }).format(new Date());
}

function ymdCompact(ymd){ return String(ymd).replaceAll("-",""); }

function normalizeEspnEvent(evt,leagueSlug,leagueName,tz,targetDayYmd){
  const id=String(evt?.id||evt?.uid||"");
  if(!id) return null;

  const competitors=evt?.competitions?.[0]?.competitors||[];
  const home=competitors.find(c=>c?.homeAway==="home")||{};
  const away=competitors.find(c=>c?.homeAway==="away")||{};

  const kickoff=evt?.date||null;
  const kickoff_ms=kickoff?Date.parse(kickoff):null;

  const scoreHome=Number(home?.score??0)||0;
  const scoreAway=Number(away?.score??0)||0;

  return {
    id,
    home:home?.team?.displayName||"Home",
    away:away?.team?.displayName||"Away",
    kickoff,
    kickoff_ms,
    scoreHome,
    scoreAway,
    leagueSlug,
    leagueName,
    dayKey:targetDayYmd
  };
}

async function fetchLeague(leagueSlug,dayYmd,tz){
  const compact=ymdCompact(dayYmd);
  const url=`${ESPN_BASE}/${leagueSlug}/scoreboard?dates=${compact}`;

  const res=await fetch(url,{headers:{accept:"application/json"}});
  if(!res.ok) return [];

  const json=await res.json();
  const events=Array.isArray(json?.events)?json.events:[];
  const leagueName=LEAGUE_NAME_MAP?.[leagueSlug]||leagueSlug;

  return events
    .map(e=>normalizeEspnEvent(e,leagueSlug,leagueName,tz,dayYmd))
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
  const tz=DEFAULT_TZ;
  const {queueKey,stagingKey}=keysForDay(dayYmd);

  await ensureQueueInitialized(env,dayYmd);

  const queueRaw=await kv.get(queueKey);
  const queue=queueRaw?JSON.parse(queueRaw):[];

  const chunk=queue.slice(0,RUN_CHUNK_SIZE);
  const remaining=queue.slice(RUN_CHUNK_SIZE);

  const stagingRaw=await kv.get(stagingKey);
  const staging=stagingRaw?JSON.parse(stagingRaw):{date:dayYmd,matches:[]};

  for(const league of chunk){
    const matches=await fetchLeague(league,dayYmd,tz);
    staging.matches=[...staging.matches,...matches];
    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  await kv.put(queueKey,JSON.stringify(remaining));
  await kv.put(stagingKey,JSON.stringify(staging));

  return { ok:true,date:dayYmd,queueRemaining:remaining.length };
}

async function finalizeDay(env,dayYmd){
  const kv=getKV(env);
  const {queueKey,stagingKey,finalKey}=keysForDay(dayYmd);

  const stagingRaw=await kv.get(stagingKey);
  const staging=stagingRaw?JSON.parse(stagingRaw):{matches:[]};

  if(staging.matches.length<MIN_TOTAL_MATCHES_FINAL){
    return { ok:false,message:"Not enough matches" };
  }

  await kv.put(finalKey,JSON.stringify({
    ok:true,
    date:dayYmd,
    total:staging.matches.length,
    matches:staging.matches
  }));

  await kv.delete(queueKey);
  await kv.delete(stagingKey);

  return { ok:true,finalized:true,total:staging.matches.length };
}

export default {
  async scheduled(event,env,ctx){
    const now=new Date();
    const dayYmd=new Intl.DateTimeFormat("en-CA",{
      timeZone:DEFAULT_TZ,
      year:"numeric",month:"2-digit",day:"2-digit"
    }).format(now);

    const LOCK_KEY=`FIXTURES:LOCK:DATE:${dayYmd}`;
    const lock=await env.AIML_INGESTION_KV.get(LOCK_KEY);
    if(lock) return;

    const last=await resumableRun(env,dayYmd);

    if(last.queueRemaining<=0){
      const fin=await finalizeDay(env,dayYmd);
      if(fin?.finalized){
        await env.AIML_INGESTION_KV.put(LOCK_KEY,"1",{expirationTtl:12*60*60});
      }
    }
  },

  async fetch(request,env,ctx){
    const url=new URL(request.url);

    if(url.pathname==="/") {
      return jsonResponse({
        ok:true,
        service:"aimatchlab-scheduler-clean",
        mode:"INGEST_ONLY"
      });
    }

    if(url.pathname==="/internal/run"){
      const day=ymdFromQueryOrToday(request.url);
      const out=await resumableRun(env,day);
      return jsonResponse(out);
    }

    if(url.pathname==="/internal/finalize"){
      const day=ymdFromQueryOrToday(request.url);
      const out=await finalizeDay(env,day);
      return jsonResponse(out);
    }

    return jsonResponse({ok:false,error:"not_found"},404);
  }
};
