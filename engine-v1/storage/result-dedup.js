/**
 * result-dedup.js
 *
 * Cross-source deduplication for the recent-results memory
 * (data/league-memory/results/{slug}.json).
 *
 * THE PROBLEM ─────────────────────────────────────────────────────────────────
 * The SAME real-world match is recorded 2-3 times under different matchIds from
 * different feeds — native Flashscore ids, `espn_*` ids and `sofa_*` ids — because
 * team-name variants defeat the matchId-only dedup in results-memory-db.js. Example
 * (nor.2, 2026-06-27):
 *     [C4guZI0B]     "Asane" 3-0 "Ranheim"        (native Flashscore)
 *     [sofa_15265826] "Åsane" 3-0 "Ranheim IL"    (Sofascore)
 * These land under DIFFERENT team keys ("Asane" vs "Åsane", "Ranheim" vs
 * "Ranheim IL"), so nothing collapses them and every accumulator/backfill double-
 * counts the match in team form, league form, history-archive and model priors.
 *
 * THE FIX ─────────────────────────────────────────────────────────────────────
 * normalizeTeamKey() alone only merges ~half the variants (it strips diacritics and
 * a few affixes like FK/IF, but NOT IL / Ulf / BK / Fotball). So instead of a bigger
 * hardcoded suffix list we LEARN equivalences from the match structure itself:
 *
 *   A team plays at most one match per day. So if two source-records on the same day
 *   have the same score and ONE side already belongs to the same cluster, the OTHER
 *   sides must be the same club too. Union them. Iterate to a fixpoint and the whole
 *   variant graph collapses (Asane≡Åsane seeds Ranheim≡Ranheim IL, etc.).
 *
 * Seeds for the union-find:
 *   - normalizeTeamKey() equality (Å→A, FK/IF affixes, punctuation)
 *   - existing team-aliases/ entries (resolveAliasCandidates)
 * Propagation:
 *   - CROSS-SOURCE only, same dayKey + same score + one matching side ⇒ union the
 *     counterparts. Restricting to different sources is what keeps it safe: two
 *     records from the SAME feed on one day are distinct fixtures, so a team that
 *     genuinely played two same-score matches that day never merges its opponents.
 *
 * Each real match is then emitted ONCE, oriented from a home-view record, keeping the
 * NATIVE Flashscore id and the native spelling (so form lookups keep matching the
 * fixture feed, which is Flashscore/ESPN-sourced). Purely functional — the caller
 * decides whether to write.
 */

import { normalizeTeamKey } from "../core/normalize.js";
import { resolveAliasCandidates } from "./team-aliases-db.js";

const PER_TEAM_CAP = 250;   // keep in sync with results-memory-db.js
const MAX_AGE_DAYS = 1825;  // 5 years

// Lower rank = more authoritative source. Native Flashscore ids (no prefix) win over
// ESPN, which win over Sofascore — mirrors the feed we trust for orientation/spelling.
export function sourceRank(matchId) {
  const id = String(matchId || "");
  if (id.startsWith("sofa_")) return 2;
  if (id.startsWith("espn_")) return 1;
  return 0; // native flashscore
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function dayKeyOf(date) {
  if (!date) return null;
  const s = String(date);
  // entries store an ISO kickoff; the first 10 chars are the UTC calendar day, which
  // is what every source agrees on (kickoff minutes can differ by feed).
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function deriveRes(sh, sa) {
  if (sh == null || sa == null) return null;
  return sh > sa ? "W" : sh < sa ? "L" : "D";
}

// ─── Union-find ────────────────────────────────────────────────────────────────
function makeUnionFind() {
  const parent = new Map();
  function find(x) {
    if (!parent.has(x)) { parent.set(x, x); return x; }
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) { const nx = parent.get(x); parent.set(x, r); x = nx; }
    return r;
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return false;
    parent.set(ra, rb);
    return true;
  }
  return { find, union, has: (x) => parent.has(x) };
}

/**
 * Reconstruct one record per source-match (keyed by matchId) from the per-team
 * entry lists, oriented home-view when a home entry exists.
 */
function reconstructRecords(teams) {
  const byId = new Map();

  for (const [teamName, list] of Object.entries(teams || {})) {
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || e.matchId == null) continue;
      const id = String(e.matchId);
      const isHome = e.ha === "H";
      const home = isHome ? teamName : e.opp;
      const away = isHome ? e.opp : teamName;
      const sh = isHome ? num(e.gf) : num(e.ga);
      const sa = isHome ? num(e.ga) : num(e.gf);
      const date = e.date || null;

      const prev = byId.get(id);
      // Prefer the home-oriented view; otherwise take the first we see.
      if (!prev || (isHome && !prev.fromH)) {
        byId.set(id, { id, date, dayKey: dayKeyOf(date), home, away, sh, sa, fromH: isHome });
      } else if (!prev.date && date) {
        prev.date = date;
        prev.dayKey = dayKeyOf(date);
      }
    }
  }

  // Drop records missing the essentials (can't be identified/oriented).
  return [...byId.values()].filter(r => r.home && r.away && r.dayKey);
}

/**
 * Canonicalize + dedup one league's results payload.
 *
 * @param {{slug?:string, teams?:object}} payload
 * @param {{slug?:string, aliasResolver?:(name:string)=>string[]}} [opts]
 * @returns {{payload:object, stats:object, learnedAliases:object}}
 */
export function canonicalizeLeagueResults(payload, opts = {}) {
  const slug = opts.slug || payload?.slug || "";
  const aliasResolver = opts.aliasResolver
    || ((name) => resolveAliasCandidates(slug, name));

  const teams = payload?.teams || {};
  const records = reconstructRecords(teams);

  const uf = makeUnionFind();

  // Collect every distinct name up front so lone teams still get a cluster.
  const allNames = new Set();
  for (const r of records) { allNames.add(r.home); allNames.add(r.away); }
  for (const name of Object.keys(teams)) allNames.add(name);
  for (const name of allNames) uf.find(name);

  // Seed 1: normalizeTeamKey equality (Å→A, FK/IF affixes, punctuation).
  const byNormKey = new Map();
  for (const name of allNames) {
    const k = normalizeTeamKey(name) || name.toLowerCase();
    if (!byNormKey.has(k)) byNormKey.set(k, []);
    byNormKey.get(k).push(name);
  }
  for (const group of byNormKey.values()) {
    for (let i = 1; i < group.length; i++) uf.union(group[0], group[i]);
  }

  // Seed 2: existing alias entries. Union a name with any of its known variants
  // that actually appears in this league's data.
  for (const name of allNames) {
    let candidates = [];
    try { candidates = aliasResolver(name) || []; } catch { candidates = []; }
    for (const cand of candidates) {
      const c = String(cand || "").trim();
      if (!c || c === name) continue;
      // Match candidate to a real name in this league via norm key (aliases are free
      // text and may be spelled slightly differently than the stored key).
      const ck = normalizeTeamKey(c);
      const group = byNormKey.get(ck);
      if (group && group.length) uf.union(name, group[0]);
    }
  }

  // Propagation: same day + same score + one matching side ⇒ union counterparts.
  const byDay = new Map();
  for (const r of records) {
    if (!byDay.has(r.dayKey)) byDay.set(r.dayKey, []);
    byDay.get(r.dayKey).push(r);
  }

  let learned = true;
  let guard = 0;
  while (learned && guard++ < 50) {
    learned = false;
    for (const recs of byDay.values()) {
      for (let i = 0; i < recs.length; i++) {
        for (let j = i + 1; j < recs.length; j++) {
          const a = recs[i], b = recs[j];
          if (a.sh == null || a.sa == null || b.sh == null || b.sa == null) continue;
          // Only learn equivalences ACROSS sources. Two records from the SAME feed on
          // the same day are distinct matches, not a spelling split — a single source
          // does not re-record one fixture under two ids. Requiring different sources
          // is what makes the "same day + same score + one side equal ⇒ union the
          // other side" rule safe: it stops a team that genuinely played two same-score
          // matches on one day (e.g. Chania City 2-2 vs two Rhodes clubs) from merging
          // its two distinct opponents and avalanching the whole league into one blob.
          if (sourceRank(a.id) === sourceRank(b.id)) continue;
          const aligned = a.sh === b.sh && a.sa === b.sa;
          const flipped = a.sh === b.sa && a.sa === b.sh;

          if (aligned) {
            if (uf.find(a.home) === uf.find(b.home) && uf.union(a.away, b.away)) learned = true;
            if (uf.find(a.away) === uf.find(b.away) && uf.union(a.home, b.home)) learned = true;
          }
          if (flipped) {
            if (uf.find(a.home) === uf.find(b.away) && uf.union(a.away, b.home)) learned = true;
            if (uf.find(a.away) === uf.find(b.home) && uf.union(a.home, b.away)) learned = true;
          }
        }
      }
    }
  }

  // Choose a canonical display name per cluster: lowest source rank (native first),
  // then most frequently seen, then longest (richer spelling), then lexical.
  const nameVotes = new Map(); // cluster -> Map<display, {rank, count}>
  const vote = (name, rank) => {
    const cl = uf.find(name);
    if (!nameVotes.has(cl)) nameVotes.set(cl, new Map());
    const m = nameVotes.get(cl);
    const cur = m.get(name) || { rank: 9, count: 0 };
    cur.rank = Math.min(cur.rank, rank);
    cur.count += 1;
    m.set(name, cur);
  };
  for (const r of records) {
    const rank = sourceRank(r.id);
    vote(r.home, rank);
    vote(r.away, rank);
  }
  // Names that never appeared in a record (empty team lists) still deserve a display.
  for (const name of allNames) if (!nameVotes.has(uf.find(name))) vote(name, 9);

  const canonName = new Map(); // cluster -> chosen display
  for (const [cl, m] of nameVotes) {
    let best = null;
    for (const [disp, info] of m) {
      if (
        !best ||
        info.rank < best.info.rank ||
        (info.rank === best.info.rank && info.count > best.info.count) ||
        (info.rank === best.info.rank && info.count === best.info.count && disp.length > best.disp.length) ||
        (info.rank === best.info.rank && info.count === best.info.count && disp.length === best.disp.length && disp < best.disp)
      ) best = { disp, info };
    }
    canonName.set(cl, best.disp);
  }
  const displayOf = (name) => canonName.get(uf.find(name)) || name;

  // Dedup matches: one real match per (dayKey + unordered cluster pair).
  const matches = new Map();
  for (const r of records) {
    const hc = uf.find(r.home), ac = uf.find(r.away);
    const pair = hc < ac ? `${hc} ${ac}` : `${ac} ${hc}`;
    const key = `${r.dayKey} ${pair}`;
    const prev = matches.get(key);
    if (!prev) { matches.set(key, r); continue; }
    // Keep the better record: prefer a home-oriented one, then native source.
    const better =
      (Number(r.fromH) - Number(prev.fromH)) ||
      (sourceRank(prev.id) - sourceRank(r.id));
    if (better > 0) matches.set(key, r);
  }

  // Emit the deduped per-team structure with canonical spellings.
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const outTeams = {};
  const pushEntry = (team, entry) => {
    if (!outTeams[team]) outTeams[team] = [];
    outTeams[team].push(entry);
  };

  for (const r of matches.values()) {
    const home = displayOf(r.home);
    const away = displayOf(r.away);
    if (home === away) continue; // self-pair from a bad merge — never happens, guard anyway
    const homeRes = deriveRes(r.sh, r.sa);
    if (homeRes == null) continue;
    const awayRes = homeRes === "W" ? "L" : homeRes === "L" ? "W" : "D";
    pushEntry(home, { matchId: r.id, date: r.date, opp: away, ha: "H", gf: r.sh, ga: r.sa, res: homeRes });
    pushEntry(away, { matchId: r.id, date: r.date, opp: home, ha: "A", gf: r.sa, ga: r.sh, res: awayRes });
  }

  // Per-team: newest-first, age-capped, count-capped (mirrors pushResult()).
  for (const team of Object.keys(outTeams)) {
    outTeams[team] = outTeams[team]
      .filter(e => !e.date || Date.parse(e.date) >= cutoff)
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, PER_TEAM_CAP);
  }

  // Learned aliases: for every cluster with >1 spelling, map canonical → [variants].
  const learnedAliases = {};
  for (const [cl, m] of nameVotes) {
    if (m.size < 2) continue;
    const canonical = canonName.get(cl);
    const variants = [...m.keys()].filter(n => n !== canonical);
    if (variants.length) learnedAliases[canonical] = variants;
  }

  // Stats
  const beforeEntries = Object.values(teams).reduce((s, l) => s + (Array.isArray(l) ? l.length : 0), 0);
  const afterEntries = Object.values(outTeams).reduce((s, l) => s + l.length, 0);
  const stats = {
    slug,
    sourceRecords: records.length,
    dedupedMatches: matches.size,
    matchesMerged: records.length - matches.size,
    teamsBefore: Object.keys(teams).length,
    teamsAfter: Object.keys(outTeams).length,
    entriesBefore: beforeEntries,
    entriesAfter: afterEntries,
    entriesRemoved: beforeEntries - afterEntries,
    clustersLearned: Object.keys(learnedAliases).length
  };

  const outPayload = {
    ...payload,
    slug: slug || payload?.slug,
    teams: outTeams
  };

  return { payload: outPayload, stats, learnedAliases };
}
