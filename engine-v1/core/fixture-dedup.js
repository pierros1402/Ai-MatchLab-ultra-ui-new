/**
 * fixture-dedup.js
 *
 * Cross-source deduplication for PRE-match canonical fixtures.
 *
 * THE PROBLEM ─────────────────────────────────────────────────────────────────
 * The SAME real-world fixture can enter a league's canonical day file twice with
 * different canonical IDs, because each provider spells the teams differently and
 * the canonical ID is built from the team names. Example (ecu.1, 2026-07-04):
 *     cid_ecu1_inddelvalle_manta_20260704            (ESPN: "Ind Del Valle")
 *     cid_ecu1_independientedelvalle_manta_20260704  (Flashscore: "Independiente del Valle")
 * ID-based merge can never collapse these, so the day snapshot double-counts the
 * match, details/value join ambiguously, and the UI shows the fixture twice.
 *
 * THE FIX ─────────────────────────────────────────────────────────────────────
 * result-dedup.js learns clusters from scores, but PRE fixtures have no scores.
 * Instead we compare the two rows structurally. Rows are duplicate candidates
 * only when ALL of the following hold:
 *   - same league file, same dayKey;
 *   - the rows come from DIFFERENT provider families (a single feed does not
 *     record one fixture twice — same-family rows are distinct real matches);
 *   - kickoff times agree within a tolerance when both are present;
 *   - BOTH sides match by name: norm-key equality, alias-db link, or
 *     prefix-token subset ("Ind Del Valle" ⊂ "Independiente del Valle",
 *     "Leones" ⊂ "Leones del Norte"). Orientation is respected (home↔home,
 *     away↔away) — flipped pairs are never merged.
 *
 * The surviving row is the primary-provider one (ESPN family outranks
 * Flashscore — its id is what live-status updates key on); missing fields are
 * backfilled from the dropped row. Purely functional; callers decide writes.
 */

import { normalizeTeamTokens, normalizeTeamKey } from "./normalize.js";
import { repairCanonicalIdDay } from "./canonical-id.js";
import { resolveAliasCandidates } from "../storage/team-aliases-db.js";
import { sameSquadMarkers } from "./team-identity.js";

const KICKOFF_TOLERANCE_MS = 6 * 60 * 60 * 1000;

function sourceFamily(row) {
  const src = String(row?.source || "").toLowerCase();
  if (src.includes("espn")) return "espn";
  if (src.includes("flashscore") || src.startsWith("fs")) return "flashscore";
  if (src.includes("sofa")) return "sofascore";
  // Numeric provider ids without a source label are ESPN-shaped.
  if (/^\d+$/.test(String(row?.sourceId || row?.matchId || ""))) return "espn";
  return src || "unknown";
}

function familyRank(family) {
  if (family === "espn") return 0;
  if (family === "flashscore") return 1;
  return 2;
}

function tokensOf(name) {
  return normalizeTeamTokens(name).split(" ").filter(Boolean);
}

// Every token of the shorter list must match a distinct token of the longer
// list, in order. Tokens of 3+ chars match by prefix ("ind" → "independiente");
// shorter tokens must match exactly.
function prefixTokenSubset(aTokens, bTokens) {
  const [short, long] = aTokens.length <= bTokens.length ? [aTokens, bTokens] : [bTokens, aTokens];
  if (!short.length || !long.length) return false;

  let cursor = 0;
  for (const tok of short) {
    let matched = false;
    while (cursor < long.length) {
      const candidate = long[cursor];
      cursor += 1;
      const isMatch = tok.length >= 3 ? candidate.startsWith(tok) || tok.startsWith(candidate) : candidate === tok;
      if (isMatch) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

// Providers append a bracketed nationality/city qualifier to disambiguate
// international fixtures — Flashscore writes "Drita (Kos)", "Vardar (Mkd)",
// "Universidad Católica (Quito)" while ESPN omits it. The trailing "(Kos)"
// survives normalization as a spurious identity token ("drita kos") and breaks
// the subset match on the side whose club name ALSO differs (Drita vs Drita
// Gjilan). Strip ONE trailing bracketed group for the fuzzy comparison only —
// never for canonical-id generation. Safe after the squad gate below: "(W)",
// "(U21)", "(B)" pairs are already blocked, so this can only ever drop a
// country/city qualifier, never a squad marker.
function stripTrailingQualifier(name) {
  const stripped = String(name || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return stripped || String(name || "").trim();
}

export function sameTeamName(slug, a, b) {
  const rawA = String(a || "").trim();
  const rawB = String(b || "").trim();
  if (!rawA || !rawB) return false;

  // Safety gate FIRST, on the ORIGINAL names: squad markers are identity, not
  // noise. "HJK" and "HJK W", "Ajax" and "Ajax U21", "Barcelona" and
  // "Barcelona B" must never merge, or a men's/senior fixture could absorb and
  // drop a women's/youth/reserve one. Runs before the qualifier strip so a
  // squad marker in brackets ("HJK (W)") is still seen.
  if (!sameSquadMarkers(rawA, rawB)) return false;

  const nameA = stripTrailingQualifier(rawA);
  const nameB = stripTrailingQualifier(rawB);

  const keyA = normalizeTeamKey(nameA);
  const keyB = normalizeTeamKey(nameB);
  if (keyA && keyA === keyB) return true;

  // Alias-db link (learned or seeded aliases).
  try {
    const candidatesA = resolveAliasCandidates(slug, nameA) || [];
    if (candidatesA.some(c => normalizeTeamKey(c) === keyB)) return true;
    const candidatesB = resolveAliasCandidates(slug, nameB) || [];
    if (candidatesB.some(c => normalizeTeamKey(c) === keyA)) return true;
  } catch { /* alias db unavailable — fall through to structural match */ }

  return prefixTokenSubset(tokensOf(nameA), tokensOf(nameB));
}

function kickoffCompatible(a, b) {
  const ta = new Date(a?.kickoffUtc || 0).getTime();
  const tb = new Date(b?.kickoffUtc || 0).getTime();
  if (!Number.isFinite(ta) || ta <= 0 || !Number.isFinite(tb) || tb <= 0) return true;
  return Math.abs(ta - tb) <= KICKOFF_TOLERANCE_MS;
}

function meaningful(value) {
  return value !== null && value !== undefined && value !== "";
}

// Keep `winner`'s identity (ids, naming, canonicalId); backfill missing fields.
function absorbRow(winner, loser) {
  const merged = { ...winner };

  for (const key of Object.keys(loser || {})) {
    if (!meaningful(merged[key]) && meaningful(loser[key])) {
      merged[key] = loser[key];
    }
  }

  const firstSeen = [winner?.firstSeenAt, loser?.firstSeenAt].filter(Boolean).sort()[0];
  if (firstSeen) merged.firstSeenAt = firstSeen;
  const lastSeen = [winner?.lastSeenAt, loser?.lastSeenAt].filter(Boolean).sort().pop();
  if (lastSeen) merged.lastSeenAt = lastSeen;

  return merged;
}

/**
 * Dedupe one league's fixture rows (typically one canonical day file).
 * Returns { rows, removed } where removed lists { keptId, droppedId } pairs.
 */
export function dedupeLeagueDayFixtures(rows, { slug } = {}) {
  let list = (Array.isArray(rows) ? rows : []).filter(Boolean);
  const leagueSlug = String(slug || list[0]?.leagueSlug || "").trim();
  const removed = [];

  // Repair cross-midnight day-token drift BEFORE deduping: a 23:00Z kickoff
  // used to get a previous-day cid (…20260702 on a dayKey-2026-07-03 row), so
  // the same match under a right-day cid from another source would never
  // collapse — and details keyed by dayKey could not join. Runs at both choke
  // points (canonical write + snapshot export read) since both call this.
  list = list.map(repairCanonicalIdDay);

  // Pre-pass: identical canonicalId is the same match by definition, whatever
  // the source (e.g. an ESPN row keyed by numeric matchId next to a Flashscore
  // row keyed by the cid itself — ID-based merges never collapse those).
  const byCanonical = new Map();
  for (const row of list) {
    const cid = String(row?.canonicalId || "").trim();
    const key = cid || `__nocid_${String(row?.matchId || Math.random())}`;
    const prev = byCanonical.get(key);

    if (!prev) {
      byCanonical.set(key, row);
      continue;
    }

    const rowWins = familyRank(sourceFamily(row)) < familyRank(sourceFamily(prev));
    const winner = rowWins ? row : prev;
    const loser = rowWins ? prev : row;
    byCanonical.set(key, absorbRow(winner, loser));
    removed.push({
      keptId: String(winner?.canonicalId || winner?.matchId || ""),
      droppedId: String(loser?.matchId || loser?.canonicalId || "")
    });
  }
  list = [...byCanonical.values()];

  // Group by dayKey — duplicates can only exist within a single day.
  const byDay = new Map();
  for (const row of list) {
    const day = String(row?.dayKey || "").trim() || "?";
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(row);
  }

  const out = [];

  for (const dayRows of byDay.values()) {
    const kept = [];

    for (const row of dayRows) {
      const rowFamily = sourceFamily(row);

      let mergedInto = -1;
      for (let i = 0; i < kept.length; i++) {
        const other = kept[i];
        if (sourceFamily(other) === rowFamily) continue;
        if (!kickoffCompatible(row, other)) continue;
        if (!sameTeamName(leagueSlug, row?.homeTeam, other?.homeTeam)) continue;
        if (!sameTeamName(leagueSlug, row?.awayTeam, other?.awayTeam)) continue;
        mergedInto = i;
        break;
      }

      if (mergedInto === -1) {
        kept.push(row);
        continue;
      }

      const other = kept[mergedInto];
      const rowWins = familyRank(rowFamily) < familyRank(sourceFamily(other));
      const winner = rowWins ? row : other;
      const loser = rowWins ? other : row;

      kept[mergedInto] = absorbRow(winner, loser);
      removed.push({
        keptId: String(winner?.canonicalId || winner?.matchId || ""),
        droppedId: String(loser?.canonicalId || loser?.matchId || "")
      });
    }

    out.push(...kept);
  }

  return { rows: out, removed };
}
