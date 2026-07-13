/**
 * build-matchday-axis.js
 *
 * Writes the deterministic matchday-per-league confirmation axis into
 * league-memory/state.json (one batch write) so every downstream consumer —
 * coverage-readiness reports, the active panel label, the rich details gate —
 * reads a single source of truth. See core/matchday-axis.js for the derivation.
 *
 * The axis is additive: it never touches state/seasonWindow/signals. It only
 * stamps matchday* fields onto each league that has an accepted standings
 * snapshot, and clears them for leagues that no longer do.
 *
 * Usage:
 *   node engine-v1/jobs/build-matchday-axis.js            # write + summary
 *   node engine-v1/jobs/build-matchday-axis.js --dry-run  # summary only
 */

import { fileURLToPath } from "url";
import { readAllStates, writeAllStates } from "../storage/league-memory-db.js";
import { hasAcceptedStandings } from "../storage/standings-memory-db.js";
import { computeMatchdayAxis } from "../core/matchday-axis.js";

const MATCHDAY_FIELDS = [
  "matchday",
  "matchdayMin",
  "matchdayMax",
  "matchdaySpread",
  "matchdayTeams",
  "matchdayMaxPossible",
  "matchdaySource",
  "matchdayAnomaly",
  "matchdayAt"
];

export function buildMatchdayAxis({ dryRun = false } = {}) {
  const all = readAllStates();
  const slugs = Object.keys(all);
  const now = new Date().toISOString();

  const anomalies = [];
  const softFlags = [];
  let computed = 0;
  let cleared = 0;

  for (const slug of slugs) {
    const state = all[slug];
    if (!state) continue;

    if (!hasAcceptedStandings(slug)) {
      // No validated standings → make sure no stale matchday lingers.
      let touched = false;
      for (const f of MATCHDAY_FIELDS) {
        if (f in state) { delete state[f]; touched = true; }
      }
      if (touched) { cleared++; state.updatedAt = now; }
      continue;
    }

    const axis = computeMatchdayAxis(slug);
    Object.assign(state, axis, { matchdayAt: now, updatedAt: now });
    computed++;

    if (axis.matchdayAnomaly?.bool) {
      anomalies.push({ slug, matchday: axis.matchday, max: axis.matchdayMax, bound: axis.matchdayMaxPossible, reason: axis.matchdayAnomaly.reason });
    } else if (axis.matchdayAnomaly?.softSpreadFlag) {
      softFlags.push({ slug, matchday: axis.matchday, spread: axis.matchdaySpread });
    }
  }

  if (!dryRun) writeAllStates(all);

  return {
    ok: true,
    dryRun,
    leaguesTotal: slugs.length,
    matchdayComputed: computed,
    staleCleared: cleared,
    anomalyCount: anomalies.length,
    softFlagCount: softFlags.length,
    anomalies: anomalies.sort((a, b) => b.max - a.max),
    softFlags
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const dryRun = process.argv.includes("--dry-run");
  const res = buildMatchdayAxis({ dryRun });
  const { anomalies, softFlags, ...summary } = res;
  console.log(JSON.stringify(summary, null, 2));
  if (anomalies.length) {
    console.log(`\n${dryRun ? "[dry-run] " : ""}matchday anomalies (corrupt/cumulative standings — integrity gate RED):`);
    for (const a of anomalies) console.log(`  ${a.slug.padEnd(9)} md=${a.matchday} max=${a.max} > bound=${a.bound}  (${a.reason})`);
  }
}
