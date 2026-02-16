
// AIMATCHLAB — SCHEDULER v8
// OWNER-BASED INGEST + SUMMARY FALLBACK
// VALUE TRIGGERED BY STAGING COMPLETION (DAY-INDEPENDENT)

import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const TZ = "Europe/Athens";

const RUN_CHUNK_SIZE = 10;
const BETWEEN_LEAGUES_DELAY_MS = 180;

const LOCK_TTL_SEC = 240;
const LOCK_VALUE_PREFIX = "ts:";
const STALE_PRE_MS = 3 * 60 * 60 * 1000;

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
  return s.includes("POSTPON")||s.includes("SUSP")||s.includes("DELAY")||s.includes("CANCEL")||s.includes("ABAND");
}
function isFinal(status){ return upper(status).includes("FINAL"); }

async function acquireLock(env,day){
  const store=kv(env);
  const K=keys(day);
  const now=Date.now();
  const existing=await store.get(K.lock);
  if(existing){
    const ts=Number(existing.replace("ts:",""))||0;
    if(now - ts < LOCK_TTL_SEC * 1000) return false;
  }
  await store.put(K.lock,`${LOCK_VALUE_PREFIX}${now}`,{expirationTtl:LOCK_TTL_SEC});
  return true;
}

async function releaseLock(env,day){
  const store=kv(env);
  const K=keys(day);
  try{ await store.delete(K.lock);}catch(_){}
}

function normalize(evt,slug,name){
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

  if(minute && upper(minute).includes("FT")){
    status="STATUS_FINAL";
  }

  if(status==="STATUS_SCHEDULED" && kickoff_ms && (Date.now()-kickoff_ms > STALE_PRE_MS) && (scoreHome+scoreAway>0)){
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
    dayKey: kickoff_ms ? isoDayInTZ(new Date(kickoff_ms)) : null
  };
}

async function fetchSummaryIfNeeded(match){
  if(!match?.id || isFinal(match.status) || isPostponedLike(match.status)) return match;
  if(!match.kickoff_ms || Date.now() < match.kickoff_ms) return match;

  try{
    const url = `${ESPN_BASE}/${match.leagueSlug}/summary?event=${match.id}`;
    const res = await fetch(url);
    if(!res.ok) return match;
    const data = await res.json();
    const comp = data?.header?.competitions?.[0];
    const st = comp?.status?.type;
    if(st?.completed || upper(st?.name).includes("FINAL")){
      const competitors = comp?.competitors||[];
      const home = competitors.find(c=>c.homeAway==="home")||{};
      const away = competitors.find(c=>c.homeAway==="away")||{};
      match.status = "STATUS_FINAL";
      match.scoreHome = Number(home?.score||0);
      match.scoreAway = Number(away?.score||0);
    }
  }catch(_){}
  return match;
}

async function fetchLeague(slug,day){
  const dateKey=day.replaceAll("-","");
  const url=`${ESPN_BASE}/${slug}/scoreboard?dates=${dateKey}`;
  const res=await fetch(url);
  if(!res.ok) return [];
  const json=await res.json().catch(()=>null);
  const events=Array.isArray(json?.events)?json.events:[];
  const name=LEAGUE_NAME_MAP[slug]||slug;
  return events.map(e=>normalize(e,slug,name)).filter(Boolean);
}

async function ingestDay(env, day){
  const store = kv(env);
  const K = keys(day);

  if(!(await store.get(K.queue))){
    await store.put(K.queue, JSON.stringify([...LEAGUE_SEEDS]));
  }

  const queueRaw = await store.get(K.queue);
  const queue = queueRaw ? JSON.parse(queueRaw) : [];
  if(!queue.length) return;

  const chunk = queue.slice(0, RUN_CHUNK_SIZE);
  const remaining = queue.slice(RUN_CHUNK_SIZE);

  for(const slugObj of chunk){
    const slug = slugObj.slug || slugObj;
    const matches = await fetchLeague(slug, day);

    for(let m of matches){
      if(!m?.kickoff_ms) continue;
      m = await fetchSummaryIfNeeded(m);

      const ownerDay = isoDayInTZ(new Date(m.kickoff_ms));
      const ownerKeys = keys(ownerDay);

      const ownerStagingRaw = await store.get(ownerKeys.staging);
      const ownerStaging = ownerStagingRaw
        ? JSON.parse(ownerStagingRaw)
        : { date: ownerDay, matches: [] };

      const ownerMap = new Map((ownerStaging.matches || []).map(x => [x.id, x]));

      if(isPostponedLike(m.status)){
        ownerMap.delete(m.id);
      } else {
        ownerMap.set(m.id, m);
      }

      ownerStaging.matches = [...ownerMap.values()];
      await store.put(ownerKeys.staging, JSON.stringify(ownerStaging));
    }

    await sleep(BETWEEN_LEAGUES_DELAY_MS);
  }

  await store.put(K.queue, JSON.stringify(remaining));
  await store.put(K.lastIngest, String(Date.now()), { expirationTtl: 86400*3 });
}

// ============================================================
// FINALIZE IF SAFE v4 (STRICT + FULL DEBUG)
// - Ignores Postponed
// - Ignores stale live (>4h)
// - Blocks only real LIVE or real SCHEDULED
// - Writes FINAL deterministically
// ============================================================

async function finalizeIfSafe(env, day){

  const store = kv(env);
  const K = keys(day);

  const stagingRaw = await store.get(K.staging);
  if(!stagingRaw){
    console.log("FINALIZE:", day, "NO STAGING");
    return;
  }

  const staging = JSON.parse(stagingRaw);
  const matches = staging.matches || [];

  console.log("FINALIZE CHECK:", day, "matches:", matches.length);

  const now = Date.now();
  const FOUR_HOURS = 4 * 60 * 60 * 1000;

  for(const m of matches){

    const status = m.status;
    const minute = m.minute;

    console.log("CHECK MATCH:", m.id, status, minute);

    // ------------------------------------------------
    // 1️⃣ IGNORE POSTPONED COMPLETELY
    // ------------------------------------------------
    const isPostponed =
      minute === "Postponed" ||
      status === "STATUS_POSTPONED";

    if(isPostponed){
      console.log("IGNORE PP:", m.id);
      continue;
    }

    // ------------------------------------------------
    // 2️⃣ IGNORE STALE LIVE (>4h from kickoff)
    // ------------------------------------------------
    if(status === "STATUS_IN_PROGRESS"){
      const age = now - (m.kickoff_ms || 0);

      if(age > FOUR_HOURS){
        console.log("IGNORE STALE LIVE:", m.id);
        continue;
      }

      console.log("BLOCK REAL LIVE:", m.id);
      return; // real live blocks finalize
    }

    // ------------------------------------------------
    // 3️⃣ BLOCK IF STILL SCHEDULED
    // ------------------------------------------------
    if(status === "STATUS_SCHEDULED"){
    const kickoffMs = (m.kickoff_ms || 0);
    const age = kickoffMs ? (now - kickoffMs) : 0;

    // If this is a past Athens day and kickoff is long past, ESPN may be stuck on SCHEDULED.
    // Do NOT block finalize in that case.
    const athensToday = isoDayInTZ(new Date());
    const isPastDay = day < athensToday;

    if(isPastDay && kickoffMs && age > FOUR_HOURS){
      console.log("IGNORE STALE SCHEDULED (PAST DAY):", m.id);
      continue;
    }

    console.log("BLOCK SCHEDULED:", m.id);
    return;
  }


    // ------------------------------------------------
    // 4️⃣ ALLOW ONLY FINAL
    // ------------------------------------------------
    if(status !== "STATUS_FINAL"){
      console.log("BLOCK UNKNOWN STATUS:", m.id, status);
      return;
    }
  }

  // ------------------------------------------------
  // SAFE TO FINALIZE
  // ------------------------------------------------

  console.log("FINALIZING DAY:", day);

  await store.put(K.final, JSON.stringify(staging));
  await store.delete(K.staging);

  console.log("FINALIZED SUCCESS:", day);
}

// ============================================================
// AI PREBUILD STEP (SAFE ADDITION)
// ============================================================

async function buildAIContextForDay(env, day){

  const store = kv(env);
  const API = env.API_BASE_URL;
  if(!API) return;

  const K = keys(day);
  const stagingRaw = await store.get(K.staging);
  if(!stagingRaw) return;

  const staging = JSON.parse(stagingRaw);
  const matches = staging.matches || [];

  console.log("AI PREBUILD:", day, "matches:", matches.length);

  for(const m of matches){

    if(!m?.id || !m.leagueSlug) continue;

    const status = String(m.status || "").toUpperCase();
    if(status.includes("FINAL")) continue;

    try{
      const url =
        `${API}/v1/match/details?id=${encodeURIComponent(m.id)}` +
        `&league=${encodeURIComponent(m.leagueSlug)}` +
        `&refresh=1`;

      await fetch(url);

    }catch(err){
      console.error("AI BUILD FAILED:", m.id, err);
    }

    await sleep(50);
  }

  console.log("AI PREBUILD DONE:", day);
}

// ============================================================
// VALUE TRIGGERED BY STAGING COMPLETION (HARD LAW)
// ============================================================

async function runValueWhenReady(env, day){

  const store = kv(env);
  const API = env.API_BASE_URL;
  if(!API) return;

  const K = keys(day);

  const queueRaw   = await store.get(K.queue);
  const stagingRaw = await store.get(K.staging);
  const alreadyRan = await store.get(K.valueRun);
  const hasSummary = await store.get(`VALUE:SUMMARY:${day}`);

  const queue = queueRaw ? JSON.parse(queueRaw) : [];

  // LAW:
  // queue empty + staging exists → RUN VALUE IMMEDIATELY
  if(queue.length === 0 && stagingRaw){

    if(alreadyRan || hasSummary){
      return; // prevent double run
    }

    console.log("VALUE TRIGGERED (STAGING COMPLETE):", day);

    try{
      const url = `${API}/value/run?date=${encodeURIComponent(day)}&force=1`;
      const res = await fetch(url);

      const text = await res.text().catch(()=> "");
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(_) {}

      if(res.ok && data?.ok){
        await store.put(K.valueRun,"1",{expirationTtl:86400});
      } else {
        console.error("VALUE RUN FAILED", day, "status:", res.status, "body:", (text || "").slice(0,300));
      }
    }catch(err){
      console.error("VALUE FETCH FAILED", day, err);
    }
  }
}



// ============================================================
// CRON
// ============================================================
// CRON TICK (INGEST → AI → VALUE → FINALIZE SAFE)
// ============================================================

async function cronTick(env){

  const athensToday     = isoDayInTZ(new Date());
  const athensYesterday = addDays(athensToday,-1);
  const athensTomorrow  = addDays(athensToday,1);

  for(const day of [athensYesterday, athensToday, athensTomorrow]){

    const locked = await acquireLock(env,day);
    if(!locked) continue;

    try{

      // -------------------------------------------------------
      // 1️⃣ INGEST
      // -------------------------------------------------------
      await ingestDay(env,day);

      // -------------------------------------------------------
      // 2️⃣ AI PREBUILD
      // -------------------------------------------------------
      await buildAIContextForDay(env,day);

      // 🔵 mark AI ready
      await env.AIML_INGESTION_KV.put(
        `AI:READY:${day}`,
        "1",
        { expirationTtl: 86400 }
      );

      // -------------------------------------------------------
      // 3️⃣ VALUE (ONLY IF AI READY)
      // -------------------------------------------------------
      const aiReady = await env.AIML_INGESTION_KV.get(`AI:READY:${day}`);
      if(aiReady){
        await runValueWhenReady(env,day);
      }

      // -------------------------------------------------------
      // 4️⃣ FINALIZE
      // -------------------------------------------------------
      await finalizeIfSafe(env,day);

    } finally {
      await releaseLock(env,day);
    }
  }
}



export default {
  async fetch() {
    return new Response("aimatchlab-scheduler active", { status: 200 });
  },
  async scheduled(event, env) {
    try{
      await cronTick(env);
    }catch(err){
      console.error("SCHEDULER CRASH", err);
    }
  }
};
