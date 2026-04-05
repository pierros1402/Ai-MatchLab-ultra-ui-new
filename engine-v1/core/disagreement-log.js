import fs from "fs";
import { getDataRoot, resolveDataPath } from "../storage/data-root.js";

const localDataDir = getDataRoot();
const localDisagreementsPath = resolveDataPath("disagreements.json");
const localSignalsPath = resolveDataPath("signals.json");

// ============================================================
// DB HELPERS
// ============================================================

function ensureFile(filePath, rootKey) {
  if (!fs.existsSync(localDataDir)) {
    fs.mkdirSync(localDataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ [rootKey]: [] }, null, 2),
      "utf8"
    );
  }
}

function readFile(filePath, rootKey) {
  ensureFile(filePath, rootKey);

  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (!parsed[rootKey] || !Array.isArray(parsed[rootKey])) {
    return { [rootKey]: [] };
  }

  return parsed;
}

function writeFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

// ============================================================
// UTILS
// ============================================================

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanStr(v) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeStatus(v) {
  return cleanStr(v).toUpperCase();
}

function normalizeMinute(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function buildScorePair(obs = {}) {
  return {
    home: safeNum(obs.scoreHome),
    away: safeNum(obs.scoreAway)
  };
}

function scorePairsEqual(a, b) {
  return a.home === b.home && a.away === b.away;
}

// ============================================================
// SIGNALS ENGINE
// ============================================================

function generateSignals(matchId, observations, resolved) {
  const signals = [];
  const ts = Date.now();

  if (!Array.isArray(observations) || observations.length < 2) {
    return signals;
  }

  const latest = observations[observations.length - 1];
  const prev = observations[observations.length - 2];

  // ------------------------------------------------------------
  // STATUS CHANGE
  // ------------------------------------------------------------
  if (prev?.status !== latest?.status) {
    signals.push({
      id: `${matchId}:status_change:${ts}`,
      ts,
      type: "status_change",
      from: prev?.status || null,
      to: latest?.status || null
    });
  }

  // ------------------------------------------------------------
  // GOAL DETECTED
  // ------------------------------------------------------------
  if (
    safeNum(prev?.scoreHome) !== safeNum(latest?.scoreHome) ||
    safeNum(prev?.scoreAway) !== safeNum(latest?.scoreAway)
  ) {
    signals.push({
      id: `${matchId}:goal:${ts}`,
      ts,
      type: "goal_detected",
      score: {
        home: safeNum(latest?.scoreHome),
        away: safeNum(latest?.scoreAway)
      }
    });
  }

  // ------------------------------------------------------------
  // CONFLICT DETECTED
  // ------------------------------------------------------------
  if (resolved?.reconcileMeta?.disagreement) {
    signals.push({
      id: `${matchId}:conflict:${ts}`,
      ts,
      type: "conflict_detected",
      confidence: resolved?.reconcileMeta?.confidence ?? null
    });
  }

  // ------------------------------------------------------------
  // LOW CONFIDENCE
  // ------------------------------------------------------------
  if ((resolved?.reconcileMeta?.confidence ?? 1) < 0.6) {
    signals.push({
      id: `${matchId}:low_confidence:${ts}`,
      ts,
      type: "confidence_low",
      value: resolved?.reconcileMeta?.confidence ?? null
    });
  }

  return signals;
}

// ============================================================
// DISAGREEMENTS (UNCHANGED CORE)
// ============================================================

function buildEntryKey(entry) {
  return JSON.stringify({
    matchId: entry.matchId,
    field: entry.field,
    chosenSource: entry.chosenSource,
    chosenValue: entry.chosenValue
  });
}

function keepLatestPerSource(rows = []) {
  const map = new Map();

  for (const row of rows) {
    const source = row?.source;
    if (!source) continue;

    const prev = map.get(source);

    if (!prev || row.ts > prev.ts) {
      map.set(source, row);
    }
  }

  return [...map.values()];
}

export function collectDisagreements(matchId, observations = [], resolved = {}) {
  const out = [];

  if (!matchId || observations.length < 2) return out;

  const statusSet = new Set(observations.map(o => o.status));
  if (statusSet.size > 1) {
    out.push({
      matchId,
      field: "status",
      reason: "status_conflict"
    });
  }

  return out;
}

// ============================================================
// PERSIST (NOW ALSO SIGNALS)
// ============================================================

export async function persistDisagreements(_env, entries = [], observations = [], resolved = {}) {
  const db = readFile(localDisagreementsPath, "disagreements");
  const signalsDb = readFile(localSignalsPath, "signals");

  const existingKeys = new Set(db.disagreements.map(buildEntryKey));

  let written = 0;

  for (const entry of entries) {
    const key = buildEntryKey(entry);

    if (existingKeys.has(key)) continue;

    db.disagreements.push(entry);
    existingKeys.add(key);
    written++;
  }

  // ------------------------------------------------------------
  // SIGNALS WRITE
  // ------------------------------------------------------------
  const signals = generateSignals(
    resolved?.matchId,
    observations,
    resolved
  );

  if (signals.length) {
    signalsDb.signals.push(...signals);
  }

  writeFile(localDisagreementsPath, db);
  writeFile(localSignalsPath, signalsDb);

  return {
    ok: true,
    written,
    signalsWritten: signals.length
  };
}