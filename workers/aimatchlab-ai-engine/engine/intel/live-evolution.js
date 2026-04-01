// ============================================================
// LIVE EVOLUTION LAYER v2.0
// - Non-destructive overlay
// - Structured signals
// - Stable phase handling
// ============================================================

function isLive(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("IN_PROGRESS") ||
    s.includes("LIVE") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF")
  );
}

function goalDiff(intel) {
  const h = Number(intel?.basic?.scoreHome);
  const a = Number(intel?.basic?.scoreAway);

  if (!Number.isFinite(h) || !Number.isFinite(a)) return 0;

  return h - a;
}

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function pushSignal(list, signal) {
  const exists = list.find(
    s =>
      s.type === signal.type &&
      s.minute === signal.minute &&
      s.phase === signal.phase
  );

  if (!exists) {
    list.push(signal);
  }
}

export function applyLiveEvolution(intel) {
  if (!intel?.basic) return intel;

  const status = intel.basic?.status;

  if (!isLive(status)) return intel;

  const evolved = structuredClone(intel);

  const minute = Number(intel.basic?.minute ?? 0);
  const phase = "LIVE";

  evolved.meta = evolved.meta || {};
  evolved.context = evolved.context || {};
  evolved.signals = ensureArray(evolved.signals);

  const diff = goalDiff(intel);

  // ------------------------------------------------------------
  // LIVE BOOTSTRAP
  // ------------------------------------------------------------
  if (minute <= 5) {
    pushSignal(evolved.signals, {
      type: "LIVE_BOOTSTRAP",
      severity: "LOW",
      minute,
      phase,
      ts: Date.now()
    });

    evolved.meta.phase = phase;
    return evolved;
  }

  // ------------------------------------------------------------
  // MOMENTUM OVERLAY (NOT REPLACE)
  // ------------------------------------------------------------
  if (minute > 70) {
    evolved.context.liveMomentum = "HIGH";
  }

  // ------------------------------------------------------------
  // CONTROL OVERLAY
  // ------------------------------------------------------------
  if (diff > 0) {
    evolved.context.liveControl = "HOME_MANAGING";
  } else if (diff < 0) {
    evolved.context.liveControl = "AWAY_MANAGING";
  } else {
    evolved.context.liveControl = "OPEN_GAME";
  }

  // ------------------------------------------------------------
  // VOLATILITY OVERLAY
  // ------------------------------------------------------------
  if (minute > 80 && Math.abs(diff) <= 1) {
    evolved.context.liveVolatility = "HIGH";
  }

  // ------------------------------------------------------------
  // SIGNAL
  // ------------------------------------------------------------
  pushSignal(evolved.signals, {
    type: "LIVE_EVOLUTION_APPLIED",
    severity: "LOW",
    minute,
    phase,
    ts: Date.now()
  });

  evolved.meta.phase = phase;

  return evolved;
}