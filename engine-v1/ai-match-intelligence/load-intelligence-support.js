import fs from "fs";
import path from "path";
import { resolveDataPath } from "../storage/data-root.js";

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

export function loadIntelligenceSupport(dayKey, matchId) {
  const priors = readJsonSafe(
    resolveDataPath("model-priors", "2025-2026.json"),
    {}
  );

  const value = readJsonSafe(
    resolveDataPath("value", `${dayKey}.json`),
    { picks: [] }
  );

  const matchValue = (value.picks || []).filter(
    p => String(p.matchId) === String(matchId)
  );

  return {
    priors,
    value: matchValue,
    hasValue: matchValue.length > 0,
    hasPriors: Object.keys(priors || {}).length > 0
  };
}