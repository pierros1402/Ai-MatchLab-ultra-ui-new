import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";

// ─── Paths ────────────────────────────────────────────────────────────────────

const MEMORY_DIR  = resolveDataPath("league-memory");
const STATE_FILE  = resolveDataPath("league-memory", "state.json");
const HISTORY_DIR = resolveDataPath("league-memory", "history");

function ensureDirs() {
  ensureDir(MEMORY_DIR);
  ensureDir(HISTORY_DIR);
}

// ─── State read / write ───────────────────────────────────────────────────────

export function readAllStates() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function readLeagueState(slug) {
  return readAllStates()[slug] || null;
}

export function writeLeagueState(slug, patch) {
  ensureDirs();
  const all = readAllStates();
  all[slug] = {
    ...(all[slug] || {}),
    ...patch,
    slug,
    updatedAt: new Date().toISOString()
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(all, null, 2), "utf8");
  return all[slug];
}

export function writeAllStates(data) {
  ensureDirs();
  fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), "utf8");
}

// ─── Recheck schedule ─────────────────────────────────────────────────────────
//
// active   → recheck in 3 days (may change after matchday)
// pause    → recheck 3 days before resumeDate (or in 7 days if unknown)
// finished → recheck in 14 days (looking for new season announcement)
// unknown  → recheck tomorrow

export function computeRecheckAfter(state, resumeDate) {
  const now = new Date();

  if (state === "active") {
    const d = new Date(now);
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  }

  if (state === "pause" && resumeDate) {
    const r = new Date(resumeDate);
    r.setDate(r.getDate() - 3);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const target = r > tomorrow ? r : tomorrow;
    return target.toISOString().slice(0, 10);
  }

  if (state === "pause") {
    const d = new Date(now);
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  if (state === "finished") {
    const d = new Date(now);
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  }

  // unknown → tomorrow
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function needsRecheck(leagueState) {
  if (!leagueState) return true;
  if (!leagueState.updatedAt) return true;

  const { recheckAfter } = leagueState;
  if (recheckAfter) {
    return new Date() >= new Date(recheckAfter);
  }

  // Fallback: recheck if not updated in 3 days
  const updated = new Date(leagueState.updatedAt);
  const diffDays = (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 3;
}

// ─── Historical data ──────────────────────────────────────────────────────────

export function readLeagueHistory(slug) {
  const file = resolveDataPath("league-memory", "history", `${slug}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export function writeLeagueHistory(slug, data) {
  ensureDirs();
  const file = resolveDataPath("league-memory", "history", `${slug}.json`);
  const existing = readLeagueHistory(slug) || {};
  fs.writeFileSync(file, JSON.stringify({
    ...existing,
    ...data,
    slug,
    bootstrappedAt: existing.bootstrappedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }, null, 2), "utf8");
}

export function hasLeagueHistory(slug) {
  const file = resolveDataPath("league-memory", "history", `${slug}.json`);
  return fs.existsSync(file);
}

// ─── Query helpers ────────────────────────────────────────────────────────────

export function getActiveLeagueSlugs() {
  const all = readAllStates();
  return Object.values(all)
    .filter(l => l.state === "active")
    .map(l => l.slug);
}

export function getLeaguesByState(state) {
  const all = readAllStates();
  return Object.values(all).filter(l => l.state === state);
}

export function getLeaguesNeedingRecheck() {
  const all = readAllStates();
  return Object.values(all).filter(needsRecheck);
}

export function getSummary() {
  const all = readAllStates();
  const rows = Object.values(all);
  const byState = {};
  for (const r of rows) {
    byState[r.state] = (byState[r.state] || 0) + 1;
  }
  return {
    total: rows.length,
    byState,
    activeCount: byState.active || 0,
    pauseCount: byState.pause || 0,
    finishedCount: byState.finished || 0,
    unknownCount: byState.unknown || 0,
    activeSlugs: rows.filter(r => r.state === "active").map(r => r.slug)
  };
}
