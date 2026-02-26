import { LEAGUE_SEEDS, LEAGUE_NAME_MAP } from "../_shared/leagues-registry.js";

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const AI_ENGINE_URL = "https://aimatchlab-ai-engine.pierros1402.workers.dev";
const ATHENS_TZ = "Europe/Athens";

// ops retention (tuned for KV quota + UI usefulness)
const KV_KEEP_STAGING_DAYS = 7;   // staging buckets
const KV_KEEP_FINAL_DAYS = 14;    // finalized buckets
const KV_KEEP_VALUE_DAYS = 30;    // value summaries
const R2_KEEP_MONTHS = 3;         // intel/performance/evaluation months

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

  const home = comp.competitors?.find(c => c.homeAway === "home");
  const away = comp.competitors?.find(c => c.homeAway === "away");

  if (!home || !away) return null;

  return {
    id: event.id,
    home: home.team?.displayName,
    away: away.team?.displayName,
    kickoff: event.date,
    kickoff_ms: new Date(event.date).getTime(),
    scoreHome: Number(home.score ?? 0),
    scoreAway: Number(away.score ?? 0),
    status: comp.status?.type?.name || "UNKNOWN",
    minute: comp.status?.displayClock || "",
    leagueSlug: slug,
    leagueName: LEAGUE_NAME_MAP[slug] || slug
  };
}

// ================= INTEL REFRESH =================
async function queueIntelRefresh(env, ctx, matchId, match = null) {
  try {
    if (match?.leagueSlug) {
      const season = "2025-2026";

      await env.AI_STATE.put(
        `match-index/${matchId}.json`,
        JSON.stringify({
          league: match.leagueSlug,
          season,
          updatedAt: Date.now()
        })
      );
    }
  } catch (_) {}

  const p = fetch(`${AI_ENGINE_URL}/ai/match-intel?id=${matchId}`)
    .then(r => r.body?.cancel?.())
    .catch(() => {});

  if (ctx?.waitUntil) ctx.waitUntil(p);
}

// ================= INTEL THROTTLE =================
async function shouldTriggerIntel(env, match, prev) {
  const now = Date.now();

  if (!prev) return true;

  const status = String(match.status || "").toUpperCase();

  if (
    status.includes("FINAL") ||
    status.includes("FULL_TIME") ||
    status.includes("AET") ||
    status.includes("PEN")
  ) {
    return true;
  }

  if (
    prev.scoreHome !== match.scoreHome ||
    prev.scoreAway !== match.scoreAway
  ) {
    return true;
  }

  const tickKey = `INTEL:TICK:${match.id}`;
  const last = await env.AIML_INGESTION_KV.get(tickKey);

  if (!last) {
    await env.AIML_INGESTION_KV.put(tickKey, String(now), { expirationTtl: 7200 });
    return true;
  }

  const elapsed = now - Number(last);

  if (elapsed > 10 * 60 * 1000) {
    await env.AIML_INGESTION_KV.put(tickKey, String(now), { expirationTtl: 7200 });
    return true;
  }

  return false;
}

    
async function ingestUTCWindow(env, ctx) {
  let startIndex = 0;
  const now = new Date();
  const utcDays = [
    formatUTC(shiftUTC(now, -1)),
    formatUTC(now),
    formatUTC(shiftUTC(now, 1))
  ];

  const bucketMaps = {};

  const CHUNK_SIZE = 12;
  const totalLeagues = LEAGUE_SEEDS.length;

  startIndex = Number(
  await env.AIML_INGESTION_KV.get("INGEST:IDX") || 0
);
  if (startIndex >= totalLeagues) startIndex = 0;

  const endIndex = Math.min(startIndex + CHUNK_SIZE, totalLeagues);
  const slice = LEAGUE_SEEDS.slice(startIndex, endIndex);

  for (const slug of slice) {
    for (const utcDate of utcDays) {
      try {
        const data = await fetchLeagueUTC(slug, utcDate);
        if (!data?.events?.length) continue;

        for (const event of data.events) {
          const m = normalize(event, slug);
          if (!m || !m.kickoff) continue;

          const day = athensDayFromKickoff(m.kickoff);
          const { staging } = keysForDay(day);

          if (!bucketMaps[staging]) bucketMaps[staging] = new Map();

          const prev = bucketMaps[staging].get(m.id);

          // ALWAYS create index
          try {
            await env.AI_STATE.put(
              `match-index/${m.id}.json`,
              JSON.stringify({
               league: m.leagueSlug,
               season: "2025-2026",
               updatedAt: Date.now()
             })
            );
          } catch (_) {}


          if (
            !prev ||
            prev.status !== m.status ||
            prev.scoreHome !== m.scoreHome ||
            prev.scoreAway !== m.scoreAway ||
            prev.minute !== m.minute
          ) {
            bucketMaps[staging].set(m.id, { ...m, dayKey: day });

            // =================================================
            // PRE BASELINE SNAPSHOT (T-60 window)
            // =================================================
            const nowTs = Date.now();
            const minutesToKickoff = (m.kickoff_ms - nowTs) / 60000;

            if (
              m.status === "STATUS_SCHEDULED" &&
              minutesToKickoff <= 60 &&
              minutesToKickoff > 0
            ) {
              queueIntelRefresh(env, ctx, m.id, m);
              continue;
            }

// =================================================
// NORMAL INTEL EVOLUTION (throttled)
// =================================================
             try {
               const shouldRun = await shouldTriggerIntel(env, m, prev);

               if (shouldRun) {
                 queueIntelRefresh(env, ctx, m.id, m);
               }
             } catch (_) {}
          }
        } // end events loop

      } catch (_) {
        continue;
      }
    } // end utcDate loop
  } // end league loop
  let nextIndex = endIndex;
  if (nextIndex >= totalLeagues) nextIndex = 0;
  await env.AIML_INGESTION_KV.put("INGEST:IDX", String(nextIndex));

  for (const stagingKey in bucketMaps) {
  const existing = (await getJson(env, stagingKey)) || { matches: [] };
  const merged = new Map((existing.matches || []).map(m => [m.id, m]));

  for (const m of bucketMaps[stagingKey].values()) {
    merged.set(m.id, m);
  }

  // ✅ SAFE PLACE (after merge, before KV write)
  for (const m of merged.values()) {
    try {
      await env.AI_STATE.put(
        `match-index/${m.id}.json`,
        JSON.stringify({
          league: m.leagueSlug,
          season: "2025-2026",
          updatedAt: Date.now()
        })
      );
    } catch (_) {}
  }

  await putJson(env, stagingKey, {
    date: stagingKey.split(":").pop(),
    matches: Array.from(merged.values())
  });
 }
}

/* ================= FINALIZE ================= */

function isTerminal(status) {
  const s = String(status || "").toUpperCase();
  return (
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("AET") ||
    s.includes("PEN") ||
    s.includes("POSTPONED") ||
    s.includes("CANCELED")
  );
}

async function finalizeDay(env, day) {
  const { staging, final } = keysForDay(day);
  const data = await getJson(env, staging);
  if (!data?.matches?.length) return;

  const now = Date.now();
  let allClosed = true;

  for (const m of data.matches) {
    if (isTerminal(m.status)) continue;

    const hoursSinceKickoff = (now - m.kickoff_ms) / (1000 * 60 * 60);

    // safety close for stuck scheduled matches (ESPN ghost fixtures)
    if (m.status === "STATUS_SCHEDULED" && hoursSinceKickoff > 8) {
      continue;
    }

    allClosed = false;
    break;
  }

  if (!allClosed) return;

  console.log("[finalize] closing day", day);

  await putJson(env, final, data);

  // cleanup staging once finalized (prevents KV trash)
  try { await env.AIML_INGESTION_KV.delete(staging); } catch (_) {}
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
  await env.AIML_INGESTION_KV.put(
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

    if (s.includes("IN_PROGRESS")) return true;

    if (s === "STATUS_SCHEDULED" && m.kickoff_ms >= now - 4 * 60 * 60 * 1000) {
      return true;
    }

    return false;
  });

  return jsonResponse({ date, matches: filtered });
}

/* ================= EXPORT ================= */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });

    if (url.pathname === "/fixtures-runtime") {
      return handleFixturesRuntime(req, env);
    }

    return jsonResponse({ ok: false, error: "invalid_route" }, 404);
  },

  async scheduled(event, env, ctx) {
    const started = Date.now();
    console.log("[scheduler] cron tick");

    ctx.waitUntil((async () => {
      

  // ================================
  // KV RUNTIME PROBE (TEMP DEBUG)
  // ================================
  try {
    const probeKey = "DEBUG:KV_PROBE";

    await env.AIML_INGESTION_KV.put(
      probeKey,
      JSON.stringify({
        ts: Date.now(),
        iso: new Date().toISOString()
      })
    );

    const verify = await env.AIML_INGESTION_KV.get(probeKey);

    console.log("[KV PROBE]", verify ? "WRITE_OK" : "WRITE_FAILED");
  } catch (e) {
    console.log("[KV PROBE ERROR]", e?.message || e);
  }

  // ---- συνεχίζει ο υπάρχων κώδικας ----
      // heartbeat start
      try {
        await writeHeartbeat(env, { ts: started, iso: new Date(started).toISOString(), ok: true, stage: "start" });
      } catch (_) {}

      try {
        // -------------------
        // INGEST WINDOW
        // -------------------
        await ingestUTCWindow(env, ctx);
        console.log("[scheduler] ingest done");
        
        // -------------------
        // SAFE FINALIZE WINDOW (Athens day keys)
        // -------------------
        const now = new Date();

        const daysToCheck = [
          dayKeyTZ(ATHENS_TZ, shiftUTC(now, -2)),
          dayKeyTZ(ATHENS_TZ, shiftUTC(now, -1)),
          dayKeyTZ(ATHENS_TZ, now)
        ];

        for (const day of daysToCheck) {
          try {
            console.log("[scheduler] finalize check", day);
            await finalizeDay(env, day);
          } catch (e) {
            console.error("[scheduler] finalize failed", day, e);
          }
        }

        // -------------------
        // SELF CLEANUP (non-blocking, cheap)
        // -------------------
        await cleanupKV(env);
        await cleanupR2(env);

        const finished = Date.now();
        await writeHeartbeat(env, {
          ts: finished,
          iso: new Date(finished).toISOString(),
          ok: true,
          stage: "done",
          ms: finished - started
        });

        console.log("[scheduler] done");
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
      }
    })());
  }
};
