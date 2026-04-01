// ============================================================
// SIGNAL STORE + COOLDOWN (KV) + PERSISTENCE (R2)
// v2.1 – dedupe + stable signal identity
// ============================================================

function parseMinute(m) {
  if (m == null) return 0;
  if (typeof m === "number") return m;

  const s = String(m);
  const n = parseInt(s.replace("'", ""), 10);

  return Number.isFinite(n) ? n : 0;
}

function cooldownSecondsFor(signalType) {
  if (signalType === "GOAL_EVENT") return 120;
  if (signalType === "VOLATILITY_SPIKE") return 600;
  if (signalType === "MOMENTUM_SHIFT") return 600;
  if (signalType === "CONTROL_CHANGE") return 600;
  return 600;
}

// ------------------------------------------------------------
// SIGNAL IDENTITY
// ------------------------------------------------------------
function buildSignalKey(matchId, type, minute, phase) {
  return `${matchId}:${type}:${minute}:${phase}`;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
export async function filterAndPersistSignals(env, matchId, intel, signals) {
  if (!signals?.length) return [];

  const now = Date.now();
  const minute = parseMinute(intel?.basic?.minute);
  const phase = intel?.meta?.phase || "UNKNOWN";

  const emitted = [];
  const seen = new Set(); // dedupe μέσα στο ίδιο run

  for (const s of signals) {
    const type = s?.type || "UNKNOWN";
    const severity = s?.severity || "MEDIUM";

    const sigKey = buildSignalKey(matchId, type, minute, phase);

    // ------------------------------------------------------------
    // IN-RUN DEDUPE
    // ------------------------------------------------------------
    if (seen.has(sigKey)) continue;
    seen.add(sigKey);

    const cooldown = cooldownSecondsFor(type);

    // KV cooldown key (ephemeral)
    const cdKey = `INTEL:SIGNAL:${sigKey}`;

    let already = null;

    try {
      already = await env.AIML_INGESTION_KV.get(cdKey);
    } catch (_) {}

    if (already) continue;

    // acquire cooldown lock
    try {
      await env.AIML_INGESTION_KV.put(
        cdKey,
        String(now),
        { expirationTtl: cooldown }
      );
    } catch (_) {
      // fail-open (important)
    }

    emitted.push({
      type,
      severity,
      minute,
      phase,
      ts: now
    });
  }

  // ------------------------------------------------------------
  // R2 PERSISTENCE (bounded log)
  // ------------------------------------------------------------
  if (emitted.length) {
    const logKey = `intel/context/${matchId}/signal-log.json`;

    try {
      const existingObj = await env.AI_STATE.get(logKey);

      let log = [];

      if (existingObj) {
        try {
          const txt = await existingObj.text();
          log = JSON.parse(txt);
          if (!Array.isArray(log)) log = [];
        } catch {
          log = [];
        }
      }

      // append
      log.push(...emitted);

      // cap
      if (log.length > 200) {
        log = log.slice(log.length - 200);
      }

      await env.AI_STATE.put(
        logKey,
        JSON.stringify(log),
        {
          httpMetadata: {
            contentType: "application/json"
          }
        }
      );
    } catch (e) {
      console.log("[SIGNAL STORE WRITE FAIL]", e);
    }
  }

  return emitted;
}