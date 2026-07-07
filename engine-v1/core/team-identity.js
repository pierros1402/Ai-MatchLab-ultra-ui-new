/**
 * team-identity.js
 *
 * Single-source team-identity MATCHER for reconciling the SAME real-world team
 * across sources that spell it differently (Flashscore vs ESPN vs BetExplorer).
 * This is distinct from normalize.js: normalizeTeamTokens/normalizeTeamKey feed
 * canonical-id generation and exact dedup keys (and must stay stable — changing
 * them would shift every canonical id). This module is the FUZZY matcher layer:
 * token-subset comparison with squad-marker safety and cross-source aliases.
 *
 * Extracted verbatim from results-truth-overlay.js so the FT overlay and the
 * settlement verifier (export-verified-final-results-day.js) share ONE matcher
 * instead of each rolling its own — the Phase 1 identity-resolver unification.
 *
 * Safety invariant: a match is only ever asserted when one token set is a
 * non-empty subset of the other AND both carry the same squad markers, so a
 * men's fixture can never inherit a women's/youth/reserve score.
 */

// Cross-source token aliases: strip diacritics/punctuation and generic club
// affixes, then expand the abbreviations that differ between providers.
const TOKEN_ALIASES = new Map([
  ["utd", "united"],
  ["intl", "international"],
  // Brazilian state-abbreviation convention: "America MG" ↔ "América Mineiro",
  // "Atletico MG" ↔ "Atlético Mineiro" (Flashscore vs ESPN naming).
  ["mg", "mineiro"],
]);

const GENERIC_TOKENS = new Set([
  "fc", "afc", "cf", "sc", "ac", "cd", "ca", "ec", "se", "ad", "sv", "fk",
  "if", "bk", "aif", "club", "de", "do", "da", "dos", "das", "e", "the",
]);

/** Tokenize a team name into identity tokens (diacritics/affixes stripped). */
export function teamTokens(name) {
  const base = String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const out = [];
  for (let tok of base.split(" ")) {
    if (!tok) continue;
    tok = TOKEN_ALIASES.get(tok) || tok;
    if (GENERIC_TOKENS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

// Squad markers are IDENTITY, not noise: "HJK W" (women) and "HJK" (men), or
// "Ajax U21" and "Ajax", are different teams. A subset match must never cross
// a marker boundary, or a men's fixture could inherit a women's/youth score.
const SQUAD_MARKERS = new Set([
  "w", "women", "fem", "ii", "iii", "b", "c", "reserve", "reserves", "youth",
  "junior", "juniors", "academy",
  "u16", "u17", "u18", "u19", "u20", "u21", "u23",
]);

function squadMarkers(tokens) {
  const out = new Set();
  for (const t of tokens) if (SQUAD_MARKERS.has(t)) out.add(t);
  return out;
}

function sameMarkers(aTokens, bTokens) {
  const a = squadMarkers(aTokens);
  const b = squadMarkers(bTokens);
  if (a.size !== b.size) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

/** True when one token set is a non-empty subset of the other (or equal). */
export function tokensMatch(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return false;
  if (!sameMarkers(aTokens, bTokens)) return false;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  const aInB = [...a].every(t => b.has(t));
  const bInA = [...b].every(t => a.has(t));
  return aInB || bInA;
}

/** True when two team NAMES refer to the same real-world team. */
export function teamNamesMatch(a, b) {
  return tokensMatch(teamTokens(a), teamTokens(b));
}

/** True when two fixtures share the same home AND away team (order-sensitive). */
export function teamPairMatches(homeA, awayA, homeB, awayB) {
  return teamNamesMatch(homeA, homeB) && teamNamesMatch(awayA, awayB);
}
