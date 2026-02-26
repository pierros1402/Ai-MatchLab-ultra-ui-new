// ============================================================
// LIVE EVOLUTION LAYER v1.0
// Mutates PRE intel using LIVE match state
// ============================================================

function isLive(status) {
  const s = String(status || "").toUpperCase();
  return (
    s.includes("IN_PROGRESS") ||
    s.includes("LIVE") ||
    s.includes("HALF")
  );
}

function goalDiff(meta) {
  if (
    meta?.basic?.scoreHome == null ||
    meta?.basic?.scoreAway == null
  ) return 0;

  return meta.basic.scoreHome - meta.basic.scoreAway;
}

export function applyLiveEvolution(intel) {

  if (!intel?.basic) return intel;

  const status = intel.basic?.status;

  if (!isLive(status)) return intel;

const evolved = structuredClone(intel);

const minute = Number(intel.basic?.minute ?? 0);

// =====================================
// LIVE BOOTSTRAP SAFEGUARD
// =====================================
if (minute <= 5) {
  evolved.signals = evolved.signals || [];
  evolved.signals.push("LIVE_BOOTSTRAP");

  evolved.meta.phase = "LIVE";

  return evolved;
}

const diff = goalDiff(intel);

  // --------------------------------------------------
  // TEMPO SHIFT
  // --------------------------------------------------
  if (minute > 70) {
    evolved.context.momentum = "HIGH";
  }

  // --------------------------------------------------
  // CONTROL MODEL
  // --------------------------------------------------
  if (diff > 0) {
    evolved.context.control = "HOME_MANAGING";
  } else if (diff < 0) {
    evolved.context.control = "AWAY_MANAGING";
  } else {
    evolved.context.control = "OPEN_GAME";
  }

  // --------------------------------------------------
  // VOLATILITY SPIKE
  // --------------------------------------------------
  if (minute > 80 && Math.abs(diff) <= 1) {
    evolved.context.volatility = "HIGH";
  }

  // --------------------------------------------------
  // SIGNALS
  // --------------------------------------------------
  evolved.signals = evolved.signals || [];

  evolved.signals.push("LIVE_EVOLUTION_APPLIED");

  evolved.meta.phase = "LIVE";

  return evolved;
}