import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRefereeKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function classifyStyle({ avgCards, avgPenalties, avgFouls }) {
  const cards = safeNum(avgCards, null);
  const pens = safeNum(avgPenalties, null);
  const fouls = safeNum(avgFouls, null);

  if (cards == null && pens == null && fouls == null) return "unknown";

  if ((cards != null && cards >= 5.5) || (pens != null && pens >= 0.35)) {
    return "strict";
  }

  if ((cards != null && cards <= 3.2) && (fouls == null || fouls <= 22)) {
    return "lenient";
  }

  return "balanced";
}

function buildSignals(style, stats) {
  const signals = [];
  const cards = safeNum(stats?.avgCards, null);
  const pens = safeNum(stats?.avgPenalties, null);

  if (style === "strict") signals.push("high_cards_ref");
  if (style === "lenient") signals.push("low_cards_ref");

  if (pens != null && pens >= 0.35) signals.push("penalty_active_ref");
  if (cards != null && cards >= 6) signals.push("very_high_cards_ref");

  return signals;
}

export function buildRefereeContext(match) {
  const refereeName =
    match?.referee ||
    match?.sources?.espn?.referee ||
    null;

  if (!refereeName) {
    return {
      key: "referee_profile",
      status: "empty",
      data: null,
      confidence: 0
    };
  }

  const refKey = normalizeRefereeKey(refereeName);
  if (!refKey) {
    return {
      key: "referee_profile",
      status: "empty",
      data: null,
      confidence: 0
    };
  }

  const refFile = resolveDataPath("referees", `${refKey}.json`);
  const cached = readJsonSafe(refFile, null);

  if (!cached) {
    return {
      key: "referee_profile",
      status: "partial",
      data: {
        name: refereeName,
        stats: null,
        style: "unknown",
        signals: []
      },
      confidence: 0.25
    };
  }

  const stats = {
    avgCards: safeNum(cached?.avgCards, null),
    avgPenalties: safeNum(cached?.avgPenalties, null),
    avgFouls: safeNum(cached?.avgFouls, null),
    sampleSize: safeNum(cached?.sampleSize, null)
  };

  const style = cached?.style || classifyStyle(stats);
  const signals = buildSignals(style, stats);

  return {
    key: "referee_profile",
    status: "ready",
    data: {
      name: cached?.name || refereeName,
      stats,
      style,
      signals
    },
    confidence: stats.sampleSize >= 20 ? 0.82 : stats.sampleSize >= 8 ? 0.65 : 0.45
  };
}