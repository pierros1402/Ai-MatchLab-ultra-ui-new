// ============================================================
// SIGNAL STORE + COOLDOWN (KV) + PERSISTENCE (R2)
// ============================================================

function parseMinute(m) {
  if (m == null) return 0;
  if (typeof m === "number") return m;
  const s = String(m);
  const n = parseInt(s.replace("'", ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function cooldownSecondsFor(signalType) {
  // Goal events: allow frequent but still prevent spam bursts
  if (signalType === "GOAL_EVENT") return 120; // 2 min
  if (signalType === "VOLATILITY_SPIKE") return 600; // 10 min
  if (signalType === "MOMENTUM_SHIFT") return 600; // 10 min
  if (signalType === "CONTROL_CHANGE") return 600; // 10 min
  return 600;
}

export async function filterAndPersistSignals(env, matchId, intel, signals) {
  if (!signals?.length) return [];

  const now = Date.now();
  const minute = parseMinute(intel?.basic?.minute);
  const phase = intel?.meta?.phase || "UNKNOWN";

  const emitted = [];

  for (const s of signals) {
    const type = s?.type || "UNKNOWN";
    const cooldown = cooldownSecondsFor(type);

    // KV cooldown key (ephemeral)
    const cdKey = `INTEL:SIGNAL:${matchId}:${type}`;

    let already = null;
    try {
      already = await env.AIML_INGESTION_KV.get(cdKey);
    } catch (_) {}

    if (already) continue;

    // acquire cooldown "lock"
    try {
      await env.AIML_INGESTION_KV.put(
        cdKey,
        String(now),
        { expirationTtl: cooldown }
      );
    } catch (_) {
      // If KV fails, still allow emitting (better to show signals than go silent)
    }

    emitted.push({
      type,
      severity: s?.severity || "MEDIUM",
      minute,
      phase,
      ts: now
    });
  }

  // Persist emitted signals to R2 as bounded log
  if (emitted.length) {
    const logKey = `intel/context/${matchId}/signal-log.json`;

    try {
      const existingObj = await env.AI_STATE.get(logKey);
      let log = [];

      if (existingObj) {
        const txt = await existingObj.text();
        log = JSON.parse(txt);
        if (!Array.isArray(log)) log = [];
      }

      // append + cap
      log.push(...emitted);
      if (log.length > 200) log = log.slice(log.length - 200);

      await env.AI_STATE.put(
        logKey,
        JSON.stringify(log),
        { httpMetadata: { contentType: "application/json" } }
      );
    } catch (_) {}
  }

  return emitted;
}