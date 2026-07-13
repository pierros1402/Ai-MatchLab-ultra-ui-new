/**
 * migrate-h2h-canonical-keys.js  (one-off, re-runnable, idempotent)
 *
 * Re-keys data/h2h/{a}~{b}.json onto the GLOBAL canonical team identity so a
 * club's meetings never split across two spellings (e.g. an ESPN-bootstrapped
 * "dinamominsk~neman" and a Flashscore "dinminsk~neman" are the SAME pair). For
 * every group of files that collapse to one canonical key it:
 *   1. canonicalizes each stored match's homeTeam/awayTeam,
 *   2. merges all matches, deduped by matchId, most-recent-first, capped at
 *      MAX_MATCHES (the store's existing bound),
 *   3. writes the single canonical-key file and removes the now-merged sources.
 *
 * Safety: DRY-RUN BY DEFAULT — pass --apply to write. Lossless up to the store's
 * MAX_MATCHES cap (no match with a unique matchId is dropped before the cap).
 * Idempotent: a run over already-canonical files reports zero changes.
 *
 * Usage:
 *   node engine-v1/jobs/migrate-h2h-canonical-keys.js            # dry-run report
 *   node engine-v1/jobs/migrate-h2h-canonical-keys.js --apply    # execute
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { normalizeTeamKey } from "../core/normalize.js";
import { globalCanonicalTeamName } from "../storage/team-aliases-db.js";

const DIR = resolveDataPath("h2h");
const MAX_MATCHES = 20; // keep in sync with h2h-memory-db.js

const canon = (name) => globalCanonicalTeamName(name) || name;

/** Canonical, orientation-fixed pair identity: teamA maps to the smaller key half. */
function orientedPair(a, b) {
  const ca = canon(a), cb = canon(b);
  const ka = normalizeTeamKey(ca), kb = normalizeTeamKey(cb);
  return ka <= kb
    ? { key: `${ka}~${kb}`, teamA: ca, teamB: cb }
    : { key: `${kb}~${ka}`, teamA: cb, teamB: ca };
}

function readJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

/** Names for a file: prefer stored teamA/teamB, fall back to first match. */
function namesOf(data) {
  const a = data?.teamA || data?.matches?.[0]?.homeTeam || null;
  const b = data?.teamB || data?.matches?.[0]?.awayTeam || null;
  return [a, b];
}

export function migrateH2HCanonicalKeys({ apply = false } = {}) {
  let files = [];
  try { files = fs.readdirSync(DIR).filter(f => f.endsWith(".json")); }
  catch { return { ok: false, error: "no_h2h_dir" }; }

  // Group every source file by its canonical pair key.
  const groups = new Map(); // key -> { sources:Set, matches:Map<matchId,match>, teamA, teamB }
  const stats = { filesScanned: 0, skippedNoNames: 0 };

  for (const f of files) {
    stats.filesScanned++;
    const data = readJsonSafe(path.join(DIR, f));
    if (!data) continue;
    const [a, b] = namesOf(data);
    if (!a || !b) { stats.skippedNoNames++; continue; }

    const { key, teamA, teamB } = orientedPair(a, b);
    if (!groups.has(key)) {
      groups.set(key, { sources: new Set(), matches: new Map(), teamA, teamB });
    }
    const g = groups.get(key);
    g.sources.add(f);
    for (const m of (data.matches || [])) {
      if (!m || m.matchId == null || g.matches.has(m.matchId)) continue;
      g.matches.set(m.matchId, { ...m, homeTeam: canon(m.homeTeam), awayTeam: canon(m.awayTeam) });
    }
  }

  const plan = { rewrites: 0, filesMerged: 0, filesDeleted: 0, matchesConsolidated: 0, examples: [] };

  for (const [key, g] of groups) {
    const targetName = `${key}.json`;
    const sources = [...g.sources];
    const merged = [...g.matches.values()]
      .sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")))
      .slice(0, MAX_MATCHES);
    const nextData = { teamA: g.teamA, teamB: g.teamB, matches: merged, updatedAt: new Date().toISOString() };

    const toDelete = sources.filter(s => s !== targetName);
    const existing = readJsonSafe(path.join(DIR, targetName));
    const sameAsExisting = existing
      && existing.teamA === g.teamA && existing.teamB === g.teamB
      && Array.isArray(existing.matches) && existing.matches.length === merged.length
      && existing.matches.every((m, i) =>
          m.matchId === merged[i]?.matchId
          && m.homeTeam === merged[i]?.homeTeam
          && m.awayTeam === merged[i]?.awayTeam);

    if (toDelete.length === 0 && sameAsExisting) continue; // already canonical → no-op

    plan.rewrites++;
    plan.matchesConsolidated += merged.length;
    if (sources.length > 1) plan.filesMerged += sources.length;
    plan.filesDeleted += toDelete.length;
    if (plan.examples.length < 20 && toDelete.length) {
      plan.examples.push({ target: targetName, mergedFrom: sources });
    }

    if (apply) {
      fs.writeFileSync(path.join(DIR, targetName), JSON.stringify(nextData, null, 2), "utf8");
      for (const s of toDelete) {
        try { fs.unlinkSync(path.join(DIR, s)); } catch { /* ignore */ }
      }
    }
  }

  return { ok: true, apply, ...stats, groups: groups.size, ...plan };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const apply = process.argv.includes("--apply");
  const r = migrateH2HCanonicalKeys({ apply });
  console.log(JSON.stringify(r, null, 2));
  if (!apply) console.log("\n(dry-run — pass --apply to execute)");
}
