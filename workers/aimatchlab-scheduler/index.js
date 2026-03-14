import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

const ATHENS_TZ = "Europe/Athens";

// ops retention (tuned for KV quota + UI usefulness)
const KV_KEEP_STAGING_DAYS = 7;   // staging buckets
const KV_KEEP_FINAL_DAYS = 14;    // finalized buckets
const KV_KEEP_VALUE_DAYS = 30;    // value summaries
const R2_KEEP_MONTHS = 3;         // intel/performance/evaluation months
// --------------------------------------------------
// INDEX SIGNATURE CACHE (per execution)
// --------------------------------------------------
const __indexSigCache = new Map();
const __stagingSigCache = new Map();
const __indexExistCache = new Map();

function dayKeyTZ(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;

  return `${y}-${m}-${d}`;
}

/* ================= CORS ================= */

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

/* ================= DATE HELPERS ================= */
function getAthensHour() {
  return Number(
    new Date().toLocaleString("en-US", {
      timeZone: ATHENS_TZ,
      hour: "2-digit",
      hour12: false
    })
  );
}
function shiftUTC(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function formatUTC(date) {
  return date.toISOString().slice(0, 10);
}

function athensDayFromKickoff(iso) {
  const d = new Date(iso);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ATHENS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(d);
}

function monthKeyUTC(date = new Date()) {
  return date.toISOString().slice(0, 7); // YYYY-MM
}

function monthKeyToInt(m) {
  // "YYYY-MM" -> YYYY*12 + MM
  const [y, mm] = String(m).split("-");
  const yi = Number(y);
  const mi = Number(mm);
  if (!Number.isFinite(yi) || !Number.isFinite(mi)) return 0;
  return yi * 12 + mi;
}

/* ================= KV HELPERS ================= */

async function getJson(env, key) {
  const raw = await env.AIML_INGESTION_KV.get(key);
  return raw ? JSON.parse(raw) : null;
}

async function putJson(env, key, obj, ttlSeconds) {
  await env.AIML_INGESTION_KV.put(
    key,
    JSON.stringify(obj),
    ttlSeconds ? { expirationTtl: ttlSeconds } : undefined
  );
}

function keysForDay(day) {
  return {
    staging: `FIXTURES:STAGING:DATE:${day}`,
    final: `FIXTURES:DATE:${day}`
  };
}

/* ================= NORMALIZE ================= */

function normalize(event, slug) {

  const comp = event.competitions?.[0];

  if (!comp) return null;

  const home = comp.competitors?.find(
    c => c.homeAway === "home"
  );

  const away = comp.competitors?.find(
    c => c.homeAway === "away"
  );

  const kickoff =
    event.date ||
    comp.date ||
    null;
  if (!kickoff) return null;

  return {
    id: event.id,
    home: home.team?.displayName,
    away: away.team?.displayName,
    kickoff,
    kickoff_ms: new Date(kickoff).getTime(),
    scoreHome: Number(home.score ?? 0),
    scoreAway: Number(away.score ?? 0),
    status: comp.status?.type?.name || "UNKNOWN",
    minute: comp.status?.displayClock || "",
    leagueSlug: slug,
    leagueName: LEAGUE_NAME_MAP[slug] || slug
  };
}

// ================= ACTIVE LEAGUE FILTER =================
async function shouldQueryLeague(env, slug, date) {

  const today = dayKeyTZ(ATHENS_TZ);
  const stagingKey = `FIXTURES:STAGING:DATE:${today}`;

  const raw = await env.AIML_INGESTION_KV.get(stagingKey);

  // αν δεν υπάρχει staging → κανονικό ingest
  if (!raw) {
    return true;
  }

  try {

    const parsed = JSON.parse(raw);
    const matches = parsed.matches || [];

    for (const m of matches) {

      if (m.leagueSlug === slug) {
        return true;
      }

    }

  } catch (_) {}

  // league δεν έχει αγώνα σήμερα
  return false;
}
// ================= 404 COOLDOWN =================
async function shouldRetryAfter404(env, slug) {
  const key = `LEAGUE:404:${slug}`;
  const last = await env.AIML_INGESTION_KV.get(key);
  if (!last) return true;

  const diff = Date.now() - Number(last);
  return diff > 6 * 60 * 60 * 1000; // 6 hours
}

async function mark404(env, slug) {
  await env.AIML_INGESTION_KV.put(
    `LEAGUE:404:${slug}`,
    Date.now().toString(),
    { expirationTtl: 21600 } // 6h
  );
}
// ================= FETCH LEAGUE UTC =================
async function fetchLeagueUTC(slug, date = null) {

  try {

    const espnDate = date ? date.replaceAll("-", "") : null;

// ---------- PRIMARY ----------
    const url =
      date
        ? `${ESPN_BASE}/${slug}/scoreboard?limit=300&dates=${espnDate}`
        : `${ESPN_BASE}/${slug}/scoreboard?limit=300`;

    let res = await fetch(url);

// 404 σημαίνει απλά ότι δεν υπάρχει αγώνας για τη λίγκα εκείνη τη μέρα
    if (res.status === 404) {
      await res.body?.cancel();
      return null;
    }

    if (!res.ok) {
      await res.body?.cancel();
      console.log("[fetchLeagueUTC] error", slug, date, res.status);
      return null;
    }

    let data = await res.json();

    // ---------- FALLBACK ----------
    if (!data?.events?.length && date) {

      const fallbackUrl =
        `${ESPN_BASE}/${slug}/scoreboard?limit=300`;

      const fallbackRes = await fetch(fallbackUrl);

      if (!fallbackRes.ok) {
        await fallbackRes.body?.cancel();
        return { events: [] };
      }

      const fallbackData = await fallbackRes.json();

      const targetDay = date;

      const filtered = (fallbackData.events || []).filter(e => {

        const kickoff =
          e.date ||
          e.competitions?.[0]?.date;

        if (!kickoff) return false;

        const d = athensDayFromKickoff(kickoff);

        return d === targetDay;
      });

      data = { events: filtered };
    }

    return data;

  } catch (e) {
    console.log("[fetchLeagueUTC] error", slug, date);
    return null;
  }
}

async function ingestUTCWindow(env, ctx) {
  
  const now = new Date();   

   const bucketMaps = {};
   const processedLeagues = new Set();
// PRIORITY EU PASS (always try first)
const PRIORITY = [
  "eng.1",
  "esp.1",
  "ita.1",
  "ger.1",
];

for (const slug of PRIORITY) {

  if (!(await shouldRetryAfter404(env, slug))) {
    continue;
  }

  const today = dayKeyTZ(ATHENS_TZ);

 let data = await fetchLeagueUTC(slug, today);

 if (!data || !Array.isArray(data.events)) {
   continue;
 }

// retry μόνο αν υπάρχει πιθανότητα αγώνα
if (!data.events.length) {

  const hasRecentMatch =
    await env.AIML_INGESTION_KV.get(`LEAGUE:ACTIVE:${slug}`);

  if (!hasRecentMatch) {
    continue;
  }

}

processedLeagues.add(slug);

if (!data.events.length) {
  continue;
}

// ---------------------------------
// mark league active (once)
// ---------------------------------
await env.AIML_INGESTION_KV.put(
  `LEAGUE:ACTIVE:${slug}`,
  "1",
  { expirationTtl: 86400 }
);

// ---------------------------------
// EVENT LOOP
// ---------------------------------
for (const event of data.events) {

  const m = normalize(event, slug);
  if (!m) continue;

  const day = athensDayFromKickoff(m.kickoff);
  const todayAth = dayKeyTZ(ATHENS_TZ);

  const diff =
    Math.floor(
      (Date.parse(day + "T00:00:00Z") -
       Date.parse(todayAth + "T00:00:00Z")) / 86400000
    );

  if (diff < -2 || diff > 3) continue;

  const { staging } = keysForDay(day);

  bucketMaps[staging] ??= new Map();

  if (bucketMaps[staging].has(m.id)) continue;

  bucketMaps[staging].set(m.id, {
    ...m,
    dayKey: day
  });

}

}
    
// ---------------------------
// ROTATION INGEST (ACCELERATED AFTER 00:00 ATHENS)
// ---------------------------

const CHUNK_SIZE = 5;
const totalLeagues = LEAGUE_SEEDS.length;

// time window: 00:00–01:00 Athens

const athHour = getAthensHour();

const isMidnightWindow = (athHour === 0); // 00:xx

// In midnight window we want ~10 slices per cron
// resume rotation pointer
let idx = Number(await env.AIML_INGESTION_KV.get("INGEST:IDX") || 0);
if (idx >= totalLeagues) idx = 0;
// =====================================================
// ROTATION INGEST (12 leagues per cron)
// =====================================================

const slice = [];
let scanned = 0;

while (slice.length < CHUNK_SIZE && scanned < totalLeagues) {

  const slug = LEAGUE_SEEDS[(idx + scanned) % totalLeagues];

  scanned++;

  if (PRIORITY.includes(slug)) {
    continue;
  }

  slice.push(slug);

}

// advance pointer correctly
idx = (idx + scanned) % totalLeagues;
console.log("[ingest] rotation slice start:", idx, "count:", slice.length);



const today = dayKeyTZ(ATHENS_TZ);
for (const slug of slice) {

  if (!(await shouldQueryLeague(env, slug))) continue;

  if (processedLeagues.has(slug)) continue;

  try {

    if (!(await shouldRetryAfter404(env, slug))) continue;

    let data = await fetchLeagueUTC(slug, today);

    let leagueHasLive = false;

    if (data === null) {
      await mark404(env, slug);
      continue;
    }

    if (!data || !Array.isArray(data.events)) {
      continue;
    }

// -----------------------------
// mark league as processed
// ONLY after valid response
// -----------------------------

if (!data.events.length) {

  const hasRecentMatch =
    await env.AIML_INGESTION_KV.get(`LEAGUE:ACTIVE:${slug}`);

  if (!hasRecentMatch) {
    await mark404(env, slug);
    continue;
  }

}

// -----------------------------
// EVENT LOOP
// -----------------------------
for (const event of (data.events || [])) {

  const m = normalize(event, slug);
  if (!m) continue;

  const s = String(m.status || "").toUpperCase();

  if (
    s.includes("LIVE") ||
    s.includes("IN_PROGRESS") ||
    s.includes("HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("PRE") ||
    s.includes("SCHEDULED") ||
    s.includes("NOT_STARTED")
  ) {
    leagueHasLive = true;

    // mark league active
    await env.AIML_INGESTION_KV.put(
      `LEAGUE:ACTIVE:${slug}`,
      Date.now().toString(),
      { expirationTtl: 86400 }
    );
  }

  const day = athensDayFromKickoff(m.kickoff);
  const today = dayKeyTZ(ATHENS_TZ);

  const diff =
    Math.floor(
      (Date.parse(day + "T00:00:00Z") -
       Date.parse(today + "T00:00:00Z")) / 86400000
    );

  // -----------------------------
  // INGEST WINDOW GUARD
  // -----------------------------
  if (diff < -2 || diff > 3) {
    continue;
  }

  const { staging } = keysForDay(day);

  if (!bucketMaps[staging]) {
    bucketMaps[staging] = new Map();
  }

  // skip duplicates
  if (bucketMaps[staging].has(m.id)) {
    continue;
  }

  bucketMaps[staging].set(m.id, {
    ...m,
    dayKey: day
  });

}

// ---------------------------------
// league finished → stop polling
// ---------------------------------
if (!leagueHasLive) {
  await env.AIML_INGESTION_KV.delete(`LEAGUE:ACTIVE:${slug}`);
}

// -----------------------------
// mark league processed
// -----------------------------
processedLeagues.add(slug);

} catch (e) {

  console.error(
    "[ingest] job failed",
    slug,
    e?.message || e
  );

}

}

await env.AIML_INGESTION_KV.put(
  "INGEST:IDX",
  String(idx)
);

console.log(
  "[ingest:health]",
  "nextIdx:", idx,
  "slice:", slice.length,
  "priority:", PRIORITY.length
);

// -----------------------------
// ROTATION COMPLETE
// -----------------------------
if (!isMidnightWindow && idx === 0) {

  console.log("[ingest] FULL ROTATION COMPLETE");

  await env.AIML_INGESTION_KV.put(
    "INGEST:ROTATION_DONE",
    "1"
  );

}

for (const stagingKey in bucketMaps) {
if (!bucketMaps[stagingKey] || bucketMaps[stagingKey].size === 0) {
  continue;
}
// --------------------------------------------------
// STAGING MERGE WRITE (SAFE SNAPSHOT)
// --------------------------------------------------

let existingStage = { matches: [] };

try {
  const raw = await env.AIML_INGESTION_KV.get(stagingKey);
  if (raw) existingStage = JSON.parse(raw);
} catch (_) {}

const stageMap = new Map();

// ----------------------------------
// keep previous matches
// ----------------------------------
for (const m of existingStage.matches || []) {

  const replaced =
    bucketMaps[stagingKey] &&
    bucketMaps[stagingKey].has(m.id);

  // keep previous snapshot unless fresh ingest replaced it
  if (!replaced) {
    stageMap.set(m.id, m);
  }

}
// ----------------------------------
// apply fresh ingest updates
// ----------------------------------
for (const m of (bucketMaps[stagingKey]?.values() || [])) {

  const prev = stageMap.get(m.id);

  if (!prev) {
    stageMap.set(m.id, m);
    continue;
  }

  // keep the freshest snapshot
  const prevTs = Number(prev.kickoff_ms || 0);
  const newTs  = Number(m.kickoff_ms || 0);

  if (newTs >= prevTs) {
    stageMap.set(m.id, m);
  }

}

// ----------------------------------
// write merged snapshot (ONLY IF CHANGED)
// ----------------------------------
if (!bucketMaps[stagingKey] || bucketMaps[stagingKey].size === 0) {
  console.log("[staging] skip empty bucket", stagingKey);
  continue;
}

const sortedMatches = Array
  .from(stageMap.values())
  .sort((a,b)=>String(a.id).localeCompare(String(b.id)));

const newSnapshot = {
  date: stagingKey.split(":").pop(),
  matches: sortedMatches
};

// lightweight signature
const sig = newSnapshot.matches
  .map(m => `${m.id}|${m.status}|${m.scoreHome}|${m.scoreAway}`)
  .join(",");

const SIG_KEY = `STAGING:SIG:${stagingKey}`;

let prevSig = __stagingSigCache.get(SIG_KEY);

if (prevSig === undefined) {
  prevSig = await env.AIML_INGESTION_KV.get(SIG_KEY);
  __stagingSigCache.set(SIG_KEY, prevSig);
}

const writeNeeded = (prevSig !== sig);

if (writeNeeded) {

  await putJson(env, stagingKey, newSnapshot);

  await env.AIML_INGESTION_KV.put(
    SIG_KEY,
    sig,
    { expirationTtl: 86400 }
  );

  __stagingSigCache.set(SIG_KEY, sig);
  console.log("[staging] updated", stagingKey);

} else {

  console.log("[staging] unchanged", stagingKey);

}

}

// --------------------------------------------------
// FALLBACK: LOAD MATCHES FROM STAGING IF BUCKET EMPTY
// --------------------------------------------------

const todayKey = keysForDay(dayKeyTZ(ATHENS_TZ)).staging;

if (!bucketMaps[todayKey] || bucketMaps[todayKey].size === 0) {

  const raw = await env.AIML_INGESTION_KV.get(todayKey);

  if (raw) {

    const parsed = JSON.parse(raw);

    bucketMaps[todayKey] = new Map();

    for (const m of parsed.matches || []) {
      bucketMaps[todayKey].set(m.id, m);
    }

    console.log("[index rebuild fallback] loaded matches from staging:", parsed.matches.length);
  }

}

// ✅ SAFE PLACE (after merge, before KV write)
// --------------------------------------------------
// MATCH CHANGE DETECTION (NO KV WRITES)
// --------------------------------------------------

let writeCount = 0;
let indexWrites = 0;

const aiQueue = [];



for (const stagingKey in bucketMaps) {

  if (stagingKey !== todayKey) {
    continue;
  }

  const bucket = bucketMaps[stagingKey];
  if (!bucket) continue;

  const matches = Array.from(bucket.values());

// ------------------------------------
// AI ROTATION POINTER
// ------------------------------------

let aiIdx =
  Number(await env.AIML_INGESTION_KV.get("AI:IDX") || 0);

if (aiIdx >= matches.length) {
  aiIdx = 0;
}

// ------------------------------------
// PRIORITIZE MATCHES WITHOUT INTEL
// ------------------------------------

const noIntel = matches.filter(
  m => !__indexExistCache.get(m.id)
);

const queueSource =
  noIntel.length ? noIntel : matches;

const slice = queueSource.slice(aiIdx, aiIdx + 5);

// ------------------------------------
// AI BUILD PROGRESS (LOG)
// ------------------------------------

const built =
  Math.min(matches.length, aiIdx + slice.length);

const remaining =
  Math.max(0, matches.length - built);

console.log(
  "[AI progress]",
  "built:", built,
  "remaining:", remaining,
  "total:", matches.length
);

for (const m of slice) {

  writeCount++;

    try {

      const sigKey = `SIG:${m.id}`;

      const newSig = [
        m.status || "",
        m.scoreHome ?? "",
        m.scoreAway ?? "",
        m.minute || ""
      ].join("|");

      const statusName = String(m.status || "").toUpperCase();

      let prevSig = __indexSigCache.get(sigKey);

      if (prevSig === undefined) {

        const stored =
          await env.AIML_INGESTION_KV.get(sigKey);

        prevSig = stored ? stored : null;

        __indexSigCache.set(sigKey, prevSig);

       }

// ------------------------------------
// AI BUILD PROGRESS LOG
// ------------------------------------

const remaining =
  Math.max(0, matches.length - (aiIdx + slice.length));

console.log(
  "[AI progress]",
  "built:", aiIdx + slice.length,
  "remaining:", remaining,
  "total:", matches.length
);

      // ------------------------------------------------
      // CHECK IF INDEX EXISTS
      // ------------------------------------------------

      let indexExists = __indexExistCache.get(m.id);

      if (indexExists === undefined) {

        const existing =
          await env.AI_STATE.get(`match-index/${m.id}.json`);

        indexExists = !!existing;

        __indexExistCache.set(m.id, indexExists);

      }

      // ------------------------------------------------
      // SIGNATURE CHANGED → UPDATE CACHE
      // ------------------------------------------------

      if (prevSig !== newSig) {

        await env.AIML_INGESTION_KV.put(
          sigKey,
          newSig,
          { expirationTtl: 86400 }
        );

        __indexSigCache.set(sigKey, newSig);

      }

      // ------------------------------------
      // MATCH INDEX (AI lookup pointer)
      // ------------------------------------

      if (
        !indexExists &&
        (
          statusName.includes("PRE") ||
          statusName.includes("SCHEDULED") ||
          statusName.includes("NOT_STARTED") ||
          statusName.includes("FIRST_HALF") ||
          statusName.includes("SECOND_HALF") ||
          statusName.includes("FULL_TIME")
        )
      ) {

        console.log("[R2 index write]", m.id);
        indexWrites++;

        await env.AI_STATE.put(
          `match-index/${m.id}.json`,
          JSON.stringify({
            league: m.leagueSlug,
            season: "2025-2026",
            updatedAt: Date.now()
          })
        );

        __indexExistCache.set(m.id, true);
        indexExists = true;

      }

      // ------------------------------------------------
      // CHECK IF INTEL EXISTS (FIXED BUG)
      // ------------------------------------------------

      const intelExists = indexExists;

      // ------------------------------------------------
      // NOTHING CHANGED AND INTEL EXISTS → SKIP
      // ------------------------------------------------

      if (prevSig === newSig && intelExists) {
        continue;
      }

      if (prevSig !== newSig) {
        console.log("[index change]", m.id, prevSig, "→", newSig);
      }

// ------------------------------------
// TRIGGER AI ENGINE
// ------------------------------------

const RUN_KEY = `AI:RUNNING:${m.id}`;

const running =
  await env.AIML_INGESTION_KV.get(RUN_KEY);

if (!running) {

  await env.AIML_INGESTION_KV.put(
    RUN_KEY,
    "1",
    { expirationTtl: 90 }
  );

  if (!aiQueue.includes(m.id)) {
    aiQueue.push(m.id);
  }

}

    } catch (err) {

      console.log(
        "[index write error]",
        m.id,
        err?.message || err
      );

    }

  }

  // ------------------------------------
  // ADVANCE AI ROTATION POINTER
  // ------------------------------------

  aiIdx += 5;

  if (aiIdx >= matches.length) {
    aiIdx = 0;
  }

  await env.AIML_INGESTION_KV.put(
    "AI:IDX",
    String(aiIdx)
  );

}


// ------------------------------------------------
// RUN AI ENGINE QUEUE (LIMITED)
// ------------------------------------------------

const ids = aiQueue.slice(0,5);

if (ids.length) {

  try {

    await fetch(
      `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/match-intel-batch`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ ids })
      }
    );

  } catch (e) {

    console.log("[AI BATCH CALL FAIL]", e);

  }

}


console.log("[scheduler] AI queue triggered:", aiQueue.length);

// return queue size to scheduler
return aiQueue.length;

}
/* ================= FINALIZE ================= */

function isTerminal(status) {
  const s = String(status || "")
    .replace(/^STATUS_/, "")
    .toUpperCase();

  return (
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("AET") ||
    s.includes("PEN") ||
    s.includes("POSTPONED") ||
    s.includes("CANCELED") ||
    s.includes("ABANDONED") ||
    s.includes("SUSPENDED") ||
    s.includes("INTERRUPTED")
  );
}

async function recoverMissingFT(env, day, data) {

  let changed = false;

  // -----------------------------------
  // GROUP MATCHES BY LEAGUE
  // -----------------------------------
  const leagues = new Map();

  for (const match of data.matches) {

    if (isTerminal(match.status)) continue;

    if (!leagues.has(match.leagueSlug)) {
      leagues.set(match.leagueSlug, []);
    }

    leagues.get(match.leagueSlug).push(match);
  }

  // nothing to recover
  if (!leagues.size) return false;

  // -----------------------------------
  // FETCH ONCE PER LEAGUE
  // -----------------------------------
  for (const [slug, matches] of leagues.entries()) {

    // check if recovery is actually needed
    const needsRecovery = matches.some(m => {

      const kickoff = m.kickoff ? Date.parse(m.kickoff) : 0;

      if (!kickoff) return false;

      if (kickoff > Date.now() + 3 * 60 * 60 * 1000) return false;

      const status = String(m.status || "").toUpperCase();

      return !isTerminal(status);

    });

    if (!needsRecovery) {
      continue;
    }

    try {

      const res = await fetch(
        `${ESPN_BASE}/${slug}/scoreboard`
      );

      const json = await res.json();
      const events = json.events || [];

      // build fast lookup
      const index = new Map(
        events.map(e => [e.id, e])
      );

      for (const match of matches) {

        const event = index.get(match.id);
        if (!event) continue;

        const normalized = normalize(event, slug);
        if (!normalized) continue;

        if (
          normalized.scoreHome !== match.scoreHome ||
          normalized.scoreAway !== match.scoreAway ||
          normalized.status !== match.status
        ) {
          Object.assign(match, normalized);
          changed = true;
        }
      }

    } catch (_) {}

  }

  return changed;
  }

// =====================================================
// FORCE REBUILD MISSING DAY
// =====================================================
async function rebuildMissingDay(env, day) {

  const { final } = keysForDay(day);

  const exists = await env.AIML_INGESTION_KV.get(final);
  if (exists) return;

  console.log("[rebuild] rebuilding", day);

  const matches = [];
  const espnDate = day.replaceAll("-", "");

  for (const slug of LEAGUE_SEEDS) {

    

    

    try {

      const res = await fetch(
        `${ESPN_BASE}/${slug}/scoreboard?limit=300&dates=${espnDate}`
      );

      if (!res.ok) continue;

      const json = await res.json();

      for (const event of json.events || []) {

        const m = normalize(event, slug);
        if (!m) continue;

        const matchDay = athensDayFromKickoff(m.kickoff);

        const prevDay = formatUTC(shiftUTC(new Date(day + "T00:00:00Z"), -1));
        const nextDay = formatUTC(shiftUTC(new Date(day + "T00:00:00Z"), 1));

        if (matchDay !== day && matchDay !== prevDay && matchDay !== nextDay) {
          continue;
        }

        matches.push({
          ...m,
          dayKey: day
        });

      }

    } catch (_) {}

  }

  if (!matches.length) {

    console.log("[rebuild] no matches found from ESPN — using staging");

    const { staging } = keysForDay(day);
    const raw = await env.AIML_INGESTION_KV.get(staging);

    if (!raw) {
      console.log("[rebuild] staging missing", day);
      return;
    }

    const parsed = JSON.parse(raw);

    matches.push(...(parsed.matches || []));
  }

  await putJson(env, final, {
    date: day,
    matches
  });

  console.log("[rebuild] rebuilt", day, "| matches:", matches.length);

}

async function finalizeDay(env, day) {

  const { staging, final } = keysForDay(day);

  // ---------------------------------
  // LOAD STAGING
  // ---------------------------------
  const stagingData = await getJson(env, staging);

  if (!stagingData || !stagingData.matches?.length) {
    console.log("[finalize] no staging yet", day);
    return;
  }

  const data = stagingData;

  if (!data.matches.length) {
    console.log("[finalize] empty dataset", day);
    return;
  }

  // ---------------------------------
  // FT RECOVERY (SAFE)
  // ---------------------------------
  try {
    const recovered = await recoverMissingFT(env, day, data);
    if (recovered) {
      await putJson(env, staging, data);
    }
  } catch (_) {}
  const matches = data.matches || [];
  // ---------------------------------
  // FINALIZE VALIDATION
  // ---------------------------------

  let terminalFound = false;
  const filtered = [];

  for (const m of matches) {

    const status = String(m.status || "").toUpperCase();

// ---------------------------------
// LIVE MATCH → BLOCK FINALIZE
// ---------------------------------
if (
  status.includes("LIVE") ||
  status.includes("HALF") ||
  status.includes("IN_PROGRESS") ||
  status.includes("SECOND_HALF")
) {

  console.log("[finalize] attempting recovery", m.id);

  try {

    const res = await fetch(
      `${ESPN_BASE}/${m.leagueSlug}/scoreboard`
    );

    const json = await res.json();

    const event = (json.events || []).find(e => e.id === m.id);

    if (event) {

      const normalized = normalize(event, m.leagueSlug);

      if (normalized) {

        Object.assign(m, normalized);

        const newStatus = String(m.status || "").toUpperCase();

        if (isTerminal(newStatus)) {
          console.log("[finalize] recovered FT", m.id);
          terminalFound = true;
          filtered.push(m);
          continue;
        }

      }

    }

  } catch (_) {}

  console.log(
    "[finalize] blocked — live match",
    day,
    "match:",
    m.id,
    "status:",
    status
  );

  return;
}

    // ---------------------------------
    // INTERRUPTED MATCHES
    // (ignore until they appear again)
    // ---------------------------------
    if (
      status.includes("INTERRUPTED") ||
      status.includes("SUSPENDED") ||
      status.includes("ABANDONED")
    ) {
      console.log(
        "[finalize] interrupted match kept",
        day,
        m.id
      );
      filtered.push(m);
      continue;
    }

    // ---------------------------------
    // TERMINAL MATCHES
    // ---------------------------------
    if (isTerminal(status)) {
      terminalFound = true;
      filtered.push(m);
      continue;
    }

    // ---------------------------------
    // FUTURE MATCHES → IGNORE
    // ---------------------------------
    // FUTURE MATCHES → IGNORE
    const kickoff =
      m && m.kickoff ? Date.parse(m.kickoff) : 0;

    if (kickoff && !Number.isNaN(kickoff) && kickoff > Date.now()) {
      filtered.push(m);
      continue;
    }

    // ---------------------------------
    // UNKNOWN / BAD STATUS
    // ignore for safety
    // ---------------------------------
    console.log(
      "[finalize] skipping unresolved match",
      day,
      m.id,
      status
    );
  }

// =============================
// ADD THIS BLOCK EXACTLY HERE
// =============================
if (!terminalFound && matches.length > 0) {
  console.log("[finalize] no terminal matches yet", day);
  return;
}

// ------------------------------------------------
// REQUIRE NO NON-TERMINAL MATCHES
// ------------------------------------------------
const preExists = matches.some(m => {

  const s = String(m.status || "").toUpperCase();

  return (
    s.includes("SCHEDULED") ||
    s.includes("PRE") ||
    s.includes("NOT_STARTED") ||
    s.includes("DELAY") ||
    s.includes("POSTPONED") ||
    s.includes("TIME_TBD")
  );

});

if (!preExists) {
  console.log("[value] no PRE matches yet");
}
// ---------------------------------
// WRITE FINAL SNAPSHOT
// ---------------------------------
  await putJson(env, final, {
    date: day,
    matches: filtered
  });

  console.log(
    "[finalize] closing day",
    day,
    "| matches:",
    filtered.length
  );
}
/* ================= RECONCILIATION ================= */

async function reconcileRecentFinalized(env, ctx) {
  let changed = false;
  if (Math.random() > 0.25) {
    return;
  }

  const now = Date.now();
  
  const DAY_MS = 24 * 60 * 60 * 1000;

  const list = (await kvListAll(env, "FIXTURES:DATE:")).slice(-3);

  for (const k of list) {

    const day = k.name.split(":").pop();
    const ts = Date.parse(day + "T00:00:00Z");
    if (!ts) continue;

    // only last 24h finalized days
    const WINDOW = 2 * DAY_MS;

    if (now - ts > WINDOW) continue;

    const finalized = await getJson(env, k.name);
    if (!finalized?.matches?.length) continue;

    console.log("[reconcile] checking", day);

    const leagues = new Map();

    for (const m of finalized.matches) {
      if (!leagues.has(m.leagueSlug)) {
        leagues.set(m.leagueSlug, []);
      }
      leagues.get(m.leagueSlug).push(m);
    }

    for (const [slug, matches] of leagues.entries()) {

  // skip leagues with no unresolved matches
        const needsCheck = matches.some(m => !isTerminal(m.status));

        if (!needsCheck) {
          continue;
        }

      try {

        const res = await fetch(
          `${ESPN_BASE}/${slug}/scoreboard`
        );

        const data = await res.json();

        const index = new Map(
          (data.events || []).map(e => [e.id, e])
        );

        for (const match of matches) {

          const event = index.get(match.id);
          if (!event) continue;

          const normalized = normalize(event, slug);
          if (!normalized) continue;

          if (
            normalized.scoreHome !== match.scoreHome ||
            normalized.scoreAway !== match.scoreAway ||
            normalized.status !== match.status
          ) {
            console.log("[reconcile] correction", match.id);

            Object.assign(match, normalized);
            changed = true;
            fetch(
              `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/match-intel?id=${match.id}`,
              { method: "GET" }
            ).catch(()=>{});
          }

        }

      } catch (_) {}

    }

    if (changed) {
      await putJson(env, k.name, finalized);
    }
  }
}

/* ================= CLEANUP (KV + R2) ================= */

async function kvListAll(env, prefix, limit = 1000) {
  let cursor = undefined;
  const out = [];
  for (let i = 0; i < 20; i++) { // hard cap to avoid runaway
    const page = await env.AIML_INGESTION_KV.list({ prefix, limit, cursor });
    out.push(...(page.keys || []));
    cursor = page.cursor;
    if (!cursor) break;
  }
  return out;
}

function parseDayFromKey(name) {
  const parts = String(name).split(":");
  const day = parts[parts.length - 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return day;
}

function dayToTsUTC(day) {
  // "YYYY-MM-DD" -> ms at 00:00Z (good enough for age comparisons)
  const ts = Date.parse(day + "T00:00:00Z");
  return Number.isFinite(ts) ? ts : null;
}

async function cleanupKV(env) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // staging fixtures
  try {
    const keys = await kvListAll(env, "FIXTURES:STAGING:DATE:");
    for (const k of keys) {
      const day = parseDayFromKey(k.name);
      const ts = dayToTsUTC(day);
      if (!ts) continue;
      if (now - ts > KV_KEEP_STAGING_DAYS * dayMs) {
        await env.AIML_INGESTION_KV.delete(k.name);
      }
    }
  } catch (e) {
    console.error("[cleanupKV] staging failed", e);
  }

  // final fixtures
  try {
    const keys = await kvListAll(env, "FIXTURES:DATE:");
    for (const k of keys) {
      const day = parseDayFromKey(k.name);
      const ts = dayToTsUTC(day);
      if (!ts) continue;
      if (now - ts > KV_KEEP_FINAL_DAYS * dayMs) {
        await env.AIML_INGESTION_KV.delete(k.name);
      }
    }
  } catch (e) {
    console.error("[cleanupKV] final failed", e);
  }

  // value summaries
  try {
    const keys = await kvListAll(env, "VALUE:SUMMARY:");
    for (const k of keys) {
      const day = parseDayFromKey(k.name);
      const ts = dayToTsUTC(day);
      if (!ts) continue;
      if (now - ts > KV_KEEP_VALUE_DAYS * dayMs) {
        await env.AIML_INGESTION_KV.delete(k.name);
      }
    }
  } catch (e) {
    console.error("[cleanupKV] value failed", e);
  }
}

async function cleanupR2(env) {
  // delete older months for ai/context, ai/performance, ai/evaluation
  const nowMonth = monthKeyUTC(new Date());
  const nowInt = monthKeyToInt(nowMonth);
  const minKeep = nowInt - (R2_KEEP_MONTHS - 1);

  const monthPrefixes = ["ai/context/", "ai/performance/", "ai/evaluation/"];

  for (const base of monthPrefixes) {
    try {
      // list top-level months by prefix; R2 list returns objects, so we infer months from keys
      const list = await env.R2_INTEL.list({ prefix: base, limit: 1000 });
      const seenMonths = new Set();

      for (const obj of list.objects || []) {
        const key = obj.key || "";
        const rest = key.slice(base.length);
        const m = rest.split("/")[0];
        if (/^\d{4}-\d{2}$/.test(m)) seenMonths.add(m);
      }

      for (const m of seenMonths) {
        const mi = monthKeyToInt(m);
        if (mi && mi < minKeep) {
          // delete all under this month (paged)
          let cursor = undefined;
          for (let i = 0; i < 50; i++) {
            const page = await env.R2_INTEL.list({ prefix: base + m + "/", limit: 1000, cursor });
            const objs = page.objects || [];
            if (!objs.length) break;
            await Promise.all(objs.map(o => env.R2_INTEL.delete(o.key)));
            cursor = page.cursor;
            if (!cursor) break;
          }
        }
      }
    } catch (e) {
      console.error("[cleanupR2] failed for", base, e);
    }
  }
}

async function writeHeartbeat(env, payload) {
  // keep it short-lived; dashboards / health endpoints consume this.
  if (false) await env.AIML_INGESTION_KV.put(
    "SCHEDULER:LAST_TICK",
    JSON.stringify(payload),
    { expirationTtl: 6 * 60 * 60 } // 6h
  );
}

/* ================= RUNTIME ENDPOINT ================= */


async function handleFixturesRuntime(req, env) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const mode = (url.searchParams.get("mode") || "today").toLowerCase();

  if (!date) return jsonResponse({ ok: false, error: "missing_date" }, 400);

  const { staging, final } = keysForDay(date);

  const finalData = await getJson(env, final);
  const stagingData = await getJson(env, staging);

  const data = finalData || stagingData || { date, matches: [] };

  if (mode === "active") {
    return jsonResponse(data);
  }

  const now = Date.now();

  const filtered = (data.matches || []).filter(m => {

    const s = String(m.status || "").toUpperCase();

  // LIVE matches
    if (
      s.includes("LIVE") ||
      s.includes("IN_PROGRESS") ||
      s.includes("HALF") ||
      s.includes("SECOND_HALF")
    ) {
      return true;
    }

  // PRE / DELAYED / SCHEDULED
    if (
      s.includes("SCHEDULED") ||
      s.includes("PRE") ||
      s.includes("DELAY")
    ) {
      return m.kickoff_ms >= now - 8 * 60 * 60 * 1000;
    }

    return false;

  });
filtered.sort((a, b) => {

  const sa = String(a.status || "").toUpperCase();
  const sb = String(b.status || "").toUpperCase();

  const liveA =
    sa.includes("LIVE") ||
    sa.includes("IN_PROGRESS") ||
    sa.includes("HALF") ||
    sa.includes("SECOND_HALF");

  const liveB =
    sb.includes("LIVE") ||
    sb.includes("IN_PROGRESS") ||
    sb.includes("HALF") ||
    sb.includes("SECOND_HALF");

  // LIVE first
  if (liveA && !liveB) return -1;
  if (!liveA && liveB) return 1;

  // then kickoff time
  return (a.kickoff_ms || 0) - (b.kickoff_ms || 0);

});
  return jsonResponse({ date, matches: filtered });
}

// ======================================================
// SCHEDULER HEALTH ENDPOINT
// ======================================================

async function schedulerHealth(env) {

  const out = {
    ok: true,
    days: []
  };

  try {

    const list = await env.AIML_INGESTION_KV.list({
      prefix: "FIXTURES:STAGING:DATE:"
    });

    for (const k of list.keys || []) {

      const day = k.name.replace("FIXTURES:STAGING:DATE:", "");

      const raw = await env.AIML_INGESTION_KV.get(k.name);

      if (!raw) {
        out.days.push({
          day,
          matches: 0,
          leagues: []
        });
        continue;
      }

      const parsed = JSON.parse(raw);
      const matches = parsed.matches || [];

      const leagues = new Set();

      for (const m of matches) {
        if (m.leagueSlug) {
          leagues.add(m.leagueSlug);
        }
      }

      out.days.push({
        day,
        matches: matches.length,
        leagues: Array.from(leagues).sort()
      });

    }

    out.days.sort((a,b)=>Date.parse(a.day)-Date.parse(b.day));

  } catch (e) {

    return {
      ok:false,
      error:String(e)
    };

  }

  return out;
}

// ======================================================
// LEAGUE INGEST STATUS
// ======================================================

async function leagueIngestStatus(env) {

  const result = {
    ok: true,
    leagues: {}
  };

  try {

    const list = await env.AIML_INGESTION_KV.list({
      prefix: "FIXTURES:STAGING:DATE:"
    });

    for (const k of list.keys || []) {

      const day = k.name.replace("FIXTURES:STAGING:DATE:", "");

      const raw = await env.AIML_INGESTION_KV.get(k.name);
      if (!raw) continue;

      const parsed = JSON.parse(raw);
      const matches = parsed.matches || [];

      for (const m of matches) {

        const slug = m.leagueSlug;
        if (!slug) continue;

        const kickoff = Date.parse(m.kickoff || "");

        if (!result.leagues[slug]) {
          result.leagues[slug] = {
            lastMatch: m.id,
            kickoff,
            updatedAt: Date.now()
          };
        }

        if (kickoff > result.leagues[slug].kickoff) {
          result.leagues[slug] = {
            lastMatch: m.id,
            kickoff,
            updatedAt: Date.now()
          };
        }

      }

    }

  } catch (e) {

    return {
      ok:false,
      error:String(e)
    };

  }

  return result;
}

/* ================= EXPORT ================= */

export default {

  async fetch(req, env) {

    const url = new URL(req.url);

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/fixtures-runtime") {
      return handleFixturesRuntime(req, env);
    }

    if (url.pathname === "/scheduler-health") {
      const data = await schedulerHealth(env);
      return jsonResponse(data);
    }

    if (url.pathname === "/league-ingest-status") {
      const data = await leagueIngestStatus(env);
      return jsonResponse(data);
    }

    // ---------------------------------
    // MANUAL RUN
    // ---------------------------------
    if (url.pathname === "/scheduler-run") {

      const started = Date.now();

      const fakeCtx = {
        waitUntil: (p) => p
      };

      const today = dayKeyTZ(ATHENS_TZ);

      const days = [];

      for (let i = 6; i >= 0; i--) {
        const d = dayKeyTZ(
          ATHENS_TZ,
          new Date(Date.now() - i * 86400000)
        );
        days.push(d);
      }

      for (const day of days) {
        await rebuildMissingDay(env, day);
        await finalizeDay(env, day);
      }

      return jsonResponse({
        ok: true,
        daysProcessed: days.length,
        ms: Date.now() - started
      });
    }

// ---------------------------------
// MANUAL REBUILD SINGLE DAY
// ---------------------------------
if (url.pathname === "/scheduler-run-day") {

  const day = url.searchParams.get("day");

  if (!day) {
    return jsonResponse({ ok:false, error:"missing_day" }, 400);
  }

  const started = Date.now();

  await rebuildMissingDay(env, day);
  await finalizeDay(env, day);

  return jsonResponse({
    ok: true,
    rebuilt: day,
    ms: Date.now() - started
  });
}

//---------------------------------
// REPAIR DAY (ADD MISSING MATCHES ONLY)
// ---------------------------------
if (url.pathname === "/repair-day") {

  const day = url.searchParams.get("day");

  if (!day) {
    return jsonResponse({ ok:false, error:"missing_day" }, 400);
  }

  const { final } = keysForDay(day);

  const existing = await getJson(env, final);

  if (!existing?.matches) {
    return jsonResponse({ ok:false, error:"day_not_finalized" });
  }

  const existingIds = new Set(
    existing.matches.map(m => m.id)
  );

  const espnDate = day.replaceAll("-", "");

  let added = 0;

  for (const slug of LEAGUE_SEEDS) {

    try {

      const res = await fetch(
        `${ESPN_BASE}/${slug}/scoreboard?limit=300&dates=${espnDate}`
      );

      if (!res.ok) continue;

      const json = await res.json();

      for (const event of json.events || []) {

        const m = normalize(event, slug);
        if (!m) continue;

        const matchDay = athensDayFromKickoff(m.kickoff);

        if (matchDay !== day) continue;

        if (!existingIds.has(m.id)) {

          existing.matches.push({
            ...m,
            dayKey: day
          });

          existingIds.add(m.id);
          added++;

        }

      }

    } catch (_) {}

  }

  if (added > 0) {
    await putJson(env, final, existing);
  }

  return jsonResponse({
    ok: true,
    day,
    added
  });
}

// ---------------------------------
// FORCE INGEST (STAGING BUILD)
// ---------------------------------
if (url.pathname === "/ingest-now") {

  await ingestUTCWindow(env, {});

  return jsonResponse({
    ok: true,
    message: "ingest completed"
  });
}

    return jsonResponse({ ok:false, error:"invalid_route" }, 404);

  },

  // -----------------------------
  // CRON SCHEDULED
  // -----------------------------
  scheduled: async (event, env, ctx) => {
// ---------------------------------
// EXECUTION LOCK (RACE-SAFE)
// ---------------------------------
const LOCK_KEY = "SCHEDULER:RUNNING";
const RUN_ID = crypto.randomUUID();

const existing = await env.AIML_INGESTION_KV.get(LOCK_KEY);

if (existing) {

  let age = 0;

  try {

    const parsed = JSON.parse(existing);
    age = Date.now() - (parsed.ts || 0);

  } catch {

    // παλιό lock format → θεώρησε το stale
    age = 999999999;

  }

  if (age < 90 * 1000) {
    console.log("[scheduler] skipped (already running)");
    return;
  }

  console.log("[scheduler] stale lock detected — overriding");
}

// γράψε νέο lock
await env.AIML_INGESTION_KV.put(
  LOCK_KEY,
  JSON.stringify({
    id: RUN_ID,
    ts: Date.now()
  }),
  { expirationTtl: 120 }
);

// verify ownership
const confirmRaw = await env.AIML_INGESTION_KV.get(LOCK_KEY);

let confirmId = null;

try {
  const parsed = JSON.parse(confirmRaw);
  confirmId = parsed.id;
} catch {}

if (confirmId !== RUN_ID) {
  console.log("[scheduler] lost lock race — abort");
  return;
}

  const started = Date.now();
  console.log("[scheduler] cron tick");
  const todayAthens = dayKeyTZ(ATHENS_TZ);
  ctx.waitUntil((async () => {

    try {

      // -------------------
      // HEARTBEAT START
      // -------------------
      try {
        await writeHeartbeat(env, {
          ts: started,
          iso: new Date(started).toISOString(),
          ok: true,
          stage: "start"
        });
      } catch (_) {}

      // -------------------
      // INGEST WINDOW
      // -------------------
      const aiTriggered = await ingestUTCWindow(env, ctx);

      console.log("[scheduler] ingest done");

// -------------------
// STAGING STATUS PROBE (TODAY)
// -------------------
try {

  const todayKey = `FIXTURES:STAGING:DATE:${todayAthens}`;
  const todayData = await env.AIML_INGESTION_KV.get(todayKey);

  if (!todayData) {

    console.log("[staging status]", todayAthens, "empty");

  } else {

    const parsed = JSON.parse(todayData);

    console.log(
      "[staging status]",
      todayAthens,
      "matches:",
      parsed.matches?.length || 0
    );

  }

} catch (_) {

  console.log("[staging status] probe failed");

}



let missing = 0;

// skip coverage check if we just triggered AI
if (aiTriggered > 0) {

  console.log("[intel coverage] skipped (AI build in progress)");
  missing = 999;

}

// =====================================================
// INTEL COVERAGE CHECK (TODAY)
// =====================================================
if (missing !== 999) {

try {

  const todayKey = `FIXTURES:STAGING:DATE:${todayAthens}`;
  const todayRaw = await env.AIML_INGESTION_KV.get(todayKey);

  if (todayRaw) {

    const parsed = JSON.parse(todayRaw);
    const matches = parsed.matches || [];

    let intelBuilt = 0;
    missing = 0;

    const SAMPLE_SIZE = 10;

    const sample = matches.slice(0, SAMPLE_SIZE);

    for (const m of sample) {

       const obj =
         await env.AI_STATE.get(`intel/context/${m.id}/latest.json`);

       if (obj) {
         intelBuilt++;
       } else {
         missing++;
       }

     }

     const estimatedMissing =
       Math.round((missing / SAMPLE_SIZE) * matches.length);

     console.log(
       "[intel coverage]",
       "staging:", matches.length,
       "sample:", SAMPLE_SIZE,
       "intel(sample):", intelBuilt,
       "missing(sample):", missing,
       "est.missing:", estimatedMissing
     );

  }

} catch (e) {

  console.log("[intel coverage] failed");

}

}

/// =====================================================
// VALUE DAILY ORCHESTRATION
/// =====================================================

const today = dayKeyTZ(ATHENS_TZ);
const yesterday = dayKeyTZ(
  ATHENS_TZ,
  new Date(Date.now() - 86400000)
);

const DAILY_FLAG = `VALUE:BUILT:${today}`;
const COOLDOWN_KEY = "VALUE:COOLDOWN";

const alreadyBuilt =
  await env.AIML_INGESTION_KV.get(DAILY_FLAG);

if (!alreadyBuilt) {

    const todayStagingKey =
      `FIXTURES:STAGING:DATE:${today}`;

    const yesterdayFinalKey =
      `FIXTURES:DATE:${yesterday}`;

    const todayStagingRaw =
      await env.AIML_INGESTION_KV.get(todayStagingKey);

    const yesterdayFinal =
      await env.AIML_INGESTION_KV.get(yesterdayFinalKey);

    if (todayStagingRaw && yesterdayFinal && missing === 0) {

      const parsed = JSON.parse(todayStagingRaw);
      const matches = parsed.matches || [];

      if (matches.length === 0) {

        console.log("[value] staging empty");

      } else {

        const res = await fetch(
          `https://aimatchlab-api.pierros1402.workers.dev/value/run?date=${today}`,
          { method: "POST" }
        );

        if (res && res.ok) {

          console.log("[value] build completed ✔");

          await env.AIML_INGESTION_KV.put(
            DAILY_FLAG,
            Date.now().toString()
          );

        } else {

          console.log("[value] engine returned error — retry next cron");

        }

      }

    }

  }

// -------------------
// AUTO DISCOVER STAGING DAYS
// -------------------
      const daysToCheck = [];

      for (let i = KV_KEEP_STAGING_DAYS; i >= 0; i--) {

         const d = dayKeyTZ(
           ATHENS_TZ,
           new Date(Date.now() - i * 86400000)
         );

         daysToCheck.push(d);
       }

       // oldest → newest
      daysToCheck.sort((a, b) => Date.parse(a) - Date.parse(b));

      
for (const day of daysToCheck) {

  try {

    if (day === todayAthens) {
      console.log("[finalize] skip today", day);
      continue;
    }

    if (day > todayAthens) {
      console.log("[finalize] skip future day", day);
      continue;
    }

    const { final } = keysForDay(day);

    const finalExists =
      await env.AIML_INGESTION_KV.get(final);

    if (finalExists) {
      console.log("[finalize] already finalized", day);
      continue;
    }

    console.log("[auto-recovery] missing final snapshot", day);

    await rebuildMissingDay(env, day);
    await finalizeDay(env, day);

  } catch (e) {

    console.error(
      "[scheduler] finalize failed",
      day,
      e
    );

  }

}
      // -------------------
      // RECONCILE
      // -------------------
      await reconcileRecentFinalized(env, ctx);

// ------------------------------------------------------------
// CLEAN OLD LIVE INTEL SNAPSHOTS
// ------------------------------------------------------------
try {

  const list = await env.AI_STATE.list({
    prefix: "intel/live/"
  });

  const now = Date.now();
  const MAX_AGE = 24 * 60 * 60 * 1000; // 24h

  for (const obj of list.objects || []) {

    const uploaded =
      obj.lastModified
        ? new Date(obj.lastModified).getTime()
        : 0;

    if (!uploaded) continue;

    const age = now - uploaded;

    if (age > MAX_AGE) {

      await env.AI_STATE.delete(obj.key);

      console.log("[cleanup] removed stale live intel", obj.key);

    }

  }

} catch (e) {

  console.log("[cleanup] live intel cleanup failed", e);

}





// -------------------
// CLEANUP (hourly window)
// -------------------
const now = new Date();
const hour = now.getUTCHours();
const day = now.toISOString().slice(0,10);

const CLEANUP_FLAG = `CLEANUP:RAN:${day}:${hour}`;

// run cleanup twice per day (once per window only)
if (hour === 3 || hour === 15) {

  const alreadyRan =
    await env.AIML_INGESTION_KV.get(CLEANUP_FLAG);

  if (alreadyRan) {
    console.log("[scheduler] cleanup already executed");
  } else {

    await env.AIML_INGESTION_KV.put(
      CLEANUP_FLAG,
      "1",
      { expirationTtl: 7200 } // 2h safety
    );
  }

  // =====================================================
  // FIXTURES MONTH ARCHIVE (FOOTBALL SAFE)
  // =====================================================
  try {

    const list = await env.AIML_INGESTION_KV.list({
      prefix: "FIXTURES:DATE:"
    });

    const months = {};
    const today = dayKeyTZ(ATHENS_TZ);

    for (const k of list.keys || []) {

      const day = k.name.split(":").pop();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
      if (day >= today) continue;

      const month = day.slice(0, 7);
      const data = await getJson(env, k.name);
      if (!data?.matches?.length) continue;

      const notClosed = data.matches.some(m => {
        const s = String(m.status || "").toUpperCase();
        return !(
          s.includes("FINAL") ||
          s.includes("FULL_TIME") ||
          s.includes("FT") ||
          s.includes("AET") ||
          s.includes("PEN") ||
          s.includes("POSTPONED") ||
          s.includes("CANCEL") ||
          s.includes("ABANDONED") ||
          s.includes("SUSPENDED")
        );
      });

      if (notClosed) continue;

      months[month] ??= {};
      months[month][day] = data;
    }

for (const month of Object.keys(months)) {

  const today = dayKeyTZ(ATHENS_TZ);

  const currentMonth = today.slice(0,7);

  const previousMonthDate = new Date(today + "T00:00:00Z");
  previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);

  const previousMonth =
    previousMonthDate.toISOString().slice(0,7);

  // -----------------------------------
  // DO NOT ARCHIVE CURRENT OR PREVIOUS MONTH
  // -----------------------------------
  if (month >= previousMonth) {
    console.log("[archive] month still active", month);
    continue;
  }

  const monthKey = `FIXTURES:MONTH:${month}`;

  // -----------------------------------
  // SKIP IF MONTH ALREADY ARCHIVED
  // -----------------------------------
  const existingMonth =
    await env.AIML_INGESTION_KV.get(monthKey);

  if (existingMonth) {
    console.log("[archive] fixtures month exists — skip", month);
    continue;
  }

  await putJson(env, monthKey, {
    month,
    days: months[month]
  });

  console.log("[archive] fixtures month built", month);

  // -----------------------------------
  // DELETE DAILY KEYS AFTER ARCHIVE
  // -----------------------------------
  for (const day of Object.keys(months[month])) {

    try {

      await env.AIML_INGESTION_KV.delete(
        `FIXTURES:DATE:${day}`
      );

    } catch (e) {

      console.log(
        "[archive] delete failed",
        `FIXTURES:DATE:${day}`
      );

    }

  }

}

} catch (_) {

  console.log("[archive] fixtures failed");

}
  // =====================================================
  // VALUE MONTH ARCHIVE
  // =====================================================
  try {

    const prefixes = [
      "VALUE:DATE:",
      "VALUE:STAT:DATE:",
      "VALUE:SUMMARY:",
      "VALUE:PICK:"
    ];

    const today = dayKeyTZ(ATHENS_TZ);
    const months = {};

    for (const prefix of prefixes) {

      const list =
        await env.AIML_INGESTION_KV.list({ prefix });

      for (const k of list.keys || []) {

        const parts = k.name.split(":");
        const date =
          parts.find(p => /^\d{4}-\d{2}-\d{2}$/.test(p));

        if (!date || date >= today) continue;

        const raw =
          await env.AIML_INGESTION_KV.get(k.name);
        if (!raw) continue;

        const month = date.slice(0,7);

        months[month] ??= [];
        months[month].push({
          key: k.name,
          value: JSON.parse(raw)
        });
      }
    }

    for (const month of Object.keys(months)) {

      const monthKey = `VALUE:MONTH:${month}`;

      await env.AIML_INGESTION_KV.put(
        monthKey,
        JSON.stringify({
          ok: true,
          month,
          createdAt: Date.now(),
          items: months[month]
        })
      );

      console.log("[archive] value month built", month);

      for (const item of months[month]) {
        await env.AIML_INGESTION_KV.delete(item.key);
      }
    }

  } catch (_) {
    console.log("[archive] value failed");
  }

  await cleanupKV(env);
  await cleanupR2(env);
}

const finished = Date.now();

await writeHeartbeat(env, {
  ts: finished,
  iso: new Date(finished).toISOString(),
  ok: true,
  stage: "done",
  ms: finished - started
});

console.log("[scheduler] done");

// ✅ RELEASE LOCK (SUCCESS)
await env.AIML_INGESTION_KV.delete(LOCK_KEY);

} catch (err) {

  console.error("[scheduler] cron error", err);

  const finished = Date.now();

  try {
    await writeHeartbeat(env, {
      ts: finished,
      iso: new Date(finished).toISOString(),
      ok: false,
      stage: "error",
      ms: finished - started,
      error: String(err?.message || err)
    });
  } catch (_) {}

  // ✅ RELEASE LOCK (ERROR SAFE)
  await env.AIML_INGESTION_KV.delete(LOCK_KEY);
}

})());
}
};