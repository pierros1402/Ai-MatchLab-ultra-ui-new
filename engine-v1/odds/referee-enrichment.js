/**
 * referee-enrichment.js
 *
 * Glue between the appointed referee of an upcoming fixture (Transfermarkt matchday)
 * and the referee's tendencies (referee-memory-db), so a match record can carry a
 * `referee` block for the details panel: who referees it + how freely they card/pen.
 */

import { fetchMatchdayReferees } from "./transfermarkt-fixtures-referee-source.js";
import { TM_COMPETITIONS } from "./transfermarkt-referee-source.js";
import { readReferees } from "../storage/referee-memory-db.js";

import { normalizeTeamTokens as normTeam } from "../core/normalize.js";

// Short flashscore name vs long TM name → containment (intersection / smaller set).
function containment(a, b) {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

/**
 * For the given league slugs, fetch appointed referees and join tendencies.
 * @returns Map<slug, Array<{normHome, refereeName, refereeId, tendency}>>
 */
export async function buildRefereeLookup(slugs) {
  const lookup = new Map();
  const wanted = [...new Set(slugs)].filter(s => TM_COMPETITIONS[s]);
  let first = true;
  for (const slug of wanted) {
    if (!first) await new Promise(r => setTimeout(r, 1200 + Math.random() * 1200));
    first = false;
    const res = await fetchMatchdayReferees(slug);
    if (!res.ok) continue;
    const refs = readReferees(slug).referees || {};
    lookup.set(slug, res.fixtures.map(f => ({
      normHome: normTeam(f.home),
      refereeName: f.refereeName,
      refereeId: f.refereeId,
      tendency: refs[f.refereeId] || null
    })));
  }
  return lookup;
}

/** Find the referee block for one fixture (by home team). Null if none appointed. */
export function lookupReferee(lookup, slug, homeTeam) {
  const list = lookup.get(slug);
  if (!list || !list.length) return null;
  const h = normTeam(homeTeam);
  let best = null, bestScore = 0;
  for (const e of list) {
    const s = containment(h, e.normHome);
    if (s > bestScore) { bestScore = s; best = e; }
  }
  if (bestScore < 0.6 || !best) return null;
  return {
    name: best.refereeName,
    id: best.refereeId,
    yellowPerGame: best.tendency?.yellowPerGame ?? null,
    redPerGame: best.tendency?.redPerGame ?? null,
    penPerGame: best.tendency?.penPerGame ?? null,
    appearances: best.tendency?.appearances ?? null,
    source: "transfermarkt"
  };
}
