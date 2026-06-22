/**
 * referee-memory-db.js
 *
 * Per-referee discipline tendencies (cards / penalties per game) by league, from
 * Transfermarkt (see transfermarkt-referee-source). Stored per league with the
 * season it reflects; refreshed slowly (referee stats change over a season).
 *
 * One file per league: data/league-memory/referees/{slug}.json
 *   { slug, season, referees: { "<id>": {name,appearances,yellow,secondYellow,red,
 *       penalties,yellowPerGame,redPerGame,penPerGame} }, updatedAt }
 */

import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";

const DIR = resolveDataPath("league-memory", "referees");

function fileFor(slug) {
  return resolveDataPath("league-memory", "referees", `${slug}.json`);
}

export function readReferees(slug) {
  try { return JSON.parse(fs.readFileSync(fileFor(slug), "utf8")); }
  catch { return { slug, referees: {} }; }
}

/** Replace a league's referee table for a season. Returns count stored. */
export function recordRefereeStats(slug, season, referees, competition) {
  if (!Array.isArray(referees) || !referees.length) return 0;
  ensureDir(DIR);
  const map = {};
  for (const r of referees) {
    map[r.id] = {
      name: r.name,
      appearances: r.appearances,
      yellow: r.yellow, secondYellow: r.secondYellow, red: r.red, penalties: r.penalties,
      yellowPerGame: round3(r.yellowPerGame),
      redPerGame: round3(r.redPerGame),
      penPerGame: round3(r.penPerGame)
    };
  }
  fs.writeFileSync(fileFor(slug), JSON.stringify({
    slug, season, competition: competition || null, referees: map, updatedAt: new Date().toISOString()
  }, null, 2), "utf8");
  return referees.length;
}

/** Look up one referee's tendencies in a league by (fuzzy) name. */
export function findRefereeByName(slug, name) {
  const data = readReferees(slug);
  if (!name) return null;
  const norm = normalize(name);
  let best = null, bestScore = 0;
  for (const r of Object.values(data.referees || {})) {
    const s = scoreNames(norm, normalize(r.name));
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return bestScore >= 0.6 ? { ...best, match: bestScore } : null;
}

export function getRefereeSummary() {
  let leagues = 0, referees = 0;
  try {
    for (const fn of fs.readdirSync(DIR)) {
      if (!fn.endsWith(".json")) continue;
      leagues++;
      referees += Object.keys(readReferees(fn.replace(/\.json$/, "")).referees || {}).length;
    }
  } catch { /* none yet */ }
  return { leagues, referees };
}

function normalize(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
}
function scoreNames(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = new Set(a.split(" ")), B = new Set(b.split(" "));
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / new Set([...A, ...B]).size;
}
function round3(v) { return v == null ? null : Math.round(v * 1000) / 1000; }
