
// ============================================================
// AIMATCHLAB — SCHEDULER v5.2 + STRICT STATE PATCH
// TRUE SUPERSET (PRODUCTION SAFE)
// ============================================================

import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const TZ = "Europe/Athens";

const RUN_CHUNK_SIZE = 10;
const BETWEEN_LEAGUES_DELAY_MS = 180;

const LOCK_TTL_SEC = 240;
const LOCK_STALE_SEC = 600;
const LOCK_VALUE_PREFIX = "ts:";

const STALE_PRE_MS = 3 * 60 * 60 * 1000; // 3 hours

// ------------------------------------------------------------
// Utilities
// ------------------------------------------------------------

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function kv(env){
  return env.AIML_INGESTION_KV || env.AIMATCHLAB_INGESTION_KV || env.KV;
}

function isoDayInTZ(date){
  const parts = new Intl.DateTimeFormat("en-CA",{
    timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"
  }).formatToParts(date);
  const m={}; for(const p of parts) m[p.type]=p.value;
  return `${m.year}-${m.month}-${m.day}`;
}

function addDays(ymd,delta){
  const [y,m,d]=ymd.split("-").map(Number);
  const date=new Date(Date.UTC(y,m-1,d));
  date.setUTCDate(date.getUTCDate()+delta);
  return isoDayInTZ(date);
}

function keys(day){
  return {
    queue: `FIXTURES:QUEUE:DATE:${day}`,
    staging:`FIXTURES:STAGING:DATE:${day}`,
    final:  `FIXTURES:DATE:${day}`,
    lock:   `FIXTURES:LOCK:DATE:${day}`,
    lastIngest:`FIXTURES:LAST_INGEST:${day}`,
    valueRun:`VALUE:RUN:${day}`
  };
}

function upper(x){ return String(x||"").toUpperCase(); }

function isPostponedLike(status){
  const s=upper(status);
  return (
    s.includes("POSTPON")||
    s.includes("SUSP")||
    s.includes("DELAY")||
    s.includes("CANCEL")||
    s.includes("ABAND")
  );
}

function isFinal(status){
  return upper(status).includes("FINAL");
}

function parseLockTs(val){
  const v=String(val||"");
  if(!v.startsWith(LOCK_VALUE_PREFIX)) return 0;
  return Number(v.slice(LOCK_VALUE_PREFIX.length))||0;
}

// ------------------------------------------------------------
// LOCK (Self-Heal)
// ------------------------------------------------------------

async function acquireLock(env,day){
  const store=kv(env);
  const K=keys(day);
  const now=Date.now();
  const existing=await store.get(K.lock);
  if(existing){
    const ts=parseLockTs(existing);
    const age=Math.floor((now-ts)/1000);
    if(age < LOCK_TTL_SEC) return false;
  }
  await store.put(K.lock,`${LOCK_VALUE_PREFIX}${now}`,{expirationTtl:LOCK_TTL_SEC});
  return true;
}

async function releaseLock(env,day){
  const store=kv(env);
  const K=keys(day);
  try{ await store.delete(K.lock);}catch(_){}
}

// ------------------------------------------------------------
// STRICT NORMALIZE PATCH (added to v5.2)
// ------------------------------------------------------------

function normalize(evt,slug,name,day){

  const id=String(evt?.id||"");
  if(!id) return null;

  const comp=evt?.competitions?.[0];
  const competitors=comp?.competitors||[];

  const home=competitors.find(c=>c.homeAway==="home")||{};
  const away=competitors.find(c=>c.homeAway==="away")||{};

  const st=comp?.status?.type||{};
  const rawName=upper(st?.name);
  const rawState=String(st?.state||"").toLowerCase();
  const completed=st?.completed===true;

  let status="STATUS_SCHEDULED";

  if(completed||rawState==="post"||rawName.includes("FINAL"))
    status="STATUS_FINAL";
  else if(rawState==="in")
    status="STATUS_IN_PROGRESS";
  else if(isPostponedLike(rawName))
    status="STATUS_POSTPONED";

  const minute=st?.shortDetail||comp?.status?.displayClock||null;
  const kickoff=comp?.date||null;
  const kickoff_ms=kickoff?Date.parse(kickoff):null;

  const scoreHome=Number(home?.score??0);
  const scoreAway=Number(away?.score??0);

  // --- PATCH 1: Hard FT minute detection
  if(minute && upper(minute).includes("FT")){
    status="STATUS_FINAL";
  }

  // --- PATCH 2: Stale PRE auto-fix (3h)
  if(
    status==="STATUS_SCHEDULED" &&
    kickoff_ms &&
    (Date.now()-kickoff_ms > STALE_PRE_MS) &&
    (scoreHome+scoreAway>0)
  ){
    status="STATUS_FINAL";
  }

  return {
    id,
    home:home?.team?.displayName||"Home",
    away:away?.team?.displayName||"Away",
    kickoff,
    kickoff_ms,
    scoreHome,
    scoreAway,
    minute,
    status,
    leagueSlug:slug,
    leagueName:name,
    dayKey: isoDayInTZ(new Date(kickoff_ms))
  };
}

// ------------------------------------------------------------
// FETCH LEAGUE
// ------------------------------------------------------------

async function fetchLeague(slug,day){

  const dateKey=day.replaceAll("-","");
  const url=`${ESPN_BASE}/${slug}/scoreboard?dates=${dateKey}`;

  const res=await fetch(url);
  if(!res.ok) return [];

  const json=await res.json().catch(()=>null);
  const events=Array.isArray(json?.events)?json.events:[];
  const name=LEAGUE_NAME_MAP[slug]||slug;

  return events.map(e=>normalize(e,slug,name,day)).filter(Boolean);
}

// ------------------------------------------------------------
// INGEST (UNCHANGED CORE v5.2)
// ------------------------------------------------------------

async function ingestDay(env,day){

  const store=kv(env);
  const K=keys(day);

  // allow re-ingest for yesterday if stale
  const finalExists = await store.get(K.final);
  if(finalExists){
    const parsed = JSON.parse(finalExists);
    const age = Date.now() - (parsed.finalizedAt || 0);
    if(age < 6 * 60 * 60 * 1000){ // 6h safety window
      return;
    }
  }


  if(!(await store.get(K.queue))){
    await store.put(K.queue,JSON.stringify([...LEAGUE_SEEDS]));
  }

  const queueRaw=await store.get(K.queue);
  const queue=queueRaw?JSON.parse(queueRaw):[];
  if(!queue.length) return;

  const chunk=queue.slice(0,RUN_CHUNK_SIZE);
  const remaining=queue.slice(RUN_CHUNK_SIZE);

  const stagingRaw=await store.get(K.staging);
  const staging=stagingRaw?JSON.parse(stagingRaw):{date:day,matches:[]};
  const map=new Map((staging.matches||[]).map(x=>[x.id,x]));

  for(const slugObj of chunk){

    const slug=slugObj.slug||slugObj;
    const matches=await fetchLeague(slug,day);

    for(const m of matches){
      if(isPostponedLike(m.status)){
        map.delete(m.id);
      } else {
        map.set(m.id,m);
      }
    }

    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  staging.matches=[...map.values()];

  await store.put(K.staging,JSON.stringify(staging));
  await store.put(K.queue,JSON.stringify(remaining));
  await store.put(K.lastIngest,String(Date.now()),{expirationTtl:86400*3});
}

// ------------------------------------------------------------
// STRICT FINALIZE (same logic as v5.2, PP excluded)
// ------------------------------------------------------------

async function finalizeIfSafe(env,day){

  const store = kv(env);
  const K = keys(day);

  // -----------------------------
  // Allow reopen window (8h)
  // -----------------------------
  const existingFinal = await store.get(K.final);
  if(existingFinal){
    try{
      const parsed = JSON.parse(existingFinal);
      const age = Date.now() - (parsed.finalizedAt || 0);

      // μέσα σε 8 ώρες δεν ξανακλείνουμε
      if(age < 8 * 60 * 60 * 1000){
        return;
      }

      // μετά τις 8h επιτρέπουμε re-finalize
      await store.delete(K.final);

    }catch(_){
      // αν σπάσει το parse, διαγράφουμε για ασφάλεια
      await store.delete(K.final);
    }
  }

  // -----------------------------
  // Load staging
  // -----------------------------
  const stagingRaw = await store.get(K.staging);
  if(!stagingRaw) return;

  const staging = JSON.parse(stagingRaw);
  const matches = Array.isArray(staging?.matches) ? staging.matches : [];
  if(!matches.length) return;

  const now = Date.now();

  // -----------------------------
  // Safety: kickoff + 4h window
  // -----------------------------
  for(const m of matches){

    if(!m.kickoff_ms) return;

    // Αν δεν έχουν περάσει 4 ώρες από kickoff, μην κλείνεις
    if(now < m.kickoff_ms + 4 * 60 * 60 * 1000){
      return;
    }

    // Αν δεν είναι FINAL και δεν είναι postponed-like → μην κλείνεις
    if(
      !isPostponedLike(m.status) &&
      !isFinal(m.status)
    ){
      return;
    }
  }

  // -----------------------------
  // FINALIZE
  // -----------------------------
  await store.put(K.final, JSON.stringify({
    date: day,
    finalizedAt: Date.now(),
    total: matches.length,
    matches
  }));

  try{ await store.delete(K.queue); }catch(_){}
  try{ await store.delete(K.staging); }catch(_){}
}
// ------------------------------------------------------------
// VALUE RUN (queue-safe, unchanged)
// ------------------------------------------------------------

async function runValueWhenReady(env,day){

  const store=kv(env);
  const API=env.API_BASE_URL;
  if(!API) return;

  const K=keys(day);

  if(await store.get(K.valueRun)) return;

  const queueRaw=await store.get(K.queue);
  const queue=queueRaw?JSON.parse(queueRaw):[];
  if(queue.length>0) return;

  const res=await fetch(`${API}/value/run?date=${day}&force=1`);
  const data=await res.json().catch(()=>null);

  if(res.ok && data?.ok){
    await store.put(K.valueRun,"1",{expirationTtl:86400});
  }
}

// ------------------------------------------------------------
// CRON (NOW with Tomorrow ingest)
// ------------------------------------------------------------

async function cronTick(env){

  const athensToday = isoDayInTZ(new Date());
  const athensYesterday = addDays(athensToday,-1);
  const athensTomorrow = addDays(athensToday,1);

  for(const day of [athensYesterday, athensToday, athensTomorrow]){

    const locked = await acquireLock(env,day);
    if(!locked) continue;

    try{
      await ingestDay(env,day);
      await finalizeIfSafe(env,day);
      await runValueWhenReady(env,day);
    } finally {
      await releaseLock(env,day);
    }
  }
}


// ------------------------------------------------------------
// WORKER EXPORT (REQUIRED FOR CLOUDFLARE)
// ------------------------------------------------------------

export default {

  async fetch(request, env, ctx) {
    return new Response("aimatchlab-scheduler active", { status: 200 });
  },

  async scheduled(event, env, ctx) {
    try{
      await cronTick(env);
    }catch(err){
      console.error("SCHEDULER CRASH", err);
    }
  }

};

