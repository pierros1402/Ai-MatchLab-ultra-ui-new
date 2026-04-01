// ============================================================
// AIMATCHLAB AI ENGINE – CLEAN TRANSITION INDEX
// Keeps:
// - health / ops read routes
// - match intel routes
// - intel timeline / signals / health
// - value-run
//
// Freezes:
// - season build routes
// - auto backfill
// - cleanup mutation tools
// - legacy scheduled rebuild loop
// ============================================================

import { computeIntelDelta } from "./engine/intel/intel-delta.js";
import { buildMatchIntel } from "./engine/intel/match-intel.js";

const ENGINE_VERSION = "v4.4-clean-transition";

// ------------------------------------------------------------
// IN-FLIGHT INTEL COMPUTE LOCK
// ------------------------------------------------------------
const __intelInflight = new Map();

// ------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------
function requireInternal(request, env) {
  const expected = env?.INTERNAL_SECRET;
  if (!expected) return false;

  const got =
    request.headers.get("x-aiml-secret") ||
    request.headers.get("x-internal-secret") ||
    "";

  return got === expected;
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers":
        "content-type,x-aiml-secret,x-internal-secret"
    }
  });
}

async function safeExec(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("[AI_ENGINE_FATAL]", err);
    return json({ ok: false, error: "internal_error" }, 500);
  }
}

function deprecatedRoute(route) {
  return json(
    {
      ok: false,
      error: "route_frozen",
      route,
      message:
        "This route is frozen during migration to engine-v1 backed AI flow."
    },
    410
  );
}

async function readJsonFromR2(env, key) {
  try {
    const obj = await env.AI_STATE.get(key);
    if (!obj) return null;
    return await obj.json();
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env, ctx) {
    return safeExec(async () => {
      const url = new URL(request.url);
      const pathname = url.pathname;

      // ------------------------------------------------------------
      // CORS
      // ------------------------------------------------------------
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers":
              "content-type,x-aiml-secret,x-internal-secret"
          }
        });
      }

      // ------------------------------------------------------------
      // HEALTH
      // ------------------------------------------------------------
      if (pathname === "/ai/health") {
        return json({
          ok: true,
          service: "aimatchlab-ai-engine",
          version: ENGINE_VERSION
        });
      }

      // ------------------------------------------------------------
      // SYSTEM HEALTH
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
      // SYSTEM METRICS
      // ------------------------------------------------------------
      if (pathname === "/system/metrics") {
        const out = {
          ok: true,
          ts: Date.now(),
          kv: {},
          r2: {}
        };

        try {
          const a = await env.AIML_INGESTION_KV.list({
            prefix: "FIXTURES:STAGING:DATE:"
          });
          const b = await env.AIML_INGESTION_KV.list({
            prefix: "FIXTURES:DATE:"
          });

          out.kv.stagingDays = a?.keys?.length ?? 0;
          out.kv.finalDays = b?.keys?.length ?? 0;
        } catch (_) {}

        try {
          const list = await env.AI_STATE.list({
            prefix: "intel/context/"
          });
          out.r2.intelObjects = list?.objects?.length ?? 0;
        } catch (_) {}

        return json(out);
      }

      // ------------------------------------------------------------
      // FROZEN LEGACY / MIGRATION ROUTES
      // ------------------------------------------------------------
      if (
        pathname === "/ai/build-season" ||
        pathname === "/ai/build-season-fast" ||
        pathname === "/ai/build-all" ||
        pathname === "/ai/build-all-auto" ||
        pathname === "/ai/league-state" ||
        pathname === "/ai/team-context" ||
        pathname === "/ai/matchup-context" ||
        pathname === "/ai/scan-integrity" ||
        pathname === "/ai/season-completion" ||
        pathname === "/__cleanup-invalid-leagues"
      ) {
        if (!requireInternal(request, env)) {
          return json({ ok: false, error: "unauthorized" }, 403);
        }

        return deprecatedRoute(pathname);
      }

      // ------------------------------------------------------------
      // INTEL TIMELINE
      // ------------------------------------------------------------
      if (pathname === "/ai/intel-timeline") {
        const id = url.searchParams.get("id");
        if (!id) {
          return json({ ok: false, error: "missing_id" }, 400);
        }

        const key = `intel/context/${id}/timeline.json`;
        const timeline = await readJsonFromR2(env, key);

        return json({
          ok: true,
          id,
          timeline: Array.isArray(timeline) ? timeline : [],
          cache: timeline ? "HIT" : "MISS"
        });
      }

      // ------------------------------------------------------------
      // INTEL SIGNALS
      // ------------------------------------------------------------
      if (pathname === "/ai/intel-signals") {
        const matchId = url.searchParams.get("id");

        if (!matchId) {
          return json({ ok: false, error: "missing_id" }, 400);
        }

        const key = `intel/context/${matchId}/signal-log.json`;
        const signals = await readJsonFromR2(env, key);

        return json({
          ok: true,
          matchId,
          signals: Array.isArray(signals) ? signals : []
        });
      }

      // ------------------------------------------------------------
      // MATCH INTEL BATCH
      // ------------------------------------------------------------
      if (pathname === "/ai/match-intel-batch") {
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

            const promise = buildMatchIntel(env, matchId).finally(() => {
              __intelInflight.delete(matchId);
            });

            __intelInflight.set(matchId, promise);

            await promise;
            results.push({ id: matchId, ok: true });
          } catch (e) {
            console.log("[INTEL BATCH FAIL]", matchId, e?.message || e);
            results.push({ id: matchId, ok: false });
          }
        }

        return json({
          ok: true,
          processed: results.length,
          results
        });
      }

      // ------------------------------------------------------------
      // MATCH INTEL
      // ------------------------------------------------------------
      if (pathname === "/ai/match-intel") {
        const id = url.searchParams.get("id");

        if (!id) {
          return json({ ok: false, error: "missing_id" }, 400);
        }

        const rawId = id.trim();
        const force = rawId.includes("|force");
        const matchId = force ? rawId.replace("|force", "") : rawId;

        const cacheKey = `intel/context/${matchId}/latest.json`;

        let pointerCache = null;
        let pointerParsed = null;

        // ------------------------------------------------------------
        // CACHE READ
        // ------------------------------------------------------------
        if (!force) {
          try {
            const liveObj = await env.AI_STATE.get(`intel/live/${matchId}.json`);

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

              if (pointer?.latest && typeof pointer.latest === "string") {
                const latestObj = await env.AI_STATE.get(pointer.latest);

                if (latestObj) {
                  const data = await latestObj.json();

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
        // FAST STATE CHECK
        // ------------------------------------------------------------
        try {
          const pointerObj =
            pointerParsed || pointerCache || (await env.AI_STATE.get(cacheKey));

          if (pointerObj) {
            const pointer =
              pointerParsed || JSON.parse(await pointerObj.text());

            if (pointer?.latest) {
              const prevObj = await env.AI_STATE.get(pointer.latest);

              if (prevObj) {
                const prevIntel = JSON.parse(await prevObj.text());
                const prevSig = prevIntel?.meta?.stateSignature;

                if (prevSig) {
                  const latestData = prevIntel;

                  const currentSig = [
                    latestData?.basic?.status,
                    latestData?.basic?.scoreHome,
                    latestData?.basic?.scoreAway,
                    latestData?.basic?.status?.displayClock
                  ].join("|");

                  if (
                    prevSig === currentSig &&
                    latestData?.meta?.phase !== "LIVE"
                  ) {
                    latestData.cache = "FAST_HIT";
                    return json(latestData);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.log("[FAST STATE CHECK FAIL]", e);
        }

        // ------------------------------------------------------------
        // COMPUTE
        // ------------------------------------------------------------
        let result;

        const inflight = __intelInflight.get(matchId);

        if (inflight) {
          result = await inflight;
        } else {
          const promise = buildMatchIntel(env, matchId).finally(() => {
            __intelInflight.delete(matchId);
          });

          __intelInflight.set(matchId, promise);
          result = await promise;
        }

        if (!result?.ok) {
          return json(result || { ok: false, error: "intel_failed" }, 404);
        }

        // ------------------------------------------------------------
        // SCORE MEMORY
        // ------------------------------------------------------------
        try {
          const scoreMemoryKey = `intel/context/${matchId}/last-score.json`;

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
            if (!signals.some(s => s.type === "GOAL_EVENT")) {
              signals.push({
                type: "GOAL_EVENT",
                ts: Date.now(),
                home: curHome,
                away: curAway
              });
            }

            const minuteRaw = result?.basic?.status?.displayClock || "";
            const minuteNum = parseInt(
              String(minuteRaw).replace(/[^0-9]/g, ""),
              10
            );

            if (!Number.isNaN(minuteNum) && minuteNum >= 75) {
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
            const signalKey = `intel/context/${matchId}/signal-log.json`;

            let existing = [];
            const existingObj = await env.AI_STATE.get(signalKey);

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

            const merged = [...existing];

            for (const s of newSignals) {
              const duplicate = existing.find(
                e =>
                  e.type === s.type &&
                  e.home === s.home &&
                  e.away === s.away &&
                  Math.abs((e.ts || 0) - (s.ts || 0)) < 15000
              );

              if (!duplicate) {
                merged.push(s);
              }
            }

            await env.AI_STATE.put(
              signalKey,
              JSON.stringify(merged.slice(-120)),
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
        // INTEL DELTA
        // ------------------------------------------------------------
        try {
          const prevPointer =
            pointerCache || (await env.AI_STATE.get(cacheKey));

          if (prevPointer) {
            const pointer = JSON.parse(await prevPointer.text());

            if (pointer?.latest) {
              const prevObj = await env.AI_STATE.get(pointer.latest);

              if (prevObj) {
                const prevIntel = JSON.parse(await prevObj.text());

                const minute =
                  parseInt(
                    String(result?.basic?.status?.displayClock || "").replace(
                      /[^0-9]/g,
                      ""
                    ),
                    10
                  ) || 0;

                const delta = computeIntelDelta(prevIntel, result, minute);

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
        // TIMELINE WRITE
        // ------------------------------------------------------------
        try {
          const timelineKey = `intel/context/${matchId}/timeline.json`;

          let timeline = [];
          const existing = await env.AI_STATE.get(timelineKey);

          if (existing) {
            try {
              timeline = JSON.parse(await existing.text());
              if (!Array.isArray(timeline)) timeline = [];
            } catch (_) {
              timeline = [];
            }
          }

          const phase = result?.meta?.phase || "UNKNOWN";
          const minuteRaw = result?.basic?.status?.displayClock || "";
          const minute =
            parseInt(String(minuteRaw).replace(/[^0-9]/g, ""), 10) || 0;

          const nowTs = Date.now();
          const last = timeline.length ? timeline[timeline.length - 1] : null;

          let shouldWrite = false;

          if (!last) {
            shouldWrite = true;
          } else if (last.phase !== phase) {
            shouldWrite = true;
          } else if (
            minute &&
            last.minute !== minute &&
            Math.abs((last.ts || 0) - nowTs) > 15000
          ) {
            shouldWrite = true;
          }

          if (shouldWrite) {
            timeline.push({
              phase,
              minute,
              ts: nowTs
            });

            await env.AI_STATE.put(
              timelineKey,
              JSON.stringify(timeline.slice(-200)),
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
        // GAME STATE ENGINE
        // ------------------------------------------------------------
        try {
          const minuteRaw = result?.basic?.status?.displayClock || "";
          const minute =
            parseInt(String(minuteRaw).replace(/[^0-9]/g, ""), 10) || 0;

          const home = Number(result?.basic?.scoreHome || 0);
          const away = Number(result?.basic?.scoreAway || 0);

          const phase = result?.meta?.phase || "UNKNOWN";
          const diff = Math.abs(home - away);

          const signals = Array.isArray(result?.signals) ? result.signals : [];

          let gameState = "UNKNOWN";

          if (phase === "PRE") {
            gameState = "PRE_MATCH";
          } else if (phase === "FINAL") {
            gameState = "MATCH_FINISHED";
          } else if (phase === "LIVE") {
            if (minute <= 20) gameState = "LIVE_EARLY";
            else if (minute <= 60) gameState = "LIVE_MID";
            else gameState = "LIVE_LATE";
          }

          const volatilitySignal = signals.find(
            s => s?.type === "VOLATILITY_SPIKE"
          );

          if (volatilitySignal && phase === "LIVE") {
            gameState = "LIVE_CHAOTIC";
          }

          let pressure = 0;

          if (phase === "LIVE") {
            const timePressure = Math.min(minute / 90, 1);

            const scorePressure =
              diff === 0 ? 0.9 : diff === 1 ? 0.7 : 0.4;

            const signalPressure = signals.length
              ? Math.min(signals.length * 0.08, 0.25)
              : 0;

            pressure = Math.min(
              timePressure * 0.5 + scorePressure * 0.35 + signalPressure,
              1
            );
          }

          if (!result.meta) result.meta = {};

          result.meta.gameState = gameState;
          result.meta.pressure = Number(pressure.toFixed(3));
        } catch (e) {
          console.log("[GAME STATE ENGINE FAIL]", e);
        }

        // ------------------------------------------------------------
        // INTEL EVOLUTION ENGINE
        // ------------------------------------------------------------
        try {
          const minuteRaw = result?.basic?.status?.displayClock || "";
          const minute =
            parseInt(String(minuteRaw).replace(/[^0-9]/g, ""), 10) || 0;

          const home = Number(result?.basic?.scoreHome || 0);
          const away = Number(result?.basic?.scoreAway || 0);

          const phase = result?.meta?.phase || "UNKNOWN";
          const pressure = Number(result?.meta?.pressure || 0);
          const gameState = result?.meta?.gameState || "UNKNOWN";
          const signals = Array.isArray(result?.signals) ? result.signals : [];
          const delta = result?.delta || {};
          const diff = home - away;

          let profile = "UNKNOWN";
          let confidence = 0.5;

          if (phase === "PRE") {
            profile = "PRE_MATCH";
            confidence = 0.5;
          } else if (phase === "FINAL") {
            profile = "MATCH_FINISHED";
            confidence = 1;
          } else if (phase === "LIVE") {
            const volatilitySignal = signals.find(
              s => s?.type === "VOLATILITY_SPIKE"
            );

            const deltaStrength = Number(delta?.strength || 0);

            if (volatilitySignal || deltaStrength > 0.35) {
              profile = "CHAOTIC";
              confidence = 0.75;
            } else if (minute >= 75 && pressure > 0.75 && Math.abs(diff) <= 1) {
              profile = "LATE_DRAMA";
              confidence = 0.82;
            } else if (diff >= 1 && pressure < 0.7) {
              profile = "CONTROL_HOME";
              confidence = 0.68;
            } else if (diff <= -1 && pressure < 0.7) {
              profile = "CONTROL_AWAY";
              confidence = 0.68;
            } else {
              profile = "BALANCED";
              confidence = 0.6;
            }

            if (gameState === "LIVE_EARLY") {
              confidence = Math.min(confidence, 0.6);
            }
          }

          if (!result.meta) result.meta = {};

          result.meta.profile = profile;
          result.meta.profileConfidence = Number(confidence.toFixed(3));
        } catch (e) {
          console.log("[INTEL EVOLUTION FAIL]", e);
        }

        // ------------------------------------------------------------
        // LIVE EVOLUTION LAYER
        // ------------------------------------------------------------
        try {
          const phase = result?.meta?.phase || "UNKNOWN";

          const minuteRaw = result?.basic?.status?.displayClock || "";
          const minute =
            parseInt(String(minuteRaw).replace(/[^0-9]/g, ""), 10) || 0;

          const home = Number(result?.basic?.scoreHome || 0);
          const away = Number(result?.basic?.scoreAway || 0);

          const signals = Array.isArray(result?.signals) ? result.signals : [];

          let momentum = 0.5;
          let volatility = 0.2;
          let control = "BALANCED";

          if (phase === "LIVE") {
            const diff = home - away;

            if (diff > 0) momentum += 0.15;
            if (diff < 0) momentum -= 0.15;

            const volatilitySignal = signals.find(
              s => s?.type === "VOLATILITY_SPIKE"
            );
            const goalSignal = signals.find(s => s?.type === "GOAL_EVENT");

            if (goalSignal) volatility += 0.2;
            if (volatilitySignal) volatility += 0.25;

            const timeFactor = Math.min(minute / 90, 1);

            momentum += timeFactor * 0.1;

            momentum = Math.max(0, Math.min(momentum, 1));
            volatility = Math.max(0, Math.min(volatility, 1));

            if (diff > 0) control = "HOME";
            else if (diff < 0) control = "AWAY";
          }

          if (!result.meta) result.meta = {};

          result.meta.momentum = Number(momentum.toFixed(3));
          result.meta.volatility = Number(volatility.toFixed(3));
          result.meta.control = control;
        } catch (e) {
          console.log("[LIVE EVOLUTION FAIL]", e);
        }

        // ------------------------------------------------------------
        // NARRATIVE ENGINE
        // ------------------------------------------------------------
        try {
          const phase = result?.meta?.phase || "UNKNOWN";
          const profile = result?.meta?.profile || "UNKNOWN";
          const pressure = Number(result?.meta?.pressure || 0);

          const home = Number(result?.basic?.scoreHome || 0);
          const away = Number(result?.basic?.scoreAway || 0);

          const minuteRaw = result?.basic?.status?.displayClock || "";
          const minute =
            parseInt(String(minuteRaw).replace(/[^0-9]/g, ""), 10) || 0;

          const signals = Array.isArray(result?.signals) ? result.signals : [];

          let narrative = "";
          let confidence = 0.55;

          if (phase === "PRE") {
            narrative =
              "Match has not started yet. Teams are entering the pre-match phase.";
            confidence = 0.5;
          } else if (phase === "FINAL") {
            narrative = `Match finished ${home}-${away}. Final match state recorded.`;
            confidence = 1;
          } else if (phase === "LIVE") {
            const goal = signals.find(s => s.type === "GOAL_EVENT");

            if (profile === "CHAOTIC") {
              narrative =
                "Match has entered a chaotic phase with rising volatility and unstable momentum.";
              confidence = 0.75;
            } else if (profile === "LATE_DRAMA") {
              narrative =
                "Late match drama building with high pressure and narrow score margin.";
              confidence = 0.82;
            } else if (profile === "CONTROL_HOME") {
              narrative =
                "Home side appears to control the match rhythm with a stable advantage.";
              confidence = 0.68;
            } else if (profile === "CONTROL_AWAY") {
              narrative =
                "Away side currently controls the match dynamics and scoreboard pressure.";
              confidence = 0.68;
            } else {
              narrative =
                "Match remains balanced with neither side establishing clear control.";
              confidence = 0.6;
            }

            if (goal) {
              narrative = `Recent goal event detected. Current score ${home}-${away}. ${narrative}`;
            }

            if (pressure > 0.8 && minute >= 75) {
              narrative +=
                " Match pressure is extremely high entering the final stages.";
              confidence = Math.max(confidence, 0.85);
            }
          }

          result.narrative = narrative;
          result.confidence = Number(confidence.toFixed(3));
        } catch (e) {
          console.log("[NARRATIVE ENGINE FAIL]", e);
        }

        // ------------------------------------------------------------
        // STATE SIGNATURE
        // ------------------------------------------------------------
        try {
          const status = result?.basic?.status || "";
          const home = Number(result?.basic?.scoreHome || 0);
          const away = Number(result?.basic?.scoreAway || 0);

          const minuteRaw = result?.basic?.status?.displayClock || "";
          const minute =
            parseInt(String(minuteRaw).replace(/[^0-9]/g, ""), 10) || 0;

          if (!result.meta) result.meta = {};

          result.meta.stateSignature = [status, home, away, minute].join("|");
        } catch (e) {
          console.log("[STATE SIGNATURE BUILD FAIL]", e);
        }

        // ------------------------------------------------------------
        // STATE CHANGE CHECK
        // ------------------------------------------------------------
        let skipVersionWrite = false;

        try {
          const prevPointer =
            pointerCache || (await env.AI_STATE.get(cacheKey));

          if (prevPointer) {
            const pointer = JSON.parse(await prevPointer.text());

            if (pointer?.latest) {
              const prevObj = await env.AI_STATE.get(pointer.latest);

              if (prevObj) {
                const prevIntel = JSON.parse(await prevObj.text());

                const prevSig = prevIntel?.meta?.stateSignature;
                const newSig = result?.meta?.stateSignature;

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

        // ------------------------------------------------------------
        // VERSION WRITE
        // ------------------------------------------------------------
        if (!skipVersionWrite) {
          try {
            const versionTs = Date.now();
            const versionKey = `intel/context/${matchId}/versions/${versionTs}.json`;

            await env.AI_STATE.put(
              versionKey,
              JSON.stringify(result),
              { httpMetadata: { contentType: "application/json" } }
            );

            await env.AI_STATE.put(
              cacheKey,
              JSON.stringify({
                latest: versionKey,
                ts: versionTs,
                phase: result?.meta?.phase || "UNKNOWN"
              }),
              { httpMetadata: { contentType: "application/json" } }
            );

            if (result?.meta?.phase === "LIVE") {
              const liveKey = `intel/live/${matchId}.json`;

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

            if (result?.meta?.phase === "FINAL") {
              try {
                await env.AI_STATE.delete(`intel/live/${matchId}.json`);
              } catch (e) {
                console.log("[LIVE SNAPSHOT DELETE FAIL]", e);
              }
            }

            result.cache = "MISS";
          } catch (e) {
            console.log("[INTEL VERSION WRITE FAIL]", e);
          }
        }

        return json(result);
      }

      // ------------------------------------------------------------
      // INTEL HEALTH
      // ------------------------------------------------------------
      if (pathname === "/ai/intel-health") {
        const matchId = url.searchParams.get("id");

        if (!matchId) {
          return json({ ok: false, error: "missing_id" }, 400);
        }

        try {
          const key = `intel/context/${matchId}/latest.json`;
          const obj = await env.AI_STATE.get(key);

          if (!obj) {
            return json({
              ok: false,
              error: "no_intel_snapshot"
            }, 404);
          }

          const pointer = JSON.parse(await obj.text());

          let intel = pointer;

          if (pointer?.latest) {
            const latestObj = await env.AI_STATE.get(pointer.latest);
            if (latestObj) {
              intel = JSON.parse(await latestObj.text());
            }
          }

          let timeline = [];

          try {
            const timelineObj = await env.AI_STATE.get(
              `intel/context/${matchId}/timeline.json`
            );

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
            signals:
              Array.isArray(intel.signals) && intel.signals.length > 0,
            timeline:
              Array.isArray(timeline) && timeline.length > 0,
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
      }

      // ------------------------------------------------------------
      // VALUE ENGINE RUN
      // ------------------------------------------------------------
      if (pathname === "/value-run") {
        const date =
          url.searchParams.get("date") ||
          new Date().toISOString().slice(0, 10);

        const { runValueEngineCore } = await import(
          "../_shared/value-engine-core.js"
        );

        const result = await runValueEngineCore(env, date);
        return json(result);
      }

      // ------------------------------------------------------------
      // DEFAULT
      // ------------------------------------------------------------
      return json({ ok: false, error: "invalid_route" }, 404);
    });
  },

  async scheduled(event, env, ctx) {
    console.log("[AI ENGINE SCHEDULED] frozen during migration");
  }
};