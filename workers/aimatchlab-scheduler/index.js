
// ============================================================
// AIMATCHLAB — SCHEDULER v4.8.0 (FINAL STABLE)
// - Ingest TODAY + YESTERDAY (fix midnight ESPN issue)
// - Safe finalize
// - Safe bulk odds (window protected + success check)
// - Safe value generation (success check)
// - No duplicate flags
// ============================================================

import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const DEFAULT_TZ = "Europe/Athens";

const RUN_CHUNK_SIZE = 10;
const BETWEEN_LEAGUES_DELAY_MS = 180;

function kv(env){
  if(!env?.AIML_INGESTION_KV) throw new Error("Missing AIML_INGESTION_KV");
  return env.AIML_INGESTION_KV;
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function ymdGR(offsetDays=0){
  const d=new Date();
  d.setDate(d.getDate()+offsetDays);
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:DEFAULT_TZ,
    year:"numeric",month:"2-digit",day:"2-digit"
  }).format(d);
}

function hourGR(){
  return new Intl.DateTimeFormat("en-GB",{
    timeZone:DEFAULT_TZ,
    hour:"2-digit",
    hour12:false
  }).format(new Date());
}

function keys(day){
  return {
    queue:`FIXTURES:QUEUE:DATE:${day}`,
    staging:`FIXTURES:STAGING:DATE:${day}`,
    final:`FIXTURES:DATE:${day}`,
    lock:`FIXTURES:LOCK:DATE:${day}`,
    progress:`SCHEDULER:PROGRESS:${day}`
  };
}

function kickoffDayGR(kickoff){
  return new Intl.DateTimeFormat("en-CA",{
    timeZone:DEFAULT_TZ,
    year:"numeric",month:"2-digit",day:"2-digit"
  }).format(new Date(kickoff));
}

function normalize(evt,slug,name){
  const id=String(evt?.id||"");
  if(!id) return null;

  const comps=evt?.competitions?.[0]?.competitors||[];
  const home=comps.find(c=>c.homeAway==="home")||{};
  const away=comps.find(c=>c.homeAway==="away")||{};

  const kickoff=evt?.date||null;
  const kickoff_ms=kickoff?Date.parse(kickoff):null;

  const raw=String(evt?.status?.type?.name||"").toUpperCase();
  let status="STATUS_SCHEDULED";
  if(raw.includes("FINAL")) status="STATUS_FINAL";
  else if(raw.includes("IN_PROGRESS")) status="STATUS_IN_PROGRESS";
  else if(raw.includes("POSTPONED")||raw.includes("CANCEL")) status="STATUS_POSTPONED";

  return {
    id,
    home:home?.team?.displayName||"Home",
    away:away?.team?.displayName||"Away",
    kickoff,
    kickoff_ms,
    scoreHome:Number(home?.score??0)||0,
    scoreAway:Number(away?.score??0)||0,
    status,
    leagueSlug:slug,
    leagueName:name,
    dayKey:kickoff?kickoffDayGR(kickoff):null
  };
}

async function fetchLeague(slug,day){
  const compact=day.replaceAll("-","");
  const url=`${ESPN_BASE}/${slug}/scoreboard?dates=${compact}`;
  const res=await fetch(url,{headers:{accept:"application/json"}});
  if(!res.ok) return [];
  const json=await res.json();
  const events=Array.isArray(json?.events)?json.events:[];
  const name=LEAGUE_NAME_MAP?.[slug]||slug;
  return events.map(e=>normalize(e,slug,name)).filter(Boolean);
}

async function ingestDay(env,day){
  const K=keys(day);
  const store=kv(env);

  if(!(await store.get(K.queue))){
    await store.put(K.queue,JSON.stringify([...LEAGUE_SEEDS]));
  }

  const queueRaw=await store.get(K.queue);
  const queue=queueRaw?JSON.parse(queueRaw):[];
  if(!queue.length) return;

  const chunk=queue.slice(0,RUN_CHUNK_SIZE);
  const remaining=queue.slice(RUN_CHUNK_SIZE);

  for(const slug of chunk){
    const matches=await fetchLeague(slug,day);
    for(const m of matches){
      if(!m.dayKey) continue;
      const existingRaw=await store.get(keys(m.dayKey).staging);
      const staging=existingRaw?JSON.parse(existingRaw):{date:m.dayKey,matches:[]};
      const map=new Map(staging.matches.map(x=>[x.id,x]));
      map.set(m.id,m);
      staging.matches=[...map.values()];
      await store.put(keys(m.dayKey).staging,JSON.stringify(staging));
    }
    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  await store.put(K.queue,JSON.stringify(remaining));
}

async function finalizeIfSafe(env,day){
  const store=kv(env);
  const K=keys(day);
  const stagingRaw=await store.get(K.staging);
  if(!stagingRaw) return false;

  const staging=JSON.parse(stagingRaw);
  const allFinal=staging.matches.length>0 &&
    staging.matches.every(m=>m.status==="STATUS_FINAL"||m.status==="STATUS_POSTPONED");

  if(!allFinal) return false;

  await store.put(K.final,JSON.stringify({
    ok:true,date:day,total:staging.matches.length,matches:staging.matches
  }));

  await store.delete(K.staging);
  await store.put(K.lock,"1");
  return true;
}

export default {
  async scheduled(event,env){

    const store=kv(env);
    const today=ymdGR(0);
    const yesterday=ymdGR(-1);
    const hourUTC=new Date().getUTCHours();
    const hourLocal=hourGR();
    const API=env.API_BASE_URL||"";

    await store.put("SCHEDULER:LAST_RUN",JSON.stringify({
      ts:Date.now(),iso:new Date().toISOString()
    }));

    // === INGEST TODAY + YESTERDAY ===
    await ingestDay(env,today);
    await ingestDay(env,yesterday);

    await finalizeIfSafe(env,today);
    await finalizeIfSafe(env,yesterday);

    // === ODDS WINDOW (UTC 4–6 & 13–15) ===
    if((hourUTC>=4&&hourUTC<6)||(hourUTC>=13&&hourUTC<15)){
      const slot=hourUTC>=13?"PM":"AM";
      const flag=`ODDS:RUN:${today}:${slot}`;
      if(!(await store.get(flag)) && API){
        try{
          const res = await fetch(
            `${API}/odds/internal/run?date=${today}&days=0`
          );

          const data=await res.json().catch(()=>null);
          if(res.ok && data?.ok){
            await store.put(flag,"1",{expirationTtl:86400});
          }
        }catch(e){}
      }
    }

    // === VALUE AFTER 05 GR ===
    if(hourLocal>="05"){
      const flag=`VALUE:RUN:${today}`;
      if(!(await store.get(flag)) && API){
        try{
          const res=await fetch(`${API}/value/run?date=${today}`);
          const data=await res.json().catch(()=>null);
          if(res.ok && data?.ok){
            await store.put(flag,"1",{expirationTtl:86400});
          }
        }catch(e){}
      }
    }
  }
};
