// ============================================================
// AIMATCHLAB AI ENGINE – STABLE CORE v4.3 OPS
// - Deterministic Season Builder
// - Standings Safe
// - Integrity Scan
// - Team/Matchup Context
// - Match Intel
// - Ops: safe router, system health/metrics, protected internal tools
// ============================================================

import { buildSeason } from "./engine/season-builder.js";
import { LEAGUE_SEEDS } from "./_shared/leagues-registry.js";
import { computeIntelDelta } from "./engine/intel/intel-delta.js";
import { buildMatchIntel } from "./engine/intel/match-intel.js";
const ENGINE_VERSION = "v4.3-ops";

// ------------------------------------------------------------
// IN-FLIGHT INTEL COMPUTE LOCK
// ------------------------------------------------------------
const __intelInflight = new Map();

// -----------------------------
// OPS HELPERS
// -----------------------------
function requireInternal(request, env) {
  const expected = env?.INTERNAL_SECRET;
  if (!expected) return false; // if not configured, treat as locked
  const got =
    request.headers.get("x-aiml-secret") ||
    request.headers.get("x-internal-secret") ||
    "";
  return got === expected;
}

async function safeExec(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("[AI_ENGINE_FATAL]", err);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    return safeExec(async () => {
      const url = new URL(request.url);

      // ------------------------------------------------------------
      // CORS (preflight)
      // ------------------------------------------------------------
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "content-type,x-aiml-secret,x-internal-secret"
          }
        });
      }


      const pathname = url.pathname;

      // ------------------------------------------------------------
      // HEALTH (legacy)
      // ------------------------------------------------------------
      if (pathname === "/ai/health") {
        return json({ ok: true, version: ENGINE_VERSION });
      }

      // ------------------------------------------------------------
      // SYSTEM HEALTH (ops)
      // ------------------------------------------------------------
      if (pathname === "/system/health") {
        const now = Date.now();

        let schedulerTick = null;
        try {
          schedulerTick = await env.AIML_INGESTION_KV.get("SCHEDULER:LAST_TICK");
        } catch (_) {}

        let aiBuildIdx = null;
        try {
          aiBuildIdx = await env.AIML_INGESTION_KV.get("AI_BUILD_IDX");
        } catch (_) {}

        return json({
          ok: true,
          service: "aimatchlab-ai-engine",
          version: ENGINE_VERSION,
          ts: now,
          scheduler: {
            lastTick: schedulerTick ? JSON.parse(schedulerTick) : null
          },
          ai: {
            buildIdx: aiBuildIdx ? Number(aiBuildIdx) : 0
          }
        });
      }

      // ------------------------------------------------------------
      // SYSTEM METRICS (lightweight)
      // ------------------------------------------------------------
      if (pathname === "/system/metrics") {
        // KV counts are approximate due to pagination limits; keep it cheap.
        const out = { ok: true, ts: Date.now(), kv: {}, r2: {} };

        try {
          const a = await env.AIML_INGESTION_KV.list({ prefix: "FIXTURES:STAGING:DATE:" });
          const b = await env.AIML_INGESTION_KV.list({ prefix: "FIXTURES:DATE:" });
          out.kv.stagingDays = a?.keys?.length ?? 0;
          out.kv.finalDays = b?.keys?.length ?? 0;
        } catch (_) {}

        try {
          const list = await env.AI_STATE.list({ prefix: "intel/context/" });
          out.r2.intelObjects = list?.objects?.length ?? 0;
        } catch (_) {}

        return json(out);
      }

      // ------------------------------------------------------------
      // BUILD SEASON (INTERNAL)
      // ------------------------------------------------------------
      if (pathname === "/ai/build-season") {
        if (!requireInternal(request, env)) {
          return json({ ok: false, error: "unauthorized" }, 403);
        }

        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");

        if (!league || !season) {
          return json({ ok: false, error: "missing_league_or_season" }, 400);
        }

        const result = await buildSeason(env, league, season);
        return json(result);
      }

// ------------------------------------------------------------
// FAST SEASON BACKFILL (INTERNAL TOOL)
// ------------------------------------------------------------
if (pathname === "/ai/build-season-fast") {

  if (!requireInternal(request, env)) {
    return json({ ok:false, error:"unauthorized" },403);
  }

  const league = url.searchParams.get("league");
  const season = url.searchParams.get("season");

  if (!league || !season) {
    return json({ ok:false, error:"missing_params" },400);
  }

  let runs = 0;
  let total = 0;
  let done = false;

  while (!done && runs < 60) {

    const res = await buildSeason(env, league, season);

    runs++;
    total += Number(res?.totalMatchesProcessed || 0);

    if (res?.nextFrom && res.nextFrom.startsWith("2026")) {
      done = true;
    }

    // small pause to avoid ESPN burst
    await new Promise(r => setTimeout(r, 40));
  }

  return json({
    ok:true,
    league,
    season,
    runs,
    totalMatchesProcessed: total
  });
}


      // ------------------------------------------------------------
      // BUILD ALL (INTERNAL)
      // ------------------------------------------------------------
      if (pathname === "/ai/build-all") {
        if (!requireInternal(request, env)) {
          return json({ ok: false, error: "unauthorized" }, 403);
        }

        const season = url.searchParams.get("season");
        if (!season) {
          return json({ ok: false, error: "missing_season" }, 400);
        }

        // discover leagues dynamically from AI_STATE
        const listed = await env.AI_STATE.list({
          prefix: "league/"
        });

        const leaguesSet = new Set();

        for (const obj of listed.objects || []) {
         const parts = obj.key.split("/");
         // league/<league>/<season>/...
         if (parts.length >= 3) {
           leaguesSet.add(parts[1]);
         }
        }

        const leagues = [...leaguesSet];

        const results = [];

        for (const league of leagues) {
          try {
            const data = await buildSeason(env, league, season);
            results.push({ league, ...data, ok: true });
          } catch (e) {
            console.error("[BUILD_ALL_FAIL]", league, e);
            results.push({ league, ok: false, error: true });
          }
        }

        return json({ ok: true, season, results });
      }

      // ------------------------------------------------------------
      // LEAGUE STATE DEBUG
      // ------------------------------------------------------------
      if (pathname === "/ai/league-state") {
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");

        if (!league || !season) {
          return json({ ok: false, error: "missing_params" }, 400);
        }

        const key = `league/${league}/${season}/meta.json`;
        const obj = await env.AI_STATE.get(key);

        if (!obj) {
          return json({ ok: false, error: "no_meta" }, 404);
        }

        let meta;
        try {
          meta = JSON.parse(await obj.text());
        } catch (e) {
          console.log("meta read failed", e);
          return json({ ok: false, error: "meta_read_failed" }, 500);
        }

        return json({
          ok: true,
          league,
          season,
          leagueVersion: meta.leagueVersion ?? 0,
          rankingHash: meta.rankingHash ?? null
        });
      }

      // ------------------------------------------------------------
      // TEAM CONTEXT
      // ------------------------------------------------------------
      if (pathname === "/ai/team-context") {
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");
        const team = url.searchParams.get("team");

        if (!league || !season || !team) {
          return json({ ok: false, error: "missing_params" }, 400);
        }

        const { buildTeamContext } = await import("./engine/context/team-context.js");
        const result = await buildTeamContext(env, league, season, team);
        return json(result);
      }

      // ------------------------------------------------------------
      // MATCHUP CONTEXT
      // ------------------------------------------------------------
      if (pathname === "/ai/matchup-context") {
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");
        const home = url.searchParams.get("home");
        const away = url.searchParams.get("away");

        if (!league || !season || !home || !away) {
          return json({ ok: false, error: "missing_params" }, 400);
        }

        const { buildMatchupContext } = await import("./engine/context/matchup-context.js");
        const result = await buildMatchupContext(env, league, season, home, away);
        return json(result);
      }

      // ------------------------------------------------------------
      // INTEGRITY SCAN
      // ------------------------------------------------------------
      if (pathname === "/ai/scan-integrity") {
        const league = url.searchParams.get("league");
        const season = url.searchParams.get("season");

        if (!league || !season) {
          return json({ ok: false, error: "missing_league_or_season" }, 400);
        }

        const { scanIntegrity } = await import("./engine/integrity-scan.js");
        return scanIntegrity(env, league, season);
      }

// ------------------------------------------------------------
// INTEL TIMELINE (PHASE MEMORY)
// ------------------------------------------------------------
if (pathname === "/ai/intel-timeline") {
  const id = url.searchParams.get("id");
  if (!id) return json({ ok: false, error: "missing_id" }, 400);

  // (optional) keep same protection policy as /ai/match-intel
  // If your /ai/match-intel requires internal auth, copy the same check here.
  // Example:
  // const secret = req.headers.get("x-internal-secret");
  // if (secret !== env.INTERNAL_SECRET) return json({ ok:false, error:"unauthorized" }, 401);

  const key = `intel/context/${id}/timeline.json`;

  try {
    const obj = await env.AI_STATE.get(key);
    if (!obj) return json({ ok: true, id, timeline: [], cache: "MISS" });

    const text = await obj.text();
    let timeline = [];
    try {
      const parsed = JSON.parse(text);
      timeline = Array.isArray(parsed) ? parsed : [];
    } catch (_) {}

    return json({ ok: true, id, timeline, cache: "HIT" });
  } catch (e) {
    return json({ ok: false, error: "read_failed", id }, 500);
  }
}

// ------------------------------------------------------------
// INTEL SIGNALS (READ LOG)
// ------------------------------------------------------------
if (pathname === "/ai/intel-signals") {

  const matchId = url.searchParams.get("id");

  if (!matchId) {
    return json({ ok: false, error: "missing_id" }, 400);
  }

  const key = `intel/context/${matchId}/signal-log.json`;

  try {
    const obj = await env.AI_STATE.get(key);

    if (!obj) {
      return json({
        ok: true,
        matchId,
        signals: []
      });
    }

    const signals = JSON.parse(await obj.text());

    return json({
      ok: true,
      matchId,
      signals
    });

  } catch (e) {
    console.log("[INTEL SIGNAL READ FAIL]", e);

    return json({
      ok: false,
      error: "read_failed"
    }, 500);
  }
}

// ------------------------------------------------------------
// MATCH INTEL BATCH
// ------------------------------------------------------------
if (pathname.startsWith("/ai/match-intel-batch")) {


  let body = null;

  try {
    body = await request.json();
  } catch (_) {}

  const ids = Array.isArray(body?.ids) ? body.ids : [];

  const results = [];

  for (const matchId of ids.slice(0, 80)) {


    try {

      const inflight = __intelInflight.get(matchId);

      if (inflight) {
        await inflight;
        results.push({ id: matchId, ok: true, cache: "INFLIGHT" });
        continue;
      }

      const promise =
        buildMatchIntel(env, matchId)
          .finally(() => {
            __intelInflight.delete(matchId);
          });

      __intelInflight.set(matchId, promise);

      await promise;

      results.push({ id: matchId, ok: true });

    } catch (e) {

      console.log("[INTEL BATCH FAIL]", matchId);

      results.push({ id: matchId, ok: false });

    }

  }

  return json({
    ok: true,
    processed: results.length
  });

}

// ------------------------------------------------------------
// MATCH INTEL (public) — PERSISTENT CACHE ENABLED
// ------------------------------------------------------------
if (pathname === "/ai/match-intel") {

  const id = url.searchParams.get("id");
  if (!id) return json({ ok:false, error:"missing_id" }, 400);

  const rawId = id.trim();
  const force = rawId.includes("|force");

  const matchId = force
    ? rawId.replace("|force", "")
    : rawId;

  const cacheKey =
    `intel/context/${matchId}/latest.json`;

  let pointerCache = null;
  let pointerParsed = null;

// ---------------- CACHE READ ----------------
if (!force) {
// ------------------------------------------------------------
// LIVE FAST PATH
// ------------------------------------------------------------
try {

  const liveObj =
    await env.AI_STATE.get(`intel/live/${matchId}.json`);

  if (liveObj) {

    const liveData = await liveObj.json();

    if (liveData?.meta?.phase === "LIVE") {

      liveData.cache = "LIVE";

      return json(liveData);

    }

  }

} catch (e) {
  console.log("[LIVE CACHE READ FAIL]", e);
}
  try {

    pointerCache = await env.AI_STATE.get(cacheKey);

    if (pointerCache) {

      pointerParsed = await pointerCache.json();
      const pointer = pointerParsed;

      // pointer sanity check
      if (pointer?.latest && typeof pointer.latest === "string") {

        const latestObj =
          await env.AI_STATE.get(pointer.latest);

        if (latestObj) {

          const data = await latestObj.json();

          // ensure snapshot structure is valid
          if (data && data.ok && data.matchId === matchId) {

            data.cache = "HIT";
            return json(data);

          }

        }

      }

    }

  } catch (e) {

    console.log("[INTEL CACHE READ FAIL]", e);

  }
}

// ------------------------------------------------------------
// QUICK STATE CHECK (avoid recompute)
// ------------------------------------------------------------
try {

  const pointerObj =
    pointerParsed || pointerCache || await env.AI_STATE.get(cacheKey);

  if (pointerObj) {

    const pointer =
      pointerParsed || JSON.parse(await pointerObj.text());

    if (pointer?.latest) {

      const prevObj =
        await env.AI_STATE.get(pointer.latest);

      if (prevObj) {

        const prevIntel =
          JSON.parse(await prevObj.text());

        const prevSig =
          prevIntel?.meta?.stateSignature;

        if (prevSig) {

          const latestData = prevIntel;

          const currentSig =
            [
              latestData?.basic?.status,
              latestData?.basic?.scoreHome,
              latestData?.basic?.scoreAway,
              latestData?.basic?.status?.displayClock
            ].join("|");

          if (prevSig === currentSig) {

            // avoid FAST_HIT during LIVE phase
            if (latestData?.meta?.phase !== "LIVE") {

              latestData.cache = "FAST_HIT";
              return json(latestData);

            }

          }

        }

      }

    }

  }

} catch (e) {
  console.log("[FAST STATE CHECK FAIL]", e);
}

// ------------------------------------------------------------
// ENSURE SEASON MEMORY BEFORE INTEL BUILD
// (DISABLED – handled by scheduler)
// ------------------------------------------------------------
try {

  const indexObj =
    await env.AI_STATE.get(`match-index/${matchId}.json`);

  if (indexObj) {

    const idx = JSON.parse(await indexObj.text());

    if (idx?.league && idx?.season) {
      // await buildSeason(env, idx.league, idx.season);
    }

  }

} catch (e) {
  console.log("[SEASON ENSURE FAIL]", matchId, e);
}
  // ---------------- COMPUTE ----------------

let result;

const inflight = __intelInflight.get(matchId);

if (inflight) {

  // another request already computing
  result = await inflight;

} else {

  const promise =
    buildMatchIntel(env, matchId)
      .finally(() => {
        __intelInflight.delete(matchId);
      });

  __intelInflight.set(matchId, promise);

  result = await promise;
}

// ------------------------------------------------------------
// AUTO SEASON BUILD + RETRY (DISABLED – handled by scheduler)
// ------------------------------------------------------------
if (result?.error === "match_not_found") {

  try {

    const indexObj =
      await env.AI_STATE.get(`match-index/${matchId}.json`);

    if (indexObj) {

      const idx =
        JSON.parse(await indexObj.text());

      if (idx?.league && idx?.season) {

        console.log("[AUTO BUILD DISABLED – waiting for scheduler]", idx.league);

        return json({
          ok:false,
          error:"season_not_ready",
          league: idx.league
        },503);

      }

    }

  } catch (e) {
    console.log("[AUTO BUILD RETRY FAIL]", e);
  }

}
// ------------------------------------------------------------
// AUTO BACKFILL IF MATCH MISSING
// ------------------------------------------------------------
if (
  !result?.ok &&
  result?.error === "match_not_found" &&
  !result?.__backfillAttempt
) {

  console.log("[AUTO BACKFILL]", matchId);

  const match =
    await fetchMatchFromESPN(matchId);

  if (!match) {
    return json({
      ok:false,
      error:"match_not_found"
    },404);
  }

  // ------------------------------------------------------------
  // LEAGUE SAFETY (prevent unknown leagues)
  // ------------------------------------------------------------
  if (!match.league || !match.season) {
    console.log("[AUTO BACKFILL INVALID LEAGUE]", matchId);
    return json({
      ok:false,
      error:"invalid_league_mapping"
    },500);
  }

  const matchKey =
    `league/${match.league}/${match.season}/matches/${match.id}.json`;

  const indexKey =
    `match-index/${match.id}.json`;

  try {

    // write match
    await env.AI_STATE.put(
      matchKey,
      JSON.stringify(match),
      {
        httpMetadata:{
          contentType:"application/json"
        }
      }
    );

    // write index pointer
    await env.AI_STATE.put(
      indexKey,
      JSON.stringify({
        league: match.league,
        season: match.season,
        updatedAt: Date.now()
      }),
      {
        httpMetadata:{
          contentType:"application/json"
        }
      }
    );

    console.log("[AUTO BACKFILL WRITTEN]", matchKey);

  } catch (e) {

    console.log("[AUTO BACKFILL WRITE FAIL]", e);

    return json({
      ok:false,
      error:"backfill_write_failed"
    },500);

  }

// ------------------------------------------------------------
// RERUN INTEL AFTER BACKFILL
// ------------------------------------------------------------
result = await buildMatchIntel(env, matchId);

if (result && typeof result === "object") {
  result.__backfillAttempt = true;
}

}


// ---------------- SCORE MEMORY ----------------
try {

  const scoreMemoryKey =
    `intel/context/${matchId}/last-score.json`;

  let prevScore = null;

  const prevObj = await env.AI_STATE.get(scoreMemoryKey);
  if (prevObj) {
    prevScore = JSON.parse(await prevObj.text());
  }

  const prevHome = Number(prevScore?.home ?? 0);
  const prevAway = Number(prevScore?.away ?? 0);

  const curHome = Number(result?.basic?.scoreHome ?? 0);
  const curAway = Number(result?.basic?.scoreAway ?? 0);

  const signals = [];

  if (curHome > prevHome || curAway > prevAway) {

    // ---------------- GOAL EVENT (GUARDED) ----------------
    if (!signals.some(s => s.type === "GOAL_EVENT")) {

      signals.push({
        type: "GOAL_EVENT",
        ts: Date.now(),
        home: curHome,
        away: curAway
      });

    }

    const minuteRaw =
      result?.basic?.status?.displayClock || "";

    const minuteNum =
      parseInt(String(minuteRaw).replace(/[^0-9]/g, ""), 10);

    if (!isNaN(minuteNum) && minuteNum >= 75) {
      signals.push({
        type: "VOLATILITY_SPIKE",
        reason: "LATE_GOAL",
        minute: minuteNum,
        ts: Date.now()
      });
    }
  }

  if (signals.length) {
    result.signals = [
      ...(Array.isArray(result.signals) ? result.signals : []),
      ...signals
    ];
  }

  await env.AI_STATE.put(
    scoreMemoryKey,
    JSON.stringify({
      home: curHome,
      away: curAway,
      ts: Date.now()
    }),
    { httpMetadata: { contentType: "application/json" } }
  );

} catch (e) {
  console.log("[SIGNALS BUILD FAIL]", e);
}
// ------------------------------------------------------------
// LIVE SIGNAL STREAM WRITE
// ------------------------------------------------------------
try {

  if (Array.isArray(result?.signals) && result.signals.length) {

    const signalKey =
      `intel/context/${matchId}/signal-log.json`;

    let existing = [];

    const existingObj =
      await env.AI_STATE.get(signalKey);

    if (existingObj) {
      try {
        existing = JSON.parse(await existingObj.text());
        if (!Array.isArray(existing)) existing = [];
      } catch (_) {}
    }

    const newSignals = result.signals.map(s => ({
      ...s,
      matchId
    }));

    // --------------------------------
    // MERGE + DUPLICATE FILTER
    // --------------------------------
    const merged = [...existing];

    for (const s of newSignals) {

      const duplicate = existing.find(e =>
        e.type === s.type &&
        e.home === s.home &&
        e.away === s.away &&
        Math.abs((e.ts || 0) - (s.ts || 0)) < 15000
      );

      if (!duplicate) {
        merged.push(s);
      }

    }

    const trimmed =
      merged.slice(-120);

    await env.AI_STATE.put(
      signalKey,
      JSON.stringify(trimmed),
      {
        httpMetadata: {
          contentType: "application/json"
        }
      }
    );

  }

} catch (e) {
  console.log("[SIGNAL STREAM WRITE FAIL]", e);
}

// ------------------------------------------------------------
// INTEL DELTA COMPUTE
// ------------------------------------------------------------
try {

  const prevPointer =
    pointerCache || await env.AI_STATE.get(cacheKey);

  if (prevPointer) {

    const pointer =
      JSON.parse(await prevPointer.text());

    if (pointer?.latest) {

      const prevObj =
        await env.AI_STATE.get(pointer.latest);

      if (prevObj) {

        const prevIntel =
          JSON.parse(await prevObj.text());

        const minute =
          parseInt(
            String(result?.basic?.status?.displayClock || "")
              .replace(/[^0-9]/g,"")
          ) || 0;

        const delta =
          computeIntelDelta(prevIntel, result, minute);

        if (delta) {
          result.delta = delta;
        }

      }

    }

  }

} catch (e) {
  console.log("[INTEL DELTA FAIL]", e);
}

// ------------------------------------------------------------
// INTEL TIMELINE WRITER (SAFE / NO DUPLICATES)
// ------------------------------------------------------------
try {

  const timelineKey =
    `intel/context/${matchId}/timeline.json`;

  let timeline = [];

  const existing =
    await env.AI_STATE.get(timelineKey);

  if (existing) {
    try {
      timeline = JSON.parse(await existing.text());
      if (!Array.isArray(timeline)) timeline = [];
    } catch (_) {
      timeline = [];
    }
  }

  const phase =
    result?.meta?.phase || "UNKNOWN";

  const minuteRaw =
    result?.basic?.status?.displayClock || "";

  const minute =
    parseInt(
      String(minuteRaw).replace(/[^0-9]/g,""),
      10
    ) || 0;

  const nowTs = Date.now();

  const last =
    timeline.length
      ? timeline[timeline.length - 1]
      : null;

  let shouldWrite = false;

  if (!last) {
    shouldWrite = true;
  }

  else if (last.phase !== phase) {
    shouldWrite = true;
  }

  else if (
    minute &&
    last.minute !== minute &&
    Math.abs((last.ts || 0) - nowTs) > 15000
  ) {
    // allow update if minute changed but not spam
    shouldWrite = true;
  }

  if (shouldWrite) {

    timeline.push({
      phase,
      minute,
      ts: nowTs
    });

    const trimmed =
      timeline.slice(-200);

    await env.AI_STATE.put(
      timelineKey,
      JSON.stringify(trimmed),
      {
        httpMetadata: {
          contentType: "application/json"
        }
      }
    );

  }

} catch (e) {
  console.log("[TIMELINE WRITE FAIL]", e);
}

// ------------------------------------------------------------
// GAME STATE ENGINE (STABLE)
// ------------------------------------------------------------
try {

  const minuteRaw =
    result?.basic?.status?.displayClock || "";

  const minute =
    parseInt(
      String(minuteRaw).replace(/[^0-9]/g,""),
      10
    ) || 0;

  const home =
    Number(result?.basic?.scoreHome || 0);

  const away =
    Number(result?.basic?.scoreAway || 0);

  const phase =
    result?.meta?.phase || "UNKNOWN";

  const diff =
    Math.abs(home - away);

  const signals =
    Array.isArray(result?.signals)
      ? result.signals
      : [];

  let gameState = "UNKNOWN";

  // ------------------------------------------------------------
  // PRE
  // ------------------------------------------------------------
  if (phase === "PRE") {
    gameState = "PRE_MATCH";
  }

  // ------------------------------------------------------------
  // FINAL
  // ------------------------------------------------------------
  else if (phase === "FINAL") {
    gameState = "MATCH_FINISHED";
  }

  // ------------------------------------------------------------
  // LIVE STATES
  // ------------------------------------------------------------
  else if (phase === "LIVE") {

    if (minute <= 20) {
      gameState = "LIVE_EARLY";
    }

    else if (minute <= 60) {
      gameState = "LIVE_MID";
    }

    else {
      gameState = "LIVE_LATE";
    }

  }

  // ------------------------------------------------------------
  // CHAOS DETECTION
  // ------------------------------------------------------------
  const volatilitySignal =
    signals.find(s =>
      s?.type === "VOLATILITY_SPIKE"
    );

  if (volatilitySignal && phase === "LIVE") {
    gameState = "LIVE_CHAOTIC";
  }

  // ------------------------------------------------------------
  // PRESSURE INDEX
  // ------------------------------------------------------------
  let pressure = 0;

  if (phase === "LIVE") {

    const timePressure =
      Math.min(minute / 90, 1);

    const scorePressure =
      diff === 0
        ? 0.9
        : diff === 1
          ? 0.7
          : 0.4;

    const signalPressure =
      signals.length
        ? Math.min(signals.length * 0.08, 0.25)
        : 0;

    pressure =
      Math.min(
        timePressure * 0.5 +
        scorePressure * 0.35 +
        signalPressure,
        1
      );

  }

  // ------------------------------------------------------------
  // WRITE INTO META
  // ------------------------------------------------------------
  if (!result.meta) {
    result.meta = {};
  }

  result.meta.gameState = gameState;

  result.meta.pressure =
    Number(pressure.toFixed(3));

} catch (e) {
  console.log("[GAME STATE ENGINE FAIL]", e);
}

// ------------------------------------------------------------
// INTEL EVOLUTION ENGINE (MATCH PROFILE)
// ------------------------------------------------------------
try {

  const minuteRaw =
    result?.basic?.status?.displayClock || "";

  const minute =
    parseInt(
      String(minuteRaw).replace(/[^0-9]/g,""),
      10
    ) || 0;

  const home =
    Number(result?.basic?.scoreHome || 0);

  const away =
    Number(result?.basic?.scoreAway || 0);

  const phase =
    result?.meta?.phase || "UNKNOWN";

  const pressure =
    Number(result?.meta?.pressure || 0);

  const gameState =
    result?.meta?.gameState || "UNKNOWN";

  const signals =
    Array.isArray(result?.signals)
      ? result.signals
      : [];

  const delta =
    result?.delta || {};

  const diff =
    home - away;

  let profile = "UNKNOWN";
  let confidence = 0.5;

  // ------------------------------------------------------------
  // PRE MATCH
  // ------------------------------------------------------------
  if (phase === "PRE") {

    profile = "PRE_MATCH";
    confidence = 0.5;

  }

  // ------------------------------------------------------------
  // FINISHED
  // ------------------------------------------------------------
  else if (phase === "FINAL") {

    profile = "MATCH_FINISHED";
    confidence = 1;

  }

  // ------------------------------------------------------------
  // LIVE ANALYSIS
  // ------------------------------------------------------------
  else if (phase === "LIVE") {

    const volatilitySignal =
      signals.find(s =>
        s?.type === "VOLATILITY_SPIKE"
      );

    const goalSignal =
      signals.find(s =>
        s?.type === "GOAL_EVENT"
      );

    const deltaStrength =
      Number(delta?.strength || 0);

    // --------------------------------
    // CHAOTIC MATCH
    // --------------------------------
    if (volatilitySignal || deltaStrength > 0.35) {

      profile = "CHAOTIC";
      confidence = 0.75;

    }

    // --------------------------------
    // LATE DRAMA
    // --------------------------------
    else if (
      minute >= 75 &&
      pressure > 0.75 &&
      Math.abs(diff) <= 1
    ) {

      profile = "LATE_DRAMA";
      confidence = 0.82;

    }

    // --------------------------------
    // HOME CONTROL
    // --------------------------------
    else if (diff >= 1 && pressure < 0.7) {

      profile = "CONTROL_HOME";
      confidence = 0.68;

    }

    // --------------------------------
    // AWAY CONTROL
    // --------------------------------
    else if (diff <= -1 && pressure < 0.7) {

      profile = "CONTROL_AWAY";
      confidence = 0.68;

    }

    // --------------------------------
    // BALANCED MATCH
    // --------------------------------
    else {

      profile = "BALANCED";
      confidence = 0.6;

    }

    // --------------------------------
    // EARLY GAME ADJUSTMENT
    // --------------------------------
    if (gameState === "LIVE_EARLY") {
      confidence =
        Math.min(confidence, 0.6);
    }

  }

  // ------------------------------------------------------------
  // WRITE INTO META
  // ------------------------------------------------------------
  if (!result.meta) {
    result.meta = {};
  }

  result.meta.profile = profile;

  result.meta.profileConfidence =
    Number(confidence.toFixed(3));

} catch (e) {
  console.log("[INTEL EVOLUTION FAIL]", e);
}

// ------------------------------------------------------------
// LIVE EVOLUTION LAYER (momentum / volatility / control)
// ------------------------------------------------------------
try {

  const phase =
    result?.meta?.phase || "UNKNOWN";

  const minuteRaw =
    result?.basic?.status?.displayClock || "";

  const minute =
    parseInt(
      String(minuteRaw).replace(/[^0-9]/g,""),
      10
    ) || 0;

  const home =
    Number(result?.basic?.scoreHome || 0);

  const away =
    Number(result?.basic?.scoreAway || 0);

  const signals =
    Array.isArray(result?.signals)
      ? result.signals
      : [];

  let momentum = 0.5;
  let volatility = 0.2;
  let control = "BALANCED";

  if (phase === "LIVE") {

    const diff = home - away;

    // momentum based on score pressure
    if (diff > 0) momentum += 0.15;
    if (diff < 0) momentum -= 0.15;

    // signals influence
    const volatilitySignal =
      signals.find(s => s?.type === "VOLATILITY_SPIKE");

    const goalSignal =
      signals.find(s => s?.type === "GOAL_EVENT");

    if (goalSignal) {
      volatility += 0.2;
    }

    if (volatilitySignal) {
      volatility += 0.25;
    }

    // time pressure
    const timeFactor =
      Math.min(minute / 90, 1);

    momentum += timeFactor * 0.1;

    // clamp
    momentum = Math.max(0, Math.min(momentum, 1));
    volatility = Math.max(0, Math.min(volatility, 1));

    // control estimation
    if (diff > 0) control = "HOME";
    else if (diff < 0) control = "AWAY";

  }

  if (!result.meta) result.meta = {};

  result.meta.momentum =
    Number(momentum.toFixed(3));

  result.meta.volatility =
    Number(volatility.toFixed(3));

  result.meta.control = control;

} catch (e) {
  console.log("[LIVE EVOLUTION FAIL]", e);
}

// ------------------------------------------------------------
// AI MATCH NARRATIVE ENGINE
// ------------------------------------------------------------
try {

  const phase =
    result?.meta?.phase || "UNKNOWN";

  const profile =
    result?.meta?.profile || "UNKNOWN";

  const pressure =
    Number(result?.meta?.pressure || 0);

  const gameState =
    result?.meta?.gameState || "UNKNOWN";

  const home =
    Number(result?.basic?.scoreHome || 0);

  const away =
    Number(result?.basic?.scoreAway || 0);

  const minuteRaw =
    result?.basic?.status?.displayClock || "";

  const minute =
    parseInt(
      String(minuteRaw).replace(/[^0-9]/g,""),
      10
    ) || 0;

  const signals =
    Array.isArray(result?.signals)
      ? result.signals
      : [];

  const delta =
    result?.delta || {};

  let narrative = "";
  let confidence = 0.55;

  // ------------------------------------------------------------
  // PRE MATCH
  // ------------------------------------------------------------
  if (phase === "PRE") {

    narrative =
      "Match has not started yet. Teams are entering the pre-match phase.";

    confidence = 0.5;

  }

  // ------------------------------------------------------------
  // FINAL
  // ------------------------------------------------------------
  else if (phase === "FINAL") {

    narrative =
      `Match finished ${home}-${away}. Final match state recorded.`;

    confidence = 1;

  }

  // ------------------------------------------------------------
  // LIVE MATCH ANALYSIS
  // ------------------------------------------------------------
  else if (phase === "LIVE") {

    const volatility =
      signals.find(s => s.type === "VOLATILITY_SPIKE");

    const goal =
      signals.find(s => s.type === "GOAL_EVENT");

    if (profile === "CHAOTIC") {

      narrative =
        "Match has entered a chaotic phase with rising volatility and unstable momentum.";

      confidence = 0.75;

    }

    else if (profile === "LATE_DRAMA") {

      narrative =
        "Late match drama building with high pressure and narrow score margin.";

      confidence = 0.82;

    }

    else if (profile === "CONTROL_HOME") {

      narrative =
        "Home side appears to control the match rhythm with a stable advantage.";

      confidence = 0.68;

    }

    else if (profile === "CONTROL_AWAY") {

      narrative =
        "Away side currently controls the match dynamics and scoreboard pressure.";

      confidence = 0.68;

    }

    else {

      narrative =
        "Match remains balanced with neither side establishing clear control.";

      confidence = 0.6;

    }

    if (goal) {

      narrative =
        `Recent goal event detected. Current score ${home}-${away}. ${narrative}`;

    }

    if (pressure > 0.8 && minute >= 75) {

      narrative +=
        " Match pressure is extremely high entering the final stages.";

      confidence =
        Math.max(confidence, 0.85);

    }

  }

  // ------------------------------------------------------------
  // WRITE OUTPUT
  // ------------------------------------------------------------
  result.narrative = narrative;

  result.confidence =
    Number(confidence.toFixed(3));

} catch (e) {
  console.log("[NARRATIVE ENGINE FAIL]", e);
}

// ------------------------------------------------------------
// STATE SIGNATURE BUILD
// ------------------------------------------------------------
try {

  const status =
    result?.basic?.status || "";

  const home =
    Number(result?.basic?.scoreHome || 0);

  const away =
    Number(result?.basic?.scoreAway || 0);

  const minuteRaw =
    result?.basic?.status?.displayClock || "";

  const minute =
    parseInt(
      String(minuteRaw).replace(/[^0-9]/g,""),
      10
    ) || 0;

  if (!result.meta) result.meta = {};

  result.meta.stateSignature =
    [
      status,
      home,
      away,
      minute
    ].join("|");

} catch (e) {
  console.log("[STATE SIGNATURE BUILD FAIL]", e);
}

// ---------------- STATE CHANGE CHECK ----------------
let skipVersionWrite = false;

try {

  const prevPointer =
    pointerCache || await env.AI_STATE.get(cacheKey);

  if (prevPointer) {

    const pointer =
      JSON.parse(await prevPointer.text());

    if (pointer?.latest) {

      const prevObj =
        await env.AI_STATE.get(pointer.latest);

      if (prevObj) {

        const prevIntel =
          JSON.parse(await prevObj.text());

        const prevSig =
          prevIntel?.meta?.stateSignature;

        const newSig =
          result?.meta?.stateSignature;

        if (
          prevSig &&
          newSig &&
          prevSig === newSig &&
          result?.meta?.phase === "LIVE"
         ) {

          skipVersionWrite = true;

          result.cache = "HIT";

         }

      }

    }

  }

} catch (e) {

  console.log("[STATE CHECK FAIL]", e);

}

// ---------------- VERSION WRITE ----------------
if (!skipVersionWrite) {

  try {

    const versionTs = Date.now();

    const versionKey =
      `intel/context/${matchId}/versions/${versionTs}.json`;

    // ------------------------------------------------------------
    // WRITE VERSION SNAPSHOT
    // ------------------------------------------------------------
    await env.AI_STATE.put(
      versionKey,
      JSON.stringify(result),
      { httpMetadata: { contentType: "application/json" } }
    );

    // ------------------------------------------------------------
// ------------------------------------------------------------
// VERSION LIMITER (DISABLED – exceeds subrequest limits)
// ------------------------------------------------------------
/*
try {

  const prefix =
    `intel/context/${matchId}/versions/`;

  const list =
    await env.AI_STATE.list({ prefix });

  if (list.objects && list.objects.length > 40) {

    const sorted =
      list.objects
        .map(o => o.key)
        .sort();

    const toDelete =
      sorted.slice(0, sorted.length - 40);

    for (const key of toDelete) {
      await env.AI_STATE.delete(key);
    }

  }

} catch (e) {
  console.log("[VERSION LIMIT FAIL]", e);
}
*/

    // ------------------------------------------------------------
    // UPDATE POINTER (latest snapshot)
    // ------------------------------------------------------------
    await env.AI_STATE.put(
      cacheKey,
      JSON.stringify({
        latest: versionKey,
        ts: versionTs,
        phase: result?.meta?.phase || "UNKNOWN"
      }),
      { httpMetadata: { contentType: "application/json" } }
    );

    // ------------------------------------------------------------
    // LIVE SNAPSHOT WRITE
    // ------------------------------------------------------------
    if (result?.meta?.phase === "LIVE") {

      const liveKey =
        `intel/live/${matchId}.json`;

      try {

        await env.AI_STATE.put(
          liveKey,
          JSON.stringify(result),
          {
            httpMetadata: {
              contentType: "application/json"
            }
          }
        );

      } catch (e) {
        console.log("[LIVE SNAPSHOT WRITE FAIL]", e);
      }

    }

    // ------------------------------------------------------------
    // CLEAN LIVE SNAPSHOT WHEN MATCH FINISHES
    // ------------------------------------------------------------
    if (result?.meta?.phase === "FINAL") {

      try {
        await env.AI_STATE.delete(
          `intel/live/${matchId}.json`
        );
      } catch (e) {
        console.log("[LIVE SNAPSHOT DELETE FAIL]", e);
      }

    }

    result.cache = "MISS";

  } catch (e) {

    console.log("[INTEL VERSION WRITE FAIL]", e);

  }

}

// ------------------------------------------------------------
// IMPORTANT: CLOSE MATCH-INTEL ROUTE
// ------------------------------------------------------------
return json(result);

}

// ------------------------------------------------------------
// CLEAN INVALID LEAGUES (INTERNAL ONE-TIME TOOL)
// ------------------------------------------------------------
if (pathname === "/__cleanup-invalid-leagues") {

  if (!requireInternal(request, env)) {
    return json({ ok:false, error:"unauthorized" },403);
  }

  const list =
    await env.AI_STATE.list({ prefix:"league/" });

  let deleted = 0;

  for (const obj of list.objects || []) {

    const key = obj.key;

    const match =
      key.match(/^league\/([0-9]+)\//);

    if (!match) continue;

    await env.AI_STATE.delete(key);

    deleted++;

  }

  return json({
    ok:true,
    deleted
  });

}
// ------------------------------------------------------------
// AUTO BUILD ALL LEAGUES (DISCOVERY MODE)
// ------------------------------------------------------------
if (pathname === "/ai/build-all-auto") {

  if (!requireInternal(request, env)) {
    return json({ ok:false, error:"unauthorized" }, 403);
  }

  const season = url.searchParams.get("season");
  if (!season) {
    return json({ ok:false, error:"missing_season" }, 400);
  }

  // Discover leagues from R2
  const listed = await env.AI_STATE.list({
    prefix: "league/"
  });

  const leagues = new Set();

  for (const obj of listed.objects || []) {
    const parts = obj.key.split("/");
    // league/<league>/<season>/...
    if (parts.length >= 3) {
      leagues.add(parts[1]);
    }
  }

  const results = [];

  for (const league of leagues) {
    try {
      const res = await buildSeason(env, league, season);
      results.push({ league, ok:true, res });
    } catch (e) {
      console.error("[BUILD_AUTO_FAIL]", league, e);
      results.push({ league, ok:false, error:String(e) });
    }
  }

  return json({
    ok:true,
    leagues:[...leagues],
    total: leagues.size,
    results
  });
}    

// ------------------------------------------------------------
// SEASON COMPLETION
// ------------------------------------------------------------
if (pathname === "/ai/season-completion") {

  const league = url.searchParams.get("league");
  const season = url.searchParams.get("season");

  if (!league || !season) {
    return json({
      ok: false,
      error: "missing_params"
    }, 400);
  }

  const { analyzeSeasonCompletion } =
    await import("./engine/season-builder.js");

  const result =
    await analyzeSeasonCompletion(env, league, season);

  return json({
    ok: true,
    ...result
  });
}

// ------------------------------------------------------------
// INTEL HEALTH CHECK (FULL SYSTEM DIAGNOSTIC)
// ------------------------------------------------------------
if (pathname === "/ai/intel-health") {

  const matchId = url.searchParams.get("id");

  if (!matchId) {
    return json({ ok:false, error:"missing_id" },400);
  }

  try {

    const key = `intel/context/${matchId}/latest.json`;
    const obj = await env.AI_STATE.get(key);

    if (!obj) {
      return json({
        ok:false,
        error:"no_intel_snapshot"
      },404);
    }

    const pointer = JSON.parse(await obj.text());

    let intel = pointer;

    if (pointer?.latest) {
      const latestObj = await env.AI_STATE.get(pointer.latest);
      if (latestObj) {
        intel = JSON.parse(await latestObj.text());
      }
    }
   // ---------------------------------
// LOAD TIMELINE
// ---------------------------------
let timeline = [];

try {
  const timelineObj =
    await env.AI_STATE.get(`intel/context/${matchId}/timeline.json`);

  if (timelineObj) {
    const parsed = JSON.parse(await timelineObj.text());
    if (Array.isArray(parsed)) {
      timeline = parsed;
    }
  }
} catch (_) {}

const health = {
  ok: true,

  intel: !!intel,
  delta: !!intel.delta,
  narrative: !!intel.narrative,
  confidence: !!intel.confidence,
  signals: Array.isArray(intel.signals) && intel.signals.length > 0,
  timeline: Array.isArray(timeline) && timeline.length > 0,

  reactiveReady:
    Array.isArray(intel.signals) &&
    intel.signals.some(s =>
      ["GOAL_EVENT", "VOLATILITY_SPIKE"].includes(s.type)
    )
};

return json(health);

} catch (e) {
  return json({
    ok: false,
    error: "health_check_failed"
  }, 500);
}

// ------------------------------------------------------------
// VALUE ENGINE RUN
// ------------------------------------------------------------
if (pathname === "/value-run") {

  const date =
    url.searchParams.get("date") ||
    new Date().toISOString().slice(0,10);

  const { runValueEngineCore } =
    await import("../_shared/value-engine-core.js");

  const result =
    await runValueEngineCore(env, date);

  return json(result);
}

// ------------------------------------------------------------
// DEFAULT
// ------------------------------------------------------------
return json({ ok: false, error: "invalid_route" }, 404);
      }
    });

  },

async scheduled(event, env, ctx) {

  ctx.waitUntil((async () => {

    try {
// ------------------------------------------------------------
// INTEL QUEUE PROCESSOR
// ------------------------------------------------------------
try {

  const queue = await env.AIML_INGESTION_KV.list({
    prefix: "INTEL:QUEUE:",
    limit: 20
  });

  const matchIds = [];
  if (!queue.keys || !queue.keys.length) return;

  for (const key of queue.keys || []) {
    matchIds.push(key.name.split(":").pop());
  }

  if (matchIds.length) {

    try {

      const resp = await fetch(
        `https://aimatchlab-ai-engine.pierros1402.workers.dev/ai/match-intel-batch`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            ids: matchIds
          })
        }
      );

      let processed = null;

      try {
        const j = await resp.json();
        processed = j?.processed ?? null;
      } catch (_) {}

      for (const key of queue.keys || []) {
        await env.AIML_INGESTION_KV.delete(key.name);
      }

      console.log(
        "[INTEL QUEUE BATCH OK]",
        matchIds.length,
        processed
      );

    } catch (e) {

      for (const key of queue.keys || []) {
        try {
          await env.AIML_INGESTION_KV.delete(key.name);
        } catch (_) {}
      }

      console.log("[INTEL QUEUE BATCH FAIL]", e);

    }

  }

} catch (e) {

  console.log("[INTEL QUEUE ERROR]", e);

}
    const season = "2025-2026";

    const leagues = LEAGUE_SEEDS || [];

    if (!leagues.length) {
      console.log("[AI BUILD] no leagues found");
      return;
    }

    let idx =
      Number(await env.AIML_INGESTION_KV.get("AI_BUILD_IDX") || 0);

    const MAX_PER_CRON = 1;
    const end = Math.min(idx + MAX_PER_CRON, leagues.length);

    console.log("[AI BUILD] start", idx, "→", end);

    for (let i = idx; i < end && i < leagues.length; i++) {
      const league = leagues[i];

      try {
        await buildSeason(env, league, season);
        console.log("[AI BUILD OK]", league);
      } catch (e) {
        console.log("[AI BUILD FAIL]", league, e);
      }
    }

    let next = end;

    if (next >= leagues.length) {
      next = 0;
      console.log("[AI BUILD] FULL CYCLE COMPLETED");
    }

    await env.AIML_INGESTION_KV.put("AI_BUILD_IDX", String(next));

        } catch (err) {

          console.log("[SCHEDULER ERROR]", err);

        }

      })());
    }

};

// ------------------------------------------------------------
// ESPN → AIMATCHLAB LEAGUE MAP
// ------------------------------------------------------------
const LEAGUE_SLUG_MAP = {
  "eng.1": "eng.1",
  "esp.1": "esp.1",
  "ita.1": "ita.1",
  "ger.1": "ger.1",
  "fra.1": "fra.1",
  "uefa.champions": "uefa.champions",
  "uefa.europa": "uefa.europa",
  "uefa.europa.conf": "uefa.europa.conf"
};

// ------------------------------------------------------------
// AUTO MATCH BACKFILL (ESPN FETCH)
// ------------------------------------------------------------
const ESPN_MATCH_BASE =
  "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function fetchMatchFromESPN(matchId) {

  try {

    const url =
      `${ESPN_MATCH_BASE}/scoreboard?event=${matchId}`;

    const res = await fetch(url);

    if (!res.ok) {
      console.log("[AUTO MATCH FETCH FAIL]", res.status);
      return null;
    }

    const data = await res.json();

    const event = data?.events?.[0];
    if (!event) return null;

    const comp = event.competitions?.[0];
    if (!comp) return null;

    const competitors = comp.competitors || [];

    let home =
      competitors.find(c => c.homeAway === "home");

    let away =
      competitors.find(c => c.homeAway === "away");

    if (!home && competitors.length >= 2) home = competitors[0];
    if (!away && competitors.length >= 2) away = competitors[1];

    if (!home || !away) return null;

    const espnSlug =
      event?.leagues?.[0]?.slug ||
      comp?.league?.slug ||
      null;

    let leagueSlug = null;

    // attempt AIMATCHLAB mapping first
    if (espnSlug && LEAGUE_SLUG_MAP[espnSlug]) {
      leagueSlug = LEAGUE_SLUG_MAP[espnSlug];
    }

    // fallback if already correct slug
    if (!leagueSlug && espnSlug) {
      leagueSlug = espnSlug;
    }

    if (!leagueSlug) return null;

    const seasonYear =
      new Date(event.date).getUTCFullYear();

    const season =
      `${seasonYear}-${seasonYear + 1}`;

    return {
      id: event.id,
      league: leagueSlug,
      season,

      date: event.date,

      home: home.team?.displayName || home.team?.name,
      away: away.team?.displayName || away.team?.name,

      scoreHome: Number(home.score || 0),
      scoreAway: Number(away.score || 0),

      status:
        comp.status?.type?.name ||
        event.status?.type?.name ||
        "UNKNOWN",

      minute:
        comp.status?.displayClock ||
        event.status?.displayClock ||
        null
    };

  } catch (e) {
    console.log("[AUTO MATCH FETCH ERROR]", e);
    return null;
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,OPTIONS",
      "access-control-allow-headers": "content-type,x-aiml-secret,x-internal-secret"
    }
  });
}