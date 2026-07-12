/**
 * multi-odds-merge.js
 *
 * Shared helpers for every job that writes into the per-bookmaker
 * data/multi-odds/{date}.json store (OddsPapi match-day fetch + odds-api.io
 * prefetch): opening-freeze delta merge and team-name fuzzy matching.
 *
 * Lives outside jobs/ so the writers can share it without importing each
 * other (avoids the OddsPapi ⇄ odds-api.io module cycle).
 */

// ─── Team name normalisation for fuzzy matching ────────────────────────────────

const TEAM_STRIP = /\b(fc|sc|fk|cf|afc|bk|sk|if|iff|ik|rk|hk|pk|ff|ss|nk|gjk|vvv|rkc|btk|csk|iff|ac|as|ss|rc|cd|ud|ca|ssc|cf|sjk|rup|kc|fc|sc)\b/gi;

export function normTeam(name) {
  if (!name) return "";
  return String(name)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(TEAM_STRIP, " ")
    .replace(/[^a-z0-9]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function pairKey(a, b) {
  return `${normTeam(a)}~${normTeam(b)}`;
}

// Levenshtein distance for fallback fuzzy match
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] :
        1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

export function namesMatch(a, b) {
  const na = normTeam(a), nb = normTeam(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  // Fuzzy: allow up to 3 chars edit distance on short names
  const maxDist = Math.floor(Math.min(na.length, nb.length) * 0.25);
  return lev(na, nb) <= Math.max(2, maxDist);
}

// ─── Opening-freeze delta merge ────────────────────────────────────────────────

// Merge fresh odds with existing (preserves opening line, computes delta).
// Works for any market: legs are the keys of each bookmaker's odds object.
//
// Books present in `existingPanel` but absent from `freshPanel` are KEPT
// as-is: multiple sources (OddsPapi match-day, odds-api.io prefetch) write
// the same file, so a refresh from one source must never wipe the books the
// other source contributed.
//
// existingPanel: the stored panel object (may have open/delta already), or null
// freshPanel:    newly parsed panel { greek:{}, european:{}, asian:{}, betfair:{} }
export function mergeWithDelta(existingPanel, freshPanel) {
  const merged = { greek: {}, european: {}, asian: {}, betfair: {} };

  for (const panel of ["greek", "european", "asian", "betfair"]) {
    // Carry over every existing book first (open/delta untouched) …
    for (const [bk, prev] of Object.entries(existingPanel?.[panel] || {})) {
      merged[panel][bk] = prev;
    }
    // … then overwrite with the freshly fetched books.
    for (const [bk, fOdds] of Object.entries(freshPanel?.[panel] || {})) {
      const prev = existingPanel?.[panel]?.[bk];
      const legs = Object.keys(fOdds);

      if (!prev) {
        merged[panel][bk] = { ...fOdds, open: { ...fOdds } };
      } else {
        const open = prev.open || Object.fromEntries(legs.map(l => [l, prev[l]]));
        const delta = {};
        let anyMoved = false;
        for (const l of legs) {
          if (open[l] != null && fOdds[l] != null) {
            const d = +(fOdds[l] - open[l]).toFixed(3);
            delta[l] = d;
            if (d !== 0) anyMoved = true;
          }
        }
        merged[panel][bk] = {
          ...fOdds,
          open,
          ...(anyMoved ? { delta } : {}),
        };
      }
    }
  }

  return merged;
}
